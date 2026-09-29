// Tests for the data directory guard.
//
// The bug this pins: the store defaults to `./data` under the working directory, and
// the standalone build runs with `.next/standalone` as its working directory. A build
// deletes that tree, so accounts and provider keys vanished on every deploy. Only the
// path shape decides it, which makes the rule cheap to test.

import { describe, it, expect } from 'vitest'
import path from 'node:path'
import { pathIsInsideBuildOutput } from '@/lib/secureFile'

describe('pathIsInsideBuildOutput', () => {
  it('flags a store underneath .next', () => {
    expect(pathIsInsideBuildOutput(path.join('/app', '.next', 'standalone', 'data'))).toBe(true)
    expect(pathIsInsideBuildOutput(path.join('/opt', 'vma', '.next', 'data'))).toBe(true)
    expect(pathIsInsideBuildOutput(path.join('.next', 'standalone', 'data'))).toBe(true)
  })

  it('accepts a stable location outside the build output', () => {
    expect(pathIsInsideBuildOutput(path.join('/app', 'data'))).toBe(false)
    expect(pathIsInsideBuildOutput(path.join('/var', 'lib', 'vma'))).toBe(false)
    expect(pathIsInsideBuildOutput('/data')).toBe(false)
  })

  it('is not fooled by a directory that merely starts with the same letters', () => {
    // `.nextjs` and `notnext` are ordinary names, and treating them as build output
    // would warn about a perfectly safe location on every boot.
    expect(pathIsInsideBuildOutput(path.join('/app', '.nextjs', 'data'))).toBe(false)
    expect(pathIsInsideBuildOutput(path.join('/app', 'not.next', 'data'))).toBe(false)
  })
})
