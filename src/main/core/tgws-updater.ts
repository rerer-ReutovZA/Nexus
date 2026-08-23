import { existsSync, renameSync } from 'fs'
import path from 'path'
import { spawn } from 'child_process'
import { tgwsRuntimeDir } from '../utils/dirs'
import { getAppConfig, patchAppConfig } from '../config'
import { loadUpdateCache, saveUpdateCache } from '../utils/update-cache'
import { startTgws, stopTgws, getTgwsStatus } from './tgws'

const REPO = 'Flowseal/tg-ws-proxy'
const RELEASES_LATEST_URL = `https://api.github.com/repos/${REPO}/releases/latest`
const REQUEST_HEADERS: Record<string, string> = {
  'User-Agent': 'Nexus-Updater',
  Accept: 'application/vnd.github+json'
}

const BUNDLED_TGWS_VERSION = '1.10.0'

export interface TgwsUpdateInfo {
  installed?: string
  latest?: string
  hasUpdate: boolean
  assetName?: string
  assetUrl?: string
  assetSize?: number
  releaseUrl?: string
  publishedAt?: string
  dismissed?: boolean
}

interface GhRelease {
  tag_name?: string
  name?: string
  html_url?: string
  published_at?: string
}

let cache: { at: number; data: TgwsUpdateInfo } | null = null
let cacheHydrated = false
const CACHE_TTL_MS = 12 * 60 * 60 * 1000
const CACHE_NAME = 'tgws-flowseal'

function hydrateCacheFromDisk(): void {
  if (cacheHydrated) return
  cacheHydrated = true
  const persisted = loadUpdateCache<TgwsUpdateInfo>(CACHE_NAME)
  if (persisted) cache = persisted
}

let refreshInflight = false
function backgroundRefresh(): void {
  if (refreshInflight) return
  refreshInflight = true
  checkTgwsUpdate(true)
    .catch(() => void 0)
    .finally(() => {
      refreshInflight = false
    })
}

// Effective installed version: explicit config value > bundled-build constant.
function effectiveInstalled(cfgInstalled?: string): string {
  return cfgInstalled && cfgInstalled.trim() ? cfgInstalled.trim() : BUNDLED_TGWS_VERSION
}

export async function checkTgwsUpdate(force = false): Promise<TgwsUpdateInfo> {
  hydrateCacheFromDisk()
  const cfg = await getAppConfig()
  const installed = effectiveInstalled(cfg.tgws?.installedVersion)

  if (!force && cache && Date.now() - cache.at < CACHE_TTL_MS && cache.data.latest) {
    if (Date.now() - cache.at > 60 * 60 * 1000) backgroundRefresh()
    return {
      ...cache.data,
      installed,
      hasUpdate: false,
      assetName: undefined,
      assetUrl: undefined,
      assetSize: undefined,
      dismissed: false
    }
  }

  let release: GhRelease
  try {
    const res = await fetch(RELEASES_LATEST_URL, { headers: REQUEST_HEADERS })
    if (!res.ok) throw new Error('GitHub API ' + res.status)
    release = (await res.json()) as GhRelease
  } catch (e) {
    throw new Error(
      'Не удалось проверить обновления TgWsProxy: ' + (e instanceof Error ? e.message : String(e))
    )
  }

  const latestRaw = release.tag_name ?? release.name ?? ''
  const latest = latestRaw.replace(/^v/i, '').trim() || undefined

  // Flowseal distributes its Windows build as a GUI tray application. Nexus
  // ships the same v1.10.0 proxy core as a console executable, so automatic
  // replacement with the upstream GUI would reintroduce a second tray icon.
  const info: TgwsUpdateInfo = {
    installed,
    latest,
    hasUpdate: false,
    releaseUrl: release.html_url,
    publishedAt: release.published_at,
    dismissed: false
  }

  cache = { at: Date.now(), data: info }
  saveUpdateCache(CACHE_NAME, info)
  return info
}
// Best-effort kill of any leftover TgWsProxy_windows.exe so we can overwrite
// the binary on Windows (where a running .exe holds an exclusive write lock).
async function killStaleTgwsBinary(): Promise<void> {
  if (process.platform !== 'win32') return
  await new Promise<void>((resolve) => {
    const p = spawn('taskkill.exe', ['/F', '/IM', 'TgWsProxy_windows.exe', '/T'], {
      windowsHide: true
    })
    p.on('exit', () => resolve())
    p.on('error', () => resolve())
  })
  // Give the OS a beat to release the file lock.
  await new Promise((r) => setTimeout(r, 300))
}

export async function installTgwsUpdate(
  _assetUrl: string,
  _expectedVersion?: string
): Promise<{
  installedVersion?: string
  sizeBytes: number
  restarted: boolean
  restartError?: string
}> {
  throw new Error(
    'Консольное ядро TgWsProxy обновляется вместе с Nexus. Официальный Windows-файл Flowseal — это отдельное tray-приложение и не устанавливается внутрь Nexus.'
  )
}
export async function restoreBundledTgws(): Promise<{ restarted: boolean; restartError?: string }> {
  const st = getTgwsStatus()
  if (st.state === 'running' || st.state === 'starting') {
    try {
      await stopTgws()
    } catch {
      /* best-effort */
    }
  }
  await killStaleTgwsBinary()

  const dir = tgwsRuntimeDir()
  const runtime = path.join(dir, 'TgWsProxy_windows.exe')
  if (existsSync(runtime)) {
    const cfg = await getAppConfig()
    const version = (cfg.tgws?.installedVersion ?? 'unknown').replace(/[^\w.-]/g, '_')
    renameSync(runtime, path.join(dir, `TgWsProxy_windows.disabled-${version}-${Date.now()}.exe`))
  }

  const cfg = await getAppConfig()
  await patchAppConfig({ tgws: { ...(cfg.tgws as TgwsConfig), installedVersion: undefined } })
  let restarted = false
  let restartError: string | undefined
  try {
    await startTgws()
    restarted = true
  } catch (e) {
    restartError = e instanceof Error ? e.message : String(e)
  }
  return { restarted, restartError }
}
export async function dismissTgwsUpdate(tag: string): Promise<void> {
  if (!tag) return
  const cfg = await getAppConfig()
  const next: TgwsConfig = {
    ...(cfg.tgws as TgwsConfig),
    dismissedUpdateTag: tag
  }
  await patchAppConfig({ tgws: next })
  if (cache) cache.data.dismissed = cache.data.latest === tag
}
