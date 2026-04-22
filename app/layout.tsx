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
      <body>{children}</body>
    </html>
  );
}
