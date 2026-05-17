import { Inter, Noto_Serif_JP } from "next/font/google";

import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { SITE_URL } from "@/lib/site";

import type { Metadata, Viewport } from "next";

import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const notoSerifJP = Noto_Serif_JP({
  subsets: ["latin"],
  variable: "--font-noto-serif-jp",
  weight: ["400", "700", "900"],
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
    <html lang="ja">
      <body className={`${inter.variable} ${notoSerifJP.variable} min-h-screen`}>
        <SiteHeader />
        {children}
        <SiteFooter />
      </body>
    </html>
  );
}
