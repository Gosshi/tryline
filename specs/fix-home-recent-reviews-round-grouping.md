# ホーム「最近のレビュー」を件数上限でなく「節（ラウンド）」単位で表示する

## 背景

Owner から「ホームの『最近のレビュー』でNZ×フランスのレビューがトップから消えているのがもったいない」という指摘（2026-07-07）。

調査の結果（本番DB確認済み）、`app/page.tsx` は `getRecentlyReviewedMatches(3, "ja")`（`lib/db/queries/matches.ts:599`）を呼んでおり、`match_content.generated_at`（レビュー生成パイプラインが処理した時刻）降順で**単純に上位3件**を返している。

2026-07-06に公開された直近6件は、すべて2026-07-04開催のネーションズチャンピオンシップ第1節（`external_ids.wikipedia_round = "1"`）の試合で、生成順は以下だった:

| generated_at | 対戦 | kickoff_at |
|---|---|---|
| 07-06 06:25 | 日本 vs イタリア 27-10 | 07-04 08:40 |
| 07-06 06:19 | フィジー vs ウェールズ 24-39 | 07-04 13:10 |
| 07-06 06:18 | オーストラリア vs アイルランド 31-33 | 07-04 10:10 |
| 07-06 06:17 | アルゼンチン vs スコットランド 38-47 | 07-04 19:10 |
| 07-04 18:28 | 南アフリカ vs イングランド 45-21 | 07-04 15:40 |
| 07-04 15:14 | **NZ vs フランス 34-32** | 07-04 07:10 |

`limit(3)` により上位3件（日本×イタリア、フィジー×ウェールズ、オーストラリア×アイルランド）のみが表示され、同じ節・同じ試合日のNZ×フランスが漏れていた。並び順を`kickoff_at`に変えても、NZ×フランスはこの節で最も早いキックオフのため上位3件には入らない。**根本原因は「件数の固定上限」であり、並び替えでは解決しない。**

対処方針として、Owner は「直近の節（ラウンド）を丸ごと表示する」方式を選択（2026-07-07）。同じ大会・同じ節の試合はまとめて出し、節が変わるタイミングで自動的に絞られる形にする。

**既存の類似ロジック**: 大会別ラウンドハブのパラメータ生成（`mapRoundHubRowsToParams`, `lib/db/queries/matches.ts:1152-1189`）が `competition.family + season + round` をキーにグルーピングする前例がある。`getRoundFromExternalIds`（同ファイル417行目）で `external_ids` からラウンド番号を抽出する既存ヘルパーも流用できる。

## スコープ

対象:
- `lib/db/queries/matches.ts` の `getRecentlyReviewedMatches`（599-624行目）のロジック変更
- `app/page.tsx:103` の呼び出し箇所（シグネチャ変更に合わせて更新）

対象外:
- `getRecentlyReviewedMatchesForFamily`（大会ページ用、別関数・別spec `fix-competition-recent-reviews.md` の対象）
- ホームページのUI表示部分（`app/page.tsx:450-503`）— `.slice(0, 1)` でヒーロー・`.slice(1)` でコンパクト行という既存ロジックは可変長配列に対してそのまま動作するため変更不要
- 大会をまたいだグルーピング（本specは「直近の1件が属する大会+節」のみを対象とし、複数大会の直近ラウンドを同時に混在させる仕様ではない）

## データモデル変更

なし（既存の `external_ids` JSONB カラムを読むのみ）

## API サーフェス

なし

## LLM 連携

なし

## 実装詳細

`getRecentlyReviewedMatches` を以下の方針で変更する:

1. 候補プールとして `generated_at` 降順で一定件数（例: 20件、大会の1節あたりの試合数を安全に超える件数）を取得する。現在の `RECENTLY_REVIEWED_MATCH_SELECT` に `competition.family` を追加する（`mapRoundHubRowsToParams` と同じグルーピングキーを使うため。現状 `slug, name, name_ja, season` のみで `family` が無い）
2. 候補プールの先頭（＝最も新しく生成されたレビュー）から `competition.family` + `competition.season` + `getRoundFromExternalIds(match.external_ids)` を取得し、グルーピングキーとする
3. 候補プールを、同じキーを持つものだけにフィルタする（ラウンドが取れない = `getRoundFromExternalIds` が `null` を返す試合は、先頭1件のみのフォールバックで良い。末尾の質問参照）
4. フィルタ結果は既存通り `generated_at` 降順のまま返す（表示順・ヒーロー選定ロジックを変えないため。並び替えは行わない）
5. フィルタ後の件数が異常に多くなる場合の安全策として、上限8件程度でキャップする（rugbyの1節の試合数は通常8を超えないが、念のため）

関数シグネチャの例（詳細はCodexの裁量）:

```typescript
export async function getRecentlyReviewedMatches(
  language?: "ja" | "en",
): Promise<RecentlyReviewedMatch[]> {
  // 候補プールを取得 → 先頭のラウンドキーを算出 → 同キーのみフィルタ → 上限キャップ
}
```

`limit` パラメータ（現状 `= 3`）は呼び出し元から渡す必要がなくなるため削除し、`app/page.tsx:103` の呼び出しを `getRecentlyReviewedMatches("ja")` に更新する。

## 受け入れ条件

1. 本番データ（2026-07-04開催・ネーションズチャンピオンシップ第1節の6試合）で再現した場合、6件全て（NZ×フランス含む）がホームの「最近のレビュー」に表示される
2. 直近のレビューが属する大会・節と異なる大会・節の試合は含まれない（例: Top 14 の別ラウンドの試合が混ざらない）
3. `getRoundFromExternalIds` が `null` を返す試合（ラウンド情報なし）が直近レビューだった場合、クラッシュせずその1件のみ表示するフォールバックになっている
4. 1節あたりの試合数が異常に多いデータが来ても8件程度で頭打ちになる
5. ホームページのヒーローカード・コンパクト行のUI（`app/page.tsx:450-503`）は変更なしでそのまま動作する
6. `pnpm test` で既存の `getRecentlyReviewedMatches` 関連テストが通る（シグネチャ変更に伴うテスト更新を含む）
7. `pnpm tsc --noEmit` / `pnpm lint` / `pnpm build` clean

## 未解決の質問

- ラウンド情報が取れない試合（`getRoundFromExternalIds` が `null`）が直近レビューだった場合の挙動は「その1件のみ表示」という仮基準で進めてよいか、Owner確認前提で着手してよい
- 候補プールの取得件数（仮に20件）は既存データの節あたり最大試合数を踏まえてCodexが妥当な値に調整してよい
