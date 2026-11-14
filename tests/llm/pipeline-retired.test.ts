import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  family: "top-14",
  assemble: vi.fn(),
  openai: vi.fn(),
  from: vi.fn(),
  single: vi.fn(),
}));
vi.mock("@/lib/llm/client", () => ({ getOpenAIClient: mocks.openai }));
vi.mock("@/lib/llm/stages/assemble", () => ({
  assembleMatchContentInput: mocks.assemble,
}));
vi.mock("@/lib/db/server", () => ({
  getSupabaseServerClient: () => ({ from: mocks.from }),
}));
import { generateMatchContent } from "@/lib/llm/pipeline";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.family = "top-14";
  mocks.assemble.mockRejectedValue(new Error("assemble reached"));
  mocks.single.mockImplementation(async () => ({
    data: { competition: { family: mocks.family } },
    error: null,
  }));
  mocks.from.mockReturnValue({
    select: () => ({ eq: () => ({ single: mocks.single }) }),
  });
});
describe("retired pipeline entry guard", () => {
  it.each([true, false])(
    "skips retired matches without LLM, assembly, logs or writes (persist=%s)",
    async (persist) => {
      expect(
        await generateMatchContent("retired", "preview", "ja", { persist }),
      ).toEqual({
        status: "skipped",
        skipReason: "competition_retired",
        qa: null,
        matchId: "retired",
        contentType: "preview",
      });
      expect(mocks.single).toHaveBeenCalledTimes(1);
      expect(mocks.from.mock.calls).toEqual([["matches"]]);
      expect(mocks.assemble).not.toHaveBeenCalled();
      expect(mocks.openai).not.toHaveBeenCalled();
    },
  );
  it("still assembles URC matches", async () => {
    mocks.family = "urc";
    await expect(generateMatchContent("active", "preview")).rejects.toThrow(
      "assemble reached",
    );
    expect(mocks.assemble).toHaveBeenCalledWith("active", "ja", "preview");
  });
  it("propagates failure to read the competition", async () => {
    mocks.single.mockResolvedValue({
      data: null,
      error: new Error("lookup failed"),
    });
    await expect(generateMatchContent("retired", "recap")).rejects.toThrow(
      "lookup failed",
    );
    expect(mocks.assemble).not.toHaveBeenCalled();
  });
});
