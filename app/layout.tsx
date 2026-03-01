import type { Metadata } from 'next'
import './globals.css'
import { withAuth, signOut } from '@workos-inc/authkit-nextjs'
import { GatewayProvider } from '@/context/gateway-context'
import { RepoProvider } from '@/context/repo-context'
import { EditorProvider } from '@/context/editor-context'

export const metadata: Metadata = {
  title: 'Code Editor',
  description: 'Gateway-integrated code editor with AI coding agent',
}

async function handleSignOut() {
  'use server'
  await signOut()
}

function AccessDenied({ email }: { email?: string | null }) {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-[var(--bg)]">
      <div className="w-full max-w-sm text-center space-y-4">
        <div className="w-12 h-12 rounded-xl mx-auto flex items-center justify-center bg-[color-mix(in_srgb,var(--color-deletions)_15%,transparent)] border border-[color-mix(in_srgb,var(--color-deletions)_25%,transparent)]">
          <span className="text-xl">🚫</span>
        </div>
        <h1 className="text-base font-semibold text-[var(--text-primary)]">Access Denied</h1>
        <p className="text-sm text-[var(--text-secondary)]">
          {email ? (
            <>
              <span className="font-mono text-xs bg-[var(--bg-subtle)] px-1.5 py-0.5 rounded">{email}</span>
              {' '}is not authorized to use this application.
            </>
          ) : (
            'Your account is not authorized to use this application.'
          )}
        </p>
        <form action={handleSignOut}>
          <button
            type="submit"
            className="px-4 py-2 rounded-lg text-sm font-medium bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
          >
            Sign out
          </button>
        </form>
      </div>
    </div>
  )
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { user } = await withAuth()

  const allowedEmail = process.env.ALLOWED_USER_EMAIL
  const allowedUserId = process.env.ALLOWED_USER_ID
  const hasRestriction = Boolean(allowedEmail || allowedUserId)
  const isAllowed = !hasRestriction || (
    (!allowedEmail || user?.email === allowedEmail) &&
    (!allowedUserId || user?.id === allowedUserId)
  )

  return (
    <html lang="en" data-theme="obsidian" className="dark">
      <body className="bg-[var(--bg)] text-[var(--text-primary)] antialiased min-h-screen max-h-dvh overflow-hidden">
        {isAllowed ? (
          <GatewayProvider>
            <RepoProvider>
              <EditorProvider>
                {children}
              </EditorProvider>
            </RepoProvider>
          </GatewayProvider>
        ) : (
          <AccessDenied email={user?.email} />
        )}
      </body>
    </html>
  )
}
