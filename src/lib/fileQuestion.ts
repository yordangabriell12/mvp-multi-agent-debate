// The question to put to the agents, when a message may be a file with no words.

import type { MessageAttachment } from '@/types/message'

/**
 * The question an agent should be answering.
 *
 * Normally just what the person typed. The case worth handling is an attachment sent
 * with no text: that used to pass an empty string through, so the prompt read
 * `USER ASKS: ""`, routing matched no agent, and every agent answered nothing in
 * particular. Naming the file and saying what to do with it makes the upload itself a
 * usable instruction, which is what sending a document on its own means.
 */
export function userQuestion(text: string, attachments: MessageAttachment[] = []): string {
  if (text.trim()) return text

  const names = attachments.map((file) => file.name).filter(Boolean)
  if (names.length === 0) return ''

  const list = names.join(', ')
  return (
    (names.length === 1 ? 'Review the attached file: ' : 'Review the attached files: ') +
    list +
    '. Say what it contains and what in it matters for our discussion.'
  )
}
