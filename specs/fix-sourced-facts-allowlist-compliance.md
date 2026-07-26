# fix-sourced-facts-allowlist-compliance: sourced-facts許可ドメインの規約コンプライアンス対応

対象リポジトリ: **tryline**のみ。API・データモデル変更は不要(既存の`match_sourced_facts`テーブル構造はそのまま)。

## 背景

2026-07-26、モバイルの新機能検討をきっかけに、`lib/llm/sourced-facts/allowlist.ts`の許可ドメイン25件(`OFFICIAL_DOMAINS` 13件+`MEDIA_DOMAINS` 12件)について利用規約を監査した。この機構は、試合のプレビュー/レビュー生成時にOpenAIのWeb検索ツールでLLMが事実を収集し、このリストで引用元ドメインをフィルタするもの(Trylineの自前スクレイパーは使っていない)。**既に本番稼働中**。

監査の結果、以下が判明した:

- **9ドメイン(10文字列)が利用規約で「scraping」「data mining」「AIシステムの訓練・開発目的での利用」等を明示的に禁止**していた: `world.rugby`・`rugbyworldcup.com`・`sixnationsrugby.com`・`rugbypass.com`・`planetrugby.com`・`bbc.com`・`bbc.co.uk`・`espn.com`・`nbcsports.com`・`sports.yahoo.com`。特に`rugbypass.com`は本番の`match_sourced_facts`全143件中47件(33%)を占める最大の情報源で、規約は「AIシステム、機械学習機能・アルゴリズムの訓練・開発目的」での利用を名指しで禁止している
- **`rugbychampionship.com`はドメインが失効し、ドメイン販売サイトへリダイレクトされている**(実運用サイトが存在しない)
- 代替候補として`therugbypaper.co.uk`(The Rugby Paper)を調査した。規約上の明示的な禁止条項は見当たらず、Six Nations・Premiership・URC・Top14・Super Rugby Pacific・RWCの6大会すべてをカバーし、移籍・戦術分析・選手コメントも充実している

Owner方針: 「使えるものは使う。ダメなものは除く」。明示的に規約違反が確認できたドメインのみ除外し、規約が未確認・または制限が緩い(明示的なscraping/AI禁止条項がない)ドメインはそのまま維持する。

**除去による生成パイプラインへの影響**: `lib/llm/prompts/generate-preview.ts`は`sourced_facts`が0件の場合の専用フォールバック(外部由来の統計・負傷・コメントを一切使わず、DB内のイベント・スコア・順位表・ラインアップのみで記事を構成する指示)を既に持っている。除外によって生成が失敗することはない。本番データでは、除外対象ドメインの事実に完全依存している試合が9件あり、それらの記事は今後より保守的な内容になる。

## スコープ

対象:
1. `lib/llm/sourced-facts/allowlist.ts`から以下を削除する:
   - `OFFICIAL_DOMAINS`: `"world.rugby"`, `"rugbyworldcup.com"`, `"sixnationsrugby.com"`, `"rugbychampionship.com"`(失効ドメイン)
   - `MEDIA_DOMAINS`: `"rugbypass.com"`, `"planetrugby.com"`, `"bbc.com"`, `"bbc.co.uk"`, `"espn.com"`, `"nbcsports.com"`, `"sports.yahoo.com"`
2. `MEDIA_DOMAINS`に`"therugbypaper.co.uk"`を追加する
3. `tests/llm/sourced-facts.test.ts`内で、削除対象ドメイン(特に`rugbypass.com`)を「許可ドメインの例」として使っているフィクスチャ・アサーションを、削除後も残るドメイン(例: `skysports.com`、`league-one.jp`)または新規追加した`therugbypaper.co.uk`に置き換える
4. 削除対象ドメインについては、「許可されなくなったこと」を確認するネガティブテストを追加する(例: `isAllowedSourcedFactDomain("rugbypass.com")`が`false`を返す)

対象外:
- 今回「未確認」「制限が緩い」と判定されたドメイン(`premiershiprugby.com`・`unitedrugby.com`・`lnr.fr`・`super.rugby`・`league-one.jp`・`rugby-japan.jp`・`rugby.com.au`・`allblacks.com`・`englandrugby.com`・`skysports.com`・`news.yahoo.co.jp`・`rugbyasia247.com`・`rugby-rp.com`・`onrugby.it`)は今回変更しない
- 既に`match_sourced_facts`テーブルに保存済みの、削除対象ドメイン由来の行のデータ削除(遡及的なクリーンアップは別途Owner判断。今回は今後の新規事実取得のフィルタのみを変更する)
- 既に公開済みの`match_content`(プレビュー/レビュー記事本文)の再生成(該当試合の再生成要否は別途Owner判断)

## データモデル変更 / API サーフェス / LLM 連携

- `lib/llm/sourced-facts/allowlist.ts`の`OFFICIAL_DOMAINS`・`MEDIA_DOMAINS`定数配列の変更のみ。プロンプト自体(`lib/llm/sourced-facts/fetch.ts`の`buildSearchPrompt`)は変更しない

## 受け入れ条件

1. `SOURCED_FACT_ALLOWED_DOMAINS`に削除対象10文字列(`world.rugby`・`rugbyworldcup.com`・`sixnationsrugby.com`・`rugbychampionship.com`・`rugbypass.com`・`planetrugby.com`・`bbc.com`・`bbc.co.uk`・`espn.com`・`nbcsports.com`・`sports.yahoo.com`、計11件)が含まれないことを確認するテスト
2. `isAllowedSourcedFactDomain`が上記削除対象ドメインに対して`false`を返すことを確認するテスト
3. `isAllowedSourcedFactDomain("therugbypaper.co.uk")`が`true`を返すことを確認するテスト
4. 既存の`tests/llm/sourced-facts.test.ts`内のフィクスチャが削除対象ドメインに依存しなくなっており、全テストがpassすること
5. TypeScript strict・test green

## 未解決の質問

- 既に`match_sourced_facts`に保存済みの、削除対象ドメイン由来の行(本番で75件)を削除するかどうかはOwner判断が必要。今回のspecでは「今後の新規取得のみフィルタする」対応に留める
- 削除対象ドメインの事実に全面依存していた9試合について、既存の`match_content`(公開済み記事)を再生成するかどうかもOwner判断が必要。再生成する場合は、少件数での試し焼きを必須とする運用ルール(過去の全件draft化事故の教訓)に従う
