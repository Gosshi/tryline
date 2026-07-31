# モバイル: Pull to Refresh + 試合中の自動更新

## 背景

2026-07-25の外部GPTによるiOSリリース可否監査(3回目)で、「新規コンテンツ機能より先にPull to Refresh/試合中の自動更新を入れるべき」と明言された。スポーツアプリとして鮮度が機能不足に見えるため。

実装調査の結果、tryline-mobileには現状 `RefreshControl`(引っ張って更新)が**どの画面にも実装されていない**こと、いずれの `useQuery` にも `refetchInterval` が設定されていないことを確認した。試合が進行中でも、ユーザーが手動でアプリを再起動しない限りスコアが更新されない状態にある。

対象3画面:
- ホーム画面: `app/(tabs)/index.tsx`(`CalendarScreen`)
- 大会詳細画面: `app/(tabs)/competitions/[slug].tsx`(`CompetitionDetailScreen`)
- 試合詳細画面: `src/matches/MatchDetailScreen.tsx`

## スコープ

対象:
- 上記3画面に pull-to-refresh(引っ張って更新)を追加する
- 上記3画面で、表示中のデータに `status === "in_progress"`(試合中)の試合が1件でも含まれる場合、該当クエリを30〜60秒間隔でポーリングする(具体的な秒数はCodexの判断でよいが、spec内に採用値を明記すること)
- `app/_layout.tsx` の `QueryClient` 設定に React Native 向けの `focusManager` イベントリスナーを追加する。**これがないと React Native では `refetchInterval` がバックグラウンドで動き続け、フォアグラウンド復帰時の自動再取得も効かない**(TanStack Query は Web の `visibilitychange` を前提にしており、React Native では `AppState` を明示的に配線する必要がある)。参考実装パターン: `src/stories/MatchStoriesSection.tsx:311,452-465` の `AppState.addEventListener("change", ...)` (ただしこちらは自動送りタイマーの一時停止用途であり、React Query の `focusManager` 配線とは別物。パターンの参考程度に留める)

対象外:
- WebSocket・Server-Sent Events等のプッシュ型ライブ更新(ポーリングのみ)
- ホーム画面のカレンダー取得範囲を「今週」から広げること(既存の週次範囲のまま)
- バックエンド(`/api/v1/*`)のレスポンス形状変更(`status` フィールドは既存のまま利用)
- 大会一覧画面(`app/(tabs)/competitions/index.tsx` 等、存在すれば)への適用(3画面に限定)

## データモデル変更

なし。既存の `V1CalendarMatch.status` / `V1MatchDetail.match.status`(`"scheduled" | "in_progress" | "finished" | "postponed" | "cancelled"`、Web側 `lib/format/status.ts` の `MatchStatus` と同一の値)をそのまま利用する。

## API サーフェス

なし。既存の `trylineApi.calendar()` / `trylineApi.competitionMatches(slug)` / `trylineApi.match(id, accessToken)` をそのまま呼び出す。バックエンド側の変更は不要。

## UI サーフェス

- `src/components/Screen.tsx` は内部で `ScrollView` をレンダリングしている。この `ScrollView` に `refreshControl` プロップを渡せるよう、`Screen` に `refreshing?: boolean` / `onRefresh?: () => void` の任意プロップを追加し、渡された場合のみ `RefreshControl` を有効化する(渡されない既存の呼び出し元には影響を与えない)
- 3画面それぞれで `useQuery` の `refetch` を `onRefresh` に接続し、`isRefetching` を `refreshing` に接続する
- ポーリングの有効化条件は各画面のクエリ結果から動的に判定する(例: `enabled` ではなく `refetchInterval: (query) => hasInProgressMatch(query.state.data) ? POLL_INTERVAL_MS : false` のような形。TanStack Query v5の `refetchInterval` は関数形式をサポートしている点を確認済み、`package.json` で `@tanstack/react-query: ^5.101.2` を使用)

## 受け入れ条件

1. ホーム・大会詳細・試合詳細の3画面で、リストを下に引っ張ると `RefreshControl` のインジケーターが表示され、対応するクエリが再取得される
2. 表示データに `status === "in_progress"` の試合が1件でも含まれる画面では、採用したポーリング間隔(30〜60秒の範囲でCodexが選定・spec内に明記)で自動的にクエリが再取得される
3. `status === "in_progress"` の試合が1件も含まれない場合、ポーリングは発火しない(不要なネットワーク呼び出しが発生しないことを確認できるテストを書く)
4. アプリがバックグラウンドに入るとポーリングが停止し、フォアグラウンド復帰時に再開する(`focusManager` + `AppState` の配線をテストまたは手動QAで確認)
5. 既存の初期ロード・エラー状態・空状態の挙動に回帰がない
6. `pnpm typecheck` / `pnpm lint` / `pnpm test` / `pnpm build` が通る(mobile側の既存CI相当コマンド)
7. 本番相当のTestFlightビルドはOwner承認後に別途実施する

## 未解決の質問

- ポーリング間隔の具体値(30秒 vs 60秒)はCodexの判断に委ねる。バッテリー消費とスコア鮮度のトレードオフを考慮し、選定理由を完了報告に含めること
- 大会詳細画面の `competitionMatches` クエリは大会全体の試合を含みうるため、シーズン中盤で対象試合数が多い場合にポーリング対象判定のコスト(全件走査)が問題にならないか、Codexの実装時に確認すること(現状の試合数規模では問題にならない想定だが、明記する)
