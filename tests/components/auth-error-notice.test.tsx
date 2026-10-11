// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthErrorNotice } from "@/components/auth-error-notice";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(location.search),
}));
describe("AuthErrorNotice", () => {
  beforeEach(() => history.replaceState(null, "", "/pricing"));
  afterEach(() => cleanup());
  it("shows both messages, preserves the rest of the URL, and can be dismissed", () => {
    history.replaceState(
      { retained: true },
      "",
      "/pricing?auth_error=1&from=hero#plans",
    );
    const view = render(
      <StrictMode>
        <AuthErrorNotice />
      </StrictMode>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "ログインできませんでした。",
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "メールのリンクは、メールアドレスを入力したのと同じブラウザで開いてください。リンクの期限が切れている場合は、もう一度ログインしてください。",
    );
    expect(location.pathname + location.search + location.hash).toBe(
      "/pricing?from=hero#plans",
    );
    expect(history.state).toEqual({ retained: true });
    fireEvent.click(screen.getByRole("button", { name: "閉じる" }));
    expect(screen.queryByRole("alert")).toBeNull();
    view.unmount();
    render(<AuthErrorNotice />);
    expect(screen.queryByRole("alert")).toBeNull();
  });
  it.each(["", "?auth_error=0"])("renders nothing for %s", (search) => {
    history.replaceState(null, "", "/pricing" + search);
    const { container } = render(<AuthErrorNotice />);
    expect(container).toBeEmptyDOMElement();
    expect(location.search).toBe(search);
  });
});
