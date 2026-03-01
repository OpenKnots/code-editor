'use client'

import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { Icon } from '@iconify/react'

/* ═══════════════════════════════════════════════════════════════
   Star Field — ambient background (Claw Dash style)
   ═══════════════════════════════════════════════════════════════ */

function StarField() {
  const stars = useMemo(() => {
    const result: { x: number; y: number; r: number; opacity: number; delay: number; twinkle: boolean }[] = []
    let seed = 42
    const rand = () => { seed = (seed * 16807 + 0) % 2147483647; return (seed - 1) / 2147483646 }
    for (let i = 0; i < 140; i++) {
      result.push({
        x: rand() * 100, y: rand() * 100,
        r: rand() < 0.85 ? 0.4 + rand() * 0.5 : 0.8 + rand() * 0.6,
        opacity: 0.15 + rand() * 0.45, delay: rand() * 8,
        twinkle: rand() < 0.3,
      })
    }
    return result
  }, [])

  return (
    <div className="kn-stars" aria-hidden="true">
      <svg width="100%" height="100%" preserveAspectRatio="none">
        {stars.map((s, i) => (
          <circle key={i} cx={`${s.x}%`} cy={`${s.y}%`} r={s.r}
            fill="var(--kn-star-color, #A78BFA)" opacity={s.opacity}
            className={s.twinkle ? 'kn-star-twinkle' : undefined}
            style={s.twinkle ? { animationDelay: `${s.delay}s` } : undefined}
          />
        ))}
      </svg>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   Thread Field — decorative SVG threads
   ═══════════════════════════════════════════════════════════════ */

function ThreadField() {
  return (
    <div className="kn-threads" aria-hidden="true">
      <svg viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice" fill="none" className="kn-threads-svg">
        <path d="M -80 520 C 180 440, 380 620, 620 460 S 980 340, 1520 480" className="kn-thread kn-thread-a" />
        <path d="M 1260 -40 C 1060 160, 860 300, 680 400" className="kn-thread kn-thread-b" />
        <path d="M 600 490 C 460 590, 280 720, 60 940" className="kn-thread kn-thread-b" />
        <path d="M -40 180 C 200 160, 440 260, 560 340" className="kn-thread kn-thread-c" />
        <path d="M -60 780 C 300 740, 600 800, 900 720 S 1300 680, 1520 760" className="kn-thread kn-thread-d" />
        <path d="M -40 320 C 200 300, 420 380, 640 340 S 960 260, 1480 380" className="kn-thread kn-thread-accent" />
        <path d="M 1520 200 C 1200 260, 900 180, 640 280 S 300 360, -40 240" className="kn-thread kn-thread-ocean" />
        <circle cx="640" cy="462" r="3" fill="var(--kn-accent, #A78BFA)" opacity="0.25" />
        <circle cx="640" cy="462" r="14" fill="var(--kn-accent, #A78BFA)" opacity="0.06" />
      </svg>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   Scroll-reveal
   ═══════════════════════════════════════════════════════════════ */

function Reveal({ children, delay = 0, className = '' }: { children: React.ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [vis, setVis] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVis(true); obs.disconnect() } }, { threshold: 0.12 })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])
  return (
    <div ref={ref} className={className} style={{ opacity: vis ? 1 : 0, transform: vis ? 'translateY(0)' : 'translateY(16px)', transition: `opacity 0.8s cubic-bezier(0.16,1,0.3,1) ${delay}ms, transform 0.8s cubic-bezier(0.16,1,0.3,1) ${delay}ms` }}>
      {children}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   Animated Counter
   ═══════════════════════════════════════════════════════════════ */

function AnimatedCounter({ end, duration = 2000, label, suffix = '' }: { end: number; duration?: number; label: string; suffix?: string }) {
  const [count, setCount] = useState(0)
  const ref = useRef<HTMLDivElement>(null)
  const started = useRef(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !started.current) {
        started.current = true
        const s = performance.now()
        const tick = (now: number) => { const p = Math.min((now - s) / duration, 1); setCount(Math.floor((1 - Math.pow(1 - p, 3)) * end)); if (p < 1) requestAnimationFrame(tick) }
        requestAnimationFrame(tick)
      }
    }, { threshold: 0.3 })
    obs.observe(el)
    return () => obs.disconnect()
  }, [end, duration])
  return (
    <div ref={ref} className="text-center">
      <span className="text-2xl sm:text-3xl font-semibold tracking-tight" style={{ color: 'var(--kn-text-secondary)' }}>{count.toLocaleString()}{suffix}</span>
      <p className="text-xs mt-1" style={{ color: 'var(--kn-text-dim)' }}>{label}</p>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   Mini Widgets — animated previews of features
   ═══════════════════════════════════════════════════════════════ */

/* ─── Editor Preview ─────────────────────────────────────────── */
function EditorPreview() {
  const [ghostVisible, setGhostVisible] = useState(false)
  const [line, setLine] = useState(0)

  const CODE_LINES = [
    { num: 14, text: 'export async function handler(req: Request) {', color: 'var(--kn-text)' },
    { num: 15, text: '  const body = await req.json()', color: 'var(--kn-text)' },
    { num: 16, text: '  const user = await db.users.find(body.id)', color: 'var(--kn-text)' },
    { num: 17, text: '  if (!user) return Response.json({ error: "not found" }, { status: 404 })', color: 'var(--kn-text-muted)' },
    { num: 18, text: '', color: '' },
    { num: 19, text: '  ', color: 'var(--kn-text)', cursor: true },
  ]

  const GHOST = 'return Response.json({ user, ts: Date.now() })'

  useEffect(() => {
    const t1 = setInterval(() => {
      setGhostVisible(v => !v)
    }, 3000)
    return () => clearInterval(t1)
  }, [])

  useEffect(() => {
    const t = setInterval(() => setLine(l => (l + 1) % 3), 4000)
    return () => clearInterval(t)
  }, [])

  const highlights = [17, 16, 19]
  const highlightLine = highlights[line]

  return (
    <div className="kn-widget-editor">
      {/* Tab bar */}
      <div className="flex items-center gap-0 border-b" style={{ borderColor: 'var(--kn-border)', background: 'rgba(255,255,255,0.02)' }}>
        <div className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-mono border-b-2" style={{ borderColor: 'var(--kn-accent)', color: 'var(--kn-text-secondary)' }}>
          <Icon icon="lucide:file-code" width={12} height={12} style={{ color: '#3178c6' }} />
          handler.ts
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-mono" style={{ color: 'var(--kn-text-ghost)' }}>
          <Icon icon="lucide:file-code" width={12} height={12} />
          schema.ts
        </div>
      </div>
      {/* Code */}
      <div className="py-1.5 font-mono text-[11px] leading-[1.7]">
        {CODE_LINES.map((l, i) => (
          <div key={i} className="flex transition-colors duration-500" style={{ background: l.num === highlightLine ? 'rgba(167,139,250,0.06)' : 'transparent' }}>
            <span className="w-8 text-right pr-2 select-none shrink-0" style={{ color: 'var(--kn-text-ghost)' }}>{l.num}</span>
            <span className="flex-1 whitespace-pre" style={{ color: l.color }}>
              {l.text}
              {l.cursor && (
                <>
                  <span className="kn-cursor" />
                  {ghostVisible && (
                    <span className="kn-ghost-text">{GHOST}</span>
                  )}
                </>
              )}
            </span>
          </div>
        ))}
      </div>
      {/* Ghost text hint */}
      <div className="flex items-center gap-1.5 px-3 py-1 border-t" style={{ borderColor: 'var(--kn-border)' }}>
        <Icon icon="lucide:sparkles" width={10} height={10} style={{ color: 'var(--kn-accent)' }} />
        <span className="text-[9px] font-mono" style={{ color: 'var(--kn-text-ghost)' }}>Tab to accept AI completion</span>
      </div>
    </div>
  )
}

/* ─── Slash Command Preview ──────────────────────────────────── */
function SlashCommandPreview() {
  const [activeCmd, setActiveCmd] = useState(0)
  const cmds = [
    { cmd: '/edit', desc: 'Refactor this to use async/await', icon: 'lucide:pencil' },
    { cmd: '/review', desc: 'Security audit on auth handler', icon: 'lucide:shield-check' },
    { cmd: '/commit', desc: 'feat: add user validation', icon: 'lucide:git-commit-horizontal' },
    { cmd: '/explain', desc: 'What does this regex do?', icon: 'lucide:message-circle' },
  ]

  useEffect(() => {
    const t = setInterval(() => setActiveCmd(i => (i + 1) % cmds.length), 2500)
    return () => clearInterval(t)
  }, [cmds.length])

  return (
    <div className="kn-widget-terminal">
      <div className="flex items-center gap-1.5 px-3 py-1.5 border-b" style={{ borderColor: 'var(--kn-border)' }}>
        <div className="flex gap-1">
          <div className="w-2 h-2 rounded-full" style={{ background: '#ff5f57' }} />
          <div className="w-2 h-2 rounded-full" style={{ background: '#febc2e' }} />
          <div className="w-2 h-2 rounded-full" style={{ background: '#28c840' }} />
        </div>
        <span className="text-[10px] font-mono ml-2" style={{ color: 'var(--kn-text-ghost)' }}>agent</span>
      </div>
      <div className="p-3 space-y-1.5">
        {cmds.map((c, i) => (
          <div key={i} className="flex items-center gap-2 px-2 py-1.5 rounded-md transition-all duration-500"
            style={{
              background: activeCmd === i ? 'rgba(167,139,250,0.08)' : 'transparent',
              border: `1px solid ${activeCmd === i ? 'rgba(167,139,250,0.15)' : 'transparent'}`,
              transform: activeCmd === i ? 'translateX(4px)' : 'none',
            }}
          >
            <Icon icon={c.icon} width={13} height={13} style={{ color: activeCmd === i ? 'var(--kn-accent)' : 'var(--kn-text-ghost)', flexShrink: 0 }} />
            <span className="text-[11px] font-mono font-bold shrink-0" style={{ color: activeCmd === i ? 'var(--kn-accent)' : 'var(--kn-text-muted)' }}>{c.cmd}</span>
            <span className="text-[10px] font-mono truncate" style={{ color: activeCmd === i ? 'var(--kn-text-muted)' : 'var(--kn-text-ghost)' }}>{c.desc}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ─── Mode Toggle Preview ────────────────────────────────────── */
function ModeTogglePreview() {
  const [local, setLocal] = useState(true)
  useEffect(() => {
    const t = setInterval(() => setLocal(v => !v), 3500)
    return () => clearInterval(t)
  }, [])

  const localFiles = [
    { name: 'src/', type: 'dir' },
    { name: '  page.tsx', status: 'M', color: 'var(--kn-warning, #fbbf24)' },
    { name: '  layout.tsx', status: '', color: '' },
    { name: '  utils.ts', status: 'U', color: 'var(--kn-success, #34d399)' },
    { name: 'package.json', status: '', color: '' },
  ]

  return (
    <div className="kn-widget-mode">
      <div className="flex items-center gap-2 px-3 py-2 border-b" style={{ borderColor: 'var(--kn-border)' }}>
        <div className="flex rounded-md overflow-hidden text-[10px] font-mono" style={{ border: '1px solid var(--kn-border)' }}>
          <span className="px-2 py-0.5 transition-colors duration-500" style={{ background: local ? 'var(--kn-accent)' : 'transparent', color: local ? '#fff' : 'var(--kn-text-ghost)' }}>Local</span>
          <span className="px-2 py-0.5 transition-colors duration-500" style={{ background: !local ? 'var(--kn-accent)' : 'transparent', color: !local ? '#fff' : 'var(--kn-text-ghost)' }}>Remote</span>
        </div>
        <span className="text-[10px] font-mono" style={{ color: 'var(--kn-text-muted)' }}>
          {local ? '~/projects/my-app' : 'OpenKnots/code-editor'}
        </span>
      </div>
      <div className="py-1">
        {localFiles.map((f, i) => (
          <div key={i} className="flex items-center gap-2 px-3 py-0.5 text-[11px] font-mono">
            <span style={{ color: 'var(--kn-text-muted)' }}>{f.name}</span>
            {f.status && <span className="ml-auto text-[9px] font-bold" style={{ color: f.color }}>{f.status}</span>}
          </div>
        ))}
      </div>
    </div>
  )
}

/* ─── Agent Chat Preview ─────────────────────────────────────── */
function AgentPreview() {
  const [msgs, setMsgs] = useState(1)
  useEffect(() => {
    const t = setInterval(() => setMsgs(m => m < 3 ? m + 1 : 1), 2800)
    return () => clearInterval(t)
  }, [])

  const messages = [
    { role: 'user', text: '/edit Add error handling to the fetch call' },
    { role: 'agent', text: 'I\'ll wrap the fetch in try/catch with proper error types. Here\'s the change:' },
    { role: 'action', text: '[Apply to api/handler.ts]   [Diff]' },
  ]

  return (
    <div className="kn-widget-agent">
      <div className="flex items-center gap-1.5 px-3 py-1.5 border-b" style={{ borderColor: 'var(--kn-border)' }}>
        <div className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--kn-success, #34d399)' }} />
        <span className="text-[10px] font-mono" style={{ color: 'var(--kn-text-muted)' }}>agent:code-editor</span>
        <span className="text-[9px] font-mono ml-auto" style={{ color: 'var(--kn-text-ghost)' }}>connected</span>
      </div>
      <div className="p-3 space-y-2">
        {messages.slice(0, msgs).map((m, i) => (
          <div key={i} className={`flex gap-2 ${m.role === 'action' ? '' : ''}`} style={{ opacity: i < msgs ? 1 : 0, transition: 'opacity 0.5s ease' }}>
            {m.role === 'user' && <span className="text-[10px] shrink-0 pt-0.5" style={{ color: 'var(--kn-accent)' }}>you</span>}
            {m.role === 'agent' && <span className="text-[10px] shrink-0 pt-0.5" style={{ color: 'var(--kn-success, #34d399)' }}>ai</span>}
            {m.role === 'action' ? (
              <div className="flex gap-1.5">
                <span className="text-[10px] font-mono px-2 py-0.5 rounded" style={{ background: 'rgba(52,211,153,0.1)', color: 'var(--kn-success, #34d399)', border: '1px solid rgba(52,211,153,0.2)' }}>Apply to api/handler.ts</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded" style={{ color: 'var(--kn-text-muted)', border: '1px solid var(--kn-border)' }}>Diff</span>
              </div>
            ) : (
              <span className="text-[11px] font-mono" style={{ color: m.role === 'user' ? 'var(--kn-text-secondary)' : 'var(--kn-text-muted)' }}>{m.text}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

/* ─── Integration Steps ──────────────────────────────────────── */
function IntegrationSteps() {
  const [step, setStep] = useState(0)
  const steps = [
    { label: 'Connect', desc: 'Enter your OpenClaw gateway URL', icon: 'lucide:plug' },
    { label: 'Open', desc: 'Open a local folder or pick a GitHub repo', icon: 'lucide:folder-open' },
    { label: 'Code', desc: 'Edit with AI completions, review with diff', icon: 'lucide:code' },
  ]
  useEffect(() => { const t = setInterval(() => setStep(s => (s + 1) % 3), 2500); return () => clearInterval(t) }, [])
  return (
    <div className="flex flex-col gap-2.5">
      {steps.map((s, i) => (
        <div key={i} className="flex items-center gap-3 p-3 rounded-lg transition-all duration-500 cursor-pointer"
          style={{ background: step === i ? 'var(--kn-card-bg)' : 'transparent', border: `1px solid ${step === i ? 'var(--kn-border-hover)' : 'var(--kn-border)'}`, transform: step === i ? 'translateX(4px)' : 'none' }}
          onClick={() => setStep(i)}
        >
          <div className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-medium shrink-0 transition-all duration-500"
            style={{ background: step >= i ? 'var(--kn-ico-bg)' : 'var(--kn-card-bg)', color: step >= i ? 'var(--kn-text-muted)' : 'var(--kn-text-ghost)' }}>
            {step > i ? <Icon icon="lucide:check" width={14} height={14} style={{ color: 'var(--kn-success, #34d399)' }} /> : <Icon icon={s.icon} width={14} height={14} />}
          </div>
          <div>
            <div className="text-sm font-medium" style={{ color: step === i ? 'var(--kn-text-secondary)' : 'var(--kn-text-muted)' }}>{s.label}</div>
            <div className="text-xs" style={{ color: step === i ? 'var(--kn-text-muted)' : 'var(--kn-text-ghost)' }}>{s.desc}</div>
          </div>
        </div>
      ))}
    </div>
  )
}

/* ─── FAQ ─────────────────────────────────────────────────────── */
function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ borderBottom: '1px solid var(--kn-border)' }}>
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between py-5 px-1 text-left cursor-pointer group" style={{ background: 'transparent', border: 'none', color: 'var(--kn-text-secondary)', fontFamily: 'inherit' }}>
        <span className="text-sm font-medium pr-4 transition-colors group-hover:text-white">{q}</span>
        <Icon icon="lucide:chevron-down" width={14} height={14} className="shrink-0 transition-transform duration-300" style={{ transform: open ? 'rotate(180deg)' : 'rotate(0)', color: 'var(--kn-text-ghost)' }} />
      </button>
      <div className="overflow-hidden transition-all" style={{ maxHeight: open ? '300px' : '0', opacity: open ? 1 : 0, transitionDuration: '0.4s' }}>
        <p className="pb-5 px-1 text-sm leading-relaxed" style={{ color: 'var(--kn-text-muted)' }}>{a}</p>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   MAIN LANDING
   ═══════════════════════════════════════════════════════════════ */

export default function Landing({ onEnter }: { onEnter: () => void }) {
  const [navSolid, setNavSolid] = useState(false)
  useEffect(() => {
    const onScroll = () => setNavSolid(window.scrollY > 60)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <div className="kn-root">
      <ThreadField />
      <StarField />

      {/* ── Nav ──────────────────────────────────────────────────── */}
      <header style={{ position: 'sticky', top: 0, zIndex: 10, width: '100%', background: navSolid ? 'rgba(0,0,0,0.92)' : 'transparent', backdropFilter: navSolid ? 'blur(16px) saturate(120%)' : 'none', transition: 'background 0.3s ease' }}>
        <nav className="kn-nav-inner">
          <div className="kn-logo">
            <Icon icon="lucide:code" width={18} height={18} style={{ color: 'var(--kn-accent)' }} />
            Code Editor
          </div>
          <div className="kn-nav-links">
            <a href="https://github.com/OpenKnots/code-editor" target="_blank" rel="noopener noreferrer" className="kn-nav-link hidden sm:block">GitHub</a>
            <a href="https://docs.openclaw.ai" target="_blank" rel="noopener noreferrer" className="kn-nav-link hidden sm:block">Docs</a>
            <button onClick={onEnter} className="kn-nav-signin cursor-pointer">Open Editor</button>
          </div>
        </nav>
      </header>

      {/* ── Hero ─────────────────────────────────────────────────── */}
      <section className="kn-hero">
        <Reveal>
          <div className="kn-pill">
            <span className="kn-pill-badge">New</span>
            <span className="kn-pill-text">Gateway-powered coding with <span style={{ color: 'var(--kn-accent)', fontWeight: 500 }}>OpenClaw</span></span>
          </div>
        </Reveal>

        <Reveal delay={60}>
          <div style={{ width: 80, height: 80, marginBottom: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', filter: 'drop-shadow(0 0 40px rgba(167,139,250,0.2))' }}>
            <Icon icon="lucide:code" width={48} height={48} style={{ color: 'var(--kn-accent)' }} />
          </div>
        </Reveal>

        <Reveal delay={120}>
          <h1 className="kn-headline">Your Code.<br className="sm:hidden" /> Your Agent.<br className="sm:hidden" /> Your Machine.</h1>
        </Reveal>

        <Reveal delay={200}>
          <p className="kn-subhead">
            A gateway-powered code editor with an integrated AI agent that knows your codebase — edit local or remote files, get inline completions, review diffs, and commit — all from one surface.
          </p>
        </Reveal>

        <Reveal delay={280}>
          <div className="kn-actions">
            <button onClick={onEnter} className="kn-btn-primary cursor-pointer">Open Editor</button>
            <a href="https://github.com/OpenKnots/code-editor" target="_blank" rel="noopener noreferrer" className="kn-btn-ghost" style={{ textDecoration: 'none' }}>
              <Icon icon="lucide:github" width={16} height={16} />
              <span className="ml-1.5">Source Code</span>
            </a>
          </div>
        </Reveal>
      </section>

      {/* ── Stats ────────────────────────────────────────────────── */}
      <Reveal className="relative z-[1] max-w-screen-2xl mx-auto px-6 sm:px-8 mb-20 sm:mb-28">
        <div className="kn-stats grid grid-cols-2 sm:grid-cols-4 gap-6 sm:gap-8 py-7 px-6 sm:px-10 rounded-xl">
          <AnimatedCounter end={8} label="Themes" />
          <AnimatedCounter end={30} suffix="+" label="Slash Commands" />
          <AnimatedCounter end={0} label="Backend Servers" />
          <AnimatedCounter end={100} suffix="%" label="Your Data" />
        </div>
      </Reveal>

      {/* ── Divider ──────────────────────────────────────────────── */}
      <div className="kn-divider">
        <Icon icon="lucide:git-merge" width={20} height={20} style={{ color: 'var(--kn-accent)', opacity: 0.4 }} />
      </div>

      {/* ── Bento Grid — Features ────────────────────────────────── */}
      <section id="features" className="relative z-[1] max-w-screen-2xl mx-auto px-6 sm:px-8 mb-20 sm:mb-28">
        <Reveal className="text-center mb-12">
          <p className="text-xs font-medium uppercase tracking-[0.2em] mb-3" style={{ color: 'var(--kn-text-dim)' }}>Features</p>
          <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight max-w-screen-xl mx-auto" style={{ color: 'var(--kn-text-secondary)' }}>Everything in one surface.<br className="sm:hidden" /> No context switching.</h2>
          <p className="mt-3 text-sm max-w-screen-xl mx-auto" style={{ color: 'var(--kn-text-dim)' }}>An agent-native editor built on top of your OpenClaw gateway.</p>
        </Reveal>

        <div className="kn-bento">
          {/* Large — AI Agent + Editor */}
          <Reveal className="kn-bento-card kn-bento-lg col-span-1 sm:col-span-2 row-span-2">
            <div className="flex flex-col h-full">
              <div className="flex items-center gap-3 mb-4">
                <div className="kn-ico-wrap"><Icon icon="lucide:sparkles" width={20} height={20} style={{ color: 'var(--kn-text-muted)' }} /></div>
                <div>
                  <h3 className="text-sm font-semibold" style={{ color: 'var(--kn-text-secondary)' }}>AI-Powered Editor</h3>
                  <p className="text-xs" style={{ color: 'var(--kn-text-dim)' }}>Inline completions, diff review, and an agent that knows your code</p>
                </div>
              </div>
              <EditorPreview />
            </div>
          </Reveal>

          {/* Slash Commands */}
          <Reveal delay={80} className="kn-bento-card col-span-1 row-span-2">
            <div className="flex items-center gap-3 mb-3">
              <div className="kn-ico-wrap"><Icon icon="lucide:terminal" width={20} height={20} style={{ color: 'var(--kn-text-muted)' }} /></div>
              <div>
                <h3 className="text-sm font-semibold" style={{ color: 'var(--kn-text-secondary)' }}>Slash Commands</h3>
                <p className="text-xs" style={{ color: 'var(--kn-text-dim)' }}>Type / to do anything</p>
              </div>
            </div>
            <SlashCommandPreview />
          </Reveal>

          {/* Local + Remote */}
          <Reveal delay={80} className="kn-bento-card col-span-1">
            <div className="flex items-center gap-3 mb-3">
              <div className="kn-ico-wrap"><Icon icon="lucide:hard-drive" width={20} height={20} style={{ color: 'var(--kn-text-muted)' }} /></div>
              <h3 className="text-sm font-semibold" style={{ color: 'var(--kn-text-secondary)' }}>Local + Remote</h3>
            </div>
            <p className="text-xs leading-relaxed mb-3" style={{ color: 'var(--kn-text-dim)' }}>Toggle between local filesystem and GitHub. Desktop app reads and writes directly to disk — no API needed.</p>
            <ModeTogglePreview />
          </Reveal>

          {/* Agent Chat */}
          <Reveal delay={160} className="kn-bento-card col-span-1">
            <div className="flex items-center gap-3 mb-3">
              <div className="kn-ico-wrap"><Icon icon="lucide:message-circle" width={20} height={20} style={{ color: 'var(--kn-text-muted)' }} /></div>
              <h3 className="text-sm font-semibold" style={{ color: 'var(--kn-text-secondary)' }}>Agent Chat</h3>
            </div>
            <p className="text-xs leading-relaxed mb-3" style={{ color: 'var(--kn-text-dim)' }}>The agent proposes, you dispose. Every edit goes through diff review. Apply with one click or reject.</p>
            <AgentPreview />
          </Reveal>

          {/* Bottom 3 */}
          <Reveal delay={80} className="kn-bento-card col-span-1">
            <div className="kn-ico-wrap mb-3"><Icon icon="lucide:palette" width={20} height={20} style={{ color: 'var(--kn-text-muted)' }} /></div>
            <h3 className="text-sm font-semibold mb-1.5" style={{ color: 'var(--kn-text-secondary)' }}>8 Themes</h3>
            <p className="text-xs leading-relaxed" style={{ color: 'var(--kn-text-dim)' }}>Obsidian, Neon, Catppuccin, Bone, Caffeine, Claymorphism, Vercel, Vintage Paper. Light and dark variants for each.</p>
          </Reveal>

          <Reveal delay={160} className="kn-bento-card col-span-1">
            <div className="kn-ico-wrap mb-3"><Icon icon="lucide:monitor" width={20} height={20} style={{ color: 'var(--kn-text-muted)' }} /></div>
            <h3 className="text-sm font-semibold mb-1.5" style={{ color: 'var(--kn-text-secondary)' }}>Desktop App</h3>
            <p className="text-xs leading-relaxed" style={{ color: 'var(--kn-text-dim)' }}>Native macOS/Windows/Linux via Tauri. Integrated terminal, vibrancy effects, native menus. ~10MB binary.</p>
          </Reveal>

          <Reveal delay={240} className="kn-bento-card col-span-1">
            <div className="kn-ico-wrap mb-3"><Icon icon="lucide:shield" width={20} height={20} style={{ color: 'var(--kn-text-muted)' }} /></div>
            <h3 className="text-sm font-semibold mb-1.5" style={{ color: 'var(--kn-text-secondary)' }}>Zero-Backend</h3>
            <p className="text-xs leading-relaxed" style={{ color: 'var(--kn-text-dim)' }}>Your browser connects directly to your gateway. No proxy, no middleware — credentials never leave your device.</p>
          </Reveal>
        </div>
      </section>

      {/* ── Divider ──────────────────────────────────────────────── */}
      <div className="kn-divider">
        <Icon icon="lucide:git-merge" width={20} height={20} style={{ color: 'var(--kn-accent)', opacity: 0.4 }} />
      </div>

      {/* ── Integration ──────────────────────────────────────────── */}
      <section id="integration" className="relative z-[1] max-w-screen-2xl mx-auto px-6 sm:px-8 mb-20 sm:mb-28">
        <Reveal className="text-center mb-12">
          <p className="text-xs font-medium uppercase tracking-[0.2em] mb-3" style={{ color: 'var(--kn-accent)', opacity: 0.8 }}>Getting Started</p>
          <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight max-w-screen-xl mx-auto" style={{ color: 'var(--kn-text-secondary)' }}>Three steps. That&apos;s it.</h2>
          <p className="mt-3 text-sm max-w-screen-xl mx-auto" style={{ color: 'var(--kn-text-dim)' }}>Connect to your <span style={{ color: 'var(--kn-accent)', opacity: 0.7 }}>OpenClaw</span> gateway and start coding.</p>
        </Reveal>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <Reveal className="kn-card p-6 sm:p-7 rounded-xl">
            <div className="flex items-center gap-3 mb-5">
              <div className="kn-ico-wrap"><Icon icon="lucide:sparkles" width={20} height={20} style={{ color: 'var(--kn-text-muted)' }} /></div>
              <div>
                <h3 className="text-sm font-semibold" style={{ color: 'var(--kn-text-secondary)' }}>3-step setup</h3>
                <p className="text-xs" style={{ color: 'var(--kn-text-dim)' }}>From zero to coding with AI in under a minute</p>
              </div>
            </div>
            <IntegrationSteps />
          </Reveal>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              { icon: 'lucide:globe', title: 'Any Network', desc: 'Connect via Tailscale, LAN, or public URL. Works wherever your gateway runs.' },
              { icon: 'lucide:smartphone', title: 'Works Everywhere', desc: 'Web, desktop, or mobile. Installable PWA with offline support.' },
              { icon: 'lucide:lock', title: 'Privacy First', desc: 'All data stays on your device. No telemetry, no tracking, no cloud storage.' },
              { icon: 'lucide:zap', title: 'Any Model', desc: 'Use Claude, GPT, Gemini, or any model your OpenClaw gateway supports.' },
            ].map((f, i) => (
              <Reveal key={i} delay={i * 60} className="kn-card p-4 rounded-xl">
                <div className="kn-ico-wrap mb-2.5"><Icon icon={f.icon} width={20} height={20} style={{ color: 'var(--kn-text-muted)' }} /></div>
                <h4 className="text-sm font-medium mb-1" style={{ color: 'var(--kn-text-muted)' }}>{f.title}</h4>
                <p className="text-xs leading-relaxed" style={{ color: 'var(--kn-text-dim)' }}>{f.desc}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── FAQ ───────────────────────────────────────────────────── */}
      <section id="faq" className="relative z-[1] max-w-screen-2xl mx-auto px-6 sm:px-8 mb-20 sm:mb-28">
        <Reveal className="text-center mb-10">
          <p className="text-xs font-medium uppercase tracking-[0.2em] mb-3" style={{ color: 'var(--kn-text-dim)' }}>FAQ</p>
          <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight max-w-screen-xl mx-auto" style={{ color: 'var(--kn-text-secondary)' }}>Frequently Asked Questions</h2>
        </Reveal>
        <Reveal delay={80}>
          <div className="kn-card rounded-xl p-6 sm:p-7">
            <FAQItem q="What is Code Editor?" a="An open-source, gateway-powered code editor with an integrated AI agent. It connects to your OpenClaw gateway to give you inline completions, slash commands, diff review, and full agent chat — all inside a single editing surface." />
            <FAQItem q="Do I need an OpenClaw gateway?" a="For AI features (completions, agent chat, slash commands) — yes. For plain editing of local files on the desktop app, you can work without a gateway. The editor is fully functional for reading, writing, and git operations without AI." />
            <FAQItem q="What's the difference between Local and Remote mode?" a="Local mode reads and writes files directly on your filesystem via the Tauri desktop app. Remote mode uses the GitHub API to browse and edit repos in the browser. Both modes support AI features via your gateway." />
            <FAQItem q="Which AI models are supported?" a="Any model your OpenClaw gateway supports — Claude, GPT, Gemini, Llama, Mistral, and more. The editor doesn't care about the model; it sends requests to your gateway and streams the response." />
            <FAQItem q="How is this different from Cursor or Copilot?" a="You own the infrastructure. Your code never touches a third-party server — the gateway runs on your machine. Plus you get full agent chat (not just completions), slash commands for structured actions, and a desktop app under 10MB." />
            <FAQItem q="Is it free?" a="Completely. Open source, no accounts, no telemetry. You pay only for the AI models you use through your own API keys on your gateway." />
          </div>
        </Reveal>
      </section>

      {/* ── CTA ───────────────────────────────────────────────────── */}
      <section className="relative z-[1] max-w-screen-2xl mx-auto px-6 sm:px-8 mb-20 sm:mb-28">
        <Reveal>
          <div className="kn-cta-card rounded-xl p-10 sm:p-14 text-center">
            <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight max-w-screen-xl mx-auto mb-3" style={{ color: 'var(--kn-text-secondary)' }}>Your code. Your agent. Your rules.</h2>
            <p className="text-sm max-w-screen-xl mx-auto mb-7" style={{ color: 'var(--kn-text-muted)' }}>No accounts. No telemetry. Just a code editor that <span style={{ background: 'linear-gradient(90deg, var(--kn-accent), var(--kn-accent-bright, #C4B5FD))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>understands your codebase</span>.</p>
            <div className="kn-actions" style={{ justifyContent: 'center' }}>
              <button onClick={onEnter} className="kn-btn-primary cursor-pointer">Open Editor</button>
              <a href="https://github.com/OpenKnots/code-editor" target="_blank" rel="noopener noreferrer" className="kn-btn-ghost" style={{ textDecoration: 'none' }}>View Source</a>
            </div>
          </div>
        </Reveal>
      </section>

      {/* ── Footer ───────────────────────────────────────────────── */}
      <footer className="kn-footer">
        <div className="kn-footer-inner">
          <span className="kn-footer-mark">
            <Icon icon="lucide:code" width={14} height={14} style={{ color: 'var(--kn-accent)' }} />
            OpenKnot
          </span>
          <div className="kn-footer-links">
            <a href="https://github.com/OpenKnots/code-editor" target="_blank" rel="noopener noreferrer">GitHub</a>
            <a href="https://docs.openclaw.ai" target="_blank" rel="noopener noreferrer">Docs</a>
            <span>&copy; {new Date().getFullYear()}</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
