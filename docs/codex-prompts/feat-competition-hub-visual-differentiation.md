`/specs/feat-competition-hub-visual-differentiation.md` の仕様を実装してください。仕様本文は繰り返しません。着手前に必ず spec を読んでください。

基準ビジュアルは `docs/design/mock-hub-b2-depth.html`（案B2）。ブラウザで開いて実際の見え方を確認してから着手してください。

## 最初に読むファイル

| ファイル | 何を確認するか |
|---|---|
| `docs/design/mock-hub-b2-depth.html` | 基準ビジュアル。**深さの6段**（L0〜L5）の使い分けが設計の中核 |
| `app/c/[competition]/page.tsx:99-118` | ファミリーハブの `next/image` ヒーロー。**同じ流儀に揃える** |
| `components/calendar/week-schedule.tsx` | 日付スパインが**既に実装済み**。ラウンドページはこの視覚言語を再利用する |
| `lib/db/queries/matches.ts:49,504,1882` | `MatchListItem.round` の型と導出元、そして**呼んではいけない関数** |
| `lib/competition-hero-images.ts` | 3行追加する対象とフォールバックの仕組み |

## 絶対にやってはいけないこと

1. **セクションの並び順を変えない。** シーズンページの順序は過去3回調整されており、いずれも `docs/decisions.md` に記録が無い。spec の「触ってはいけない過去の判断」表を必ず読むこと。特に**大会ガイドを折りたたまない**（commit `bd3fba1` で明示的に廃止済み。`collapsible` prop は既に存在しない）
2. **新規 DB クエリを増やさない。** 帯に出す「首位 / 進行 / 次節」は**すべて既存の `Promise.all` で取得済みのデータから導出できる**。`Promise.all` の要素数が変わったら設計ミス
3. **`listRoundsForCompetition` を呼ばない。** 内部で `listMatchesForCompetition` を再実行するため同じクエリが2回走る。`matches[].round` を直接使う
4. **`components/match-card.tsx` を触らない。** ラウンドページの表示は行リストに変えるが、`MatchCard` は他ページで使用中
5. **順位表ページの `h1` を消さない。** 視覚サイズを下げるだけ。SEO に効く
6. **決勝進出枠数をハードコードしない。** そのデータは DB に無い。モックの「上位2チームが決勝進出」は**例示であり実装対象外**

## 設計の中核: 深さの6段

「白 or 大会カラー」の2値ではなく、大会カラーの透明度で段階を作る。**濃さが情報を運ぶ**ようにすること。

| 段 | 用途 |
|---|---|
| L1 4.5% | 表の行ティント / ラウンドの交互行 |
| L2 9% | ホバー |
| L3 16% | 順位表の上位強調 |
| L4 ベタ | 日付ブロック |
| L5 暗色 | プール帯 / ラウンドのストリップ |

大会カラーは `getCompetitionFamilyColor(family)`（`lib/format/competition.ts`）。**大会が変われば6段まるごと色が変わる**ので、色をハードコードせず必ずこの関数から導出すること。

## 白文字とトークンの注意

ヒーローはスクリムの上に白文字を載せます。**`--color-ink-muted` 等の淡色トークンを白背景前提のまま流用しないでください。** これらは 2026-08-25 に WCAG AA を満たすよう暗くしたばかりで（PR #725）、暗い背景の上では逆に読めなくなります。暗色地の上では白系の不透明度（`text-white/70` 等）を使ってください。

## 画像について

3枚（`nations-championship` / `greatest-rivalry` / `lipovitan-challenge-cup`）は 2026-08-25 に生成・配置済みです。**ファイルを置いただけではコードから参照されません。** `COMPETITION_HERO_IMAGES` への3行追加が必須です。

画像が無いファミリーは `DEFAULT_COMPETITION_HERO` にフォールバックします。この経路を壊さないでください。

## 完了の定義

spec の「受け入れ条件」13項目をすべて満たすこと。特に:

- `git diff -- components/match-card.tsx` が**空**
- シーズンページの `Promise.all` の要素数が**変わっていない**
- `grep -rc "rounded-xl bg-white px-6 py-5 shadow-sm ring-1 ring-slate-200" app/c/` の合計が**3未満**（3ページ完全一致の解消）
- `pnpm lint` / `pnpm tsc --noEmit` / `pnpm test` / `pnpm build` が clean

## PR 本文に必ず含めること

- 3ページそれぞれの**変更前後のスクリーンショット**（320 / 768 / 1440px）。このタスクは視覚が成果物なので必須
- `round` が全件 `null` の大会（ツアー系）で進行度が非表示になることを確認した証跡
- `Promise.all` の差分（クエリが増えていないこと）
- `git diff --stat`
