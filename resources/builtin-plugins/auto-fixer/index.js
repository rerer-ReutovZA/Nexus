export function init(context) {
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
}