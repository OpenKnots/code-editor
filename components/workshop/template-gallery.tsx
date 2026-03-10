'use client'

import { motion } from 'framer-motion'
import { Icon } from '@iconify/react'

interface Template {
  id: string
  name: string
  description: string
  icon: string
  color: string
}

const TEMPLATES: Template[] = [
  {
    id: 'code-reviewer',
    name: 'Code Reviewer',
    description: 'Thorough code review agent',
    icon: 'lucide:scan-eye',
    color: 'blue',
  },
  {
    id: 'pr-agent',
    name: 'PR Agent',
    description: 'Automated PR creation and review',
    icon: 'lucide:git-pull-request',
    color: 'purple',
  },
  {
    id: 'devops-bot',
    name: 'DevOps Bot',
    description: 'CI/CD, deployment, infrastructure',
    icon: 'lucide:server',
    color: 'green',
  },
  {
    id: 'doc-writer',
    name: 'Doc Writer',
    description: 'Generate and maintain documentation',
    icon: 'lucide:file-text',
    color: 'amber',
  },
  {
    id: 'test-engineer',
    name: 'Test Engineer',
    description: 'Write and maintain test suites',
    icon: 'lucide:flask-conical',
    color: 'red',
  },
  {
    id: 'security-auditor',
    name: 'Security Auditor',
    description: 'Find vulnerabilities and suggest fixes',
    icon: 'lucide:shield',
    color: 'orange',
  },
  {
    id: 'refactoring-expert',
    name: 'Refactoring Expert',
    description: 'Improve code structure and patterns',
    icon: 'lucide:refresh-cw',
    color: 'teal',
  },
  {
    id: 'api-designer',
    name: 'API Designer',
    description: 'Design RESTful and GraphQL APIs',
    icon: 'lucide:globe',
    color: 'indigo',
  },
  {
    id: 'blank-canvas',
    name: 'Blank Canvas',
    description: 'Start from scratch',
    icon: 'lucide:plus',
    color: 'gray',
  },
  {
    id: 'data-engineer',
    name: 'Data Engineer',
    description: 'ETL pipelines and data modeling',
    icon: 'lucide:database',
    color: 'cyan',
  },
  {
    id: 'frontend-specialist',
    name: 'Frontend Specialist',
    description: 'React, CSS, accessibility',
    icon: 'lucide:layout',
    color: 'pink',
  },
  {
    id: 'cli-builder',
    name: 'CLI Builder',
    description: 'Command-line tools and scripts',
    icon: 'lucide:terminal',
    color: 'emerald',
  },
]

const COLOR_MAP: Record<string, { bg: string; text: string; border: string }> = {
  blue: {
    bg: 'bg-blue-500/10',
    text: 'text-blue-500',
    border: 'border-blue-500/20',
  },
  purple: {
    bg: 'bg-purple-500/10',
    text: 'text-purple-500',
    border: 'border-purple-500/20',
  },
  green: {
    bg: 'bg-green-500/10',
    text: 'text-green-500',
    border: 'border-green-500/20',
  },
  amber: {
    bg: 'bg-amber-500/10',
    text: 'text-amber-500',
    border: 'border-amber-500/20',
  },
  red: {
    bg: 'bg-red-500/10',
    text: 'text-red-500',
    border: 'border-red-500/20',
  },
  orange: {
    bg: 'bg-orange-500/10',
    text: 'text-orange-500',
    border: 'border-orange-500/20',
  },
  teal: {
    bg: 'bg-teal-500/10',
    text: 'text-teal-500',
    border: 'border-teal-500/20',
  },
  indigo: {
    bg: 'bg-indigo-500/10',
    text: 'text-indigo-500',
    border: 'border-indigo-500/20',
  },
  gray: {
    bg: 'bg-[var(--text-primary)]/10',
    text: 'text-[var(--text-secondary)]',
    border: 'border-[var(--border)]',
  },
  cyan: {
    bg: 'bg-cyan-500/10',
    text: 'text-cyan-500',
    border: 'border-cyan-500/20',
  },
  pink: {
    bg: 'bg-pink-500/10',
    text: 'text-pink-500',
    border: 'border-pink-500/20',
  },
  emerald: {
    bg: 'bg-emerald-500/10',
    text: 'text-emerald-500',
    border: 'border-emerald-500/20',
  },
}

interface TemplateGalleryProps {
  onSelectTemplate: (templateId: string) => void
}

export function TemplateGallery({ onSelectTemplate }: TemplateGalleryProps) {
  return (
    <div className="h-full w-full min-h-0 min-w-0 overflow-x-hidden overflow-y-auto bg-[var(--sidebar-bg)]">
      <div className="mx-auto flex w-full min-w-0 max-w-7xl flex-col gap-8 px-4 py-8 lg:px-6 2xl:px-8">
        {/* Hero Section */}
        <div className="text-center">
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center justify-center w-16 h-16 mb-4 rounded-3xl bg-[var(--brand)]/10 border border-[var(--brand)]/20"
          >
            <Icon icon="lucide:hammer" width={32} height={32} className="text-[var(--brand)]" />
          </motion.div>
          <motion.h1
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="text-4xl font-bold text-[var(--text-primary)] tracking-tight"
          >
            Agent Workshop
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="mt-3 text-lg text-[var(--text-secondary)] max-w-2xl mx-auto"
          >
            Build your perfect coding agent
          </motion.p>
        </div>

        {/* Template Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {TEMPLATES.map((template, index) => {
            const colors = COLOR_MAP[template.color] ?? COLOR_MAP.gray
            return (
              <motion.div
                key={template.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: index * 0.05 }}
                whileHover={{ scale: 1.02 }}
                className="group"
              >
                <div
                  className={`h-full rounded-3xl border ${colors.border} bg-[var(--bg-elevated)] p-6 transition-all hover:border-[var(--brand)]/40 hover:shadow-lg cursor-pointer`}
                  onClick={() => onSelectTemplate(template.id)}
                >
                  <div className="flex flex-col gap-4 h-full">
                    <div className={`flex items-center justify-center w-14 h-14 rounded-2xl ${colors.bg} border ${colors.border}`}>
                      <Icon icon={template.icon} width={24} height={24} className={colors.text} />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-2">
                        {template.name}
                      </h3>
                      <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
                        {template.description}
                      </p>
                    </div>
                    <button
                      className="w-full py-2.5 px-4 rounded-xl border border-[var(--border)] bg-[var(--bg)] text-sm font-medium text-[var(--text-primary)] transition-all hover:border-[var(--brand)] hover:bg-[var(--brand)]/5 group-hover:border-[var(--brand)]"
                      onClick={(e) => {
                        e.stopPropagation()
                        onSelectTemplate(template.id)
                      }}
                    >
                      Use Template
                    </button>
                  </div>
                </div>
              </motion.div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
