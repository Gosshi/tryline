// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import SupportPage, { generateMetadata } from "@/app/support/page";
import { SITE_URL } from "@/lib/site";

describe("SupportPage", () => {
  it("renders support contact details, FAQs, and related links", () => {
    render(<SupportPage />);

    expect(
      screen.getByRole("heading", { name: "サポート・お問い合わせ" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "support@trylinerugby.com" }),
    ).toHaveAttribute("href", "mailto:support@trylinerugby.com");
    expect(
      screen.getByText("（メール受付、3営業日以内を目安に返信）"),
    ).toBeInTheDocument();

    for (const question of [
      "ログインできない・パスワードを忘れた",
      "Premium の登録・解約",
      "アカウントを削除したい",
      "試合データ・解説の誤りを見つけた",
    ]) {
      expect(
        screen.getByRole("heading", { name: question }),
      ).toBeInTheDocument();
    }

    expect(
      screen.getByText(/Webで登録したPremiumはマイページから解約/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/App Store のサブスクリプション設定から解約/),
    ).toBeInTheDocument();

    expect(screen.getByRole("link", { name: "利用規約" })).toHaveAttribute(
      "href",
      "/legal/terms",
    );
    expect(
      screen.getByRole("link", { name: "プライバシーポリシー" }),
    ).toHaveAttribute("href", "/legal/privacy");
    expect(
      screen.getByRole("link", { name: "特定商取引法に基づく表記" }),
    ).toHaveAttribute("href", "/legal/tokusho");
    expect(screen.getByRole("link", { name: "料金プラン" })).toHaveAttribute(
      "href",
      "/pricing",
    );
  });

  it("exports support metadata with a canonical URL", () => {
    expect(generateMetadata()).toMatchObject({
      alternates: { canonical: `${SITE_URL}/support` },
      description:
        "Tryline の使い方、Premium の登録・解約、アカウント削除、データの誤り報告に関するご案内と問い合わせ先。",
      title: "サポート・お問い合わせ",
    });
  });
});
