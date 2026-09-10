import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'standalone',
  allowedDevOrigins: ['192.168.101.94', 'localhost'],
}

export default nextConfig