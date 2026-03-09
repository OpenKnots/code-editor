#!/usr/bin/env node

import { spawn } from 'node:child_process'
import { networkInterfaces } from 'node:os'

function isPrivateIpv4(address) {
  return (
    address.startsWith('10.') ||
    address.startsWith('192.168.') ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(address)
  )
}

function pickLanIp() {
  const nets = networkInterfaces()

  for (const netIf of Object.values(nets)) {
    for (const net of netIf ?? []) {
      if (net.family !== 'IPv4' || net.internal) continue
      if (isPrivateIpv4(net.address)) return net.address
    }
  }

  return null
}

const lanIp = process.env.TAURI_IOS_DEV_HOST || pickLanIp()
const extraArgs = process.argv.slice(2)
const args = ['exec', 'tauri', 'ios', 'dev']

if (lanIp) {
  args.push('--host', lanIp)
  console.log(`Using iOS dev host ${lanIp}`)
} else {
  console.warn('No private LAN IP detected, falling back to default Tauri iOS host behavior')
}

args.push(...extraArgs)

const child = spawn('pnpm', args, {
  stdio: 'inherit',
  env: process.env,
  shell: process.platform === 'win32',
})

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }

  process.exit(code ?? 1)
})
