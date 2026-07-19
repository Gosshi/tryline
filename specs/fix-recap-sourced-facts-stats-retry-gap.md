# recap用sourced facts検索で「非ゼロ件だが数値スタッツが0件」の場合も再試行する

## 背景

`fix-recap-sourced-facts-zero-result-retry.md`（2026-07-19、マージ済み）により、recap用sourced facts検索が**0件**だった場合は1回だけ再試行するようになった。しかし日本×フランス戦（2026-07-18、match_id: `b986f44f-4d3e-4642-a4b9-db8af6324722`）で実際に検証したところ、別の抜け漏れパターンが見つかった。

**確認済みの事実**（2026-07-20実測）:
- 同試合の `match_sourced_facts`（`content_type = 'recap'`）には2件が保存されている: 「エディー・ジョーンズHCの試合後コメント」「開始2分の反則→即トライ」（いずれも `news.yahoo.co.jp`、confidence: high）
- 2件とも**非ゼロ**のため、既存の「0件時のみ1回再試行」ロジック（`lib/llm/sourced-facts/fetch.ts` L320-322）は発動しなかった
- `buildSearchPrompt()` の recap向け検索意図（`lib/llm/sourced-facts/fetch.ts` L109-117）は「possession %, territory %, tackle counts, carries, metres gained, lineout/scrum success, turnovers, penalty counts」を明記しているにもかかわらず、実際に保存された2件はいずれも数値スタッツを含まない（コメントと1プレーの描写のみ）
- Owner が `rugbypass.com`（allowlist登録済み）の同試合スタッツページ（`https://www.rugbypass.com/live/france-vs-japan/stats/?g=949576`）を直接確認したところ、反則数（日本9・フランス10）、イエローカード（日本1・フランス2）、タックル成功率（日本82%・フランス90%）等が明確に掲載されていた。allowlist・検索意図とも対応済みのソースが、実際の検索では拾われていない
- 結論: 1回のWeb Search呼び出しで「試合後コメント」「プレー描写」「数値スタッツ」という性質の異なる情報を同時に狙っており、モデルが一部カテゴリ（特に数値スタッツ）を拾わずに打ち切るケースがある。「非ゼロだが特定カテゴリが欠落」は既存のゼロ件リトライでは救えない

## スコープ

対象:
- `fetchSourcedFactsForMatch()`（`lib/llm/sourced-facts/fetch.ts`）で、recap向け検索（`contentType === "recap"`）の結果に**数値スタッツ系の事実が1件も含まれない場合**、1回だけ追加で再検索を行う
- 数値スタッツの判定: 取得した`fact`文字列に数字と`%`、または「penalt」「tackle」「possession」「territory」「turnover」「lineout」「scrum」等の統計用語（英語で保存されるため）が含まれるかの軽量な判定でよい（正規表現ベース。LLM呼び出しでの判定は不要）
- 既存の「0件時に1回再試行」ロジックとは**独立した追加条件**として実装する（0件時と数値スタッツ0件時の両方をカバーするが、合計の再試行は最大1回に留める。2回とも条件を満たさなければ、無限リトライにしない）

対象外:
- 検索意図（`buildSearchPrompt`）の文言変更。既に数値スタッツを明記しており、今回の問題は「意図」ではなく「非決定的な検索結果のカバレッジ」
- 許可ドメインリストの追加。`rugbypass.com` は既に登録済みで、今回の問題はドメイン許可の欠落ではない
- この試合（日本×フランス 2026-07-18）の recap 再生成。恒久修正の適用範囲は今後の試合から。過去分の遡及は別途 Owner 判断
- preview向け検索への同様の対応。まずrecapのみ

## LLM 連携

- `createWebSearchJsonResponse` の呼び出しが、「非ゼロだが数値スタッツ0件」時に最大1回追加される
- **コスト影響**: 既存の「0件時リトライ」と条件が重ならない限り追加コストが発生する（0件だった場合は既存ロジックで既に1回再試行済みのため、本spec条件は「1件以上・数値スタッツ0件」の場合のみ発動）。試合単位でキャッシュされるため、ユーザー数増加によるコスト増加はない
- 既存の「0件時」と「数値スタッツ0件時」を合わせても、1試合のrecapあたり最大2回のWeb Search呼び出し（初回+リトライ1回）を超えないこと

## 受け入れ条件

1. `fetchSourcedFactsForMatch({ contentType: "recap" })` が1回目の検索で非ゼロ件を返したが、いずれの `fact` にも数値スタッツ系の内容が含まれない場合、`createWebSearchJsonResponse` が2回目呼ばれることを確認するテストがある（モックで1回目は数値スタッツを含まない事実のみ、2回目は数値スタッツを含む事実を返すケース）
2. 1回目の検索結果に数値スタッツ系の事実が1件でも含まれる場合は、再試行が発生しないことを確認するテストがある
3. 1回目が0件だった場合は、既存の`fix-recap-sourced-facts-zero-result-retry`のロジックがそのまま動作し、本spec追加分と合わせても合計のWeb Search呼び出しが2回を超えないことを確認するテストがある
4. `contentType === "preview"` の場合は本spec分のリトライが発生しない（従来通り）ことを確認するテストがある
5. `pnpm test` / `pnpm tsc --noEmit` / `pnpm lint` が通る

## 未解決の質問

- 数値スタッツ判定の正規表現・キーワードリストの具体的な網羅性はCodexの実装時の裁量に委ねるが、実装後に本specの受け入れ条件1のテストケースで実際に拾えることを確認すること
- 過去に生成済みで数値スタッツが欠落しているrecap（この試合含む）への遡及対応（バッチ再生成）は本specのスコープ外。必要であれば別途 Owner が判断し spec化する
