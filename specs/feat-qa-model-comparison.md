# 品質チェックのモデルを、既存の記事で比べる

## 背景

`specs/migrate-llm-models-gpt6.md` の段階 B（2026-11-16、recap 4 試合）では、抽出・QA・固有名詞照合を `gpt-6-luna` にした設定（`fast6`）で、作り直しが平均 1.5 回に増えた。その結果、総費用は 2.5 倍、時間は 2.8 倍になった。

これが「厳しすぎる」のか、「今の QA（`gpt-5.6-luna`）が見逃している誤りを止めている」のかが分からない。

- 確認できた 1 件（イングランド対日本、`fast6` で却下）は、**本物の誤りだった**。本文に「前半終了までに……45分のトライで12点を追加」「前半を終えるまでの得点差は32点から44点へ」とあるが、45 分は後半で、前半終了時は 47-10（37 点差）。`gpt-6-luna` は factual_grounding 2 で却下し、同じ本文を今の QA は 3 で公開と判定した
- ほかの作り直し 4 回は、却下された版の本文と QA の指摘が保存されないため、正しかったか確かめられない

記事を新しく作らず、**同じ本文を 2 つのモデルの品質チェックで採点し、判定が分かれたものだけを人（Claude Code）が根拠と照合する**。これで、どちらの判定が正しいかを数えられる。

## スコープ

対象:
- 品質チェックだけを走らせる比較スクリプト `scripts/compare-qa-models.ts`（新規）
- そのために、`generateMatchContent` の中にある品質チェック（`runQualityGate`、`lib/llm/pipeline.ts:420-504`）を、**挙動を変えずに**関数として外へ出す

対象外:
- `MODELS` の値、プロンプト、QA の基準値、再試行の回数
- 記事の生成・作り直し（このスクリプトは本文を作らない）
- DB への書き込み、通知、IndexNow、キャッシュの再検証

## データモデル変更

なし（読み取りだけ）。

## API サーフェス

### 1. 品質チェックを外へ出す（`lib/llm/pipeline.ts`）

`runQualityGate` は今、`generateMatchContent` の中の関数で、`usable`・`allowedEntities`・`knownNonPersonNames`・`hasEvents`・`hasLineups`・`hasSourcedFactLineup`・`entityViolationFeedback` を外側から参照している。これを、引数でそれらを受け取るモジュール直下の関数にする。

```ts
export async function runQualityGateForNarrative(input: {
  usable: ReturnType<typeof buildUsableContentInput>;
  contentType: ContentType;
  language: ContentLanguage;
  narrative: string;
  retryCount: number;
  qaModel?: string;                     // 省略時は MODELS.FAST
  entityModel?: string;                 // 省略時は MODELS.FAST
  verifyEntities?: boolean;             // 既定 true
  entityViolationFeedback?: string[];   // 既定 []
}): Promise<{ entityVerification: ...; qaResponse: ... }>
```

- 中身は今の `runQualityGate`（`:426-503`）をそのまま移す。`entityViolationFeedback` は今 `let`（`:415`）で、作り直しのたびに更新される。呼び出し時点の値を引数で渡せば、今と同じ値が使われる。`hasEvents` などの派生値は、今の `:346-352` と同じ式で `usable` から関数の中で作る
- `generateMatchContent` は、今の `runQualityGate(...)` の呼び出しを、この関数の呼び出しに置き換える。`qaModel` には今の `gateOptions.qaModel ?? options.models?.fast`、`entityModel` には `options.models?.fast` を渡す。**それ以外の挙動を変えない**
- 戻り値の型は今と同じ

さらに、試合 ID から QA に渡す材料を作る関数を足す:

```ts
export async function loadQualityGateInput(matchId: string, contentType: ContentType, language: ContentLanguage): Promise<{ usable: ReturnType<typeof buildUsableContentInput> } | { skipReason: string }>
```

`generateMatchContent` の `:258-345` と同じ判定の順（撤退済みの大会 → `assembleMatchContentInput` → 得点の食い違い `score_mismatch` → recap の `events_unavailable` → `buildUsableContentInput`）で作り、スキップになる場合は理由（`competition_retired`・`score_mismatch`・`events_unavailable`）を返す。**ただし、`generateMatchContent` がこの間に行っている副作用（`:265` 付近の段階 1 の `logPipelineRun`、`score_mismatch` のときの通知）は、この関数では行わない。** `generateMatchContent` 側は今のまま変えない（この関数に置き換えない）。

### 2. 比較スクリプト（`scripts/compare-qa-models.ts`）

```
node --env-file=.env.production.local tools/run-ts.cjs scripts/compare-qa-models.ts \
  --content-type recap --since-days 21 --published 30 --draft 10 \
  [--file <matchId>:<path>] ... \
  [--baseline gpt-5.6-luna] [--candidate gpt-6-luna] \
  [--max-usd 0.5] [--dry-run]
```

**対象の記事**
- `match_content` から `language = 'ja'` で、`--content-type` の行を `generated_at` の新しい順に選ぶ。`status = 'published'` を `--published` 件、`status = 'draft'` を `--draft` 件。`generated_at` は `--since-days` 日以内
- `--file <matchId>:<path>` は、ローカルの Markdown を本文として足す（段階 B で作られた試験の本文を使うため）。ファイル先頭に `# <id> — <config>` から `Retries:` までの試験用の見出しがあれば取り除き、最初の `# ` 見出し（例: `# この試合の核心`）以降を本文とする。`--file` は何回でも指定できる。`content_type` は `--content-type` の値を使う
- `loadQualityGateInput` がスキップを返した記事は、理由を `summary.md` に書いて飛ばす

**採点**
- 各記事について、`runQualityGateForNarrative` を `retryCount: 0`・`verifyEntities: true` で **2 回**呼ぶ。1 回目は `qaModel`・`entityModel` とも `--baseline`、2 回目はとも `--candidate`。本番で `FAST` を替えると、QA と固有名詞照合の両方が替わるため
- `usable` は記事ごとに 1 回だけ作り、2 回の採点で同じものを使う
- 1 回の採点が例外になっても止めず、その記事のその側を `error` として記録して次へ進む

**費用の上限**
- 実行前に「記事数 × 2 × 1 記事あたりの見積もり × 2（QA 内部の再試行の余裕）」で見積もる。1 記事あたりの見積もりは定数 `0.004`（段階 B の実測で、QA と固有名詞照合の合計が $0.0040〈5.6-luna〉／$0.0020〈6-luna〉。高い方を使う）
- 見積もりが `--max-usd`（既定 `0.5`）を超えたら、LLM を呼ばずに止める。`--dry-run` は見積もりと対象の一覧だけ出し、LLM を呼ばない
- 実際の費用は `calculateCostUsd` で計算し、`summary.md` に合計を出す

**出力（`tmp/qa-compare/<日時>/`）**
- `summary.md`
  - 冒頭: 対象件数、スキップ件数と理由、実費の合計、判定の 2×2 表（baseline 公開/却下 × candidate 公開/却下）
  - **判定が分かれた記事**の表を先に、一致した記事の表を後に。列: matchId、試合名（ホーム対アウェイの日本語名）、元の `status`（または `file`）、baseline の判定と 4 スコア、candidate の判定と 4 スコア、factual_grounding の差
- `<matchId>-<rowId または file>.md`（**判定が分かれた記事と、factual_grounding が 2 以上違う記事**だけ）
  - 本文の全文
  - baseline・candidate それぞれの: 判定、4 スコア、LLM が返した `issues` の全文、コード側のガードで足された issue（`getDeterministicQaGuardIssues` の結果）、固有名詞照合の `ungroundedSurfaces`
  - 試合の確定スコアと、`usable.score_timeline`（得点経過）。人が照合するため

**書き込まない**
- `match_content`・`pipeline_runs`・その他のテーブルに書き込まない。`logPipelineRun` を呼ばない。通知・IndexNow・再検証を呼ばない

## UI サーフェス

なし。

## LLM 連携

- 段階 4（品質チェック）と固有名詞照合だけを、既存の本文に対して走らせる。本文の生成はしない
- 見積もり: 40 記事 × 2 モデル × $0.004 × 2 ≒ **$0.64 が上限側**。実際には 6-luna 側が約半額なので、実費は $0.25 前後の見込み。既定の `--max-usd 0.5` で 40 記事が通るよう、上の定数で見積もって超えるなら `--published`・`--draft` を減らす
- 実行は Owner の承認のうえ、Claude Code が行う

## 判定の付け方（実行後、Claude Code が行う）

判定が分かれた記事を 1 本ずつ、`usable` の得点経過・試合の事実・出典付きの事実と照合し、次のどれかに分類する。結果は `docs/` に日付付きで残す。

| 分類 | 意味 |
|---|---|
| candidate が正しく止めた | 本文に根拠と食い違う記述がある。baseline は見逃した |
| candidate が厳しすぎた | 本文に誤りは見つからない。candidate の指摘が根拠と合わない |
| baseline が正しく止めた／baseline が厳しすぎた | 上の逆 |
| 判断できない | 根拠のデータが足りない |

段階 C（`FAST` を替えるか）の判断材料にする。「正しく止めた」が「厳しすぎた」を上回るなら、作り直しの増加は誤りを止めた代金と見なせる。

## 受け入れ条件

1. `runQualityGateForNarrative` を外へ出した後も、`generateMatchContent` の既存テスト（`tests/llm/` 配下）が**期待値を変えずに**通る
2. `generateMatchContent` から呼ぶとき、QA と固有名詞照合に渡るモデルが今と同じになる。`models.fast` を渡したときは両方がその値になり、`comparisonQaModel` を渡したときは比較採点の QA だけがその値になる（`createTextResponse` のモックで `model` を確認）
3. 比較スクリプトが、1 記事につき baseline と candidate で 1 回ずつ採点する。QA と固有名詞照合の両方が、それぞれのモデルで呼ばれる（モックで `model` を確認）
4. `usable` は記事ごとに 1 回だけ作られる（`assembleMatchContentInput` の呼び出し回数で確認）
5. 片方の採点が例外になっても、残りの記事の採点が続き、`summary.md` にその記事が `error` として出る
6. `--file` の Markdown から、試験用の見出しを取り除いた本文が採点に渡る（`trial-content-models.ts` が出力する形式の fixture で確認）
7. 見積もりが `--max-usd` を超えると、LLM も `assembleMatchContentInput` も呼ばずに止まる。`--dry-run` も LLM を呼ばない
8. どの経路でも、DB の `insert`・`update`・`upsert`・`delete`、`logPipelineRun`、通知、IndexNow、再検証が呼ばれない
9. `summary.md` に 2×2 表と、判定が分かれた記事の表が出る。判定が分かれた記事と factual_grounding が 2 以上違う記事についてだけ、個別ファイルが出る。個別ファイルには、両方の `issues` の全文と得点経過が含まれる
10. **壊して落ちる確認**: (a) candidate 側の採点に baseline のモデルを渡す、(b) 個別ファイルの出力条件を「判定が分かれた記事」だけにする（factual_grounding の差の条件を外す）、の 2 つで、それぞれ条件 3・9 のテストが落ちることを一時的に壊して確認し、PR 本文に書く（コミットしない）
11. `pnpm tsc --noEmit`・`pnpm lint`・`pnpm test`・`pnpm build` が通り、CI が緑

## 競合とマージ順

- 触るファイル: `lib/llm/pipeline.ts`（関数の切り出し）、新規 `scripts/compare-qa-models.ts` とテスト
- `lib/llm/pipeline.ts` を触る進行中の spec は無い（2026-11-16 時点）。段階 C（`specs/migrate-llm-models-gpt6.md`）は、この比較の結果を見てから

## 本番操作

- 比較の実行（LLM 費用 $0.5 以内）。Owner の承認のうえ Claude Code が行う。DB には書き込まない
- 実行時の `--file` には、段階 B の `tmp/model-trial/2026-11-16T04-25-28-462Z/` の 12 本を渡す（誤りを含むと分かっている `76171330-…-fast6.md` を含む）

## 未解決の質問

なし。
