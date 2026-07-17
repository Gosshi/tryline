# fix-mobile-status-labels: アプリの英語ステータス露出の日本語化とリポジトリ衛生

対象リポジトリ: **tryline-mobile**

## 背景

v1 の Owner 目視確認（2026-07-14 スクリーンショット）で、試合カードと試合詳細に API の `status` 生値（`scheduled` 等）が英語のまま露出していることを確認した。日本語観戦アプリとしての品質項目として日本語ラベルに置き換える。あわせて、`npx expo run:ios`（prebuild）が生成する `ios/` と `expo-env.d.ts` が untracked ノイズになる問題を `.gitignore` で解消する。

## スコープ

対象:
- 試合ステータスの日本語ラベル化（表示箇所: `src/components/MatchCard.tsx`、`src/matches/MatchDetailScreen.tsx`。他に `match.status` を表示している箇所があれば同様に）
- `.gitignore` に `/ios` と `expo-env.d.ts` を追加

対象外:
- ステータス以外の文言変更、レイアウト変更
- API レスポンスの変更（サーバーは生値のまま。ラベル化はクライアント表示層のみ）

## UI サーフェス

ステータスは DB の check 制約で 5 値（tryline `supabase/migrations/20260422060630_create_match_tables.sql`）。表示ラベル:

| status | 表示 |
|---|---|
| `scheduled` | 試合前 |
| `in_progress` | 試合中 |
| `finished` | 終了 |
| `postponed` | 延期 |
| `cancelled` | 中止 |

- 変換は共通関数（例: `src/api/labels.ts` の `matchStatusLabel(status: string): string`）に集約し、表示箇所からインライン分岐を排除する
- **未知の値はそのまま表示する**（将来サーバーが値を追加してもクラッシュ・空表示にしない）
- `in_progress` の表示はネタバレ防止のマスク対象外（試合中であること自体はスコアではない）

## データモデル変更 / API サーフェス / LLM 連携

なし。

## 受け入れ条件

1. `matchStatusLabel` が 5 値を上表どおり変換し、未知の値（例: `"unknown_status"`）をそのまま返す（単体テスト）
2. カレンダーの試合カードと試合詳細で `scheduled` 等の英語生値が表示されない（コンポーネントテストで日本語ラベルを検証）
3. `git status` 上で `ios/` と `expo-env.d.ts` が untracked に現れない（`.gitignore` 追加。既存 tracked の `expo-env.d.ts` は `git rm --cached` で index から外す）
4. TypeScript strict・CI（lint / tsc / test）green

## 未解決の質問

なし。
