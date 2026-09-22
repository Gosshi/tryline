# QA が順位表を見ていないため正しい記述が減点される

## 背景

PR #850 で順位表は直った。本番の Top 14 順位表は公式 lnr.fr と
14チーム × 7項目（勝点/勝/分/敗/ボーナス/得点/失点）すべて一致している。

**しかし recap の factual_grounding は 2〜3 のままで、published に届かない。**

原因は QA の採点対象から順位表が外れていること。`lib/llm/prompts/qa-content.ts:58-77`:

```ts
const QA_GENERATION_FIELD_DISPOSITIONS = {
  competition_standings: "out_of_scope",   // :60
  ...
  h2h_last_5: "out_of_scope",              // :62
```

`"grounded"` のフィールドだけが `QaGroundedAssembledField` を経由して
`QA_GROUNDING_CONTEXT_FIELDS`（`:88-109`）に入り、QA プロンプトへ渡る。
**生成側には順位表が渡り、QA 側には渡らない。**

### 実害（2026-09-22 実測）

モンペリエ × ペルピニャンの recap は `factual_grounding: 3` で published されたが、
QA は次のように指摘している。

> 「開幕3試合で挙げた14トライ」は、提示された入力データから確認できない統計です。

モンペリエの3試合のトライは 3 + 3 + 8 = **14本**であり、
自前計算した `competition_standings.tries_for` にその値が入っている。
**QA の指摘のほうが誤りで、本文は正しい。**

同様に「入力データにない順位、勝点」という指摘も、順位表が入力に存在するため誤り。
この誤検出が factual_grounding を押し下げ、Top 14 の recap が draft に落ち続ける。

### 今なら "grounded" にできる理由

過去に `out_of_scope` にしていたこと自体は妥当だった可能性がある。
順位表は Wikipedia 由来で古くなることがあり、根拠として信頼できなかった。
PR #850 で前提が2つ変わった。

1. **鮮度ゲート**により、プロンプトに届く順位表は
   その試合をカバーしていることが保証される（カバーしていなければ空文字になる）
2. **Top 14 は自前計算**になり、公式との一致を実測で確認した

## スコープ

対象:
- `competition_standings` を QA の採点対象（`grounded`）に含める
- 鮮度判定を**生成側と QA 側で共有**する

対象外:
- `h2h_last_5`（`:62` も `out_of_scope`。同種の誤検出を起こしうるが未観測。未解決の質問へ）
- QA の publish 閾値（`factual_grounding >= 3`）
- draft になった既存記事の再生成（運用手順。`cron-post-match-recap-refresh` に
  `from` / `to` を渡す既存経路がある）
- 順位表の取り込み・計算ロジック

## データモデル変更

なし。

## 実装方針

### 1. 鮮度判定を共有関数に切り出す（この spec の要）

現在、鮮度判定は `lib/llm/prompts/shared-prompt-blocks.ts:73-76` の
`buildStandingsBlock` の中にインラインで書かれている。

```ts
const isCurrent =
  !freshness ||
  (freshness.home.played !== null &&
    freshness.away.played !== null &&
    freshness.home.played >= freshness.home.expected_played &&
    freshness.away.played >= freshness.away.expected_played);
```

**このままでは QA 側が同じ判定を再実装することになり、片方だけ腐る。**
述語を export された関数に切り出し、`buildStandingsBlock` と QA コンテキスト構築の
**両方から同じ関数を呼ぶ**こと。

これは必須である。生成側が「古いので渡さない」と判断した順位表を
QA 側が根拠として受け取ると、**古い数値に基づく記述を QA が正当と認めてしまう**。
今回直している誤検出とは逆向きの、より危険な穴になる。

### 2. QA に順位表を渡す

- `QA_GENERATION_FIELD_DISPOSITIONS.competition_standings` を `"grounded"` へ
- `QaMatchContext`（`:22-41`）に順位表を保持するフィールドを追加
- `QA_GROUNDING_CONTEXT_FIELDS` に対応を追加
- `lib/llm/pipeline.ts:329` の `matchContext` 構築で、
  **1 の共有述語が真のときだけ** `assembled.competition_standings` を渡す。
  偽のときは渡さない（生成側と一致させる）

`getQaGroundingCoverageGaps()`（`:110-130`）は
「`grounded` なのに `QA_GROUNDING_CONTEXT_FIELDS` に無い」を検出する。
`tests/llm/prompts/qa-content.test.ts:725` が `toEqual([])` を assert しているので、
**対応を追加し忘れると既存テストが落ちる。** この既存ガードを壊さないこと。

## 受け入れ条件

1. 鮮度判定が export された関数になっており、`buildStandingsBlock` と
   QA コンテキスト構築の両方がそれを呼んでいる。**同じ判定ロジックが複製されていない。**

   検証方法: `grep -rn "expected_played" lib | grep -v node_modules` の結果のうち、
   **比較演算子 `>=` を含む行が、述語を定義した1ファイルにしか現れない**こと。
   （main では `lib/llm/prompts/shared-prompt-blocks.ts:75-76` の2行のみ。
   型定義 `lib/llm/types.ts:234-236` は比較を含まないので対象外）
2. `QA_GENERATION_FIELD_DISPOSITIONS.competition_standings` が `"grounded"`。
3. `getQaGroundingCoverageGaps()` が `[]` を返す
   （既存テスト `tests/llm/prompts/qa-content.test.ts:725` が通る）。
4. 順位表がカバー条件を満たす入力で、QA プロンプトに順位表の内容が含まれる。
   セクション名は既存の `## <field> grounding` の慣習に合わせる。
5. 順位表がカバー条件を満たさない入力（`played < expected_played`）で、
   QA プロンプトに順位表の内容が**含まれない**。
6. 片方のチームの `played` が `null` の入力でも、QA プロンプトに含まれない。
7. `competition_standings` が空配列の入力でも QA プロンプトが正常に生成される。
8. 同一の assembled 入力に対して、
   **生成プロンプトに順位表が入るかどうかと、QA プロンプトに入るかどうかが常に一致する**。
   カバーする場合／しない場合の両方でこれを検証すること。
9. `h2h_last_5` の disposition は変更されていない（スコープ外）。

### 追補（2026-09-22、PR #851 レビューで追加）

14. 順位表の grounding ブロックに、**値の誤りを捕まえる制限文が含まれる**。

    現在の指示は「順位・勝点・勝敗・得失点・トライ数に言及していたら
    factual_grounding を下げるな」のみで、**値が間違っている場合を捕まえる指示が無い**。
    順位表が入力にあるのに「首位は勝点20」（実際は14）と書かれても減点対象にならない。

    同一ファイルの `team_stats` ブロックには対になる制限文がある（`qa-content.ts:361`）。

    ```
    ただし、この一覧に無いチームスタッツや成功率を本文が述べている場合は factual_grounding を下げること。
    ```

    順位表ブロックにも同じ構造で、**(a) 一覧に無い順位・勝点・成績を述べた場合**と
    **(b) 一覧と異なる数値を述べた場合**の両方を減点対象とする文を加えること。
    `team_stats` は (a) しか書いていないが、順位表は数値の取り違えが
    本プロジェクトの反復的な失敗モードなので (b) も明示する。

15. AC 14 の制限文が QA プロンプトに含まれることをテストで assert する。
    許容文（`factual_grounding を下げないこと`）だけを assert して終わらせない。

### 検証手順

10. AC 2 / 4 / 5 / 8 のテストを**修正前のコードに対して実行して落ちること**を
    確認してから実装する。
    AC 4 は修正前に順位表が QA プロンプトへ渡らないため落ちるはずである。
11. `pnpm vitest run tests/llm` が全緑。
12. `pnpm tsc --noEmit` と `pnpm lint` が通る。
13. PR を出す前に `gh pr checks` で CI の緑を確認する（main では CI が走らないため）。

## デプロイ後の運用手順

実装には含めない。

1. `cron-post-match-recap-refresh` を `from=2026-09-19` / `to=2026-09-21` で実行し、
   draft の2本（RC Vannes v Stade Toulousain / Union Bordeaux Bègles v Stade Français）を再生成する
2. `factual_grounding` が 3 以上へ改善するか確認する
3. 改善しない場合、QA の issues を読んで**何が根拠不足と判定されたか**を特定する。
   順位表以外の要因が残っている可能性がある
4. Top 14 j3 の未生成4試合は `cron-live-pipeline` の複数回実行で埋まる
   （時間予算 210秒のため1回あたり1〜2本）

## 未解決の質問

1. **`h2h_last_5` も `out_of_scope`**（`qa-content.ts:62`）。
   直近対戦成績に言及した記述が同様に誤検出される可能性があるが、実例は未観測。
   本 spec では触らない。順位表の変更後に同種の指摘が残るか観察してから判断する。

2. **`factual_grounding >= 3` で publish される閾値の是非**。
   モンペリエ戦は誤検出を含んだまま FG3 で published されている。
   誤検出が消えた後にこの閾値が妥当かは別途判断が要る。

3. 本 spec で Top 14 の recap が published に届くかは**未確認**。
   順位表の誤検出が唯一の要因とは限らない。運用手順 3 で判明する。
