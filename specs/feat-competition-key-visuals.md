# 大会別キービジュアルを生成画像に置き換える

## 背景

2026-07-03 のデザイン・UI・集客横断レビュー（`docs/design-ui-growth-review-2026-07-03.md` B-4, C-1, D）で、大会ハブページ（`/c/[competition]`）のヒーロー画像が Unsplash の外部 URL 参照であり、かつ複数大会で**同一の写真が使い回されている**ことが判明した。

具体的には `app/c/[competition]/page.tsx:24-44` の `COMPETITION_HERO_IMAGES` で、`premiership`・`six-nations`・`nations-championship` の3大会が全く同じ写真 ID（`photo-1574629810360-7efbbe195018`）を指しており、大会ごとの個性・臨場感が失われている（`docs/site-audit-report-2026-05b.md` P1-1 で指摘された「全大会ハブが同一写真」問題が、写真は差し替えられたものの構造的には再発している）。

また `CLAUDE.md` の方針により、実在チームロゴ・公式ユニフォーム・実在選手の顔写真は使用禁止であり、既存写真素材ではなく LLM 生成画像を使う前提に転換することが決まっている。Unsplash 写真は商用利用ライセンス自体は問題ないが（`docs/codex-prompts/pr20-competition-hero-per-slug.md` 参照）、写真の内容に実在選手・実在ユニフォームが写り込むリスクを構造的に排除できないため、生成画像へ切り替える。

## スコープ

**対象:**
- `app/c/[competition]/page.tsx` の `COMPETITION_HERO_IMAGES` / `DEFAULT_COMPETITION_HERO` を、外部 Unsplash URL からローカル生成画像アセットに切り替える

**対象外:**
- 画像生成そのもの（後述の「画像生成は Owner が別途実施」参照。Codex は画像生成 API を呼ばない）
- ホームページ（`app/page.tsx`）の進行中大会カード背景への流用、OG 画像への流用は本 spec のスコープ外（`docs/design-ui-growth-review-2026-07-03.md` C-3, C-4 で提案されているが、まずはハブページでの導入を先行させ、効果を見てから別 spec で拡張する）
- ヒーロー画像のオーバーレイ・グラデーション・テキスト配置（`app/c/[competition]/page.tsx:129-142`）の変更
- `app/c/[competition]/[season]/page.tsx`（シーズンページ）にヒーロー画像を追加すること（現状シーズンページに画像は無く、本 spec でも追加しない。`feat-season-page-ia.md` の対象）

## 画像生成は Owner が別途実施（Codex はコード実装のみ）

**Codex は画像生成 API を呼び出さないこと。** `CLAUDE.md` の LLM コスト保護ルールにより、未承認の生成 API 呼び出しは行わない。画像そのものは Owner が `docs/design-ui-growth-review-2026-07-03.md` D 章に掲載済みのプロンプト（大会別6種＋共通フォールバック1種、計7種類）を使い、任意の画像生成ツール（ChatGPT/DALL-E 等）で用意し、以下の命名規則でリポジトリに配置する。

### 画像の配置場所と命名規則

```
public/visuals/{family}.jpg
```

`family` は `COMPETITION_HERO_IMAGES` の既存キーと同じスラッグ（`six-nations` / `premiership` / `urc` / `top-14` / `super-rugby-pacific` / `rugby-championship` / `nations-championship` / `autumn-nations` / `pnc` / `league-one` / `rwc`）。フォールバック用は `public/visuals/default.jpg`。

推奨サイズ: 1600x600 程度（現行ヒーローの `h-48 sm:h-56` 表示比率に合わせたワイド構図）。

**Codex への依頼時点でこれらのファイルがまだ揃っていない場合**、実装は「アセットが存在すればそれを使い、存在しなければ現行の `DEFAULT_COMPETITION_HERO`（Unsplash フォールバック）にフォールバックする」形にし、画像の有無に関わらずビルドが通る状態を保つこと（下記「実装詳細」参照）。

## データモデル変更

なし。

## API サーフェス

なし。

## UI サーフェス / 実装詳細

`app/c/[competition]/page.tsx:24-47` を以下のように変更する:

```typescript
const COMPETITION_HERO_IMAGES: Record<string, string> = {
  "six-nations": "/visuals/six-nations.jpg",
  premiership: "/visuals/premiership.jpg",
  urc: "/visuals/urc.jpg",
  "top-14": "/visuals/top-14.jpg",
  "super-rugby-pacific": "/visuals/super-rugby-pacific.jpg",
  "rugby-championship": "/visuals/rugby-championship.jpg",
  "nations-championship": "/visuals/nations-championship.jpg",
  "autumn-nations": "/visuals/autumn-nations.jpg",
  pnc: "/visuals/pnc.jpg",
  "league-one": "/visuals/league-one.jpg",
  rwc: "/visuals/rwc.jpg",
};

const DEFAULT_COMPETITION_HERO = "/visuals/default.jpg";
```

`public/` 配下のローカルパスなので `next/image` の外部ドメイン許可設定（`next.config.ts` の `images.remotePatterns`）は不要になる。現在 Unsplash 用に `remotePatterns` 設定がある場合、他の用途で使われていないか確認した上で、不要なら合わせて削除してよい（`grep -rn "images.unsplash.com" next.config.ts app`で他の使用箇所がないか確認すること）。

### アセット未配置時のフォールバック

`public/visuals/{family}.jpg` が実装時点で存在しない大会については、`DEFAULT_COMPETITION_HERO`（`/visuals/default.jpg`）を指すようにし、`default.jpg` 自体も無い場合に備えて、Codex は最低限「壊れた画像アイコンが出ない」状態を保証すること。具体的には、画像生成アセットが1枚も用意できていない場合は既存の `DEFAULT_COMPETITION_HERO`（Unsplash URL）を暫定的に残し、コードのみ「ローカルパスがあれば優先、無ければ Unsplash 既存 URL」というマップ構造にしてもよい。**この暫定フォールバックの要否は Owner が画像生成を先に済ませているかどうかで変わるため、着手前に Owner に確認すること。**

## LLM 連携

なし（画像生成は本 spec のコード実装の範囲外）。

## 受け入れ条件

1. `public/visuals/` に配置された画像がある大会は、その画像がヒーローに表示される
2. 画像が未配置の大会は、壊れた画像アイコンにならず何らかのフォールバック画像が表示される
3. 既存のオーバーレイ・グラデーション・テキスト配置に変更がない
4. `next/image` の `alt` 属性（`formatFamilyName(competition)`）は変更しない
5. Unsplash への外部リクエストが（フォールバック用途を除き）発生しない
6. `pnpm tsc --noEmit` / `pnpm build` が通る

## 未解決の質問

- Codex 着手時点で `public/visuals/*.jpg` が Owner から提供されているか、それとも画像無しでコードだけ先に実装するか、Owner が着手前に明示すること
- ホームページの進行中大会カード背景・OG 画像への同一アセット流用は次フェーズで別 spec 化する想定。本 spec の完了後に着手してよいか Owner 判断
- 画像生成プロンプトは `docs/design-ui-growth-review-2026-07-03.md` D 章（D-2〜D-6）を使用する想定。全11大会分（6種の方向性プロンプト＋バリエーション）をどう配分するかは Owner の裁量
