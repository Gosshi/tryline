# Codex プロンプト: fix-sourced-facts-allowlist-robots-txt-gptbot

**tryline リポジトリ**で貼る(仕様書: `specs/fix-sourced-facts-allowlist-robots-txt-gptbot.md`)。`fix-sourced-facts-allowlist-compliance`(マージ済み)の後続。

---

`specs/fix-sourced-facts-allowlist-robots-txt-gptbot.md` の仕様を実装してください。robots.txtでGPTBotを明示的にブロックしている2ドメインをsourced-facts許可リストから除外します。API・データモデル変更は不要です。

コンテキスト:
- 対象ファイル: `lib/llm/sourced-facts/allowlist.ts`、`tests/llm/sourced-facts.test.ts`
- `AGENTS.md`を読む

やること:
1. `lib/llm/sourced-facts/allowlist.ts`の`MEDIA_DOMAINS`から`"skysports.com"`・`"news.yahoo.co.jp"`を削除する
2. `tests/llm/sourced-facts.test.ts`の`rejects every removed domain`テスト(または同等のテスト)に、`"skysports.com"`・`"news.yahoo.co.jp"`を追加する
3. 既存フィクスチャで`skysports.com`・`news.yahoo.co.jp`を「許可ドメインの例」として使っている箇所があれば、残存ドメイン(`rugby-rp.com`・`onrugby.it`・`therugbypaper.co.uk`等)に置き換える

エッジケース:
- `premiershiprugby.com`・`englandrugby.com`・`allblacks.com`・`OFFICIAL_DOMAINS`の他の項目は変更しない

やらないこと:
- 他ドメインのrobots.txt再確認・追加除外
- `OFFICIAL_DOMAINS`の変更

完了の定義:
- specs の受け入れ条件 1〜4 を満たす
- `pnpm test` / `pnpm tsc --noEmit`(このリポジトリの該当コマンド)clean
- 変更ファイル一覧を報告する

完了時:
- 実装内容・変更ファイルを要約する
- 曖昧な箇所や仕様書と実環境の食い違いがあれば、その場で実装を停止して質問する
