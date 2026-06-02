import { useEffect, useState, useRef } from 'react'
import { Download, Sparkles, X } from 'lucide-react'
import {
  appCheckUpdate,
  appInstallUpdate,
  appDismissUpdate,
  type AppUpdateInfo
} from '@renderer/utils/ipc'
import { Button } from '@renderer/components/ui/button'
import { useAppConfig } from '@renderer/hooks/use-app-config'
import { toast } from 'sonner'

const POLL_INTERVAL_MS = 60 * 60 * 1000 // 1 h

export default function AppUpdateOverlay(): React.ReactElement | null {
  const { appConfig } = useAppConfig()
  const [info, setInfo] = useState<AppUpdateInfo | null>(null)
  const [installing, setInstalling] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [closing, setClosing] = useState(false)
  const [progress, setProgress] = useState<{ percent: number; speed: number; loaded: number; total: number } | null>(null)
  const autoInstalledRef = useRef(false)

  useEffect(() => {
    let cancelled = false
    const check = async (force = false, isManual = false): Promise<void> => {
      let tId: string | number | undefined
      if (isManual) {
        tId = toast.loading('Поиск обновлений Nexus...')
      }
      try {
        const next = await appCheckUpdate(force)
        if (cancelled) {
          if (isManual && tId) toast.dismiss(tId)
          return
        }
        setInfo(next)
        
        if (isManual) {
          if (next.hasUpdate) {
            if (appConfig?.silentAutoUpdate) {
              toast.success(`Найдено обновление: v${next.latest}. Загрузка...`, { id: tId })
            } else {
              toast.success(`Найдено обновление: v${next.latest}`, { id: tId })
            }
          } else {
            toast.info('Обновлений не найдено. У вас последняя версия.', { id: tId })
          }
        }
      } catch (e) {
        if (isManual) {
          toast.error('Ошибка проверки обновлений', { id: tId, description: String(e) })
        }
      }
    }
    
    check(false)
    const id = window.setInterval(() => check(true), POLL_INTERVAL_MS)
    
    // Listen for manual checks
    const handleManualCheck = () => check(true, true)
    window.addEventListener('nexus:checkAppUpdate', handleManualCheck)

    // Listen for download progress
    const off = window.electron.ipcRenderer.on('app:updateProgress', (_e, p: any) => {
      setProgress(p)
    })

    return () => {
      cancelled = true
      window.clearInterval(id)
      window.removeEventListener('nexus:checkAppUpdate', handleManualCheck)
      off()
    }
  }, [appConfig?.silentAutoUpdate])

  const visible =
    !!info &&
    info.hasUpdate &&
    !!info.assetUrl &&
    !info.dismissed &&
    !closing

  const handleInstall = async (): Promise<void> => {
    if (!info?.assetUrl) return
    setInstalling(true)
    setError(null)
    try {
      await appInstallUpdate(info.assetUrl, info.latest)
      // Main process will quit Nexus within ~1 s. We just keep the
      // spinner up; user perceives "downloading… closing…".
    } catch (e) {
      setInstalling(false)
      setProgress(null)
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  // Handle silent auto-update
  useEffect(() => {
    if (visible && appConfig?.silentAutoUpdate && !installing && !autoInstalledRef.current && info?.assetUrl) {
      autoInstalledRef.current = true
      handleInstall()
    }
  }, [visible, appConfig?.silentAutoUpdate, installing, info])

  const handleLater = async (): Promise<void> => {
    if (!info?.tag) return
    setClosing(true)
    setTimeout(async () => {
      try {
        await appDismissUpdate(info.tag!)
      } finally {
        setInfo(null)
        setClosing(false)
      }
    }, 400)
  }

  if (!visible) return null

  const formatSpeed = (bytesPerSec: number): string => {
    if (bytesPerSec > 1024 * 1024) return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`
    if (bytesPerSec > 1024) return `${(bytesPerSec / 1024).toFixed(1)} KB/s`
    return `${bytesPerSec.toFixed(0)} B/s`
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-border bg-card p-6 shadow-2xl animate-in zoom-in-95 duration-300">
        <button
          onClick={handleLater}
          className="absolute top-4 right-4 p-2 rounded-full hover:bg-muted text-muted-foreground transition-colors"
          disabled={installing}
        >
          <X className="size-5" />
        </button>

        <div className="flex gap-4">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Sparkles className="size-6" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xl sm:text-2xl font-semibold leading-tight">
              Хотите обновить?
            </div>
            <div className="mt-1 text-sm text-muted-foreground">
              Доступна новая версия Nexus v{info.latest}.
            </div>
            
            {installing && progress && (
              <div className="mt-6 space-y-2">
                <div className="flex justify-between text-xs font-medium">
                  <span>Загрузка обновления...</span>
                  <span>{progress.percent}%</span>
                </div>
                <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                  <div 
                    className="h-full bg-primary transition-all duration-300 ease-out"
                    style={{ width: `${progress.percent}%` }}
                  />
                </div>
                <div className="flex justify-between text-[10px] text-muted-foreground font-mono">
                  <span>{formatSpeed(progress.speed)}</span>
                  <span>{(progress.loaded / (1024*1024)).toFixed(1)} / {(progress.total / (1024*1024)).toFixed(1)} MB</span>
                </div>
              </div>
            )}

            {!installing && info.releaseNotes ? (
              <div className="mt-4 max-h-44 overflow-y-auto rounded-lg border border-border bg-muted/50 p-3 text-sm whitespace-pre-wrap leading-relaxed">
                {info.releaseNotes}
              </div>
            ) : null}
            
            {error ? (
              <div className="mt-3 text-sm text-destructive">
                Не удалось установить обновление: {error}
              </div>
            ) : null}
          </div>
        </div>

        {!installing && (
          <div className="mt-6 flex items-center justify-end gap-2">
            <Button
              variant="ghost"
              onClick={handleLater}
              disabled={installing}
            >
              Нет
            </Button>
            <Button onClick={handleInstall} disabled={installing}>
              <Download className="size-4 mr-2" />
              Да
            </Button>
          </div>
        )}

        <div className="mt-3 text-[11px] text-muted-foreground leading-relaxed">
          {installing 
            ? 'Пожалуйста, подождите. Nexus перезапустится автоматически после загрузки.'
            : 'Nexus закроется на 5–10 секунд для установки и запустится снова автоматически. Все настройки сохраняются.'}
        </div>
      </div>
    </div>
  )
}
