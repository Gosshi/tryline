// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ContentPlaceholder } from "@/components/content-placeholder";

describe("ContentPlaceholder", () => {
  it.each([
    ["preview", "pre_window", "プレビューは試合開始 48 時間前に公開予定"],
    ["preview", "preparing", "プレビューを準備中です"],
    ["preview", "unavailable", "このプレビューは公開されませんでした"],
    ["recap", "pre_window", "レビューは試合終了 1 時間後に公開予定"],
    ["recap", "preparing", "レビューを準備中です"],
    ["recap", "unavailable", "このレビューは公開されませんでした"],
  ] as const)("renders copy for %s x %s", (type, state, expectedText) => {
    render(<ContentPlaceholder state={state} type={type} />);

    expect(screen.getByText(expectedText)).toBeInTheDocument();
  });
});
