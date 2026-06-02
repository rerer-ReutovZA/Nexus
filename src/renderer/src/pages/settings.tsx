import { useAppConfig } from '@renderer/hooks/use-app-config'
import { Card, CardContent, CardHeader, CardTitle } from '@renderer/components/ui/card'
import { Label } from '@renderer/components/ui/label'
import { Switch } from '@renderer/components/ui/switch'
import { Button } from '@renderer/components/ui/button'
import { appRelaunch } from '@renderer/utils/ipc'
import BasePage from '@renderer/components/base/base-page'
import { RefreshCw, Plus, X, Edit3, Trash2, Save } from 'lucide-react'
import { useState } from 'react'

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
  const [editTheme, setEditTheme] = useState({
    name: '', bgColor: '#000000', cardColor: '#1a1a1a', primaryColor: '#ff0000', textColor: '#ffffff'
  })

  const addCustomTheme = () => {
    const id = `custom_${Date.now()}`
    const newTheme = {
      id,
      name: 'Новая тема',
      bgColor: '#111111',
      cardColor: '#222222',
      primaryColor: '#00ffcc',
      textColor: '#ffffff'
    }
    patchAppConfig({ customThemes: [...customThemes, newTheme] })
    startEditingTheme(newTheme)
  }

  const startEditingTheme = (t: any) => {
    setEditingThemeId(t.id)
    setEditTheme({ name: t.name, bgColor: t.bgColor, cardColor: t.cardColor, primaryColor: t.primaryColor, textColor: t.textColor })
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
          <div className="flex items-center justify-between mt-2">
            <Label className="text-sm">Тихое автообновление</Label>
            <Switch
              checked={appConfig?.silentAutoUpdate ?? false}
              onCheckedChange={(v) => patchAppConfig({ silentAutoUpdate: v })}
            />
          </div>
          <div className="text-xs text-muted-foreground">
            Версия: v{window.electron.process.env.npm_package_version || '1.8.0'}
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
            <Label className="text-sm">Встроенные темы</Label>
            <div className="flex flex-wrap gap-2 mt-2">
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
            <div className="pt-2 border-t mt-3">
              <Label className="text-sm">Мои палитры</Label>
              <div className="flex flex-wrap gap-2 mt-2">
                {customThemes.map((t) => (
                  <div key={t.id} className="relative group">
                    {editingThemeId === t.id ? (
                       <div className="flex flex-col gap-2 p-3 border rounded-md bg-muted/50 w-[240px]">
                         <input 
                           className="h-8 text-xs px-2 border rounded bg-background" 
                           value={editTheme.name} 
                           onChange={e => setEditTheme({...editTheme, name: e.target.value})}
                           placeholder="Название"
                         />
                         <div className="grid grid-cols-2 gap-2 text-xs">
                           <label className="flex flex-col gap-1">Фон <input type="color" value={editTheme.bgColor} onChange={e => setEditTheme({...editTheme, bgColor: e.target.value})} className="h-6 w-full cursor-pointer" /></label>
                           <label className="flex flex-col gap-1">Карточки <input type="color" value={editTheme.cardColor} onChange={e => setEditTheme({...editTheme, cardColor: e.target.value})} className="h-6 w-full cursor-pointer" /></label>
                           <label className="flex flex-col gap-1">Акцент <input type="color" value={editTheme.primaryColor} onChange={e => setEditTheme({...editTheme, primaryColor: e.target.value})} className="h-6 w-full cursor-pointer" /></label>
                           <label className="flex flex-col gap-1">Текст <input type="color" value={editTheme.textColor} onChange={e => setEditTheme({...editTheme, textColor: e.target.value})} className="h-6 w-full cursor-pointer" /></label>
                         </div>
                         <div className="flex gap-1 mt-1">
                            <Button size="sm" className="h-7 flex-1 text-xs" onClick={saveCustomTheme}><Save className="w-3 h-3 mr-1"/> Сохранить</Button>
                            <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setEditingThemeId(null)}><X className="w-3 h-3"/></Button>
                         </div>
                       </div>
                    ) : (
                      <Button
                        size="sm"
                        variant={appConfig?.appTheme === t.id ? 'default' : 'outline'}
                        className="pr-12 relative"
                        onClick={() => patchAppConfig({ appTheme: t.id })}
                      >
                        {t.name}
                        <div className="absolute right-1 top-1/2 -translate-y-1/2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            className="p-1 hover:bg-accent rounded text-muted-foreground hover:text-foreground"
                            onClick={(e) => { e.stopPropagation(); startEditingTheme(t); }}
                          >
                            <Edit3 className="w-3 h-3" />
                          </button>
                          <button
                            className="p-1 hover:bg-destructive/20 rounded text-muted-foreground hover:text-destructive"
                            onClick={(e) => { e.stopPropagation(); deleteCustomTheme(t.id); }}
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </Button>
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
