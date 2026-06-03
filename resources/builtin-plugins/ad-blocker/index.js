export function init(context) {
  const MARKER_START = "# --- NEXUS AD-BLOCK START ---";
  const MARKER_END = "# --- NEXUS AD-BLOCK END ---";
  const SAFE_LIST = ["doubleclick.net", "adservice.google.com", "googleadservices.com", "adnxs.com", "advertising.com", "mc.yandex.ru"];
  function clean(t) {
    const r = []; let b = false;
    t.split(/\r?\n/).forEach(l => {
      if (l.trim() === MARKER_START) b = true;
      else if (l.trim() === MARKER_END) b = false;
      else if (!b) r.push(l);
    });
    return r.join('\n').trim();
  }
  async function up() {
    try {
      const config = await context.getAppConfig();
      const s = config.pluginSettings?.["ad-blocker"] || { blockAds: true };
      let c = await context.readHosts(); c = clean(c);
      if (s.blockAds !== false) {
        let bt = "\n\n" + MARKER_START + "\n";
        SAFE_LIST.forEach(d => bt += "0.0.0.0 " + d + "\n0.0.0.0 www." + d + "\n");
        bt += MARKER_END;
        await context.writeHosts(c + bt);
      } else await context.writeHosts(c + "\n");
    } catch (e) {}
  }
  up();
  return { onShutdown: async () => { const c = await context.readHosts(); await context.writeHosts(clean(c) + "\n"); }};
}