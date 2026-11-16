# 大会の全試合を中継するサービスを、試合ごとの視聴情報が無いときに出す

## 背景

リーグワン 2026-27 は 12/12（土）に開幕します。ところが今は、どの試合ページにも視聴方法が出ません。シーズンページの「どこで見られますか？」も「確認中」のままです。

- 放送・配信の取り込み（`lib/broadcasts/ingest.ts`）は JRFU の日程ページだけが元です。日本代表戦にしか行が入りません
- リーグワン 3 シーズン・329 試合で、`match_broadcasts` は 0 行です（2026-11-16 実測）
- シーズンページの文言は `lib/format/season-summary.ts:72` の「このシーズンの放送・配信情報は確認中です。」です。下の大会ガイド（`competition_guides`、11/16 に Owner が更新済み）では J SPORTSオンデマンド・DAZN を案内しており、同じページの中で食い違っています

一方、リーグワンは各サービスが「全試合」を中継すると発表しています。そのため、試合ごとに行を作らなくても、大会単位で正しく案内できます。

| サービス | 範囲 | 根拠 |
|---|---|---|
| J SPORTS（BS 放送） | ディビジョン 1・2 の全試合 | J SPORTS 発表（PR TIMES、2026-11-13）https://prtimes.jp/main/html/rd/p/000000636.000014079.html |
| J SPORTSオンデマンド | ディビジョン 1〜3 の全試合をライブ配信 | 同上 |
| DAZN | 全ディビジョン全試合をライブ配信 | DAZN 発表「年間視聴パス 2026-27シーズン」https://dazngroup.com/press-room/1015/ |

Tryline に入っているリーグワン 2026-27 はディビジョン 1 だけ（101 試合、2026-12-12〜2027-05-09）なので、3 つとも全試合が対象です。TOKYO MX は 9 試合だけなので、ここには入れません。

Bing の実クエリでは「リーグワン ラグビー 日程」が 89 表示・順位 8〜9・クリック 0 で、「放送」を含むクエリも多く出ています。シーズンページの FAQ（構造化データにも入る）に正しい答えを出すことは、流入にも効きます。

## スコープ

対象:
- 大会（シーズン）単位の「全試合を中継するサービス」を持つ新しいテーブル
- 試合ごとの行が無い試合では、そのテーブルの行を視聴情報として返す（読み出しの共通関数で行う）
- シーズンページの「どこで見られますか？」の文言
- 試合ページの視聴方法欄に、大会単位の情報であることを添える 1 行
- リーグワン 2026-27 の 3 行を入れる

対象外:
- 放送の取り込み処理（`lib/broadcasts/ingest.ts`）。試合ごとのチャンネル（J SPORTS 1〜4 のどれか等）は取らない
- 大会ガイド（`competition_guides`）の本文
- 過去シーズン（2024-25・2025-26）への行の追加
- 他の大会への行の追加（仕組みは共通だが、行を入れるのはリーグワン 2026-27 だけ）
- モバイルアプリの改修。`/api/v1` の返り値の形は変えない（中身にフォールバックの行が入るだけ）

## データモデル変更

新しいマイグレーション `supabase/migrations/20261116120000_create_competition_broadcasts.sql`。`supabase/migrations/20260715020000_create_match_broadcasts.sql` と同じ形にする。

```sql
create table if not exists public.competition_broadcasts (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions(id) on delete cascade,
  service_name text not null,
  url text not null,
  kind text not null check (kind in ('tv', 'streaming')),
  display_order integer not null default 0,
  verified_at timestamptz not null default now(),
  source_url text not null,
  created_at timestamptz not null default now(),
  unique (competition_id, service_name)
);
```

- `competition_id` に index、RLS 有効、`anon, authenticated` に select だけ（`match_broadcasts` の policy・grant と同じ書き方）
- **このテーブルに入れてよいのは、その大会の全試合を中継するサービスだけ**。テーブルのコメント（`comment on table`）にもそう書く
- `source_url` は必須（`match_broadcasts` と違い null 不可）。全試合という主張の根拠を必ず残す
- 同じマイグレーションの末尾で、リーグワン 2026-27 の 3 行を入れる。大会 ID は直書きせず、`competitions` から `slug = 'league-one-2026-27'` で引く（ローカル DB に該当大会が無ければ 0 行で終わる）

```sql
insert into public.competition_broadcasts
  (competition_id, service_name, url, kind, display_order, verified_at, source_url)
select c.id, v.service_name, v.url, v.kind, v.display_order, '2026-11-16T12:00:00Z', v.source_url
from public.competitions c
cross join (values
  ('J SPORTS（BS）', 'https://www.jsports.co.jp/rugby/league-one/', 'tv', 0,
   'https://prtimes.jp/main/html/rd/p/000000636.000014079.html'),
  ('J SPORTSオンデマンド', 'https://www.jsports.co.jp/rugby/league-one/', 'streaming', 10,
   'https://prtimes.jp/main/html/rd/p/000000636.000014079.html'),
  ('DAZN', 'https://www.dazn.com/ja-JP/', 'streaming', 20,
   'https://dazngroup.com/press-room/1015/')
) as v(service_name, url, kind, display_order, source_url)
where c.slug = 'league-one-2026-27'
on conflict (competition_id, service_name) do nothing;
```

- `lib/db/types.ts` に `competition_broadcasts` の型を足す（`match_broadcasts` の定義と同じ形）

## API サーフェス

### 1. `MatchBroadcast` に出どころを足す（`lib/db/queries/match-broadcasts.ts`）

```ts
export type MatchBroadcast = {
  displayOrder: number;
  kind: MatchBroadcastKind;
  scope: "match" | "competition"; // 追加
  serviceName: string;
  sourceUrl: string | null;
  url: string;
  verifiedAt: string;
};
```

既存の `match_broadcasts` 由来の行は `scope: "match"`。既存テストのフィクスチャに `scope: "match"` を足すのはよい（期待値は変えない）。

### 2. `getMatchBroadcastsForMatches(matchIds)` のフォールバック

今の処理（`match_broadcasts` を読んで試合ごとにまとめる）の後に、次を足す。

1. 返す Map にキーが無い試合 ID（＝試合ごとの行が 0 件）を集める。0 件なら何もしない
2. その試合の `id, competition_id, status` を `matches` から読む（`.in("id", ids)`）
3. `status = 'cancelled'` の試合は除く
4. 残った試合の `competition_id` で `competition_broadcasts` を読む（`display_order`、`service_name` の順）
5. 該当する行があれば、その試合のキーに `scope: "competition"` の `MatchBroadcast[]` を入れる（`verifiedAt` と `sourceUrl` は大会の行の値）

規則:
- **試合ごとの行が 1 件でもある試合には、大会の行を混ぜない**（試合ごとの情報が優先）
- 手順 2・4 のクエリがエラーになったら、`console.error` に試合 ID の件数とエラーを出し、**フォールバック無しの結果（今と同じ結果）を返す**。試合ページ・シーズンページ全体を落とさない（マイグレーション前のデプロイや一時障害への備え）。手順 1 より前の `match_broadcasts` のエラーは今どおり投げる
- `matchIds` が 1,000 件を超える呼び出しは今のところ無いが、`.in()` に渡す ID は既存の `chunkArray`（`lib/db/pagination.ts`）で 200 件ずつに分ける

### 3. `getMatchBroadcastPresenceForMatches(matchIds)`

大会の行を持つ試合も「視聴情報あり」に含める。実装は、手順 2 のフォールバックと同じ判定を使う（`getMatchBroadcastsForMatches` を呼んでキーを返す形でよい）。

### 4. `getMatchBroadcastServicesForMatches`・`getV1BroadcastsForMatches`

コードの変更は不要（`getMatchBroadcastsForMatches` を通るので自動で入る）。`V1MatchBroadcast` の形は変えない。`scope` を `/api/v1` の返り値に足さない。

### 5. シーズンの案内文（`lib/format/season-summary.ts` の `getSeasonBroadcastGuide`）

`scope` を見て文言を分ける。`services` の作り方（サービス名ごとに 1 つ、`displayOrder` → 名前の順）は今のまま。

| 状態 | `answer` |
|---|---|
| 行が 0 件 | 今のまま（「このシーズンの放送・配信情報は確認中です。…」） |
| `scope: "competition"` の行がある | `このシーズンは{大会単位のサービス名を「・」でつなぐ}で全試合を視聴できます（{大会単位の行の最新 verifiedAt を M月D日}確認）。試合ごとのチャンネルや配信ページは各サービスの番組表でご確認ください。` |
| `scope: "match"` の行だけ | 今のまま（「掲載中の一部試合に視聴情報があります。…」） |

- 両方ある場合は、大会単位の文の後に、試合単位の文から「掲載中の一部試合に」を含む今の文をそのまま続ける（ただし試合単位のサービスだけを列挙する）
- 日付は `formatBroadcastVerifiedDate`（`lib/format/broadcast.ts`）と同じく JST で出す。`"M月D日"` の形にするため、既存の関数を使わず同じファイルに小さな関数を足してよい

例（リーグワン 2026-27）:
`このシーズンはJ SPORTS（BS）・J SPORTSオンデマンド・DAZNで全試合を視聴できます（11月16日確認）。試合ごとのチャンネルや配信ページは各サービスの番組表でご確認ください。`

## UI サーフェス

### 試合ページの視聴方法欄（`components/match-header.tsx:220` 付近）

- 表示される行が **すべて** `scope: "competition"` のとき、サービスのボタンの下に 1 行添える: `大会の全試合を中継するサービスです。チャンネル・配信ページは各サービスの番組表でご確認ください。`（`text-[11px]`、既存の「確認日」と同じ白 80% 程度。新しい色は足さない）
- 見出し「視聴方法」、確認日、ボタンの見た目は変えない
- 英語ページ（`language === "en"`）では、この 1 行を出さない（今の英語ページの視聴方法欄の扱いを変えない）

### シーズンページ・大会トップ

`seasonBroadcastGuide.answer` が変わるだけ。表示位置・FAQ 構造化データの組み立ては変えない。`services.length > 0` になるので、「大会公式サイト」リンクは今の条件どおり出なくなる。

### h2h・チームページ・カレンダー

`getMatchBroadcastsForMatches`・`getMatchBroadcastPresenceForMatches` を通るので自動で入る。コード変更不要。h2h の次戦説明文（`formatNextMatchDescription`）も自動で入る。

## LLM 連携

なし。

## 受け入れ条件

テストの置き場所: クエリは `tests/db-queries-match-broadcasts.test.ts`、文言は `tests/lib/format/season-summary.test.ts`、試合ヘッダーは既存の match-header のテスト（無ければ `tests/components/` に新規）。

1. 試合 A（`match_broadcasts` 0 行、大会に `competition_broadcasts` 3 行）で、`getMatchBroadcastsForMatches([A])` が 3 件を `display_order` 順に返し、すべて `scope: "competition"`、`verifiedAt`・`sourceUrl` が大会の行の値
2. 試合 B（`match_broadcasts` 1 行、同じ大会に 3 行）では、B の 1 件だけを返す（大会の行を混ぜない）。`scope: "match"`
3. 試合 C（`status: "cancelled"`、`match_broadcasts` 0 行）は Map にキーが無い
4. 大会に行が無い試合は Map にキーが無い（今と同じ）
5. `matches` または `competition_broadcasts` の読み出しがエラーのとき、例外を投げず、フォールバック無しの結果を返し、`console.error` が 1 回呼ばれる。`match_broadcasts` 自体のエラーは今どおり投げる
6. `getMatchBroadcastPresenceForMatches([A, B, C])` が `{A, B}` を返す
7. `getSeasonBroadcastGuide` が、大会単位の行だけの Map で、上の例と完全一致の `answer` を返す。行 0 件と試合単位だけの場合の `answer` は今の文字列と完全一致（既存テストを変えずに通る）
8. 試合ヘッダー: 全行が `scope: "competition"` のとき補足の 1 行が出る。1 行でも `scope: "match"` があれば出ない。英語ページでは出ない
9. マイグレーションのテスト（`tests/db-migrations-*.test.ts` の既存の書き方に合わせる）: テーブル定義に `unique (competition_id, service_name)`、`source_url text not null`、RLS 有効、select だけの grant があり、insert が `slug = 'league-one-2026-27'` で大会を引いている
10. **壊して落ちる確認**（PR 本文に出力を貼る。コミットしない）: (a) フォールバックの手順を丸ごと外す → 条件 1 と 6 が落ちる、(b) 「試合ごとの行があれば混ぜない」を外す → 条件 2 が落ちる
11. `pnpm tsc --noEmit`・`pnpm lint`・`pnpm test`・`pnpm build` が通り、CI が緑
12. PR 本文に、プレビュー環境の `/c/league-one/2026-27` の「どこで見られますか？」の文と、リーグワン 2026-27 の試合ページ 1 つの視聴方法欄のスクリーンショットを貼る（プレビューの DB は本番なので、マイグレーション適用後でないと出ない。未適用・SSO で開けない場合は保留と書く。Claude Code が確認する）

## 競合とマージ順

- 触るファイル: `lib/db/queries/match-broadcasts.ts`、`lib/format/season-summary.ts`、`components/match-header.tsx`、`lib/db/types.ts`、新しいマイグレーション、テスト
- `lib/db/queries/matches.ts` は触らない（`getMatchBroadcastPresenceForMatches`・`getMatchBroadcastsForMatches` の呼び出し側は変えない）

## 本番操作（Owner）

1. **マージ前に**、マイグレーションを本番に適用する（新しいテーブルをページのコードが読むため。ただしエラー時はフォールバック無しで動くので、順序を誤ってもページは落ちない）
2. 適用後の確認（Claude Code が行う）: `select service_name, kind, display_order from competition_broadcasts` が 3 行
3. マージ後、`/c/league-one/2026-27` と試合ページで表示を確認する（Claude Code が行う）

## 運用（来季以降）

- 新しいシーズンの行は、各サービスの発表を確認してから入れる（INSERT は Owner が SQL エディタで行う）
- 全試合でなくなったサービス（発表が無い等）は行を削除する。全試合と言えないサービスを入れない

## 未解決の質問

なし。サービスのリンク先は、J SPORTS の 2 つは J SPORTS のリーグワン特設ページ（発表内の関連リンク）、DAZN はトップページとした。DAZN のリーグワン専用ページの URL は発表に無く、未確認のため使わない。
