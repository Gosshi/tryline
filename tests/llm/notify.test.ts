import { beforeEach, describe, expect, it, vi } from "vitest";

const getServerEnvMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/env", async () => {
  const actual = await vi.importActual<typeof import("@/lib/env")>("@/lib/env");
  return {
    ...actual,
    getServerEnv: getServerEnvMock,
  };
});

import { notifyContentRejected, notifyCostAlert } from "@/lib/llm/notify";

import type { QaResult } from "@/lib/llm/types";

const qaResult: QaResult = {
  scores: {
    information_density: 2,
    japanese_quality: 3,
    factual_grounding: 4,
  },
  issues: ["tone_mismatch", "insufficient_evidence"],
  verdict: "reject",
};

describe("llm notify", () => {
  beforeEach(() => {
    getServerEnvMock.mockReset();
    vi.restoreAllMocks();
    vi.stubGlobal("fetch", vi.fn());
  });

  it("skips notification when webhook URL is not configured", async () => {
    getServerEnvMock.mockReturnValue({ SLACK_WEBHOOK_URL: undefined });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await notifyContentRejected("match-1", "preview", qaResult);

    expect(fetch).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
  });

  it("posts rejected content notification to configured webhook", async () => {
    getServerEnvMock.mockReturnValue({ SLACK_WEBHOOK_URL: "https://hooks.slack.com/services/T/B/C" });
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response);

    await notifyContentRejected("match-1", "preview", qaResult);

    expect(fetch).toHaveBeenCalledWith(
      "https://hooks.slack.com/services/T/B/C",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }),
    );

    const request = vi.mocked(fetch).mock.calls[0]?.[1];
    expect(request).toBeDefined();
    expect(String((request as RequestInit).body)).toContain("⚠️ コンテンツ却下 [preview]");
    expect(String((request as RequestInit).body)).toContain("試合ID: match-1");
    expect(String((request as RequestInit).body)).toContain("問題点: tone_mismatch / insufficient_evidence");
  });

  it("does not throw when fetch fails", async () => {
    getServerEnvMock.mockReturnValue({ SLACK_WEBHOOK_URL: "https://hooks.slack.com/services/T/B/C" });
    vi.mocked(fetch).mockRejectedValue(new Error("network error"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(notifyCostAlert("match-1", "recap", 0.52, 0.2)).resolves.toBeUndefined();

    expect(errorSpy).toHaveBeenCalled();
  });
});
