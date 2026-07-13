# ホーム「最近のレビュー」で同一大会が複数ブロックに重複表示される問題を修正

## 背景

`feat-home-multi-competition-featured-reviews.md`（実装済み）は、ホーム「最近のレビュー」を大会ごとに1ブロック（ヒーロー1件＋コンパクト行）表示する設計にした。同specの背景節に明記された意図は「大会ごとに1件ヒーローカードを出す（**1大会1ブロック**、各ブロックにヒーロー+コンパクト行）」（同spec 9行目）。

しかし実装（`lib/db/queries/matches.ts` の `getRecentlyReviewedGroupKey`・`buildRecentlyReviewedCompetitionGroups`）は `[competition.family, competition.season, round].join("|")` をグルーピングキーにしており、**大会だけでなく節（ラウンド）単位**でグループを分けている。

2026-07-13、本番サイト（trylinerugby.com）を目視確認したところ、「最近のレビュー」セクションに「ネーションズチャンピオンシップ 2026」という**全く同じ見出しのブロックが2つ**表示されていた（1つ目: 南アフリカ対スコットランド42-28を筆頭に6試合、2つ目: ニュージーランド対フランス34-32を筆頭に別の5試合）。ネーションズチャンピオンシップは週次で試合が行われる大会のため、直近7日（`RECENTLY_REVIEWED_ACTIVE_WINDOW_DAYS`）のアクティブウィンドウ内に2つの節がまたがって収まることが常態化しており、その都度「1大会1ブロック」という設計意図に反して2ブロックが表示される。

グループが持つデータには `roundName`（節名）が含まれているが、`app/page.tsx` の見出し（`<h3>`）は競技名+シーズンのみを表示しており、節の違いを示していない。そのため利用者からは「同じ内容の重複セクション」に見える。

## スコープ

対象:
- `lib/db/queries/matches.ts` の `getRecentlyReviewedGroupKey` から `round` を除外し、グルーピングキーを `[family, season]` のみにする（節をまたいで同一大会を1ブロックにマージする）
- `RECENTLY_REVIEWED_ROUND_CAP`（現状8）を、複数節のマージを想定した値に見直す
- マージ後もヒーロー選定（`pickRecentlyReviewedHero`、レベルスコアに基づく既存ロジック）がマージされた全エントリに対して正しく機能することを確認する

対象外:
- ヒーロー選定のスコアリングロジック自体の変更（`feat-home-multi-competition-featured-reviews.md` で実装済みのレベルスコア判定はそのまま使う）
- `RECENTLY_REVIEWED_GROUP_LIMIT`（表示ブロック数上限4）の変更
- `RECENTLY_REVIEWED_ACTIVE_WINDOW_DAYS`（7日）の変更
- `getRecentlyReviewedMatches`（単一大会向け、別関数。`fix-home-recent-reviews-round-grouping.md` の対象だった関数）への変更。ただし影響有無を確認し、必要ならテストを追加する
- 大会ページ側の節（ラウンド）表示・ラウンドハブ（`mapRoundHubRowsToParams` 等）は対象外。ホームの「最近のレビュー」セクションのみが対象

## データモデル変更

なし（既存の `external_ids` JSONB カラムを読むのみ）

## API サーフェス

なし

## LLM 連携

なし

## 実装詳細

1. `getRecentlyReviewedGroupKey`（`lib/db/queries/matches.ts:665` 付近）から `round` をキーから除外し、`[competition.family, competition.season].join("|")` のみにする
2. `buildRecentlyReviewedCompetitionGroups` 内の `RECENTLY_REVIEWED_ROUND_CAP`（248行目、現状8）を、複数節がマージされる前提で妥当な値に引き上げる（目安8〜12。ホームが縦に伸びすぎない範囲でCodexが調整）
3. `pickRecentlyReviewedHero` は既存のレベルスコア比較ロジックのため、マージ後の配列に対してもそのまま動作する想定。念のため、複数節にまたがるエントリでも正しく最高レベルの試合が選ばれることをテストで確認する
4. 変数名・コメント等に残る「ラウンド単位」を前提にした古い記述があれば、実態（大会単位、複数節を許容）に合わせて更新する

## 受け入れ条件

1. 本番相当のデータ（同一大会の2節分が同時にアクティブウィンドウ内にある状態）を再現した場合、「最近のレビュー」に同一大会名の見出しが2回出現せず、1大会1ブロックになる
2. マージされたブロック内で、複数節にまたがるエントリの中からレベルスコアが最も高い試合が正しくヒーローに選ばれる
3. 大会ごとのブロック数上限（4）、アクティブウィンドウ（7日）は変更後も従来通り機能する
4. `pnpm test` で既存の関連テストが通り、「同一大会・複数節のマージ」のケースを検証する新規テストが追加されている
5. `pnpm tsc --noEmit` / `pnpm lint` / `pnpm build` clean
6. 本番相当のデータで実際にホームページをブラウザで確認し、ネーションズチャンピオンシップ（または同様に複数節がまたがっている大会）の見出しが1回だけ表示されることをスクリーンショットで確認する

## 未解決の質問

- マージ後のコンパクト行の上限件数（現状8→いくつが妥当か）はCodexの裁量で調整してよい
- 同一大会で3節以上が同時にアクティブウィンドウ内に収まるケース（通常のラグビー大会の開催頻度では起きにくい想定）は、上限キャップで自然に収まるため特別な対応は不要とする
