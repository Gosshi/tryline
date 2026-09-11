仕様書 `specs/fix-manual-facts-generation-cap.md` を実装してください。**先に全文を読んでください。** 決定の根拠は `docs/decisions.md` の D031 です（D029 の決定3を改めるもの。Owner 承認済み）。

## 何を直すか

生成に渡す事実は `MAX_STORED_FACTS = 8` 件が上限で、手動入力の事実が8件を超えると、古い手動事実が通知なしに落ちます（`lib/llm/sourced-facts/fetch.ts:402-407`）。2026-09-12 の日本×アメリカで実際に起き、日本側の先発・対戦成績が落ちかけました。

同じ上限つき関数をキャッシュ判定（`:449-452`）でも使っているため、手動が8件以上の試合は毎回 Web 検索をやり直しています。これも一緒に直します。

## 実装の要点（詳細は spec の「選択ロジック」節）

1. `loadAllowedSourcedFactRows`（上限なし・並び順に `fact` 昇順の第2キーを追加）と、純粋関数 `selectSourcedFactsForGeneration` に分けます。算出方法は spec のコードブロックのとおりにしてください。**手動8件以下の結果が今と1件も変わらないこと**が最重要です
2. `loadSourcedFactsForMatch` はシグネチャを変えずに、上の2つを組み合わせたものにします。`lib/llm/stages/assemble.ts` は触りません
3. `fetchSourcedFactsForMatch` のキャッシュ判定は、上限なしの全行で行います
4. Discord の保存応答（`app/api/discord/interactions/route.ts` の `processResearchFactEntry`）に件数の通知を足します。**件数は同じ2関数から出してください。** 別の SQL で数えないこと。件数取得の失敗で保存を失敗扱いにしないこと

## 処理してほしいエッジケース

- 空配列、手動0件、手動ちょうど8件・16件・17件
- `fetched_at` が完全に同じ手動事実が並ぶ場合（第2ソートキーで境目を決める）
- Discord の応答が2,000字を超える場合（列挙を途中で止め `…ほか${n}件`）
- 件数取得のクエリがエラーを返す場合

## 触らないもの

- `MAX_STORED_FACTS` の値、プロンプトテンプレート、allowlist、`supabase/`
- Discord のモーダル定義（別 spec `specs/feat-discord-source-url-owner-verified.md` が変更します。**こちらを先にマージします**）

## 完了の定義

- spec の受け入れ条件 1〜17 をすべて満たす
- 既存テスト `tests/llm/sourced-facts.test.ts:1052`（手動10件のケース）は、全件渡る期待値とテスト名に更新する
- 受け入れ条件16の「一時的に壊して落ちることを確認」を実際に行い、結果を PR 本文に書く（確認後は元に戻す）
- `pnpm lint`・`pnpm typecheck`・`pnpm test` が通る
- 変更ファイルは `lib/llm/sourced-facts/fetch.ts`・`app/api/discord/interactions/route.ts`・`tests/llm/sourced-facts.test.ts`・`tests/api/discord-interactions.test.ts` の4つを想定しています。これ以外を触る必要が出たら、理由を PR 本文に書いてください

## 参考になる既存パターン

- 手動判定: `isManualSourcedFact`（`fetch.ts:71`）。新しい判定を書かない
- Supabase クエリビルダーのモック: `tests/llm/sourced-facts.test.ts` の `createSourcedFactsBuilder`
- Discord 応答のテスト: `tests/api/discord-interactions.test.ts` の既存の保存系テスト
