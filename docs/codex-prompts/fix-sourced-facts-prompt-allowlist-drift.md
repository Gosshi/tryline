`specs/fix-sourced-facts-prompt-allowlist-drift.md` の仕様を実装してください。

**着手前に必ず読むこと**: `specs/fix-sourced-facts-allowlist-compliance.md`。本 spec はその積み残しを塞ぐもので、同 spec が除外したドメインを**復活させてはいけません**。

コンテキスト:
- プロジェクト規約は `AGENTS.md` を読む
- 過去の判断は `docs/decisions.md` を読む
- 背景: 許可ドメインから `rugbypass.com`（当時の全 fact の33%を占めた最大ソース）と `planetrugby.com` 等を利用規約違反により除外したが、検索プロンプト側が更新されず、いまも「Prefer ... RugbyPass/Planet Rugby ...」と推奨し続けている。モデルは指示どおり禁止ドメインを返し、それが許可判定で黙って捨てられている
- 変更対象:
  - `lib/llm/sourced-facts/fetch.ts`（`buildSearchPrompt` の推奨ソース記述）
  - `lib/llm/sourced-facts/allowlist.ts`（破棄理由の記録、関連性検証）
  - `lib/llm/sourced-facts/types.ts`（`SourcedFactRejectionReason` の追加）
- 参考にする既存パターン:
  - 却下理由の積み方: `lib/llm/sourced-facts/allowlist.ts:143-148` の `db_authoritative` 系の処理
  - 許可ドメイン判定: 同ファイル `isAllowedSourcedFactDomain`（135〜141行で `return null` している箇所が、記録なしで破棄している問題の実体）

実装のポイント:
- プロンプトの推奨ソースは **`SOURCED_FACT_ALLOWED_DOMAINS` から動的に組み立てる**。ドメイン名をプロンプト文字列に直接書かないこと。同じ齟齬を二度と起こさないための構造的な対策であり、単に文字列を書き換えるだけの修正では受け入れられません
- 関連性検証（`unrelated_fixture`）は spec の2条件をそのまま実装する。チーム名は `teams.name` と `teams.name_ja` の両方で部分一致
- 日付の抽出とキックオフとの差分計算は決定論的に行う

エッジケース:
- チーム名の表記揺れ（`Japan` / `日本` / `日本代表` / `JAPAN XV`）で正当な fact を誤って却下しないこと。部分一致で吸収し、**独自の別名辞書を新設しない**
- fact に日付が1つも含まれない場合、日付条件では却下しない（チーム名条件のみで判定）
- fact に複数の日付が含まれる場合の扱いを決めて、テストで固定する
- `fact` と `fact_ja` で内容が異なる場合、どちらかにチーム名が含まれれば通す
- 許可外ドメインかつ関連性もない fact で、却下理由が二重に積まれて件数が狂わないこと

やらないこと:
- **許可ドメインの追加・復活**。`rugbypass.com` / `planetrugby.com` / `bbc.com` 等は利用規約で AI 学習・データマイニングが禁止されているため意図的に除外されています。プロンプトを allowlist に合わせるのであって、逆ではありません
- `lib/llm/prompts/generate-preview.ts` の変更（記事生成側は対象外）
- プレビューの文字数・構成・見出しの変更
- `match_sourced_facts` のスキーマ変更・マイグレーション追加
- 既存の誤った fact の削除・バックフィル
- 却下判定に LLM を使うこと。すべて決定論的なコードで行う

テスト:
- `buildSearchPrompt` の出力に許可外ドメイン名が含まれないこと
- allowlist を1件増減させるとプロンプト出力も変わること（ハードコードでないことの担保）
- 許可外ドメインの fact が `domain_not_allowed` として記録され、ドメイン別件数が出ること
- 実データ相当のケースで `unrelated_fixture` が働くこと。具体的には、8/8 日本×オーストラリア戦に対して「2026年6月25日、リポビタンDチャレンジカップ2026のマオリ・オールブラックス戦に出場する JAPAN XV の試合登録メンバーが発表されました」という fact が却下されること
- 表記揺れで誤却下しないこと

完了の定義:
- spec の受け入れ条件1〜9をすべて満たす
- `pnpm lint` / `pnpm tsc --noEmit` / `pnpm test` / `pnpm build` clean
- 変更ファイル一覧を報告する

完了時:
- 実装内容を要約する
- プロンプトを allowlist から生成する方式にどう変えたかを、変更後のプロンプト出力例とあわせて報告する
- 複数日付を含む fact の扱いをどう決めたかを報告する
- 曖昧な箇所や仕様書と実環境の食い違いがあれば、その場で実装を停止して質問する
