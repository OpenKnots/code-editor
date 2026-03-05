'use client'

import { SkillsInterface } from '@/components/skills/skills-interface'

export function SkillsView() {
  return (
    <div className="flex h-full w-full overflow-y-auto bg-[var(--sidebar-bg)]">
      <div className="mx-auto w-full max-w-7xl">
        <SkillsInterface variant="page" />
      </div>
    </div>
  )
}
