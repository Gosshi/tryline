仕様書 `specs/fix-team-page-test-date-dependency.md` を実装してください。**先に全文を読んでください。**

**テストのみの修正です。アプリ実装コードは変えません。**

## いま main の CI が赤です

```
FAIL tests/app/team-page.test.tsx > TeamPage
     > renders Japanese team names and upcoming matches before recent matches
  Unable to find an element with the text: 次戦
Test Files  1 failed | 297 passed (298)
```

**#807 とは無関係です。** `tests/app/team-page.test.tsx` は今日の PR #794〜#807 のどの差分にも含まれておらず、ローカル main でも同じ 1 件が落ちます（2026-09-11 実測）。

原因はフィクスチャの日付が過去になったことです。

```ts
tests/app/team-page.test.tsx:176   kickoffAt: "2026-09-10T14:00:00.000Z"
```

テストは「次戦」の見出しが「直近の試合」より前にあることを検証します（`:202-205`）。**この試合が現在時刻を過ぎた瞬間、「次戦」セクションごと消えます。** 09-10 → 09-11 で日付が変わって落ちました。

## 方式は既にあります。考案しないでください

#592 でホームページ側に入っています。

```ts
tests/app/home-page.test.tsx:213-215
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-17T03:00:00.000Z"));
```

`afterEach`（`:328`）で解除します。**この形をそのまま適用してください。**

## 一律に適用しないでください

「近接した日付を持ち fake timers 未使用」のテストは 12 ファイルありますが、**大半はパーサ・取り込みのフィクスチャで、現在時刻と比較していません**（`tests/ingestion/wikipedia-*.test.ts` 等）。日付は単なる入力データです。ここに fake timers を入れても意味がなく、レビューを膨らませるだけです。

**必須は `tests/app/team-page.test.tsx` の 1 件だけ**です。加えて次の 6 件を**判定**してください。

```
tests/db-queries-matches-calendar.test.ts
tests/lib/public-data-cache.test.ts
tests/llm/sourced-facts.test.ts
tests/app/competition-standings-page.test.tsx
tests/app/rwc2027-hub-page.test.tsx
tests/components/home-matchday-board.test.tsx
```

判定基準は「**そのテストが落ちるかどうかが実行日に依存するか**」です。テスト対象のコードが `Date.now()` / `new Date()` でフィクスチャの日付と比較し、表示や分類を変えている場合が該当します。

**該当したものだけ**時刻を固定してください。

## やってはいけないこと

- **フィクスチャの日付を「もっと先の未来」に書き換えるだけの対処。** 同じ問題が先送りされ、いずれまた落ちます
- `tests/ingestion/**` と `tests/tools/**` を触ること
- **アプリ実装コード（`app/` / `lib/` / `components/`）を変えること**
- `vitest.config.ts` を変えること
- 新しい時刻固定の方式を考案すること

## 完了の定義

受け入れ条件 1〜10 を満たすこと。特に:

- **システム日付を 2026-09-01 / 2026-12-31 / 2027-06-01 のいずれにしても同じ結果**になる（条件 2。実行日依存が消えた証拠）
- 固定した時刻が**フィクスチャの日付から導かれている**（条件 3）
- `afterEach` で解除（条件 4）
- **6 候補の該当・非該当を PR 本文に列挙。非該当の理由も 1 行ずつ**（条件 5）
- `tests/ingestion/**` `tests/tools/**` とアプリ実装コードに差分が無い（条件 6・7）
- **未来にずらすだけの変更をしていない**（条件 9）

git worktree で `origin/main` から切ってください（`docs/runbooks/codex-worktree.md`）。

**これはテストの修正で、チームページの不具合修正ではありません。** 「次戦」の表示ロジック自体は正しく動いています。

仕様と現状が食い違うと判断したら、実装を止めて指摘してください。
