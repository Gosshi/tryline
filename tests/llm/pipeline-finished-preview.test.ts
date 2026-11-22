import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  status: "finished",
  from: vi.fn(),
  single: vi.fn(),
  assemble: vi.fn(),
  openai: vi.fn(),
}));
vi.mock("@/lib/db/server", () => ({
  getSupabaseServerClient: () => ({ from: mocks.from }),
}));
vi.mock("@/lib/llm/client", () => ({ getOpenAIClient: mocks.openai }));
vi.mock("@/lib/llm/stages/assemble", () => ({
  assembleMatchContentInput: mocks.assemble,
}));
import { generateMatchContent } from "@/lib/llm/pipeline";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.status = "finished";
  mocks.single.mockImplementation(async () => ({
    data: {
      status: mocks.status,
      competition: { family: "nations-championship" },
    },
    error: null,
  }));
  mocks.from.mockReturnValue({
    select: () => ({ eq: () => ({ single: mocks.single }) }),
  });
  mocks.assemble.mockRejectedValue(new Error("assembly reached"));
});
afterEach(() => vi.restoreAllMocks());
describe("finished preview guard", () => {
  it.each([true, false])(
    "skips finished previews before assembly, LLM, logs and writes (persist=%s)",
    async (persist) => {
      expect(
        await generateMatchContent("finished", "preview", "ja", { persist }),
      ).toEqual({
        matchId: "finished",
        contentType: "preview",
        status: "skipped",
        skipReason: "match_finished",
        qa: null,
      });
      expect(mocks.from.mock.calls).toEqual([["matches"]]);
      expect(mocks.single).toHaveBeenCalledTimes(1);
      expect(mocks.assemble).not.toHaveBeenCalled();
      expect(mocks.openai).not.toHaveBeenCalled();
    },
  );
  it("still processes finished recaps", async () => {
    await expect(generateMatchContent("finished", "recap")).rejects.toThrow(
      "assembly reached",
    );
    expect(mocks.assemble).toHaveBeenCalledWith("finished", "ja", "recap");
  });
  it("still processes scheduled previews", async () => {
    mocks.status = "scheduled";
    await expect(generateMatchContent("scheduled", "preview")).rejects.toThrow(
      "assembly reached",
    );
    expect(mocks.assemble).toHaveBeenCalledWith("scheduled", "ja", "preview");
  });
});
