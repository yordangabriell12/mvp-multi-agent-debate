import { describe, expect, it } from 'vitest'
import { checkOutboundUrl } from './netGuard'

describe('checkOutboundUrl', () => {
  it('allows a normal public https endpoint', () => {
    expect(checkOutboundUrl('https://api.openai.com/v1').ok).toBe(true)
    expect(checkOutboundUrl('https://openrouter.ai/api/v1').ok).toBe(true)
  })

  it('allows a public http endpoint', () => {
    expect(checkOutboundUrl('http://example.com/v1').ok).toBe(true)
  })

  // The base URL arrives in the request body, so these are the addresses a
  // logged-in user could otherwise use to reach internal services.
  it('blocks loopback, including the NPM admin port', () => {
    expect(checkOutboundUrl('http://127.0.0.1:81').ok).toBe(false)
    expect(checkOutboundUrl('http://localhost:9000').ok).toBe(false)
    expect(checkOutboundUrl('http://[::1]:4000').ok).toBe(false)
  })

  it('blocks private IPv4 ranges', () => {
    expect(checkOutboundUrl('http://10.0.0.5').ok).toBe(false)
    expect(checkOutboundUrl('http://192.168.1.1').ok).toBe(false)
    expect(checkOutboundUrl('http://172.16.0.1').ok).toBe(false)
    expect(checkOutboundUrl('http://172.31.255.1').ok).toBe(false)
  })

  it('blocks the cloud metadata address', () => {
    expect(checkOutboundUrl('http://169.254.169.254/latest/meta-data').ok).toBe(false)
    expect(checkOutboundUrl('http://metadata.google.internal').ok).toBe(false)
  })

  it('blocks private IPv6 ranges and IPv4-mapped addresses', () => {
    expect(checkOutboundUrl('http://[fd00::1]').ok).toBe(false)
    expect(checkOutboundUrl('http://[fe80::1]').ok).toBe(false)
    expect(checkOutboundUrl('http://[::ffff:127.0.0.1]').ok).toBe(false)
    expect(checkOutboundUrl('http://[::ffff:10.0.0.1]').ok).toBe(false)
    // Expanded and hex forms of the same mapped address.
    expect(checkOutboundUrl('http://[0:0:0:0:0:ffff:127.0.0.1]').ok).toBe(false)
    expect(checkOutboundUrl('http://[::ffff:7f00:1]').ok).toBe(false)
  })

  it('allows a public address reached over IPv6', () => {
    expect(checkOutboundUrl('http://[::ffff:8.8.8.8]').ok).toBe(true)
  })

  it('blocks internal-looking host suffixes', () => {
    expect(checkOutboundUrl('http://router.local').ok).toBe(false)
    expect(checkOutboundUrl('http://service.internal').ok).toBe(false)
    expect(checkOutboundUrl('http://box.home.arpa').ok).toBe(false)
  })

  it('blocks non-http protocols', () => {
    expect(checkOutboundUrl('file:///etc/passwd').ok).toBe(false)
    expect(checkOutboundUrl('ftp://example.com').ok).toBe(false)
    expect(checkOutboundUrl('gopher://example.com').ok).toBe(false)
  })

  it('rejects a string that is not a URL', () => {
    expect(checkOutboundUrl('not a url').ok).toBe(false)
    expect(checkOutboundUrl('').ok).toBe(false)
  })

  it('always explains why it refused', () => {
    expect(checkOutboundUrl('http://127.0.0.1').reason).toBeTruthy()
    expect(checkOutboundUrl('file:///tmp').reason).toBeTruthy()
  })

  it('allows the public boundary addresses just outside the private ranges', () => {
    expect(checkOutboundUrl('http://172.32.0.1').ok).toBe(true)
    expect(checkOutboundUrl('http://11.0.0.1').ok).toBe(true)
  })
})
