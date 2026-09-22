# Codex 指示書（追補）: PR #851 に制限文を1行足す

仕様書: `specs/fix-qa-standings-grounding-scope.md` の **AC 14 / 15**（追補済み）

**PR #851 はレビュー済みで、AC 1〜13 はすべて満たしている。** 実装をやり直す必要はない。
既存ブランチ `codex/fix-qa-standings-grounding-scope` に追加コミットを積むこと。

## 足りないもの

`lib/llm/prompts/qa-content.ts` の `competitionStandingsBlock`（PR head で `:347-355`）が
許容側の指示しか持っていない。

```ts
const competitionStandingsBlock =
  !matchContext.competitionStandings ||
  matchContext.competitionStandings.length === 0
    ? ""
    : [
        "## competition_standings grounding",
        "以下はこの試合時点をカバーする大会順位表です。本文が順位・勝点・勝敗・得失点・トライ数に言及している場合、入力データに基づく正当な記述として扱い factual_grounding を下げないこと。",
        JSON.stringify(matchContext.competitionStandings),
      ].join("\n");
```

これだと「順位表に触れていたら減点するな」だけで、**値が間違っている場合を捕まえられない**。
順位表が入力にあるのに「首位は勝点20」（実際は14）と書かれても減点対象にならない。

## 前例（同じファイル内）

`teamStatsBlock`（PR head で `:359-362`）は許容文の直後に制限文を置いている。

```ts
"以下は公式サイトから取得した実データです。本文がこれらの数値（…）に言及している場合、入力データに基づく正当な記述として扱い factual_grounding を下げないこと。",
"ただし、この一覧に無いチームスタッツや成功率を本文が述べている場合は factual_grounding を下げること。",
```

**この構造に合わせること。** 配置は許容文の直後、`JSON.stringify(...)` の前。

## やること

`competitionStandingsBlock` の許容文の直後に制限文を1行足す。内容は次の2点を両方カバーすること。

- **(a)** この一覧に無い順位・勝点・成績を本文が述べている場合は下げる
- **(b)** この一覧と**異なる数値**を本文が述べている場合は下げる

`team_stats` は (a) しか書いていないが、順位表は**数値の取り違えが本プロジェクトの
反復的な失敗モード**なので (b) も明示すること。文面は既存ブロックの語調に合わせてよい。

## テスト

既存の
`it("grounds current competition standings but excludes stale or incomplete standings", ...)`
は許容文側しか見ていない。**制限文が含まれることを assert する**こと（AC 15）。

許容文だけを assert して終わらせない。制限文を消したときに落ちるテストにすること。

## やってはいけないこと

- `team_stats` など他のブロックの文面を変えること。スコープ外
- 許容文を削るまたは弱めること。誤検出の解消が本 PR の目的
- AC 1〜13 の実装に手を入れること。レビュー済み

## 完了の定義

- 仕様書の AC 14 / 15 を満たす
- **制限文を削ると新テストが落ちること**を確認し、PR 本文に書く
- `pnpm vitest run tests/llm` が全緑
- `pnpm tsc --noEmit` / `pnpm lint` が通る
- spec から逸脱した場合は PR 本文の "Intentional deviations" に必ず書く
- `gh pr checks` で CI の緑を確認してから完了報告する
