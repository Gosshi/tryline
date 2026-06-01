# ホームページ SEO メタデータ修正（title / description / og:locale / 画像 alt）

## 背景

2026-06-01 の Playwright 実測評価（`docs/growth-playbook-2026-06.md` 施策 S1）で確認した、ホームページ（`app/page.tsx`）のメタデータ残課題を解消する。

`fix-seo-indexing.md` で canonical・`WebSite`/`Organization` JSON-LD は実装済み（本番で確認済み）。本仕様はそこで対象外だった以下を直す:

1. **title が検索意図と乖離・ブランド名なし**: 現状 `"海外ラグビーを日本語で深掘り"`（14字）。タグラインとしては良いが、ユーザーが実際に検索する語（「海外ラグビー 結果」「順位」「日本語」「大会名」）も、ブランド名「Tryline」も含まない。最重要ページの head term を取りこぼしている。
2. **meta description がターゲットを自ら狭めている**: 現状 `"…DAZN・J SPORTS 加入者向けの試合コンパニオン。"`。更新後のポジショニング（「DAZN/J SPORTS 限定ではなく、日本語で海外ラグビーを追いたいファン全般」）と矛盾。
3. **page 側 `openGraph` が継承した `og:locale: ja_JP` を消している**: `app/layout.tsx` は `openGraph.locale: "ja_JP"` を設定しているが、`app/page.tsx` が独自の `openGraph` を定義すると Next.js は親の openGraph をフィールド単位で置換するため `locale` が欠落する（本番で `og:locale` が null になることを実測確認）。
4. **大会ロゴ等の画像 alt が空**: ホームの `<img>` 10枚すべて `alt=""`。装飾画像は空でよいが、大会ロゴ・チームバッジは説明的 alt があるべき（画像検索・a11y）。

## スコープ

対象:
- `app/page.tsx` — `metadata.title` / `metadata.description` / `metadata.openGraph`（`locale` 追加・description 整合）/ 大会ロゴ・チームバッジの `<Image alt>`

対象外:
- `app/layout.tsx` の title テンプレート（`%s | Tryline`）・verification・icons（変更しない）
- ホームの JSON-LD（`fix-seo-indexing.md` で実装済み）
- 他ページの title/description（別タスク。ただし「page 側 openGraph には locale を必ず含める」原則は全ページ共通）
- ヒーローの装飾テクスチャ画像（`HeroTexture`）の alt（装飾なので空のまま）

## データモデル変更

なし

## API サーフェス

なし

## UI サーフェス

表示上の変化は最小（title/description は `<head>`、alt は支援技術向け）。画面レイアウトは変えない。

## 変更詳細

### 変更1: title（`app/page.tsx` L75）

**現状:**
```typescript
title: "海外ラグビーを日本語で深掘り",
```

**変更後（推奨案 A）:**
```typescript
title: { absolute: "海外ラグビー 試合結果・順位・日本語AIレビュー | Tryline" },
```

- 検索 head term（海外ラグビー／試合結果／順位／日本語）＋ブランド名を前寄せ。
- `title.absolute` で layout テンプレート（`%s | Tryline`）の二重付与を避け、出力文字列を固定する。
- 全角 ~30 字以内。SERP で末尾が切れない長さを優先。

**代替案 B（タグライン重視）:** `{ absolute: "Tryline｜海外ラグビーの試合結果・順位・日本語AIレビュー" }`

> 最終文言は Owner が A / B / 独自案から選ぶ（「未解決の質問」参照）。`og:title` は現状の `"Tryline — 海外ラグビーを日本語で深掘り"` を維持してよい（SNS 共有時のブランド表現として機能している）。

### 変更2: meta description（`app/page.tsx` L59-60）

**現状:**
```typescript
description:
  "Six Nations・Premiership・URC など海外ラグビーの試合結果・AI日本語レビューを提供。DAZN・J SPORTS 加入者向けの試合コンパニオン。",
```

**変更後:**
```typescript
description:
  "Six Nations・Premiership・URC・リーグワンなど海外ラグビーの試合結果・順位表・AI日本語レビューを毎節お届け。海外ラグビーを日本語で深く追いたいファンのための試合コンパニオン。",
```

- 「DAZN・J SPORTS 加入者向け」を削除（ターゲットを狭めないため）。
- 「リーグワン」「順位表」を追加（実コンテンツと検索需要に整合）。
- 全角 ~120 字以内。

`openGraph.description`（L62-63）も同じ方向で整合させる（DAZN/JSPORTS 文言がそもそも無いので大きな変更は不要。リーグワンを足すなら統一する）。

### 変更3: og:locale を page の openGraph に追加（`app/page.tsx` L61-74）

page 側 `openGraph` オブジェクトに `locale: "ja_JP"` を明示追加する（親の値が置換で消えるため）。

```typescript
openGraph: {
  description: "...",
  images: [{ height: 630, url: `${SITE_URL}/og-image.png`, width: 1200 }],
  locale: "ja_JP",   // ← 追加
  title: "Tryline — 海外ラグビーを日本語で深掘り",
  type: "website",
  url: SITE_URL,
},
```

> 原則: 独自 `openGraph` を定義する全ページ（試合・シーズン・大会ハブ・料金）でも `locale: "ja_JP"` を含める。本仕様の直接対象はホームのみ。

### 変更4: 画像 alt（`app/page.tsx`）

- **大会ロゴ**（`getCompetitionLogoSrc(family)` を使う `<Image>`）: `alt={formatFamilyName(family)}` など大会名を入れる（例: 「シックス・ネーションズ」）。装飾扱いをやめる。
- **チームバッジ**（`TeamBadge` / `<Image>` でチームエンブレムを出している箇所）: チーム名を alt に入れる。
- **純粋な装飾画像**のみ `alt=""` を維持する。

`formatFamilyName` は既存（`@/lib/format/competition`）を再利用する。

## LLM 連携

なし

## 受け入れ条件

1. `curl https://www.trylinerugby.com/` の HTML で `<title>` にブランド名「Tryline」と検索キーワード（海外ラグビー等）が含まれる。
2. `<meta name="description">` に「DAZN」「J SPORTS」の語が含まれない。
3. `<meta property="og:locale" content="ja_JP">` が出力される。
4. ホームの大会ロゴ `<img>` に空でない `alt`（大会名）が設定されている。チームバッジも同様。装飾画像のみ `alt=""`。
5. `pnpm tsc --noEmit` と `pnpm build` が通る。

## 未解決の質問

- title の最終文言（A / B / 独自案）。SERP プレビューで全角30字前後に収まることを Owner が確認する。
- `og:title` のタグライン「深掘り」を維持するか、title と揃えるか。
- リーグワン以外に description へ含めたい大会名があるか（文字数とのトレードオフ）。
