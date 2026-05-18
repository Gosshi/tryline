# PR #61 — X 自動投稿 OG 画像にラグビー写真を差し込む

## 背景

`/api/og` で生成する OG カードは現在ダーク背景＋テキストのみ。
X のタイムラインでは画像付き投稿のほうがスクロールを止める力が強く、
ユーザーが実際の投稿を見ると「テキストだけのカード」になっている。
既存のリリース告知投稿（ラグビーアクション写真）は反応が良かったため、
全試合 OG カードにラグビー写真のバックグラウンドを追加する。

## スコープ

対象:
- `app/api/og/route.tsx` — OG 画像生成ルート
- `public/og-bg.png` — 背景写真（配置済み）

対象外:
- OG 画像のレイアウト・テキスト構造は変更しない
- 試合ページの OGP メタタグは変更しない

## 実装仕様

`app/api/og/route.tsx` の `GET` ハンドラを以下の方針で修正する。

### 背景画像の取得

フォント取得と同じパターンで `og-bg.png` を `data URI` に変換する:

```typescript
let bgDataUri: string | null = null;
try {
  const bgBuffer = await fetch(new URL("/og-bg.png", request.url)).then((res) =>
    res.arrayBuffer()
  );
  bgDataUri = `data:image/png;base64,${Buffer.from(bgBuffer).toString("base64")}`;
} catch {
  // 画像なしでフォールバック（ビルド・テスト環境で og-bg.png が存在しない場合）
}
```

### JSX 構造の変更

現在の最外層 `<div>` の `background` プロパティを削除し、
写真レイヤーとオーバーレイレイヤーを追加する:

```
最外層 div
  position: "relative", overflow: "hidden"
  background: "linear-gradient(180deg, #0B1628 0%, #0f172a 100%)"  ← フォールバックとして残す

  ├── [bgDataUri がある場合のみ] <img>
  │     src={bgDataUri}
  │     style: position absolute, inset 0, width/height 100%, objectFit cover
  │
  ├── 暗色オーバーレイ <div>
  │     position absolute, inset 0
  │     background: "rgba(11, 22, 40, 0.72)"
  │
  └── 既存コンテンツ (緑縦線・competition pill・チーム名・スコア・URL)
        position: "relative" を追加して重なり順を確保
```

- 既存の緑縦線 (`width: "6px"`, `background: "#22c55e"`) は position absolute のまま維持
- 既存テキスト色・フォント・レイアウトは一切変更しない
- `Buffer` は Node.js/Edge 両環境で使用可能

## 完了の定義

- [ ] `GET /api/og?home=Glasgow+Warriors&away=Cardiff+Rugby&competition=URC+2025-26&score=40-17&status=finished` で背景写真が表示される
- [ ] テキスト（チーム名・スコア・大会名・trylinerugby.com）が背景の上で読める
- [ ] `og-bg.png` を削除した状態でも `/api/og` がクラッシュせず、ダーク背景のみで表示される
- [ ] TypeScript エラーなし・`pnpm build` 通過
