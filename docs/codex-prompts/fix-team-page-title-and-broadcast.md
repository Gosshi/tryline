`/specs/fix-team-page-title-and-broadcast.md` の仕様を実装してください。

コンテキスト:
- プロジェクト規約は `AGENTS.md` を読む
- `app/teams/[slug]/page.tsx`は全チーム共通の汎用ページ。タイトルが汎用的すぎることと放送情報が表示されないことが課題
- **重要（3回目レビューで判明）**: `nameJa`の追加は`TeamDetail`型・`getTeamPageDataBySlug`だけでは不十分。データの流れは`teams`テーブル→`loadTeamRowBySlug()`（非公開関数）→`TeamRow`型（非公開）→`getTeamBySlug()`/`getTeamPageDataBySlug()`という経路で、`TeamRow`型自体が`select("id, slug, name, short_code, country")`で`name_ja`を取得していない。以下**5箇所すべて**を変更する必要がある:
  1. `TeamRow`型（`lib/db/queries/teams.ts:34`）に`name_ja: string | null`を追加
  2. `loadTeamRowBySlug()`（112行目）の`select()`に`name_ja`を追加
  3. `TeamDetail`型（14行目）に`nameJa: string | null`を追加
  4. `getTeamBySlug()`（195行目）の返却オブジェクトに`nameJa: row.name_ja`を追加
  5. `getTeamPageDataBySlug()`（234行目）の返却オブジェクト内`team`に`nameJa: row.name_ja`を追加
- `components/match-card.tsx`の`MatchCard`は既に`<Link>`（`<a>`）でラップされている。放送リンクを内部に追加すると`<a>`のネストになるため、`MatchCard`は変更せず、放送情報は外側の要素に配置する

やること:
- 上記5箇所を変更し、`nameJa`をDBから`generateMetadata()`まで正しく通す
- `generateMetadata()`のtitleを`${team.nameJa ?? team.name} 次戦・日程・結果`、descriptionを次戦・結果・日程・日本語レビューに言及する内容に変更する
- 「次戦」セクション（`data.upcomingMatches`を`kickoffAt >= 現在時刻`でさらに絞り込んだもの）の各試合について`getMatchBroadcastsForMatches`で放送情報を取得し、`MatchCard`とは別の要素として、`MatchCard`を囲むラッパー内に並べて表示する（`components/match-header.tsx`の放送バッジ描画パターン・`target="_blank" rel="noopener noreferrer"`を踏襲）。`MatchCard`コンポーネント自体は変更しない
- **推奨（必須ではない）**: `getTeamUpcomingMatches()`（`lib/db/queries/teams.ts:222`、内部で呼ぶ`loadMatchesByTeamId()`）のクエリに`.gte("kickoff_at", nowIso)`を`.limit()`より前に追加し、DB側で未来の試合のみに絞り込む。現状`status === "scheduled"`のみで絞り込んでおり、ステータス更新が遅れた過去日時の試合が`.limit(5)`の枠を消費するリスクがある。時間の都合で見送る場合は完了報告にその旨を明記する

処理すべきエッジケース:
- 放送情報が無い試合ではバッジを表示しない（空枠を出さない）
- レンダリング結果に`<a>`のネストが発生しないことを確認する
- `data.upcomingMatches`が空の場合でもクラッシュしない
- `nameJa`が`null`のチームでは`team.name`にフォールバックする

完了の定義:
- specの受け入れ条件1〜9を満たす（9番目のOwner目視確認は、実装後にスクリーンショットを添えて報告し、Owner確認を待つ形でよい）
- `pnpm test` / `pnpm tsc --noEmit` / `pnpm lint` / `pnpm build` clean
- 変更ファイル一覧を報告する

要件:
- チーム固有のハードコードはしない（全チーム共通のロジックのまま）
- 「直近の試合」セクションには放送情報を追加しない
- `components/match-card.tsx`自体は変更しない
- 曖昧な箇所や仕様書と実環境の食い違いがあれば、その場で実装を停止して質問する

完了時:
- 実装内容・変更ファイルを要約する
- `/teams/japan`の実際のtitle・放送バッジ表示のスクリーンショットを報告に含める
- レンダリング結果に`<a>`ネストが無いことの確認結果を報告する
- `getTeamUpcomingMatches()`のクエリレベル修正を実施したかどうかを報告する
- 仕様書からの逸脱があれば理由を明示する
- 未解決の質問があれば記載する
