import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'VMA',
  description: 'Multi-agent discussion workspace',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  )
}