import { generateKeyPairSync, sign } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const envMocks = vi.hoisted(() => ({ getServerEnv: vi.fn() }));
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
  sourcedFactsSelect: vi.fn(),
  sourcedFactsQueryEq: vi.fn(),
  sourcedFactsQueryIn: vi.fn(),
  sourcedFactsQueryOrder: vi.fn(),
  sourcedFactsQueryError: null as Error | null,
  sourcedFactsQueryRows: [] as unknown[],
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

function researchCommand() {
  return ownerInteraction({ name: "調査事実を追加", type: 1 });
}

function researchSubmission(paste: string, selectedMatchId = matchId) {
  return {
    application_id: discordApplicationId,
    data: {
      components: [
        {
          component: { custom_id: "match_id", values: [selectedMatchId] },
        },
        { component: { custom_id: "facts", value: paste } },
      ],
      custom_id: "research-fact-entry",
    },
    token: discordInteractionToken,
    type: 5,
    user: { id: ownerUserId },
  };
}

function manualSourcedFactRows(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    confidence: "high",
    content_type: "preview",
    fact: `手動事実 ${index + 1}`,
    fetched_at: `2026-08-27T${String(23 - (index % 20)).padStart(2, "0")}:00:00.000Z`,
    metadata: { entry_method: "manual" },
    model_version: "manual",
    source_domain: "example.com",
    source_url: "https://example.com/story",
  }));
}

async function runAfterCallbacks() {
  const callbacks = afterMocks.callbacks.splice(0);
  await Promise.all(callbacks.map((callback) => callback()));
}

function stubFetchWithStatuses(statuses: Record<string, number> = {}) {
  const fetchMock = vi.fn(
    async (input: string | URL | Request, init?: RequestInit) => {
      if (init?.method === "PATCH") return new Response(null, { status: 204 });
      const url = new URL(String(input));
      return new Response(null, {
        status: statuses[url.hostname] ?? 200,
      });
    },
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const matchBuilder = {
  eq: supabaseMocks.matchEq,
  maybeSingle: supabaseMocks.matchMaybeSingle,
  select: supabaseMocks.matchSelect,
};
const candidateMatchBuilder = {
  gte: supabaseMocks.candidateGte,
  lte: supabaseMocks.candidateLte,
};
const sourcedFactsQueryBuilder = {
  eq: supabaseMocks.sourcedFactsQueryEq,
  in: supabaseMocks.sourcedFactsQueryIn,
  order: supabaseMocks.sourcedFactsQueryOrder,
  select: vi.fn().mockReturnThis(),
  then: (
    resolve: (value: { data: unknown[]; error: Error | null }) => unknown,
  ) =>
    Promise.resolve(
      resolve({
        data: supabaseMocks.sourcedFactsQueryRows,
        error: supabaseMocks.sourcedFactsQueryError,
      }),
    ),
};
const sourcedFactsBuilder = { select: supabaseMocks.sourcedFactsSelect };
const sourcedFactsTableBuilder = {
  select: vi.fn(() => sourcedFactsQueryBuilder),
  upsert: supabaseMocks.sourcedFactsUpsert,
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
    supabaseMocks.matchSelect.mockImplementation((columns: string) =>
      columns.includes("home_team") ? candidateMatchBuilder : matchBuilder,
    );
    supabaseMocks.matchEq.mockReturnValue(matchBuilder);
    supabaseMocks.candidateGte.mockReturnValue(candidateMatchBuilder);
    supabaseMocks.candidateLte.mockResolvedValue({ data: [], error: null });
    supabaseMocks.matchMaybeSingle.mockResolvedValue({
      data: { kickoff_at: "2026-08-29T09:00:00.000Z" },
      error: null,
    });
    supabaseMocks.sourcedFactsUpsert.mockReturnValue(sourcedFactsBuilder);
    supabaseMocks.sourcedFactsSelect.mockResolvedValue({
      data: [{ fact: "saved" }],
      error: null,
    });
    supabaseMocks.sourcedFactsQueryRows = [];
    supabaseMocks.sourcedFactsQueryError = null;
    supabaseMocks.sourcedFactsQueryEq.mockReturnValue(sourcedFactsQueryBuilder);
    supabaseMocks.sourcedFactsQueryIn.mockReturnValue(sourcedFactsQueryBuilder);
    supabaseMocks.sourcedFactsQueryOrder.mockReturnValue(
      sourcedFactsQueryBuilder,
    );
    supabaseMocks.from.mockImplementation((table: string) => {
      if (table === "matches") return matchBuilder;
      if (table === "match_sourced_facts") return sourcedFactsTableBuilder;
      throw new Error(`Unexpected table: ${table}`);
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("rejects an invalid signature before accessing the database", async () => {
    const response = await POST(createRequest(researchCommand(), false));
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
        ...researchCommand(),
        user: { id: "987654321098765432" },
      }),
    );
    expect(response.status).toBe(403);
    expect(supabaseMocks.from).not.toHaveBeenCalled();
  });

  it("opens a modal with only a match selector and 4,000-character paste field", async () => {
    supabaseMocks.candidateLte.mockResolvedValue({
      data: [
        {
          away_team: { name: "New Zealand", name_ja: null },
          home_team: { name: "Japan", name_ja: "日本" },
          id: matchId,
          kickoff_at: "2026-08-27T09:00:00.000Z",
        },
      ],
      error: null,
    });

    const response = await POST(createRequest(researchCommand()));
    const payload = await response.json();
    expect(payload.data.components).toHaveLength(2);
    expect(payload.data.components[0].label).toBe("試合");
    expect(payload.data.components[1]).toMatchObject({
      component: { custom_id: "facts", max_length: 4_000, required: true },
      description:
        "### 出典: から始まるブロックを、この試合の分だけ貼ってください。",
      label: "ChatGPT の出力（この試合の部分）",
    });
  });

  it("defers saving and upserts all validated sources with high confidence", async () => {
    const fetchMock = stubFetchWithStatuses();
    supabaseMocks.sourcedFactsSelect.mockResolvedValue({
      data: [{ fact: "事実A" }, { fact: "事実C" }],
      error: null,
    });
    const paste = [
      "## 日本 対 NZ",
      "### 出典: [RNZ](https://www.rnz.co.nz/story?utm_source=chatgpt.com&edition=1)",
      '- 事実A :chatgpt-content-reference{index="1"}',
      "### 出典: https://example.com/report",
      "- 事実B",
      "- 事実C",
    ].join("\n");

    const response = await POST(createRequest(researchSubmission(paste)));
    await expect(response.json()).resolves.toEqual({
      data: { flags: 64 },
      type: 5,
    });
    expect(afterMocks.after).toHaveBeenCalledOnce();
    await runAfterCallbacks();

    const insertedRows = supabaseMocks.sourcedFactsUpsert.mock.calls[0]?.[0];
    expect(insertedRows).toHaveLength(3);
    expect(insertedRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          confidence: "high",
          content_type: "preview",
          fact: "事実A",
          metadata: {
            entry_method: "manual",
            entry_path: "discord_research_paste",
          },
          source_domain: "www.rnz.co.nz",
          source_url: "https://www.rnz.co.nz/story?edition=1",
        }),
        expect.objectContaining({
          fact: "事実B",
          source_domain: "example.com",
        }),
      ]),
    );
    expect(supabaseMocks.sourcedFactsUpsert).toHaveBeenCalledWith(
      expect.any(Array),
      { ignoreDuplicates: true, onConflict: "match_id,content_type,fact" },
    );
    expect(
      fetchMock.mock.calls.filter(([, init]) => init?.method !== "PATCH"),
    ).toHaveLength(2);
    const patchCall = fetchMock.mock.calls.find(
      ([, init]) => init?.method === "PATCH",
    );
    expect(JSON.parse(String(patchCall?.[1]?.body)).content).toBe(
      "保存: 2件（出典 2 本）、重複スキップ: 1件",
    );
  });

  it("uses recap for research facts after kickoff", async () => {
    stubFetchWithStatuses();
    supabaseMocks.matchMaybeSingle.mockResolvedValue({
      data: { kickoff_at: "2026-08-26T09:00:00.000Z" },
      error: null,
    });
    await POST(
      createRequest(
        researchSubmission("### 出典: https://example.com\n- 試合後の事実。"),
      ),
    );
    await runAfterCallbacks();
    expect(supabaseMocks.sourcedFactsUpsert).toHaveBeenCalledWith(
      [expect.objectContaining({ confidence: "high", content_type: "recap" })],
      expect.any(Object),
    );
  });

  it.each([401, 403, 429])(
    "stores a %i source URL as owner verified automatically",
    async (status) => {
      const fetchMock = stubFetchWithStatuses({ "blocked.example": status });
      await POST(
        createRequest(
          researchSubmission(
            "### 出典: https://blocked.example/story\n- 目視確認扱いの事実。",
          ),
        ),
      );
      await runAfterCallbacks();

      expect(supabaseMocks.sourcedFactsUpsert).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            confidence: "high",
            metadata: {
              entry_method: "manual",
              entry_path: "discord_research_paste",
              source_url_check: "owner_verified",
              source_url_http_status: status,
            },
          }),
        ],
        expect.any(Object),
      );
      const patchCall = fetchMock.mock.calls.find(
        ([, init]) => init?.method === "PATCH",
      );
      expect(JSON.parse(String(patchCall?.[1]?.body)).content).toContain(
        `目視確認済みとして保存: blocked.example（HTTP ${status}）`,
      );
    },
  );

  it("stores 403 facts as owner verified and rejects a 404 source independently", async () => {
    const fetchMock = stubFetchWithStatuses({
      "blocked.example": 403,
      "missing.example": 404,
    });
    supabaseMocks.sourcedFactsSelect.mockResolvedValue({
      data: [{ fact: "通常の事実" }, { fact: "ボット拒否サイトの事実" }],
      error: null,
    });
    const paste = [
      "### 出典: https://ok.example/story",
      "- 通常の事実",
      "### 出典: https://blocked.example/story",
      "- ボット拒否サイトの事実",
      "### 出典: https://missing.example/story",
      "- 見つからない出典の事実",
    ].join("\n");

    await POST(createRequest(researchSubmission(paste)));
    await runAfterCallbacks();

    expect(supabaseMocks.sourcedFactsUpsert).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          confidence: "high",
          fact: "通常の事実",
          metadata: {
            entry_method: "manual",
            entry_path: "discord_research_paste",
          },
        }),
        expect.objectContaining({
          confidence: "high",
          fact: "ボット拒否サイトの事実",
          metadata: {
            entry_method: "manual",
            entry_path: "discord_research_paste",
            source_url_check: "owner_verified",
            source_url_http_status: 403,
          },
        }),
      ],
      expect.any(Object),
    );
    const patchCall = fetchMock.mock.calls.find(
      ([, init]) => init?.method === "PATCH",
    );
    const content = JSON.parse(String(patchCall?.[1]?.body)).content as string;
    expect(content).toContain("保存: 2件（出典 2 本）、重複スキップ: 0件");
    expect(content).toContain(
      "目視確認済みとして保存: blocked.example（HTTP 403）",
    );
    expect(content).toContain(
      "保存しなかった出典: https://missing.example/story（出典 URL が HTTP 404 を返しました。）",
    );
    expect(content).not.toContain("見つからない出典の事実");
  });

  it("only checks a repeated source URL once", async () => {
    const fetchMock = stubFetchWithStatuses({ "blocked.example": 429 });
    const paste = [
      "### 出典: https://blocked.example/story?utm_medium=chatgpt",
      "- 事実A",
      "### 出典: https://blocked.example/story",
      "- 事実B",
    ].join("\n");

    await POST(createRequest(researchSubmission(paste)));
    await runAfterCallbacks();

    expect(
      fetchMock.mock.calls.filter(([, init]) => init?.method !== "PATCH"),
    ).toHaveLength(1);
    expect(supabaseMocks.sourcedFactsUpsert).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          fact: "事実A",
          metadata: expect.objectContaining({ source_url_http_status: 429 }),
        }),
        expect.objectContaining({
          fact: "事実B",
          metadata: expect.objectContaining({ source_url_http_status: 429 }),
        }),
      ]),
      expect.any(Object),
    );
  });

  it("preserves the notice for manual facts dropped by the generation cap", async () => {
    const fetchMock = stubFetchWithStatuses();
    supabaseMocks.sourcedFactsQueryRows = manualSourcedFactRows(17);
    const paste = "### 出典: https://example.com/story\n- 新しい事実";

    await POST(createRequest(researchSubmission(paste)));
    await runAfterCallbacks();

    const patchCall = fetchMock.mock.calls.find(
      ([, init]) => init?.method === "PATCH",
    );
    const content = JSON.parse(String(patchCall?.[1]?.body)).content as string;
    expect(content).toContain("次の1件は使われません:");
    expect(content).toContain("- 手動事実 17");
  });

  it("does not append a generation-cap notice for five manual facts", async () => {
    const fetchMock = stubFetchWithStatuses();
    supabaseMocks.sourcedFactsQueryRows = manualSourcedFactRows(5);
    await POST(
      createRequest(
        researchSubmission("### 出典: https://example.com/story\n- 新しい事実"),
      ),
    );
    await runAfterCallbacks();
    const patchCall = fetchMock.mock.calls.find(
      ([, init]) => init?.method === "PATCH",
    );
    expect(JSON.parse(String(patchCall?.[1]?.body)).content).not.toContain(
      "生成に使われる",
    );
  });

  it("notifies the owner when all twelve manual facts will be used", async () => {
    const fetchMock = stubFetchWithStatuses();
    supabaseMocks.sourcedFactsQueryRows = manualSourcedFactRows(12);
    await POST(
      createRequest(
        researchSubmission("### 出典: https://example.com/story\n- 新しい事実"),
      ),
    );
    await runAfterCallbacks();
    const patchCall = fetchMock.mock.calls.find(
      ([, init]) => init?.method === "PATCH",
    );
    expect(JSON.parse(String(patchCall?.[1]?.body)).content).toContain(
      "全件が生成に使われ、自動取得の事実は使われません",
    );
  });

  it("keeps a hundred-manual-fact notice within Discord's content limit", async () => {
    const fetchMock = stubFetchWithStatuses();
    supabaseMocks.sourcedFactsQueryRows = Array.from(
      { length: 100 },
      (_, index) => ({
        ...manualSourcedFactRows(1)[0],
        fact: `手動事実 ${index + 1} ${"長".repeat(100)}`,
      }),
    );
    await POST(
      createRequest(
        researchSubmission("### 出典: https://example.com/story\n- 新しい事実"),
      ),
    );
    await runAfterCallbacks();
    const patchCall = fetchMock.mock.calls.find(
      ([, init]) => init?.method === "PATCH",
    );
    const content = JSON.parse(String(patchCall?.[1]?.body)).content as string;
    expect(content.length).toBeLessThanOrEqual(2_000);
    expect(content).toContain("この試合の手動事実は100件");
    expect(content).toMatch(/…ほか\d+件$/u);
  });

  it("keeps a saved fact successful when generation-counting fails", async () => {
    const fetchMock = stubFetchWithStatuses();
    supabaseMocks.sourcedFactsQueryError = new Error("count failed");
    await POST(
      createRequest(
        researchSubmission("### 出典: https://example.com/story\n- 新しい事実"),
      ),
    );
    await runAfterCallbacks();
    const patchCall = fetchMock.mock.calls.find(
      ([, init]) => init?.method === "PATCH",
    );
    expect(JSON.parse(String(patchCall?.[1]?.body)).content).toContain(
      "（件数の確認に失敗しました）",
    );
    expect(supabaseMocks.sourcedFactsUpsert).toHaveBeenCalledOnce();
  });

  it("rejects a research URL with an invalid scheme without saving", async () => {
    const fetchMock = stubFetchWithStatuses();
    await POST(
      createRequest(
        researchSubmission(
          "### 出典: [不正URL](javascript:alert)\n- 不正URLの事実",
        ),
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
      "出典 URL は http または https で指定してください",
    );
  });

  it("does not save when checking a source URL fails to connect", async () => {
    const fetchMock = vi.fn(
      async (_input: string | URL | Request, init?: RequestInit) => {
        if (init?.method === "PATCH") {
          return new Response(null, { status: 204 });
        }
        throw new TypeError("fetch failed");
      },
    );
    vi.stubGlobal("fetch", fetchMock);
    await POST(
      createRequest(
        researchSubmission(
          "### 出典: https://example.com/story\n- 接続失敗の事実",
        ),
      ),
    );
    await runAfterCallbacks();
    expect(supabaseMocks.sourcedFactsUpsert).not.toHaveBeenCalled();
    const patchCall = fetchMock.mock.calls.find(
      ([, init]) => init?.method === "PATCH",
    );
    expect(JSON.parse(String(patchCall?.[1]?.body)).content).toContain(
      "接続できませんでした",
    );
  });

  it("does not save when source validation times out", async () => {
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
    await POST(
      createRequest(
        researchSubmission(
          "### 出典: https://example.com/story\n- timeoutの事実",
        ),
      ),
    );
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

  it("reports missing source blocks and skipped lines without saving", async () => {
    const fetchMock = stubFetchWithStatuses();
    const paste = [
      "- 出典ブロック外",
      "### 出典: URL が無い",
      "- URL が無いブロックの事実",
      "### 出典: https://example.com/story",
      "- 有効な事実",
      `- ${"長".repeat(301)}`,
      "- **試合前コメント:** 確認できず",
    ].join("\n");

    await POST(createRequest(researchSubmission(paste)));
    await runAfterCallbacks();

    expect(supabaseMocks.sourcedFactsUpsert).toHaveBeenCalledWith(
      [expect.objectContaining({ fact: "有効な事実" })],
      expect.any(Object),
    );
    const patchCall = fetchMock.mock.calls.find(
      ([, init]) => init?.method === "PATCH",
    );
    const content = JSON.parse(String(patchCall?.[1]?.body)).content as string;
    expect(content).toContain(
      "読み飛ばした行: 1行目（出典ブロック外）、3行目（出典ブロック外）、6行目（300字超）、7行目（注記）",
    );
  });

  it("does not save facts under a supplement heading", async () => {
    const fetchMock = stubFetchWithStatuses();
    const paste = [
      "### 出典: https://example.com/story",
      "- 出典に紐づく事実",
      "## 補足",
      "- 出典に紐づかない補足",
    ].join("\n");

    await POST(createRequest(researchSubmission(paste)));
    await runAfterCallbacks();

    const rows = supabaseMocks.sourcedFactsUpsert.mock.calls[0]?.[0];
    expect(rows).toEqual([
      expect.objectContaining({ fact: "出典に紐づく事実" }),
    ]);
    const patchCall = fetchMock.mock.calls.find(
      ([, init]) => init?.method === "PATCH",
    );
    expect(JSON.parse(String(patchCall?.[1]?.body)).content).toContain(
      "読み飛ばした行: 4行目（出典ブロック外）",
    );
  });

  it("says when no source blocks are present", async () => {
    const fetchMock = stubFetchWithStatuses();
    await POST(createRequest(researchSubmission("- 出典のない事実")));
    await runAfterCallbacks();

    expect(supabaseMocks.sourcedFactsUpsert).not.toHaveBeenCalled();
    const patchCall = fetchMock.mock.calls.find(
      ([, init]) => init?.method === "PATCH",
    );
    expect(JSON.parse(String(patchCall?.[1]?.body)).content).toBe(
      "保存できる事実がありませんでした。出典のブロックが見つかりません。\n読み飛ばした行: 1行目（出典ブロック外）",
    );
  });
});
