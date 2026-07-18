# fix-recap-placeholder-time-promise: レビュー待ち文言の「1時間後」約束を撤回する

対象リポジトリ: **tryline のみ**（tryline-mobile に同種文言なし、2026-07-18 grep 確認済み）。

## 背景

`components/content-placeholder.tsx:16` の recap 待ちプレースホルダーが「レビューは試合終了 1 時間後に公開予定」と表示するが、**この約束は国際大会で常態的に破られている**。レビュー生成は `match_events`（Wikipedia 取り込み）に依存し、Nations Championship 等では反映が数時間〜翌日かかる（実例: 2026-07-18 日本×フランスは試合終了5時間超で未生成のまま Owner が発見）。守れない時刻を明示するのは「敵は間違い」の信頼方針に反する。

なお 2026-07-03 の `specs/fix-content-placeholder-copy.md` は本文言を「時間約束型の良い文言」と評価していたが、上記の実運用実績によりその判断を**本 spec で上書き**する（当該 spec の実装内容＝補助文言の除去は不変）。

## スコープ

対象:
- `components/content-placeholder.tsx` の `COPY.recap.pre_window` 文言変更

対象外:
- preview 側の文言（「プレビューは試合開始 48 時間前に公開予定」は生成窓 12〜72h とほぼ整合しており維持）
- `preparing` / `unavailable` の文言
- 生成パイプライン・表示ロジックの変更
- tryline-mobile

## 変更内容

`COPY.recap.pre_window` を時刻を約束しない文言に変更する:

```
変更前: レビューは試合終了 1 時間後に公開予定
変更後: レビューは試合データの確認後、順次公開されます
```

## 受け入れ条件

1. recap の pre_window プレースホルダーに新文言が表示され、「1 時間」という文字列がコンポーネントから消える
2. preview 側の文言・アイコン・レイアウトは無変更
3. 既存テストが通る（該当文言のスナップショット/文字列アサーションがあれば更新）
4. `pnpm tsc --noEmit` / `pnpm lint` / `pnpm test` / `pnpm build` が通る

## 未解決の質問

- なし
