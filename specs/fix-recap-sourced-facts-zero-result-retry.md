# recap用sourced facts検索が0件だった場合に1回だけ再試行する

## 背景

Owner から「日本×フランス戦recapに、試合後の反則・ハイボール処理に関するHCコメントが反映されていない」との指摘(2026-07-19)。調査の結果、これは機能が無いのではなく、**既存のrecap用sourced facts検索インフラが今回たまたま0件を返した**ことが原因と判明した。

**確認済みの事実**:
- `lib/llm/prompts/fetch.ts` の `buildSearchPrompt()` は、recap向けに既に「反則数」「HC/主将の試合後コメント」「カード」「負傷」等を検索意図に含めている(`feat-sourced-facts-match-incidents.md` で実装済み、`git log` で確認)
- `news.yahoo.co.jp` を含む海外メディアも許可リストに含まれている(`lib/llm/sourced-facts/allowlist.ts`)
- 実際、Claude CodeがWebSearchツールで同じ試合を検索したところ、ジョーンズHCの「モール、空中戦で大きなギャップがある」というコメントを含む記事(news.yahoo.co.jp)が容易に見つかった。つまり**情報自体は存在し、許可ドメインにも該当する**が、自動パイプラインの1回の検索では拾えなかった
- 本番の直近15件のpublished recapを調査したところ、**6件(40%)がrecap用sourced_facts 0件**、残りは2〜12件とばらつきが大きい。検索意図・許可ドメインは十分でも、LLMのWeb検索1回の結果は非決定的で、記事の見つかりやすさに左右されている

## スコープ

対象:
- `fetchSourcedFactsForMatch()`(`lib/llm/sourced-facts/fetch.ts`)で、recap向け検索(`contentType === "recap"`)の結果が0件だった場合に限り、**1回だけ**同じプロンプトで再検索を行う(検索クエリ自体は変更しなくてよい。単純な再試行で十分。LLMの応答は非決定的なため、同じプロンプトでも2回目に見つかることがある)
- 2回試しても0件の場合は、従来通り0件のまま(fabricationにはならない。sourced_factsが無くても既存のプロンプト制約により「データに無い統計は創作しない」という前提は維持される)

対象外:
- 検索意図(`buildSearchPrompt`)の追加変更。既に十分な範囲をカバーしている
- 許可ドメインリストの追加。現状で対象記事は取得できることを確認済み
- preview向け検索(`contentType === "preview"`)への同様のリトライ追加。まずrecapのみで様子を見る

## LLM 連携

`createWebSearchJsonResponse` の呼び出しが、0件時に最大1回追加される。**コスト影響**: 現状ばらつきはあるが直近15件中6件(40%)が0件だったため、再試行が発生する頻度もおおむねそれに近いと見込まれる。1回あたりのコストは既存の検索呼び出しと同額(`MODELS.WEB_SEARCH`)。試合単位でキャッシュされるため、ユーザー数増加によるコスト増加はない(既存の設計不変条件と同じ)。

## 受け入れ条件

1. `fetchSourcedFactsForMatch({ contentType: "recap" })` が1回目の検索で0件を返した場合、`createWebSearchJsonResponse` が2回目呼ばれることを確認するテストがある(モックで1回目は空配列、2回目は非空を返すケース)
2. 2回目も0件だった場合は、例外を投げずに空配列の結果を返すことを確認するテストがある(3回目は呼ばれない)
3. `contentType === "preview"` の場合はリトライされない(従来通り1回のみ)ことを確認するテストがある
4. `pnpm test` / `pnpm tsc --noEmit` / `pnpm lint` が通る

## 未解決の質問

- なし
