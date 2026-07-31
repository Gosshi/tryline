# fix-mobile-competition-detail-empty-standings: 大会詳細画面が順位表なしの大会で空白になる

対象リポジトリ: **tryline-mobile**のみ。`app/(tabs)/competitions/[slug].tsx`の1ファイルを触る軽微な修正。API・データモデル変更は不要。

## 背景

Owner がTestFlightビルドで実機確認中(2026-07-25)、大会タブで大会をタップすると空白のページになる大会があると気づいた。原因を本番APIで確認した。

`app/(tabs)/competitions/[slug].tsx`は`query.data.pools.length`が真ならプール別テーブル、そうでなければ`query.data`が存在する限り`query.data.standings`のテーブルを描画する。しかし一部の大会は**プールも順位表も持たない**(テストマッチ形式のシリーズはリーグ表という概念自体がないため)。この場合、画面には見出し・戻るボタンのみが残り、実質空白に見える。

本番APIで確認済み(2026-07-25時点):
- `autumn-nations-2025`(オータムネーションズシリーズ、試合数32): `pools: 0, standings: 0`
- `rugby-championship-2025`(ザ・ラグビーチャンピオンシップ、試合数12): `pools: 0, standings: 0`
- `pnc-2026`(パシフィック・ネーションズカップ、試合数2): `pools: 0, standings: 0`

これらは大会タブの一覧で試合数が多い(=上位に表示される)ため、多くの利用者が踏みやすい。データが欠けているのではなく、これらの大会形式(テストマッチ・親善試合的な代表戦シリーズ)が構造上リーグ表を持たないのが正しい状態であり、直すべきは画面側の空表示ハンドリングである。

## スコープ

対象:
1. `app/(tabs)/competitions/[slug].tsx`で、`query.data`が存在し、かつ`pools.length === 0`かつ`standings.length === 0`のとき、既存の`EmptyState`コンポーネント(`src/components/States.tsx`、ホーム画面の「今週は試合がありません」等で使用済み)を使って「この大会には順位表がありません」という趣旨のメッセージを表示する

対象外:
- 順位表データを新たに取得・生成するAPI側の変更(テストマッチ形式の大会に順位表が存在しないのは仕様であり、データ欠損ではない)
- 大会一覧画面(`app/(tabs)/competitions/index.tsx`)の並び順・グルーピングロジック(既存のまま)
- 空の場合に試合一覧など代替コンテンツを表示すること(今回はEmptyStateメッセージのみ。将来的に「この大会の試合を見る」等の導線を足すかはOwner判断、別spec)

## UI サーフェス

- `app/(tabs)/competitions/[slug].tsx`の`query.data?.pools.length ? ... : query.data ? ... : null`の分岐に、`query.data`が存在し`pools.length === 0`かつ`standings.length === 0`の場合の分岐を追加する
- 表示メッセージ: `この大会には順位表がありません`
- 既存の`EmptyState`のimport・呼び出し方(`<EmptyState message="..." />`、`action`は不要)をそのまま使う

## データモデル変更 / API サーフェス / LLM 連携

なし。

## 受け入れ条件

1. `pools`が空配列・`standings`が空配列のとき、`EmptyState`が「この大会には順位表がありません」というメッセージで描画されることを確認するテスト
2. `pools`に要素があるとき(既存動作)、`standings`に要素があるとき(既存動作)は、それぞれ従来通りプール別テーブル・単一テーブルが描画されることを確認する回帰テスト(既存テストがあれば壊れていないこと)
3. TypeScript strict・lint・test green
4. **Owner目視**: TestFlightビルドで`autumn-nations-2025`・`rugby-championship-2025`・`pnc-2026`など順位表を持たない大会を開き、空白ではなく上記メッセージが表示されることを確認する

## 未解決の質問

なし。
