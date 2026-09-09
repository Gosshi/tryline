// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/paywall", () => ({
  Paywall: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import { MatchChat } from "@/components/match-chat";

describe("MatchChat", () => {
  it("discloses that answers are generated from the available match sources", () => {
    render(
      <MatchChat
        hasFreeQuestion={false}
        isLoggedIn={false}
        isPremium={false}
        matchId="match-1"
      />,
    );

    expect(
      screen.getByText(
        "この回答は試合データと公開レビューをもとに AI が生成しています。記録にない事実や試合外の情報は確認できません。",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("MATCH Q&A")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "この試合について質問する" }),
    ).toBeInTheDocument();
  });
});
