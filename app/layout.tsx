import { Fraunces, Noto_Serif_JP } from "next/font/google";

import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

import type { Metadata } from "next";

import "./globals.css";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  axes: ["opsz"],
  display: "swap",
});

const notoSerifJP = Noto_Serif_JP({
  subsets: ["latin"],
  variable: "--font-noto-serif-jp",
  weight: ["700"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://tryline-six.vercel.app"),
  title: {
    default: "Tryline",
    template: "%s | Tryline",
  },
  description:
    "Six Nations・Premiership・URC など海外ラグビーの試合結果・順位表・AI日本語レビューを提供するラグビーファン向けサービス。",
  openGraph: {
    locale: "ja_JP",
    siteName: "Tryline",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html className={`${fraunces.variable} ${notoSerifJP.variable}`} lang="ja">
      <body className="min-h-screen">
        <SiteHeader />
        {children}
        <SiteFooter />
      </body>
    </html>
  );
}
