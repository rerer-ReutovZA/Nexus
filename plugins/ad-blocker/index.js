export function init(context) {
  const MARKER_START = "# --- NEXUS AD-BLOCK START ---";
  const MARKER_END = "# --- NEXUS AD-BLOCK END ---";
  function clean(t) {
    const r = []; let b = false;
    t.split(/\r?\n/).forEach(l => {
      if (l.trim() === MARKER_START) b = true;
      else if (l.trim() === MARKER_END) b = false;
      else if (!b) r.push(l);
    });
    return r.join('\n').trim();
  }
  return { onShutdown: async () => { const c = await context.readHosts(); await context.writeHosts(clean(c) + "\n"); }};
}