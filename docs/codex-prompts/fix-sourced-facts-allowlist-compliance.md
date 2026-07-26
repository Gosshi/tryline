# Codex プロンプト: fix-sourced-facts-allowlist-compliance

**tryline リポジトリ**で貼る(仕様書: `specs/fix-sourced-facts-allowlist-compliance.md`)。

---

`specs/fix-sourced-facts-allowlist-compliance.md` の仕様を実装してください。sourced-facts機構(プレビュー/レビュー生成時の事実引用元フィルタ)の許可ドメインリストから、利用規約で明示的にscraping/AI利用を禁止しているドメインを除外し、失効ドメインも削除、新規ドメインを1件追加します。API・データモデル変更は不要です。

コンテキスト:
- 対象ファイル: `lib/llm/sourced-facts/allowlist.ts`、`tests/llm/sourced-facts.test.ts`
- `AGENTS.md`を読む

やること:
1. `lib/llm/sourced-facts/allowlist.ts`の`OFFICIAL_DOMAINS`から`"world.rugby"`・`"rugbyworldcup.com"`・`"sixnationsrugby.com"`・`"rugbychampionship.com"`を削除する
2. `MEDIA_DOMAINS`から`"rugbypass.com"`・`"planetrugby.com"`・`"bbc.com"`・`"bbc.co.uk"`・`"espn.com"`・`"nbcsports.com"`・`"sports.yahoo.com"`を削除する
3. `MEDIA_DOMAINS`に`"therugbypaper.co.uk"`を追加する
4. `tests/llm/sourced-facts.test.ts`を見直し、削除対象ドメイン(特に`rugbypass.com`が多数のフィクスチャで「許可ドメインの例」として使われている)を、削除後も残るドメイン(`skysports.com`・`league-one.jp`等)または`therugbypaper.co.uk`に置き換える
5. 削除対象ドメインが許可されなくなったことを確認するネガティブテストを追加する

エッジケース:
- `SOURCED_FACT_ALLOWED_DOMAINS`は`OFFICIAL_DOMAINS`と`MEDIA_DOMAINS`を結合した`export const`。両方の配列を正しく編集すれば自動的に反映される
- `tests/llm/sourced-facts.test.ts`は`rugbypass.com`を汎用フィクスチャとして15箇所前後で使っている可能性がある。全て洗い出して置き換えること(一部だけ直して残りが壊れたままにならないように)

やらないこと:
- 今回「未確認」「制限が緩い」と判定された残り14ドメインの変更(仕様書「対象外」参照)
- `match_sourced_facts`テーブルの既存データ削除(Owner判断、スコープ外)
- 既存の公開済みコンテンツの再生成(Owner判断、スコープ外)
- `lib/llm/sourced-facts/fetch.ts`のプロンプト自体の変更

完了の定義:
- specs の受け入れ条件 1〜5 を満たす
- `pnpm test` / `pnpm tsc --noEmit`(このリポジトリの該当コマンド)clean
- 変更ファイル一覧を報告する

完了時:
- 実装内容・変更ファイルを要約する
- 曖昧な箇所や仕様書と実環境の食い違いがあれば、その場で実装を停止して質問する
