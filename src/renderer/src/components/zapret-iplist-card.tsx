import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  ChevronDown,
  ChevronRight,
  ListChecks,
  Loader2,
  PlusCircle,
  RotateCcw,
  Trash2
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@renderer/components/ui/card'
import { Button } from '@renderer/components/ui/button'
import { cn, POWER_ON_BANNER_STYLE } from '@renderer/lib/utils'
import {
  zapretGetCuratedIpSets,
  zapretGetIpList,
  zapretApplyIpListPatch,
  zapretClearIpList,
  zapretRestoreIpListBackup,
  zapretUpdateCommunityList,
  patchAppConfig,
  type CuratedIpSet,
  type IpListSnapshot
} from '@renderer/utils/ipc'
import { useAppConfig } from '@renderer/hooks/use-app-config'
import { Switch } from '@renderer/components/ui/switch'

interface Props {
  disabled?: boolean
  disabledReason?: string
}

const ZapretIpListCard: React.FC<Props> = ({ disabled = false, disabledReason }) => {
  const { appConfig } = useAppConfig()
  const zapret = appConfig?.zapret
  const [open, setOpen] = useState(false)
  const [snapshot, setSnapshot] = useState<IpListSnapshot | null>(null)
  const [sets, setSets] = useState<CuratedIpSet[]>([])
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [custom, setCustom] = useState('')
  const [busy, setBusy] = useState(false)
  const loadedRef = useRef(false)

  const refresh = async (): Promise<void> => {
    try {
      const [snap, list] = await Promise.all([
        zapretGetIpList(),
        zapretGetCuratedIpSets()
      ])
      setSnapshot(snap)
      setSets(list)
    } catch {
      // Bundle may not be installed yet — leave snapshot null.
      setSnapshot(null)
      setSets([])
    }
  }

  useEffect(() => {
    if (loadedRef.current) return
    loadedRef.current = true
    void refresh()
  }, [])

  const togglePicked = (id: string): void => {
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const updateCommunity = async (): Promise<void> => {
    if (busy) return
    if (!zapret?.listUpdateUrl) {
      toast.error('URL списка не настроен')
      return
    }
    setBusy(true)
    const tId = toast.loading('Загрузка списка из сети…')
    try {
      const snap = await zapretUpdateCommunityList(zapret.listUpdateUrl)
      setSnapshot(snap)
      toast.success(`Список обновлен — теперь ${snap.total} запис${endingFor(snap.total)}`, {
        id: tId,
        style: POWER_ON_BANNER_STYLE
      })
    } catch (e) {
      toast.error('Не удалось скачать список', {
        id: tId,
        description: e instanceof Error ? e.message : String(e)
      })
    } finally {
      setBusy(false)
    }
  }

  const apply = async (mode: 'append' | 'replace'): Promise<void> => {
    if (busy) return
    if (picked.size === 0 && custom.trim() === '') {
      toast.warning('Нечего применять — выбери набор или впиши IP вручную')
      return
    }
    setBusy(true)
    const tId = toast.loading(mode === 'replace' ? 'Перезаписываем список IP…' : 'Добавляем IP в список…')
    try {
      const snap = await zapretApplyIpListPatch({
        setIds: [...picked],
        customCidrs: custom.length ? [custom] : [],
        replace: mode === 'replace'
      })
      setSnapshot(snap)
      setPicked(new Set())
      setCustom('')
      toast.success(`Готово — в списке ${snap.total} запис${endingFor(snap.total)}`, {
        id: tId,
        style: POWER_ON_BANNER_STYLE
      })
    } catch (e) {
      toast.error('Не удалось обновить список IP', {
        id: tId,
        description: e instanceof Error ? e.message : String(e)
      })
    } finally {
      setBusy(false)
    }
  }

  const clearAll = async (): Promise<void> => {
    if (busy) return
    setBusy(true)
    const tId = toast.loading('Очищаем список IP…')
    try {
      const snap = await zapretClearIpList()
      setSnapshot(snap)
      toast.success('Список IP очищен', { id: tId })
    } catch (e) {
      toast.error('Не удалось очистить список', {
        id: tId,
        description: e instanceof Error ? e.message : String(e)
      })
    } finally {
      setBusy(false)
    }
  }

  const restore = async (): Promise<void> => {
    if (busy) return
    setBusy(true)
    const tId = toast.loading('Восстанавливаем список из бэкапа…')
    try {
      const snap = await zapretRestoreIpListBackup()
      setSnapshot(snap)
      toast.success(`Восстановлено — ${snap.total} запис${endingFor(snap.total)}`, {
        id: tId,
        style: POWER_ON_BANNER_STYLE
      })
    } catch (e) {
      toast.error('Не удалось восстановить', {
        id: tId,
        description: e instanceof Error ? e.message : String(e)
      })
    } finally {
      setBusy(false)
    }
  }

  const pickedCount = useMemo(() => picked.size, [picked])

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
        <div className="min-w-0 flex-1">
          <CardTitle className="flex items-center gap-2">
            <ListChecks className="h-4 w-4 text-muted-foreground" />
            Список хостов и IP
            {snapshot && (
              <span className="text-xs font-normal text-muted-foreground">
                {snapshot.total} запис{endingFor(snapshot.total)} в list-general.txt
              </span>
            )}
          </CardTitle>
        </div>
        <Button
          variant={open ? 'secondary' : 'outline'}
          size="sm"
          disabled={disabled}
          title={disabled ? disabledReason : undefined}
          onClick={() => setOpen((v) => !v)}
          className="shrink-0"
        >
          {open
            ? <><ChevronDown className="h-3.5 w-3.5" /> Свернуть</>
            : <><ChevronRight className="h-3.5 w-3.5" /> Управление списком</>}
        </Button>
      </CardHeader>

      {open && (
        <CardContent className="space-y-4 pt-0">
          {!snapshot ? (
            <p className="text-sm text-muted-foreground">
              Не удалось прочитать <code className="text-xs">lists/list-general.txt</code>.
              Установите или обновите Zapret-бандл.
            </p>
          ) : (
            <>
              <div>
                <div className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
                  Готовые наборы
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {sets.map((s) => {
                    const checked = picked.has(s.id)
                    return (
                      <label
                        key={s.id}
                        className={cn(
                          'flex cursor-pointer select-none items-start gap-2 rounded-md border p-2.5 transition',
                          checked
                            ? 'border-primary bg-primary/10'
                            : 'border-border hover:bg-accent/30',
                          (disabled || busy) && 'pointer-events-none opacity-50'
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => togglePicked(s.id)}
                          className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-primary"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-medium">{s.name}</span>
                            <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
                              {s.cidrs.length} зап.
                            </span>
                          </div>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {s.description}
                          </p>
                        </div>
                      </label>
                    )
                  })}
                </div>
              </div>

              <div>
                <div className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
                  Community Lists (Автообновление)
                </div>
                <div className="flex flex-col gap-3 rounded-md border border-border bg-background/40 p-3">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <div className="text-sm font-medium">Синхронизация по URL</div>
                      <div className="text-[11px] text-muted-foreground">
                        Периодически скачивать списки доменов (например, Antizapret)
                      </div>
                    </div>
                    <Switch
                      checked={zapret?.autoUpdateList ?? false}
                      onCheckedChange={(checked) => patchAppConfig({ zapret: { ...zapret!, autoUpdateList: checked } })}
                      disabled={disabled || busy}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      className="flex-1 h-8 rounded-md border border-border bg-background/60 px-2 text-xs font-mono placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none disabled:opacity-50"
                      value={zapret?.listUpdateUrl ?? ''}
                      onChange={(e) => patchAppConfig({ zapret: { ...zapret!, listUpdateUrl: e.target.value } })}
                      disabled={disabled || busy}
                      placeholder="https://example.com/list.txt"
                    />
                    <Button
                      size="sm"
                      variant="secondary"
                      className="h-8 shrink-0"
                      onClick={() => { void updateCommunity() }}
                      disabled={disabled || busy || !zapret?.listUpdateUrl}
                    >
                      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Скачать сейчас'}
                    </Button>
                  </div>
                </div>
              </div>

              <div>
                <div className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
                  Свои хосты / IP
                </div>
                <textarea
                  value={custom}
                  onChange={(e) => setCustom(e.target.value)}
                  disabled={disabled || busy}
                  placeholder={'example.com\n*.example.org\n1.2.3.4\n2606:4700::/32'}
                  rows={4}
                  spellCheck={false}
                  className={cn(
                    'w-full rounded-md border border-border bg-background/60 p-2 font-mono text-xs',
                    'placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none',
                    (disabled || busy) && 'pointer-events-none opacity-50'
                  )}
                />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  По одному в строке. Поддерживаются домены, IPv4/IPv6 и CIDR. Невалидные строки игнорируются.
                </p>
              </div>

              {snapshot.preview.length > 0 && (
                <div>
                  <div className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
                    Текущий список (первые {snapshot.preview.length} из {snapshot.total})
                  </div>
                  <pre className="max-h-32 overflow-auto rounded-md border border-border bg-background/40 p-2 font-mono text-[11px] leading-snug">
                    {snapshot.preview.join('\n')}
                    {snapshot.total > snapshot.preview.length ? '\n…' : ''}
                  </pre>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Button
                  size="sm"
                  onClick={() => { void apply('append') }}
                  disabled={disabled || busy || (pickedCount === 0 && custom.trim() === '')}
                >
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PlusCircle className="h-3.5 w-3.5" />}
                  Добавить выбранное
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => { void apply('replace') }}
                  disabled={disabled || busy || (pickedCount === 0 && custom.trim() === '')}
                  title="Перезаписать список выбранными наборами и своими IP — текущее содержимое будет удалено"
                >
                  Заменить список
                </Button>
                <div className="ml-auto flex items-center gap-2">
                  {snapshot.hasBackup && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => { void restore() }}
                      disabled={disabled || busy}
                      title="Восстановить исходный list-general.txt (бэкап создаётся при первом изменении)"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      Из бэкапа
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => { void clearAll() }}
                    disabled={disabled || busy || snapshot.total === 0}
                    className="text-red-400 hover:text-red-300"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Очистить
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      )}
    </Card>
  )
}

function endingFor(n: number): string {
  // Russian noun ending: 1 → ь, 2-4 → и, 5+ / 0 / 11-14 → ей
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return 'ь'
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'и'
  return 'ей'
}

export default ZapretIpListCard
