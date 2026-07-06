# recap の勝敗記述をスコアと決定的に照合する（勝者整合性チェックのコード化）

> 関連: `specs/feat-entity-grounding-gate.md`（PR #467）／設計文書 `docs/design-content-grounding-architecture-2026-07-04.md`（「LLM は分類器、判定はプログラム」の原則）

## 背景

2026-07-04分の週次ノート作成中に発見: アルゼンチン vs スコットランド戦（match_id `42bebc1f-9225-452b-9786-9e0a1fbaa34a`、Nations Championship 2026）のrecap本文が自己矛盾している。DBスコアは home=Argentina 38, away=Scotland 47（スコットランド勝利）。しかし本文は冒頭で「38対47というスコア」（正しい順）と述べながら、結論部分では「アルゼンチンが...勝利を決定づけた」「最終的に47対38で試合を制した」と勝者を逆に記述している（数字の順序も反転）。`status='published'` で本番公開中。

QA プロンプト（`lib/llm/prompts/qa-content.ts` の `winnerCheckBlock`）には既に「スコアが高い方のチームが実際の勝者である。敗者チームが勝利したかのように書かれていれば factual_grounding を1にすること」という指示が入っている。しかしこれはQA判定モデルの holistic な採点に埋め込まれた**テキスト指示にすぎず、コード側で決定的に検証されていない**。今回のケースはこのQAゲートを通過して公開されており、指示だけでは検出漏れが起きることが実測された。

`docs/design-content-grounding-architecture-2026-07-04.md` は同種の問題（人名捏造）に対して「テキスト指示への依存は信頼ゼロの補助であり、単独では再発防止策と呼ばない。LLM には狭いスコープの抽出だけをさせ、正誤判定は常にコードが行う」という原則を確立し、`verify-entities` ゲート（PR #467）として実装済みである。本specは同じ原則をスコア×勝敗記述の整合性チェックに適用する。

## スコープ

対象:

- `lib/llm/prompts/qa-content.ts`: `winnerCheckBlock` を拡張し、QA応答スキーマに `statedWinner: "home" | "away" | "unclear"` を追加させる。本文の結論部分がどちらのチームを勝者として記述しているかを**分類させるだけ**にする（正誤判定はさせない）。`PROMPT_VERSION` をバンプする。
- `lib/content/fabrication-guard.ts`: 新issue定数 `WINNER_MISMATCH_ISSUE = "スコアと矛盾する勝敗記述を含む"` を追加(既存の `UNSUPPORTED_STATISTIC_ISSUE` 等3定数と並置)。
- `lib/llm/stages/qa.ts`:
  - `ParsedQaResponse` に `statedWinner?: unknown` を追加する。
  - 決定的な純関数 `computeActualWinner(homeScore: number | null, awayScore: number | null): "home" | "away" | "draw" | null` を新規追加してexportする(`homeScore`/`awayScore` のいずれかが `null` の場合は `null`、同点なら `"draw"`)。
  - `applyDeterministicQaGuards` に新しいガードを追加する: `options.contentType === "recap"` かつ `computeActualWinner(...)` が `"home"` または `"away"`(スコア確定・非引き分け)かつ QA応答の `statedWinner` が `"home"` または `"away"`(LLMが勝者を明言できた)かつ両者が食い違う場合、`issues` に `WINNER_MISMATCH_ISSUE` を追加し `factual_grounding` を1に落とす。`statedWinner` が `"unclear"` の場合は何もしない(既存の字数ガード等と同様、判定不能時はペナルティを課さない設計に合わせる)。
  - `isFactualGroundingHardBlock` の判定対象に `WINNER_MISMATCH_ISSUE` を追加する。
- 対応するテスト(`computeActualWinner` の単体テスト、`applyDeterministicQaGuards` への新規ガードのテスト、実インシデント本文を使った回帰テスト)。

対象外:

- 新規LLM呼び出しの追加。既存の `evaluateNarrativeQuality`(QAステージ、`lib/llm/pipeline.ts` の `runQualityGate` から呼ばれる唯一の呼び出し箇所)の応答スキーマに1フィールドを足すだけで、呼び出し回数・コストは変わらない。
- 引き分けの場合の判定(既存 `winnerCheckBlock` と同様、無視する)。
- 本文中の途中経過(ハーフタイムスコア等)の順序チェック。逆転劇のあるrecapでは前半と最終で自然に数字の順序が入れ替わり得るため、判定対象は「本文の結論部分が示す最終勝者」のみとする。
- 今回発見した該当1件(match_id `42bebc1f-9225-452b-9786-9e0a1fbaa34a`)の本番recapの再生成。別判断とし、Owner確認後に通常の再生成フロー(少件数試し焼き→検品→全件)に乗せる。
- 公開済みrecap全件の遡及監査バッチ(`tools/audit-entity-grounding.ts` 相当)の新設。ゲート導入後にOwnerが別途要否を判断する。

## データモデル変更

なし。

## LLM 連携

- 新規API呼び出しなし。既存の `evaluateNarrativeQuality`(QA stage、`MODELS.FAST` = gpt-4o-mini、`lib/llm/pipeline.ts` の `runQualityGate` 内で1回呼ばれる)の応答JSONスキーマに `statedWinner` フィールドを1つ追加するのみ。**コスト影響: ゼロ**。
- `lib/llm/prompts/qa-content.ts` の `PROMPT_VERSION` をバンプすること。

## 受け入れ条件

1. `computeActualWinner`: home > away → `"home"`、away > home → `"away"`、home === away → `"draw"`、いずれかが `null` → `null`(単体テスト)。
2. QA応答が `statedWinner: "home"` で実際の勝者が `computeActualWinner` で `"away"` のとき、`applyDeterministicQaGuards` 適用後の結果に `WINNER_MISMATCH_ISSUE` が含まれ、`factual_grounding` が1になる。
3. QA応答の `statedWinner` と実際の勝者が一致するとき、このガードは何も変更しない。
4. QA応答が `statedWinner: "unclear"` のとき、このガードは何も変更しない(false positive回避)。
5. `computeActualWinner` が `null` または `"draw"` を返すとき(スコア未確定・同点)、`statedWinner` の値に関わらずこのガードは何も変更しない。
6. 今回の実インシデント本文(match_id `42bebc1f-9225-452b-9786-9e0a1fbaa34a` のrecap本文、DBスコア Argentina(home) 38 - Scotland(away) 47)をフィクスチャ化し、QA応答 `statedWinner: "home"` を与えた場合に `WINNER_MISMATCH_ISSUE` が検出されることを回帰テストとして固定する。
7. `WINNER_MISMATCH_ISSUE` が `isFactualGroundingHardBlock` で `true` を返すことを確認する単体テスト。
8. `pnpm test`・`pnpm tsc --noEmit` が通る。

## 未解決の質問

- ゲート導入後、今回発見した1件(match_id `42bebc1f-9225-452b-9786-9e0a1fbaa34a`)を含む「ゲート導入前(2026-07-04以降に生成されたrecap)」の遡及監査を行うかどうかはOwner判断。行う場合は別specとして切り出し、「少件数試し焼き→検品→全件」の段階実行ルールに従うこと。
- `statedWinner` をQAモデルに安定して正しく分類させるための指示文の精度は、実データでの検証が実装後に必要。本specでは指示文の大枠のみ指定し、細部の文言はCodex裁量とする。
