# feat-featured-competition-auto-selection: 注目大会の自動選定

## 背景

`lib/featured-competition.ts`の`FEATURED_COMPETITION`は、2026-07-11に`fix-featured-competition-switch-to-nc.md`でPNC 2026からNations Championship 2026へ手動切替されたハードコード定数。同specの背景には「開幕前・レビュー0本の状態で長期間表示され続けた」という運用課題があり、「恒久的な自動選択の仕組みは別spec `feat-featured-competition-auto-selection.md`で対応予定」と明記されていた。本specがそれに当たる。

2026-07-21時点、Nations Championship 2026は次の日本代表戦が2026-11-07（対ウェールズ）まで無く、一方で日本代表は2026-08-08（対オーストラリア、リポビタンDチャレンジカップ2026）を控えている。このまま放置すると、同じ「開幕前の大会が長期間注目大会として表示され続ける」問題が再発する。

実コード確認・訂正（2026-07-21レビューで判明）:
- `lib/db/queries/teams.ts`の`TeamDetail`型（`getTeamBySlug`の返り値）は`{country, name, shortCode, slug}`のみで**チームID（`id`）を含まない**。そのままでは`getNextMatchesForTeams`に渡すteamIdsが手に入らない
- `getNextMatchesForTeams({afterIso, teamIds})`の返り値は`TeamNextMatch[] = {teamId: string, match: UpcomingMatch}[]`であり、**試合そのものの配列ではない**。最初の要素の`.match`にアクセスする必要がある
- `lib/db/queries/matches.ts`内の非公開関数`getHeadToHeadTeamBySlug()`（1930行目付近）が`select("id, slug, name, short_code").eq("slug", teamSlug)`でチームIDを取得しており、同等のクエリパターンが既に存在する

これらを踏まえ、**共通ヘルパー関数`getNextMatchForTeamSlug(teamSlug: string, afterIso: string): Promise<UpcomingMatch | null>`を新規に実装**する。内部でチームslug→ID解決と次戦取得の両方を行い、呼び出し側は文字列slugと基準時刻のISO文字列を渡すだけでよい設計にする。`afterIso`を引数化することで、テスト時に現在時刻に依存しない検証ができる。**この関数は`feat-competition-hub-post-tournament-navigation.md`でも同じ用途で必要になるため、`lib/db/queries/matches.ts`にexportされた共通関数として1箇所に実装し、重複実装しない。**

## スコープ

対象:
- `lib/db/queries/matches.ts`に`getNextMatchForTeamSlug(teamSlug: string, afterIso: string): Promise<UpcomingMatch | null>`を新規実装する（`getHeadToHeadTeamBySlug`と同様のteams直接クエリでID解決 → 解決したIDで`getNextMatchesForTeams`相当のロジックを呼び、最初の要素の`.match`を返す。チームが見つからない場合は`null`を返す）
- `lib/featured-competition.ts`の`FEATURED_COMPETITION`（静的定数）を、非同期関数`getFeaturedCompetition(now: Date = new Date()): Promise<FeaturedCompetition>`に置き換える:
  1. `getNextMatchForTeamSlug("japan", now.toISOString())`を呼ぶ
  2. 取得できた場合、その`competition.family`・`competition.season`を採用し、`headline`・`description`を対戦カード・大会名から動的に生成する（例: `headline: "${competitionTitle}を追う"`、`description`は次戦の対戦カード・日程を含む一文。文言はCodexが自然な日本語になるよう調整してよい）
  3. 取得できない場合（異常系）のみ、現行のNations Championship 2026をフォールバック定数として使う
  4. `now`を引数化することで、テストで現在時刻に依存しない検証ができるようにする
- `app/page.tsx`で`FEATURED_COMPETITION`静的importを`await getFeaturedCompetition()`の呼び出しに置き換える。この静的定数は現在、以下の**複数箇所**で参照されているため、すべてを動的な値に置き換える:
  - `FeaturedCompetitionCard`へのprops（`family`・`season`・`headline`・`description`）
  - `isFeaturedCompetitionMatch`（`match.competition.family === FEATURED_COMPETITION.family && ...`によるフィルタ関数）
  - `getNextMatchForCompetition({family, season})`呼び出し（featured competitionの「次戦」stats取得）
  - `featuredCompetitionMatches`（今週の試合数カウント用フィルタ）
- `components/featured-competition-card.tsx`を、`FEATURED_COMPETITION`を直接importする現在の実装から、`family`・`season`・`headline`・`description`をpropsで受け取る実装に変更する

対象外:
- 日本代表戦以外の基準（大会の格・視聴者数予測等）による選定ロジック — 今回は「直近の日本代表戦を含む大会」の単一基準のみ
- キャッシュ・再検証タイミングの変更（既存のNext.jsのデータ取得・revalidate挙動をそのまま踏襲する）

## データモデル変更

なし。

## API サーフェス

なし。

## LLM連携

なし。

## 受け入れ条件

1. `getNextMatchForTeamSlug("japan", afterIso)`が、指定した基準時刻以降で最も近い日本代表の試合を返す（テストでは固定の`afterIso`を渡し、現在時刻に依存しない形で検証する）
2. `getFeaturedCompetition(now)`が、`now`時点で日本代表の直近の未来の試合が属する大会（family/season）を返す。テストでは`now`に固定の`Date`を渡し、2026-07-21相当の日時を渡した場合に`family: "lipovitan-challenge-cup"`・`season: "2026"`が返ることを確認する（`feat-lipovitan-challenge-cup-2026.md`で本番投入済みのデータに基づく）
3. 日本代表の未来の試合が1件も存在しない場合、現行のNations Championship 2026の値がフォールバックとして返る（クラッシュしない）
4. ホームページの「注目大会」カードが、`getFeaturedCompetition()`の返り値に応じた大会名・次戦情報を表示する
5. 「大会ページを見る」リンクが、動的に選ばれた大会の`/c/{family}/{season}`に正しく遷移する
6. 大会画像（`getCompetitionHeroImage`）が、専用画像の無い大会（例: リポビタンDチャレンジカップ）でも既定画像で破綻しない
7. `app/page.tsx`内の`isFeaturedCompetitionMatch`・`getNextMatchForCompetition`呼び出し・`featuredCompetitionMatches`フィルタが、すべて動的に決まったfamily/seasonを参照している（ハードコードされた`FEATURED_COMPETITION`参照が残っていない）
8. `pnpm tsc --noEmit` / `pnpm lint` / `pnpm test` / `pnpm build` が通る
9. 本番デプロイ前に実際のブラウザでスクリーンショットを確認する。本番デプロイ自体はOwner承認後に別途行う

## 未解決の質問

なし。
