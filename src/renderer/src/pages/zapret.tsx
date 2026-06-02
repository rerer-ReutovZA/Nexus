import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Download, Loader2, Sparkles, FlaskConical, CheckCircle2, XCircle, RefreshCw } from 'lucide-react'
import { useZapretStore } from '@renderer/store/zapret-store'
import { useZapretTestStore } from '@renderer/store/zapret-test-store'
import {
  zapretListStrategies,
  zapretStart,
  zapretStop,
  zapretCheckUpdate,
  zapretInstallUpdate,
  zapretDismissUpdate,
  zapretRunStrategyTest,
  type ZapretUpdateInfo
} from '@renderer/utils/ipc'
import { useAppConfig } from '@renderer/hooks/use-app-config'
import { Card, CardContent, CardHeader, CardTitle } from '@renderer/components/ui/card'
import { Button } from '@renderer/components/ui/button'
import ZapretIcon from '@renderer/components/zapret-icon'
import { cn, BUNDLED_ZAPRET_VERSION, POWER_ON_BANNER_STYLE, POWER_OFF_BANNER_STYLE } from '@renderer/lib/utils'
import BasePage from '@renderer/components/base/base-page'
import SwitcherCard from '@renderer/components/switcher-card'
import ZapretIpListCard from '@renderer/components/zapret-iplist-card'

const Zapret: React.FC = () => {
  const status = useZapretStore((s) => s.status)
  const { appConfig, patchAppConfig } = useAppConfig()
  const [strategies, setStrategies] = useState<{ file: string; title: string; description: string }[]>([])
  const zapret = appConfig?.zapret
  const active = zapret?.activeStrategy
  const location = useLocation()
  const navigate = useNavigate()
  const autoStartRef = useRef<boolean>(
    Boolean((location.state as { autoStart?: boolean } | null)?.autoStart)
  )

  // ---- Auto-update banner
  const [updateInfo, setUpdateInfo] = useState<ZapretUpdateInfo | null>(null)
  const [installing, setInstalling] = useState(false)
  const installingRef = useRef(false)
  const [checking, setChecking] = useState(false)

  // ---- Strategy test
  const testProgress = useZapretTestStore((s) => s.progress)
  const testReport = useZapretTestStore((s) => s.report)
  const isTestRunning = useZapretTestStore((s) => s.isRunning)
  const autoTestStartedRef = useRef(false)

  const handleCheckUpdate = async (): Promise<void> => {
    if (checking) return
    setChecking(true)
    try {
      const info = await zapretCheckUpdate(true)
      setUpdateInfo(info)
      if (info.hasUpdate) {
        toast.success(`Найдено обновление Zapret: v${info.latest}`)
      } else {
        toast.info('У вас установлена последняя версия Zapret')
      }
    } catch (e) {
      toast.error('Не удалось проверить обновления', {
        description: e instanceof Error ? e.message : String(e)
      })
    } finally {
      setChecking(false)
    }
  }

  const refreshStrategies = (): void => {
    zapretListStrategies().then(setStrategies).catch(() => setStrategies([]))
  }

  const startTest = (): void => {
    if (useZapretTestStore.getState().isRunning) return
    // Optimistically flip isRunning so the UI dims immediately — the
    // first 'starting' IPC tick will arrive within ~100ms and reconcile.
    useZapretTestStore.getState().set({
      isRunning: true,
      progress: { phase: 'starting' }
    })
    zapretRunStrategyTest().catch((e: unknown) => {
      const msg = e instanceof Error ? e.message : String(e)
      toast.error('Тест стратегий не выполнен', { description: msg })
      useZapretTestStore.getState().set({
        isRunning: false,
        progress: { phase: 'error', message: msg }
      })
    })
  }

  useEffect(() => {
    refreshStrategies()
    // Don't await; banner just stays hidden if the API call fails (rate-
    // limit, offline, etc.) — surfacing a network error here would be
    // noise for users who never asked to check.
    zapretCheckUpdate(false).then(setUpdateInfo).catch(() => setUpdateInfo(null))

    const t = setTimeout(() => {
      if (autoTestStartedRef.current) return
      const s = useZapretTestStore.getState()
      if (s.report || s.isRunning) return
      autoTestStartedRef.current = true
      zapretListStrategies()
        .then((list) => {
          if (list.length > 0) startTest()
        })
        .catch(() => void 0)
    }, 250)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const showBanner = !!updateInfo && updateInfo.hasUpdate && !updateInfo.dismissed && !!updateInfo.assetUrl

  const installUpdate = async (): Promise<void> => {
    if (installingRef.current || !updateInfo?.assetUrl) return
    installingRef.current = true
    setInstalling(true)
    const tId = toast.loading('Скачиваем сборку Zapret…', {
      description: updateInfo.assetName ?? `v${updateInfo.latest}`
    })
    try {
      const res = await zapretInstallUpdate(updateInfo.assetUrl, updateInfo.latest)
      toast.success('Zapret обновлён', {
        id: tId,
        description: `Версия ${res.installedVersion ?? updateInfo.latest} — стратегий: ${res.strategies}`,
        // Same vivid power-on green as the other success toasts (copy-link,
        // regenerate-key, processes-reloaded) and the active home-page
        // power-on disc, so success feedback across the app is one colour.
        style: POWER_ON_BANNER_STYLE
      })
      // If the active strategy no longer exists in the new bundle, drop it
      // so the user is forced to pick a fresh one before next start.
      refreshStrategies()
      if (zapret && active) {
        const fresh = await zapretListStrategies().catch(() => [])
        if (!fresh.some((s) => s.file === active)) {
          await patchAppConfig({ zapret: { ...zapret, activeStrategy: undefined } })
        }
      }
      // Re-check so the banner disappears immediately.
      const fresh = await zapretCheckUpdate(true).catch(() => null)
      setUpdateInfo(fresh)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      toast.error('Не удалось обновить Zapret', { id: tId, description: msg })
    } finally {
      setInstalling(false)
      installingRef.current = false
    }
  }

  const dismissUpdate = (): void => {
    if (!updateInfo?.latest) return
    void zapretDismissUpdate(updateInfo.latest).catch(() => void 0)
    setUpdateInfo({ ...updateInfo, dismissed: true })
  }

  const pickStrategy = async (file: string): Promise<void> => {
    // Defensive: if the user manages to click a disabled strategy via
    // keyboard or a stale render, drop the request silently.
    const r = testReport?.results[file]
    if (r && r.tested && !r.passed) return
    if (isTestRunning) return
    await patchAppConfig({ zapret: { ...zapret!, activeStrategy: file } })
    if (!autoStartRef.current) return
    // One-shot: drop the flag so re-clicking another strategy on this page
    // doesn't keep auto-starting and ping-ponging back to Home.
    autoStartRef.current = false
    try {
      await zapretStart()
      navigate('/home')
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      toast.error('Не удалось запустить Zapret', { description: msg })
    }
  }

  return (
    <BasePage
      title="Zapret"
      headerExtra={
        <Button
          variant="outline"
          size="sm"
          onClick={handleCheckUpdate}
          disabled={checking || installing}
          className="h-8 gap-1.5"
        >
          {checking ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          Обновить Zapret
        </Button>
      }
    >
      <div className="px-4 pb-6 space-y-4">
        {showBanner && updateInfo && (
          <div className={cn(
            'relative flex items-center gap-3 rounded-lg border border-stroke bg-card/70 backdrop-blur-xl px-4 py-3 transition',
            installing && 'pointer-events-none opacity-80'
          )}>
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary">
              {installing
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <Sparkles className="h-4 w-4" />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-foreground">
                {installing
                  ? 'Устанавливаем Zapret…'
                  : `Доступно обновление Zapret — v${updateInfo.latest}`}
              </div>
              <div className="text-xs text-muted-foreground truncate">
                {installing
                  ? 'Останавливаем winws.exe, распаковываем архив…'
                  : `Текущая версия: v${updateInfo.installed ?? '?'}`}
              </div>
            </div>
            {!installing && (
              <div className="flex shrink-0 items-center gap-2">
                <Button variant="ghost" size="sm" onClick={dismissUpdate}>
                  Позже
                </Button>
                <Button size="sm" onClick={() => { void installUpdate() }}>
                  <Download className="h-3.5 w-3.5" />
                  Обновить
                </Button>
              </div>
            )}
          </div>
        )}

        <SwitcherCard
          icon={ZapretIcon}
          title="Обход DPI (Zapret)"
          subtitle={active ?? 'Выберите стратегию ниже'}
          version={zapret?.installedVersion ?? updateInfo?.installed ?? BUNDLED_ZAPRET_VERSION}
          status={status}
          disabled={isTestRunning}
          onToggle={(v) => {
            if (v && !active) return
            if (isTestRunning) return
            // Return the promise so SwitcherCard awaits the IPC roundtrip and
            // keeps the switch optimistically flipped/locked until done.
            return (v ? zapretStart() : zapretStop()).catch(() => void 0)
          }}
          footer={
            isTestRunning
              ? 'Идёт тестирование стратегий — переключатель временно недоступен'
              : active
                ? null
                : 'Нужна стратегия'
          }
        />

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Профили настроек</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                patchAppConfig({ zapret: { ...zapret!, gameFilter: 'all', ipsetMode: 'none' } })
                if (status.state === 'running') toast.info('Перезапустите Zapret для применения профиля')
              }}
              disabled={isTestRunning || status.state === 'starting' || status.state === 'stopping'}
            >
              Игры (Низкий пинг)
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                patchAppConfig({ zapret: { ...zapret!, gameFilter: 'disabled', ipsetMode: 'loaded' } })
                if (status.state === 'running') toast.info('Перезапустите Zapret для применения профиля')
              }}
              disabled={isTestRunning || status.state === 'starting' || status.state === 'stopping'}
            >
              Работа / YouTube
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                patchAppConfig({ zapret: { ...zapret!, gameFilter: 'disabled', ipsetMode: 'none' } })
                if (status.state === 'running') toast.info('Перезапустите Zapret для применения профиля')
              }}
              disabled={isTestRunning || status.state === 'starting' || status.state === 'stopping'}
            >
              Максимальный обход
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Дополнительные фильтры</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
                4. Game Filter
              </label>
              <select
                value={zapret?.gameFilter ?? 'disabled'}
                disabled={isTestRunning || status.state === 'starting' || status.state === 'stopping'}
                onChange={(e) => {
                  patchAppConfig({ zapret: { ...zapret!, gameFilter: e.target.value as any } })
                  if (status.state === 'running') toast.info('Перезапустите Zapret, чтобы применить фильтр игр')
                }}
                className="w-full h-9 rounded-md border border-border bg-background/50 px-3 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
              >
                <option value="disabled">Disabled</option>
                <option value="all">TCP and UDP</option>
                <option value="tcp">TCP only</option>
                <option value="udp">UDP only</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
                5. IPSet Filter
              </label>
              <select
                value={zapret?.ipsetMode ?? 'none'}
                disabled={isTestRunning || status.state === 'starting' || status.state === 'stopping'}
                onChange={(e) => {
                  patchAppConfig({ zapret: { ...zapret!, ipsetMode: e.target.value as any } })
                  if (status.state === 'running') toast.info('Перезапустите Zapret, чтобы применить фильтр IPSet')
                }}
                className="w-full h-9 rounded-md border border-border bg-background/50 px-3 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
              >
                <option value="none">None</option>
                <option value="any">Any</option>
                <option value="loaded">Loaded</option>
              </select>
            </div>
          </CardContent>
        </Card>

      <ZapretIpListCard
        disabled={isTestRunning || status.state === 'starting' || status.state === 'stopping'}
        disabledReason={
          isTestRunning
            ? 'Идёт тестирование стратегий — управление списком временно недоступно'
            : 'Подождите завершения переключения Zapret'
        }
      />

      <Card>
        <CardHeader
          className={cn(
            'flex flex-row items-center justify-between gap-3 space-y-0',
            isTestRunning && 'flex-col items-stretch gap-3 sm:flex-row sm:items-center'
          )}
        >
          {isTestRunning ? (
            // Inline progress bar replacing the title row during testing.
            <div className="flex flex-1 min-w-0 items-center gap-3">
              <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium leading-tight">
                  Идёт тестирование стратегий под вас. Пожалуйста подождите...
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  После завершения тестирования придёт уведомление в приложении.
                  {testProgress && testProgress.total ? (
                    <>
                      {' '}
                      Стратегия{' '}
                      <span className="font-mono">
                        {testProgress.current ?? 0}/{testProgress.total}
                      </span>
                      {testProgress.strategy ? (
                        <>
                          {' — '}
                          <span className="font-mono">{testProgress.strategy}</span>
                        </>
                      ) : null}
                    </>
                  ) : null}
                </div>
              </div>
            </div>
          ) : (
            <>
              <CardTitle className="flex items-center gap-2">
                Стратегии
                {testReport ? (
                  <span className="text-xs font-normal text-muted-foreground">
                    {Object.values(testReport.results).filter((r) => r.passed).length}
                    {' / '}
                    {Object.keys(testReport.results).length} рабочих
                  </span>
                ) : null}
              </CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={startTest}
                disabled={strategies.length === 0}
                className="shrink-0"
              >
                <FlaskConical className="h-3.5 w-3.5" />
                {testReport ? 'Перетестировать' : 'Запустить тест'}
              </Button>
            </>
          )}
        </CardHeader>
        <CardContent className="space-y-2">
          {strategies.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Сборка Zapret не найдена. Скопируйте содержимое{' '}
              <code className="text-xs">Flowseal/zapret-discord-youtube</code> в{' '}
              <code className="text-xs">%APPDATA%\nexus\runtime\zapret</code> или встроенную папку{' '}
              <code className="text-xs">resources\zapret</code>.
            </p>
          )}
          {strategies.map((s) => {
            const result = testReport?.results[s.file]
            // tested && !passed → strategy is dead on this user's network
            const isFailed = !!result && result.tested && !result.passed
            const isPassed = !!result && result.tested && result.passed
            const isBest = testReport?.bestStrategy === s.file
            const disabled = isFailed || isTestRunning
            return (
              <button
                key={s.file}
                onClick={() => { void pickStrategy(s.file) }}
                disabled={disabled}
                aria-disabled={disabled}
                title={
                  isFailed
                    ? `Не прошла тест (${result?.okCount ?? 0}/${result?.totalCount ?? 0} целей доступны). Нажмите «Перетестировать», чтобы повторить проверку.`
                    : isTestRunning
                      ? 'Тестирование стратегий — подождите окончания.'
                      : undefined
                }
                className={cn(
                  'group relative w-full text-left p-3 rounded-md border transition',
                  active === s.file
                    ? 'border-primary bg-primary/10'
                    : 'border-border hover:bg-accent/30',
                  disabled && 'opacity-40 grayscale cursor-not-allowed pointer-events-none hover:bg-transparent'
                )}
              >
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-sm flex items-center gap-2">
                      <span className="truncate">{s.title}</span>
                      {isBest && (
                        <span className="shrink-0 text-[10px] uppercase tracking-wide font-semibold rounded px-1.5 py-0.5 bg-primary/20 text-primary">
                          лучшая
                        </span>
                      )}
                    </div>
                    {s.description && (
                      <div className="text-xs text-muted-foreground mt-0.5">{s.description}</div>
                    )}
                  </div>
                  {isFailed ? (
                    <span className="shrink-0 inline-flex items-center gap-1 text-[11px] text-red-400">
                      <XCircle className="h-3.5 w-3.5" />
                      {result?.okCount ?? 0}/{result?.totalCount ?? 0}
                    </span>
                  ) : isPassed ? (
                    <span className="shrink-0 inline-flex items-center gap-1 text-[11px] text-emerald-400">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      {result?.okCount ?? 0}/{result?.totalCount ?? 0}
                    </span>
                  ) : null}
                </div>
              </button>
            )
          })}
        </CardContent>
      </Card>

      {status.lastError && (
        <Card className="border" style={POWER_OFF_BANNER_STYLE}>
          <CardContent className="pt-4">
            <p className="text-sm">{status.lastError}</p>
          </CardContent>
        </Card>
      )}
      </div>
    </BasePage>
  )
}

export default Zapret
