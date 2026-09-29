// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { IosAppCta } from "@/components/ios-app-cta";

describe("IosAppCta", () => {
  it("describes the app as iPhone-only", () => {
    render(<IosAppCta surface="calendar" />);

    expect(screen.getByText("iPhone アプリ")).toBeInTheDocument();
    expect(screen.getByText("iPhone アプリ")).not.toHaveTextContent("iPad");
  });
});
