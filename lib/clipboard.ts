import { writeText } from '@tauri-apps/plugin-clipboard-manager'

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await writeText(text)
    return true
  } catch {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      return false
    }
  }
}
