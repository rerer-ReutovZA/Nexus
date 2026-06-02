import { useAppConfig } from '@renderer/hooks/use-app-config'
import { Card, CardContent, CardHeader, CardTitle } from '@renderer/components/ui/card'
import { Label } from '@renderer/components/ui/label'
import { Switch } from '@renderer/components/ui/switch'
import { Button } from '@renderer/components/ui/button'
import { appRelaunch } from '@renderer/utils/ipc'
import BasePage from '@renderer/components/base/base-page'
import { RefreshCw, Plus, X, Edit3, Trash2, Save } from 'lucide-react'
import { useState, useEffect } from 'react'
import { HexColorPicker } from 'react-colorful'
import { toast } from 'sonner'

const themes: string[] = ['light', 'dark', 'ocean', 'forest', 'amethyst', 'rose', 'custom']
const themeLabels: Record<string, string> = {
  light: 'Светлая',
  dark: 'Тёмная',
  ocean: 'Океан',
  forest: 'Лес',
  amethyst: 'Аметист',
  rose: 'Роза',
  custom: 'CSS-код'
}

const Settings: React.FC = () => {
  const { appConfig, patchAppConfig } = useAppConfig()
  const customThemes = appConfig?.customThemes || []
  
  const [editingThemeId, setEditingThemeId] = useState<string | null>(null)
  const [activeColorPart, setActiveColorTarget] = useState<'bgColor' | 'cardColor' | 'primaryColor' | 'textColor'>('primaryColor')
  const [editTheme, setEditTheme] = useState({
    name: '', bgColor: '#000000', cardColor: '#1a1a1a', primaryColor: '#ff0000', textColor: '#ffffff'
  })

  // Real-time preview while editing
  useEffect(() => {
    if (editingThemeId) {
      const css = `
        html, :root {
          --background: ${editTheme.bgColor} !important;
          --card: ${editTheme.cardColor} !important;
          --popover: ${editTheme.cardColor} !important;
          --primary: ${editTheme.primaryColor} !important;
          --primary-foreground: ${editTheme.bgColor} !important;
          --foreground: ${editTheme.textColor} !important;
          --card-foreground: ${editTheme.textColor} !important;
          --popover-foreground: ${editTheme.textColor} !important;
          --muted: color-mix(in srgb, ${editTheme.cardColor} 85%, ${editTheme.textColor}) !important;
          --muted-foreground: color-mix(in srgb, ${editTheme.textColor} 70%, transparent) !important;
          --border: color-mix(in srgb, ${editTheme.cardColor} 80%, ${editTheme.textColor}) !important;
          --stroke: color-mix(in srgb, ${editTheme.cardColor} 80%, ${editTheme.textColor}) !important;
          --input: color-mix(in srgb, ${editTheme.cardColor} 80%, ${editTheme.textColor}) !important;
          --ring: ${editTheme.primaryColor} !important;
          --stroke-power-on: ${editTheme.primaryColor} !important;
          --gradient-start-power-on: ${editTheme.primaryColor} !important;
          --gradient-end-power-on: color-mix(in srgb, ${editTheme.primaryColor} 70%, transparent) !important;
          --profile-active: color-mix(in srgb, ${editTheme.primaryColor} 20%, transparent) !important;
          --stroke-profile-active: ${editTheme.primaryColor} !important;
          --sidebar: ${editTheme.bgColor} !important;
          --sidebar-foreground: ${editTheme.textColor} !important;
          --sidebar-border: color-mix(in srgb, ${editTheme.bgColor} 80%, ${editTheme.textColor}) !important;
        }
      `
      const id = 'nexus-theme-preview'
      let el = document.getElementById(id)
      if (!el) {
        el = document.createElement('style')
        el.id = id
        document.head.appendChild(el)
      }
      el.innerHTML = css
    } else {
      document.getElementById('nexus-theme-preview')?.remove()
    }
  }, [editingThemeId, editTheme])

  const addCustomTheme = () => {
    const id = `custom_${Date.now()}`
    const newTheme = {
      id,
      name: 'Новая тема',
      bgColor: '#0a0a0a',
      cardColor: '#141414',
      primaryColor: '#00ffcc',
      textColor: '#ffffff'
    }
    patchAppConfig({ customThemes: [...customThemes, newTheme] })
    startEditingTheme(newTheme)
  }

  const startEditingTheme = (t: any) => {
    setEditingThemeId(t.id)
    setEditTheme({ name: t.name, bgColor: t.bgColor, cardColor: t.cardColor, primaryColor: t.primaryColor, textColor: t.textColor })
    setActiveColorTarget('primaryColor')
    // Switch to this theme to see live changes
    patchAppConfig({ appTheme: t.id })
  }

  const saveCustomTheme = () => {
    if (!editingThemeId) return
    const updated = customThemes.map(t => 
      t.id === editingThemeId ? { ...t, ...editTheme } : t
    )
    patchAppConfig({ customThemes: updated })
    setEditingThemeId(null)
  }

  const deleteCustomTheme = (id: string) => {
    patchAppConfig({ customThemes: customThemes.filter(t => t.id !== id) })
    if (appConfig?.appTheme === id) {
      patchAppConfig({ appTheme: 'dark' })
    }
  }

  const colorLabels = {
    bgColor: 'Фон',
    cardColor: 'Карточки',
    primaryColor: 'Акцент',
    textColor: 'Текст'
  }

  return (
    <BasePage title="Настройки">
      <div className="px-4 pb-6 space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
          <CardTitle>Приложение</CardTitle>
          <Button 
            variant="outline" 
            size="sm" 
            className="h-8 gap-1"
            onClick={() => window.dispatchEvent(new Event('nexus:checkAppUpdate'))}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Проверить обновления
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-sm">Тихое автообновление</Label>
            <Switch
              checked={appConfig?.silentAutoUpdate ?? false}
              onCheckedChange={(v) => patchAppConfig({ silentAutoUpdate: v })}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-sm">Эффект стекла (Mica/Acrylic)</Label>
            <Switch
              checked={appConfig?.enableVibrancy ?? false}
              onCheckedChange={(v) => {
                patchAppConfig({ enableVibrancy: v })
                toast.info('Нужен перезапуск приложения')
              }}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-sm">Звуковые эффекты</Label>
            <Switch
              checked={appConfig?.enableSounds ?? false}
              onCheckedChange={(v) => patchAppConfig({ enableSounds: v })}
            />
          </div>
          <div className="text-xs text-muted-foreground">
            Версия: v{window.electron.process.env.npm_package_version || '2.0.0'}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
          <CardTitle>Внешний вид</CardTitle>
          <Button variant="ghost" size="sm" onClick={addCustomTheme} className="h-8 gap-1 px-2">
            <Plus className="h-4 w-4" /> Добавить свою
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label className="text-sm text-muted-foreground mb-2 block">Встроенные темы</Label>
            <div className="flex flex-wrap gap-2">
              {themes.map((theme) => (
                <Button
                  key={theme}
                  size="sm"
                  variant={appConfig?.appTheme === theme ? 'default' : 'outline'}
                  onClick={() => patchAppConfig({ appTheme: theme })}
                >
                  {themeLabels[theme]}
                </Button>
              ))}
            </div>
          </div>
          
          {customThemes.length > 0 && (
            <div className="pt-4 border-t mt-3">
              <Label className="text-sm text-muted-foreground mb-3 block">Мои палитры</Label>
              <div className="grid grid-cols-1 gap-3">
                {customThemes.map((t) => (
                  <div key={t.id} className="relative">
                    {editingThemeId === t.id ? (
                       <div className="flex flex-col md:flex-row gap-6 p-4 border rounded-xl bg-muted/30">
                         <div className="flex-1 space-y-4">
                           <div className="space-y-1.5">
                             <Label className="text-[11px] uppercase font-bold text-muted-foreground">Название темы</Label>
                             <input 
                               className="w-full h-9 text-sm px-3 border rounded-md bg-background focus:ring-1 focus:ring-primary outline-none" 
                               value={editTheme.name} 
                               onChange={e => setEditTheme({...editTheme, name: e.target.value})}
                             />
                           </div>

                           <div className="grid grid-cols-2 gap-2">
                             {(Object.keys(colorLabels) as Array<keyof typeof colorLabels>).map(key => (
                               <button
                                 key={key}
                                 onClick={() => setActiveColorTarget(key)}
                                 className={`flex flex-col items-start p-2 border rounded-lg transition-all ${activeColorPart === key ? 'border-primary ring-1 ring-primary bg-background' : 'bg-background/50 border-transparent hover:border-border'}`}
                               >
                                 <span className="text-[10px] uppercase opacity-60 mb-1">{colorLabels[key]}</span>
                                 <div className="flex items-center gap-2 w-full">
                                   <div className="size-4 rounded-full border border-white/20" style={{ backgroundColor: editTheme[key] }} />
                                   <span className="text-[11px] font-mono uppercase">{editTheme[key]}</span>
                                 </div>
                               </button>
                             ))}
                           </div>

                           <div className="flex gap-2 pt-2">
                              <Button className="flex-1 gap-1.5" onClick={saveCustomTheme}><Save className="w-4 h-4"/> Сохранить</Button>
                              <Button variant="ghost" size="icon" onClick={() => setEditingThemeId(null)}><X className="w-4 h-4"/></Button>
                           </div>
                         </div>

                         <div className="flex flex-col items-center justify-center bg-background/40 rounded-lg p-4 border border-dashed">
                           <HexColorPicker 
                             color={editTheme[activeColorPart]} 
                             onChange={(c) => setEditTheme({ ...editTheme, [activeColorPart]: c })} 
                           />
                           <div className="mt-3 text-center">
                             <span className="text-xs font-semibold">{colorLabels[activeColorPart]}</span>
                           </div>
                         </div>
                       </div>
                    ) : (
                      <div className="flex items-center gap-2 group">
                        <Button
                          variant={appConfig?.appTheme === t.id ? 'default' : 'outline'}
                          className="flex-1 justify-start h-10 px-4 rounded-xl border-2"
                          style={appConfig?.appTheme === t.id ? {} : { borderColor: t.primaryColor, backgroundColor: `${t.bgColor}33` }}
                          onClick={() => patchAppConfig({ appTheme: t.id })}
                        >
                          <div className="size-3 rounded-full mr-3" style={{ backgroundColor: t.primaryColor }} />
                          <span className="font-medium">{t.name}</span>
                        </Button>
                        
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity pr-1">
                          <Button variant="ghost" size="icon" className="size-8" onClick={() => startEditingTheme(t)}><Edit3 className="w-3.5 h-3.5" /></Button>
                          <Button variant="ghost" size="icon" className="size-8 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => deleteCustomTheme(t.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {appConfig?.appTheme === 'custom' && (
            <div className="mt-4 p-3 bg-card border rounded-md">
              <Label className="text-sm">CSS-переменные темы</Label>
              <textarea
                className="w-full mt-2 h-32 p-2 text-xs font-mono bg-background/50 border rounded-md"
                placeholder=".custom { --primary: oklch(...); }"
                value={appConfig?.customThemeCss ?? ''}
                onChange={(e) => patchAppConfig({ customThemeCss: e.target.value })}
              />
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Запуск</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-sm">Запускать при входе в Windows</Label>
            <Switch
              checked={appConfig?.autoLaunch ?? false}
              onCheckedChange={(v) => patchAppConfig({ autoLaunch: v })}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-sm">Тихий старт (без окна)</Label>
            <Switch
              checked={appConfig?.silentStart ?? false}
              onCheckedChange={(v) => patchAppConfig({ silentStart: v })}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-sm">Автозапуск Telegram</Label>
            <Switch
              checked={appConfig?.tgws?.autoStart ?? false}
              onCheckedChange={(v) =>
                patchAppConfig({ tgws: { ...appConfig!.tgws!, autoStart: v } })
              }
            />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-sm">Автозапуск Zapret</Label>
            <Switch
              checked={appConfig?.zapret?.autoStart ?? false}
              onCheckedChange={(v) =>
                patchAppConfig({ zapret: { ...appConfig!.zapret!, autoStart: v } })
              }
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Интерфейс</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex flex-col">
              <Label className="text-sm">Иконка в трее</Label>
              <span className="text-xs text-muted-foreground">
                Если выключена — при нажатии на «X» приложение полностью закрывается и
                завершает работу.
              </span>
            </div>
            <Switch
              checked={!(appConfig?.disableTray ?? false)}
              onCheckedChange={(v) => patchAppConfig({ disableTray: !v })}
            />
          </div>
          <div className="flex items-center justify-between">
            <div className="flex flex-col">
              <Label className="text-sm">Убрать иконку с панели задач</Label>
              <span className="text-xs text-muted-foreground">
                Не работает — если иконка в трее выключена, при нажатии на «X»
                приложение полностью закрывается и завершает работу.
              </span>
            </div>
            <Switch
              checked={appConfig?.hideTaskbarIcon ?? false}
              onCheckedChange={(v) => patchAppConfig({ hideTaskbarIcon: v })}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Дополнительно</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-sm">Отключить аппаратное ускорение (нужен перезапуск)</Label>
            <Switch
              checked={appConfig?.disableGPU ?? false}
              onCheckedChange={(v) => patchAppConfig({ disableGPU: v })}
            />
          </div>
          <Button size="sm" variant="outline" onClick={() => appRelaunch()}>
            Перезапустить приложение
          </Button>
        </CardContent>
      </Card>
      </div>
    </BasePage>
  )
}

export default Settings
