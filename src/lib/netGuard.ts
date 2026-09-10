// Guards against Server-Side Request Forgery in `/api/chat`.
//
// That endpoint takes `providers[].baseUrl` straight from the request body and
// fetches it server-side, so without a check an authenticated user could point
// it at loopback or private addresses (the NPM admin API on 127.0.0.1:81,
// Portainer on 9000, cloud metadata on 169.254.169.254, and so on).

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
