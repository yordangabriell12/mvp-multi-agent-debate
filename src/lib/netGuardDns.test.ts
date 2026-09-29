// Tests for the DNS-resolution half of the SSRF guard.
//
// `checkOutboundUrl` is covered in netGuard.test.ts and works on the URL string.
// It cannot catch a service name that only becomes private after resolution,
// which is exactly the case inside Docker: `http://portainer:9000` is an ordinary
// hostname as a string. These tests cover the lookup that closes that gap.

import { describe, it, expect } from 'vitest'
import { assertPublicHost, checkOutboundUrlDeep } from '@/lib/netGuard'

describe('assertPublicHost', () => {
  it('rejects loopback given as a literal address', async () => {
    // No lookup needed: the address already says where it goes.
    expect((await assertPublicHost('http://127.0.0.1:8080/v1')).ok).toBe(false)
    expect((await assertPublicHost('http://[::1]:8080/v1')).ok).toBe(false)
  })

  it('rejects private and link-local literals', async () => {
    expect((await assertPublicHost('http://10.0.0.5/v1')).ok).toBe(false)
    expect((await assertPublicHost('http://192.168.1.10/v1')).ok).toBe(false)
    expect((await assertPublicHost('http://172.16.4.1/v1')).ok).toBe(false)
    // Cloud metadata, the highest-value target of an SSRF.
    expect((await assertPublicHost('http://169.254.169.254/latest/meta-data')).ok).toBe(false)
  })

  it('resolves a name and rejects it when it points somewhere private', async () => {
    // `localhost` is blocked by name, so this uses one that is not: the point is
    // that the decision comes from the resolved address, not the string.
    const result = await assertPublicHost('http://ip6-localhost:9000/api')
    expect(result.ok).toBe(false)
  })

  it('rejects a name that cannot be resolved rather than trying anyway', async () => {
    // A name that does not resolve must fail closed. Letting the fetch attempt it
    // would hand the resolver a second chance to find something private.
    const result = await assertPublicHost('http://this-host-does-not-exist-vma.invalid/v1')
    expect(result.ok).toBe(false)
    expect(result.reason).toContain('cannot be resolved')
  })

  it('allows a genuine public address', async () => {
    // 1.1.1.1 is public, so the guard must not reject everything.
    const result = await assertPublicHost('https://1.1.1.1/v1')
    expect(result.ok).toBe(true)
  })

  it('reports a non-URL as invalid', async () => {
    expect((await assertPublicHost('not a url')).ok).toBe(false)
  })
})

describe('checkOutboundUrlDeep', () => {
  it('rejects a private literal', async () => {
    const result = await checkOutboundUrlDeep('http://172.20.0.3:3000/v1')
    expect(result.ok).toBe(false)
  })

  it('allows a public host', async () => {
    const result = await checkOutboundUrlDeep('https://api.deepseek.com/v1')
    expect(result.ok).toBe(true)
  })

  it('lets the environment flag bypass both layers', async () => {
    // A self-hosted Ollama on the same network is the case this exists for.
    const previous = process.env.VMA_ALLOW_PRIVATE_BASEURL
    process.env.VMA_ALLOW_PRIVATE_BASEURL = 'true'
    try {
      expect((await checkOutboundUrlDeep('http://127.0.0.1:11434/v1')).ok).toBe(true)
    } finally {
      if (previous === undefined) delete process.env.VMA_ALLOW_PRIVATE_BASEURL
      else process.env.VMA_ALLOW_PRIVATE_BASEURL = previous
    }
  })
})
