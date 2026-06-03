import { useAppConfig } from '@renderer/hooks/use-app-config'
import { useCallback, useEffect } from 'react'
import { useZapretStore } from '@renderer/store/zapret-store'
import { useTgwsStore } from '@renderer/store/tgws-store'

/**
 * Advanced Sound Engine
 * Generates varied synthesised sounds based on the selected pack.
 */
export const useSounds = () => {
  const { appConfig } = useAppConfig()
  const zapret = useZapretStore((s) => s.status.state)
  const tgws = useTgwsStore((s) => s.status.state)
  const theme = appConfig?.appTheme
  const pack = appConfig?.pluginSettings?.['sound-packs']?.pack || 'cyberpunk'

  const playSound = useCallback((type: 'powerOn' | 'powerOff' | 'click' | 'update') => {
    if (!appConfig?.enableSounds) return

    try {
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext
      const ctx = new AudioContext()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()

      osc.connect(gain)
      gain.connect(ctx.destination)

      const now = ctx.currentTime

      if (pack === 'retro') {
        osc.type = 'square'
        if (type === 'powerOn') {
          osc.frequency.setValueAtTime(150, now)
          osc.frequency.linearRampToValueAtTime(300, now + 0.1)
          gain.gain.setValueAtTime(0.1, now)
          osc.start(now)
          osc.stop(now + 0.2)
        } else if (type === 'powerOff') {
          osc.frequency.setValueAtTime(300, now)
          osc.frequency.linearRampToValueAtTime(100, now + 0.2)
          gain.gain.setValueAtTime(0.1, now)
          osc.start(now)
          osc.stop(now + 0.2)
        } else if (type === 'click') {
          osc.frequency.setValueAtTime(800, now)
          gain.gain.setValueAtTime(0.05, now)
          osc.start(now)
          osc.stop(now + 0.03)
        }
      } else if (pack === 'sci-fi') {
        osc.type = 'sawtooth'
        if (type === 'powerOn') {
          osc.frequency.setValueAtTime(50, now)
          osc.frequency.exponentialRampToValueAtTime(1000, now + 0.5)
          gain.gain.setValueAtTime(0, now)
          gain.gain.linearRampToValueAtTime(0.1, now + 0.1)
          gain.gain.linearRampToValueAtTime(0, now + 0.5)
          osc.start(now)
          osc.stop(now + 0.5)
        } else if (type === 'powerOff') {
          osc.frequency.setValueAtTime(1000, now)
          osc.frequency.exponentialRampToValueAtTime(50, now + 0.5)
          gain.gain.setValueAtTime(0.1, now)
          gain.gain.linearRampToValueAtTime(0, now + 0.5)
          osc.start(now)
          osc.stop(now + 0.5)
        } else if (type === 'click') {
          osc.type = 'sine'
          osc.frequency.setValueAtTime(2000, now)
          osc.frequency.exponentialRampToValueAtTime(100, now + 0.1)
          gain.gain.setValueAtTime(0.05, now)
          osc.start(now)
          osc.stop(now + 0.1)
        }
      } else if (pack === 'minimal') {
        osc.type = 'sine'
        if (type === 'powerOn') {
          osc.frequency.setValueAtTime(440, now)
          gain.gain.setValueAtTime(0, now)
          gain.gain.linearRampToValueAtTime(0.05, now + 0.05)
          gain.gain.linearRampToValueAtTime(0, now + 0.2)
          osc.start(now)
          osc.stop(now + 0.2)
        } else if (type === 'powerOff') {
          osc.frequency.setValueAtTime(330, now)
          gain.gain.setValueAtTime(0.05, now)
          gain.gain.linearRampToValueAtTime(0, now + 0.2)
          osc.start(now)
          osc.stop(now + 0.2)
        } else if (type === 'click') {
          osc.frequency.setValueAtTime(1000, now)
          gain.gain.setValueAtTime(0.02, now)
          osc.start(now)
          osc.stop(now + 0.02)
        }
      } else {
        // Default Cyberpunk
        if (type === 'powerOn') {
          osc.type = 'sine'
          osc.frequency.setValueAtTime(440, now)
          osc.frequency.exponentialRampToValueAtTime(880, now + 0.1)
          gain.gain.setValueAtTime(0, now)
          gain.gain.linearRampToValueAtTime(0.2, now + 0.05)
          gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3)
          osc.start(now)
          osc.stop(now + 0.3)
        } else if (type === 'powerOff') {
          osc.type = 'sine'
          osc.frequency.setValueAtTime(660, now)
          osc.frequency.exponentialRampToValueAtTime(220, now + 0.2)
          gain.gain.setValueAtTime(0.2, now)
          gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3)
          osc.start(now)
          osc.stop(now + 0.3)
        } else if (type === 'click') {
          osc.type = 'square'
          osc.frequency.setValueAtTime(1200, now)
          gain.gain.setValueAtTime(0.05, now)
          gain.gain.exponentialRampToValueAtTime(0.01, now + 0.05)
          osc.start(now)
          osc.stop(now + 0.05)
        }
      }

      if (type === 'update') {
        osc.type = 'triangle'
        osc.frequency.setValueAtTime(440, now)
        osc.frequency.setValueAtTime(554.37, now + 0.1)
        osc.frequency.setValueAtTime(659.25, now + 0.2)
        gain.gain.setValueAtTime(0.1, now)
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4)
        osc.start(now)
        osc.stop(now + 0.4)
      }
    } catch (e) {
      console.warn('[useSounds] Audio context failed:', e)
    }
  }, [appConfig?.enableSounds, pack])

  useEffect(() => {
    if (zapret === 'running' || tgws === 'running') playSound('powerOn')
    if (zapret === 'stopped' || tgws === 'stopped') playSound('powerOff')
  }, [zapret, tgws])

  useEffect(() => {
    if (theme) playSound('click')
  }, [theme])

  return { playSound }
}
