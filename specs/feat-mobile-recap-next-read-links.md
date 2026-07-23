# feat-mobile-recap-next-read-links: 記事末尾の「次に読む」導線

対象リポジトリ: **tryline(API) + tryline-mobile(UI)**。2段階(API→UI)で、Codexプロンプトも2本に分ける。`feat-mobile-match-detail-related-news`とは独立(並行実装可)。

## 背景

2026-07-23のFable監査(グロース提案②)で、レビュー記事を読了した後に「次にやることがなくなる瞬間」が最大の離脱ポイントとして指摘された。Trylineの読者は週末に複数試合を続けて読む行動パターン(週平均6試合)があるため、記事末尾から次の試合へ導線を作ることで回遊性を高める。

必要なデータは既にtryline側のクエリ関数として存在する:
- `getRelatedPublishedRecapsForMatch()`(`lib/db/queries/matches.ts:1401`): 同じ大会・同じラウンドの他試合のレビューを返す(なければ他ラウンドへフォールバック)
- `getNextMatchesForTeams()`(`lib/db/queries/matches.ts:1278`): 指定チームの次の試合を返す

いずれも`/api/v1/`では未公開。

## スコープ

対象:
1. **(tryline / API)** `/api/v1/matches/[id]`のレスポンスに以下を追加:
   - `related_recaps: V1NextReadMatch[]`(`getRelatedPublishedRecapsForMatch`を呼び出し、同ラウンド優先で最大2件)
   - `next_team_matches: V1NextReadMatch[]`(`getNextMatchesForTeams`を対戦2チーム分呼び出し、それぞれ直近1件ずつ、最大2件)
2. **(tryline-mobile / UI)** `ContentSection.tsx`の記事末尾(免責フッターの下、`fix-mobile-ios-audit-findings-batch3`で追加予定のフッターより後ろ)に「次に読む」節を追加。`related_recaps`と`next_team_matches`をまとめて表示し、タップで該当試合の詳細画面へ遷移(`router.push`)

対象外:
- おすすめアルゴリズムの高度化(協調フィルタリング等は不要。既存の同ラウンド/同チームというシンプルな軸のみ)
- ホーム画面・大会一覧への同種導線の追加(試合詳細内のみ)
- プレビュー記事末尾への表示(レビュー読了後の離脱対策が主目的のため、対象は`recap`のみ。`preview`には出さない)

## データモデル変更

なし。

## API サーフェス(tryline)

- `lib/api/v1/types.ts` に `V1NextReadMatch` 型を新規追加(最小限のフィールド: `id` / `home_team` / `away_team` / `kickoff_utc` / `competition_name` / `has_recap`)
- `V1MatchDetail` に `related_recaps: V1NextReadMatch[]` と `next_team_matches: V1NextReadMatch[]` を追加
- `app/api/v1/matches/[id]/route.ts` で `getRelatedPublishedRecapsForMatch({ competitionSlug, excludeMatchId: id, round })` と `getNextMatchesForTeams({ teamIds: [homeTeamId, awayTeamId], afterIso: kickoffAt, excludeMatchId: id })` を呼び出しマッピングする
- 両者で重複する試合がある場合(同ラウンドの試合が同時に対戦チームの次戦でもある等)は`related_recaps`側を優先し`next_team_matches`から除外する

## UI サーフェス(tryline-mobile)

- `ContentSection.tsx`にレビュー(`hasRecap`かつ`isRevealed`)がある場合のみ「次に読む」節を表示。プレビューのみの試合では表示しない
- `related_recaps`と`next_team_matches`は見出しを分けて表示(例:「同じ大会の他カード」「両チームの次戦」)。いずれも空なら該当グループを非表示、両方空なら節ごと非表示
- 各行タップで`router.push(`/matches/${id}`)`

## 受け入れ条件

1. **(tryline)** `/api/v1/matches/:id`に`related_recaps`が含まれ、同ラウンドの他試合が優先され、対象試合自身は含まれないことを確認するテスト
2. **(tryline)** `next_team_matches`が両チームの次戦(それぞれ最大1件)を返し、`related_recaps`と重複する試合が除外されることを確認するテスト
3. **(tryline)** 該当データがない場合それぞれ空配列を返すことを確認するテスト
4. **(tryline-mobile)** レビュー開示後に「次に読む」節が表示され、行タップで該当試合詳細へ遷移することを確認するテスト
5. **(tryline-mobile)** プレビューのみの試合、またはレビュー未開示の間は節が表示されないことを確認するテスト
6. **(tryline-mobile)** `related_recaps`・`next_team_matches`が両方空の場合、節全体が描画されないことを確認するテスト
7. 両リポジトリで TypeScript strict・lint・test green
8. **Owner 目視**: 実機または Simulator でレビュー記事末尾の「次に読む」導線の見た目・遷移を確認する

## 未解決の質問

- `V1NextReadMatch`の見出し文言(「同じ大会の他カード」等)はCodexの裁量、既存の日本語表現規約に合わせる
- 表示上限(各グループ最大2件)がUI上ちょうどよいかはOwnerが実装後に目視判断する
