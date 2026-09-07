# fix-premiership-newcastle-alias

## 背景

プレミアシップ 2025-26 に **ニューカッスルの試合が 1 件も存在しない**。本番実測（2026-09-07）。

| | 実測 |
|---|---|
| `premiership-2025-26` の参加チーム数 | **9**（bath, bristol-bears, exeter-chiefs, gloucester, harlequins, leicester-tigers, northampton-saints, sale-sharks, saracens） |
| 1 節あたりの試合数 | 4（10 チームなら 5 が正しい） |
| 取り込み済み試合 | 72 + プレーオフ 3 = 75 |
| `newcastle-falcons` の同シーズン試合 | **0**（他シーズンには 36 試合ある） |

**欠落は 18 試合、すべてニューカッスル戦である。**

### 原因: 同じ対応表が 2 箇所にあり、片方だけ改称に追随している

ニューカッスル・ファルコンズは 2025 年に **Newcastle Red Bulls** へ改称した。Wikipedia の 2025-26 シーズンページは新名称で書かれている。

```
lib/ingestion/sources/wikipedia-premiership.ts:33-35
  Newcastle: "newcastle-falcons"
  "Newcastle Falcons": "newcastle-falcons"
  "Newcastle Red Bulls": "newcastle-falcons"      ← 追随済み

lib/scrapers/wikipedia-premiership-results.ts:37-38
  Newcastle: "newcastle-falcons"
  "Newcastle Falcons": "newcastle-falcons"
  （"Newcastle Red Bulls" が無い）                 ← 追随していない
```

そして未知名のときの挙動が例外である。

```typescript
// lib/scrapers/wikipedia-premiership-results.ts:62-68
function resolveTeamSlug(teamName: string) {
  const slug = TEAM_SLUG_BY_WIKIPEDIA_NAME[teamName];
  if (!slug) {
    throw new Error(`Unknown Premiership team name: ${teamName}`);
  }
  return slug;
}
```

**該当試合だけを飛ばすのではなく throw する。** 呼び出し側がどこで捕まえるかによって、その節あるいは実行全体が落ちる。

### これは既知の型である

`specs/fix-competition-display-name-duplication.md`（PR #768）と同じ構造で、**同じ整形・対応表が 2 箇所に別実装で存在し、片方だけが正しい**状態だった。あのときは RSS 経路が共通のガードを通っていなかった。

2 つの対応表はそれぞれ別の呼び出し元を持つ。

| ファイル | 呼び出し元 |
|---|---|
| `lib/ingestion/sources/wikipedia-premiership.ts` | `lib/ingestion/live-competitions.ts:23`、`scripts/backfill-premiership-match-events.ts:3` |
| `lib/scrapers/wikipedia-premiership-results.ts` | `lib/scrapers/index.ts:112,116`、`scripts/import-premiership-results.ts:5` |

## スコープ

対象:
- 2 つのチーム名対応表を**単一の共有モジュールへ切り出す**（新規ファイル）
- `resolveTeamSlug` の未知名時の挙動を、実行全体を落とさない形に変える
- 上記 2 ファイルを共有モジュールの利用者にする
- テスト

対象外:
- **欠落した 18 試合の再取り込み**。これは修正のマージ後に Owner が `scripts/import-premiership-results.ts` を実行する運用であり、コードの機能ではない。**Codex は本番取り込みを実行しない**
- 他大会のチーム名対応表（URC / Top 14 / SRP / League One）。同じ問題を持つ可能性はあるが、**本 spec はプレミアシップに限る**
- 欠落の表示（`specs/fix-schedule-coverage-notice-missing-fixtures.md` が扱う）
- `teams.name` を「Newcastle Red Bulls」へ改称すること。**表示名の変更は別判断**。本 spec は取り込み時の名寄せだけを扱う
- DB への `UPDATE` / `INSERT` / マイグレーション

## データモデル変更

なし。読み取りのみ。

## API サーフェス

なし。

## UI サーフェス

なし（結果として 18 試合が表示されるようになるが、表示コードは変わらない）。

## LLM 連携

なし。コスト $0。

## 変更詳細

### 1. 共有モジュール（新規）

プレミアシップの Wikipedia 表記 → `teams.slug` の対応表を 1 箇所に置く。2 つの既存表の**和集合**とし、`"Newcastle Red Bulls"` を含める。

現行 2 表の差分は Newcastle Red Bulls の 1 件と見えているが、**他にも差があるかを実装時に全件比較して確認し、結果を PR 本文に書くこと。**

### 2. 未知名の扱い

`throw` をやめ、**その試合だけを飛ばして残りを続行する**。飛ばした事実は失われてはならない。

- 未知名と、それが現れた試合の情報を戻り値に含める
- 呼び出し側が件数を報告できるようにする
- `lib/llm/notify.ts` の既存の仕組みで Discord に出せる形にする（通知の実装自体は必須ではないが、戻り値の設計がそれを妨げないこと）

**「静かに飛ばす」にしないこと。** 今回の 18 試合は 1 年近く誰にも気づかれなかった。

### 3. 呼び出し側

`lib/scrapers/index.ts` と `scripts/import-premiership-results.ts` が、スキップ件数を受け取って標準出力に出す。

## 受け入れ条件

**テスト実行の条件**: `tests/ingestion/` には `vitest.config.ts:16` の `exclude` に該当するファイルがある（`events.test.ts` / `standings.test.ts` / `upsert.test.ts`）。**本 spec の新規テストはこれらに該当しない場所に置くこと。** 実行結果を PR 本文に貼る。

1. `"Newcastle Red Bulls"` が `newcastle-falcons` に解決されることを検証するテストがある
2. `"Newcastle Falcons"` と `"Newcastle"` も従来どおり解決される
3. **未知のチーム名で例外を投げず、その試合だけを飛ばす**ことを検証するテストがある
4. 飛ばした件数と未知名が戻り値に含まれることを検証するテストがある
5. 対応表が 1 箇所に集約され、`lib/scrapers/wikipedia-premiership-results.ts` と `lib/ingestion/sources/wikipedia-premiership.ts` の双方が同じ定義を参照している
6. 2 表の和集合をとった結果、失われたエントリが無いことを PR 本文で示す（差分の全件比較）
7. 既存のプレミアシップ関連テストが green
8. **DB への `UPDATE` / `INSERT` / マイグレーションが差分に含まれない**
9. LLM 呼び出しが差分に含まれない
10. `pnpm lint` / `pnpm typecheck` / `pnpm test` が green

## 未解決の質問

**Owner が決めること（実装をブロックしない）:**

1. **`teams.name` を「Newcastle Red Bulls」に改称するか。** 現在は `Newcastle Falcons` / `ニューカッスル・ファルコンズ`。本 spec は取り込みの名寄せだけを直すので表示名は現状のままでも動く。改称するなら `lib/format/japanese-names.ts:49` と `lib/format/team-identity.ts:102,192` も揃える必要がある
2. **欠落 18 試合をいつ再取り込みするか。** 修正のマージ後、Owner が `scripts/import-premiership-results.ts` を実行する

**本 spec で解決しないと明示するもの**:

- **他大会に同じ改称漏れがあるかは調べていない。** プレミアシップだけを直す。「チーム名の名寄せを直した」と一般化して完了報告しないこと
- **18 試合は自動では戻らない。** 修正はこれ以降の取り込みに効くだけで、過去分は Owner の再取り込みが要る
