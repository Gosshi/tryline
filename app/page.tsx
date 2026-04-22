import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export default function HomePage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(30,64,175,0.14),_transparent_42%),linear-gradient(180deg,_#f8fafc_0%,_#eef2ff_100%)] px-6 py-16">
      <Card className="w-full max-w-xl border-white/60 bg-white/80 shadow-xl shadow-slate-200/60 backdrop-blur">
        <CardHeader className="space-y-3">
          <CardTitle className="text-4xl font-semibold tracking-tight">Tryline</CardTitle>
          <CardDescription className="text-base text-slate-600">
            海外ラグビー観戦のための日本語 AI コンパニオン。現在、基盤セットアップを進めています。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm leading-6 text-slate-700">準備中です。</p>
          <Input aria-label="メールアドレス" placeholder="owner@example.com" />
          <Button className="w-full">公開準備中</Button>
        </CardContent>
      </Card>
    </main>
  );
}
