import { describe, expect, it, vi } from "vitest";

vi.mock("next/font/google", () => ({
  Noto_Sans_JP: () => ({ variable: "--font-noto-sans-jp" }),
  Outfit: () => ({ variable: "--font-number" }),
  Shippori_Mincho_B1: () => ({ variable: "--font-shippori-mincho" }),
}));

import RootLayout, { metadata } from "@/app/layout";

describe("root metadata", () => {
  it("loads the body, heading, and numeric font variables", () => {
    const layout = RootLayout({ children: null });
    const classes = layout.props.className.split(/\s+/);

    expect(classes).toEqual(
      expect.arrayContaining([
        "--font-noto-sans-jp",
        "--font-shippori-mincho",
        "--font-number",
      ]),
    );
    expect(classes).not.toContain(["--font", "zen", "maru"].join("-"));
  });

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
