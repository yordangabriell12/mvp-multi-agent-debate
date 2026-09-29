// Guards against Server-Side Request Forgery on every outbound call the server
// makes on a user's behalf.
//
// The base URL used to arrive in the request body, so without a check an
// authenticated user could point it at loopback or private addresses (the NPM
// admin API on 127.0.0.1:81, Portainer on 9000, cloud metadata on
// 169.254.169.254). It is now stored server-side, but a stored value is still
// editable, so the same checks run before every fetch.
//
// Two layers, because either alone is insufficient:
//
//   1. `checkOutboundUrl` inspects the URL itself. Fast, synchronous, and it
//      catches literal `http://127.0.0.1` and `http://localhost`.
//   2. `assertPublicHost` resolves the hostname and inspects the addresses it
//      resolves to. This is the one that matters for Docker: `http://portainer:9000`
//      is not a private address as a string, but it resolves to one inside the
//      container network. A string check cannot see that.

import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'ip6-localhost',
  'ip6-loopback',
  'metadata',
  'metadata.google.internal',
  'metadata.goog',
])

const BLOCKED_SUFFIXES = ['.local', '.localhost', '.internal', '.home.arpa']

function isPrivateIpv4(host: string): boolean {
  const match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (!match) return false

  const octets = match.slice(1).map((part) => Number(part))
  if (octets.some((n) => n > 255)) return true // malformed, treat as unsafe

  const [a, b] = octets
  if (a === 0 || a === 10 || a === 127) return true
  if (a === 100 && b >= 64 && b <= 127) return true // CGNAT
  if (a === 169 && b === 254) return true // link-local, incl. cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  if (a === 198 && (b === 18 || b === 19)) return true // benchmarking
  return false
}

function isPrivateIpv6(host: string): boolean {
  if (host === '::' || host === '::1') return true
  if (host.startsWith('fe80') || host.startsWith('fec0')) return true // link/site local
  if (host.startsWith('fc') || host.startsWith('fd')) return true // unique local

  // IPv4-mapped addresses. The URL parser rewrites the dotted form, so
  // `::ffff:127.0.0.1` arrives here as `::ffff:7f00:1`; both shapes matter.
  const mapped = host.match(/^(?:0{0,4}:){1,5}(?:ffff|FFFF):(.+)$/)
  if (mapped) {
    const tail = mapped[1]
    if (tail.includes('.')) return isPrivateIpv4(tail)
    const asIpv4 = ipv4FromHexGroups(tail)
    return asIpv4 ? isPrivateIpv4(asIpv4) : true
  }

  return false
}

/** Turns the two trailing hex groups of a mapped address into dotted-quad form. */
function ipv4FromHexGroups(tail: string): string | null {
  const groups = tail.split(':')
  if (groups.length !== 2) return null
  const high = Number.parseInt(groups[0], 16)
  const low = Number.parseInt(groups[1], 16)
  if (!Number.isFinite(high) || !Number.isFinite(low)) return null
  if (high < 0 || high > 0xffff || low < 0 || low > 0xffff) return null
  return [high >> 8, high & 0xff, low >> 8, low & 0xff].join('.')
}

export interface UrlCheck {
  ok: boolean
  reason?: string
}

export function checkOutboundUrl(rawUrl: string): UrlCheck {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return { ok: false, reason: 'Base URL is not a valid URL' }
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, reason: 'Only http and https base URLs are allowed' }
  }

  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '')

  if (BLOCKED_HOSTNAMES.has(host)) {
    return { ok: false, reason: 'Base URL points at a blocked host' }
  }
  if (BLOCKED_SUFFIXES.some((suffix) => host.endsWith(suffix))) {
    return { ok: false, reason: 'Base URL points at a blocked host' }
  }
  if (isPrivateIpv4(host) || isPrivateIpv6(host)) {
    return { ok: false, reason: 'Base URL points at a private or loopback address' }
  }

  return { ok: true }
}

/**
 * Resolves a hostname and rejects it if it points anywhere private.
 *
 * This is the check `checkOutboundUrl` cannot make. Inside a Docker container,
 * `portainer`, `npm`, or any other service name on a shared network resolves to a
 * private address, but as a string it is a perfectly ordinary hostname. Only
 * after a DNS lookup does the target reveal itself, so the resolved addresses are
 * what must be judged.
 *
 * Every address the name resolves to is checked, not just the first: a name with
 * both a public and a private record would otherwise be usable to reach the
 * private one on a retry.
 */
export async function assertPublicHost(rawUrl: string): Promise<UrlCheck> {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return { ok: false, reason: 'Base URL is not a valid URL' }
  }

  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '')

  // A literal address needs no lookup: it already says where it goes.
  if (isIP(host)) {
    return isPrivateIpv4(host) || isPrivateIpv6(host)
      ? { ok: false, reason: 'Base URL points at a private or loopback address' }
      : { ok: true }
  }

  let addresses: { address: string }[]
  try {
    addresses = await lookup(host, { all: true })
  } catch {
    return { ok: false, reason: `Base URL host cannot be resolved: ${host}` }
  }

  if (addresses.length === 0) {
    return { ok: false, reason: `Base URL host cannot be resolved: ${host}` }
  }

  for (const { address } of addresses) {
    const normalised = address.toLowerCase()
    if (isPrivateIpv4(normalised) || isPrivateIpv6(normalised)) {
      return {
        ok: false,
        reason:
          `Base URL resolves to a private address (${normalised}). ` +
          'Set VMA_ALLOW_PRIVATE_BASEURL=true only if the provider really is on a private network.',
      }
    }
  }

  return { ok: true }
}

/**
 * Both checks, in order, for callers that just want a yes or no.
 *
 * The environment flag bypasses both, which is what a self-hosted Ollama on the
 * same network needs. It is off unless someone deliberately sets it.
 */
export async function checkOutboundUrlDeep(rawUrl: string): Promise<UrlCheck> {
  if (process.env.VMA_ALLOW_PRIVATE_BASEURL === 'true') return { ok: true }

  const shallow = checkOutboundUrl(rawUrl)
  if (!shallow.ok) return shallow

  return assertPublicHost(rawUrl)
}
