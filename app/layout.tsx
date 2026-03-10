import type { Metadata, Viewport } from 'next'
import './globals.css'
import { ThemeProvider } from '@/context/theme-context'
import { GatewayProvider } from '@/context/gateway-context'
import { RepoProvider } from '@/context/repo-context'
import { EditorProvider } from '@/context/editor-context'
import { LocalProvider } from '@/context/local-context'
import { ViewProvider } from '@/context/view-context'
import { GitHubAuthProvider } from '@/context/github-auth-context'
import { PluginProvider } from '@/context/plugin-context'
import { PreviewProvider } from '@/context/preview-context'
import { ChatAppearanceProvider } from '@/context/chat-appearance-context'

import { LayoutProvider } from '@/context/layout-context'
import { ThreadProvider } from '@/context/thread-context'
import { AppModeProvider } from '@/context/app-mode-context'
import { ToastProvider } from '@/components/toast'
import { Suspense } from 'react'
import { ErrorBoundary } from '@/components/error-boundary'
import { AppSkeleton } from '@/components/app-skeleton'

export const metadata: Metadata = {
  title: 'KnotCode',
  description: 'AI-powered code editor by OpenKnot',
  icons: {
    icon: '/favicon.png',
    apple: '/apple-touch-icon.png',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="supreme" className="dark" suppressHydrationWarning>
      <body className="antialiased">
        <ErrorBoundary fallbackLabel="KnotCode encountered an error">
          <ThemeProvider>
            <GatewayProvider>
              <GitHubAuthProvider>
                <RepoProvider>
                  <EditorProvider>
                    <LocalProvider>
                      <ViewProvider>
                        <LayoutProvider>
                          <ThreadProvider>
                            <AppModeProvider>
                              <PreviewProvider>
                                <ChatAppearanceProvider>
                                  <PluginProvider>
                                    <ToastProvider>
                                      <Suspense fallback={<AppSkeleton />}>{children}</Suspense>
                                    </ToastProvider>
                                  </PluginProvider>
                                </ChatAppearanceProvider>
                              </PreviewProvider>
                            </AppModeProvider>
                          </ThreadProvider>
                        </LayoutProvider>
                      </ViewProvider>
                    </LocalProvider>
                  </EditorProvider>
                </RepoProvider>
              </GitHubAuthProvider>
            </GatewayProvider>
          </ThemeProvider>
        </ErrorBoundary>
      </body>
    </html>
  )
}
