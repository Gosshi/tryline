import { GoogleAnalytics } from "@next/third-parties/google";
import { Noto_Sans_JP, Outfit, Shippori_Mincho_B1 } from "next/font/google";

import { ReturnVisitTracker } from "@/components/return-visit-tracker";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { IOS_APP_ID } from "@/lib/ios-app";
import { SITE_URL } from "@/lib/site";
import { SPOILER_GUARD_BOOTSTRAP } from "@/lib/spoiler-guard";

import type { Metadata, Viewport } from "next";

import "./globals.css";

const body = Noto_Sans_JP({
  display: "swap",
  subsets: ["latin"],
  variable: "--font-noto-sans-jp",
});

const heading = Shippori_Mincho_B1({
  display: "swap",
  subsets: ["latin"],
  variable: "--font-shippori-mincho",
  weight: ["800"],
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
  itunes: {
    appId: IOS_APP_ID,
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
    <html
      className={`${body.variable} ${heading.variable} ${numbers.variable}`}
      lang="ja"
      suppressHydrationWarning
    >
      <head>
        <script id="spoiler-guard-bootstrap" dangerouslySetInnerHTML={{ __html: SPOILER_GUARD_BOOTSTRAP }} />
      </head>
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
