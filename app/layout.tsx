import { GoogleAnalytics } from "@next/third-parties/google";
import { Outfit, Zen_Maru_Gothic } from "next/font/google";

import { ReturnVisitTracker } from "@/components/return-visit-tracker";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { SITE_URL } from "@/lib/site";

import type { Metadata, Viewport } from "next";

import "./globals.css";

const body = Zen_Maru_Gothic({
  display: "swap",
  subsets: ["latin"],
  variable: "--font-zen-maru",
  weight: ["500", "700", "900"],
});

const numbers = Outfit({
  display: "swap",
  subsets: ["latin"],
  variable: "--font-number",
  weight: ["500", "700"],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  alternates: {
    types: {
      "application/rss+xml": `${SITE_URL}/rss.xml`,
    },
  },
  title: {
    default: "Tryline",
    template: "%s | Tryline",
  },
  description:
    "Six Nations・Premiership・URC など海外ラグビーの試合結果・順位表・日本語レビュー・解説を提供するラグビーファン向けサービス。",
  verification: {
    google: "Kp99rUYc5K1sWD3DPDoAKEuV7doFt9k_y9JFZ_SLja4",
  },
  icons: {
    apple: [{ sizes: "192x192", url: "/icons/icon-192.png" }],
    icon: [{ sizes: "192x192", type: "image/png", url: "/icons/icon-192.png" }],
  },
  openGraph: {
    locale: "ja_JP",
    siteName: "Tryline",
    type: "website",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Tryline",
  },
};

export const viewport: Viewport = {
  themeColor: "#c93a40",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html className={`${body.variable} ${numbers.variable}`} lang="ja">
      <body className="min-h-screen">
        <SiteHeader />
        <ReturnVisitTracker />
        {children}
        <SiteFooter />
        {process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID && (
          <GoogleAnalytics gaId={process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID} />
        )}
      </body>
    </html>
  );
}
