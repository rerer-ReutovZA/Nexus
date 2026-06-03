import React, { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@renderer/components/ui/card'
import { Button } from '@renderer/components/ui/button'
import { Switch } from '@renderer/components/ui/switch'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { useAppConfig } from '@renderer/hooks/use-app-config'
import { toast } from 'sonner'
import { 
  ShieldCheck, ShieldAlert, Play, Square, RefreshCw, 
  Settings2, Globe, Cpu, LayoutGrid, Terminal
} from 'lucide-react'
import BasePage from '@renderer/components/base/base-page'
import { cn } from '@renderer/lib/utils'

const SingboxPage: React.FC = () => {
  const { appConfig, patchAppConfig } = useAppConfig()
  const [status, setStatus] = useState<any>({ state: 'stopped' })
  const [loading, setLoading] = useState(false)

  const config = appConfig?.singbox || {
    enabled: false,
    configMode: 'vless',
    vless: { uuid: '', address: '', port: 443, sni: '' }
  }

  const refreshStatus = async () => {
    try {
      const res = await window.electron.ipcRenderer.invoke('singbox:status')
      if (res.ok) setStatus(res.value)
    } catch (e) { console.error(e) }
  }

  useEffect(() => {
    refreshStatus()
    const cleanup = window.electron.ipcRenderer.on('singbox:status', (_, next) => setStatus(next))
    return () => cleanup()
  }, [])

  const toggle = async () => {
    setLoading(true)
    try {
      if (status.state === 'running') {
        await window.electron.ipcRenderer.invoke('singbox:stop')
      } else {
        await window.electron.ipcRenderer.invoke('singbox:start')
      }
    } catch (e) {
      toast.error('Ошибка Sing-box', { description: String(e) })
    } finally {
      setLoading(false)
      refreshStatus()
    }
  }

  const update = (patch: any) => {
    patchAppConfig({ singbox: { ...config, ...patch } })
  }

  const updateVless = (patch: any) => {
    update({ vless: { ...(config.vless || {}), ...patch } })
  }

  const updateReality = (patch: any) => {
    update({ reality: { ...(config.reality || {}), ...patch } })
  }

  return (
    <BasePage 
      title="Sing-box Engine"
      headerExtra={
        <div className="flex items-center gap-2">
           <div className={cn(
             "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border transition-all duration-300",
             status.state === 'running' ? "bg-green-500/10 text-green-500 border-green-500/20" :
             status.state === 'error' ? "bg-red-500/10 text-red-500 border-red-500/20" :
             "bg-muted text-muted-foreground border-border"
           )}>
             {status.state}
           </div>
           <Button 
             size="sm" 
             variant={status.state === 'running' ? 'destructive' : 'default'}
             onClick={toggle}
             disabled={loading}
             className="h-8 gap-1.5"
           >
             {status.state === 'running' ? <Square className="size-3.5" /> : <Play className="size-3.5" />}
             {status.state === 'running' ? 'Остановить' : 'Запустить'}
           </Button>
        </div>
      }
    >
      <div className="px-4 pb-6 space-y-4">
        <Card className="bg-card/30 border-dashed border-primary/20">
          <CardContent className="p-3 flex gap-3 items-center">
            <div className="size-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
              <Cpu className="size-6" />
            </div>
            <div className="flex-1">
              <p className="text-xs font-bold uppercase tracking-tight">Nuclear Extension</p>
              <p className="text-[10px] text-muted-foreground leading-tight">
                Альтернативное ядро для обхода блокировок через VLESS и Reality.
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
           <Card className="bg-card/50 border-stroke">
             <CardHeader className="pb-3">
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <Settings2 className="size-4 text-primary" />
                  Режим конфигурации
                </CardTitle>
             </CardHeader>
             <CardContent className="space-y-4">
                <div className="flex gap-2">
                  {['vless', 'reality', 'manual'].map(m => (
                    <Button 
                      key={m}
                      size="sm"
                      variant={config.configMode === m ? 'default' : 'outline'}
                      className="flex-1 text-[10px] uppercase font-bold"
                      onClick={() => update({ configMode: m })}
                    >
                      {m}
                    </Button>
                  ))}
                </div>

                {config.configMode === 'vless' && (
                  <div className="space-y-3 animate-in fade-in duration-300">
                    <div className="space-y-1.5">
                      <Label className="text-[10px] uppercase font-bold text-muted-foreground">Адрес сервера</Label>
                      <Input 
                        placeholder="example.com" 
                        className="h-8 text-xs bg-background/50" 
                        value={config.vless?.address || ''}
                        onChange={e => updateVless({ address: e.target.value })}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                       <div className="space-y-1.5">
                         <Label className="text-[10px] uppercase font-bold text-muted-foreground">Порт</Label>
                         <Input 
                           type="number" 
                           className="h-8 text-xs bg-background/50" 
                           value={config.vless?.port || 443}
                           onChange={e => updateVless({ port: parseInt(e.target.value) })}
                         />
                       </div>
                       <div className="space-y-1.5">
                         <Label className="text-[10px] uppercase font-bold text-muted-foreground">SNI</Label>
                         <Input 
                           placeholder="google.com" 
                           className="h-8 text-xs bg-background/50" 
                           value={config.vless?.sni || ''}
                           onChange={e => updateVless({ sni: e.target.value })}
                         />
                       </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[10px] uppercase font-bold text-muted-foreground">UUID</Label>
                      <Input 
                        placeholder="00000000-0000-0000-0000-000000000000" 
                        className="h-8 text-xs bg-background/50 font-mono" 
                        value={config.vless?.uuid || ''}
                        onChange={e => updateVless({ uuid: e.target.value })}
                      />
                    </div>
                  </div>
                )}

                {config.configMode === 'reality' && (
                  <div className="space-y-3 animate-in fade-in duration-300">
                     <p className="text-[10px] text-muted-foreground italic">Настройки Reality аналогичны VLESS с доп. полями.</p>
                     {/* Reality specific fields would go here */}
                  </div>
                )}

                {config.configMode === 'manual' && (
                  <div className="space-y-1.5 animate-in fade-in duration-300">
                    <Label className="text-[10px] uppercase font-bold text-muted-foreground">JSON Конфигурация</Label>
                    <textarea 
                      className="w-full h-40 bg-background/50 border rounded-md p-2 text-[10px] font-mono outline-none focus:ring-1 focus:ring-primary"
                      placeholder='{"outbounds": [...]}'
                      value={config.manualConfig || ''}
                      onChange={e => update({ manualConfig: e.target.value })}
                    />
                  </div>
                )}
             </CardContent>
           </Card>

           <Card className="bg-card/50 border-stroke">
             <CardHeader className="pb-3">
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <Terminal className="size-4 text-primary" />
                  Локальный прокси
                </CardTitle>
             </CardHeader>
             <CardContent className="space-y-4">
                <div className="p-3 rounded-lg bg-primary/5 border border-primary/10 flex justify-between items-center">
                   <div>
                     <p className="text-[10px] uppercase font-bold text-muted-foreground">SOCKS5 / HTTP</p>
                     <p className="text-sm font-mono text-primary">127.0.0.1:2080</p>
                   </div>
                   <Button size="sm" variant="ghost" className="h-8 px-2 text-[10px]" onClick={() => {
                     window.electron.ipcRenderer.invoke('clipboard:writeText', '127.0.0.1:2080')
                     toast.success('Скопировано')
                   }}>Копировать</Button>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Автозапуск при старте Nexus</Label>
                    <Switch 
                      checked={config.autoStart || false}
                      onCheckedChange={v => update({ autoStart: v })}
                    />
                  </div>
                  <p className="text-[10px] text-muted-foreground leading-tight">
                    Если включено, Sing-box будет запускаться вместе с программой.
                  </p>
                </div>
             </CardContent>
           </Card>
        </div>

        {status.lastError && (
          <Card className="bg-red-500/10 border-red-500/20">
            <CardContent className="p-3 flex gap-2 items-start">
               <ShieldAlert className="size-4 text-red-500 shrink-0 mt-0.5" />
               <p className="text-[10px] text-red-500 leading-tight font-mono whitespace-pre-wrap">{status.lastError}</p>
            </CardContent>
          </Card>
        )}
      </div>
    </BasePage>
  )
}

export default SingboxPage
