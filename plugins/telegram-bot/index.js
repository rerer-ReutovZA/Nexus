export function init(context) {
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
            await send("Zapret: " + z.state + "\nProxy: " + t.state);
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
}