export function init(context) {
  const check = async () => {
    const config = await context.getAppConfig();
    const settings = config.pluginSettings?.["night-shift"] || { startHour: 23, endHour: 8 };
    const hour = new Date().getHours();
    let isNight = settings.startHour < settings.endHour ? (hour >= settings.startHour && hour < settings.endHour) : (hour >= settings.startHour || hour < settings.endHour);
    if (isNight && config.appTheme !== "dark") await context.patchAppConfig({ appTheme: "dark" });
  };
  const interval = setInterval(check, 60000); check();
  return { onShutdown: () => clearInterval(interval) };
}