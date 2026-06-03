export function init(context) {
  const check = async () => {
    const s = (await context.getAppConfig()).pluginSettings?.["night-shift"] || { startHour: 23, endHour: 8 };
    const h = new Date().getHours();
    const isN = s.startHour < s.endHour ? (h >= s.startHour && h < s.endHour) : (h >= s.startHour || h < s.endHour);
    if (isN) await context.patchAppConfig({ appTheme: "dark" });
  };
  setInterval(check, 60000);
  return { onShutdown: () => {} };
}