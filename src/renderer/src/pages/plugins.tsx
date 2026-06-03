import React, { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@renderer/components/ui/card'
import { Button } from '@renderer/components/ui/button'
import { Switch } from '@renderer/components/ui/switch'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { useAppConfig } from '@renderer/hooks/use-app-config'
import { toast } from 'sonner'
import { 
  Puzzle, RefreshCw, Settings2, Save, X, Moon, ShieldAlert, 
  Send, Terminal, Volume2, Gamepad2, Info, Search, Plus, Trash2
} from 'lucide-react'
import BasePage from '@renderer/components/base/base-page'
import { cn } from '@renderer/lib/utils'

interface Plugin {
  manifest: {
    id: string
    name: string
    version: string
    description: string
    author: string
  }
  enabled: boolean
}

const PluginsPage: React.FC = () => {
  const { appConfig, patchAppConfig } = useAppConfig()
  const [plugins, setPlugins] = useState<Plugin[]>([])
  const [loading, setLoading] = useState(false)
  const [pluginsDir, setPluginsDir] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  
  // For Game Trigger
  const [runningProcesses, setRunningProcesses] = useState<string[]>([])
  const [procSearch, setProcSearch] = useState('')

  const refresh = async () => {
    setLoading(true)
    try {
      const res = await window.electron.ipcRenderer.invoke('plugin:list')
      if (res.ok) setPlugins(res.value)
      const dirRes = await window.electron.ipcRenderer.invoke('plugin:getDir')
      if (dirRes.ok) setPluginsDir(dirRes.value)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const fetchProcesses = async () => {
    try {
      const res = await window.electron.ipcRenderer.invoke('app:getRunningProcesses')
      if (res.ok) setRunningProcesses(res.value)
    } catch (e) { console.error(e) }
  }

  useEffect(() => { 
    refresh() 
  }, [])

  useEffect(() => {
    if (editingId === 'game-trigger') fetchProcesses()
  }, [editingId])

  const togglePlugin = async (id: string, enabled: boolean) => {
    const current = appConfig?.enabledPlugins || []
    let next: string[]
    if (enabled) next = [...current, id]
    else next = current.filter(x => x !== id)
    
    await patchAppConfig({ enabledPlugins: next })
    const res = await window.electron.ipcRenderer.invoke('plugin:reload')
    refresh()
    if (res.ok) {
      toast.success(enabled ? 'Плагин включен' : 'Плагин выключен')
    } else {
      toast.error('Ошибка перезагрузки плагинов', { description: res.message })
    }
  }

  const updateSettings = (id: string, patch: any) => {
    const current = appConfig?.pluginSettings?.[id] || {}
    patchAppConfig({
      pluginSettings: {
        ...appConfig?.pluginSettings,
        [id]: { ...current, ...patch }
      }
    })
  }

  const addGameProcess = (name: string) => {
    const current = appConfig?.pluginSettings?.['game-trigger']?.processes || ''
    const list = current.split(',').map((s: string) => s.trim()).filter(Boolean)
    if (list.includes(name)) return
    updateSettings('game-trigger', { processes: [...list, name].join(', ') })
  }

  const removeGameProcess = (name: string) => {
    const current = appConfig?.pluginSettings?.['game-trigger']?.processes || ''
    const list = current.split(',').map((s: string) => s.trim()).filter(Boolean)
    updateSettings('game-trigger', { processes: list.filter((x: string) => x !== name).join(', ') })
  }

  return (
    <BasePage 
      title="Плагины"
      headerExtra={
        <Button variant="outline" size="sm" onClick={refresh} disabled={loading} className="h-8 gap-1.5">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Обновить список
        </Button>
      }
    >
      <div className="px-4 pb-6 space-y-4">
        <Card className="bg-card/30 border-dashed border-primary/20">
          <CardContent className="p-3">
            <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest mb-1.5 opacity-50">Директория плагинов</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-background/50 p-1.5 rounded border border-border text-[10px] font-mono truncate select-all">
                {pluginsDir || 'Загрузка пути...'}
              </code>
              <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => {
                window.electron.ipcRenderer.invoke('clipboard:writeText', pluginsDir)
                toast.success('Путь скопирован')
              }}>
                Копировать
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 gap-4">
          {plugins.length > 0 ? (
            plugins.map((p) => (
              <Card key={p.manifest.id} className="bg-card/50 border-stroke overflow-hidden transition-all duration-200">
                <CardHeader className="flex flex-row items-center justify-between pb-3 space-y-0">
                  <div className="flex items-center gap-3">
                    <div className="size-10 flex items-center justify-center rounded-lg bg-primary/10 text-primary">
                      {p.manifest.id === 'night-shift' ? <Moon className="size-5" /> : 
                       p.manifest.id === 'telegram-bot' ? <Send className="size-5" /> :
                       p.manifest.id === 'matrix-dashboard' ? <Terminal className="size-5" /> :
                       p.manifest.id === 'sound-packs' ? <Volume2 className="size-5" /> :
                       p.manifest.id === 'game-trigger' ? <Gamepad2 className="size-5" /> :
                       <Puzzle className="size-5" />}
                    </div>
                    <div>
                      <CardTitle className="text-base font-bold">{p.manifest.name}</CardTitle>
                      <div className="text-[10px] text-muted-foreground uppercase font-bold tracking-tight opacity-70">
                        v{p.manifest.version} • {p.manifest.author}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {['game-trigger', 'night-shift', 'ad-blocker', 'telegram-bot', 'sound-packs'].includes(p.manifest.id) && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className={cn("size-8 transition-colors", editingId === p.manifest.id && "bg-accent")}
                        onClick={() => setEditingId(editingId === p.manifest.id ? null : p.manifest.id)}
                      >
                        <Settings2 className="size-4" />
                      </Button>
                    )}
                    <Switch 
                      checked={p.enabled} 
                      onCheckedChange={(v) => togglePlugin(p.manifest.id, v)} 
                    />
                  </div>
                </CardHeader>
                <CardContent className="space-y-4 pb-4">
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {p.manifest.description}
                  </p>
                  
                  {editingId === p.manifest.id && (
                    <div className="pt-4 border-t border-dashed space-y-4 animate-in slide-in-from-top-2 duration-200">
                      
                      {/* Night Shift Settings */}
                      {p.manifest.id === 'night-shift' && (
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1.5">
                            <Label className="text-[10px] uppercase font-bold text-muted-foreground">Начало (час)</Label>
                            <Input
                              type="number"
                              min="0"
                              max="23"
                              className="h-8 text-xs bg-background/50"
                              value={appConfig?.pluginSettings?.['night-shift']?.startHour ?? 23}
                              onChange={(e) => updateSettings('night-shift', { startHour: parseInt(e.target.value) })}
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-[10px] uppercase font-bold text-muted-foreground">Конец (час)</Label>
                            <Input
                              type="number"
                              min="0"
                              max="23"
                              className="h-8 text-xs bg-background/50"
                              value={appConfig?.pluginSettings?.['night-shift']?.endHour ?? 8}
                              onChange={(e) => updateSettings('night-shift', { endHour: parseInt(e.target.value) })}
                            />
                          </div>
                        </div>
                      )}

                      {/* Telegram Bot Settings */}
                      {p.manifest.id === 'telegram-bot' && (
                        <div className="space-y-3">
                          <div className="space-y-1.5">
                            <Label className="text-[10px] uppercase font-bold text-muted-foreground">Bot Token</Label>
                            <Input
                              type="password"
                              placeholder="123456:ABC-DEF..."
                              className="h-8 text-xs bg-background/50 font-mono"
                              value={appConfig?.pluginSettings?.['telegram-bot']?.token || ''}
                              onChange={(e) => updateSettings('telegram-bot', { token: e.target.value })}
                            />
                          </div>
                        </div>
                      )}

                      {/* Sound Packs Settings */}
                      {p.manifest.id === 'sound-packs' && (
                        <div className="space-y-2">
                          <Label className="text-[10px] uppercase font-bold text-muted-foreground">Набор звуков</Label>
                          <div className="flex flex-wrap gap-2">
                            {['cyberpunk', 'retro', 'minimal', 'sci-fi'].map((pack) => (
                              <Button
                                key={pack}
                                size="sm"
                                variant={appConfig?.pluginSettings?.['sound-packs']?.pack === pack ? 'default' : 'outline'}
                                className="h-7 text-[10px] capitalize"
                                onClick={() => updateSettings('sound-packs', { pack })}
                              >
                                {pack}
                              </Button>
                            ))}
                          </div>
                        </div>
                      )}

                      <Button size="sm" className="w-full h-8 gap-1.5 shadow-lg shadow-primary/20" onClick={() => {
                         setEditingId(null)
                         window.electron.ipcRenderer.invoke('plugin:reload')
                         toast.success('Настройки применены')
                      }}>
                        <Save className="size-3.5" />
                        Применить и сохранить
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))
          ) : (
            <div className="py-12 flex flex-col items-center justify-center text-center border-2 border-dashed rounded-2xl bg-muted/5">
              <Puzzle className="size-12 text-muted-foreground/20 mb-4" />
              <div className="text-sm font-medium">Плагины не найдены</div>
            </div>
          )}
        </div>
      </div>
    </BasePage>
  )
}

export default PluginsPage
