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
  // IPv4-mapped (::ffff:127.0.0.1)
  const mapped = host.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/)
  if (mapped) return isPrivateIpv4(mapped[1])
  return false
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
