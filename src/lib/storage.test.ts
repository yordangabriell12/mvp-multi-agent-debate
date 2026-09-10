import { afterEach, describe, expect, it, vi } from 'vitest'
import { safeGetItem, safeRemoveItem, safeSetItem } from './storage'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('safeSetItem', () => {
  it('reports success when there is no browser', () => {
    expect(safeSetItem('k', 'v').ok).toBe(true)
  })

  it('reports success against a working store', () => {
    vi.stubGlobal('window', {})
    vi.stubGlobal('localStorage', {
      setItem: vi.fn(),
    })
    expect(safeSetItem('k', 'v').ok).toBe(true)
  })

  // The original code swallowed this error, so messages stopped being saved
  // while the interface still looked fine.
  it('reports a full quota instead of swallowing it', () => {
    vi.stubGlobal('window', {})
    vi.stubGlobal('localStorage', {
      setItem: () => {
        throw new DOMException('quota', 'QuotaExceededError')
      },
    })

    const result = safeSetItem('k', 'v')
    expect(result.ok).toBe(false)
    expect(result.error).toContain('full')
  })

  it('reports other storage failures without claiming the quota is full', () => {
    vi.stubGlobal('window', {})
    vi.stubGlobal('localStorage', {
      setItem: () => {
        throw new DOMException('denied', 'SecurityError')
      },
    })

    const result = safeSetItem('k', 'v')
    expect(result.ok).toBe(false)
    expect(result.error).not.toContain('full')
  })

  it('never throws, whatever the store does', () => {
    vi.stubGlobal('window', {})
    vi.stubGlobal('localStorage', {
      setItem: () => {
        throw new Error('unexpected')
      },
    })
    expect(() => safeSetItem('k', 'v')).not.toThrow()
  })
})

describe('safeGetItem', () => {
  it('returns null when there is no browser', () => {
    expect(safeGetItem('k')).toBeNull()
  })

  it('returns the stored value', () => {
    vi.stubGlobal('window', {})
    vi.stubGlobal('localStorage', { getItem: () => 'stored' })
    expect(safeGetItem('k')).toBe('stored')
  })

  it('returns null when reading throws', () => {
    vi.stubGlobal('window', {})
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked')
      },
    })
    expect(safeGetItem('k')).toBeNull()
  })
})

describe('safeRemoveItem', () => {
  it('does nothing without a browser', () => {
    expect(() => safeRemoveItem('k')).not.toThrow()
  })

  it('never throws even if removal fails', () => {
    vi.stubGlobal('window', {})
    vi.stubGlobal('localStorage', {
      removeItem: () => {
        throw new Error('blocked')
      },
    })
    expect(() => safeRemoveItem('k')).not.toThrow()
  })
})
