import { BrowserWindow } from 'electron'

type GlassEffect = 'mica' | 'acrylic' | 'tabbed'

export function isGlassEnabled(config: AppConfig): boolean {
  return process.platform === 'win32' && config.enableVibrancy === true
}

function getGlassEffect(config: AppConfig): GlassEffect {
  const requested = config.glassEffect
  return requested === 'acrylic' || requested === 'tabbed' ? requested : 'mica'
}

/**
 * Applies the Windows system backdrop to every currently open Nexus window.
 * Window transparency is chosen on window creation, so toggling glass
 * relaunches the app; changing material applies at once.
 */
export function applyWindowAppearance(config: AppConfig, target?: BrowserWindow | null): void {
  if (process.platform !== 'win32') return

  const windows = target ? [target] : BrowserWindow.getAllWindows()
  const enabled = isGlassEnabled(config)

  for (const window of windows) {
    if (window.isDestroyed()) continue
    try {
      window.setBackgroundColor(enabled ? '#00000000' : '#101010')
      window.setBackgroundMaterial(enabled ? getGlassEffect(config) : 'none')
    } catch {
      // Windows 10 and Windows 11 versions before 22H2 lack a system material.
      // The renderer glass is still shown there.
    }
  }
}
