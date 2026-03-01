'use client'

import { useState, useCallback, useEffect } from 'react'

// Set in .env.local:  NEXT_PUBLIC_GITHUB_CLIENT_ID=<your-oauth-app-client-id>
const GITHUB_CLIENT_ID = process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID ?? ''

type Step =
  | { type: 'idle' }
  | { type: 'device-pending'; userCode: string; verificationUri: string; deviceCode: string; interval: number }
  | { type: 'checking' }
  | { type: 'not-sponsored'; sponsorUrl: string }
  | { type: 'ready'; filename: string }
  | { type: 'downloading' }
  | { type: 'error'; message: string }

export default function DownloadPage() {
  const [step, setStep] = useState<Step>({ type: 'idle' })
  const [token, setToken] = useState<string | null>(null)

  // ── GitHub device-flow auth ──────────────────────────────────────────────

  const startDeviceFlow = useCallback(async () => {
    if (!GITHUB_CLIENT_ID) {
      setStep({ type: 'error', message: 'OAuth client ID not configured — contact the maintainer.' })
      return
    }

    try {
      const res = await fetch('/api/github/device-code', {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: GITHUB_CLIENT_ID, scope: 'read:user' }),
      })
      const data = (await res.json()) as {
        device_code: string
        user_code: string
        verification_uri: string
        interval: number
      }
      setStep({
        type: 'device-pending',
        userCode: data.user_code,
        verificationUri: data.verification_uri,
        deviceCode: data.device_code,
        interval: data.interval ?? 5,
      })
    } catch {
      setStep({ type: 'error', message: 'Failed to start GitHub authentication.' })
    }
  }, [])

  // ── Poll for token once user has authorised the device ───────────────────

  useEffect(() => {
    if (step.type !== 'device-pending') return

    const { deviceCode, interval } = step
    let cancelled = false

    const poll = async () => {
      while (!cancelled) {
        await new Promise(r => setTimeout(r, interval * 1000))
        if (cancelled) break

        try {
          const res = await fetch('/api/github/access-token', {
            method: 'POST',
            headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify({
              client_id: GITHUB_CLIENT_ID,
              device_code: deviceCode,
              grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
            }),
          })
          const data = (await res.json()) as { access_token?: string; error?: string }

          if (data.access_token) {
            setToken(data.access_token)
            setStep({ type: 'checking' })
            break
          }
          if (data.error === 'access_denied' || data.error === 'expired_token') {
            setStep({ type: 'error', message: 'Authorisation was denied or timed out.' })
            break
          }
          // 'authorization_pending' or 'slow_down' — keep polling
        } catch {
          // network hiccup — keep polling
        }
      }
    }

    poll()
    return () => { cancelled = true }
  }, [step])

  // ── Check sponsorship once we have a token ───────────────────────────────

  useEffect(() => {
    if (step.type !== 'checking' || !token) return

    const check = async () => {
      try {
        const res = await fetch('/api/download', {
          method: 'HEAD',
          headers: { Authorization: `Bearer ${token}` },
        })

        if (res.ok) {
          const name = res.headers.get('content-disposition')?.match(/filename="([^"]+)"/)?.[1] ?? 'KnotCode.dmg'
          setStep({ type: 'ready', filename: name })
        } else if (res.status === 402) {
          const body = (await fetch('/api/download', { headers: { Authorization: `Bearer ${token}` } })
            .then(r => r.json())
            .catch(() => ({}))) as { sponsor_url?: string }
          setStep({ type: 'not-sponsored', sponsorUrl: body.sponsor_url ?? 'https://github.com/sponsors/openknots' })
        } else if (res.status === 404) {
          setStep({ type: 'error', message: 'No release is available yet — check back soon.' })
        } else {
          setStep({ type: 'error', message: `Unexpected response: ${res.status}` })
        }
      } catch {
        setStep({ type: 'error', message: 'Could not verify sponsorship. Try again.' })
      }
    }

    check()
  }, [step, token])

  // ── Download ─────────────────────────────────────────────────────────────

  const startDownload = useCallback(async () => {
    if (!token) return
    setStep(s => (s.type === 'ready' ? { type: 'downloading' } : s))

    try {
      const res = await fetch('/api/download', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error(`${res.status}`)

      const filename =
        res.headers.get('content-disposition')?.match(/filename="([^"]+)"/)?.[1] ?? 'KnotCode.dmg'

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)

      // Return to ready so they can re-download
      setStep({ type: 'ready', filename })
    } catch (err) {
      setStep({ type: 'error', message: `Download failed: ${err instanceof Error ? err.message : 'unknown error'}` })
    }
  }, [token])

  // ── UI ───────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#0d0d0f] text-white flex flex-col items-center justify-center px-4">

      {/* Logo / wordmark */}
      <div className="mb-12 text-center">
        <div className="inline-flex items-center gap-3 mb-3">
          <span className="text-3xl font-bold tracking-tight">Knot Code</span>
        </div>
        <p className="text-sm text-white/40">AI-native code editor · macOS</p>
      </div>

      {/* Card */}
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-xl p-8 shadow-2xl">

        {step.type === 'idle' && <IdleState onConnect={startDeviceFlow} />}
        {step.type === 'device-pending' && <DevicePendingState step={step} />}
        {step.type === 'checking' && <CheckingState />}
        {step.type === 'not-sponsored' && <NotSponsoredState step={step} />}
        {step.type === 'ready' && <ReadyState step={step} onDownload={startDownload} />}
        {step.type === 'downloading' && <DownloadingState />}
        {step.type === 'error' && <ErrorState step={step} onRetry={() => setStep({ type: 'idle' })} />}

      </div>

      {/* Footer */}
      <p className="mt-8 text-xs text-white/20">
        Knot Code · OpenKnots ·{' '}
        <a href="https://github.com/OpenKnots/code-editor" className="underline underline-offset-2 hover:text-white/50 transition-colors">
          GitHub
        </a>
      </p>
    </div>
  )
}

// ── Sub-components ───────────────────────────────────────────────────────────

function IdleState({ onConnect }: { onConnect: () => void }) {
  return (
    <div className="text-center">
      <div className="mb-6">
        <h2 className="text-xl font-semibold mb-2">Download Knot Code</h2>
        <p className="text-sm text-white/50 leading-relaxed">
          Knot Code is available to{' '}
          <a
            href="https://github.com/sponsors/openknots"
            target="_blank"
            rel="noopener noreferrer"
            className="text-white/80 underline underline-offset-2"
          >
            GitHub Sponsors
          </a>
          . Connect your GitHub account to verify your sponsorship.
        </p>
      </div>

      <button
        onClick={onConnect}
        className="w-full flex items-center justify-center gap-2 rounded-xl bg-white text-black font-medium py-3 px-4 hover:bg-white/90 active:bg-white/80 transition-colors"
      >
        <GitHubIcon />
        Connect with GitHub
      </button>

      <div className="mt-6 pt-6 border-t border-white/10">
        <p className="text-xs text-white/30 leading-relaxed">
          Not a sponsor yet?{' '}
          <a
            href="https://github.com/sponsors/openknots"
            target="_blank"
            rel="noopener noreferrer"
            className="text-white/50 underline underline-offset-2"
          >
            Sponsor on GitHub
          </a>{' '}
          — any tier unlocks the download.
        </p>
      </div>
    </div>
  )
}

function DevicePendingState({ step }: { step: Extract<Step, { type: 'device-pending' }> }) {
  const [copied, setCopied] = useState(false)

  const copy = () => {
    navigator.clipboard.writeText(step.userCode).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="text-center">
      <h2 className="text-xl font-semibold mb-2">Authorise on GitHub</h2>
      <p className="text-sm text-white/50 mb-6 leading-relaxed">
        Visit{' '}
        <a
          href={step.verificationUri}
          target="_blank"
          rel="noopener noreferrer"
          className="text-white underline underline-offset-2"
        >
          {step.verificationUri}
        </a>{' '}
        and enter this code:
      </p>

      <button
        onClick={copy}
        className="mx-auto flex items-center gap-3 rounded-xl border border-white/20 bg-white/5 px-6 py-4 font-mono text-2xl font-bold tracking-widest hover:bg-white/10 transition-colors"
      >
        {step.userCode}
        <span className="text-xs font-sans font-normal text-white/30">
          {copied ? 'Copied!' : 'Copy'}
        </span>
      </button>

      <div className="mt-6 flex items-center justify-center gap-2 text-sm text-white/30">
        <Spinner />
        Waiting for authorisation…
      </div>
    </div>
  )
}

function CheckingState() {
  return (
    <div className="text-center py-4">
      <div className="flex items-center justify-center gap-2 text-white/50">
        <Spinner />
        Verifying sponsorship…
      </div>
    </div>
  )
}

function NotSponsoredState({ step }: { step: Extract<Step, { type: 'not-sponsored' }> }) {
  return (
    <div className="text-center">
      <div className="mb-6">
        <div className="text-3xl mb-3">💛</div>
        <h2 className="text-xl font-semibold mb-2">Sponsorship required</h2>
        <p className="text-sm text-white/50 leading-relaxed">
          Your account isn&apos;t currently sponsoring OpenKnots. Any tier on GitHub Sponsors
          unlocks the download instantly — no waiting.
        </p>
      </div>

      <a
        href={step.sponsorUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="block w-full rounded-xl bg-[#db61a2] text-white font-medium py-3 px-4 text-center hover:bg-[#c4508e] active:bg-[#b04480] transition-colors"
      >
        Sponsor on GitHub →
      </a>

      <p className="mt-4 text-xs text-white/25">
        After sponsoring, refresh this page and reconnect.
      </p>
    </div>
  )
}

function ReadyState({
  step,
  onDownload,
}: {
  step: Extract<Step, { type: 'ready' }>
  onDownload: () => void
}) {
  return (
    <div className="text-center">
      <div className="text-3xl mb-4">✦</div>
      <h2 className="text-xl font-semibold mb-2">You&apos;re in</h2>
      <p className="text-sm text-white/50 mb-6">
        Thank you for sponsoring. Click below to download Knot Code.
      </p>

      <button
        onClick={onDownload}
        className="w-full rounded-xl bg-white text-black font-medium py-3 px-4 hover:bg-white/90 active:bg-white/80 transition-colors"
      >
        Download {step.filename}
      </button>

      <p className="mt-4 text-xs text-white/25">
        Universal binary · macOS 12+ · Apple Silicon &amp; Intel
      </p>
    </div>
  )
}

function DownloadingState() {
  return (
    <div className="text-center py-4">
      <div className="flex items-center justify-center gap-2 text-white/50">
        <Spinner />
        Preparing download…
      </div>
      <p className="mt-3 text-xs text-white/25">This may take a moment for large files.</p>
    </div>
  )
}

function ErrorState({
  step,
  onRetry,
}: {
  step: Extract<Step, { type: 'error' }>
  onRetry: () => void
}) {
  return (
    <div className="text-center">
      <div className="text-3xl mb-4">⚠</div>
      <h2 className="text-xl font-semibold mb-2">Something went wrong</h2>
      <p className="text-sm text-white/50 mb-6">{step.message}</p>
      <button
        onClick={onRetry}
        className="w-full rounded-xl border border-white/20 bg-white/5 font-medium py-3 px-4 hover:bg-white/10 transition-colors"
      >
        Try again
      </button>
    </div>
  )
}

// ── Primitives ────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  )
}

function GitHubIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
    </svg>
  )
}
