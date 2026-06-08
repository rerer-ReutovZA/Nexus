import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import { app, BrowserWindow, dialog, Menu, shell } from 'electron'
import windowStateKeeper from 'electron-window-state'
import { join } from 'path'
import icon from '../../resources/icon.png?asset'
import { registerIpcMainHandlers } from './utils/ipc'
import { init } from './utils/init'
import { getAppConfig, getAppConfigSync } from './config'
import { createTray, isTrayActive, refreshTray } from './resolve/tray'
import { createApplicationMenu } from './resolve/menu'
import { initShortcut } from './resolve/shortcut'
import { startTgws, stopTgws } from './core/tgws'
import { startZapret, stopZapret } from './core/zapret'
import { updateCommunityList } from './core/zapret-iplist'
import { appLog } from './utils/app-logger'
import { enableAutoRun, disableAutoRun } from './sys/autoRun'
import { isRunningAsAdmin } from './utils/elevation'
import { pluginManager } from './core/plugin-manager'
import { masterController } from './core/master-controller'

// Lock the userData / cache / log folder names.
app.setName(is.dev ? 'nexus-dev' : 'nexus')

export let mainWindow: BrowserWindow | null = null

/** Legacy re-export, kept minimal. */
export function showError(title: string, message: string): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('showError', title, message)
  } else {
    dialog.showErrorBox(title, message)
  }
}

/* Single-instance lock */
if (!app.requestSingleInstanceLock()) {
  app.quit()
}

// Surface unexpected errors to the Logs page instead of silent console spam.
process.on('uncaughtException', (err) => {
  appLog('error', `uncaughtException: ${err.stack || err.message}`)
})
process.on('unhandledRejection', (reason) => {
  const msg = reason instanceof Error ? (reason.stack || reason.message) : String(reason)
  appLog('error', `unhandledRejection: ${msg}`)
})

app.on('second-instance', () => showMainWindow())

const syncConfig = getAppConfigSync()
if (syncConfig.disableGPU) app.disableHardwareAcceleration()

const initPromise = init()

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.nexus.app')
  appLog('info', `Nexus started (v${app.getVersion()}, ${process.platform}-${process.arch})`)
  appLog('info', `userData path: ${app.getPath('userData')}`)

  if (process.platform === 'win32' && !is.dev && !(await isRunningAsAdmin())) {
    dialog.showErrorBox(
      'Nexus — Administrator rights required',
      'Nexus must be run as administrator for Zapret (WinDivert) and auto-launch to work.\n\n' +
        'Please restart Nexus with "Run as administrator".'
    )
    app.quit()
    return
  }

  try {
    await initPromise
    appLog('info', 'Initialization completed')
  } catch (e) {
    appLog('error', `Initialization failed: ${e}`)
    dialog.showErrorBox('Nexus init failed', `${e}`)
    app.quit()
    return
  }

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  registerIpcMainHandlers()
  const appConfig = await getAppConfig()

  await pluginManager.init()
  await masterController.init() // START HIDDEN MONITORING

  if (appConfig.tgws?.autoStart) {
    appLog('info', 'Autostart Telegram WS — start')
    startTgws().catch((e) => {
      appLog('error', `Autostart Telegram WS failed: ${e}`)
      showError('TG WS start failed', `${e}`)
    })
  }
  if (appConfig.zapret?.autoStart) {
    appLog('info', 'Autostart Zapret — start')
    startZapret().catch((e) => {
      appLog('error', `Autostart Zapret failed: ${e}`)
      showError('Zapret start failed', `${e}`)
    })
  }

  if (appConfig.zapret?.autoUpdateList && appConfig.zapret?.listUpdateUrl) {
    appLog('info', 'Starting background IP list updates')
    // 12 hours interval for updates
    setInterval(() => {
      updateCommunityList(appConfig.zapret!.listUpdateUrl!)
        .then(() => appLog('info', 'IP list successfully updated in background'))
        .catch((e) => appLog('error', `IP list update error: ${e}`))
    }, 12 * 60 * 60 * 1000)
    // Also trigger one immediately on startup, without blocking
    updateCommunityList(appConfig.zapret.listUpdateUrl)
        .then(() => appLog('info', 'IP list (startup) successfully updated'))
        .catch((e) => appLog('error', `IP list (startup) update error: ${e}`))
  }

  // ---- Accelerator Background Sync ----
  if (appConfig.accelerator?.autoUpdateSub && appConfig.accelerator?.subscriptionUrl) {
    appLog('info', 'Starting background subscription updates')
    setInterval(async () => {
      try {
        const config = await getAppConfig()
        if (!config.accelerator?.autoUpdateSub || !config.accelerator?.subscriptionUrl) return
        
        appLog('info', `Syncing subscription: ${config.accelerator.subscriptionUrl}`)
        const res = await fetch(config.accelerator.subscriptionUrl)
        if (!res.ok) return
        let text = await res.text()
        if (!text.includes('://')) {
          try { text = Buffer.from(text, 'base64').toString('utf8') } catch { /* ignore */ }
        }
        const lines = text.split(/\r?\n/).filter(l => l.trim())
        const proxies = lines.map((line, i) => {
          try {
            const urlObj = new URL(line)
            return {
              id: Math.random().toString(36).slice(2),
              name: decodeURIComponent(urlObj.hash.slice(1)) || `Server ${i+1}`,
              type: urlObj.protocol.replace(':', '').toUpperCase(),
              address: urlObj.hostname,
              port: parseInt(urlObj.port),
              uuid: urlObj.username,
              sni: urlObj.searchParams.get('sni') || '',
              full: line
            }
          } catch { return null }
        }).filter(Boolean)

        if (proxies.length > 0) {
          await patchAppConfig({ accelerator: { ...config.accelerator, proxies } })
          appLog('info', `Subscription synced (${proxies.length} proxies)`)
        }
      } catch (e) { appLog('error', `Sub sync error: ${e}`) }
    }, 60 * 60 * 1000) // 1 hour
  }

  // Synchronise Windows auto-launch with the saved config — keeps the toggle
  // in settings honest if the user manually edited startup outside the app.
  try {
    if (appConfig.autoLaunch) await enableAutoRun()
    else await disableAutoRun()
  } catch (e) {
    appLog('warn', `autoLaunch sync failed: ${e}`)
  }

  await createWindow(appConfig)

  const uiTasks: Promise<unknown>[] = [initShortcut()]
  if (!appConfig.disableTray) uiTasks.push(createTray())
  await Promise.all(uiTasks)

  app.on('activate', () => {
    showMainWindow()
  })
})

app.on('window-all-closed', () => {
  app.quit()
})

let cleanupRan = false
let isQuitting = false

/**
 * Synchronous, fire-and-forget cleanup that runs when the app quits. Kills
 * every child process Nexus ever spawned and unloads the WinDivert kernel
 * driver from memory so its `.sys` file is no longer locked on disk.
 */
function syncKillChildren(): void {
  if (process.platform !== 'win32') return
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { spawnSync } = require('child_process') as typeof import('child_process')
    const opts = { windowsHide: true, timeout: 2000 } as const

    // 1) Kill known Nexus child binaries by image name. /T tears down the
    //    whole process tree, so cfproxy worker pools spawned by TgWsProxy
    //    and winws.exe sub-children are caught too.
    spawnSync('taskkill.exe', ['/F', '/IM', 'TgWsProxy_windows.exe', '/T'], opts)
    spawnSync('taskkill.exe', ['/F', '/IM', 'winws.exe', '/T'], opts)

    // 2) Stop the WinDivert kernel driver — unloads it from memory so the
    //    `.sys` file is no longer locked on disk. We DO NOT delete the
    //    service registration (see function-level comment for the rationale).
    for (const svc of ['WinDivert', 'windivert', 'WinDivert64', 'windivert64']) {
      spawnSync('sc.exe', ['stop', svc], opts)
    }
  } catch { /* noop */ }
}

async function cleanupServices(): Promise<void> {
  if (cleanupRan) return
  cleanupRan = true
  await Promise.race([
    Promise.all([stopTgws(), stopZapret()]).catch(() => void 0),
    new Promise<void>((r) => setTimeout(r, 3000))
  ])
  syncKillChildren()
}

app.on('before-quit', async (e) => {
  // Tell `mainWindow.on('close')` that this is a real quit — it must NOT
  // intercept the close to hide-to-tray.
  isQuitting = true
  if (cleanupRan) return
  appLog('info', 'Exiting application, stopping all services...')
  // Hold the quit until child processes are actually dead, so Telegram
  // immediately loses its proxy.
  e.preventDefault()
  await cleanupServices()
  app.exit(0)
})

// Last-resort synchronous kill: if Electron is force-killed (cmd window
// closed, Task Manager, system shutdown), `before-quit` may not run. Issue
// a blocking `taskkill /F /IM ... /T` so the proxy never outlives Nexus.
process.on('exit', () => syncKillChildren())
process.on('SIGINT', () => { syncKillChildren(); process.exit(0) })
process.on('SIGTERM', () => { syncKillChildren(); process.exit(0) })

export async function createWindow(appConfig?: AppConfig): Promise<void> {
  const config = appConfig ?? (await getAppConfig())
  const { silentStart = false } = config

  const mainWindowState = windowStateKeeper({
    defaultWidth: 1000,
    defaultHeight: 720,
    file: 'window-state.json'
  })

  if (process.platform === 'darwin') {
    await createApplicationMenu()
  } else {
    Menu.setApplicationMenu(null)
  }

  // Compute initial skipTaskbar based on the user's hideTaskbarIcon +
  // tray-enabled combination. Hiding from the taskbar without a tray icon
  // is never allowed — the recovery path would vanish.
  const initialSkipTaskbar = !!config.hideTaskbarIcon && !config.disableTray

  const useVibrancy = !!config.enableVibrancy && process.platform === 'win32'

  mainWindow = new BrowserWindow({
    minWidth: 860,
    minHeight: 600,
    width: mainWindowState.width,
    height: mainWindowState.height,
    x: mainWindowState.x,
    y: mainWindowState.y,
    show: false,
    transparent: useVibrancy,
    backgroundColor: useVibrancy ? '#00000000' : undefined,
    // Nexus ships with a custom in-app titlebar (see WindowControls), so
    // the native OS frame is always disabled — there is no user-facing
    // option to re-enable it.
    frame: false,
    fullscreenable: false,
    titleBarStyle: 'hidden',
    autoHideMenuBar: true,
    skipTaskbar: initialSkipTaskbar,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      spellcheck: false,
      sandbox: false
    }
  })

  if (useVibrancy) {
    // 'mica', 'acrylic', 'tabbed' are supported on Win 11
    mainWindow.setBackgroundMaterial('mica')
  }

  mainWindowState.manage(mainWindow)

  mainWindow.on('ready-to-show', () => {
    // Only honour silentStart when the tray icon is enabled — otherwise the
    // window would be invisible AND there'd be no tray icon to bring it back,
    // which is exactly the "app launches into nothing" bug we hit before.
    if (silentStart && !config.disableTray) return
    mainWindow?.show()
    mainWindow?.focus()
  })

  mainWindow.on('close', (e) => {
    if (isQuitting) return
    const cfg = getAppConfigSync()
    const trayOn = !cfg.disableTray
    const hideTaskbarOn = !!cfg.hideTaskbarIcon

    if (trayOn && isTrayActive()) {
      e.preventDefault()
      if (hideTaskbarOn) {
        appLog('info', 'Window hidden to tray (таскбар отключён)')
        mainWindow?.setSkipTaskbar(true)
        mainWindow?.hide()
      } else {
        appLog('info', 'Window minimized (доступно в панели задач и в трее)')
        mainWindow?.setSkipTaskbar(false)
        mainWindow?.minimize()
      }
      return
    }

    // Tray off (or tray creation failed) → real close → before-quit cleanup.
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  const onWindowVisibilityChange = (kind: string): void => {
    refreshTray().catch(() => void 0)
    try {
      mainWindow?.webContents.send('window:visibility', kind)
    } catch {
      /* noop */
    }
  }
  mainWindow.on('show', () => onWindowVisibilityChange('show'))
  mainWindow.on('hide', () => onWindowVisibilityChange('hide'))
  mainWindow.on('minimize', () => onWindowVisibilityChange('minimize'))
  mainWindow.on('restore', () => onWindowVisibilityChange('restore'))
  mainWindow.on('focus', () => onWindowVisibilityChange('focus'))
  mainWindow.on('blur', () => onWindowVisibilityChange('blur'))

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

export async function showMainWindow(): Promise<void> {
  if (!mainWindow) await createWindow()
  const w = mainWindow as BrowserWindow | null
  if (!w) return
  if (w.isMinimized()) w.restore()
  // Restore skipTaskbar according to the CURRENT hideTaskbarIcon setting.
  const cfg = getAppConfigSync()
  const shouldSkip = !!cfg.hideTaskbarIcon && !cfg.disableTray
  w.setSkipTaskbar(shouldSkip)
  w.show()
  w.focus()
}

export function closeMainWindow(): void {
  mainWindow?.close()
}

export async function triggerMainWindow(): Promise<void> {
  if (mainWindow && mainWindow.isVisible()) {
    mainWindow.hide()
  } else {
    await showMainWindow()
  }
}