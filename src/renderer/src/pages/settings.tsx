import { useAppConfig } from '@renderer/hooks/use-app-config'
import { Card, CardContent, CardHeader, CardTitle } from '@renderer/components/ui/card'
import { Label } from '@renderer/components/ui/label'
import { Switch } from '@renderer/components/ui/switch'
import { Button } from '@renderer/components/ui/button'
import { appRelaunch } from '@renderer/utils/ipc'
import BasePage from '@renderer/components/base/base-page'
import { RefreshCw } from 'lucide-react'

const themes: AppTheme[] = ['light', 'dark', 'ocean', 'forest', 'amethyst', 'rose', 'custom']
const themeLabels: Record<AppTheme, string> = {
  light: 'Светлая',
  dark: 'Тёмная',
  ocean: 'Океан',
  forest: 'Лес',
  amethyst: 'Аметист',
  rose: 'Роза',
  custom: 'Своя (Custom)'
}

const Settings: React.FC = () => {
  const { appConfig, patchAppConfig } = useAppConfig()

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
            Версия: v{window.electron.process.env.npm_package_version || '1.7.0'}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Внешний вид</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label className="text-sm">Тема</Label>
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
          {appConfig?.appTheme === 'custom' && (
            <div className="mt-4">
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
