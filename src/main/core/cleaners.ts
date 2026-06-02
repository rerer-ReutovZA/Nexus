import { rmSync, existsSync } from 'node:fs'
import path from 'node:path'

export async function cleanDiscordCache(): Promise<boolean> {
  const roaming = process.env.APPDATA
  if (!roaming) return false

  const cacheDirs = [
    path.join(roaming, 'discord', 'Cache'),
    path.join(roaming, 'discord', 'Code Cache'),
    path.join(roaming, 'discord', 'GPUCache')
  ]

  let cleaned = false
  for (const dir of cacheDirs) {
    if (existsSync(dir)) {
      try {
        rmSync(dir, { recursive: true, force: true })
        cleaned = true
      } catch (e) {
        console.error(`[cleanDiscordCache] failed to remove ${dir}:`, e)
      }
    }
  }

  return cleaned
}
