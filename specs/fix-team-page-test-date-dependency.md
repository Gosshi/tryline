# fix-team-page-test-date-dependency

> `tests/app/team-page.test.tsx` が **2026-09-11 に日付をまたいで落ち始めた**。#807 とは無関係で、**main の CI が現在赤**である。同型の恒久修正は #592 でホームページ側に入っている。

## 背景

### 現在落ちているもの

```
FAIL tests/app/team-page.test.tsx > TeamPage
     > renders Japanese team names and upcoming matches before recent matches
  Unable to find an element with the text: 次戦
Test Files  1 failed | 297 passed (298)
```

**原因はフィクスチャの日付が過去になったこと。**

```ts
tests/app/team-page.test.tsx:176   kickoffAt: "2026-09-10T14:00:00.000Z"
```

テストは「次戦」の見出しが「直近の試合」より前にあることを検証する（`:202-205`）。**この試合が現在時刻を過ぎた瞬間、「次戦」セクションごと消える。** 2026-09-10 → 09-11 で日付が変わり落ちた。

**`tests/app/team-page.test.tsx` は今日の PR #794〜#807 のどの差分にも含まれていない。** ローカル main でも同じ 1 件が落ち、3 件はパスする（2026-09-11 実測）。

### 恒久修正の方式は既にある

#592 でホームページ側に入っている（`project_ci_homepage_test_broken`）。

```ts
tests/app/home-page.test.tsx:213-215
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-17T03:00:00.000Z"));
```

`afterEach`（`:328`）で解除する。**この形をそのまま適用する。** 新しい方式を考案しない。

### 一律適用してはいけない

「近接した日付を持ち fake timers を使っていないテスト」は 12 ファイルあるが、**その大半はパーサ・取り込みのフィクスチャで、現在時刻と比較していない**（`tests/ingestion/wikipedia-*.test.ts` 等）。日付は単なる入力データである。**ここに fake timers を入れるのは無意味な変更で、レビューを膨らませるだけ。**

対象は「**現在時刻との比較で分岐する**」テストに限る。

## スコープ

対象:
- `tests/app/team-page.test.tsx` の時刻固定（**必須**）
- 下記の候補について、**現在時刻と比較して分岐しているかを判定し、該当するものだけ**時刻を固定する

```
tests/db-queries-matches-calendar.test.ts
tests/lib/public-data-cache.test.ts
tests/llm/sourced-facts.test.ts
tests/app/competition-standings-page.test.tsx
tests/app/rwc2027-hub-page.test.tsx
tests/components/home-matchday-board.test.tsx
```

対象外:
- **パーサ・取り込みテストのフィクスチャ日付**（`tests/ingestion/**`、`tests/tools/**`）。現在時刻と比較していない
- **アプリ実装コードの変更**。テストのみ
- フィクスチャの日付を「もっと先の未来」に書き換えるだけの対処。**同じ問題が先送りされるだけで、いずれまた落ちる**
- `vitest.config.ts` の変更

## データモデル変更 / API サーフェス / UI サーフェス

なし。

## LLM 連携

なし。コスト $0。

## 変更詳細

### 1. 判定基準

**そのテストが落ちるかどうかが、実行日に依存するか。** 具体的には、テスト対象のコードが `Date.now()` / `new Date()` を使って**フィクスチャの日付と比較し、表示や分類を変える**場合が該当する。

判定できたら、**該当したファイルと該当しなかったファイルの両方を PR 本文に列挙すること。** 「6 件見て 2 件該当した」という結果だけでなく、**該当しなかった 4 件がなぜ該当しないか**も 1 行ずつ書く。

### 2. 固定する時刻

**フィクスチャの日付から決定論的に選ぶ。** `team-page.test.tsx` なら `:176` の `2026-09-10T14:00:00.000Z` が「次戦」として成立する時刻（それより前）を選ぶ。

**「今日から見て未来の日付」をフィクスチャ側に足す形にしないこと。** それは対象外に挙げた先送りである。

## 受け入れ条件

1. **`tests/app/team-page.test.tsx` が green である**
2. **同テストが、システム日付を変えても結果が変わらない**ことを検証する。具体的には、`vi.setSystemTime` で 2026-09-01 / 2026-12-31 / 2027-06-01 のいずれに設定しても同じ結果になる（**実行日依存が消えたことの証拠**）
3. 固定した時刻が**フィクスチャの日付から導かれている**（テスト内のコメントか、値の対応が読み取れる形）
4. `afterEach` で fake timers が解除されている（`home-page.test.tsx:328` と同じ）
5. 上記 6 候補について、**該当・非該当の判定結果が PR 本文に列挙されている**（非該当の理由も 1 行ずつ）
6. **`tests/ingestion/**` と `tests/tools/**` に差分が無い**
7. **アプリ実装コード（`app/` / `lib/` / `components/`）に差分が無い**
8. `vitest.config.ts` に差分が無い
9. **フィクスチャの日付を未来にずらすだけの変更をしていない**
10. `pnpm lint` / `pnpm typecheck` / `pnpm test` が green

## 未解決の質問

なし。

**本 spec で解決しないと明示するもの**:

- **これはテストの修正であって、チームページの不具合修正ではない。** 「次戦」の表示ロジック自体は正しい
- **候補 6 件のうち該当しなかったものは、将来別の理由で落ちうる。** 本 spec が保証するのは「実行日依存が無いこと」だけ
