import { generateKeyPairSync, sign } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const envMocks = vi.hoisted(() => ({
  getServerEnv: vi.fn(),
}));

const supabaseMocks = vi.hoisted(() => ({
  from: vi.fn(),
  matchEq: vi.fn(),
  matchMaybeSingle: vi.fn(),
  matchSelect: vi.fn(),
  newsLinkEq: vi.fn(),
  newsLinkMaybeSingle: vi.fn(),
  newsLinkSelect: vi.fn(),
  sourcedFactsUpsert: vi.fn(),
}));

vi.mock("@/lib/env", () => envMocks);
vi.mock("@/lib/db/server", () => ({
  getSupabaseServerClient: vi.fn(() => ({ from: supabaseMocks.from })),
}));

import { POST } from "@/app/api/discord/interactions/route";

const ownerUserId = "123456789012345678";
const matchId = "0fd7d8e6-37f9-4b58-82dd-9c2d5592fd64";
const newsLinkId = "1fd7d8e6-37f9-4b58-82dd-9c2d5592fd64";
const sourceUrl = "https://www.rnz.co.nz/news/sport/572252/test-selection";
const timestamp = "1720000000";
const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const publicKeyHex = publicKey
  .export({ format: "der", type: "spki" })
  .subarray(-32)
  .toString("hex");

function createRequest(payload: Record<string, unknown>, validSignature = true) {
  const body = JSON.stringify(payload);
  const signature = sign(null, Buffer.from(`${timestamp}${body}`), privateKey).toString(
    "hex",
  );

  return new Request("http://localhost/api/discord/interactions", {
    body,
    headers: {
      "Content-Type": "application/json",
      "X-Signature-Ed25519": validSignature ? signature : "00",
      "X-Signature-Timestamp": timestamp,
    },
    method: "POST",
  });
}

function ownerInteraction(data: Record<string, unknown>) {
  return { data, type: 2, user: { id: ownerUserId } };
}

function notificationCommand() {
  return ownerInteraction({
    name: "事実を追加",
    resolved: {
      messages: {
        "message-1": {
          content: `🗞 8/29 South Africa × New Zealand\n記事見出し\n${sourceUrl}\nmatch_id: ${matchId}`,
        },
      },
    },
    target_id: "message-1",
    type: 3,
  });
}

const newsLinkBuilder = {
  eq: supabaseMocks.newsLinkEq,
  maybeSingle: supabaseMocks.newsLinkMaybeSingle,
  select: supabaseMocks.newsLinkSelect,
};
const matchBuilder = {
  eq: supabaseMocks.matchEq,
  maybeSingle: supabaseMocks.matchMaybeSingle,
  select: supabaseMocks.matchSelect,
};

describe("POST /api/discord/interactions", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-27T00:00:00.000Z"));
    vi.clearAllMocks();
    envMocks.getServerEnv.mockReturnValue({
      DISCORD_OWNER_USER_ID: ownerUserId,
      DISCORD_PUBLIC_KEY: publicKeyHex,
    });
    supabaseMocks.newsLinkSelect.mockReturnValue(newsLinkBuilder);
    supabaseMocks.newsLinkEq.mockReturnValue(newsLinkBuilder);
    supabaseMocks.matchSelect.mockReturnValue(matchBuilder);
    supabaseMocks.matchEq.mockReturnValue(matchBuilder);
    supabaseMocks.newsLinkMaybeSingle.mockResolvedValue({
      data: { id: newsLinkId, source_url: sourceUrl },
      error: null,
    });
    supabaseMocks.matchMaybeSingle.mockResolvedValue({
      data: { kickoff_at: "2026-08-29T09:00:00.000Z" },
      error: null,
    });
    supabaseMocks.sourcedFactsUpsert.mockResolvedValue({ error: null });
    supabaseMocks.from.mockImplementation((table: string) => {
      if (table === "news_links") return newsLinkBuilder;
      if (table === "matches") return matchBuilder;
      if (table === "match_sourced_facts") {
        return { upsert: supabaseMocks.sourcedFactsUpsert };
      }
      throw new Error(`Unexpected table: ${table}`);
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("rejects an invalid Ed25519 signature before accessing the database", async () => {
    const response = await POST(createRequest(notificationCommand(), false));

    expect(response.status).toBe(401);
    expect(supabaseMocks.from).not.toHaveBeenCalled();
  });

  it("returns PONG for a signed Discord PING", async () => {
    const response = await POST(createRequest({ type: 1 }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ type: 1 });
  });

  it("rejects an interaction invoked by anyone other than the owner", async () => {
    const response = await POST(
      createRequest({
        ...notificationCommand(),
        user: { id: "987654321098765432" },
      }),
    );

    expect(response.status).toBe(403);
    expect(supabaseMocks.from).not.toHaveBeenCalled();
  });

  it("returns an explicit error instead of inferring data from another message", async () => {
    const response = await POST(
      createRequest(
        ownerInteraction({
          name: "事実を追加",
          resolved: { messages: { "message-1": { content: "雑談です" } } },
          target_id: "message-1",
          type: 3,
        }),
      ),
    );

    await expect(response.json()).resolves.toEqual({
      data: { content: "この形式のメッセージではありません。", flags: 64 },
      type: 4,
    });
    expect(supabaseMocks.from).not.toHaveBeenCalled();
  });

  it("opens a two-field modal for a notification message", async () => {
    const response = await POST(createRequest(notificationCommand()));
    const payload = await response.json();

    expect(payload).toMatchObject({
      data: {
        custom_id: `fact-entry:${matchId}:${newsLinkId}`,
        title: "事実を追加",
      },
      type: 9,
    });
    expect(payload.data.components).toHaveLength(2);
    expect(payload.data.components[0]).toMatchObject({
      label: "事実",
      type: 18,
    });
    expect(payload.data.components[0]).not.toHaveProperty("required");
    expect(payload.data.components[0].component).toMatchObject({
      custom_id: "fact",
      required: true,
      style: 2,
      type: 4,
    });
    expect(payload.data.components[1]).toMatchObject({
      label: "確度",
      type: 18,
    });
    expect(payload.data.components[1]).not.toHaveProperty("required");
    expect(payload.data.components[1].component).toMatchObject({
      custom_id: "confidence",
      required: false,
      type: 3,
    });
    expect(payload.data.components[1].component).not.toHaveProperty(
      "min_values",
    );
    expect(payload.data.components[1].component).not.toHaveProperty(
      "max_values",
    );
  });

  it("rejects a notification that is not backed by its news link record", async () => {
    supabaseMocks.newsLinkMaybeSingle.mockResolvedValue({
      data: null,
      error: null,
    });

    const response = await POST(createRequest(notificationCommand()));

    await expect(response.json()).resolves.toEqual({
      data: { content: "この形式のメッセージではありません。", flags: 64 },
      type: 4,
    });
  });

  it("stores a manual fact with preview content type before kickoff", async () => {
    const response = await POST(
      createRequest({
        data: {
          components: [
            { component: { custom_id: "fact", value: "先発に変更があった。" } },
            { component: { custom_id: "confidence", values: ["high"] } },
          ],
          custom_id: `fact-entry:${matchId}:${newsLinkId}`,
        },
        type: 5,
        user: { id: ownerUserId },
      }),
    );

    await expect(response.json()).resolves.toEqual({
      data: { content: "事実を追加しました。", flags: 64 },
      type: 4,
    });
    expect(supabaseMocks.sourcedFactsUpsert).toHaveBeenCalledWith(
      {
        confidence: "high",
        content_type: "preview",
        fact: "先発に変更があった。",
        fact_ja: "先発に変更があった。",
        match_id: matchId,
        metadata: { entry_method: "manual" },
        model_version: "manual",
        source_domain: "www.rnz.co.nz",
        source_url: sourceUrl,
      },
      { onConflict: "match_id,content_type,fact" },
    );
  });

  it("uses recap content type and medium confidence after kickoff", async () => {
    supabaseMocks.matchMaybeSingle.mockResolvedValue({
      data: { kickoff_at: "2026-08-26T09:00:00.000Z" },
      error: null,
    });

    await POST(
      createRequest({
        data: {
          components: [
            { components: [{ custom_id: "fact", value: "試合後の事実。" }] },
            { components: [{ custom_id: "confidence", values: [] }] },
          ],
          custom_id: `fact-entry:${matchId}:${newsLinkId}`,
        },
        type: 5,
        user: { id: ownerUserId },
      }),
    );

    expect(supabaseMocks.sourcedFactsUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ confidence: "medium", content_type: "recap" }),
      { onConflict: "match_id,content_type,fact" },
    );
  });
});
