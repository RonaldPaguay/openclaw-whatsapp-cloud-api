// ---------------------------------------------------------------------------
// Inbound helpers — session key and media staging for the OpenClaw dispatcher
// ---------------------------------------------------------------------------

import { getMediaUrl } from "./api.js";
import type { WhatsAppCloudConfig, Logger } from "./types.js";

/** Meta caps media at 100 MB (documents); images/audio are far smaller. */
const MAX_INBOUND_MEDIA_BYTES = 100 * 1024 * 1024;

/**
 * Session key for a direct conversation with `from`.
 *
 * OpenClaw >= 2026.10 only accepts agent-scoped keys and refuses writes to
 * the legacy `whatsapp-cloud:<from>` form with
 * SessionCanonicalKeyMigrationRequiredError. `doctor --fix` migrates the
 * existing sessions to `agent:<agentId>:whatsapp-cloud:<from>`, so we write
 * that same shape to keep each user's history. Older OpenClaw versions keep
 * the legacy key they already stored.
 */
export function buildSessionKey(rt: any, cfg: any, accountId: string, from: string): string {
  const legacy = `whatsapp-cloud:${from}`;
  if (typeof rt?.config?.current !== "function") return legacy;
  let agentId = "main";
  try {
    const route = rt.channel?.routing?.resolveAgentRoute?.({
      cfg,
      channel: "whatsapp-cloud",
      accountId,
      peer: { kind: "direct", id: from },
    });
    if (route?.agentId) agentId = route.agentId;
  } catch {
    // Routing is only used to pick the agent; fall back to the default one.
  }
  return `agent:${agentId}:${legacy}`;
}

/**
 * Download an inbound attachment from Meta and stage it in OpenClaw's media
 * store, returning the ordered media facts for MsgContext.media.
 *
 * Returns undefined when the runtime has no media store API (OpenClaw < 2026.10)
 * or the download fails; the message still goes through with its text
 * placeholder ("[📄 Document: ...]").
 */
export async function stageInboundMedia(
  rt: any,
  config: WhatsAppCloudConfig,
  media: { id: string; mimeType: string; filename?: string },
  messageId: string,
  log: Logger
): Promise<Array<Record<string, unknown>> | undefined> {
  const save = rt?.channel?.media?.saveResponseMedia;
  if (typeof save !== "function") return undefined;
  try {
    const url = await getMediaUrl(config, media.id, log);
    if (!url) return undefined;
    // The CDN URL requires the same bearer token as the Graph API, so the
    // plugin fetches it and hands the Response to the media store.
    const res = await fetch(url, { headers: { Authorization: `Bearer ${config.accessToken}` } });
    const saved = await save(res, {
      sourceUrl: `whatsapp-cloud:media:${media.id}`,
      subdir: "inbound",
      maxBytes: MAX_INBOUND_MEDIA_BYTES,
      fallbackContentType: media.mimeType,
      ...(media.filename ? { filePathHint: media.filename, originalFilename: media.filename } : {}),
    });
    if (!saved?.path) return undefined;
    log.info?.(`[whatsapp-cloud] inbound media ${media.id} saved to ${saved.path}`);
    return [{ path: saved.path, contentType: saved.contentType ?? media.mimeType, messageId }];
  } catch (err) {
    log.error(`[whatsapp-cloud] inbound media ${media.id} could not be saved: ${err}`);
    return undefined;
  }
}
