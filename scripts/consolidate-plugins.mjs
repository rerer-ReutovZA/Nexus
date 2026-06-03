import fs from 'fs';
import path from 'path';

const pluginsDir = './plugins';

function writePlugin(id, name, desc, code) {
  const dir = path.join(pluginsDir, id);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({
    id,
    name,
    version: "1.0.0",
    description: desc,
    author: "whymeow",
    entry: "index.js"
  }, null, 2), 'utf8');

  fs.writeFileSync(path.join(dir, 'index.js'), code, 'utf8');
}

// 1. Accelerator
writePlugin('nexus-accelerator', 'Nexus Accelerator', 'Разблокирует вкладку "Ускоритель" для VPN-подписок', 
  "export function init(context) { context.log('Accelerator interface unlocked.'); return { onShutdown: () => {} }; }"
);

// 2. Telegram Bot
writePlugin('telegram-bot', 'Telegram Bot', 'Дистанционное управление через Telegram', 
  `export function init(context) {
  let lastId = 0;
  const poll = async () => {
    try {
      const config = await context.getAppConfig();
      const { token, chatId: auth } = config.pluginSettings?.["telegram-bot"] || {};
      if (!token) return;
      const res = await fetch("https://api.telegram.org/bot" + token + "/getUpdates?offset=" + (lastId + 1) + "&timeout=10");
      const data = await res.json();
      if (!data.ok) return;
      for (const u of data.result) {
        lastId = u.update_id;
        const cid = (u.message?.chat.id || u.callback_query?.message.chat.id || "").toString();
        if (auth && auth !== cid) continue;
        if (u.message?.text) {
          const text = u.message.text.trim().toLowerCase();
          if (text === "/start" || text === "меню") {
            const kb = [
              [{ text: "📊 Статус", callback_data: "status" }, { text: "⚙️ Стратегии", callback_data: "list_strat" }],
              [{ text: "🌐 Zapret", callback_data: "z_menu" }, { text: "🚀 Ускоритель", callback_data: "s_menu" }],
              [{ text: "🔄 Рестарт", callback_data: "relaunch" }]
            ];
            await fetch("https://api.telegram.org/bot" + token + "/sendMessage", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: cid, text: "<b>⚡️ Nexus Remote</b>", parse_mode: "HTML", reply_markup: { inline_keyboard: kb } }) });
          }
        }
        if (u.callback_query) {
          const action = u.callback_query.data;
          const send = (t) => fetch("https://api.telegram.org/bot" + token + "/sendMessage", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: cid, text: "<b>[Nexus]</b> " + t, parse_mode: "HTML" }) });
          if (action === "status") {
            const z = context.getZapretStatus(); const t = context.getTgwsStatus();
            await send("Zapret: " + z.state + "\\nProxy: " + t.state);
          } else if (action === "z_on") { await context.startZapret(); await send("Zapret ON"); }
          else if (action === "z_off") { await context.stopZapret(); await send("Zapret OFF"); }
          else if (action === "s_on") { await context.startSingbox(); await send("Accelerator ON"); }
          else if (action === "s_off") { await context.stopSingbox(); await send("Accelerator OFF"); }
          else if (action === "relaunch") { await send("Relaunching..."); setTimeout(() => process.exit(0), 1000); }
          await fetch("https://api.telegram.org/bot" + token + "/answerCallbackQuery", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ callback_query_id: u.callback_query.id }) });
        }
      }
    } catch (e) {}
  };
  setInterval(poll, 4000);
  return { onShutdown: () => {} };
}`
);

// 3. Ad-Blocker
writePlugin('ad-blocker', 'Ad-Blocker', 'Блокировка рекламы через системный hosts', 
  `export function init(context) {
  const MARKER_START = "# --- NEXUS AD-BLOCK START ---";
  const MARKER_END = "# --- NEXUS AD-BLOCK END ---";
  function clean(t) {
    const r = []; let b = false;
    t.split(/\\r?\\n/).forEach(l => {
      if (l.trim() === MARKER_START) b = true;
      else if (l.trim() === MARKER_END) b = false;
      else if (!b) r.push(l);
    });
    return r.join('\\n').trim();
  }
  return { onShutdown: async () => { const c = await context.readHosts(); await context.writeHosts(clean(c) + "\\n"); }};
}`
);

// 4. Night Shift
writePlugin('night-shift', 'Night Shift', 'Автоматическая темная тема', 
  `export function init(context) {
  const check = async () => {
    const s = (await context.getAppConfig()).pluginSettings?.["night-shift"] || { startHour: 23, endHour: 8 };
    const h = new Date().getHours();
    const isN = s.startHour < s.endHour ? (h >= s.startHour && h < s.endHour) : (h >= s.startHour || h < s.endHour);
    if (isN) await context.patchAppConfig({ appTheme: "dark" });
  };
  setInterval(check, 60000);
  return { onShutdown: () => {} };
}`
);

// 5. Matrix Dashboard
writePlugin('matrix-dashboard', 'Matrix Dashboard', 'Визуализатор трафика в стиле Матрицы', 
  "export function init(context) { context.log('Matrix Dashboard Active'); return { onShutdown: () => {} }; }"
);

console.log("Plugins consolidated in ./plugins folder!");
