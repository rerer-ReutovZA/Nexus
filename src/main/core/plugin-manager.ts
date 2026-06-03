import { existsSync, mkdirSync, readdirSync, readFileSync, copyFileSync } from 'fs'
import path from 'path'
import { dataDir, resourcesDir } from '../utils/dirs'
import { appLog } from '../utils/app-logger'
import { getAppConfig, patchAppConfig } from '../config'
import { getZapretStatus, startZapret, stopZapret, listStrategies } from './zapret'
import { getTgwsStatus, startTgws, stopTgws } from './tgws'
import { getSingboxStatus, startSingbox, stopSingbox } from './singbox'
import { PluginManifest, PluginContext } from '../../shared/types/plugins'
import { EventEmitter } from 'events'
import * as DiscordRPC from 'discord-rpc'
import { BrowserWindow } from 'electron'

class PluginManager extends EventEmitter {
  private pluginsDir: string
  private activePlugins: Map<string, any> = new Map()

  constructor() {
    super()
    this.pluginsDir = path.join(dataDir(), 'plugins')
    if (!existsSync(this.pluginsDir)) {
      mkdirSync(this.pluginsDir, { recursive: true })
    }
  }

  public async init(): Promise<void> {
    appLog('info', `[PluginManager] initializing from ${this.pluginsDir}`)
    await this.syncBuiltinPlugins()
    await this.reloadPlugins()
  }

  private async syncBuiltinPlugins(): Promise<void> {
    const builtinDir = path.join(resourcesDir(), 'builtin-plugins')
    if (!existsSync(builtinDir)) return

    appLog('info', `[PluginManager] syncing builtin plugins from ${builtinDir}`)
    
    try {
      const entries = readdirSync(builtinDir, { withFileTypes: true })
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const src = path.join(builtinDir, entry.name)
          const dest = path.join(this.pluginsDir, entry.name)
          
          if (!existsSync(dest)) {
            mkdirSync(dest, { recursive: true })
            const files = readdirSync(src)
            for (const f of files) {
              copyFileSync(path.join(src, f), path.join(dest, f))
            }
            appLog('info', `[PluginManager] copied builtin plugin: ${entry.name}`)
          }
        }
      }
    } catch (e) {
      appLog('error', `[PluginManager] sync failed: ${e}`)
    }
  }

  public async reloadPlugins(): Promise<void> {
    const config = await getAppConfig()
    const enabledIds = config.enabledPlugins || []

    appLog('info', `[PluginManager] scanning directory: ${this.pluginsDir}`)

    // Shutdown old
    for (const [id, plugin] of this.activePlugins) {
      if (plugin.onShutdown) {
        try { 
          await plugin.onShutdown() 
        } catch (e) { 
          appLog('error', `[PluginManager] shutdown error ${id}: ${e}`) 
        }
      }
    }
    this.activePlugins.clear()

    if (!existsSync(this.pluginsDir)) {
      appLog('warn', '[PluginManager] directory does not exist')
      return
    }

    const entries = readdirSync(this.pluginsDir, { withFileTypes: true })
    appLog('info', `[PluginManager] found ${entries.length} entries in plugins folder`)

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const manifestPath = path.join(this.pluginsDir, entry.name, 'manifest.json')
        if (existsSync(manifestPath)) {
          try {
            const raw = readFileSync(manifestPath)
            // Use TextDecoder to handle UTF-8 with or without BOM
            const decoder = new TextDecoder('utf-8')
            const content = decoder.decode(raw)
            const manifest: PluginManifest = JSON.parse(content)
            
            appLog('info', `[PluginManager] discovered ${manifest.id} (enabled: ${enabledIds.includes(manifest.id)})`)
            
            if (enabledIds.includes(manifest.id)) {
              await this.loadPlugin(manifest, path.join(this.pluginsDir, entry.name))
            }
          } catch (e) {
            appLog('error', `[PluginManager] failed to parse manifest for ${entry.name}: ${e}`)
          }
        } else {
          appLog('debug', `[PluginManager] skip ${entry.name}: manifest.json not found`)
        }
      }
    }
  }

  private async loadPlugin(manifest: PluginManifest, pluginPath: string): Promise<void> {
    const entryPath = path.join(pluginPath, manifest.entry)
    if (!existsSync(entryPath)) {
      appLog('error', `[PluginManager] entry not found: ${entryPath}`)
      return
    }

    try {
      // On Windows, absolute paths for dynamic imports must be valid file URLs.
      // Use pathToFileURL to handle this correctly across platforms.
      const { pathToFileURL } = await import('url')
      const moduleUrl = pathToFileURL(entryPath).href
      
      appLog('info', `[PluginManager] importing ${manifest.id} from ${moduleUrl}`)
      const pluginModule = await import(moduleUrl)
      
      const context: PluginContext = {
        log: (msg) => appLog('info', `[Plugin:${manifest.id}] ${msg}`),
        on: (event, cb) => this.on(event, cb),
        emit: (event, ...args) => {
          this.emit(event, ...args)
          // Automatically broadcast plugin events to all renderer windows
          for (const w of BrowserWindow.getAllWindows()) {
            if (!w.isDestroyed()) w.webContents.send(event, ...args)
          }
        },
        getAppConfig,
        patchAppConfig,
        getZapretStatus,
        getTgwsStatus,
        listStrategies,
        startZapret,
        stopZapret,
        startTgws,
        stopTgws,
        startSingbox,
        stopSingbox,
        DiscordRPC,
        readHosts: async () => {
          const p = 'C:\\Windows\\System32\\drivers\\etc\\hosts'
          const { readFile } = await import('fs/promises')
          if (!existsSync(p)) return ''
          return await readFile(p, 'utf8')
        },
        writeHosts: async (content: string) => {
          const p = 'C:\\Windows\\System32\\drivers\\etc\\hosts'
          const { writeFile } = await import('fs/promises')
          await writeFile(p, content, 'utf8')
        }
      }

      // Handle both default and named exports
      const initFn = pluginModule.init || pluginModule.default?.init
      
      if (initFn) {
        const instance = await initFn(context)
        this.activePlugins.set(manifest.id, instance || pluginModule)
        appLog('info', `[PluginManager] successfully loaded ${manifest.name} v${manifest.version}`)
      } else {
        appLog('error', `[PluginManager] plugin ${manifest.id} has no init() function`)
      }
    } catch (e) {
      appLog('error', `[PluginManager] error loading ${manifest.id}: ${e}`)
    }
  }

  public emitEvent(event: string, ...args: any[]): void {
    this.emit(event, ...args)
  }

  public async getAvailablePlugins(): Promise<any[]> {
    appLog('info', `[PluginManager] getAvailablePlugins called for ${this.pluginsDir}`)
    if (!existsSync(this.pluginsDir)) {
       appLog('warn', '[PluginManager] pluginsDir missing during getAvailablePlugins')
       return []
    }
    const results: any[] = []
    const config = await getAppConfig()
    const enabledIds = config.enabledPlugins || []

    const entries = readdirSync(this.pluginsDir, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const manifestPath = path.join(this.pluginsDir, entry.name, 'manifest.json')
        if (existsSync(manifestPath)) {
          try {
            const raw = readFileSync(manifestPath)
            const decoder = new TextDecoder('utf-8')
            const content = decoder.decode(raw)
            const manifest: PluginManifest = JSON.parse(content)
            results.push({
              manifest,
              enabled: enabledIds.includes(manifest.id)
            })
          } catch (e) { 
            appLog('error', `[PluginManager] failed to read manifest in ${entry.name}: ${e}`)
          }
        }
      }
    }
    appLog('info', `[PluginManager] returning ${results.length} plugins to UI`)
    return results
  }

  public getPluginsDir(): string {
    return this.pluginsDir
  }
}

export const pluginManager = new PluginManager()
