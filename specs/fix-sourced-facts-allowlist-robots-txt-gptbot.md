# fix-sourced-facts-allowlist-robots-txt-gptbot: robots.txtでGPTBotを明示ブロックしているドメインの除外

対象リポジトリ: **tryline**のみ。`fix-sourced-facts-allowlist-compliance`(PR #643、マージ済み)の後続。API・データモデル変更は不要。

## 背景

`fix-sourced-facts-allowlist-compliance`で利用規約(ToS)ベースの監査を行い9ドメインを除外したが、その後Owner から「news.yahoo.co.jpはrobots.txt経由なら使えるのでは」という指摘があり、実際のrobots.txtを確認した。

その結果、ToSの文言解釈より遥かに明確な事実が判明した: **`news.yahoo.co.jp`と`skysports.com`は、robots.txtで`GPTBot`(OpenAIのクローラー)を`Disallow: /`(サイト全体)で明示的にブロックしている**。Trylineの事実収集はOpenAIのWeb検索ツールを使っているため、これは規約文の解釈問題ではなく、対象サイトが「OpenAIには来てほしくない」と機械可読な形で明示している状態であり、除外すべきである。

同時に確認した`premiershiprugby.com`・`englandrugby.com`・`allblacks.com`(いずれも前回「未確認」のまま残した`OFFICIAL_DOMAINS`)は、robots.txtにAIクローラーへの個別制限がなく、一般クローラーも広く許可されていた。この3件は今回は変更しない。

`skysports.com`は本番の`match_sourced_facts`で除外済みドメインの次に多い情報源(36件/143件中)だった。除外により、今後の事実取得はさらに絞られる。

## スコープ

対象:
- `lib/llm/sourced-facts/allowlist.ts`の`MEDIA_DOMAINS`から`"skysports.com"`・`"news.yahoo.co.jp"`を削除する

対象外:
- `premiershiprugby.com`・`englandrugby.com`・`allblacks.com`(robots.txtでAIクローラー制限なし、今回は維持)
- `unitedrugby.com`・`lnr.fr`・`super.rugby`・`league-one.jp`・`rugby-japan.jp`・`rugby.com.au`・`rugbyasia247.com`・`rugby-rp.com`・`onrugby.it`・`therugbypaper.co.uk`(前回specの対象外のまま、今回も未変更)
- 他ドメインのrobots.txt/GPTBotブロックの網羅的な再確認(今回はOwnerが指摘した2件のみ)

## データモデル変更 / API サーフェス / LLM 連携

- `lib/llm/sourced-facts/allowlist.ts`の`MEDIA_DOMAINS`定数配列の変更のみ

## 受け入れ条件

1. `SOURCED_FACT_ALLOWED_DOMAINS`に`"skysports.com"`・`"news.yahoo.co.jp"`が含まれないことを確認するテスト
2. `isAllowedSourcedFactDomain("skysports.com")`・`isAllowedSourcedFactDomain("news.yahoo.co.jp")`が`false`を返すことを確認するテスト(既存の`tests/llm/sourced-facts.test.ts`の`rejects every removed domain`テストに追加する)
3. 既存の`tests/llm/sourced-facts.test.ts`内で`skysports.com`・`news.yahoo.co.jp`を「許可ドメインの例」として使っているフィクスチャがあれば、他の残存ドメイン(`rugby-rp.com`・`onrugby.it`・`therugbypaper.co.uk`等)に置き換える
4. TypeScript strict・test green

## 未解決の質問

なし。
