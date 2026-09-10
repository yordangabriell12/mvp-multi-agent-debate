import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// House rule R-02 forbids the em dash in any text. It slipped back in several
// times, including in code written after the rule was adopted, so it is checked
// rather than trusted. The character is written as an escape here so this file
// does not trip its own check.

const EM_DASH = '\u2014'
const SOURCE_ROOT = join(process.cwd(), 'src')

/** The rule text and this guard are the only places the character may appear. */
const ALLOWED = [/Never use an em dash/, /u2014/, /const EM_DASH =/]

function collectSourceFiles(dir: string): string[] {
  const found: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      found.push(...collectSourceFiles(full))
      continue
    }
    if (entry.endsWith('.ts') || entry.endsWith('.tsx')) found.push(full)
  }
  return found
}

describe('house rule R-02: no em dash', () => {
  it('finds no em dash anywhere in src', () => {
    const offenders: string[] = []

    for (const file of collectSourceFiles(SOURCE_ROOT)) {
      const lines = readFileSync(file, 'utf8').split('\n')
      lines.forEach((line, index) => {
        if (!line.includes(EM_DASH)) return
        if (ALLOWED.some((pattern) => pattern.test(line))) return
        const relative = file.slice(process.cwd().length + 1)
        offenders.push(`${relative}:${index + 1}: ${line.trim().slice(0, 90)}`)
      })
    }

    expect(offenders, 'em dash found:\n' + offenders.join('\n')).toEqual([])
  })
})
