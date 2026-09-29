import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'standalone',
  allowedDevOrigins: ['192.168.101.94', 'localhost'],
  // Native or filesystem-dependent modules: they must stay outside the bundler and be
  // copied as built binaries, or their own files are not found at runtime.
  //
  //   @napi-rs/canvas  a prebuilt .node binary
  //   pdfjs-dist       loads its worker and fonts from paths, not imports
  //   playwright       loads its browser driver from a path of its own
  //
  // Playwright is here because of a failure that only appears in production: without
  // it the bundler rewrites the lazy `import('playwright')` into a hashed module name,
  // and the server answers "Cannot find module playwright-<hash>". The search then
  // silently degrades to the API layers with a warning, so the feature looks like it
  // works while never opening a browser.
  serverExternalPackages: ['@napi-rs/canvas', 'pdfjs-dist', 'playwright'],
  // The standalone output only includes files the bundler can see being used.
  //
  // The worker is loaded by pdf.js at runtime from a path, and the standard fonts
  // are read from disk, so neither shows up as an import. Without them here a PDF
  // read fails in production with "cannot find pdf.worker.mjs" while working
  // perfectly in development, which is the worst way for a fault to behave.
  outputFileTracingIncludes: {
    '/api/ocr': [
      './node_modules/pdfjs-dist/package.json',
      './node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs',
      './node_modules/pdfjs-dist/standard_fonts/**/*',
    ],
    // Playwright resolves its driver through its own package internals rather than
    // through an import the bundler can follow, so the whole package is named here.
    '/api/deep-search': [
      './node_modules/playwright/**/*',
      './node_modules/playwright-core/**/*',
    ],
    '/api/search': [
      './node_modules/playwright/**/*',
      './node_modules/playwright-core/**/*',
    ],
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
        ],
      },
    ]
  },
}

export default nextConfig
