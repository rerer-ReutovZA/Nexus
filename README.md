# Nexus 3.0.0 — The Ultimate Network Shield

Nexus — это современный инструмент для обхода сетевых ограничений на базе Zapret и Telegram WS Proxy, теперь с полноценной системой плагинов и VPN-ускорителем.

## Основные возможности
- **Zapret Engine**: Мощный обход DPI с выбором стратегий.
- **Internet Accelerator**: Полноценный VPN-клиент на базе Sing-box (VLESS/Reality).
- **TUN Mode**: Системный VPN-адаптер для ускорения всех игр и программ.
- **Plugin System**: Масштабируемая архитектура для добавления новых функций.
- **Telegram Remote**: Управляйте своим сетевым щитом прямо с телефона.

---

## 🛠 Система плагинов (Plugin System)

Версия 3.0.0 вводит поддержку пользовательских плагинов. Плагины позволяют расширять возможности Nexus без изменения основного кода.

### Как установить плагины
1. Откройте Nexus и перейдите во вкладку **«Плагины»**.
2. Скопируйте путь к папке плагинов (указан в интерфейсе).
3. Поместите папку с плагином в эту директорию.
4. Нажмите **«Обновить список»** и включите плагин.

### Создание своего плагина
Каждый плагин представляет собой папку, содержащую два файла:
- `manifest.json`: Метаданные плагина.
- `index.js`: Основная логика на JavaScript (ESM).

#### Пример manifest.json
```json
{
  "id": "my-cool-plugin",
  "name": "My Cool Plugin",
  "version": "1.0.0",
  "description": "Описание вашего крутого плагина",
  "author": "YourName",
  "entry": "index.js"
}
```

#### Пример index.js
```javascript
export function init(context) {
  context.log("Плагин инициализирован!");

  // Подписка на события системы
  context.on("zapret:status", (status) => {
    context.log("Статус Zapret изменился: " + status.state);
  });

  // Возвращаем объект с методом очистки
  return {
    onShutdown: () => {
      context.log("Плагин выключен");
    }
  };
}
```

### Доступные инструменты в `context`:
- `context.log(message)`: Запись в системные логи Nexus.
- `context.on(event, callback)`: Слушатель событий (`zapret:status`, `tgws:status`, `appConfigUpdated`).
- `context.emit(event, ...args)`: Отправка событий во все окна интерфейса.
- `context.getAppConfig()`: Получение текущих настроек (асинхронно).
- `context.patchAppConfig(patch)`: Изменение настроек программы.
- `context.getZapretStatus()` / `context.getTgwsStatus()`: Проверка состояния ядер.
- `context.startZapret()` / `context.stopZapret()`: Управление Zapret.
- `context.startSingbox()` / `context.stopSingbox()`: Управление Ускорителем.
- `context.readHosts()` / `context.writeHosts(content)`: Безопасное управление файлом hosts.
- `context.DiscordRPC`: Доступ к библиотеке для управления статусом в Discord.

---

## Сборка и разработка
1. Установите зависимости: `pnpm install`
2. Запустите в режиме разработки: `pnpm dev`
3. Сборка для Windows: `pnpm build:win`

---
**Разработчик:** whymeow  
**Версия:** 3.0.0 "Plugin Era"
