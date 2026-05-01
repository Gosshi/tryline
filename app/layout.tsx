import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Tryline",
  description: "海外ラグビー観戦を日本語で支援する AI コンパニオン",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className="min-h-screen">
        <SiteHeader />
        {children}
        <SiteFooter />
      </body>
    </html>
  );
}
