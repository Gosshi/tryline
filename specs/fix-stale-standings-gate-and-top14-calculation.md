# 順位表の鮮度ゲートと Top 14 の自前計算

**この spec は PR #849 を置き換える。** #849 は取り込まない。
良い部分（順位差分を要求しない・禁止列挙への追加）は本 spec に含める。

## 背景

2026-09-22 時点で、本番の Top 14 順位表が**第1節時点のまま**止まっている。
第3節（9/19-21）が終わっているのに全チーム `played = 1`。

### 影響は2面

**1. 読者に見えている。** `https://www.trylinerugby.com/c/top-14/2026-27/standings` の生 HTML:

```
ボルドー | UBB | 試合 1 | 勝 1 | 敗 0 | ... | 勝点 5
```

大会ハブは Bing 流入の 86% が着地する面であり、サイト内で最も人が降りる場所である。

**2. recap の入力になっている。** 9/21 に生成した Top 14 recap 2本が
`factual_grounding: 2` で reject され draft 止まりになった。本文:

> 試合前の順位表ではトゥールーズが1試合を終えて勝ち点1の10位、ヴァンヌが勝ち点0の13位だった。

**これは捏造ではない。** `competition_standings` の実データ（position 10 / played 1 / total_points 1）を
そのまま読んでいる。QA の「入力データにない」という指摘文言のほうが不正確だった。

### 原因はソース遅れ。パーサは正常

`resolveWikipediaStandingsUrl("top-14", "2026-27")` →
`https://en.wikipedia.org/wiki/2026–27_Top_14_season`

2026-09-22 に実取得した結果、**Wikipedia の表自体が `Pld = 1`**:

```
Pos | Team            | Pld | W | D | L | PF | PA | ... | Pts
1   | Bordeaux Bègles |  1  | 1 | 0 | 0 | 64 |  5 | ... |  5
```

DB の値と完全一致する。**取り込みは忠実で、直すべきはパーサではない。**

頻度も原因ではない。`cron-ingest-standings` は `30 3 * * 1`（週1・月曜）だが、
2026-09-21 09:09 UTC（第3節終了後）に success で完了したうえで `played=1` を書いている。

## スコープ

対象:
- **A. 鮮度ゲート** — 順位表がその試合をカバーしていないとき、プロンプトに入れない（recap / preview 両方）
- **B. Top 14 の自前計算** — `scripts/calculate-standings.ts` を大会別ボーナス規則に対応させ、
  Top 14 のみ自前計算へ切り替える
- PR #849 の良い部分の取り込み

対象外:
- Top 14 以外の大会の自前計算への切り替え（規則の裏取りができていないため）
- 順位表ページの UI 変更
- QA の publish 閾値
- Wikipedia 取り込み経路そのものの削除

---

# A. 鮮度ゲート

## 現状

`lib/llm/prompts/shared-prompt-blocks.ts:63-74`:

```ts
export function buildStandingsBlock(
  standings: unknown[],
  contentType: "preview" | "recap",
): string {
  return standings.length === 0
    ? ""
    : [
        `現在の大会順位表（この試合前時点）: ${JSON.stringify(standings)}`,
        ...
```

**空かどうかしか見ていない。** 古い順位表は「この試合前時点」と断言されて preview / recap 両方に入る。

PR #849 はこれを recap 側で
`buildStandingsBlock(...).replace("この試合前時点", "この試合を終えた時点")` と置換していた。
**採用しない。** 古い `played=1` を「この試合を終えた時点」と断言させるのは、より強い虚偽になる。
加えて共有ヘルパの文言が変わると `.replace` が黙って no-op になり、バグが無言で復活する。

## 実装方針

**データが試合をカバーしていないなら、ラベルを言い換えるのではなく、渡さない。**

### 判定

対象試合の home / away 各チームについて:

```
expectedPlayed(team) =
  その大会で status='finished' かつ
  recap なら kickoff_at <= 対象試合の kickoff_at
  preview なら kickoff_at <  対象試合の kickoff_at
  を満たす、そのチームの試合数
```

次のいずれかなら**順位表ブロックを空文字にする**。

- どちらかのチームの行が `competition_standings` に無い
- どちらかのチームの `played` が `expectedPlayed` を**下回る**

`played` が `expectedPlayed` を**上回る**場合はゲートしない
（順位表が先行しているだけで、その試合を含む情報は持っている）。

### 判定に必要なデータ

`AssembledContentInput` には現在、各チームの「その大会での消化試合数」が無い。
`lib/llm/stages/assemble.ts` で算出して渡すこと。既存の
`loadCompetitionStandings`（`:514`）の近くに置くのが自然。

`competition_standings` の行は `team_name` しか持たない（`lib/llm/types.ts:220-232`）ため、
チーム照合はアセンブル側で `team_id` ベースに行い、
**プロンプト層で名前照合をしない**こと。名前照合は Top 14 で 14 中 4 件ずれる既知の罠がある。

### ラベル

ゲートを通った順位表は、その試合をカバーしていることが保証される。
`この試合前時点` という断定は recap では依然として誤りなので、
**時点を断定しない文言に改める**（例: 「最新の大会順位表」）。
`buildStandingsBlock` は既に `contentType` を受け取っているので、
**文字列置換ではなく引数で分岐すること**。

---

# B. Top 14 の自前計算

## 現状

`scripts/calculate-standings.ts`（359行）は**既に存在し、どこからも呼ばれていない**
（`grep -rn "calculate-standings\|calculateStandings" app lib .github` が 0 件）。

`match_events` の `type='try'` からトライ数を数え（`:209-211`）、
勝4/分2/敗0 と2種のボーナスを計算して `competition_standings` へ upsert する。

### そのまま使うと Top 14 の順位表が壊れる

Wikipedia の当該ページに記載された LNR の規則:

> Four competition points are awarded for a win, two for a draw,
> with one competition bonus point awarded for a **loss within seven points**,
> and one bonus point also awarded for **scoring at least three tries more than the opponent**.

`:130` は `if (triesFor >= 4)` で、**標準ルール（4トライ以上）を使っている**。
Top 14 は**相手より3トライ以上多い**こと。

2026-09-22 実測、Top 14 2026-27 の完了21試合のうち **9試合で結果が食い違う**:

| 試合 | トライ | 標準(4本以上) | Top 14(差3以上) |
|---|---|---|---|
| Castres 29-27 Toulon | 4 - 4 | 両チームに付与 | どちらも無し |
| Lyon 40-36 Clermont | 4 - 5 | 両チームに付与 | どちらも無し |
| Vannes 23-29 Toulouse | 2 - 4 | Toulouse に付与 | 無し |
| Pau 70-28 Bayonne | 10 - 4 | 両チームに付与 | Pau のみ |

さらに `:130` は**勝敗に関係なくトライボーナスを加算する**（引き分けでも付く）。

### 上書きの罠

`SUPPORTED_FAMILIES`（`scripts/backfill-standings.ts`）に **`top-14` が含まれている**。
自前計算を入れても、**毎週月曜の Wikipedia 取り込みが古い値で上書きする**。
大会名 `name_ja` を DB で直しても取り込み定数が 6 時間で上書きした過去事例と同型。
**どちらが権威かをコードで一意に決めること。**

## 実装方針

1. ボーナス規則を大会ファミリー別の定数として定義する。
   既定は現行の標準ルール（4トライ以上 / 7点差以内）。`top-14` だけ
   「相手より3トライ以上多い / 7点差以内」を持つ。
2. `addMatchResult` に相手のトライ数を渡せるようにする（現在は `triesFor` しか受けない）。
3. `top-14` を Wikipedia 週次取り込みの対象から外し、自前計算を権威にする。
   外し方は `SUPPORTED_FAMILIES` から除くか、`ingestStandingsForFamily` で早期 return するか、
   いずれでもよいが**両方が書き込む状態を残さないこと**。
4. 自前計算を cron から実行する。既存の `cron-ingest-standings` に追加するのが自然。
   Wikipedia 取り込みが失敗しても自前計算が走ること。
5. **イベント欠損時のガード**: 対象大会に `match_events` が0件の finished 試合が1件でもあれば、
   トライ数が数えられず誤ったボーナスになる。その場合は**計算を中止して理由を返す**。
   黙って0トライとして計算しない。

---

## 受け入れ条件

### A. 鮮度ゲート

1. `buildStandingsBlock` の戻り値に `この試合前時点` が含まれない。
   時点を断定しない文言になっている。
2. `buildGenerateRecapPrompt` / `buildGeneratePreviewPrompt` のどちらにも
   `.replace(` による戻り値の文字列加工が存在しない。
   分岐が要るなら `contentType` 引数で行う。
3. 順位表の `played` が `expectedPlayed` を下回る入力で、
   recap プロンプトに `現在の大会順位表` / `最新の大会順位表` いずれの順位表ブロックも含まれない。
4. AC 3 と同じ入力で、preview プロンプトにも順位表ブロックが含まれない。
5. `played` が `expectedPlayed` と等しい入力では、順位表ブロックが含まれる（過剰にゲートしない）。
6. `played` が `expectedPlayed` を上回る入力でも、順位表ブロックが含まれる。
7. 片方のチームの行が `competition_standings` に無い入力で、順位表ブロックが含まれない。
8. `competition_standings` が空配列のときの挙動は現行どおり（空文字）。

### B. Top 14 の自前計算

9. Top 14 の規則で、**相手より3トライ以上多い場合のみ**トライボーナスが付く。
   上表の4試合を**そのままテストケースにすること**（期待値は表のとおり）。
10. Top 14 以外（既定）の規則では、従来どおり4トライ以上でトライボーナスが付く。
    既定の挙動を変えていないことを既存テストで確認する。
11. 引き分けの試合でボーナス点がどう扱われるかを、**LNR の規則を確認したうえで**実装する。
    Wikipedia の当該ページは「引き分けではどちらもボーナス点を得られない」と述べつつ、
    引用元は LNR Règlements Article 330 Section 3.2 である。
    **Wikipedia の要約文だけを根拠にしないこと。**
    確認できなければ実装せず、未解決として PR 本文に明記する。
12. 対象大会に `match_events` が0件の finished 試合があるとき、計算は中止され、
    `competition_standings` へ1行も書き込まれない。理由が戻り値に含まれる。
13. `top-14` が Wikipedia 週次取り込みの対象から外れている。
    `ingestWeeklyStandings()` を実行しても Top 14 の行が更新されない。
14. 自前計算が cron から実行される。Wikipedia 取り込みが throw しても自前計算は実行される。

### PR #849 から引き継ぐ分

15. recap プロンプトが差分を要求しない。
    `/順位変動|順位表への影響|上昇\/下降|試合前の順位/` のいずれにもマッチしない。
    非スパース入力・データスパース入力の両方で検証する。
16. 禁止列挙（`generate-recap.ts:341` 付近）に順位・勝ち点が含まれる。

### 検証手順

17. AC 3 / 4 / 7 / 9 / 12 / 13 のテストを**修正前のコードに対して実行して落ちること**を
    確認してから実装する。通ってしまうテストは検出力が無いので書き直す。
18. **見出し名を変える場合**、`tests/llm/prompts/generate-recap.test.ts:254-255` の
    `expect(prompt).toContain("# 大会文脈と順位への影響")` 系が落ちる。同時に更新すること。
19. `tests/llm/prompts/generate-recap.test.ts:28` の基本フィクスチャは
    `competition_standings: []` なので、**順位表を含むフィクスチャを別途用意しないと
    AC 1 / 3 / 5 / 6 / 7 は素通りする**。用意すること。
20. `pnpm vitest run tests/llm tests/scripts` が全緑。
21. `pnpm tsc --noEmit` と `pnpm lint` が通る。
22. PR を出す前に `gh pr checks` で CI の緑を確認する（main では CI が走らないため）。

## デプロイ後の運用手順

実装には含めない。

1. Top 14 の自前計算を手動実行し、`played` が全チーム 3 になることを確認する
2. `https://www.trylinerugby.com/c/top-14/2026-27/standings` の表示を確認する
3. 勝ち点を手計算と照合する。**上表の4試合を含めること**
4. draft の recap 2本を再生成し、`factual_grounding` を確認する

## 未解決の質問

1. **Top 14 以外の大会も Wikipedia 遅れの影響を受けうる。**
   2026-09-22 時点で URC / プレミアシップは `played=0` だが、両リーグとも開幕が 9/25 なので正しい。
   開幕後に同じ遅れが出るかは未観測。A の鮮度ゲートがあれば recap は守られるが、
   **順位表ページの表示は古いままになる。** 自前計算を広げるかは、
   各大会のボーナス規則を裏取りしてから Owner が判断する。

2. 引き分け時のボーナス（AC 11）。一次資料の確認が要る。
