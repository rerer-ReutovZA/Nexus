export function init(context) {
  context.on("zapret:status", (s) => { if(s.state === "running") context.log("Twitch Fixer: Active"); });
  return { onShutdown: () => {} };
}