/**
 * A stand-in for a vision provider.
 *
 * Runs as an OpenAI-compatible endpoint that reports back what it received, so
 * the OCR route can be tested end to end without a real API key or a bill. It is
 * the only way to check the parts that matter and are otherwise invisible: that
 * the image actually arrives as base64, that the instruction is sent, and that
 * the reply is parsed and placed on the right page.
 *
 * Not shipped in the image. Only used from the test script.
 *
 * Usage: node scripts/mock-vision-provider.mjs [port]
 */

import { createServer } from 'node:http'

const port = Number(process.argv[2] || 4599)

createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/v1/models') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ data: [{ id: 'mock-vision' }] }))
    return
  }

  if (req.method !== 'POST' || !req.url.endsWith('/chat/completions')) {
    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'not found' }))
    return
  }

  let body = ''
  req.on('data', (chunk) => {
    body += chunk
  })

  req.on('end', () => {
    let parsed
    try {
      parsed = JSON.parse(body)
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'bad json' }))
      return
    }

    const content = parsed?.messages?.[0]?.content
    const parts = Array.isArray(content) ? content : []
    const imagePart = parts.find((p) => p.type === 'image_url')
    const textPart = parts.find((p) => p.type === 'text')

    const dataUrl = imagePart?.image_url?.url || ''
    const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : ''
    // A PNG signature is 8 bytes, so a real image decodes to more than a few.
    const decodedBytes = base64 ? Buffer.from(base64, 'base64').length : 0

    // The reply states what the mock saw, so the test can assert the image and
    // the instruction both made the trip.
    const reply =
      `MOCK_OCR model=${parsed?.model} ` +
      `image=${decodedBytes > 0 ? 'received' : 'MISSING'} ` +
      `bytes=${decodedBytes} ` +
      `instruction=${textPart ? 'present' : 'MISSING'}`

    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(
      JSON.stringify({
        choices: [{ message: { role: 'assistant', content: reply } }],
      })
    )
  })
}).listen(port, '127.0.0.1', () => {
  console.log(`mock vision provider listening on http://127.0.0.1:${port}`)
})
