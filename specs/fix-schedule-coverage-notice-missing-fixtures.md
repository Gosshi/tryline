# fix-schedule-coverage-notice-missing-fixtures

> **本 spec は `specs/fix-schedule-coverage-notice-by-rounds.md` を supersede する。** 旧 spec の節数比較は実装済みで動いているが、**1 チーム分の試合が丸ごと欠けても「完全」と判定する**ことが 2026-09-07 の実測で判明した。
>
> **これは同じ問題への 3 度目の設計である。** 旧 spec 自身が、失敗した 2 つの判定方法（最終キックオフ比較 / `end_date` 比較）を記録している。3 度目も外す可能性を前提に、**判定方法と、それが何を検出できないかを両方書く。**

## 背景

監査 A-2 #3 と A-4 #7（`docs/audits/gpt6-full-audit-2026-09-05.md`、いずれも P1）。

> 「現在表示できない節」だけでは何が欠け、いつ戻るか判断できない。**対象節・確認日・既知の事情・公式日程へのリンク。未発表と取得失敗を分ける。**

現行の文言は `components/schedule-coverage-notice.tsx:35` の 1 文だけである。

```
<大会名>の日程には、現在表示できない節があります。
```

### 判定が節数しか見ていない

```typescript
// lib/format/schedule-coverage.ts
export function hasIncompleteSchedule({ ingestedRoundCount, totalRounds }) {
  return totalRounds !== null && ingestedRoundCount < totalRounds;
}
```

`ingestedRoundCount` は `matches.external_ids` の round 値の distinct 数である（`lib/db/queries/competitions.ts:149-155`）。

**節が 1 つでも取り込まれていれば、その節の試合が何試合欠けていても「取り込み済み」に数える。**

### 実測（2026-09-07、初版の記述を訂正）

**初版は「節数は数えているが試合数を見ていない」と書いた。それも事実だが、より根本的な問題があった。`total_rounds` が入っている大会が 3 つしかない。**

```sql
select slug, total_rounds from competitions where total_rounds is not null;
-- premiership-2026-27 / top-14-2026-27 / urc-2026-27 の 3 件のみ
```

`hasIncompleteSchedule` は `totalRounds !== null` を条件にするため、**それ以外の大会は最初から判定対象外**である。

| 大会 | total_rounds | チーム数 | 通常節試合 | 節外試合 | 通知 | 実態 |
|---|---:|---:|---:|---:|---|---|
| `premiership-2025-26` | **null** | 10 | 72 | 3 | **出ない** | **18 試合欠落**（判定対象外だから出ない） |
| `premiership-2026-27` | 18 | 10 | 85 | 5 | 出る | 90 試合で**完全**。5 件は round が未解決なだけ |
| `urc-2025-26` | **null** | 16 | — | — | 出ない | 150 試合。判定対象外 |
| `league-one-2025-26` | **null** | 0 | — | — | 出ない | 114 試合。判定対象外 |
| `top-14-2026-27` | 26 | **0** | 21 | 0 | 出る | 節単位取り込み（D024） |

**通知が出るかどうかが実態とほぼ無関係になっている。**

### 期待試合数は既存データで算出できる

初版は「大会別の権威ある期待値が無い」と書いたが、**誤りだった。`competition_standings` にチーム数がある。**

```
期待通常節試合数 = (competition_standings の distinct team_id) ÷ 2 × total_rounds
実測通常節試合数 = matches のうち external_ids.wikipedia_round が数値のもの
missingFixtures  = 期待 − 実測
```

検算:

| 大会 | 期待 | 実測 | 差 |
|---|---:|---:|---:|
| `premiership-2025-26` | 10÷2×18 = 90 | 72 | **18** ← ニューカッスル欠落と一致 |
| `premiership-2026-27` | 10÷2×18 = 90 | 85 | 5 ← round 未解決の 5 件 |
| `urc-2026-27` | 16÷2×18 = 144 | 144 | **0** |

**通常節とプレーオフは `external_ids.wikipedia_round` の有無で区別できる**（数値なら通常節、null なら節外）。「プレーオフが混在するので算出できない」は成立しない。

`premiership-2025-26` は `total_rounds` が null なのでこの式が使えない。**`total_rounds` の補完は本 spec の対象外**（下記「未解決の質問」）だが、**式そのものは正しく、値が入れば 18 を検出できる。**

`premiership-2025-26` の欠落原因は `specs/fix-premiership-newcastle-alias.md` が扱う。**本 spec はそれが直った後も残る「欠落をどう検出し、どう伝えるか」を扱う。**

## スコープ

対象:
- `lib/format/schedule-coverage.ts`: 判定に**試合数**を加える
- `lib/db/queries/competitions.ts`: 判定に必要な数を渡す
- `components/schedule-coverage-notice.tsx`: 何が欠けているかを具体的に出す
- 呼び出し側 2 箇所（`app/calendar/page.tsx:234`、`app/c/[competition]/[season]/page.tsx:924`）の props
- テスト

対象外:
- **欠落そのものの解消**（`fix-premiership-newcastle-alias.md`）
- Top 14 の節単位取り込み方針（D024）の変更。**未取得であることを正しく伝えるのが本 spec で、取り込み範囲は変えない**
- `competitions.total_rounds` の値の見直し
- DB への `UPDATE` / `INSERT` / マイグレーション
- 公式日程 URL を新たにスクレイプすること。**リンク先は既存データにあるものだけを使う**

## データモデル変更

なし。`competitions.total_rounds` と `matches` は既存のものを読む。

## API サーフェス

なし。

## UI サーフェス

`ScheduleCoverageNotice` の文面。**新しいコンポーネントを作らない。** 既存の `aside`（`border-l-4` / `--color-rule` / `text-xs font-bold tracking-[0.12em]`）を維持する。

| 状態 | 表示 |
|---|---|
| 節が欠けている | 「<大会名>: 全<N>節中<M>節を掲載しています。」 |
| 節は揃うが試合が欠けている | 「<大会名>: <N>節を掲載していますが、一部の試合が未取得です。」 |
| 両方 | 節の情報を優先し、試合の欠落も併記する |
| 欠落なし | 表示しない（現行どおり） |

**「いつ戻るか」を書かないこと。** 未発表と取得失敗を区別できない現状で復旧時期を約束すると、守れない約束になる。監査の要求「未発表と取得失敗を分ける」は**下記の未解決の質問**に回す。

確認日を出す場合は、**データの取得時刻であって「人が確認した日」ではない**ことが分かる文言にする。

## LLM 連携

なし。コスト $0。

## 変更詳細

### 1. 期待試合数の求め方

```
teams    = competition_standings の distinct team_id（当該 competition_id）
expected = teams / 2 * total_rounds
actual   = matches のうち external_ids.wikipedia_round が数値のもの
missingFixtures = expected - actual
```

**節外試合（`wikipedia_round` が null）を actual に数えないこと。** プレーオフや中立会場の追加戦がここに入る。数えると期待値と分母が揃わない。

**`missingFixtures` を `null`（判定不能）にする条件**:

- `total_rounds` が null（現状 3 大会以外すべて）
- `teams` が 0（`competition_standings` が空。`top-14-2026-27` と `league-one-2025-26` が該当）
- `teams` が奇数（bye が発生し `teams / 2` が整数にならない）
- `expected < actual`（期待より多い。データの前提が崩れているので欠落数として報告しない）

**`null` と `0` を混同しないこと。** `null` は「分からない」、`0` は「欠落なし」である。

**「その大会で最も多い節の試合数」を基準にする方法は採らない。** 全節が一様に同数だけ欠けている場合（`premiership-2025-26` がまさにこれ）に検出できないためである。

### 2. 判定の分離

`hasIncompleteSchedule` は真偽値しか返さない。**何が欠けているかを返す形に変える。**

```
{ missingRounds: number, missingFixtures: number | null }
```

`missingFixtures` が `null` は「判定できない」であり、`0` とは違う。**この 2 つを混同しないこと。**

### 3. 文言

`ScheduleCoverageNoticeCompetition` は現在 `family` / `name` / `nameJa` / `season` / `slug` しか受け取らない。**`ingestedRoundCount` と `totalRounds` は 1 つ上の `CompetitionScheduleCoverage` に既に存在する。** props を広げるだけで数字を出せる。

## 受け入れ条件

**テスト実行の条件**: `tests/format/` と `tests/app/` は `vitest.config.ts:16` の `exclude` に該当しない。**既定の `pnpm test` で実行される。** 結果を PR 本文に貼る。

1. 節が欠けている大会で「全<N>節中<M>節」の形式の数字が表示される
2. 節も試合も揃っている大会で通知が表示されない
3. `missingFixtures` が `null`（判定不能）と `0`（欠落なし）を区別することを検証するテストがある
4. **`premiership-2026-27` 相当の fixture**（total_rounds 18 / teams 10 / 通常節 85 / 節外 5）で `missingFixtures === 5` になることを検証するテストがある。**節外の 5 件を actual に数えていたら 0 になるので、この値が計算の正しさを示す**
5. **`urc-2026-27` 相当の fixture**（total_rounds 18 / teams 16 / 通常節 144）で `missingFixtures === 0` になることを検証するテストがある
5-b. `total_rounds` が null、`teams` が 0、`teams` が奇数、`expected < actual` の 4 ケースでそれぞれ `missingFixtures === null` になることを検証するテストがある
5-c. **`premiership-2025-26` 相当の fixture**（total_rounds 18 / teams 10 / 通常節 72 / 節外 3）で `missingFixtures === 18` になることを検証するテストがある。**本番では `total_rounds` が null のため実際には算出されないが、値が入れば検出できることをテストで示す**
6. **「いつ戻る」「復旧予定」に相当する断定が文面に含まれない**
7. 既存の `aside` のトークン（`border-l-4` / `--color-rule` / `text-xs font-bold tracking-[0.12em]` / `--color-ink-muted`）が維持されている
8. 呼び出し側 2 箇所が新しい props を渡している
9. 期待試合数の算出方法と、採用しなかった代替案の理由が PR 本文に書かれている
10. **DB への `UPDATE` / `INSERT` / マイグレーションが差分に含まれない**
11. `pnpm lint` / `pnpm typecheck` / `pnpm test` が green
12. **Owner の目視評価**: `/calendar` と大会ハブで、通知が不安を煽らず事実として読めること。320 / 768 / 1440px

## 未解決の質問

**Owner が決めること:**

1. **「未発表」と「取得失敗」をどう区別するか。** 監査はこの分離を求めているが、現在のデータには区別する材料が無い。Top 14 は方針として未取得（D024）、プレミアシップは取り込みの不具合、という違いを機械的に判定できない。**大会ごとに「既知の事情」を静的に持つ**のが最も単純だが、その表を誰が保守するかが問題になる
2. **公式日程へのリンクを出すか。** 出すなら URL をどこに持つか（`competitions` に列を足すか、コードの定数か）

3. **`competitions.total_rounds` をどう埋めるか。** 現在 3 大会にしか入っておらず、**本 spec を入れても他の大会は判定対象外のままである。** `premiership-2025-26` の 18 試合欠落も、`total_rounds` が入るまで通知されない。手で入れるか、取り込み時に導出するか、Wikipedia から取るかは別 spec

**本 spec で解決しないと明示するもの**:

- **`total_rounds` が null の大会は判定できない。** 本 spec は算出式を正しくするが、入力が無い大会には効かない。**「欠落を検出できるようにした」と一般化して完了報告しないこと。** 効くのは現状 3 大会だけである
- **`competition_standings` が空の大会も判定できない**（`top-14-2026-27` / `league-one-2025-26`）
- **これは 3 度目の設計である。** 過去 2 回（最終キックオフ比較 / `end_date` 比較）はどちらも実データで機能しなかった。今回も初版で 2 つ誤った（「節数は数えている」→ 実際は `total_rounds` が無く判定自体が走っていない、「権威ある期待値が無い」→ `competition_standings` に存在した）。**マージ後に本番の全大会で実際の判定結果を確認するまで、直ったと report しないこと**
