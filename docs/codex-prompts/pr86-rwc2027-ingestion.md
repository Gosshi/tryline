# PR #86 — RWC 2027 フィクスチャー取り込み

## 背景

Rugby World Cup 2027（2027/10/1〜11/13、オーストラリア）の全 52 試合スケジュールが公式発表済み。
Wikipedia にも試合一覧ページが存在する。
`/c/rwc/2027` のページ枠は実装済みで、DB に `rwc-2027` の competition レコードが入れば即公開できる。

## スコープ

対象:

- `supabase/migrations/<timestamp>_seed_rwc2027.sql`
- `lib/ingestion/sources/wikipedia-rwc.ts`
- `lib/ingestion/fixtures.ts`
- `app/api/cron/ingest-fixtures/route.ts`

対象外:

- `app/c/rwc/2027/page.tsx` — 変更不要（既存実装で対応済み）
- `app/c/rwc/2027/bracket/page.tsx` — 変更不要

---

## 1. マイグレーション — competitions + teams シード

```sql
-- competition レコード
INSERT INTO competitions (name, season, family, slug)
VALUES ('Rugby World Cup', '2027', 'rwc', 'rwc-2027')
ON CONFLICT (slug) DO NOTHING;

-- 新規チーム（RWC 2027 から初参加 or 既存に存在しない可能性があるもの）
INSERT INTO teams (name, country, slug) VALUES
  ('Chile',          'Chile',          'chile'),
  ('Hong Kong China','Hong Kong China', 'hong-kong-china'),
  ('Spain',          'Spain',          'spain'),
  ('Canada',         'Canada',         'canada'),
  ('USA',            'USA',            'usa'),
  ('Zimbabwe',       'Zimbabwe',       'zimbabwe')
ON CONFLICT (slug) DO NOTHING;
```

---

## 2. `lib/ingestion/sources/wikipedia-rwc.ts` — RWC 2027 定数を追加

既存の RWC 2023 定数はそのまま残す。以下を追記する。

```ts
export const RWC_2027_WIKIPEDIA_URL =
  "https://en.wikipedia.org/wiki/2027_Men%27s_Rugby_World_Cup";

export const RWC_2027_POOL_PAGE_URLS: Record<string, string> = {
  "Pool A": "https://en.wikipedia.org/wiki/2027_Men%27s_Rugby_World_Cup_Pool_A",
  "Pool B": "https://en.wikipedia.org/wiki/2027_Men%27s_Rugby_World_Cup_Pool_B",
  "Pool C": "https://en.wikipedia.org/wiki/2027_Men%27s_Rugby_World_Cup_Pool_C",
  "Pool D": "https://en.wikipedia.org/wiki/2027_Men%27s_Rugby_World_Cup_Pool_D",
  "Pool E": "https://en.wikipedia.org/wiki/2027_Men%27s_Rugby_World_Cup_Pool_E",
  "Pool F": "https://en.wikipedia.org/wiki/2027_Men%27s_Rugby_World_Cup_Pool_F",
};

export const RWC_2027_COMPETITION_SLUG = "rwc-2027";
export const RWC_2027_SEASON = "2027";

export const RWC_2027_POOL_ASSIGNMENTS: Record<string, string> = {
  australia: "Pool A",
  "new-zealand": "Pool A",
  chile: "Pool A",
  "hong-kong-china": "Pool A",
  "south-africa": "Pool B",
  italy: "Pool B",
  georgia: "Pool B",
  romania: "Pool B",
  argentina: "Pool C",
  fiji: "Pool C",
  spain: "Pool C",
  canada: "Pool C",
  ireland: "Pool D",
  scotland: "Pool D",
  uruguay: "Pool D",
  portugal: "Pool D",
  france: "Pool E",
  japan: "Pool E",
  usa: "Pool E",
  samoa: "Pool E",
  england: "Pool F",
  wales: "Pool F",
  tonga: "Pool F",
  zimbabwe: "Pool F",
};

export const RWC_2027_TEAM_SLUG_BY_WIKIPEDIA_NAME: Record<string, string> = {
  ...RWC_TEAM_SLUG_BY_WIKIPEDIA_NAME,
  Chile: "chile",
  "Hong Kong China": "hong-kong-china",
  Spain: "spain",
  Canada: "canada",
  USA: "usa",
  Zimbabwe: "zimbabwe",
};

export function resolveRwc2027TeamSlug(teamName: string): string {
  const slug = RWC_2027_TEAM_SLUG_BY_WIKIPEDIA_NAME[teamName];
  if (!slug) throw new Error(`Unknown RWC 2027 team name: ${teamName}`);
  return slug;
}
```

---

## 3. `lib/ingestion/fixtures.ts` — `ingestRwc2027Fixtures()` 追加

`ingestSixNations2027Fixtures` と同じパターンで実装する。
各プールページを並列フェッチしてパース → upsert する。

**実装前に `RWC_2027_POOL_PAGE_URLS` の Pool A ページを実際にフェッチして HTML 構造を確認すること。**
RWC 2023 と同一フォーマットであれば既存パーサーを流用し、異なる場合は `parseWikipediaRwc2027Html` として新規実装する。

---

## 4. `app/api/cron/ingest-fixtures/route.ts` — competition 切り替え対応

現状は Six Nations 2027 固定。`competition` パラメータで切り替えられるよう拡張する:

```ts
const bodySchema = z.object({
  competition: z
    .enum(["six-nations-2027", "rwc-2027"])
    .default("six-nations-2027"),
});
```

`competition` の値に応じて `ingestSixNations2027Fixtures` / `ingestRwc2027Fixtures` を呼び分ける。

---

## 完了の定義

- [ ] `https://www.trylinerugby.com/c/rwc/2027` が Coming Soon ではなくプール表・試合一覧を表示する
- [ ] 全 24 チームが DB に存在する
- [ ] Pool A〜F の試合が正しいチームで登録されている
- [ ] `POST /api/cron/ingest-fixtures` に `{ "competition": "rwc-2027" }` を渡すと upsert が走る
- [ ] TypeScript エラーなし・`pnpm build` 通過
