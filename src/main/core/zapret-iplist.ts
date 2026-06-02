import { existsSync, readFileSync, writeFileSync, copyFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { zapretBundleDir } from '../utils/dirs'

export interface CuratedIpSet {
  id: string
  name: string
  description: string
  cidrs: string[]
}

export interface IpListSnapshot {
  total: number
  preview: string[]
  hasBackup: boolean
  filePath: string
}

export interface IpListPatch {
  setIds?: string[]
  customCidrs?: string[]
  replace?: boolean
}

// list-general.txt is consumed by Zapret as a hostlist (SNI / Host
// header matching). Domains are the primary entry; IPs/CIDRs are
// accepted too — some Zapret strategies cross-reference both.
const IPV4_CIDR = /^(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?:\/(?:[0-9]|[12]\d|3[0-2]))?$/
const IPV6_CIDR = /^(?:[A-Fa-f0-9:]+:+)+[A-Fa-f0-9]*(?:\/(?:1[0-1]\d|12[0-8]|\d{1,2}))?$/
// Hostname / FQDN: labels of [a-z0-9-], 1–63 chars, joined by dots,
// optionally with a leading wildcard (`*.example.com`). Total ≤253.
const HOSTNAME = /^\*?\.?(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?:\.(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?))+$/i

export const CURATED_IP_SETS: CuratedIpSet[] = [
  {
    id: 'discord',
    name: 'Discord',
    description: 'Основные домены Discord, их CDN и голосовых сервисов.',
    cidrs: [
      'discord.com',
      'discordapp.com',
      'discordapp.net',
      'discord.gg',
      'discord.gift',
      'discord.media',
      'discord.new',
      'discordcdn.com',
      'dis.gd',
      'discordstatus.com'
    ]
  },
  {
    id: 'telegram',
    name: 'Telegram',
    description: 'Домены Telegram и вспомогательных сервисов.',
    cidrs: [
      'telegram.org',
      'telegram.me',
      't.me',
      'telesco.pe',
      'web.telegram.org',
      'core.telegram.org',
      'cdn-telegram.org',
      'tdesktop.com',
      'telegram-cdn.org'
    ]
  },
  {
    id: 'youtube',
    name: 'YouTube / Google',
    description: 'Домены YouTube и смежных сервисов Google.',
    cidrs: [
      'youtube.com',
      'youtu.be',
      'youtubekids.com',
      'youtube-nocookie.com',
      'yt.be',
      'ytimg.com',
      'ggpht.com',
      'googlevideo.com',
      'youtubei.googleapis.com',
      'i.ytimg.com',
      's.ytimg.com',
      'm.youtube.com'
    ]
  },
  {
    id: 'cloudflare',
    name: 'Cloudflare',
    description: 'Ключевые домены Cloudflare (DNS, Workers, ECH, R2).',
    cidrs: [
      'cloudflare.com',
      'cloudflare-dns.com',
      'cloudflareinsights.com',
      'cloudflarestream.com',
      'cloudflareaccess.com',
      'cloudflare-ech.com',
      'workers.dev',
      'pages.dev',
      'r2.dev',
      'one.one.one.one'
    ]
  },
  {
    id: 'twitch',
    name: 'Twitch',
    description: 'Домены Twitch и их CDN.',
    cidrs: [
      'twitch.tv',
      'ttvnw.net',
      'jtvnw.net',
      'twitchcdn.net',
      'twitchsvc.net',
      'live-video.net',
      'helix.twitch.tv'
    ]
  },
  {
    id: 'spotify',
    name: 'Spotify',
    description: 'Домены Spotify и смежных CDN.',
    cidrs: [
      'spotify.com',
      'spotifycdn.com',
      'scdn.co',
      'spoti.fi',
      'spotilocal.com',
      'pscdn.co',
      'audio-fa.scdn.co',
      'audio-ak.spotify.com'
    ]
  },
  {
    id: 'roblox',
    name: 'Roblox',
    description: 'Полный список доменов и CDN для корректной работы Roblox.',
    cidrs: [
      'roblox.com',
      'www.roblox.com',
      'auth.roblox.com',
      'accountsettings.roblox.com',
      'assetgame.roblox.com',
      'assetdelivery.roblox.com',
      'catalog.roblox.com',
      'avatar.roblox.com',
      'itemconfiguration.roblox.com',
      'economy.roblox.com',
      'apis.roblox.com',
      'clientsettings.api.roblox.com',
      'chat.roblox.com',
      'voice.roblox.com',
      'friends.roblox.com',
      'groups.roblox.com',
      'notifications.roblox.com',
      'presence.roblox.com',
      'realtime.roblox.com',
      'chatmoderation.roblox.com',
      'studio.roblox.com',
      'publish.roblox.com',
      'develop.roblox.com',
      'devforum.roblox.com',
      'setup.rbxcdn.com',
      'rbxcdn.com',
      'versioncompatibility.roblox.com',
      'sitetest.roblox.com',
      'trades.roblox.com',
      'translations.roblox.com',
      'tutorials.roblox.com',
      'ecs.roblox.com',
      'gameanalytics.roblox.com',
      'metrics.roblox.com',
      'telemetry.roblox.com',
      'abtesting.roblox.com',
      'adconfiguration.roblox.com',
      'ads.roblox.com',
      'adserver.roblox.com',
      'adspolicy.roblox.com',
      'api.roblox.com',
      'billing.roblox.com',
      'captcha.roblox.com',
      'cdn.roblox.com',
      'chatrealtime.roblox.com',
      'client-telemetry.roblox.com',
      'clientsettingscdn.roblox.com',
      'clicks.roblox.com',
      'contentstore.roblox.com',
      'ephemeralcounters.api.roblox.com',
      'followings.roblox.com',
      'gamepersistence.roblox.com',
      'games.roblox.com',
      'graphql.roblox.com',
      'groupsmoderation.roblox.com',
      'inventory.roblox.com',
      'locale.roblox.com',
      'localizationtables.roblox.com',
      'matchmaking.roblox.com',
      'pointbalancing.roblox.com',
      'premiumfeatures.roblox.com',
      'privatemessages.roblox.com',
      'ratings.roblox.com',
      'search.roblox.com',
      'thumbnails.roblox.com',
      'tix.roblox.com',
      'translationservice.roblox.com',
      'users.roblox.com',
      'usersmoderation.roblox.com',
      'web.roblox.com',
      'wiki.roblox.com',
      'wire.roblox.com',
      'clientconfig.roblox.com',
      'config.roblox.com',
      'crl.roblox.com',
      'status.roblox.com',
      'setup.roblox.com',
      'update.roblox.com',
      's3.amazonaws.com',
      'stun.l.google.com',
      'stun1.l.google.com',
      'stun2.l.google.com',
      'stun3.l.google.com',
      'stun4.l.google.com',
      'stun.services.mozilla.com',
      'global.stun.twilio.com',
      'turn.twilio.com',
      'geoip.roblox.com',
      'geoip.services.roblox.com',
      'ocsp.digicert.com',
      'ocsp.verisign.com',
      'crl.verisign.com',
      'setup-cdn.roblox.com',
      'roblox-setup.roblox.com',
      'roblox-update.roblox.com',
      'update-cdn.roblox.com',
      'api.rbxcdn.com',
      'setup.api.rbxcdn.com',
      'setup.cache.rbxcdn.com',
      'cs.rbxcdn.com',
      'roblox-setup.cache.roblox.com',
      'roblox-update.cache.roblox.com',
      'setup.cache.rbxcdn.com',
      'update.cache.rbxcdn.com',
      'chat.roblox.com',
      'gamejoin.roblox.com',
      'client.roblox.com',
      'contentdelivery.roblox.com',
      'economycdn.roblox.com',
      'chatmoderation.roblox.com',
      'matchmaking.api.roblox.com',
      'presence.api.roblox.com',
      'friends.api.roblox.com',
      'groups.api.roblox.com',
      'inventory.api.roblox.com',
      'catalog.api.roblox.com',
      'avatar.api.roblox.com',
      'users.api.roblox.com',
      'develop.api.roblox.com',
      'clientsettingscdn.roblox.com',
      'client-telemetry.roblox.com',
      'telemetry.roblox.com',
      'metrics.roblox.com',
      'gameanalytics.roblox.com',
      'ecs.roblox.com',
      'abtesting.roblox.com',
      'adconfiguration.roblox.com',
      'ads.roblox.com',
      'adserver.roblox.com',
      'adspolicy.roblox.com',
      'billing.roblox.com',
      'captcha.roblox.com',
      'cdn.roblox.com',
      'contentstore.roblox.com',
      'ephemeralcounters.api.roblox.com',
      'followings.roblox.com',
      'games.roblox.com',
      'graphql.roblox.com',
      'groupsmoderation.roblox.com',
      'itemconfiguration.roblox.com',
      'locale.roblox.com',
      'notifications.roblox.com',
      'pointbalancing.roblox.com',
      'premiumfeatures.roblox.com',
      'privatemessages.roblox.com',
      'ratings.roblox.com',
      'realtime.roblox.com',
      'search.roblox.com',
      'tix.roblox.com',
      'trades.roblox.com',
      'tutorials.roblox.com',
      'usersmoderation.roblox.com',
      'wiki.roblox.com',
      'wire.roblox.com',
      'devforum.api.roblox.com',
      'akamaized.net',
      'cloudfront.net',
      'amazonaws.com',
      'rblx.com',
      'robloxapp.com',
      'robloxgames.com',
      'robloxlabs.com',
      'rbx.com',
      'rbxlabs.com',
      'rbxcdn.xyz',
      'rbxcdn.site',
      'rbxcdn.tech',
      'rbxcdn.one',
      'rbxcdn.today',
      'rbxcdn.world',
      'rbxcdn.services',
      'rbxcdn.work',
      'rbxcdn.space',
      'rbxcdn.online',
      'rbxcdn.store',
      'rbxcdn.fun',
      'rbxcdn.biz',
      'rbxcdn.us',
      'rbxcdn.org',
      'rbxcdn.net',
      'rbxcdn.co',
      'rbxcdn.me',
      'rbxcdn.tv',
      'rbxcdn.cc',
      'rbxcdn.gg',
      'rbxcdn.dev',
      'rbxcdn.io',
      'edgecastcdn.net',
      'footprint.net',
      'llnwd.net',
      'hwcdn.net',
      'gcdn.co',
      'g-cdn.net',
      'cdngc.net',
      'cdngs.net',
      'secure.footprint.net',
      'secure.llnwd.net',
      'roblox.qq.com',
      'roblox.cn'
    ]
  }
]

export function getCuratedIpSets(): CuratedIpSet[] {
  return CURATED_IP_SETS.map((s) => ({ ...s, cidrs: [...s.cidrs] }))
}

function listFile(): string {
  return path.join(zapretBundleDir(), 'lists', 'list-general.txt')
}

function backupFile(): string {
  // No upstream backup is shipped for list-general.txt — we mint one
  // ourselves on first edit (see ensureBackup) so «restore from backup»
  // can roll back to the original Flowseal hostlist.
  return path.join(zapretBundleDir(), 'lists', 'list-general.txt.backup')
}

function isValidCidr(line: string): boolean {
  const v = line.trim()
  if (!v) return false
  if (v.startsWith('#') || v.startsWith(';')) return false
  if (IPV4_CIDR.test(v) || IPV6_CIDR.test(v)) return true
  if (v.length > 253) return false
  return HOSTNAME.test(v)
}

function ensureBackup(): void {
  const src = listFile()
  const bak = backupFile()
  if (!existsSync(src)) return
  if (existsSync(bak) && safeSize(bak) > 0) return
  try { copyFileSync(src, bak) } catch { /* best-effort */ }
}

function readLines(file: string): string[] {
  if (!existsSync(file)) return []
  try {
    return readFileSync(file, 'utf-8').split(/\r?\n/)
  } catch {
    return []
  }
}

function dedup(list: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of list) {
    const v = raw.trim()
    if (!v) continue
    if (seen.has(v)) continue
    seen.add(v)
    out.push(v)
  }
  return out
}

function ensureDirOrThrow(): void {
  const dir = path.dirname(listFile())
  if (!existsSync(dir)) {
    throw new Error(`zapret-bundle отсутствует: нет ${dir}. Установите/обновите Zapret.`)
  }
}

export function getIpListSnapshot(): IpListSnapshot {
  const file = listFile()
  const lines = dedup(readLines(file).filter(isValidCidr))
  return {
    total: lines.length,
    preview: lines,
    hasBackup: existsSync(backupFile()) && safeSize(backupFile()) > 0,
    filePath: file
  }
}

function safeSize(file: string): number {
  try { return statSync(file).size } catch { return 0 }
}

/**
 * Apply a patch to list-general.txt:
 *  - replace=true → wipe the file first
 *  - then merge in entries from selected curated sets + custom user lines
 *
 * Accepts hostnames, IPv4/IPv6 addresses, and CIDR ranges. Invalid lines
 * are silently dropped; duplicates collapsed. The original Flowseal
 * hostlist is backed up to list-general.txt.backup on first edit so
 * the user can restore it.
 */
export function applyIpListPatch(patch: IpListPatch): IpListSnapshot {
  ensureDirOrThrow()
  ensureBackup()
  const file = listFile()

  const existing = patch.replace ? [] : readLines(file).filter(isValidCidr)

  const fromSets: string[] = []
  if (patch.setIds && patch.setIds.length) {
    const byId = new Map(CURATED_IP_SETS.map((s) => [s.id, s]))
    for (const id of patch.setIds) {
      const s = byId.get(id)
      if (s) fromSets.push(...s.cidrs)
    }
  }

  const fromCustom = (patch.customCidrs ?? [])
    .flatMap((s) => s.split(/[\s,;]+/))
    .map((s) => s.trim())
    .filter(isValidCidr)

  const merged = dedup([...existing, ...fromSets, ...fromCustom])
  writeAtomic(file, merged.join('\r\n') + (merged.length ? '\r\n' : ''))
  return getIpListSnapshot()
}

export function clearIpList(): IpListSnapshot {
  ensureDirOrThrow()
  ensureBackup()
  writeAtomic(listFile(), '')
  return getIpListSnapshot()
}

/**
 * Restore list-general.txt from a backup. The first time the user edits
 * the file we copy the original Flowseal hostlist to .backup; restore
 * just copies it back.
 */
export function restoreIpListBackup(): IpListSnapshot {
  ensureDirOrThrow()
  const src = backupFile()
  if (!existsSync(src)) {
    throw new Error('Backup-файл list-general.txt.backup ещё не создан (вы ни разу не правили список).')
  }
  copyFileSync(src, listFile())
  return getIpListSnapshot()
}

function writeAtomic(file: string, content: string): void {
  // list-general.txt is loaded once when winws.exe starts; live mid-write
  // races aren't a real concern. A direct write is fine and avoids the
  // Windows rename-over-existing-file caveat entirely.
  writeFileSync(file, content, 'utf-8')
}

export async function updateCommunityList(url: string): Promise<IpListSnapshot> {
  if (!url) throw new Error('URL не указан')
  ensureDirOrThrow()
  ensureBackup()
  
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Nexus-Updater' }
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const text = await res.text()
  
  const fetchedLines = text.split(/\r?\n/).filter(isValidCidr)
  if (fetchedLines.length === 0) throw new Error('Список пуст или формат не поддерживается')

  const file = listFile()
  const existing = readLines(file).filter(isValidCidr)
  const merged = dedup([...existing, ...fetchedLines])
  
  writeAtomic(file, merged.join('\r\n') + (merged.length ? '\r\n' : ''))
  return getIpListSnapshot()
}
