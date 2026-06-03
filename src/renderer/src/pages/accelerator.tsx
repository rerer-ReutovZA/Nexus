import React, { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@renderer/components/ui/card'
import { Button } from '@renderer/components/ui/button'
import { Switch } from '@renderer/components/ui/switch'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { useAppConfig } from '@renderer/hooks/use-app-config'
import { toast } from 'sonner'
import { 
  Zap, Globe, ShieldCheck, Download, 
  Activity, ListFilter,
  Plus, Trash2, Radio, Search, RefreshCw, X, Server,
  Monitor, ArrowUpCircle, ArrowDownCircle, Gauge
} from 'lucide-react'
import BasePage from '@renderer/components/base/base-page'
import { cn } from '@renderer/lib/utils'

const formatBytes = (bytes: number, decimals = 2) => {
  if (bytes <= 0) return '0 B'
  const k = 1024
  const dm = decimals < 0 ? 0 : decimals
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i]
}

const AcceleratorPage: React.FC = () => {
  const { appConfig, patchAppConfig } = useAppConfig()
  const [status, setStatus] = useState<any>({ state: 'stopped' })
  const [loading, setLoading] = useState(false)
  const [runningProcesses, setRunningProcesses] = useState<string[]>([])
  const [procSearch, setProcSearch] = useState('')
  const [pings, setPings] = useState<Record<string, number>>({})

  const config = appConfig?.accelerator || {
    enabled: false,
    subscriptionUrl: '',
    proxies: [],
    selectedProxy: '',
    routeMode: 'all',
    tunMode: false,
    selectedProcesses: []
  }

  const refreshStatus = async () => {
    try {
      const res = await window.electron.ipcRenderer.invoke('singbox:status')
      if (res.ok) setStatus(res.value)
    } catch (e) { console.error(e) }
  }

  const fetchProcesses = async () => {
    try {
      const res = await window.electron.ipcRenderer.invoke('app:getRunningProcesses')
      if (res.ok) setRunningProcesses(res.value)
    } catch (e) { console.error(e) }
  }

  useEffect(() => {
    refreshStatus()
    fetchProcesses()
    const cleanup = window.electron.ipcRenderer.on('singbox:status', (_, next) => setStatus(next))
    return () => cleanup()
  }, [])

  const update = (patch: Partial<typeof config>) => {
    patchAppConfig({ accelerator: { ...config, ...patch } })
  }

  const handleToggle = async () => {
    if (!config.selectedProxy && config.routeMode !== 'bypass') {
       toast.error('Сначала выберите сервер')
       return
    }
    setLoading(true)
    try {
      if (status.state === 'running') {
        await window.electron.ipcRenderer.invoke('singbox:stop')
      } else {
        await window.electron.ipcRenderer.invoke('singbox:start')
      }
    } catch (e) {
      toast.error('Ошибка ускорителя', { description: String(e) })
    } finally {
      setLoading(false)
    }
  }

  const fetchSubscription = async () => {
    if (!config.subscriptionUrl) {
      toast.error('Введите URL подписки')
      return
    }
    setLoading(true)
    try {
      const res = await window.electron.ipcRenderer.invoke('sub:fetch', config.subscriptionUrl)
      if (res.ok) {
        update({ proxies: res.value })
        toast.success('Подписка обновлена')
      }
    } catch (e) { toast.error('Сбой загрузки') }
    finally { setLoading(false) }
  }

  const getFlagAndName = (name: string): { flag: string, cleanName: string } => {
    const n = name.toUpperCase()
    const codes: Record<string, string> = { 'RU': '🇷🇺', 'CZ': '🇨🇿', 'US': '🇺🇸', 'DE': '🇩🇪', 'NL': '🇳🇱', 'SG': '🇸🇬', 'FR': '🇫🇷' }
    for (const [code, flag] of Object.entries(codes)) {
      if (n.includes(code)) return { flag, cleanName: name.replace(new RegExp(code, 'gi'), '').replace(/[\[\]\-_:]/g, ' ').trim() }
    }
    return { flag: '🌐', cleanName: name }
  }

  const addProcess = (name: string) => {
    const current = config.selectedProcesses || []
    if (current.includes(name)) return
    update({ selectedProcesses: [...current, name] })
  }

  const removeProcess = (p: string) => {
    update({ selectedProcesses: (config.selectedProcesses || []).filter(x => x !== p) })
  }

  const filteredProcesses = runningProcesses.filter(p => 
    p.toLowerCase().includes(procSearch.toLowerCase()) && 
    !(config.selectedProcesses || []).includes(p)
  ).slice(0, 50)

  return (
    <BasePage 
      title="Ускоритель интернета"
      headerExtra={
        <Button 
          size="sm" 
          variant={status.state === 'running' ? 'destructive' : 'default'}
          className="h-8 gap-1.5 shadow-lg shadow-primary/20"
          onClick={handleToggle}
          disabled={loading}
        >
          <Zap className={cn("size-3.5", status.state === 'running' && "fill-current")} />
          {status.state === 'running' ? 'Отключить' : 'Ускорить сеть'}
        </Button>
      }
    >
      <div className="px-4 pb-10 space-y-6">
        {/* Real-time Traffic Usage PRO */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
           <Card className="bg-card/50 border-stroke overflow-hidden relative">
              <div className="absolute top-0 left-0 w-1 h-full bg-blue-500" />
              <CardContent className="p-4">
                 <div className="flex items-center gap-2 mb-1">
                    <ArrowDownCircle className="size-3.5 text-blue-500" />
                    <span className="text-[10px] uppercase font-bold text-muted-foreground">Download</span>
                 </div>
                 <p className="text-xl font-mono font-bold leading-none">{formatBytes(status.traffic?.down || 0)}/s</p>
              </CardContent>
           </Card>
           <Card className="bg-card/50 border-stroke overflow-hidden relative">
              <div className="absolute top-0 left-0 w-1 h-full bg-purple-500" />
              <CardContent className="p-4">
                 <div className="flex items-center gap-2 mb-1">
                    <ArrowUpCircle className="size-3.5 text-purple-500" />
                    <span className="text-[10px] uppercase font-bold text-muted-foreground">Upload</span>
                 </div>
                 <p className="text-xl font-mono font-bold leading-none">{formatBytes(status.traffic?.up || 0)}/s</p>
              </CardContent>
           </Card>
           <Card className="bg-card/50 border-stroke overflow-hidden relative col-span-2">
              <div className="absolute top-0 left-0 w-1 h-full bg-green-500" />
              <CardContent className="p-4 flex justify-between items-center">
                 <div>
                    <div className="flex items-center gap-2 mb-1">
                       <Gauge className="size-3.5 text-green-500" />
                       <span className="text-[10px] uppercase font-bold text-muted-foreground">Total Traffic (Session)</span>
                    </div>
                    <p className="text-xl font-mono font-bold leading-none">
                       {formatBytes((status.traffic?.totalDown || 0) + (status.traffic?.totalUp || 0))}
                    </p>
                 </div>
                 <div className="text-right opacity-50">
                    <p className="text-[9px] font-mono">↓ {formatBytes(status.traffic?.totalDown || 0)}</p>
                    <p className="text-[9px] font-mono">↑ {formatBytes(status.traffic?.totalUp || 0)}</p>
                 </div>
              </CardContent>
           </Card>
        </div>

        {/* TUN Mode Banner */}
        <Card className={cn(
          "border-dashed transition-all duration-300",
          config.tunMode ? "bg-primary/5 border-primary/30" : "bg-card/30 border-border"
        )}>
          <CardContent className="p-4 flex flex-col md:flex-row gap-4 items-center">
            <div className={cn(
              "size-12 rounded-2xl flex items-center justify-center",
              config.tunMode ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20" : "bg-muted text-muted-foreground"
            )}>
              <Monitor className="size-6" />
            </div>
            <div className="flex-1 text-center md:text-left">
              <p className="text-sm font-bold">Системный VPN (TUN Mode)</p>
              <p className="text-[10px] text-muted-foreground leading-tight">
                Направляет весь трафик Windows через выбранный сервер. Игры и все браузеры ускорятся автоматически.
              </p>
            </div>
            <div className="flex items-center gap-2 bg-background/50 p-2 rounded-xl border border-stroke">
               <span className="text-[10px] font-bold uppercase opacity-60 px-2">{config.tunMode ? 'Включено' : 'Выключено'}</span>
               <Switch checked={config.tunMode || false} onCheckedChange={v => update({ tunMode: v })} />
            </div>
          </CardContent>
        </Card>

        {/* Server List */}
        <Card className="bg-card/50 border-stroke">
          <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <Server className="size-4 text-primary" />
              Доступные серверы
            </CardTitle>
            <div className="flex gap-2">
              <Input 
                placeholder="URL подписки..." 
                className="h-8 w-64 bg-background/50 text-[10px] font-mono"
                value={config.subscriptionUrl || ''}
                onChange={e => update({ subscriptionUrl: e.target.value })}
              />
              <Button size="sm" onClick={fetchSubscription} disabled={loading} className="h-8 gap-1.5 text-[10px]">
                <RefreshCw className={cn("size-3", loading && "animate-spin")} />
                Обновить
              </Button>
            </div>
          </CardHeader>
          <CardContent>
             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar border-t pt-4">
                {(config.proxies || []).map((p: any) => {
                  const { flag, cleanName } = getFlagAndName(p.name)
                  return (
                    <div 
                      key={p.id}
                      onClick={() => update({ selectedProxy: p.id })}
                      className={cn(
                        "p-3 rounded-lg border cursor-pointer transition-all duration-200 flex items-center gap-3",
                        config.selectedProxy === p.id ? "bg-primary/15 border-primary" : "bg-background/40 border-stroke hover:border-primary/40"
                      )}
                    >
                      <div className="text-xl shrink-0 leading-none select-none">{flag}</div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-bold truncate">{cleanName}</p>
                        <p className="text-[8px] text-muted-foreground truncate opacity-70">{p.type} • {p.address}</p>
                      </div>
                    </div>
                  )
                })}
             </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="bg-card/50 border-stroke">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <Globe className="size-4 text-primary" />
                Режим работы
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
               {[
                 { id: 'all', label: 'Весь трафик', desc: 'Проксировать абсолютно всё' },
                 { id: 'selective', label: 'Выборочно', desc: 'Только выбранные процессы' }
               ].map(m => (
                 <div 
                   key={m.id}
                   onClick={() => update({ routeMode: m.id as any })}
                   className={cn(
                     "p-3 rounded-lg border cursor-pointer flex items-center justify-between",
                     config.routeMode === m.id ? "bg-primary/5 border-primary/40" : "bg-transparent border-stroke hover:border-primary/20"
                   )}
                 >
                    <div>
                      <p className="text-xs font-bold">{m.label}</p>
                      <p className="text-[10px] text-muted-foreground">{m.desc}</p>
                    </div>
                    {config.routeMode === m.id && <ShieldCheck className="size-4 text-primary" />}
                 </div>
               ))}
            </CardContent>
          </Card>

          <Card className="bg-card/50 border-stroke">
            <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <ListFilter className="size-4 text-primary" />
                Ускорение процессов
              </CardTitle>
              <Button size="icon" variant="ghost" className="size-8" onClick={fetchProcesses}>
                 <RefreshCw className="size-3.5" />
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-[9px] uppercase font-bold text-muted-foreground text-opacity-60">Выбрать из запущенных</Label>
                <div className="mt-1 grid grid-cols-2 gap-1 max-h-[120px] overflow-y-auto pr-1 custom-scrollbar">
                  {filteredProcesses.map(p => (
                    <div 
                      key={p} 
                      onClick={() => addProcess(p)}
                      className="p-1.5 rounded border border-stroke bg-background/20 text-[9px] font-mono cursor-pointer hover:bg-primary/10 hover:border-primary/30 truncate"
                    >
                      {p}
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-2 pt-2 border-t border-dashed">
                <Label className="text-[9px] uppercase font-bold text-muted-foreground text-opacity-60">Активные правила</Label>
                <div className="space-y-1 max-h-[100px] overflow-y-auto pr-1 custom-scrollbar">
                  {(config.selectedProcesses || []).map(p => (
                    <div key={p} className="flex items-center justify-between p-1.5 rounded bg-primary/5 border border-primary/20">
                      <span className="text-[11px] font-mono truncate">{p}</span>
                      <Button size="icon" variant="ghost" className="size-6 text-muted-foreground hover:text-destructive" onClick={() => removeProcess(p)}>
                        <Trash2 className="size-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </BasePage>
  )
}

export default AcceleratorPage
