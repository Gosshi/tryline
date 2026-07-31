# feat-mobile-match-list-typography-refresh: 試合一覧のスコアボード化とタイポグラフィ統一

対象リポジトリ: **tryline-mobile**のみ。`src/components/MatchCard.tsx`(ホーム・大会詳細の両方で共有)が中心。API・データモデル変更は不要。

## 背景

2026-07-25の外部GPTによる総合監査(デザイン提案)を受けて、大会一覧・大会詳細は`feat-mobile-competition-listing-editorial-redesign`で索引形式へ再設計する。本specはその続きとして、試合一覧(`MatchCard`、ホーム画面と大会詳細の「試合日程」セクションで共有)とPREVIEW/REVIEW表示、および背景色トークンを「新聞の一面」路線へ寄せる。

あわせて指摘**#11(オフシーズンの空状態に個人向け再訪理由がない)**も扱うが、GPTが提案した「あなたの次の試合」ホーム面(次戦カウントダウン等)は新規データ取得が要る規模のためスコープ外とし、既存データの範囲でできる改善に留める(詳細は「未解決の質問」参照)。

**設定画面(`app/(tabs)/settings.tsx`)は対象外。** GPT自身も「設定は実用品なのでiOSのGrouped Listに寄せる」と提案しており、カード中心のままでよい。

## スコープ

対象:
1. `MatchCard`を白いカードからスコアボード形式の行表示に変更する(ホーム・大会詳細の両方に反映される)
2. `has_preview`/`has_recap`のバッジ表示を、`Pill`(丸ピル)から赤い小さなキッカー文字(例:「PREVIEW」「REVIEW」の大文字・字間広め)に変える
3. `theme/tokens.ts`の`colors.paper`を、真っ白/冷たいグレーから、わずかに暖色寄りの紙色に調整する
4. ホーム画面の「今週は試合がありません」空状態に、お気に入りチーム設定済みの利用者向けの一言を追加する

対象外:
- 設定画面(`app/(tabs)/settings.tsx`)のカードUI(既存のまま)
- 「あなたの次の試合まで○日」のようなカウントダウン機能(新規データ取得が必要、別spec候補。「未解決の質問」参照)
- `Pill`コンポーネント自体の変更(他画面での用途に影響するため、`MatchCard`内でのバッジ表示だけを個別に変える)

## UI サーフェス

### `MatchCard`のスコアボード化(`src/components/MatchCard.tsx`)

- `Card`ラップをやめ、罫線(`borderBottomWidth: hairlineWidth`)で区切られた行レイアウトにする(大会一覧の索引デザインと統一感を持たせる)
- レイアウト目安: 日付・時刻(tabular numerals、既存の`typography.small`程度)を左、チーム名(国旗+チーム名、既存`TeamIdentity`をそのまま使う)とスコア(`ScoreText`)を中央、大会名は小さなキッカー(既存の`styles.competition`、`colors.accent`)として上部に残す
- 複数の`MatchCard`が連続する場合、区切り線が重複しないよう(`gap`ではなく`borderBottomWidth`+最後の要素だけボーダーなし、等)呼び出し側のレイアウトと整合させる。呼び出し側(`app/(tabs)/index.tsx`・`app/(tabs)/competitions/[slug].tsx`)の`gap`スタイルは必要に応じて調整してよい

### PREVIEW/REVIEWのキッカー化(`src/components/MatchCard.tsx`)

- `<Pill>プレビュー</Pill>`・`<Pill>レビュー</Pill>`を、`Pill`コンポーネントを使わない専用スタイル(`colors.accent`、大文字英語表記「PREVIEW」「REVIEW」、`letterSpacing`広め、`fontSize: typography.small`程度)に置き換える
- 日本語ラベル(プレビュー/レビュー)を完全に廃止するか英語+日本語併記にするかはCodexの裁量。エディトリアルなキッカー表現になっていることを優先する

### 背景色トークンの調整(`src/theme/tokens.ts`)

- `colors.paper`を、現在の`#f5f6f8`(冷たいグレー寄り)から、わずかに暖色寄りの紙色(例: `#f7f4ef`程度、正確な値はCodexの裁量)に調整する
- `colors.ink`(`#1f2530`、既にわずかに青みがかった濃色)は変更しない
- この変更は全画面の背景に影響する。極端な変化にならないよう、既存の赤アクセント(`colors.accent`)とのコントラストが崩れないことを確認する

### ホーム空状態の改善(`app/(tabs)/index.tsx`)

- 現在の`EmptyState message="今週は試合がありません"`について、お気に入りチームが設定されている場合(`favoriteTeamSlugs.length > 0`、既存の変数を利用)は、追加で一言(例:「お気に入りチームの試合が近づいたら通知でお知らせします」)を添える。新規のAPI呼び出し・データ取得は行わない
- お気に入り未設定の場合は既存の表示のままでよい

## データモデル変更 / API サーフェス / LLM 連携

なし。

## 受け入れ条件

1. `MatchCard`が`Card`コンポーネントを使わなくなっている(罫線ベースの行レイアウトになっている)ことを確認するテスト
2. `has_preview`/`has_recap`のバッジが`Pill`ではなく専用のキッカースタイルで表示されることを確認するテスト
3. `colors.paper`の値が変更されていることを確認する(既存のトークン参照テストがあれば更新する)
4. ホーム画面の空状態で、お気に入りチーム設定済みの場合に追加の一言が表示され、未設定の場合は表示されないことを確認するテスト
5. 既存の`MatchCard`関連テスト(スコア表示・ネタバレガード・アクセシビリティラベル等)が新しいレイアウトでも壊れていないこと
6. TypeScript strict・lint・test green
7. **Owner目視**: TestFlightビルドでホーム画面・大会詳細の試合一覧、PREVIEW/REVIEWキッカー、背景色、オフシーズン空状態を確認する

## 未解決の質問

- 「あなたの次の試合まで○日」のようなカウントダウン機能は、お気に入りチームの直近試合を取得する新規ロジック(既存`/calendar`は31日上限があるため単純な範囲拡大では対応できない)が必要。今回は見送り、GPT監査の「機能改善案トップ5」・保留中の新機能提案4件と合わせて別途優先度判断する([[project_mobile_feature_proposals_pending]]参照)
