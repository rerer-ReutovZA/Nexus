import os from 'os'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

export interface SystemSpecs {
  hostname: string
  username: string
  platform: string
  arch: string
  cpu: string
  ram: string
  gpu: string
  disk: string
}

export async function getSystemSpecs(): Promise<SystemSpecs> {
  const release = os.release() // e.g. "10.0.22631"
  const platform = os.platform()
  let osName = 'Windows'
  
  if (platform === 'win32') {
    const parts = release.split('.')
    const major = parseInt(parts[0])
    const minor = parseInt(parts[1])
    const build = parseInt(parts[2])

    if (major === 10) {
      if (build >= 22000) osName = 'Windows 11'
      else osName = 'Windows 10'
    } else if (major === 6) {
      if (minor === 3) osName = 'Windows 8.1'
      else if (minor === 2) osName = 'Windows 8'
      else if (minor === 1) osName = 'Windows 7'
      else if (minor === 0) osName = 'Windows Vista'
    }
    osName += ` (Build ${build})`
  } else if (platform === 'darwin') {
    osName = 'macOS'
  } else {
    osName = platform
  }

  const specs: SystemSpecs = {
    hostname: os.hostname(),
    username: os.userInfo().username,
    platform: osName,
    arch: os.arch(),
    cpu: 'Unknown',
    ram: Math.round(os.totalmem() / 1024 / 1024 / 1024) + ' GB',
    gpu: 'Unknown',
    disk: 'Unknown'
  }

  try {
    const { stdout: cpuOut } = await execAsync('wmic cpu get name')
    specs.cpu = cpuOut.split('\n').filter(l => l.trim() && !l.includes('Name'))[0]?.trim() || 'Unknown'

    const { stdout: gpuOut } = await execAsync('wmic path win32_VideoController get name')
    const gpus = gpuOut.split('\n')
      .map(l => l.trim())
      .filter(l => l && !l.includes('Name') && !l.includes('IDDCX') && !l.includes('Microsoft Basic'))
    specs.gpu = gpus.length > 0 ? gpus.join(', ') : 'Unknown'

    const { stdout: diskOut } = await execAsync('wmic logicaldisk get deviceid,freespace,size')
    const diskLines = diskOut.split('\n').filter(l => l.trim() && !l.includes('DeviceID'))
    const diskReports: string[] = []
    for (const line of diskLines) {
      const parts = line.trim().split(/\s+/)
      if (parts.length >= 3) {
        const id = parts[0]
        const free = Math.round(parseInt(parts[1]) / 1024 / 1024 / 1024)
        const total = Math.round(parseInt(parts[2]) / 1024 / 1024 / 1024)
        if (!isNaN(free) && !isNaN(total)) diskReports.push(`${id} ${free}/${total}GB`)
      }
    }
    specs.disk = diskReports.length > 0 ? diskReports.join(' | ') : 'Unknown'
  } catch (e) {}

  return specs
}
