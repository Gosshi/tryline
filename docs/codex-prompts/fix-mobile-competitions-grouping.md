# Codex プロンプト: fix-mobile-competitions-grouping

**tryline-mobile リポジトリ**で貼る。

---

`specs/fix-mobile-competitions-grouping.md`（tryline本体リポジトリから参照。内容はこのメッセージと一緒に渡します）に従って、大会タブ（`app/(tabs)/competitions/index.tsx`）を大会×シーズンのフラット一覧から、大会ファミリー単位のグルーピング表示に変更してください。

## 現状

`app/(tabs)/competitions/index.tsx` は `/api/v1/competitions` の32件（大会×シーズンの組み合わせ、例: パシフィックネーションズカップ2026・2025・2024・2022が別々の行）をフラットにリスト表示している。`V1Competition`型（`src/api/types.ts`）には既に大会ファミリーの識別子 `family` が存在するので、これを使ってグルーピングする。

## やること

1. `family` でグルーピングし、11ファミリー分のカードを表示する関数を新規作成（`sortCompetitionsForDisplay` と同じファイル内、または `src/competitions/` 配下の新規ユーティリティファイルに切り出してよい）
2. 各グループの「代表シーズン」選定ロジック: グループ内で `match_count > 0` のシーズンがあれば、その中で `start_date` が最も新しいものを選ぶ。無ければ単純に `start_date` が最も新しいものを選ぶ
3. グループの並び順: 代表シーズンの `match_count > 0` を優先、同条件内は `name` の `localeCompare` 昇順（既存の `sortCompetitionsForDisplay` の考え方を踏襲）
4. カードUI: 大会名(`name`)を1回、代表シーズンの `season`/`match_count` を表示、シーズンが2件以上あればチップ行でシーズン一覧を表示（1件のみならチップ行は出さない）。チップタップでそのシーズンの `slug` へ遷移、カード本体タップで代表シーズンへ遷移
5. 既存の `sortCompetitionsForDisplay`（シーズン単位のソート）は重複させず、グルーピングロジックの内部で再利用するか置き換える

## エッジケース

- シーズンが1件しかないファミリー（例: Nations Championship）: チップ行を出さない。代表シーズン選定ロジックが1件でも正しく動くこと
- `match_count` が全シーズン0のファミリー: グループの並び順で後方に配置されること
- `start_date` が `null` のシーズンが混在する場合の比較（nullは最も古い扱いにする）

## 参考にすべきパターン

- 既存の `sortCompetitionsForDisplay`（`app/(tabs)/competitions/index.tsx`）のソート方針
- `theme/tokens.ts` の `colors` / `spacing` / `typography`（新しい値を追加せず既存トークンのみ使う）
- `Card` コンポーネント（`src/components/Card.tsx`）の既存の使い方

## 完了の定義

- `specs/fix-mobile-competitions-grouping.md` の受け入れ条件7項目を全て満たす
- グルーピング・代表シーズン選定・グループソートに対するユニットテストを追加し `pnpm test` が通る
- `pnpm tsc --noEmit` が通る
- 曖昧な点や仕様書と実装の食い違いがあれば、実装を進める前にその場で報告してください（実装後に末尾でまとめて質問しない）
