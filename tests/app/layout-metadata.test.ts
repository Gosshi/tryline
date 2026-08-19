import { describe, expect, it, vi } from "vitest";

vi.mock("next/font/google", () => ({
  Outfit: () => ({ variable: "--font-number" }),
  Zen_Maru_Gothic: () => ({ variable: "--font-zen-maru" }),
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

  it("declares the iOS Smart App Banner metadata", () => {
    expect(metadata.itunes).toEqual({ appId: "6791587357" });
  });
});
