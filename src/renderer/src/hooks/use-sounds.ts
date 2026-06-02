import { useAppConfig } from '@renderer/hooks/use-app-config'
import { useCallback, useEffect } from 'react'
import { useZapretStore } from '@renderer/store/zapret-store'
import { useTgwsStore } from '@renderer/store/tgws-store'

/**
 * Cyberpunk Sound Engine
 * Generates futuristic synthesizer sounds programmatically via Web Audio API.
 */
export const useSounds = () => {
  const { appConfig } = useAppConfig()
  const zapret = useZapretStore((s) => s.status.state)
  const tgws = useTgwsStore((s) => s.status.state)
  const theme = appConfig?.appTheme

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

      if (type === 'powerOn') {
        // High-tech startup bloop
        osc.type = 'sine'
        osc.frequency.setValueAtTime(440, now)
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.1)
        gain.gain.setValueAtTime(0, now)
        gain.gain.linearRampToValueAtTime(0.2, now + 0.05)
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3)
        osc.start(now)
        osc.stop(now + 0.3)
      } else if (type === 'powerOff') {
        // Low-tech shutdown drop
        osc.type = 'sine'
        osc.frequency.setValueAtTime(660, now)
        osc.frequency.exponentialRampToValueAtTime(220, now + 0.2)
        gain.gain.setValueAtTime(0.2, now)
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3)
        osc.start(now)
        osc.stop(now + 0.3)
      } else if (type === 'click') {
        // Short digital click
        osc.type = 'square'
        osc.frequency.setValueAtTime(1200, now)
        gain.gain.setValueAtTime(0.05, now)
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.05)
        osc.start(now)
        osc.stop(now + 0.05)
      } else if (type === 'update') {
        // Success melody
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
  }, [appConfig?.enableSounds])

  // Play sounds on service state changes
  useEffect(() => {
    if (zapret === 'running' || tgws === 'running') playSound('powerOn')
    if (zapret === 'stopped' || tgws === 'stopped') playSound('powerOff')
  }, [zapret, tgws])

  // Play sound on theme change
  useEffect(() => {
    if (theme) playSound('click')
  }, [theme])

  return { playSound }
}
