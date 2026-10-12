// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BulkFactPasteForm } from "@/app/ops/facts/bulk-fact-paste-form";

const blocks = Array.from({ length: 5 }, (_, index) => ({
  heading: `試合${index}`,
  headingLine: index + 1,
  matchId: `match-${index}`,
  match: {
    kickoff_at: "2999-01-01T00:00:00Z",
    status: "scheduled",
    home_team: { name: "Home", name_ja: "ホーム" },
    away_team: { name: "Away", name_ja: "アウェイ" },
  },
  contentType: "preview",
  factCount: 1,
  sourceCount: 1,
  skippedLines: [],
  reason: null,
}));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
describe("BulkFactPasteForm", () => {
  it("keeps preview text fixed and runs at most three regenerations concurrently", async () => {
    const pending: Array<() => void> = [];
    let active = 0;
    let peak = 0;
    const fetchMock = vi.fn((url: string) => {
      if (url.endsWith("preview"))
        return Promise.resolve(
          Response.json({ blocks, linesBeforeFirstHeading: 2 }),
        );
      if (url.endsWith("save"))
        return Promise.resolve(
          Response.json({
            results: blocks.map((block) => ({
              ...block,
              savedCount: 1,
              duplicateCount: 0,
              rejectedSources: [],
              regeneration: "regenerate",
            })),
          }),
        );
      return new Promise((resolve) => {
        active++;
        peak = Math.max(peak, active);
        pending.push(() => {
          active--;
          resolve(
            Response.json({
              status: "published",
              message: "プレビューを作り直しました（公開）",
            }),
          );
        });
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<BulkFactPasteForm />);
    expect(screen.getByRole("button", { name: "読み取る" })).toBeDisabled();
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "fixture" },
    });
    fireEvent.click(screen.getByRole("button", { name: "読み取る" }));
    await screen.findByRole("button", { name: "保存する" });
    expect(screen.getByText("冒頭で読み飛ばした行: 2行")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "保存する" }));
    await waitFor(() => expect(active).toBe(3));
    expect(screen.getByRole("textbox")).toBeDisabled();
    expect(screen.getByText(/作り直しが終わるまで/)).toBeInTheDocument();
    await act(async () => pending[0]!());
    await waitFor(() => expect(pending).toHaveLength(4));
    await act(async () => pending[1]!());
    await waitFor(() => expect(pending).toHaveLength(5));
    await act(async () => {
      for (const release of pending.slice(2)) release();
    });
    await screen.findByText("完了: 公開 5 / QA 不合格 0 / 見送り 0 / 失敗 0");
    expect(peak).toBe(3);
    expect(
      fetchMock.mock.calls.filter(([url]) => url.endsWith("regenerate")),
    ).toHaveLength(5);
  });
});
