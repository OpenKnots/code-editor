import type { NextConfig } from 'next'

const isTauriStaticBuild = process.env.npm_lifecycle_event === 'build:static'

const nextConfig: NextConfig = {
  ...(isTauriStaticBuild ? { output: 'export' } : {}),

  async rewrites() {
    return [
      {
        source: '/api/github/device-code',
        destination: 'https://github.com/login/device/code',
      },
      {
        source: '/api/github/access-token',
        destination: 'https://github.com/login/oauth/access_token',
      },
    ]
  },
}

export default nextConfig
