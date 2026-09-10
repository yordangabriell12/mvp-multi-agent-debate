// Generates a PBKDF2 hash for VMA_AUTH_PASSWORD_HASH.
//
//   node scripts/hash-password.mjs 'your-password'
//
// The output is safe to store in the container environment: it cannot be
// reversed into the password without brute force.

import { webcrypto as crypto } from 'node:crypto'

const PBKDF2_ITERATIONS = 210000
const KEY_BYTES = 32

function toBase64Url(bytes) {
  return Buffer.from(bytes).toString('base64url')
}

async function main() {
  const password = process.argv[2]
  if (!password) {
    console.error("Usage: node scripts/hash-password.mjs 'your-password'")
    process.exit(1)
  }

  const salt = crypto.getRandomValues(new Uint8Array(16))
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  )
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    KEY_BYTES * 8
  )

  console.log(`pbkdf2$${PBKDF2_ITERATIONS}$${toBase64Url(salt)}$${toBase64Url(new Uint8Array(bits))}`)
}

main()
