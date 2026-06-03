export interface PluginManifest {
  id: string
  name: string
  version: string
  description: string
  author: string
  entry: string // JS file path
}

export interface NexusPlugin {
  manifest: PluginManifest
  enabled: boolean
}

/**
 * Context provided to plugins.
 * Gives access to Nexus internals safely.
 */
export interface PluginContext {
  log: (msg: string) => void
  on: (event: string, callback: (...args: any[]) => void) => void
  emit: (event: string, ...args: any[]) => void
  getAppConfig: () => any
  patchAppConfig: (patch: any) => Promise<void>
  getZapretStatus: () => any
  getTgwsStatus: () => any
  listStrategies: () => any[]
  startZapret: () => Promise<void>
  stopZapret: () => Promise<void>
  startTgws: () => Promise<void>
  stopTgws: () => Promise<void>
  startSingbox: () => Promise<void>
  stopSingbox: () => Promise<void>
  DiscordRPC: any
  // System actions
  readHosts: () => Promise<string>
  writeHosts: (content: string) => Promise<void>
}
