// Tests for the question sent when a message carries a file but no text.
//
// The regression: a document dropped in on its own produced `USER ASKS: ""`, so the agents
// were asked nothing. The file is named in the derived question instead.

import { describe, it, expect } from 'vitest'
import { userQuestion } from '@/lib/fileQuestion'
import type { MessageAttachment } from '@/types/message'

function attachment(name: string): MessageAttachment {
  return { name, type: 'application/pdf', size: 1024 }
}

describe('userQuestion', () => {
  it('uses what the person typed', () => {
    expect(userQuestion('What does this contract say?')).toBe('What does this contract say?')
  })

  it('ignores surrounding whitespace when deciding there is text', () => {
    expect(userQuestion('  hi  ')).toBe('  hi  ')
  })

  it('names the file when nothing was typed', () => {
    const question = userQuestion('', [attachment('PMK-168-2023.pdf')])
    expect(question).toContain('PMK-168-2023.pdf')
    // The point of the derived question is that the agents are told what to do.
    expect(question).toMatch(/Review the attached file/)
  })

  it('reads naturally for more than one file', () => {
    const question = userQuestion('', [attachment('a.pdf'), attachment('b.png')])
    expect(question).toContain('Review the attached files')
    expect(question).toContain('a.pdf')
    expect(question).toContain('b.png')
  })

  it('still prefers typed text when a file is attached to it', () => {
    const question = userQuestion('Summarise the key points', [attachment('a.pdf')])
    expect(question).toBe('Summarise the key points')
  })

  it('returns nothing when there is neither text nor a file', () => {
    // Guards the send path: an entirely empty message must not become a question.
    expect(userQuestion('')).toBe('')
    expect(userQuestion('   ', [])).toBe('')
  })

  it('skips an attachment with no name', () => {
    expect(userQuestion('', [{ name: '', type: 'application/pdf', size: 10 }])).toBe('')
  })
})
