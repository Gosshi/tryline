# サイトマップの最終更新日を、実際の更新日時にする

## 背景

Google に登録されている試合ページが、ほとんどありません。2026-11-16 時点の実測は次のとおりです。

| 項目 | 実測 |
|---|---|
| URL 検査（7〜10月の公開済み recap 21 本） | 登録 1・「検出 - インデックス未登録」14・「Google に認識されていません」6。最終クロール日はほぼすべて空 |
| GSC クロールの統計情報（直近 90 日） | リクエスト合計 4,210（1 日あたり約 47）、平均応答時間 844ms |
| 同・目的別 | **更新 96%・検出 4%** |
| サイトマップ | 11/16 に Google が読み込み済み、エラー 0、1,483 URL |

Google のクロールのほとんどが、既知のページの再取得に使われています。新しいページを取りに行く分は 4% しかありません。

サイトマップの `<lastmod>` を見ると、**中身が変わっていないページまで「今」更新されたことになっている**ものがあります。Google はサイトマップを毎日読み込むので、これらのページは毎日「更新された」と伝わっています。

| ページ | 本数（11/16 のサイトマップ） | 今の `lastModified` |
|---|---|---|
| 大会トップ `/c/{family}` とシーズン `/c/{family}/{season}` | 58 | `new Date()`（`app/sitemap.ts:45`・`:55`） |
| チーム `/teams/{slug}` | 91 | `new Date()`（`:92`） |
| 選手 `/players/{slug}` | （対象があれば） | `new Date()`（`:98`） |
| ホーム・`/calendar`・`/pricing`・`/c/rwc/2027/bracket` | 4 | `new Date()`（`:105`〜`:125`） |

たとえば `/c/autumn-nations/2021` は、試合の最終更新が 2026-05-08 です。それなのに、サイトマップでは毎日「今日更新」になっています。

**副次的な不具合**
`listMatchIdsWithContent`（`lib/db/queries/matches.ts:1815`）は `match_content` を件数の上限なしで取得しています。そのため、PostgREST の既定の上限（1,000 行）で打ち切られています。

- 公開中の行は 1,192 行（試合 1,027 件）ありますが、サイトマップに載る試合ページは 911 件です
- 古い方の約 116 試合が、サイトマップから漏れています

## スコープ

対象:
- `app/sitemap.ts` の `lastModified` を、ページの中身が最後に変わった日時にする。正しく出せないページは `lastModified` を出さない
- `listMatchIdsWithContent` を全件取得にする（ページング）

対象外:
- `changeFrequency`・`priority`（Google は使わないので変えない）
- サイトマップに載せる URL の増減（漏れていた試合の復帰を除く）
- 取り込み処理が `matches.updated_at` を毎回更新するかどうか。進行中のシーズンは毎日日付が動くが、実際に結果や時刻が変わるので許容する。値が変わらないのに更新している場合の修正は別件
- 試合ページの応答速度、タイトル、説明文（別 spec の候補）

## データモデル変更

なし。

## API サーフェス

### 1. シーズンごとの最終更新日時（新規、`lib/db/queries/competitions.ts`）

```ts
export async function listCompetitionLastModified(): Promise<Map<string, string>>
// key: competitions.id、value: ISO 文字列
```

- 値は次の 2 つのうち、新しい方にする
  - その大会（`competition_id`）の `matches.updated_at` の最大値
  - その大会の試合に付いた、`status = 'published'` の `match_content.generated_at` の最大値
- 試合が 0 件の大会は Map に入れない
- **件数の上限に注意**: `matches` は 1,552 行、`match_content` は 1,000 行を超える。`.range()` でページングして全件読むか、集計を DB 側で行う（RPC やビューを使うならマイグレーションが必要なので、ページングを優先する）。既存のページング例は `lib/db/queries/matches.ts:2148` 付近
- エラーは握りつぶさず投げる（今の `listSeasonsByFamily` と同じ扱い）

### 2. `listMatchIdsWithContent` の全件取得（`lib/db/queries/matches.ts:1815`）

- `.range()` で 1,000 行ずつ読み、全件を `mapSitemapContentRows` に渡す。並び順（`generated_at` の降順）と、重複を除く処理は今のまま
- ページングの途中で順序が揺れないよう、`generated_at` の後に `.order("id")` を足す（`:2147` の既存例と同じ）。新しい `listCompetitionLastModified` のページングも同様にする

## サイトマップの規則（`app/sitemap.ts`）

| ページ | `lastModified` |
|---|---|
| シーズン `/c/{family}/{season}` | `listCompetitionLastModified()` のそのシーズンの値。無ければ出さない |
| 大会トップ `/c/{family}` | その family に属するシーズンの値の最大。無ければ出さない |
| 試合・節・順位・対戦成績 | 今のまま（`generated_at`・`updatedAt` 等） |
| チーム・選手・ホーム・`/calendar`・`/pricing`・`/c/rwc/2027/bracket` | **出さない**（プロパティ自体を省く） |

- `new Date()` を `lastModified` に使う箇所を、`app/sitemap.ts` から無くす
- `listSeasonsByFamily` の戻り値（`CompetitionRow`）に `id` があることを確かめてから突き合わせる。無ければ止めて報告する

## UI サーフェス

なし。

## LLM 連携

なし。

## 受け入れ条件

テストは `tests/app/sitemap-calendar.test.ts` のモックの組み方に合わせ、新しいテストファイル `tests/app/sitemap-lastmod.test.ts` に書く。

1. 試合の `updated_at` が 2026-05-08、公開記事の `generated_at` が 2026-05-09 のシーズンでは、そのシーズンページの `lastModified` が 2026-05-09 になる
2. 試合が 0 件のシーズンでは、そのページのエントリに `lastModified` プロパティが無い（`undefined` ではなくキー自体が無いことを `Object.hasOwn` で確認する）
3. 大会トップの `lastModified` が、その family のシーズンの最大値になる
4. チーム・選手・ホーム・`/calendar`・`/pricing`・`/c/rwc/2027/bracket` のエントリに `lastModified` が無い
5. `vi.useFakeTimers` で現在時刻を 2030-01-01 に固定したとき、サイトマップのどのエントリにも `2030-01-01` の `lastModified` が無い
6. `listMatchIdsWithContent` が 1,000 行を超えるデータ（モックで 2,100 行）を全件読み、重複を除いた件数を返す。`.range()` が `0-999`・`1000-1999`・`2000-2999` で呼ばれる
7. `listCompetitionLastModified` も 1,000 行を超える `matches` と `match_content` を全件読む（モックで確認）
8. **壊して落ちる確認**（PR 本文に出力を貼る。コミットしない）: (a) `listMatchIdsWithContent` のページングを外す、(b) シーズンの `lastModified` を `new Date()` に戻す。それぞれで条件 6 と 5 のテストが落ちる
9. `pnpm tsc --noEmit`・`pnpm lint`・`pnpm test`・`pnpm build` が通り、CI が緑
10. PR 本文に、プレビュー環境の `/sitemap.xml` から次を数えて貼る: 全 URL 数、`/matches/` の URL 数（1,027 前後になる）、今日の日付の `<lastmod>` を持つ URL 数。数え方のコマンドも貼る

## 競合とマージ順

- 触るファイル: `app/sitemap.ts`、`lib/db/queries/competitions.ts`、`lib/db/queries/matches.ts`（`listMatchIdsWithContent` だけ）、テスト
- 進行中の spec で `app/sitemap.ts` を触るものはない（2026-11-16 時点。`rg "sitemap" specs/ -l` で着手前に確認すること）

## 本番操作

なし。マージ後、Owner が GSC でサイトマップを再送信する（任意）。

## 効果の測り方（マージ後、Claude Code が行う）

- 2 週間後と 4 週間後に、GSC のクロールの統計情報で「検出」の割合を見る（今は 4%）
- 同じ時期に、背景の recap 21 本を URL 検査で照会し直す（今は登録 1）
- 上がらなければ、次の候補（試合ページの応答速度、サイトマップに載せる URL を絞る）へ進む

## 未解決の質問

なし。
