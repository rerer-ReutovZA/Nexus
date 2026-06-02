import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { spawn } from 'child_process'
import path from 'path'
import { app } from 'electron'
import { dataDir } from '../utils/dirs'
import { getAppConfig, patchAppConfig } from '../config'
import { loadUpdateCache, saveUpdateCache } from '../utils/update-cache'
import { mainWindow } from '../index'

const REPO = 'rerer-ReutovZA/Nexus'
const RELEASES_LATEST_URL = `https://api.github.com/repos/${REPO}/releases/latest`
const REQUEST_HEADERS: Record<string, string> = {
  'User-Agent': 'Nexus-Updater',
  Accept: 'application/vnd.github+json'
}

export const UPGRADE_MARKER_NAME = '.nexus-upgrade'

export interface AppUpdateInfo {
  installed: string
  latest?: string
  hasUpdate: boolean
  tag?: string
  assetName?: string
  assetUrl?: string
  assetSize?: number
  releaseUrl?: string
  releaseNotes?: string
  publishedAt?: string
  dismissed?: boolean
}

interface GhAsset {
  name: string
  browser_download_url: string
  size: number
}
interface GhRelease {
  tag_name?: string
  name?: string
  html_url?: string
  published_at?: string
  body?: string
  draft?: boolean
  prerelease?: boolean
  assets?: GhAsset[]
}

let cache: { at: number; data: AppUpdateInfo } | null = null
let cacheHydrated = false
const CACHE_TTL_MS = 6 * 60 * 60 * 1000
const CACHE_NAME = 'app'

function hydrateCacheFromDisk(): void {
  if (cacheHydrated) return
  cacheHydrated = true
  const persisted = loadUpdateCache<AppUpdateInfo>(CACHE_NAME)
  if (persisted) cache = persisted
}

let refreshInflight = false
function backgroundRefresh(): void {
  if (refreshInflight) return
  refreshInflight = true
  checkAppUpdate(true)
    .catch(() => void 0)
    .finally(() => {
      refreshInflight = false
    })
}

function parseVersion(v?: string): string | null {
  if (!v) return null
  const m = v.match(/(\d+\.\d+\.\d+)/)
  return m ? m[1] : null
}

function compareVersion(a: string, b: string): number {
  const norm = (v: string): number[] =>
    v
      .split(/[.\-+]/)
      .map((p) => parseInt(p, 10))
      .filter((n) => !isNaN(n))
  const aa = norm(a)
  const bb = norm(b)
  const len = Math.max(aa.length, bb.length)
  for (let i = 0; i < len; i++) {
    const av = aa[i] ?? 0
    const bv = bb[i] ?? 0
    if (av > bv) return 1
    if (av < bv) return -1
  }
  return 0
}

export async function checkAppUpdate(force = false): Promise<AppUpdateInfo> {
  hydrateCacheFromDisk()
  const installed = app.getVersion()
  const cfg = await getAppConfig()
  const dismissedTag = cfg.dismissedAppUpdateTag

  if (!force && cache && Date.now() - cache.at < CACHE_TTL_MS && cache.data.tag) {
    if (Date.now() - cache.at > 30 * 60 * 1000) backgroundRefresh()
    const cachedLatest = cache.data.latest
    return {
      ...cache.data,
      installed,
      hasUpdate: !!cachedLatest && compareVersion(cachedLatest, installed) > 0,
      dismissed: dismissedTag === cache.data.tag
    }
  }

  let release: GhRelease
  try {
    const res = await fetch(RELEASES_LATEST_URL, { headers: REQUEST_HEADERS })
    if (!res.ok) throw new Error(`GitHub API ${res.status}`)
    release = (await res.json()) as GhRelease
  } catch (e) {
    throw new Error(
      `Не удалось проверить обновления Nexus: ${e instanceof Error ? e.message : String(e)}`
    )
  }

  if (release.draft || release.prerelease) {
    const info: AppUpdateInfo = { installed, hasUpdate: false }
    cache = { at: Date.now(), data: info }
    saveUpdateCache(CACHE_NAME, info)
    return info
  }

  const tag = release.tag_name?.trim() || undefined
  const latest = parseVersion(tag) || parseVersion(release.name) || undefined

  const assets = release.assets ?? []
  const installerAsset =
    assets.find((a) => /^Nexus_x64\.exe$/i.test(a.name)) ??
    assets.find((a) => /^Nexus.*\.exe$/i.test(a.name) && !/portable/i.test(a.name))

  const hasUpdate = !!latest && compareVersion(latest, installed) > 0

  const info: AppUpdateInfo = {
    installed,
    latest,
    hasUpdate,
    tag,
    assetName: installerAsset?.name,
    assetUrl: installerAsset?.browser_download_url,
    assetSize: installerAsset?.size,
    releaseUrl: release.html_url,
    releaseNotes: release.body?.trim() || undefined,
    publishedAt: release.published_at,
    dismissed: !!tag && dismissedTag === tag
  }

  cache = { at: Date.now(), data: info }
  saveUpdateCache(CACHE_NAME, info)
  return info
}

export async function dismissAppUpdate(tag: string): Promise<void> {
  if (!tag) return
  await patchAppConfig({ dismissedAppUpdateTag: tag })
  if (cache && cache.data.tag === tag) cache.data.dismissed = true
}

// Path of the upgrade marker, written next to Nexus.exe so the OLD
// installer's customUnInstall macro can find it via $INSTDIR.
function upgradeMarkerPath(): string {
  const exeDir = path.dirname(process.execPath)
  return path.join(exeDir, UPGRADE_MARKER_NAME)
}

function writeUpgradeMarker(): void {
  try {
    const p = upgradeMarkerPath()
    const dir = path.dirname(p)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    writeFileSync(p, `nexus-upgrade ${Date.now()}\n`, 'utf8')
  } catch (e) {
    console.warn('[app-updater] write upgrade marker failed:', e)
  }
}

/**
 * Download the installer and launch it in silent mode, then quit Nexus
 * so NSIS can replace the on-disk files. The installer auto-relaunches the
 * new Nexus when it's done; the user perceives the upgrade as ~5–10 s
 * of "closed and reopened".
 */
export async function installAppUpdate(
  assetUrl: string,
  expectedVersion?: string
): Promise<{ scheduled: true }> {
  if (!assetUrl) throw new Error('Пустая ссылка на установщик')
  if (process.platform !== 'win32') {
    throw new Error('Авто-обновление поддерживается только на Windows')
  }

  const res = await fetch(assetUrl, {
    headers: { 'User-Agent': REQUEST_HEADERS['User-Agent'] }
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)

  const total = parseInt(res.headers.get('content-length') || '0', 10)
  const reader = res.body?.getReader()
  if (!reader) throw new Error('Не удалось начать загрузку')

  let loaded = 0
  const chunks: Uint8Array[] = []
  const startTime = Date.now()

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    loaded += value.length
    
    if (total > 0) {
      const percent = Math.round((loaded / total) * 100)
      const elapsed = (Date.now() - startTime) / 1000
      const speed = elapsed > 0 ? loaded / elapsed : 0 // bytes/s
      
      mainWindow?.webContents.send('app:updateProgress', {
        percent,
        loaded,
        total,
        speed
      })
    }
  }

  const buf = Buffer.concat(chunks)

  if (buf.length < 5 * 1024 * 1024) {
    throw new Error(`Загруженный файл слишком маленький (${buf.length} байт)`)
  }

  const dir = app.getPath('temp')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const installerPath = path.join(dir, `Nexus-update-${Date.now()}.exe`)
  writeFileSync(installerPath, buf)

  writeUpgradeMarker()

  if (expectedVersion) {
    try {
      await patchAppConfig({ dismissedAppUpdateTag: undefined })
    } catch {
      /* noop */
    }
  }

  const child = spawn(installerPath, ['/S', '--updated'], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true
  })
  child.on('error', (e) => console.error('[app-updater] installer spawn error:', e))
  const installerPid = child.pid
  child.unref()

  if (installerPid) {
    try {
      const exePath = process.execPath
      const exeDir = path.dirname(exePath)
      const currentPid = process.pid
      const ts = Date.now()
      const logPath = path.join(dir, `Nexus-relaunch-${ts}.log`)
      const watcherScript = [
        "$ErrorActionPreference = 'SilentlyContinue'",
        `$nexusPid = ${currentPid}`,
        `$installerPid = ${installerPid}`,
        `$exe = '${exePath.replace(/'/g, "''")}'`,
        `$exeDir = '${exeDir.replace(/'/g, "''")}'`,
        `$logPath = '${logPath.replace(/'/g, "''")}'`,
        'function Log($m) {',
        "  try { Add-Content -LiteralPath $logPath -Value \"$([DateTime]::Now.ToString('HH:mm:ss.fff')) $m\" } catch {}",
        '}',
        'Log \"watcher started, nexusPid=$nexusPid installerPid=$installerPid exe=$exe\"',
        // 1) Wait for THIS Nexus process to exit.
        'while (Get-Process -Id $nexusPid -ErrorAction SilentlyContinue) { Start-Sleep -Milliseconds 200 }',
        'Log \"Original Nexus process exited\"',
        // 2) Wait for the installer process to finish.
        '$deadline = (Get-Date).AddMinutes(5)',
        'while ((Get-Date) -lt $deadline) {',
        '  if (-not (Get-Process -Id $installerPid -ErrorAction SilentlyContinue)) { Log \"installer PID exited\"; break }',
        '  Start-Sleep -Milliseconds 500',
        '}',
        // 3) Grace period for cleanup / sub-processes.
        'Start-Sleep -Seconds 5',
        // 4) Wait until the new exe exists and is NOT locked by the installer/system.
        '$filePoll = (Get-Date).AddSeconds(90)',
        '$ready = $false',
        'while ((Get-Date) -lt $filePoll) {',
        '  if (Test-Path -LiteralPath $exe) {',
        '    try {',
        '      $fs = [IO.File]::Open($exe, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::None)',
        '      $fs.Close()',
        '      $ready = $true',
        '      Log \"File is ready and accessible\"',
        '      break',
        '    } catch {',
        '      Log \"File exists but is locked... waiting\"',
        '    }',
        '  }',
        '  Start-Sleep -Milliseconds 500',
        '}',
        'if (-not $ready) { Log \"exe missing or locked at $exe — giving up\"; exit 1 }',
        // 5) Launch using multiple methods for reliability.
        'Log \"Attempting launch...\"',
        'try {',
        '  Start-Process -FilePath $exe -WorkingDirectory $exeDir -WindowStyle Normal',
        '  Log \"Start-Process successful\"',
        '} catch {',
        '  Log \"Start-Process failed, trying cmd fallback: $_\"',
        '  cmd.exe /c \"start \"\" \"$exe\"\"',
        '}'
      ].join('\n')
      const watcherPath = path.join(dir, `Nexus-relaunch-${ts}.ps1`)
      writeFileSync(watcherPath, '\ufeff' + watcherScript, 'utf8')
      const watcher = spawn(
        'powershell.exe',
        [
          '-NoProfile',
          '-WindowStyle',
          'Hidden',
          '-ExecutionPolicy',
          'Bypass',
          '-File',
          watcherPath
        ],
        {
          detached: true,
          stdio: 'ignore',
          windowsHide: true
        }
      )
      watcher.on('error', (e) =>
        console.error('[app-updater] relaunch watcher spawn error:', e)
      )
      watcher.unref()
    } catch (e) {
      console.warn('[app-updater] relaunch watcher setup failed:', e)
    }
  }

  setTimeout(() => {
    try {
      app.quit()
    } catch {
      /* falling through */
    }
    setTimeout(() => process.exit(0), 1000)
  }, 800)

  return { scheduled: true }
}

export function silentBackgroundCheck(): void {
  checkAppUpdate(false).catch(() => void 0)
}

export function invalidateAppUpdateCache(): void {
  cache = null
}

void dataDir
