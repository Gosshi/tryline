# fix-match-detail-next-watch-position: 試合詳細ページの「次に見る」を上部へ移動

## 背景

2026-07-21、GPTとの壁打ちで「個別試合ページの回遊導線（次に見る）が、ラインナップ・順位・AIチャットより下の最後尾にあり、Google経由の即時回答ユーザーには届きにくい」という指摘があった。

実コード確認: `app/matches/[id]/page.tsx`の現在のセクション順は次の通り（`components/match-detail-user-state.tsx`の`NextWatchSection`はページ最後尾）:

```
MatchDetailHeader（スコア）
MatchFavoriteTeamControls
LangToggle（該当時）
MatchContentSection（プレビュー/レビュー本文）
MatchLineupsSection
StandingsTable
PremiumMatchChat
NextWatchSection ← 現在ここ（最後尾）
```

`NextWatchSection`は既に`nextMatches`（両チームの次戦、`TeamNextMatch[]`）・`relatedRecaps`・`teams`をpropsで受け取る完成済みのコンポーネントで、これらの値は`MatchFavoriteTeamControls`の時点で既に計算済み（サーバー側のデータ取得は関数冒頭で完了しているため、ページのどの位置に置いても利用可能）。新しいコンポーネントを作る必要はなく、既存の`<NextWatchSection>`の描画位置を移動するだけで対応できる。

**設計判断の訂正（2026-07-21レビューで指摘）**: 当初「スコアヘッダー直後・本文より前」に移動する案だったが、これはGoogle経由の検索者が最も求めているプレビュー/レビュー本文（`MatchContentSection`）を「次に見る」ナビゲーションの後ろに押し下げてしまい、本末転倒になる。正しい移動先は**本文（`MatchContentSection`）の直後、`MatchLineupsSection`・`StandingsTable`より前**。これでも現在の最後尾（`PremiumMatchChat`の後）よりは大幅に前に来ており、目的（回遊導線を早期に見せる）は達成できる。

## スコープ

対象:
- `app/matches/[id]/page.tsx`内の`<NextWatchSection>`の描画位置を、`MatchContentSection`（プレビュー/レビュー本文）の直後、`<MatchLineupsSection>`より前に移動する
- 現在の最後尾（`<PremiumMatchChat>`の直後）にあった`<NextWatchSection>`は削除する（同じセクションを2箇所に重複表示しない）

対象外:
- `NextWatchSection`コンポーネント自体のUI・データ取得ロジックの変更（そのまま移動するのみ）
- 「コンパクト版」としての新規デザイン・別コンポーネントの作成（既存コンポーネントは既にカード型で十分コンパクトなため、複製せず移動のみで対応する）
- `MatchLineupsSection`・`StandingsTable`・`PremiumMatchChat`の表示順・内容の変更

## データモデル変更

なし。

## API サーフェス

なし。

## LLM連携

なし。

## 受け入れ条件

1. `<NextWatchSection>`が、本文（`MatchContentSection`、プレビュー/レビュー）の直後、`MatchLineupsSection`より前に表示される（スコアヘッダー・本文より前には表示されない）
2. `<NextWatchSection>`がページ内に1箇所のみ表示される（重複表示されない）
3. `NextWatchSection`が受け取るprops（`nextMatches`・`relatedRecaps`・`teams`）の値は変更前と同じである
4. `MatchLineupsSection`・`StandingsTable`・`PremiumMatchChat`の表示内容・順序は変更前と同じである
5. `pnpm tsc --noEmit` / `pnpm lint` / `pnpm test` / `pnpm build` が通る
6. 本番デプロイ前に実際のブラウザでスクリーンショットを確認する。本番デプロイ自体はOwner承認後に別途行う

## 未解決の質問

なし。
