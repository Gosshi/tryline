# recap生成プロンプトの「プレーオフ」固定文言がリーグ戦にも混入するバグ修正

## 背景

2026年ネーションズチャンピオンシップ 7月シリーズ第2節（2026-07-11、6試合）のrecapが、全試合「プレーオフ」「一発勝負」という誤った大会フェーズで生成され本番公開された（実際は7月シリーズ3節中の1節で、ノックアウトステージではない）。

実証（2026-07-13）:
- 対象6試合はいずれも `matches.external_ids.wikipedia_round = 2`（数値）を持つ
- `lib/llm/stages/assemble.ts` の `deriveMatchPhase()`（L302-341）は `wikipedia_round` が数値の場合、無条件で `match_phase = "league"` を返す（L317-319）。**このロジック自体は正しく動作しており、実際に `match_phase` は正しく `"league"` と判定されている**
- `lib/llm/prompts/generate-recap.ts` の `matchPhaseBlock`（L219-261）は `phase` が `playoff_*` の場合のみプレーオフ文言を注入し、`"league"` の場合は空文字列を返す。**ここも正しく動作している**
- 根本原因は別の場所: `buildGenerateRecapPrompt` 内、`hasEvents && !hasLineups` の場合に選択される構造分岐（L81-114、confirmed lineupsが無い試合で使われる）の中に、`match_phase` を一切参照しない**ハードコードされた指示文**が存在する:
  ```
  L94: "- プレーオフという文脈と一発勝負の重み（80字程度）",
  ```
  この行は「試合全体像」セクションの必須要素として、`match_phase` の値に関わらず**常に**LLMへ「プレーオフとしての意味・一発勝負の重みを書け」と指示している。そのため `matchPhaseBlock` が正しく空文字列を返していても、L94 の指示によってLLMはリーグ戦であってもプレーオフとして描写してしまう。
- このバグはネーションズチャンピオンシップに限らない。`hasEvents && !hasLineups` 分岐を通る**すべての大会・すべての過去のrecap**が対象になり得る（今回はNC6試合で実証したのみで、他大会・過去分の影響範囲は未調査）。

## スコープ

対象:
- `lib/llm/prompts/generate-recap.ts` の `hasEvents && !hasLineups` 分岐（L81-114）にある固定文言を `match_phase` 連動にする
- 該当6試合recap（下記データモデル変更セクションのID一覧）の、修正後プロンプトでの再生成

対象外:
- `generate-preview.ts` 側の同種チェック（該当分岐・文言が存在するか未確認。存在する場合は別issueとして扱う。今回のspecでは調査のみ行い、修正はrecapのみ）
- 過去の全recapを対象にした一括監査・再生成（今回はNC 7月シリーズ第2節6試合に限定。範囲拡大はOwner判断で別途）
- `hasLineups` 分岐（L41-60）・`isDataSparse` 分岐（L61-80）の文言見直し（この2分岐には該当のハードコード文言は存在しない。念のためCodexは実装時に目視確認すること）

## データモデル変更

なし（`matches.external_ids.wikipedia_round` は既存カラム、`match_phase` 導出ロジックも既存で変更不要）。

対象試合（再生成対象、`content_type='recap'`）:
| match_id | カード |
|---|---|
| `d9f72ea3-17da-4eac-b20d-c6bfe0f185b4` | 日本 vs アイルランド |
| `2c0bc0ed-f0ea-4d87-8c3e-28b387f39471` | ニュージーランド vs イタリア |
| `1acc900f-d1aa-4b94-90f2-0aa7c8fe93ea` | オーストラリア vs フランス |
| `8f6999d0-7827-4856-95c1-ac63d063b7b4` | フィジー vs イングランド |
| `d0cdae80-059a-4ec1-9675-3f26fe859a0d` | 南アフリカ vs スコットランド |
| `4d78d26e-08af-4536-89e6-ff89f6bdf882` | アルゼンチン vs ウェールズ |

## API サーフェス

なし（内部LLMプロンプト生成ロジックのみ）。

## UI サーフェス

間接的: 上記6試合のrecap本文から「プレーオフ」「一発勝負」表現が消え、大会名・シーズン・（可能であれば）ラウンド番号を用いた中立的な文脈に置き換わる。他大会・他フェーズのプレーオフ試合（playoff_final等）の文面は`matchPhaseBlock`が引き続き担当するため変更なし・リグレッションなし。

## LLM 連携

パイプライン段階: generate-recap（`hasEvents && !hasLineups` 分岐のプロンプト文言）。

修正方針:
1. `lib/llm/prompts/generate-recap.ts` L94 の固定行を削除し、`match_phase` を参照する条件分岐に差し替える。既存の `matchPhaseBlock`（L219-261）は独立したブロックとして別途プロンプトに追加される設計なので、L94相当の一文は「試合全体像セクション内で何を書くか」の指示に留め、以下のいずれかで実装する:
   - (a) `assembled.match_phase` が `playoff_*` のいずれかなら「プレーオフという文脈と一発勝負の重み（80字程度）」を使い、`"league"` または `null` なら「大会内での位置づけ（大会名・シーズン・順位表への影響、分かる場合はラウンド名）（80字程度）」に差し替える、という関数化（例: `buildMatchContextBullet(phase: MatchPhase | null): string`）
   - (b) この一文自体を削除し、既存の `matchPhaseBlock` が担うプレーオフ文脈と重複させない（`matchPhaseBlock` は既に「試合全体像の冒頭に含めること」と明記しているため、L94を削除しても情報は失われない可能性がある。Codexは実装前にどちらが適切か確認すること）
   - 推奨は (a)。理由: `isDataSparse` 分岐（L61-80）には同種の「大会文脈と順位への影響」セクションが既に存在し、`hasEvents && !hasLineups` 分岐だけがこの情報を欠いた状態になることを避けるため。
2. `generate-preview.ts` に同種のハードコード文言が存在しないか確認する（`matchPhaseBlock` 相当の実装が L30・L172 にあるため、同じ設計ミスが混入していないか目視チェックのみ行う。存在した場合は本specのスコープ外として別途報告し、実装はしない）。
3. モデル・コストへの影響なし（プロンプト文言の書き換えのみ。呼び出し回数・モデルは変更しない。ナラティブ生成は既存通り `gpt-4o` を使用、`lib/llm/models.ts` の集中管理に変更なし）。

再生成コスト見積もり:
- 対象6件 × recap 1本（`gpt-4o`、既存の平均トークン数と同等と想定）。既存のrecap生成1件あたりコストを踏襲するため、単価は`lib/llm/pricing.ts`を参照し6件分をOwnerに事前提示してから実行する。
- **試し焼き必須**: 先に1〜2件（例: 日本vsアイルランド、NZ vsイタリア）を再生成し、本文に「プレーオフ」「一発勝負」が消えていること・字数下限（2,000字以上）を満たすことを確認してから残り4〜5件を実行する。

## 受け入れ条件

1. `tests/llm/prompts/generate-recap.test.ts` に新規テストケースを追加:
   - `match_phase: "league"` かつ `hasEvents: true` かつ `projected_lineups` 未確定（既存フィクスチャの `hasLineups=false` 相当）の入力で `buildGenerateRecapPrompt()` を呼んだ結果に、文字列 `"プレーオフ"` `"一発勝負"` が含まれない
   - `match_phase: "playoff_other"` の既存ケース（L431/L446周辺の既存テストパターンに準拠）では、引き続き `matchPhaseBlock` 経由でプレーオフ文脈が出力に含まれる（リグレッションなし）
2. `match_phase: null` の場合も同様に `"プレーオフ"` `"一発勝負"` が含まれないこと
3. 対象6試合すべての再生成後、本文（`match_content.content_md`）に文字列 `"プレーオフ"` `"一発勝負"` が含まれないことをSQLまたはスクリプトで確認する
4. 再生成後もentity-groundingゲート・QAゲートを通過し `status='published'` を維持していること（`status`が`draft`に落ちていないか件数を実行前後で比較）
5. `pnpm test` ・ `pnpm tsc --noEmit` green

## 未解決の質問（Codex 着手前に確認）

1. L94差し替えの実装方針は (a)（match_phase連動の文言差し替え）と (b)（単純削除）のどちらにするか、Owner確認を推奨（本specでは(a)を推奨として記載）
2. `generate-preview.ts` に同種のハードコード文言がないかの調査結果を先に報告し、あれば別specとして切り出すか本specに統合するかをOwnerが判断する
3. 6試合の再生成タイミング: 本修正のPRマージ・デプロイ後にOwnerが`content-regen`スキルの手順（試し焼き→検品→残り全件）で実行する。Codexの実装スコープにはコード修正のみを含み、再生成の実行自体はOwner/Claude Codeが別途行う
