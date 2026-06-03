import { spawn, ChildProcess } from 'child_process'
import { existsSync, writeFileSync } from 'fs'
import path from 'path'
import { BrowserWindow } from 'electron'
import { singboxBinaryPath, dataDir } from '../utils/dirs'
import { getAppConfig } from '../config'
import { pluginManager } from './plugin-manager'

let child: ChildProcess | null = null
let status: CoreStatus & { traffic?: { up: number, down: number, totalUp: number, totalDown: number } } = { state: 'stopped' }
let trafficInterval: NodeJS.Timeout | null = null

function broadcast(channel: string, ...args: unknown[]): void {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send(channel, ...args)
  }
}

function log(type: ControllerLog['type'], payload: string): void {
  broadcast('log', {
    time: Date.now(),
    type,
    source: 'accelerator',
    payload
  } satisfies ControllerLog)
}

function setStatus(next: Partial<typeof status>): void {
  status = { ...status, ...next }
  broadcast('singbox:status', status)
  pluginManager.emitEvent('singbox:status', status)
}

export function getSingboxStatus(): CoreStatus {
  return status
}

async function fetchTraffic(): Promise<void> {
  try {
    // We use the experimental REST API of sing-box
    const res = await fetch('http://127.0.0.1:9090/traffic')
    if (!res.ok) return
    const data = await res.json() // { up: bytes/s, down: bytes/s }
    
    const current = status.traffic || { up: 0, down: 0, totalUp: 0, totalDown: 0 }
    setStatus({
      traffic: {
        up: data.up,
        down: data.down,
        totalUp: current.totalUp + data.up,
        totalDown: current.totalDown + data.down
      }
    })
  } catch (e) { /* silent */ }
}

export async function startSingbox(): Promise<void> {
  if (status.state === 'running' || status.state === 'starting') return

  const config = await getAppConfig()
  const s = config.accelerator
  if (!s) throw new Error('Accelerator configuration missing')

  const bin = singboxBinaryPath()
  if (!existsSync(bin)) {
    throw new Error('Ускоритель (singbox.exe) не найден в resources/singbox/')
  }

  setStatus({ state: 'starting', lastError: undefined, traffic: { up: 0, down: 0, totalUp: 0, totalDown: 0 } })
  log('info', 'Запуск ядра ускорителя...')

  try {
    const configPath = path.join(dataDir(), 'accelerator-config.json')
    const selectedProxy = (s.proxies || []).find(p => p.id === s.selectedProxy)

    const inbounds: any[] = [
      {
        type: 'mixed',
        tag: 'mixed-in',
        listen: '127.0.0.1',
        listen_port: 2080,
        sniff: true
      }
    ]

    if (s.tunMode) {
      log('info', 'Режим TUN активирован (System VPN)')
      inbounds.push({
        type: 'tun',
        tag: 'tun-in',
        interface_name: 'Nexus-TUN',
        address: '172.19.0.1/30',
        auto_route: true,
        strict_route: true,
        stack: 'system',
        sniff: true
      })
    }

    const outbounds: any[] = [
      { type: 'direct', tag: 'direct' },
      { type: 'dns-out', tag: 'dns-out' }
    ]

    if (selectedProxy) {
      log('info', `Использование сервера: ${selectedProxy.name}`)
      outbounds.push({
        type: 'vless',
        tag: 'proxy',
        server: selectedProxy.address,
        server_port: selectedProxy.port,
        uuid: selectedProxy.uuid,
        tls: {
          enabled: true,
          server_name: selectedProxy.sni || selectedProxy.address,
          utls: { enabled: true, fingerprint: 'chrome' }
        }
      })
    }

    const routeRules: any[] = [
      { protocol: 'dns', outbound: 'dns-out' }
    ]

    if (s.routeMode === 'selective' && s.selectedProcesses?.length) {
      routeRules.push({ process_name: s.selectedProcesses, outbound: 'proxy' })
      routeRules.push({ outbound: 'direct' })
    } else if (s.routeMode === 'all') {
      routeRules.push({ outbound: 'proxy' })
    } else {
      routeRules.push({ outbound: 'direct' })
    }

    const fullConfig = {
      log: { level: 'info' },
      // ENABLE EXPERIMENTAL API FOR TRAFFIC STATS
      experimental: {
        clash_api: {
          external_controller: '127.0.0.1:9090'
        }
      },
      dns: {
        servers: [
          { tag: 'remote', address: '8.8.8.8', address_resolver: 'direct' },
          { tag: 'local', address: 'local', detach: true }
        ],
        rules: [
          { outbound: 'direct', server: 'local' },
          { outbound: 'proxy', server: 'remote' }
        ],
        final: 'remote'
      },
      inbounds,
      outbounds,
      route: {
        rules: routeRules,
        auto_detect_interface: true,
        final: 'direct'
      }
    }

    writeFileSync(configPath, JSON.stringify(fullConfig, null, 2), 'utf8')

    child = spawn(bin, ['run', '-c', configPath], {
      windowsHide: true,
      cwd: path.dirname(bin)
    })

    child.on('exit', (code) => {
      log('info', `Accelerator process exited (${code})`)
      setStatus({ state: 'stopped', pid: undefined })
      child = null
      if (trafficInterval) clearInterval(trafficInterval)
    })

    child.stdout?.on('data', (buf) => log('info', buf.toString().trim()))
    child.stderr?.on('data', (buf) => {
       const msg = buf.toString().trim()
       if (msg.includes('FATAL') || msg.includes('error')) {
          log('error', msg)
          setStatus({ state: 'error', lastError: msg })
       }
    })

    setStatus({ state: 'running', pid: child.pid, startedAt: Date.now() })
    log('info', s.tunMode ? 'System VPN (TUN) is now ACTIVE' : 'Accelerator (Proxy) is now ACTIVE')
    
    // Start traffic monitoring
    trafficInterval = setInterval(fetchTraffic, 1000)

  } catch (e) {
    const msg = String(e)
    setStatus({ state: 'error', lastError: msg })
    log('error', `Failed to start: ${msg}`)
  }
}

export async function stopSingbox(): Promise<void> {
  if (trafficInterval) clearInterval(trafficInterval)
  if (!child) {
    setStatus({ state: 'stopped' })
    return
  }
  setStatus({ state: 'stopping' })
  child.kill()
  child = null
  setStatus({ state: 'stopped', pid: undefined })
  log('info', 'Accelerator stopped')
}

export async function restartSingbox(): Promise<void> {
  await stopSingbox()
  await new Promise(r => setTimeout(r, 500))
  await startSingbox()
}
