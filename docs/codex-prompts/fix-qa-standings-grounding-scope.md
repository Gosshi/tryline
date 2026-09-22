# Codex 指示書: QA が順位表を見ていない問題

仕様書: `specs/fix-qa-standings-grounding-scope.md`
受け入れ条件（1〜13）は仕様書を正とする。ここでは繰り返さない。

## 直したいこと

**生成側には順位表が渡り、QA 側には渡らない。** その結果、順位表に基づく正しい記述が
「入力データにない」と誤検出され、`factual_grounding` が下がって recap が draft に落ちる。

実例（モンペリエ × ペルピニャン、published FG3）の QA 指摘:

> 「開幕3試合で挙げた14トライ」は、提示された入力データから確認できない統計です。

モンペリエの3試合のトライは 3+3+8 = **14本**で、`competition_standings.tries_for` に入っている。
**QA の指摘が誤りで、本文は正しい。**

## 触るファイル

- `lib/llm/prompts/shared-prompt-blocks.ts`（鮮度述語の切り出し）
- `lib/llm/prompts/qa-content.ts`
- `lib/llm/pipeline.ts`
- テスト一式

`lib/llm/stages/assemble.ts` の `standings_freshness` の算出は触らない。正しく動いている。
順位表の取り込み・計算（`scripts/calculate-standings.ts` 等）も触らない。

## 修正箇所（2026-09-22 実測の行番号。すべて main 基準）

| 場所 | 現在 |
|---|---|
| `qa-content.ts:60` | `competition_standings: "out_of_scope",` |
| `qa-content.ts:62` | `h2h_last_5: "out_of_scope",` ← **触らない** |
| `qa-content.ts:22-41` | `QaMatchContext`（順位表のフィールドが無い） |
| `qa-content.ts:88-109` | `QA_GROUNDING_CONTEXT_FIELDS` |
| `shared-prompt-blocks.ts:73-76` | 鮮度判定がインライン |
| `pipeline.ts:329` | `matchContext:` の構築 |

## 最重要: 鮮度述語を共有すること

現在 `shared-prompt-blocks.ts:73-76` に判定がインラインで書かれている。

```ts
const isCurrent =
  !freshness ||
  (freshness.home.played !== null &&
    freshness.away.played !== null &&
    freshness.home.played >= freshness.home.expected_played &&
    freshness.away.played >= freshness.away.expected_played);
```

**QA 側で同じ判定を書き直さないこと。** export された関数に切り出して両方から呼ぶ。

理由: 生成側が「古いので渡さない」と判断した順位表を QA 側が根拠として受け取ると、
**古い数値に基づく記述を QA が正当と認めてしまう**。今回直している誤検出とは
逆向きの、より危険な穴になる。片方だけ条件が変わって腐るのも防ぐ。

## 既存のガードを利用する

`getQaGroundingCoverageGaps()`（`qa-content.ts:110-130`）は
「`grounded` なのに `QA_GROUNDING_CONTEXT_FIELDS` に無い」を検出する。
`tests/llm/prompts/qa-content.test.ts:725` が `toEqual([])` を assert している。

**disposition だけ変えて対応表を足し忘れると、この既存テストが落ちる。**
これは正しい挙動なので、テストのほうを緩めないこと。

## 処理すべきエッジケース

1. `played < expected_played` → QA プロンプトにも順位表を渡さない
2. どちらかの `played` が `null` → 同上
3. `competition_standings` が空配列 → QA プロンプトが正常に生成される
4. `standings_freshness` 自体が `undefined` → 現行の `buildStandingsBlock` は
   この場合 `isCurrent = true` として扱う。**QA 側も同じ扱いに揃えること**
5. 生成プロンプトと QA プロンプトで、順位表が入るかどうかが**必ず一致する**（AC 8）

## やってはいけないこと

- QA 側で鮮度判定を再実装すること
- `h2h_last_5` の disposition を変えること。スコープ外（AC 9）
- `getQaGroundingCoverageGaps()` のテストを緩めること
- QA の publish 閾値（`factual_grounding >= 3`）を触ること
- 新しいテストを、修正前でも通る形で書くこと

## 完了の定義

- 仕様書の受け入れ条件 1〜13 をすべて満たす
- **AC 2 / 4 / 5 / 8 のテストが修正前のコードで落ちることを先に確認**し、
  どう落ちたかを PR 本文に書く
- AC 1 の grep 結果を PR 本文に貼る
  （`grep -rn "expected_played" lib | grep -v node_modules` で
  `>=` を含む行が述語定義の1ファイルだけになっていること）
- **spec から逸脱した場合は PR 本文の "Intentional deviations" に必ず書く。**
  前回（#850）、spec の「7点差」を「5点差」に変えた判断は正しかったが
  "None" と書かれていたため、検算するまで誰も気づけなかった
- `pnpm vitest run tests/llm` が全緑
- `pnpm tsc --noEmit` / `pnpm lint` が通る
- `gh pr checks` で CI の緑を確認してから完了報告する
