import type { Metadata } from 'next'
import './globals.css'
import { ThemeProvider } from '@/context/theme-context'
import { GatewayProvider } from '@/context/gateway-context'
import { RepoProvider } from '@/context/repo-context'
import { EditorProvider } from '@/context/editor-context'

export const metadata: Metadata = {
  title: 'Code Editor',
  description: 'Gateway-integrated code editor with AI coding agent',
  icons: {
    icon: '/favicon.png',
    apple: '/apple-touch-icon.png',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="obsidian" className="dark" suppressHydrationWarning>
      <body className="antialiased">
        <ThemeProvider>
          <GatewayProvider>
            <RepoProvider>
              <EditorProvider>
                {children}
              </EditorProvider>
            </RepoProvider>
          </GatewayProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
