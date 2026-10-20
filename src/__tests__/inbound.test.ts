import { describe, it, expect, vi, beforeEach } from "vitest";
import type { WhatsAppCloudConfig } from "../types.js";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { buildSessionKey, stageInboundMedia } from "../inbound.js";

const mockLog = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
const config = { phoneNumberId: "123", accessToken: "tok", apiVersion: "v21.0" } as unknown as WhatsAppCloudConfig;
const rt105 = (extra: any = {}) => ({ config: { current: () => ({}) }, channel: extra });

describe("buildSessionKey", () => {
  it("keeps the legacy key on OpenClaw < 2026.10", () => {
    expect(buildSessionKey({ config: { loadConfig: async () => ({}) } }, {}, "default", "593999")).toBe(
      "whatsapp-cloud:593999"
    );
  });

  it("uses the agent-scoped key on OpenClaw >= 2026.10", () => {
    expect(buildSessionKey(rt105(), {}, "default", "593999")).toBe("agent:main:whatsapp-cloud:593999");
  });

  it("takes the agent from routing when available", () => {
    const rt = rt105({ routing: { resolveAgentRoute: () => ({ agentId: "ventas" }) } });
    expect(buildSessionKey(rt, {}, "default", "593999")).toBe("agent:ventas:whatsapp-cloud:593999");
  });

  it("falls back to main when routing throws", () => {
    const rt = rt105({ routing: { resolveAgentRoute: () => { throw new Error("x"); } } });
    expect(buildSessionKey(rt, {}, "default", "593999")).toBe("agent:main:whatsapp-cloud:593999");
  });
});

describe("stageInboundMedia", () => {
  beforeEach(() => mockFetch.mockReset());

  it("returns undefined without a media store API", async () => {
    expect(await stageInboundMedia({ channel: {} }, config, { id: "m1", mimeType: "image/png" }, "w1", mockLog)).toBeUndefined();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("downloads with the bearer token and returns ordered media facts", async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ url: "https://cdn.example/m1" }) })
      .mockResolvedValueOnce({ ok: true, body: "binary" });
    const save = vi.fn().mockResolvedValue({ path: "/media/inbound/r.xlsx", contentType: "application/vnd.ms-excel" });
    const facts = await stageInboundMedia(
      { channel: { media: { saveResponseMedia: save } } },
      config,
      { id: "m1", mimeType: "application/vnd.ms-excel", filename: "r.xlsx" },
      "w1",
      mockLog
    );
    expect(mockFetch.mock.calls[1][0]).toBe("https://cdn.example/m1");
    expect(mockFetch.mock.calls[1][1].headers.Authorization).toBe("Bearer tok");
    expect(save.mock.calls[0][1]).toMatchObject({ subdir: "inbound", filePathHint: "r.xlsx" });
    expect(facts).toEqual([{ path: "/media/inbound/r.xlsx", contentType: "application/vnd.ms-excel", messageId: "w1" }]);
  });

  it("returns undefined when saving fails", async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ url: "https://cdn.example/m1" }) })
      .mockResolvedValueOnce({ ok: false, status: 404 });
    const save = vi.fn().mockRejectedValue(new Error("404"));
    const facts = await stageInboundMedia(
      { channel: { media: { saveResponseMedia: save } } }, config, { id: "m1", mimeType: "image/png" }, "w1", mockLog
    );
    expect(facts).toBeUndefined();
    expect(mockLog.error).toHaveBeenCalled();
  });
});
