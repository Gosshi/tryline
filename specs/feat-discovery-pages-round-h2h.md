# 発見ページ: ラウンドハブ + H2H 対戦成績ページ

## 背景

2026-06-01 の評価（`docs/growth-playbook-2026-06.md` 施策 S4）の「ロングテール網を張り、試合ページへの内部リンクを増やしてクロール深度を上げる」を実装する。

`fix-seo-indexing.md` で指摘済みの構造的弱点 —「シーズンページの折りたたみラウンドの試合リンクが初期 HTML に届きにくく、末端の試合ページに内部リンク（PageRank）が流れない」— を、**ラウンド単位の独立 URL** と **チーム対戦（H2H）単位の独立 URL** で補強する。狙い:

- ロングテール検索の捕捉:「<大会> <第N節/節> 結果」「<チームA> <チームB> 対戦成績」など。
- 試合ページへの内部リンク経路を増やし、クロール・インデックスを後押し（S2 と相補）。

> **チームページ `/t/[slug]` は実装済み**（`p8-team-page.md` / `p3-team-page-discovery.md`）。本仕様は S4 のうち未実装の「ラウンドハブ」と「H2H」のみを対象とする。

本仕様は2部構成:
- **Part A: ラウンドハブ**（データ非依存・高価値・優先）
- **Part B: H2H 対戦成績ページ**（`matches` から生成・収録範囲の制約あり）

---

## Part A: ラウンドハブページ

### A.1 背景・狙い

シーズンページ（`app/c/[competition]/[season]/page.tsx`）はラウンドを折りたたみ表示し、`?round=` のクライアント側フィルタを持つ（`components/season-match-groups.tsx`）。だがクエリパラメータ URL は SEO で正規化が難しく、独立した被リンク対象にもなりにくい。ラウンドごとの**パス URL**を用意して「今節の全結果」を indexable にする。

### A.2 URL 設計

```
/c/[competition]/[season]/round/[round]
例: /c/six-nations/2025/round/3
    /c/premiership/2024-25/round/18
```

- `[round]` は数値ラウンド（`matches.round`、`lib/db/queries/matches.ts` の `round: number | null`）。
- **ノックアウト等で `round` が null の試合**（`roundName` のみ持つ: 「準決勝」「決勝」など）は本ルートの対象外とし、シーズンページに残す（「未解決の質問」参照）。

### A.3 データ

既存のシーズン取得クエリを再利用し、対象ラウンドの試合のみ抽出する。新規クエリを足す場合:

```ts
// lib/db/queries/matches.ts
export async function getRoundMatches(
  competitionSlug: string,
  season: string,
  round: number,
): Promise<MatchListItem[]> // 既存の MatchListItem 型（round/roundName/score 等を含む）を流用
```

`generateStaticParams` 用に「(competition, season) ごとに存在する数値ラウンド一覧」を返すクエリも用意する（シーズンの試合から `round` の distinct を取る）。

### A.4 UI サーフェス

```
パンくず: Tryline > <大会名> > <シーズン> > 第N節

<h1>  <大会名> <シーズン> 第N節 の結果・日程

[試合カード（MatchCard 流用）]  … そのラウンドの全試合
  - 終了試合: スコア + レビュー/プレビューへのリンク
  - 予定試合: 日時（JST）

[← 第(N-1)節]      [第(N+1)節 →]      （存在するラウンドのみ）
[シーズン全体を見る →]  /c/[competition]/[season]
```

- 試合カードは既存 `components/match-card.tsx` を流用。
- 前後ラウンドへのリンクとシーズンページへのリンクで内部リンクを循環させる。
- 加えて、**シーズンページの各 `RoundHeading`（`components/round-heading.tsx`）から対応するラウンドハブへのリンク**を追加し、season → round → match の経路を作る。

### A.5 メタデータ・構造化データ

```ts
title: { absolute: `${competitionTitle} 第${round}節 結果・日程 | Tryline` }
description: `${competitionTitle} 第${round}節の全試合の結果・スコア・AI日本語レビュー。<対戦カードを数件列挙>。`
alternates: { canonical: `${SITE_URL}/c/${competition}/${season}/round/${round}` }
openGraph: { locale: "ja_JP", type: "website", images: [{ url: `${SITE_URL}/og-image.png`, ... }], ... }
```

- `BreadcrumbList` JSON-LD（Tryline > 大会 > シーズン > 第N節）を出力。`fix-seo-indexing.md` のシーズンページ実装を参考にする。

### A.6 受け入れ条件（Part A）

1. `/c/six-nations/2025/round/3` 等にアクセスすると、そのラウンドの全試合が表示される。
2. 初期 HTML に各試合への `<a href="/matches/...">` が含まれる（折りたたみなし）。
3. 存在しない round / competition / season は `notFound()`（404）。
4. `<link rel="canonical">` と `BreadcrumbList` JSON-LD が出力される。
5. シーズンページの各ラウンド見出しから対応するラウンドハブへのリンクがある。
6. `sitemap.ts` にラウンドハブ URL が追加されている（数値ラウンドのみ）。
7. モバイル375px・デスクトップで崩れない。`pnpm tsc --noEmit` / `pnpm build` が通る。

---

## Part B: H2H 対戦成績ページ

### B.1 背景・制約（正直な前提）

`h2h_last_5`（precomputed カラム）は 2025/2026 の2件のみで履歴が不足している（`project_constraints` 既知制約）。そこで H2H ページは **`matches` テーブルを直接クエリ**し、「**当サイトに収録されている**両チームの対戦」を列挙する。

> **重要な制約の明示**: これは「全history の対戦成績」ではなく「Tryline 収録試合の範囲での対戦履歴」。ページ上でもその旨を明記し（例:「Tryline 収録分の対戦」）、誇張した H2H 戦績（通算◯勝◯敗）を**断定しない**。収録件数が少ないカードは「対戦データが少ない」旨を表示する。

### B.2 URL 設計（正規化）

```
/h2h/[teamA]-vs-[teamB]
例: /h2h/leinster-vs-toulouse
```

- `teamA`/`teamB` は `teams.slug`。
- **重複回避のため slug をアルファベット順に正規化**する。非正規順（`/h2h/toulouse-vs-leinster`）でアクセスされたら、正規順 URL へ 301 リダイレクト（または canonical で正規順を指す）。
- 対戦実績が0件のペアは `notFound()`（無限の組合せページを生成しない）。`generateStaticParams` は「実際に対戦実績のあるペア」のみを返す。

### B.3 データ

```ts
// lib/db/queries/matches.ts
export async function getHeadToHeadMatches(
  teamSlugA: string,
  teamSlugB: string,
): Promise<MatchListItem[]> // (home=A,away=B) OR (home=B,away=A)、kickoff_at desc
```

- `teams` から slug→id を解決。両チームが存在しなければ null。
- 収録対戦ペアの列挙（`generateStaticParams` 用）は、件数が多い場合 **上位 N ペア（収録対戦数の多い順）に制限**してビルド対象を絞ってよい（残りは on-demand / ISR）。

### B.4 UI サーフェス

```
パンくず: Tryline > 対戦成績 > <チームA> vs <チームB>

<h1>  <チームA> vs <チームB> 対戦成績

[注記] Tryline 収録分の対戦を表示しています（全history ではありません）

[対戦リスト]  … kickoff 降順
  <大会名・シーズン>  <A> スコア − スコア <B>  日付   → /matches/[id]

[<チームA>のページ →] /t/[A]   [<チームB>のページ →] /t/[B]
```

- 各対戦行は試合ページへの内部リンク。
- 試合詳細ページ（`components/match-header.tsx`）に「両者の対戦成績 →」リンクを追加し、match → h2h → match の経路を作る（収録対戦が2件以上あるときのみ表示）。

### B.5 メタデータ・構造化データ

```ts
title: { absolute: `${teamA.name} vs ${teamB.name} 対戦成績 | Tryline` }
description: `${teamA.name}と${teamB.name}の対戦成績（Tryline 収録分）。直近の対戦結果とスコア、AI日本語レビューへのリンク。`
alternates: { canonical: `${SITE_URL}/h2h/${normalizedSlug}` }
```

- `BreadcrumbList` JSON-LD（Tryline > 対戦成績 > A vs B）。
- 通算戦績の `SportsEvent`/集計 schema は**作らない**（データ不足のため誇張防止）。

### B.6 受け入れ条件（Part B）

1. 対戦実績のあるペア `/h2h/<a>-vs-<b>` で収録対戦が新しい順に表示される。
2. slug 逆順 URL は正規順へ 301、または canonical が正規順を指す（重複インデックス回避）。
3. 対戦実績0件のペアは404。`generateStaticParams` は実在ペアのみ。
4. ページに「Tryline 収録分」である旨の注記がある。通算◯勝◯敗の断定表示をしない。
5. 試合詳細ページに H2H への導線がある（収録2件以上のとき）。
6. `<link rel="canonical">` と `BreadcrumbList` JSON-LD を出力。
7. `pnpm tsc --noEmit` / `pnpm build` が通る。

---

## データモデル変更

なし（既存 `matches` / `teams` / `match_content` を読むのみ）。`h2h_last_5` は使わない。

## LLM 連携

なし（LLM 呼び出しを追加しない）。

## sitemap

- ラウンドハブ URL（数値ラウンドのみ）を `app/sitemap.ts` に追加。
- H2H URL は数が多くなり得るため、`generateStaticParams` 対象（上位ペア）のみ sitemap に載せる。優先度は試合ページより低め（0.5 目安）。

## 未解決の質問

- **ノックアウトラウンド**（`round` が null・`roundName` のみ）にハブ URL を与えるか。第1案は対象外（シーズンページに残す）。与えるなら `roundName` の slug 化ルールが必要。
- **H2H の `generateStaticParams` 上限**: 全収録ペアを静的生成するか、上位 N ペア＋ISR にするか（ビルド時間とのトレードオフ）。
- 試合詳細の H2H 導線は「収録2件以上」で出す案。1件でも出すか。
- ラウンドハブと season ページの `?round=` フィルタの整理: クエリ版は残すか、ハブへ寄せるか（重複コンテンツにならないよう canonical はパス版を正とする）。
