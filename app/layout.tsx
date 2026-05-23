import { GoogleAnalytics } from "@next/third-parties/google";
import { Noto_Sans_JP, Oswald } from "next/font/google";

import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { SITE_URL } from "@/lib/site";

import type { Metadata, Viewport } from "next";

import "./globals.css";

const heading = Oswald({
  subsets: ["latin"],
  variable: "--font-heading",
  weight: ["400", "600", "700"],
  display: "swap",
});

const body = Noto_Sans_JP({
  subsets: ["latin"],
  variable: "--font-body",
  weight: ["400", "500", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Tryline",
    template: "%s | Tryline",
  },
  description:
    "Six Nations・Premiership・URC など海外ラグビーの試合結果・順位表・AI日本語レビューを提供するラグビーファン向けサービス。",
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
  themeColor: "#16a34a",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html className={`${heading.variable} ${body.variable}`} lang="ja">
      <body className="min-h-screen">
        <SiteHeader />
        {children}
        <SiteFooter />
        {process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID && (
          <GoogleAnalytics gaId={process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID} />
        )}
      </body>
    </html>
  );
}