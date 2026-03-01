import { NextRequest, NextResponse } from 'next/server'

/**
 * Resolve the GitHub token from the request Authorization header,
 * falling back to the GITHUB_TOKEN environment variable.
 */
export function resolveToken(req: NextRequest): string | null {
  const authHeader = req.headers.get('authorization')
  if (authHeader?.startsWith('Bearer ')) return authHeader.slice(7)
  return process.env.GITHUB_TOKEN ?? null
}

export function githubHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  }
}

/**
 * Shared helper for making authenticated GitHub API requests.
 * Returns the Response object on success, or a NextResponse error.
 */
export async function githubFetch(
  url: string,
  token: string,
  options: RequestInit = {}
): Promise<Response> {
  const headers: Record<string, string> = {
    ...githubHeaders(token),
    ...(options.headers as Record<string, string> ?? {}),
  }
  if (options.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json'
  }
  return fetch(url, { ...options, headers })
}

/** Standard error response from a failed GitHub API call */
export function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status })
}

/** Resolve token or return 401 response */
export function requireToken(req: NextRequest): string | NextResponse {
  const token = resolveToken(req)
  if (!token) return errorResponse('GitHub token not configured', 401)
  return token
}
