export interface PingResult {
  service: string
  status: 'ok' | 'error' | 'timeout'
  latencyMs?: number
}

const TARGETS = [
  { name: 'YouTube', url: 'https://www.youtube.com' },
  { name: 'Discord', url: 'https://discord.com' },
  { name: 'Telegram', url: 'https://web.telegram.org' },
  { name: 'Roblox', url: 'https://www.roblox.com' }
]

export async function pingServices(): Promise<PingResult[]> {
  const results = await Promise.all(
    TARGETS.map(async (t) => {
      const start = Date.now()
      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 3000)
        
        const res = await fetch(t.url, {
          method: 'HEAD',
          signal: controller.signal,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
          }
        })
        
        clearTimeout(timeoutId)
        
        const latency = Date.now() - start
        if (res.ok || res.status < 400 || res.status === 405) {
           return { service: t.name, status: 'ok', latencyMs: latency }
        }
        return { service: t.name, status: 'error' }
      } catch (e: any) {
        if (e.name === 'AbortError') {
          return { service: t.name, status: 'timeout' }
        }
        return { service: t.name, status: 'error' }
      }
    })
  )
  return results as PingResult[]
}
