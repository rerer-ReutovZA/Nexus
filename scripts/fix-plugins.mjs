import fs from 'fs';
import path from 'path';

const roaming = process.env.APPDATA || (process.platform === 'darwin' ? process.env.HOME + '/Library/Application Support' : '/var/local');

function setup(folder, isBuiltin = false) {
  const base = isBuiltin ? folder : path.join(roaming, folder, 'plugins');
  console.log(`Setting up plugins in: ${base}`);
  if (!fs.existsSync(base)) fs.mkdirSync(base, { recursive: true });

  const writePlugin = (id, manifest, code) => {
    const dir = path.join(base, id);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
    fs.writeFileSync(path.join(dir, 'index.js'), code, 'utf8');
  };

  // 1. Accelerator Interface
  writePlugin('nexus-accelerator', {
    id: "nexus-accelerator", name: "Nexus Accelerator", version: "1.0.0",
    description: "Разблокирует вкладку 'Ускоритель' в главном меню", author: "whymeow", entry: "index.js"
  }, "export function init(context) { return { onShutdown: () => {} }; }");

  // 2. Telegram Bot
  writePlugin('telegram-bot', {
    id: "telegram-bot", name: "Telegram Bot", version: "1.5.0",
    description: "Удаленное управление Nexus через Telegram", author: "whymeow", entry: "index.js"
  }, `export function init(context) {
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
            const kb = [[{ text: "📊 Статус", callback_data: "status" }, { text: "⚙️ Стратегии", callback_data: "list_strat" }], [{ text: "🌐 Zapret ON", callback_data: "z_on" }, { text: "🚀 Accel ON", callback_data: "s_on" }], [{ text: "🔄 Рестарт", callback_data: "relaunch" }]];
            await fetch("https://api.telegram.org/bot" + token + "/sendMessage", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: cid, text: "<b>⚡️ Nexus Remote</b>", parse_mode: "HTML", reply_markup: { inline_keyboard: kb } }) });
          }
        }
        if (u.callback_query) {
          const action = u.callback_query.data;
          const send = (t, kb) => fetch("https://api.telegram.org/bot" + token + "/sendMessage", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: cid, text: "<b>[Nexus]</b> " + t, parse_mode: "HTML", reply_markup: kb ? { inline_keyboard: kb } : undefined }) });
          if (action === "status") {
            const z = context.getZapretStatus(); const t = context.getTgwsStatus();
            await send("Zapret: " + z.state.toUpperCase() + "\\nProxy: " + t.state.toUpperCase());
          } else if (action === "list_strat") {
            const strats = context.listStrategies();
            const kb = strats.slice(0, 15).map(s => [{ text: s.title, callback_data: "set_strat:" + s.file }]);
            await send("Выберите стратегию:", kb);
          } else if (action.startsWith("set_strat:")) {
            const file = action.split(":")[1]; const cur = context.getZapretStatus();
            await context.patchAppConfig({ zapret: { activeStrategy: file } });
            await send("Применяю: " + file);
            if (cur.state === "running") { await context.stopZapret(); setTimeout(() => context.startZapret(), 2000); }
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
  const intr = setInterval(poll, 4000); poll();
  return { onShutdown: () => clearInterval(intr) };
}`);

  // 3. Ad-Blocker
  writePlugin('ad-blocker', {
    id: "ad-blocker", name: "Ad-Blocker", version: "1.3.0",
    description: "Блокировка рекламы через системный hosts", author: "whymeow", entry: "index.js"
  }, `export function init(context) {
  const MARKER_START = "# --- NEXUS AD-BLOCK START ---";
  const MARKER_END = "# --- NEXUS AD-BLOCK END ---";
  const SAFE_LIST = ["doubleclick.net", "adservice.google.com", "googleadservices.com", "adnxs.com", "advertising.com", "mc.yandex.ru"];
  function clean(t) {
    const r = []; let b = false;
    t.split(/\\r?\\n/).forEach(l => {
      if (l.trim() === MARKER_START) b = true;
      else if (l.trim() === MARKER_END) b = false;
      else if (!b) r.push(l);
    });
    return r.join('\\n').trim();
  }
  async function up() {
    try {
      const config = await context.getAppConfig();
      const s = config.pluginSettings?.["ad-blocker"] || { blockAds: true };
      let c = await context.readHosts(); c = clean(c);
      if (s.blockAds !== false) {
        let bt = "\\n\\n" + MARKER_START + "\\n";
        SAFE_LIST.forEach(d => bt += "0.0.0.0 " + d + "\\n0.0.0.0 www." + d + "\\n");
        bt += MARKER_END;
        await context.writeHosts(c + bt);
      } else await context.writeHosts(c + "\\n");
    } catch (e) {}
  }
  up();
  return { onShutdown: async () => { const c = await context.readHosts(); await context.writeHosts(clean(c) + "\\n"); }};
}`);

  // 4. Night Shift
  writePlugin('night-shift', {
    id: "night-shift", name: "Night Shift", version: "1.1.0",
    description: "Авто-темная тема по расписанию", author: "whymeow", entry: "index.js"
  }, `export function init(context) {
  const check = async () => {
    const config = await context.getAppConfig();
    const settings = config.pluginSettings?.["night-shift"] || { startHour: 23, endHour: 8 };
    const hour = new Date().getHours();
    let isNight = settings.startHour < settings.endHour ? (hour >= settings.startHour && hour < settings.endHour) : (hour >= settings.startHour || hour < settings.endHour);
    if (isNight && config.appTheme !== "dark") await context.patchAppConfig({ appTheme: "dark" });
  };
  const interval = setInterval(check, 60000); check();
  return { onShutdown: () => clearInterval(interval) };
}`);

  // 5. Matrix Dashboard
  writePlugin('matrix-dashboard', {
    id: "matrix-dashboard", name: "Matrix Dashboard", version: "1.0.0",
    description: "Визуализатор трафика в стиле Матрицы", author: "whymeow", entry: "index.js"
  }, "export function init(context) { return { onShutdown: () => {} }; }");

  // 6. Discord Presence
  writePlugin('discord-presence', {
    id: "discord-presence", name: "Discord Presence", version: "1.1.0",
    description: "Отображает статус Nexus в Discord", author: "whymeow", entry: "index.js"
  }, `export function init(context) {
  const RPC = context.DiscordRPC;
  const clientId = "1511480397048053961"; 
  let rpc;
  async function connect() {
    try {
      rpc = new (RPC.Client || RPC.default.Client)({ transport: "ipc" });
      rpc.on("ready", () => {
        rpc.setActivity({ details: "Protecting Network", state: "Nexus Active", largeImageKey: "logo", instance: false });
      });
      await rpc.login({ clientId });
    } catch (e) { setTimeout(connect, 30000); }
  }
  connect();
  return { onShutdown: () => { if(rpc) try { rpc.destroy(); } catch(e) {} } };
}`);

  // 7. Twitch Fixer
  writePlugin('twitch-fixer', {
    id: "twitch-fixer", name: "Twitch Fixer", version: "1.0.0",
    description: "Оптимизация под Twitch стримы", author: "whymeow", entry: "index.js"
  }, `export function init(context) {
  context.on("zapret:status", (s) => { if(s.state === "running") context.log("Twitch Fixer: Active"); });
  return { onShutdown: () => {} };
}`);

  // 8. Auto-Fixer
  writePlugin('auto-fixer', {
    id: "auto-fixer", name: "Auto-Fixer", version: "1.0.0",
    description: "Авто-перезапуск Zapret при потере связи", author: "whymeow", entry: "index.js"
  }, `export function init(context) {
  let fails = 0;
  const check = async () => {
    if (context.getZapretStatus().state !== "running") return;
    try { await fetch("https://www.google.com", { method: "HEAD", mode: "no-cors" }); fails = 0; }
    catch (e) { 
      fails++; 
      if (fails >= 3) { context.stopZapret(); setTimeout(() => context.startZapret(), 2000); fails = 0; }
    }
  };
  setInterval(check, 30000);
  return { onShutdown: () => {} };
}`);

  fs.writeFileSync(path.join(base, 'package.json'), JSON.stringify({ type: "module" }), 'utf8');
}

setup('nexus');
setup('nexus-dev');
setup('./resources/builtin-plugins', true);
setup('./plugins', true);
console.log("All plugins fully synced and prepared for bundling!");
