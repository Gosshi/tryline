import { generateKeyPairSync, sign } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const envMocks = vi.hoisted(() => ({
  getServerEnv: vi.fn(),
}));

const afterMocks = vi.hoisted(() => {
  const callbacks: Array<() => Promise<unknown> | unknown> = [];
  return {
    after: vi.fn((callback: () => Promise<unknown> | unknown) => {
      callbacks.push(callback);
    }),
    callbacks,
  };
});

const supabaseMocks = vi.hoisted(() => ({
  candidateGte: vi.fn(),
  candidateLte: vi.fn(),
  from: vi.fn(),
  matchEq: vi.fn(),
  matchMaybeSingle: vi.fn(),
  matchSelect: vi.fn(),
  newsLinkEq: vi.fn(),
  newsLinkMaybeSingle: vi.fn(),
  newsLinkSelect: vi.fn(),
  sourcedFactsSelect: vi.fn(),
  sourcedFactsUpsert: vi.fn(),
}));

vi.mock("@/lib/env", () => envMocks);
vi.mock("@/lib/db/server", () => ({
  getSupabaseServerClient: vi.fn(() => ({ from: supabaseMocks.from })),
}));
vi.mock("next/server", () => ({ after: afterMocks.after }));

import { POST } from "@/app/api/discord/interactions/route";

const ownerUserId = "123456789012345678";
const matchId = "0fd7d8e6-37f9-4b58-82dd-9c2d5592fd64";
const newsLinkId = "1fd7d8e6-37f9-4b58-82dd-9c2d5592fd64";
const sourceUrl = "https://www.rnz.co.nz/news/sport/572252/test-selection";
const discordApplicationId = "999999999999999999";
const discordInteractionToken = "interaction-token";
const timestamp = "1720000000";
const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const publicKeyHex = publicKey
  .export({ format: "der", type: "spki" })
  .subarray(-32)
  .toString("hex");

function createRequest(
  payload: Record<string, unknown>,
  validSignature = true,
) {
  const body = JSON.stringify(payload);
  const signature = sign(
    null,
    Buffer.from(`${timestamp}${body}`),
    privateKey,
  ).toString("hex");

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

function researchCommand() {
  return ownerInteraction({
    name: "調査事実を追加",
    type: 1,
  });
}

function researchSubmission(params: {
  confidence?: string;
  facts: string;
  matchId?: string;
  sourceUrl?: string;
}) {
  return {
    application_id: discordApplicationId,
    data: {
      components: [
        {
          component: {
            custom_id: "match_id",
            values: [params.matchId ?? matchId],
          },
        },
        { component: { custom_id: "facts", value: params.facts } },
        {
          component: {
            custom_id: "source_url",
            value: params.sourceUrl ?? sourceUrl,
          },
        },
        {
          component: {
            custom_id: "confidence",
            values: params.confidence ? [params.confidence] : [],
          },
        },
      ],
      custom_id: "research-fact-entry",
    },
    token: discordInteractionToken,
    type: 5,
    user: { id: ownerUserId },
  };
}

async function runAfterCallbacks() {
  const callbacks = afterMocks.callbacks.splice(0);
  await Promise.all(callbacks.map((callback) => callback()));
}

function stubFetchWithSourceStatus(status = 200) {
  const fetchMock = vi.fn(
    async (_input: string | URL | Request, init?: RequestInit) => {
      if (init?.method === "PATCH") {
        return new Response(null, { status: 204 });
      }
      return new Response(null, { status });
    },
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
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
const candidateMatchBuilder = {
  gte: supabaseMocks.candidateGte,
  lte: supabaseMocks.candidateLte,
};
const sourcedFactsBuilder = {
  select: supabaseMocks.sourcedFactsSelect,
};

describe("POST /api/discord/interactions", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-27T00:00:00.000Z"));
    vi.clearAllMocks();
    afterMocks.callbacks.length = 0;
    envMocks.getServerEnv.mockReturnValue({
      DISCORD_OWNER_USER_ID: ownerUserId,
      DISCORD_PUBLIC_KEY: publicKeyHex,
    });
    supabaseMocks.newsLinkSelect.mockReturnValue(newsLinkBuilder);
    supabaseMocks.newsLinkEq.mockReturnValue(newsLinkBuilder);
    supabaseMocks.matchSelect.mockImplementation((columns: string) =>
      columns.includes("home_team") ? candidateMatchBuilder : matchBuilder,
    );
    supabaseMocks.matchEq.mockReturnValue(matchBuilder);
    supabaseMocks.candidateGte.mockReturnValue(candidateMatchBuilder);
    supabaseMocks.candidateLte.mockResolvedValue({ data: [], error: null });
    supabaseMocks.newsLinkMaybeSingle.mockResolvedValue({
      data: { id: newsLinkId, source_url: sourceUrl },
      error: null,
    });
    supabaseMocks.matchMaybeSingle.mockResolvedValue({
      data: { kickoff_at: "2026-08-29T09:00:00.000Z" },
      error: null,
    });
    supabaseMocks.sourcedFactsUpsert.mockReturnValue(sourcedFactsBuilder);
    supabaseMocks.sourcedFactsSelect.mockResolvedValue({
      data: [{ fact: "saved" }],
      error: null,
    });
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
    vi.unstubAllGlobals();
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

  it("opens a four-field research modal with the nearest 25 matches", async () => {
    const matches = Array.from({ length: 26 }, (_, index) => ({
      away_team: {
        name: index === 0 ? "New Zealand" : `Away ${index}`,
        name_ja: index === 0 ? null : `アウェイ${index}`,
      },
      home_team: {
        name: index === 0 ? "Japan" : `Home ${index}`,
        name_ja: index === 0 ? "日本" : `ホーム${index}`,
      },
      id:
        index === 0
          ? matchId
          : `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
      kickoff_at: new Date(
        Date.parse("2026-08-27T00:00:00.000Z") + index * 60 * 60 * 1_000,
      ).toISOString(),
    })).reverse();
    supabaseMocks.candidateLte.mockResolvedValue({
      data: matches,
      error: null,
    });

    const response = await POST(createRequest(researchCommand()));
    const payload = await response.json();

    expect(payload).toMatchObject({
      data: {
        custom_id: "research-fact-entry",
        title: "調査事実を追加",
      },
      type: 9,
    });
    expect(supabaseMocks.candidateGte).toHaveBeenCalledWith(
      "kickoff_at",
      "2026-08-13T00:00:00.000Z",
    );
    expect(supabaseMocks.candidateLte).toHaveBeenCalledWith(
      "kickoff_at",
      "2026-09-10T00:00:00.000Z",
    );
    expect(payload.data.components).toHaveLength(4);
    expect(
      payload.data.components.every(
        (component: Record<string, unknown>) =>
          component.type === 18 && !("required" in component),
      ),
    ).toBe(true);

    const [matchField, factsField, sourceUrlField, confidenceField] =
      payload.data.components;
    expect(matchField).toMatchObject({
      component: {
        custom_id: "match_id",
        required: true,
        type: 3,
      },
      label: "試合",
    });
    expect(matchField.component.options).toHaveLength(25);
    expect(matchField.component.options[0]).toEqual({
      label: "08/27 日本 × New Zealand",
      value: matchId,
    });
    expect(matchField.component).not.toHaveProperty("min_values");
    expect(matchField.component).not.toHaveProperty("max_values");
    expect(factsField).toMatchObject({
      component: {
        custom_id: "facts",
        required: true,
        style: 2,
        type: 4,
      },
      description:
        "1行に1件・300字以内。主語と数字を明示し、意見や推測は書かない。",
      label: "事実",
    });
    expect(sourceUrlField).toMatchObject({
      component: {
        custom_id: "source_url",
        required: true,
        style: 1,
        type: 4,
      },
      label: "出典 URL",
    });
    expect(confidenceField).toMatchObject({
      component: {
        custom_id: "confidence",
        required: false,
        type: 3,
      },
      label: "確度",
    });
    expect(confidenceField.component).not.toHaveProperty("min_values");
    expect(confidenceField.component).not.toHaveProperty("max_values");
    expect(supabaseMocks.from).toHaveBeenCalledTimes(1);
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

  it("defers and stores normalized research facts with one source check", async () => {
    const fetchMock = stubFetchWithSourceStatus();
    supabaseMocks.sourcedFactsSelect.mockResolvedValue({
      data: [{ fact: "事実A" }, { fact: "事実C" }],
      error: null,
    });

    const response = await POST(
      createRequest(
        researchSubmission({
          confidence: "high",
          facts:
            "## 日本 × New Zealand\n  - 事実A  \n\n### 出典: https://example.com\n* 事実B\n ・ 事実C ",
        }),
      ),
    );

    await expect(response.json()).resolves.toEqual({
      data: { flags: 64 },
      type: 5,
    });
    expect(afterMocks.after).toHaveBeenCalledOnce();
    await runAfterCallbacks();

    expect(supabaseMocks.sourcedFactsUpsert).toHaveBeenCalledWith(
      [
        expect.objectContaining({ fact: "事実A", fact_ja: "事実A" }),
        expect.objectContaining({ fact: "事実B", fact_ja: "事実B" }),
        expect.objectContaining({ fact: "事実C", fact_ja: "事実C" }),
      ],
      {
        ignoreDuplicates: true,
        onConflict: "match_id,content_type,fact",
      },
    );
    const insertedRows = supabaseMocks.sourcedFactsUpsert.mock.calls[0]?.[0];
    expect(insertedRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          confidence: "high",
          content_type: "preview",
          match_id: matchId,
          metadata: {
            entry_method: "manual",
            entry_path: "discord_research_command",
          },
          model_version: "manual",
          source_domain: "www.rnz.co.nz",
          source_url: sourceUrl,
        }),
      ]),
    );
    expect(supabaseMocks.sourcedFactsSelect).toHaveBeenCalledWith("fact");

    const sourceRequests = fetchMock.mock.calls.filter(
      ([, init]) => init?.method !== "PATCH",
    );
    expect(sourceRequests).toHaveLength(1);
    expect(sourceRequests[0]?.[1]).toMatchObject({
      method: "HEAD",
      redirect: "follow",
    });
    const patchCall = fetchMock.mock.calls.find(
      ([, init]) => init?.method === "PATCH",
    );
    expect(patchCall?.[0]).toBe(
      `https://discord.com/api/v10/webhooks/${discordApplicationId}/${discordInteractionToken}/messages/@original`,
    );
    expect(JSON.parse(String(patchCall?.[1]?.body))).toEqual({
      allowed_mentions: { parse: [] },
      content: "保存: 2件、重複スキップ: 1件。",
    });
  });

  it("uses recap and medium defaults for research facts after kickoff", async () => {
    stubFetchWithSourceStatus();
    supabaseMocks.matchMaybeSingle.mockResolvedValue({
      data: { kickoff_at: "2026-08-26T09:00:00.000Z" },
      error: null,
    });

    await POST(createRequest(researchSubmission({ facts: "試合後の事実。" })));
    await runAfterCallbacks();

    expect(supabaseMocks.sourcedFactsUpsert).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          confidence: "medium",
          content_type: "recap",
        }),
      ],
      expect.any(Object),
    );
  });

  it("rejects a research URL with an invalid scheme without saving", async () => {
    const fetchMock = stubFetchWithSourceStatus();

    const response = await POST(
      createRequest(
        researchSubmission({
          facts: "事実。",
          sourceUrl: "javascript:alert(1)",
        }),
      ),
    );
    await expect(response.json()).resolves.toEqual({
      data: { flags: 64 },
      type: 5,
    });
    await runAfterCallbacks();

    expect(supabaseMocks.sourcedFactsUpsert).not.toHaveBeenCalled();
    expect(
      fetchMock.mock.calls.filter(([, init]) => init?.method !== "PATCH"),
    ).toHaveLength(0);
    const patchCall = fetchMock.mock.calls.find(
      ([, init]) => init?.method === "PATCH",
    );
    expect(JSON.parse(String(patchCall?.[1]?.body)).content).toContain(
      "http または https",
    );
  });

  it("does not save any research facts when the source returns 404", async () => {
    const fetchMock = stubFetchWithSourceStatus(404);

    await POST(createRequest(researchSubmission({ facts: "事実A\n事実B" })));
    await runAfterCallbacks();

    expect(supabaseMocks.sourcedFactsUpsert).not.toHaveBeenCalled();
    const patchCall = fetchMock.mock.calls.find(
      ([, init]) => init?.method === "PATCH",
    );
    expect(JSON.parse(String(patchCall?.[1]?.body)).content).toContain(
      "HTTP 404",
    );
  });

  it("does not save any research facts when the source connection fails", async () => {
    const fetchMock = vi.fn(
      async (_input: string | URL | Request, init?: RequestInit) => {
        if (init?.method === "PATCH") {
          return new Response(null, { status: 204 });
        }
        throw new TypeError("fetch failed");
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    await POST(createRequest(researchSubmission({ facts: "事実A\n事実B" })));
    await runAfterCallbacks();

    expect(supabaseMocks.sourcedFactsUpsert).not.toHaveBeenCalled();
    const patchCall = fetchMock.mock.calls.find(
      ([, init]) => init?.method === "PATCH",
    );
    expect(JSON.parse(String(patchCall?.[1]?.body)).content).toContain(
      "接続できませんでした",
    );
  });

  it("does not save any research facts when the source check times out", async () => {
    const fetchMock = vi.fn(
      async (_input: string | URL | Request, init?: RequestInit) => {
        if (init?.method === "PATCH") {
          return new Response(null, { status: 204 });
        }

        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        });
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    await POST(createRequest(researchSubmission({ facts: "事実A\n事実B" })));
    const afterPromise = runAfterCallbacks();
    await vi.advanceTimersByTimeAsync(5_000);
    await afterPromise;

    expect(supabaseMocks.sourcedFactsUpsert).not.toHaveBeenCalled();
    const patchCall = fetchMock.mock.calls.find(
      ([, init]) => init?.method === "PATCH",
    );
    expect(JSON.parse(String(patchCall?.[1]?.body)).content).toContain(
      "5 秒でタイムアウト",
    );
  });

  it("rejects research submissions with no facts after normalization", async () => {
    const fetchMock = stubFetchWithSourceStatus();

    await POST(createRequest(researchSubmission({ facts: " \n - \n ・ " })));
    await runAfterCallbacks();

    expect(supabaseMocks.sourcedFactsUpsert).not.toHaveBeenCalled();
    expect(
      fetchMock.mock.calls.filter(([, init]) => init?.method !== "PATCH"),
    ).toHaveLength(0);
    const patchCall = fetchMock.mock.calls.find(
      ([, init]) => init?.method === "PATCH",
    );
    expect(JSON.parse(String(patchCall?.[1]?.body)).content).toContain(
      "有効な事実が1件もありません",
    );
  });

  it("rejects a research submission containing only headings", async () => {
    const fetchMock = stubFetchWithSourceStatus();

    await POST(
      createRequest(
        researchSubmission({
          facts: "## 日本 × New Zealand\n### 出典: https://example.com",
        }),
      ),
    );
    await runAfterCallbacks();

    expect(supabaseMocks.sourcedFactsUpsert).not.toHaveBeenCalled();
    expect(
      fetchMock.mock.calls.filter(([, init]) => init?.method !== "PATCH"),
    ).toHaveLength(0);
    const patchCall = fetchMock.mock.calls.find(
      ([, init]) => init?.method === "PATCH",
    );
    expect(JSON.parse(String(patchCall?.[1]?.body)).content).toContain(
      "有効な事実が1件もありません",
    );
  });

  it("identifies the original line when a research fact exceeds 300 characters", async () => {
    const fetchMock = stubFetchWithSourceStatus();

    await POST(
      createRequest(
        researchSubmission({ facts: `短い事実。\n${"長".repeat(301)}` }),
      ),
    );
    await runAfterCallbacks();

    expect(supabaseMocks.sourcedFactsUpsert).not.toHaveBeenCalled();
    expect(
      fetchMock.mock.calls.filter(([, init]) => init?.method !== "PATCH"),
    ).toHaveLength(0);
    const patchCall = fetchMock.mock.calls.find(
      ([, init]) => init?.method === "PATCH",
    );
    expect(JSON.parse(String(patchCall?.[1]?.body)).content).toBe(
      "2行目が300文字を超えています。",
    );
  });
});
