# fix-team-page-title-and-broadcast: チームページのタイトル改善と放送情報表示

## 背景

2026-07-21、GPTとの壁打ちで「日本代表ページ（`/teams/japan`）を強化し、放送情報・直近レビューへの導線を増やすべき」という提案があった。

実コード確認: `app/teams/[slug]/page.tsx`は全チーム共通の汎用ページで、既に「直近の試合」（`MatchCard`でレビュー有無を表示）・「次戦」（`data.upcomingMatches`、大会横断で取得済み）のセクションが存在する。GPTの想定より既に充実しているため、日本代表専用のハードコードは行わず、**全チーム共通で効果のある2点**に絞って改善する:

1. **タイトル・descriptionが汎用的すぎる**: 現在`title: data.team.name`（例: 単に"Japan"）、`description: "${team.name}の最近の試合と次戦の日程"`。検索意図（「次戦」「日程」「結果」等）に寄せた文言になっていない
2. **放送情報が一切表示されない**: `getMatchBroadcastsForMatches`（`lib/db/queries/match-broadcasts.ts`）で試合ごとの放送・配信情報を取得できるが、チームページはこれを使っていない。試合詳細ページ（`components/match-header.tsx`）には既に放送バッジの描画パターン（`target="_blank" rel="noopener noreferrer"`付き）があるため、それを参考にする

**実コード確認・訂正（2026-07-21、3回のレビューで判明）**:
- `data.upcomingMatches`に、何らかの理由でステータス更新が遅れた過去日時の試合が混在するリスクを避けるため、表示対象を`kickoffAt >= 現在時刻`でも絞り込む
- `components/match-card.tsx`の`MatchCard`は既にコンポーネント全体が`<Link>`（`<a>`要素）でラップされている（28行目付近）。ここに`components/match-header.tsx`の放送バッジのような別の`<a>`（外部放送・配信サイトへのリンク）を**内側に**追加すると、`<a>`の中に`<a>`がネストする不正なHTMLになる。したがって`MatchCard`への`broadcasts` propの追加は行わない。代わりに、チームページ側で`MatchCard`と放送リンク群を**同じ親要素（`MatchCard`の外側）**に並べて配置する
- **（3回目レビューで判明・重要）** `nameJa`の追加は`TeamDetail`型・`getTeamPageDataBySlug`のマッピングだけでは不十分。実際のデータの流れは`loadTeamRowBySlug()`（非公開関数、112行目）→`TeamRow`型（34行目、非公開）→`getTeamBySlug()`（195行目）/`getTeamPageDataBySlug()`（234行目）という経路で、`TeamRow`型自体も`teams`テーブルから`select("id, slug, name, short_code, country")`で取得しており`name_ja`を含んでいない。以下**すべて**を変更対象に含める必要がある:
  1. `TeamRow`型（`lib/db/queries/teams.ts:34`）に`name_ja: string | null`を追加
  2. `loadTeamRowBySlug()`（112行目）の`select()`に`name_ja`を追加
  3. `TeamDetail`型（14行目）に`nameJa: string | null`を追加
  4. `getTeamBySlug()`（195行目）の返却オブジェクトに`nameJa: row.name_ja`を追加
  5. `getTeamPageDataBySlug()`（234行目）の返却オブジェクト内`team`に`nameJa: row.name_ja`を追加

## スコープ

対象:
- 上記5箇所すべてを変更し、`nameJa`をDBから`generateMetadata()`まで正しく通す
- `app/teams/[slug]/page.tsx`の`generateMetadata()`を更新する:
  - title: `${team.nameJa ?? team.name} 次戦・日程・結果`
  - description: `${team.nameJa ?? team.name}の次戦・直近の試合結果・日程を掲載。日本語レビューも。`
- 「次戦」セクション（`data.upcomingMatches`を`kickoffAt >= 現在時刻`でさらに絞り込んだもの）の各試合について、`getMatchBroadcastsForMatches`で放送情報を取得する。表示は`MatchCard`とは別の要素として、`MatchCard`の外側（同じ試合を囲むラッパー`<div>`内など）に並べる。放送バッジ自体は`components/match-header.tsx`の描画パターン（サービス種別ラベル・サービス名・`target="_blank" rel="noopener noreferrer"`付きリンク）を踏襲する。放送情報が無い試合はバッジを表示しない
- `MatchCard`コンポーネント自体（`components/match-card.tsx`）は変更しない
- **推奨（必須ではない）**: `getTeamUpcomingMatches()`（`lib/db/queries/teams.ts:222`）のクエリは現状`status === "scheduled"`のみで絞り込み、`.limit(5)`を適用してから返している。何らかの理由でステータス更新が遅れた過去日時の`scheduled`試合が5件以上存在すると、クライアント側の`kickoffAt >= 現在時刻`フィルタだけでは本当の未来の試合が取得結果から漏れる可能性がある。可能であれば`loadMatchesByTeamId()`のクエリ自体に`.gte("kickoff_at", nowIso)`を`.limit()`より前に追加し、DB側で絞り込む。時間の都合で見送る場合は完了報告にその旨を明記する

対象外:
- `/teams/japan`専用のハードコードされた文言・レイアウト（他チームと共通のロジックのまま）
- 「直近の試合」セクションへの放送情報追加（終了試合には放送情報の意味が薄いため、次戦のみ対象）
- `TeamStatsPanel`・`TeamPlayersSection`の変更
- `MatchCard`コンポーネント自体へのprops追加・構造変更

## データモデル変更

なし。

## API サーフェス

なし。

## LLM連携

なし。

## 受け入れ条件

1. `/teams/{slug}`のtitleが`${team.nameJa ?? team.name} 次戦・日程・結果`形式になっている。`nameJa`が`TeamRow`・`getTeamBySlug()`・`getTeamPageDataBySlug()`の全経路で正しく伝播しており、TypeScriptエラーが出ない
2. descriptionが次戦・結果・日程・日本語レビューに言及する内容になっている
3. 「次戦」セクションの各試合について、`match_broadcasts`にデータがある場合は放送・配信サービス名が`MatchCard`の外側の要素として表示され、リンクに`target="_blank"`・`rel="noopener noreferrer"`が付いている
4. 放送情報が無い試合では、バッジ表示がない（空のバッジ枠等が出ない）
5. レンダリングされたHTMLに`<a>`要素のネスト（`<a>`の子孫に別の`<a>`）が存在しない
6. `components/match-card.tsx`自体に変更がない
7. 「次戦」セクションに`kickoffAt`が現在時刻より前の試合が表示されない
8. `pnpm tsc --noEmit` / `pnpm lint` / `pnpm test` / `pnpm build` が通る
9. 本番デプロイ前に実際のブラウザで`/teams/japan`のスクリーンショットを確認する。本番デプロイ自体はOwner承認後に別途行う

## 未解決の質問

なし。
