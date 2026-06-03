export function init(context) {
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
}