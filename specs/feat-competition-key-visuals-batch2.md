# 大会別キービジュアル 追加5大会分（バッチ2）

## 背景

`specs/feat-competition-key-visuals.md`（PR #456、本番反映済み）で Premiership・Six Nations・Rugby Championship・Super Rugby Pacific の4大会分の生成画像を `COMPETITION_HERO_IMAGES` に登録した。残る大会のうち URC・Top 14・Autumn Nations・PNC・League One の5大会分の画像を Owner が追加生成し、`public/visuals/` に既に配置済み。本 spec はこの5大会分を `COMPETITION_HERO_IMAGES` に登録するだけの追加バッチ。

## スコープ

**対象:** `app/c/[competition]/page.tsx` の `COMPETITION_HERO_IMAGES` に5エントリを追加するのみ

**対象外:**
- 画像生成そのもの（`public/visuals/urc.jpg` / `top-14.jpg` / `autumn-nations.jpg` / `pnc.jpg` / `league-one.jpg` は既に配置済み。Codex は画像生成 API を呼ばない）
- `nations-championship` は今回生成対象外のため、引き続き `DEFAULT_COMPETITION_HERO`（`/visuals/default.jpg`）にフォールバックする
- `feat-competition-key-visuals.md` の他の内容（既存4大会分のマップ・フォールバックロジック）の変更

## 実装詳細

`app/c/[competition]/page.tsx:24-29` の `COMPETITION_HERO_IMAGES` に以下5エントリを追加する:

```typescript
const COMPETITION_HERO_IMAGES: Record<string, string> = {
  "autumn-nations": "/visuals/autumn-nations.jpg",
  "league-one": "/visuals/league-one.jpg",
  pnc: "/visuals/pnc.jpg",
  premiership: "/visuals/premiership.jpg",
  "rugby-championship": "/visuals/rugby-championship.jpg",
  "six-nations": "/visuals/six-nations.jpg",
  "super-rugby-pacific": "/visuals/super-rugby-pacific.jpg",
  "top-14": "/visuals/top-14.jpg",
  urc: "/visuals/urc.jpg",
};
```

（アルファベット順に整理した例。既存4件の並び順自体にこだわりは無いので、リンター等の並び順規約があればそれに従ってよい）

## 画像アセットについて

**`public/visuals/urc.jpg` / `top-14.jpg` / `autumn-nations.jpg` / `pnc.jpg` / `league-one.jpg` の5枚は既に Owner が生成し、このリポジトリのワークツリーに配置済み。** これらは現時点でまだ git にコミットされていない（未追跡ファイル）。**Codex はこの5ファイルも実装 PR に含めること**（`git add public/visuals/urc.jpg public/visuals/top-14.jpg public/visuals/autumn-nations.jpg public/visuals/pnc.jpg public/visuals/league-one.jpg` 等でコミットに含める）。画像生成 API を新たに呼び出す必要はない。

## 受け入れ条件

1. `COMPETITION_HERO_IMAGES` に `urc` / `top-14` / `autumn-nations` / `pnc` / `league-one` の5エントリが追加されている
2. `public/visuals/urc.jpg` / `top-14.jpg` / `autumn-nations.jpg` / `pnc.jpg` / `league-one.jpg` の5ファイルが PR に含まれている（コミットされている）
3. `nations-championship` は引き続き `DEFAULT_COMPETITION_HERO` にフォールバックする（マップに追加しない）
4. `/c/urc`・`/c/top-14`・`/c/autumn-nations`・`/c/pnc`・`/c/league-one` の5ページでヒーロー画像が正しく表示される
5. 既存4大会（Premiership等）とデフォルトフォールバック（nations-championship）の挙動に変化がない
6. `pnpm tsc --noEmit` / `pnpm build` が通る

## 未解決の質問

- なし
