import { Suspense } from "react";
import { describe, expect, it, vi } from "vitest";

const shipporiOptions = vi.hoisted(() => vi.fn());

vi.mock("next/font/google", () => ({
  Noto_Sans_JP: () => ({ variable: "--font-noto-sans-jp" }),
  Outfit: () => ({ variable: "--font-number" }),
  Shippori_Mincho_B1: (options: { weight: string[] }) => {
    shipporiOptions(options);

    return { variable: "--font-shippori-mincho" };
  },
}));

import RootLayout, { metadata } from "@/app/layout";
import { AuthErrorNotice } from "@/components/auth-error-notice";
import { SignupSuccessTracker } from "@/components/signup-success-tracker";

describe("root metadata", () => {
  it("loads the heading font at weight 800 only", () => {
    expect(shipporiOptions).toHaveBeenCalledWith(
      expect.objectContaining({ weight: ["800"] }),
    );
  });

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
  it("places the auth notice and signup tracker in root Suspense boundaries", () => {
    const layout = RootLayout({ children: null });
    const children = layout.props.children[1].props.children;
    expect(children[1].type).toBe(Suspense);
    expect(children[1].props.fallback).toBeNull();
    expect(children[1].props.children.type).toBe(AuthErrorNotice);
    expect(children[3].type).toBe(Suspense);
    expect(children[3].props.fallback).toBeNull();
    expect(children[3].props.children.type).toBe(SignupSuccessTracker);
  });
});
