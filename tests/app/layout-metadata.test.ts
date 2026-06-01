import { describe, expect, it, vi } from "vitest";

vi.mock("next/font/google", () => ({
  Inter: () => ({ variable: "--font-inter" }),
  Noto_Sans_JP: () => ({ variable: "--font-body" }),
  Noto_Serif_JP: () => ({ variable: "--font-noto-serif-jp" }),
  Oswald: () => ({ variable: "--font-heading" }),
}));

import { metadata } from "@/app/layout";

describe("root metadata", () => {
  it("declares an icon so browsers do not request a missing favicon.ico", () => {
    expect(metadata.icons).toMatchObject({
      apple: [{ sizes: "192x192", url: "/icons/icon-192.png" }],
      icon: [
        {
          sizes: "192x192",
          type: "image/png",
          url: "/icons/icon-192.png",
        },
      ],
    });
  });
});