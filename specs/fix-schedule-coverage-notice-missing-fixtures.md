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

### 実測（2026-09-07）

| 大会 | total_rounds | 取り込み節数 | 試合数 | 通知 | 実態 |
|---|---:|---:|---:|---|---|
| `premiership-2025-26` | 18 | 18 | **75** | **出ない** | **18 試合欠落**（ニューカッスル戦が全部） |
| `premiership-2026-27` | 18 | 17 | 90 | 出る | 90 試合＝10チーム×18節÷2 で**完全** |
| `top-14-2026-27` | 26 | 3 | 21 | 出る | 節単位取り込み（D024）による既知の状態 |

**判定が逆になっている。** 実際に 18 試合欠けている大会には通知が出ず、試合が揃っている大会には出ている。

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

これが本 spec の中心であり、**間違えやすいところである。**

節あたりの試合数は大会によって違う（10 チームなら 5、12 チームなら 6）。bye のある大会、プレーオフ、中立会場の追加戦もある。**「チーム数 ÷ 2 × 節数」を一律に使わないこと。**

**基準案**: 取り込み済みの節ごとに試合数を数え、**その大会で最も多い節の試合数**を基準にする。基準より少ない節を「試合が欠けている節」とする。

```
premiership-2025-26: 全節が 4 試合 → 基準 4 → 欠落 0 と判定される
```

**この案は今回のケースを検出できない。** 全節が一様に 1 試合ずつ欠けているためである。

**代替案の検討を実装者に求める。** 例えば `standings` のチーム数から期待試合数を導く、`competitions` にチーム数を持たせる、など。**採用しない場合はその理由を PR 本文に書くこと。** 判定方法を決めるのが本 spec の要点で、文言だけ直しても意味がない。

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
4. **`premiership-2026-27`（17/18 節・90 試合）で「節が欠けている」と出て、「試合が欠けている」とは出ない**ことを検証するテストがある
5. `top-14-2026-27`（3/26 節）で節の数字が出る
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

**本 spec で解決しないと明示するもの**:

- **全節が一様に同数だけ欠けている場合は検出できない。** 今回の `premiership-2025-26`（全 18 節が 4 試合）がまさにこれで、基準を「最も多い節の試合数」に置く限り原理的に見つからない。**本 spec を入れても、この大会の 18 試合欠落は通知されない。** 検出したいなら大会ごとの期待チーム数を持つ必要があり、それは別 spec
- **これは 3 度目の設計である。** 過去 2 回（最終キックオフ比較 / `end_date` 比較）はどちらも実データで機能しなかった。**マージ後に本番の全大会で実際の判定結果を確認するまで、直ったと report しないこと**
