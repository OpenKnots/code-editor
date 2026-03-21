#!/usr/bin/env node
/**
 * Release helper — bumps version, commits, tags, and optionally pushes.
 *
 * Usage:
 *   pnpm release <version> [--push]
 *
 * Examples:
 *   pnpm release 1.0.0          # bump + tag locally
 *   pnpm release 1.2.0 --push   # bump + tag + push (triggers CI release)
 */

import { execSync } from 'child_process'
import { readFileSync, writeFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const version = args.find(a => /^\d+\.\d+\.\d+(\S+)?$/.test(a))

if (!version) {
  console.error('Usage: pnpm release <version>  e.g. pnpm release 1.0.0 --push')
  process.exit(1)
}

const shouldPush = args.includes('--push') || args.includes('-p')

// ── Verify working tree is clean ───────────────────────────────────────────
try {
  const status = execSync('git status --porcelain', { cwd: root }).toString().trim()
  if (status) {
    console.error('Working tree is dirty — commit or stash your changes first.')
    process.exit(1)
  }
} catch {
  console.error('Git not available or not a git repo.')
  process.exit(1)
}

// ── Bump package.json ──────────────────────────────────────────────────────
const pkgPath = resolve(root, 'package.json')
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
const prev = pkg.version
pkg.version = version
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n')
console.log(`  package.json        ${prev} → ${version}`)

// ── Bump src-tauri/tauri.conf.json ────────────────────────────────────────
const tauriConfPath = resolve(root, 'src-tauri/tauri.conf.json')
const tauriConf = JSON.parse(readFileSync(tauriConfPath, 'utf8'))
tauriConf.version = version
writeFileSync(tauriConfPath, JSON.stringify(tauriConf, null, 2) + '\n')
console.log(`  tauri.conf.json     → ${version}`)

// ── Bump src-tauri/Cargo.toml ─────────────────────────────────────────────
const cargoTomlPath = resolve(root, 'src-tauri/Cargo.toml')
const cargoTomlPrev = readFileSync(cargoTomlPath, 'utf8')
const cargoTomlNext = cargoTomlPrev.replace(/^(version\s*=\s*")[^"]+("\s*)$/m, `$1${version}$2`)
if (cargoTomlNext !== cargoTomlPrev) {
  writeFileSync(cargoTomlPath, cargoTomlNext)
  console.log(`  Cargo.toml          → ${version}`)
}

// ── Commit & tag ──────────────────────────────────────────────────────────
const tag = `v${version}`
execSync('git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml', { stdio: 'inherit', cwd: root })
execSync(`git commit -m "chore: release ${tag}"`, { stdio: 'inherit', cwd: root })
execSync(`git tag ${tag}`, { stdio: 'inherit', cwd: root })
console.log(`\n  Tagged ${tag}`)

// ── Push ──────────────────────────────────────────────────────────────────
if (shouldPush) {
  execSync('git push origin HEAD --tags', { stdio: 'inherit', cwd: root })
  console.log(`  Pushed to origin — the GitHub Actions release workflow will start shortly.\n`)
  console.log(`  Monitor at: https://github.com/OpenKnots/code-editor/actions\n`)
} else {
  console.log(`\n  Run the following to trigger the release workflow:\n`)
  console.log(`    git push origin HEAD --tags\n`)
}
