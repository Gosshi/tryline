# feat-mobile-competition-listing-editorial-redesign: 大会一覧・大会詳細をカードから索引形式へ再設計

対象リポジトリ: **tryline-mobile**のみ。`app/(tabs)/competitions/index.tsx`・`app/(tabs)/competitions/[slug].tsx`の2ファイル中心。API・データモデル変更は不要。

## 背景

2026-07-25、外部GPTによるiOS総合監査で「白い角丸カード＋ピルの多用が汎用UIキット感を生んでいる」と指摘された。大会一覧・大会詳細はその代表例。あわせて以下の個別指摘も同じ画面群に集中している:

- **年度ピルのVoiceOverアクセシビリティ**: `index.tsx`は大会カード全体を1つの`Pressable`(`accessibilityRole="button"`)でラップし、その内側に年度ごとの`Pressable`をネストしている。iOSのVoiceOverは`accessibilityRole="button"`を持つ親要素配下の子要素を個別ナビゲーション対象として認識しないことがあり、実際に年度を個別選択できない
- **表示中シーズンが大会詳細画面内にない**: `[slug].tsx`はタイトルに大会名(例:「シックスネイションズ」)は出すが、何年度のデータかを示す表示がない
- **順位表のない大会でSTANDINGS見出しが浮く**: `[slug].tsx`は`eyebrow="Standings"`を固定で使っており、順位表を持たない大会(オータムネーションズシリーズ等)でも「STANDINGS」の見出しの下に`EmptyState`だけが表示され、「壊れた順位表」に見える

Owner方針(2026-07-25): この2画面は「ダッシュボード」ではなく「新聞の一面」として組み直す。カードは押せる独立コンテンツ(=大会そのもの)だけに残し、年度は文字組み+下線に変える。

## スコープ

対象:
1. **大会一覧(`index.tsx`)を索引形式に再設計する**: `Card`コンポーネントによる白い角丸カードでの大会グループ包囲をやめ、罫線区切りの縦の索引にする。大会名を大きく、試合数を右上に小さく(例:「15 MATCHES」)配置。年度は複数のピルではなく文字列を横に並べ、選択中の年度だけ赤(`colors.accent`)の下線で示す
2. **年度選択のVoiceOverアクセシビリティ修正**: 大会名エリア(代表シーズンを開く)と各年度は、それぞれ独立した`accessibilityRole="button"`・44pt以上のタップ領域・年度を含む`accessibilityLabel`(例:「2027シーズンを表示」)を持つ、VoiceOverで個別に選択・操作できる要素にする。外側を`accessibilityRole="button"`のPressableで包んで内側の年度を無効化する構造にしない
3. **大会詳細(`[slug].tsx`)にシーズン表示を追加する**: `Screen`の`subtitle`props(既存、日時レンジ表示等で使用済みのtabular-numsスタイル)を使い、`{season}シーズン`のように選択中の年度を常時表示する
4. **順位表のない大会の見出し・空状態を圧縮する**: `pools`・`standings`がともに空のとき、`Screen`の`eyebrow`を`"Standings"`ではなく`"Competition"`に切り替える。`EmptyState`は1行程度に圧縮し、直後の「試合日程」セクションとの余白を詰める(順位表がある場合の見た目・余白は変更しない)
5. **タップフィードバックの統一**: 大会カード・年度・戻るボタンに`SpringPressable`(`src/components/SpringPressable.tsx`)を使う(素の`Pressable`のままにしない)

対象外:
- 「試合日程」セクション内の`MatchCard`自体のデザイン(カード/スコアボード形式の選択は別spec `feat-mobile-match-list-typography-refresh` で扱う)
- 大会一覧のグルーピング・ソートロジック(`groupCompetitionsForDisplay`・`sortCompetitionSeasons`等、既存のまま)
- 順位表テーブル自体(`StandingsTable`)の見た目変更

## UI サーフェス

### `app/(tabs)/competitions/index.tsx`

- 各大会グループを`Card`で囲むのをやめ、`View`+区切り罫線(`borderTopWidth: hairlineWidth, borderTopColor: colors.line`、先頭グループは罫線なし)で構成する
- レイアウト目安:
  ```
  SIX NATIONS
  シックスネイションズ                    15 MATCHES
  2027  2026  2025  2024  2023
  ────────────────────────────
  ```
  (英語名をeyebrow的に小さく出すか、既存の`representative.name`表記のみにするかはCodexの裁量。既存の日本語名表示は維持する)
- 大会名エリアタップで代表シーズン(`group.representative.slug`)へ遷移(既存動作維持)
- 各年度は横並びの独立したタップ要素。選択中(`season.slug === group.representative.slug`)は文字色を`colors.accent`にし、下線(`borderBottomWidth`等)を引く。非選択は`colors.muted`程度
- 年度が1つしかない大会は年度行を省略(既存の`group.seasons.length > 1`条件を維持)

### `app/(tabs)/competitions/[slug].tsx`

- `<Screen eyebrow="Standings" title={...}>`を、`pools`・`standings`がともに空の場合は`eyebrow="Competition"`に切り替える(読み込み中・エラー時は`"Standings"`のままでよい)
- `subtitle`に`query.data?.competition.season`があれば`` `${season}シーズン` ``を渡す(未取得時は`undefined`)
- `EmptyState`表示時のレイアウトを圧縮し、直後の「試合日程」見出しとの間隔を詰める(具体的な余白値はCodexの裁量、他画面の`EmptyState`使用箇所との一貫性を優先してよい)
- 戻るボタン(`Pressable`)を`SpringPressable`に置き換える

## データモデル変更 / API サーフェス / LLM 連携

なし。

## 受け入れ条件

1. `index.tsx`で大会グループが`Card`でラップされなくなっている(区切りが罫線ベースになっている)ことを確認するテスト
2. 各年度が個別に`accessibilityRole="button"`・年度を含む`accessibilityLabel`を持ち、それぞれ独立して`onPress`できることを確認するテスト(外側のPressableがVoiceOverアクセスをブロックしていないことを、要素構造のテストで示す)
3. `[slug].tsx`で、`competition.season`がある場合に`subtitle`として表示されることを確認するテスト
4. `pools`・`standings`がともに空のとき`eyebrow`が`"Competition"`になり、ある場合は`"Standings"`のままであることを確認するテスト
5. 既存の大会一覧・大会詳細のテスト(`__tests__/competitions-grouping.test.tsx`)が新しいUI構造に合わせて更新され、grouping/sorting関連の既存ロジックテストは壊れていないこと
6. TypeScript strict・lint・test green
7. **Owner目視**: TestFlightビルドで大会一覧(カードなしの索引表示・年度の下線選択)と大会詳細(シーズン表示・順位表なし大会の見出し圧縮)を確認する

## 未解決の質問

- 大会一覧の英語名(family相当)をeyebrow的に出すかどうかはデザインの細部でOwnerが実機で見てから調整する可能性がある。今回のCodex実装では「大会名(日本語)を主役にする」ことだけを必須要件とし、英語表記の有無は裁量とする
