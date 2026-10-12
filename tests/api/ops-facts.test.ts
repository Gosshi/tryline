import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  from: vi.fn(),
  in: vi.fn(),
  maybeSingle: vi.fn(),
  save: vi.fn(),
  decide: vi.fn(),
  validate: vi.fn(),
  generate: vi.fn(),
  notFound: vi.fn(() => {
    throw Object.assign(new Error("not found"), {
      digest: "NEXT_HTTP_ERROR_FALLBACK;404",
    });
  }),
}));
vi.mock("@/lib/auth/server", () => ({ getUser: mocks.getUser }));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));
vi.mock("@/lib/db/server", () => ({
  getSupabaseServerClient: () => ({ from: mocks.from }),
}));
vi.mock("@/lib/sourced-facts/manual-entry", () => ({
  saveManualResearchFacts: mocks.save,
  decideManualFactRegeneration: mocks.decide,
}));
vi.mock("@/lib/discord/source-url", () => ({
  validateSourceUrl: mocks.validate,
}));
vi.mock("@/lib/llm/pipeline", () => ({ generateMatchContent: mocks.generate }));
vi.mock("@/app/ops/facts/bulk-fact-paste-form", () => ({
  BulkFactPasteForm: () => null,
}));

import { POST as preview } from "@/app/api/ops/facts/preview/route";
import {
  POST as regenerate,
  maxDuration,
} from "@/app/api/ops/facts/regenerate/route";
import { POST as save } from "@/app/api/ops/facts/save/route";
import OpsFactsPage, { metadata } from "@/app/ops/facts/page";
import robots from "@/app/robots";

const fixture = readFileSync(
  "tests/fixtures/ops-bulk-research-paste.md",
  "utf8",
);
const ids = [
  "1e74662b-af45-4ef1-b267-156eb87329d5",
  "00000000-0000-4000-8000-000000000001",
];
const matches = ids.map((id) => ({
  id,
  kickoff_at: "2999-01-01T00:00:00Z",
  status: "scheduled",
  home_team: { name: "Home", name_ja: "ホーム" },
  away_team: { name: "Away", name_ja: "アウェイ" },
}));
function request(body: object, origin = "https://www.trylinerugby.com") {
  return new Request("https://www.trylinerugby.com/api/ops/facts", {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
const originalOwnerIds = process.env.OPS_OWNER_USER_IDS;
beforeEach(() => {
  vi.clearAllMocks();
  process.env.OPS_OWNER_USER_IDS = "owner";
  mocks.getUser.mockResolvedValue({ id: "owner" });
  mocks.in.mockResolvedValue({ data: matches, error: null });
  mocks.maybeSingle.mockResolvedValue({
    data: { kickoff_at: "2999-01-01T00:00:00Z" },
    error: null,
  });
  const builder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: mocks.in,
    maybeSingle: mocks.maybeSingle,
  };
  mocks.from.mockReturnValue(builder);
  mocks.save.mockResolvedValue({
    savedCount: 1,
    duplicateCount: 0,
    contentType: "preview",
    rejectedSources: [],
    matchMissing: false,
  });
  mocks.decide.mockResolvedValue("regenerate");
  mocks.generate.mockResolvedValue({ status: "published" });
});
afterEach(() => {
  if (originalOwnerIds === undefined) delete process.env.OPS_OWNER_USER_IDS;
  else process.env.OPS_OWNER_USER_IDS = originalOwnerIds;
});

function expectNoEffects() {
  expect(mocks.from).not.toHaveBeenCalled();
  expect(mocks.save).not.toHaveBeenCalled();
  expect(mocks.validate).not.toHaveBeenCalled();
  expect(mocks.generate).not.toHaveBeenCalled();
}
describe.each([
  { name: "preview", handler: preview },
  { name: "save", handler: save },
  { name: "regenerate", handler: regenerate },
])("ops API $name", ({ handler }) => {
  it.each(["anonymous", "other", "unset", "empty"])(
    "hides the API from %s",
    async (caseName) => {
      if (caseName === "anonymous") mocks.getUser.mockResolvedValue(null);
      if (caseName === "other")
        mocks.getUser.mockResolvedValue({ id: "other" });
      if (caseName === "unset") delete process.env.OPS_OWNER_USER_IDS;
      if (caseName === "empty") process.env.OPS_OWNER_USER_IDS = " , ";
      expect(
        (await handler(request({ text: fixture, matchId: ids[0] }))).status,
      ).toBe(404);
      expectNoEffects();
    },
  );
  it("rejects a different Origin before data or generation calls", async () => {
    expect(
      (
        await handler(
          request({ text: fixture, matchId: ids[0] }, "https://evil.example"),
        )
      ).status,
    ).toBe(404);
    expectNoEffects();
  });
});
describe("ops page", () => {
  it.each(["anonymous", "other", "unset", "empty"])(
    "hides the page from %s",
    async (caseName) => {
      if (caseName === "anonymous") mocks.getUser.mockResolvedValue(null);
      if (caseName === "other")
        mocks.getUser.mockResolvedValue({ id: "other" });
      if (caseName === "unset") delete process.env.OPS_OWNER_USER_IDS;
      if (caseName === "empty") process.env.OPS_OWNER_USER_IDS = "";
      await expect(OpsFactsPage()).rejects.toThrow("not found");
      expectNoEffects();
    },
  );
  it("renders for a listed owner and is excluded from indexing", async () => {
    expect(await OpsFactsPage()).toBeTruthy();
    expect(metadata.robots).toEqual({ index: false, follow: false });
    expect(robots().rules).toMatchObject({ disallow: "/ops" });
  });
});
it("previews with one match query and no validation or writes", async () => {
  const response = await preview(request({ text: fixture }));
  const body = await response.json();
  expect(response.status).toBe(200);
  expect(body.blocks).toHaveLength(3);
  expect(mocks.in).toHaveBeenCalledExactlyOnceWith("id", ids);
  expect(body.blocks[2].reason).toContain("試合 URL");
  expect(mocks.save).not.toHaveBeenCalled();
  expect(mocks.validate).not.toHaveBeenCalled();
  expect(mocks.generate).not.toHaveBeenCalled();
});
it.each([preview, save])("rejects oversized text", async (handler) => {
  expect((await handler(request({ text: "x".repeat(100001) }))).status).toBe(
    400,
  );
  expectNoEffects();
});
it("saves two matches through the common function and never generates", async () => {
  const response = await save(request({ text: fixture }));
  expect(response.status).toBe(200);
  expect(mocks.save).toHaveBeenCalledTimes(2);
  for (const id of ids)
    expect(mocks.save).toHaveBeenCalledWith(
      expect.objectContaining({ matchId: id, entryPath: "ops_bulk_paste" }),
    );
  expect(mocks.generate).not.toHaveBeenCalled();
});
it("does not regenerate duplicates", async () => {
  mocks.save.mockResolvedValue({
    savedCount: 0,
    duplicateCount: 1,
    contentType: "preview",
    rejectedSources: [],
    matchMissing: false,
  });
  await save(request({ text: fixture }));
  expect(mocks.decide).not.toHaveBeenCalled();
});
it("rechecks regeneration eligibility and refuses a match without Japanese content", async () => {
  mocks.decide.mockResolvedValue("none");
  const response = await regenerate(request({ matchId: ids[0] }));
  expect((await response.json()).status).toBe("none");
  expect(mocks.decide).toHaveBeenCalledExactlyOnceWith({
    matchId: ids[0],
    contentType: "preview",
  });
  expect(mocks.generate).not.toHaveBeenCalled();
});
it("regenerates eligible Japanese content once", async () => {
  const response = await regenerate(request({ matchId: ids[0] }));
  expect((await response.json()).status).toBe("published");
  expect(mocks.generate).toHaveBeenCalledExactlyOnceWith(
    ids[0],
    "preview",
    "ja",
  );
  expect(maxDuration).toBe(300);
});

it("excludes missing matches and blocks without facts from saving", async () => {
  const missingId = "00000000-0000-4000-8000-000000000099";
  const text = `## missing /matches/${missingId}\n### 出典: https://example.com/a\n- 保存しない。\n## empty /matches/${ids[0]}\n### 出典: https://example.com/b\n- **注記:** なし`;
  const body = await (await preview(request({ text }))).json();
  expect(body.blocks[0].reason).toBe("対象の試合が見つかりません。");
  expect(body.blocks[1].reason).toBe("保存できる事実がありません。");
  await save(request({ text }));
  expect(mocks.save).not.toHaveBeenCalled();
});
it.each([
  ["draft", undefined, "QA で不合格"],
  ["skipped", "events_unavailable", "試合イベントがありません"],
  ["skipped", "score_mismatch", "得点イベントとスコアが一致しません"],
])("reports pipeline result %s (%s)", async (status, skipReason, expected) => {
  mocks.generate.mockResolvedValue({ status, skipReason });
  const body = await (await regenerate(request({ matchId: ids[0] }))).json();
  expect(body.status).toBe(status);
  expect(body.message).toContain(expected);
});
it("reports regeneration failures without losing saved facts", async () => {
  mocks.generate.mockRejectedValue(new Error("test failure"));
  const body = await (await regenerate(request({ matchId: ids[0] }))).json();
  expect(body).toEqual({
    status: "failed",
    message: "プレビューの作り直しに失敗しました: test failure",
  });
});
