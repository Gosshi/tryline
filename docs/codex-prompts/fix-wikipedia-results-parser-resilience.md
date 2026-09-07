仕様書 `specs/fix-wikipedia-results-parser-resilience.md` を実装してください。**先に全文を読んでください。**

これは PR #785（プレミアシップのニューカッスル別名）の続きです。あちらで入れた「未知名はその試合だけ飛ばして報告する」を Top 14 にも広げ、あわせてセクション判定を直します。

## 発端

#785 のマージ後に `scripts/import-premiership-results.ts 2025-26` を実行したら、1 件も取り込めませんでした。

```
Error: No finished Premiership regular season matches were found.
    at parsePremiershipResultsHtml (lib/scrapers/wikipedia-premiership-results.ts:130)
```

原因を切り分けるため、Wikipedia の実ページに 5 本のパーサを当てて件数を測りました。

| パーサ | シーズン | 件数 |
|---|---|---|
| `scrapers/premiership-results` | 2025-26 | **throw**（0 件） |
| `scrapers/top-14-results` | 2025-26 | **throw**（`Unknown Top 14 team name: Provence`） |
| `sources/premiership-live` | 2026-27 | **90** |
| `sources/urc-live` | 2026-27 | 0（対象外） |
| `sources/top-14-live` | 2026-27 | HTTP 404（対象外） |

## Parsoid の section は原因ではありません

**最初「Wikipedia が Parsoid 出力になり、23 ファイルに波及する」と見立てましたが誤りでした。** `sources/premiership-live` は同じページから 90 件を正しく取れています。予防的に他のパーサを触らないでください。

差は 1 箇所です。

```
lib/ingestion/sources/wikipedia-premiership.ts:117-136  （動く）
  prev() を遡って節見出しだけを探す

lib/scrapers/wikipedia-premiership-results.ts:112-127    （動かない）
  加えて isWithinRegularSeason で h2#Regular_season を要求する
```

実ページの構造です。

```html
<section aria-labelledby="Regular_season">
  <div class="mw-heading mw-heading2"><h2 id="Regular_season">Regular season</h2></div>
  <section aria-labelledby="Results">
    <section aria-labelledby="Round_1">
      <div class="mw-heading mw-heading3"><h3 id="Round_1">…</h3></div>
      <div class="vevent summary">…</div>   ← 試合ブロック
```

試合ブロックの兄弟には `h3` しかありません。`h2` は 2 階層上の `<section>` の中にあり、`prev()` では届きません。**93 件の試合ブロックが全部除外されます。**

`<section>` は `aria-labelledby` を持っています（`Regular_season` / `Results` / `Round_1` …）。祖先を辿れば判定できます。

**live 側を参照実装にしないでください。** あちらは `Regular_season` の判定自体を持ちません。ここで必要なのは「通常節に限る」判定で、live 側には無い要件です。**この判定を失うと修正の意味がなくなります**（プレーオフが通常節に混ざる）。

**フラットな HTML（`<section>` が無い出力）でも動くこと。** 兄弟遡りをフォールバックに残すか両対応にするかは判断にお任せします。

## Top 14 は #785 と同じ型です

`lib/scrapers/wikipedia-top-14-results.ts:70` が未知名で `throw` します。#785 でプレミアシップから取り除いた挙動がこちらに残っています。

`lib/ingestion/sources/premiership-team-slugs.ts` と同じ構成で、Top 14 の対応表を共有モジュールへ切り出してください。`resolveXxxTeamSlug` は未知名で `null` を返し、呼び出し側が試合を飛ばして件数・名称・試合情報を戻り値に含めます。

### Provence を対応表に足すだけでは足りません

本番の `teams` に **Provence が存在しません**。Top 14 に登場するのは 15 チームです。

```
bayonne, bordeaux-begles, castres, clermont, grenoble, la-rochelle,
lyon, montpellier, pau, perpignan, racing-92, stade-francais,
toulon, toulouse, vannes
```

別名を足しても解決先の slug がありません。**未知名として飛ばし、件数を報告する**のが到達点です。`teams` への追加は Owner の判断で、対象外です。

## 触るファイル

```
lib/scrapers/wikipedia-premiership-results.ts
lib/scrapers/wikipedia-top-14-results.ts
lib/ingestion/sources/wikipedia-top-14.ts        （共有モジュールの利用者に）
（新規）Top 14 のチーム名対応表モジュール
```

## やってはいけないこと

- **`lib/ingestion/sources/wikipedia-premiership.ts` を触ること。** 正しく動いています
- **測っていない他の 20 本のパーサを予防的に直すこと**
- **`teams` への `INSERT`。** Provence を登録しないでください
- DB への `UPDATE` / `INSERT` / マイグレーション
- 本番取り込みの実行。18 試合の再取り込みは Owner が行います
- LLM を呼ぶこと

## テストについて

`tests/scrapers/` は `vitest.config.ts:16` の `exclude` に該当しないため、**既定の `pnpm test` で実行されます。** 結果を PR 本文に貼ってください。

fixture は実ページの構造を再現してください。`<section aria-labelledby="Regular_season">` → `<section aria-labelledby="Results">` → `<section aria-labelledby="Round_1">` → `div.vevent.summary` の入れ子です。

## 完了の定義

受け入れ条件 1〜10 を満たすこと。特に:

- Parsoid の入れ子 fixture で通常節の試合が返る（条件 1）
- フラット HTML でも従来どおり動く（条件 2）
- **通常節でない試合ブロックが除外され続ける**（条件 3）
- Top 14 が未知名で throw しない（条件 4）
- 両表の差分を全件比較して PR 本文に書く（条件 6）
- `wikipedia-premiership.ts` に差分が無い（条件 7）

## 作業の進め方

git worktree で分けてください。手順は `docs/runbooks/codex-worktree.md` です。`origin/main` から切ってください。

仕様と現状が食い違う、または受け入れ条件どうしが両立しないと判断したら、**実装を止めて指摘してください。** 今日この spec 群で 4 回、あなたの指摘で手戻りを防げています。
