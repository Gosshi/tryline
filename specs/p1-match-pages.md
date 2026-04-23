# 試合ページ（p1-match-pages）

## 背景

`p1-match-ingestion` で Six Nations 2027 の 15 試合が `matches` テーブルに入っている一方、現状 UI は何も無く（`app/page.tsx` は Next.js 初期値）、取り込み成果を確認する手段が存在しません。また `p1-content-pipeline.md` で生成される LLM コンテンツを表示する器も不在です。

本仕様書は、以下 2 ページを最小構成で実装します:

- `/` — 節ごとにグルーピングした試合一覧
- `/matches/[id]` — 試合詳細（日程・対戦カード・スコア・会場）

LLM コンテンツ（プレビュー・レビュー）は本 PR では**表示しません**。代わりに「プレビューは試合開始 48 時間前に公開予定」等のプレースホルダーを置き、`p1-content-pipeline` マージ後に差し替える前提とします。

## スコープ

対象:
- Next.js App Router の Server Component（RSC）としての 2 ページ実装
- Supabase anon クライアントでの read-only クエリ（RLS `public read` ポリシーを既存のまま利用）
- `matches` / `teams` / `competitions` の join
- 節（Round）ごとのグルーピング表示（`matches.external_ids.wikipedia_round` を読む）
- UTC → JST 変換とフォーマット（`date-fns-tz` もしくは組込み `Intl.DateTimeFormat`）
- 試合ステータスのバッジ表示
- 存在しない match id への 404（`notFound()`）
- shadcn/ui の `Card` / `Button` を使った素朴なレイアウト
- モバイルファースト（360px 幅で崩れない）
- 単体テスト（コンポーネント 2 本、日付フォーマッタ 1 本）

対象外:
- 認証 UI（ログイン・サインアップ画面）。本 PR では未ログインでも閲覧可
- LLM コンテンツの表示（プレースホルダーのみ）
- AI チャット（`p1-ai-chat.md` で後続）
- 検索・フィルタ・ソート切り替え
- チーム別ページ・選手ページ
- 多言語対応（UI ラベルは日本語固定、チーム名は英語のまま）
- 画像・ロゴ（`teams` にロゴ URL カラムが無い。追加しない）
- OGP / SEO メタデータの充実（最低限の `<title>` のみ）
- ISR / revalidation 戦略（本 PR ではデフォルトの `force-dynamic` もしくは `revalidate = 60`）
- PWA manifest / service worker（別 PR）

## データモデル変更

**なし**。既存スキーマのみで成立する。

`teams` に日本語名カラムを追加するかは検討したが、本 PR では**追加しない**。Six Nations 6 チーム（England / France / Ireland / Scotland / Wales / Italy）は日本のラグビーファン認知度が十分に高く、英語表記で運用可能。将来他リーグを扱うときにまとめて `teams.name_ja` を検討する。

## モジュール構成

```
/app
  page.tsx                       — 試合一覧ページ（/）
  matches/[id]/page.tsx          — 試合詳細ページ
  matches/[id]/not-found.tsx     — 404 ハンドラ（任意）
/components
  match-card.tsx                 — 一覧の 1 試合カード
  match-header.tsx               — 詳細の対戦カード見出し
  status-badge.tsx               — 試合ステータスバッジ
  round-heading.tsx              — 節見出し（例: "第 1 節"）
  content-placeholder.tsx        — プレビュー／レビュー未公開時のプレースホルダー
/lib
  /db/queries
    matches.ts                   — listMatchesForCompetition / getMatchById
  /format
    kickoff.ts                   — UTC → JST フォーマッタ
    status.ts                    — status キー → 日本語ラベル
```

既存の `components/ui/{button,card}.tsx` を流用する。新規 shadcn/ui コンポーネントの追加は不要。

## データクエリ

### `lib/db/queries/matches.ts`

```typescript
export type MatchListItem = {
  id: string;
  kickoffAt: string;           // ISO UTC
  status: MatchStatus;
  homeTeam: { slug: string; name: string; shortCode: string };
  awayTeam: { slug: string; name: string; shortCode: string };
  homeScore: number | null;
  awayScore: number | null;
  venue: string | null;
  round: number | null;        // external_ids.wikipedia_round
};

export type MatchDetail = MatchListItem & {
  competition: { slug: string; name: string; season: string };
};

export async function listMatchesForCompetition(
  competitionSlug: string
): Promise<MatchListItem[]>;

export async function getMatchById(
  matchId: string
): Promise<MatchDetail | null>;
```

- クライアントは `getSupabaseBrowserClient()` ではなく、RSC 内で使える **anon 前提の server-side クライアント**を新設する（`lib/db/public-server.ts`）。service role ではなく anon を使い、RLS 経由で read する
- `select` は必要列のみ明示、`*` は使わない
- `listMatchesForCompetition` は `kickoff_at asc` でソート
- `getMatchById` は存在しない id で `null` を返す（例外は投げない）

### RLS 確認

`p1-data-model.md` で `matches` / `teams` / `competitions` は public select が許可されているはず。実装時に `supabase/migrations/*_create_rls_policies.sql` を確認し、不足があれば Owner に報告する（本 PR ではポリシー追加・変更しない）。

## ページ仕様

### `/`（試合一覧）

1 競技想定（Six Nations 2027 のみ）だが、将来の拡張を見据えて `competitionSlug` をハードコードで `'six-nations-2027'` として `listMatchesForCompetition` に渡す。

構成:
- ページヘッダ: `<h1>Six Nations 2027</h1>` と競技の期間（`2027-02-06 〜 2027-03-20`）
- 節ごとのセクション（`Round 1` 〜 `Round 5`）。各セクションは `<RoundHeading round={1} />` + `<MatchCard />` のリスト
- 節番号欠損（round = null）の試合は「節未定」セクションにまとめる
- 空データ時は「試合が登録されていません」のメッセージ

### `/matches/[id]`（試合詳細）

構成:
- 上部: `<MatchHeader />` にホーム／アウェイのチーム名・short_code・スコア（確定時のみ）
- 中央: キックオフ日時（JST）・会場・節
- ステータスバッジ
- `<ContentPlaceholder type="preview" />` と `<ContentPlaceholder type="recap" />`
- 戻るリンク（`/`）

存在しない id → `notFound()`

## コンポーネント仕様

### `<MatchCard match={MatchListItem} />`

- shadcn/ui `Card` を基底
- レイアウト:
  - 上段: `<StatusBadge status={match.status} />` と JST 日時
  - 中段: `{homeShortCode} vs {awayShortCode}` を中央に。finished の場合はスコア `{homeScore} - {awayScore}` を強調、それ以外は `—`
  - 下段: 会場
- カード全体が `<Link>` で詳細ページへ遷移

### `<MatchHeader match={MatchDetail} />`

- `<Card>` 1 枚
- チーム名は `<a href={`/teams/${slug}`}>` で将来ルーティング用の anchor は置くが、本 PR ではチーム個別ページが無いため link 先は `/`（または link なし）でも可。**本 PR では link なしで OK**
- キックオフ: JST（例: `2027-02-06 (土) 05:15 JST`）+ 現地時刻（例: `2027-02-05 (Fri) 20:15 GMT`）

### `<StatusBadge status={MatchStatus} />`

- スタイル（Tailwind）と日本語ラベルのみ
- status → (label, className):
  - `scheduled` → "キックオフ予定" / `bg-slate-100 text-slate-700`
  - `in_progress` → "試合中" / `bg-yellow-100 text-yellow-800`
  - `finished` → "終了" / `bg-green-100 text-green-800`
  - `postponed` → "延期" / `bg-orange-100 text-orange-800`
  - `cancelled` → "中止" / `bg-red-100 text-red-800`

### `<RoundHeading round={number | null} />`

- `round` が数値なら `<h2>第 {round} 節</h2>`、null なら `<h2>節未定</h2>`

### `<ContentPlaceholder type="preview" | "recap" />`

- `type === 'preview'`: 「プレビューは試合開始 48 時間前に公開予定」
- `type === 'recap'`: 「レビューは試合終了 1 時間後に公開予定」
- 視覚的に dimmed（`text-muted-foreground`、dashed border）

## 日時フォーマット

### `lib/format/kickoff.ts`

```typescript
export function formatKickoffJst(kickoffAtUtc: string): string;
// 例: "2027-02-06 (土) 05:15 JST"

export function formatKickoffLocal(
  kickoffAtUtc: string,
  ianaTimezone?: string     // 省略時は 'Europe/London' 等を呼び出し側で決める
): string;
// 例: "2027-02-05 (Fri) 20:15 GMT"
```

- JST 変換は `Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', ... })` を利用
- `date-fns-tz` 等の新規依存は**追加しない**（`Intl` で十分）
- 曜日の日本語表記は `Intl` のデフォルトに従う

## エラー・ローディング

- RSC 内で Supabase クエリが失敗した場合、例外をそのまま throw → Next.js の `error.tsx` で拾う
- 本 PR では最小限の `app/error.tsx` と `app/matches/[id]/not-found.tsx` を設置
- ローディング状態は `loading.tsx` を置かない（RSC のネイティブ streaming に任せる）

## メタデータ

- 一覧: `export const metadata = { title: 'Six Nations 2027 - Tryline' }`
- 詳細: `generateMetadata` で `{homeName} vs {awayName} - Tryline` を動的生成
- OGP 画像・description は本 PR では設定しない

## アクセシビリティ

- セマンティック HTML（`<main>`, `<h1>`, `<h2>`, `<time datetime="...">`）
- キーボードナビゲーション: カード全体のリンクは `<Link>` でラップ
- カラーコントラスト: shadcn/ui デフォルトに従う
- スクリーンリーダー用に `<time dateTime={kickoffAtUtc}>` を使う

## モバイル対応

- 360px 幅で崩れない（MatchCard は 1 カラム縦並び）
- 768px 以上で 2 カラムグリッド
- Tailwind の `sm:` / `md:` ブレークポイントで切り替え

## LLM 連携

なし。

## テスト戦略

- `tests/format/kickoff.test.ts`: UTC → JST 変換が正しい（DST なし、常に +9h）
- `tests/components/match-card.test.tsx`: finished 試合はスコア表示、scheduled は `—` 表示（Vitest + @testing-library/react）
- `tests/components/status-badge.test.tsx`: 5 つの status それぞれで期待ラベルが描画される

Supabase クエリの統合テストは本 PR では書かない（`lib/db/queries/matches.ts` は shape-check のみ、実データ検証は手動）。

## 依存パッケージ

- `@testing-library/react` / `@testing-library/jest-dom`（既存に無ければ追加）
- `jsdom`（Vitest での DOM シミュレーション、既存 Vitest 設定に合わせる）

追加しない:
- `date-fns-tz`（`Intl.DateTimeFormat` で十分）
- `next-intl` / `react-i18next`（多言語対応は対象外）
- 追加の shadcn/ui コンポーネント（Button / Card のみで足りる）

## 受け入れ条件

- [ ] `pnpm dev` 起動後、`http://localhost:3000/` で Six Nations 2027 の 15 試合が節ごとにグルーピングされて表示される
- [ ] 試合カードをクリックすると `/matches/[id]` に遷移する
- [ ] `/matches/[id]` で存在しない UUID を指定すると 404 ページが表示される
- [ ] キックオフ日時が JST 表記で表示される（GMT +9h）
- [ ] finished 試合のスコアが表示され、scheduled 試合は `—` 表示になる
- [ ] ステータスバッジが 5 つの status すべてで適切な日本語ラベル・色で描画される
- [ ] プレビュー／レビューのプレースホルダーが詳細ページに表示される
- [ ] モバイル（360px）とデスクトップ（1280px）の両方でレイアウトが崩れない
- [ ] RLS 経由で anon ユーザーが matches / teams / competitions を read できる（新規ポリシー追加なし）
- [ ] `pnpm lint` / `pnpm typecheck` / `pnpm test` が全てグリーン
- [ ] 単体テスト 3 本（上記「テスト戦略」）が全て成功
- [ ] 本 PR で `teams` テーブルへのカラム追加・RLS ポリシー変更を行っていない

## 未解決の質問

1. `/matches/[id]` で戻る導線は `<Link href="/">一覧に戻る</Link>` のみで十分か、パンくず UI を置くか — **本 PR は前者（シンプルリンク）** を採用
2. `round = null` 試合の扱い — 2026-04 時点で Six Nations 2027 のパース結果に round null が含まれるかは未確認。Codex 実装時に `listMatchesForCompetition` の結果を確認し、全件 round 有りなら「節未定」セクションは描画しない
3. キックオフ時刻未定（kickoff_at が 00:00 UTC で据え置きの場合）の表示: 「日時調整中」等の別ラベルを出すか、そのまま `00:00 JST` 表示するか — **本 PR はそのまま表示**（ingestion 側が 00:00 UTC 据え置きを採用しているため、UI でも同じ表示で一貫させる）
