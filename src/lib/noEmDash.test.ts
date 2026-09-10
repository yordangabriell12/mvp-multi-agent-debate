import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// House rule R-02 forbids the em dash in any text. It slipped back in several
// times, including in text written after the rule was adopted, so it is checked
// rather than trusted. The character is written as an escape here so this file
// does not trip its own check.

const EM_DASH = '\u2014'
const ROOT = process.cwd()

/** Scanned: the app source, the docs vault, and the daily change logs. */
const SCAN_DIRS = ['src', 'docs']
const SCAN_ROOT_FILES = /^(PRD.*|.*\.md)$/

/**
 * PRD.md and PRD-UI.md are the project's original specification documents,
 * written before the house rules applied. Rewriting them would alter source
 * material that describes the app as it was designed, so they are left alone
 * and excluded here rather than silently rewritten.
 */
const EXCLUDED = new Set(['PRD.md', 'PRD-UI.md'])

/** The rule text and this guard are the only places the character may appear. */
const ALLOWED = [/Never use an em dash/, /u2014/, /const EM_DASH =/]

function collectFiles(dir: string): string[] {
  const found: string[] = []
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return found
  }
  for (const entry of entries) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      found.push(...collectFiles(full))
      continue
    }
    if (entry.endsWith('.ts') || entry.endsWith('.tsx') || entry.endsWith('.md')) {
      found.push(full)
    }
  }
  return found
}

describe('house rule R-02: no em dash', () => {
  it('finds no em dash in source, docs or change logs', () => {
    const files: string[] = []

    for (const dir of SCAN_DIRS) files.push(...collectFiles(join(ROOT, dir)))
    for (const entry of readdirSync(ROOT)) {
      if (SCAN_ROOT_FILES.test(entry) && !EXCLUDED.has(entry)) files.push(join(ROOT, entry))
    }

    const offenders: string[] = []

    for (const file of files) {
      const relative = file.slice(ROOT.length + 1)
      const lines = readFileSync(file, 'utf8').split('\n')
      lines.forEach((line, index) => {
        if (!line.includes(EM_DASH)) return
        if (ALLOWED.some((pattern) => pattern.test(line))) return
        offenders.push(`${relative}:${index + 1}: ${line.trim().slice(0, 90)}`)
      })
    }

    expect(offenders, 'em dash found:\n' + offenders.join('\n')).toEqual([])
  })
})
