// ---------------------------------------------------------------------------
// Runtime accessor — stores the PluginRuntime reference provided by OpenClaw
// ---------------------------------------------------------------------------

// PluginRuntime is provided by OpenClaw at load time via api.runtime.
// We store it here so all modules can access it without circular deps.

let runtime: any = null;

export function setWhatsAppCloudRuntime(next: any): void {
  runtime = next;
}

export function getWhatsAppCloudRuntime(): any {
  if (!runtime) {
    throw new Error(
      "WhatsApp Cloud runtime not initialized — plugin not loaded correctly"
    );
  }
  return runtime;
}

// ---------------------------------------------------------------------------
// Config compat — OpenClaw <= 2026.4.x expone config.loadConfig() /
// config.writeConfigFile(); 2026.4.x los depreca y 2026.10.x los elimina en
// favor de config.current() / config.replaceConfigFile(). Detectamos cual
// existe para que el mismo plugin corra en gateways viejos y nuevos.
// ---------------------------------------------------------------------------

export async function loadRuntimeConfig(rt: any = getWhatsAppCloudRuntime()): Promise<any> {
  if (typeof rt.config?.current === "function") {
    return rt.config.current();
  }
  return await rt.config.loadConfig();
}

export async function writeRuntimeConfig(
  nextConfig: any,
  rt: any = getWhatsAppCloudRuntime()
): Promise<void> {
  if (typeof rt.config?.replaceConfigFile === "function") {
    await rt.config.replaceConfigFile({ nextConfig, afterWrite: { mode: "auto" } });
    return;
  }
  await rt.config.writeConfigFile(nextConfig);
}
