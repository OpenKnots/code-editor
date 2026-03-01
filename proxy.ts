import { authkitMiddleware } from '@workos-inc/authkit-nextjs'
import { NextFetchEvent, NextRequest, NextResponse } from 'next/server'

/**
 * Combined proxy: IP allowlist + security headers + WorkOS AuthKit session.
 *
 * 1. CORS preflight is handled first.
 * 2. IP check runs (fail-closed unless ALLOWED_IPS=*).
 * 3. Security headers are applied.
 * 4. WorkOS AuthKit middleware manages the session cookie / token refresh.
 *    The landing page ("/") and static assets are unauthenticated.
 */

const LOCALHOST = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1'])

function ipMatchesCIDR(ip: string, cidr: string): boolean {
  if (!cidr.includes('/')) return ip === cidr

  const [base, prefixStr] = cidr.split('/')
  const prefix = parseInt(prefixStr, 10)
  if (isNaN(prefix)) return false

  const ipNum = ipToNumber(ip)
  const baseNum = ipToNumber(base)
  if (ipNum === null || baseNum === null) return false

  const mask = ~((1 << (32 - prefix)) - 1) >>> 0
  return (ipNum & mask) === (baseNum & mask)
}

function ipToNumber(ip: string): number | null {
  const parts = ip.split('.')
  if (parts.length !== 4) return null
  let num = 0
  for (const part of parts) {
    const n = parseInt(part, 10)
    if (isNaN(n) || n < 0 || n > 255) return null
    num = (num << 8) | n
  }
  return num >>> 0
}

function isIpAllowed(ip: string, allowlist: string[]): boolean {
  return allowlist.some((entry) => ipMatchesCIDR(ip, entry))
}

function checkIp(request: NextRequest): NextResponse | null {
  const raw = process.env.ALLOWED_IPS ?? ''

  if (raw.trim() === '*') return null

  const allowlist = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  if (allowlist.length === 0) {
    return new NextResponse('Forbidden', { status: 403 })
  }

  const forwarded = request.headers.get('x-forwarded-for')
  const clientIp = forwarded?.split(',')[0]?.trim() ?? request.headers.get('x-real-ip') ?? ''

  if (process.env.NODE_ENV !== 'production' && (!clientIp || LOCALHOST.has(clientIp))) {
    return null
  }

  if (!isIpAllowed(clientIp, allowlist)) {
    return new NextResponse('Forbidden', { status: 403 })
  }

  return null
}

const SECURITY_HEADERS: Record<string, string> = {
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'X-DNS-Prefetch-Control': 'on',
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
  'Access-Control-Allow-Origin': process.env.NEXT_PUBLIC_APP_URL ?? '',
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self' data:",
    "connect-src 'self' ws: wss: https:",
    "worker-src 'self' blob:",
    "frame-ancestors 'none'",
  ].join('; '),
}

function applySecurityHeaders(response: NextResponse): NextResponse {
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(key, value)
  }
  return response
}

const workosMiddleware = authkitMiddleware({
  middlewareAuth: {
    enabled: true,
    unauthenticatedPaths: [
      '/',
      '/sign-in',
      '/download',
      '/callback',
      '/api/download',
      '/api/github/:path*',
    ],
  },
})

export default async function proxy(request: NextRequest, event: NextFetchEvent) {
  // CORS preflight
  if (request.method === 'OPTIONS') {
    return new NextResponse(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': request.headers.get('origin') ?? '',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '86400',
      },
    })
  }

  // IP allowlist check
  const blocked = checkIp(request)
  if (blocked) return blocked

  // WorkOS AuthKit session management (handles redirect for unauthenticated users)
  const response = await workosMiddleware(request, event)

  // Apply security headers to the response
  if (response) {
    return applySecurityHeaders(response as NextResponse)
  }

  const next = NextResponse.next()
  return applySecurityHeaders(next)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|favicon.png|apple-touch-icon.png).*)'],
}
