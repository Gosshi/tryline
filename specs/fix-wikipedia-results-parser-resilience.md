# fix-wikipedia-results-parser-resilience

> `specs/fix-premiership-newcastle-alias.md`（PR #785、マージ済み）の続き。同 spec がプレミアシップの取り込み経路に入れた「未知名はその試合だけ飛ばして報告する」を **Top 14 の results パーサにも適用**し、あわせてプレミアシップ results パーサのセクション判定を直す。

## 背景

2026-09-07、#785 のマージ後に `scripts/import-premiership-results.ts 2025-26` を実行したところ、**1 件も取り込めなかった**。

```
Error: No finished Premiership regular season matches were found.
    at parsePremiershipResultsHtml (lib/scrapers/wikipedia-premiership-results.ts:130)
```

原因を切り分けるため、Wikipedia の実ページに各パーサを当てて件数を測った。

| パーサ | シーズン | 件数 | 備考 |
|---|---|---|---|
| `scrapers/premiership-results` | 2025-26 | **throw** | "No finished ... matches were found" |
| `scrapers/top-14-results` | 2025-26 | **throw** | `Unknown Top 14 team name: Provence` |
| `sources/premiership-live` | 2026-27 | **90** | 同じ Parsoid ページから正常に取得 |
| `sources/urc-live` | 2026-27 | 0 | 本 spec の対象外（要調査） |
| `sources/top-14-live` | 2026-27 | HTTP 404 | ページ未作成。本 spec の対象外 |

### Parsoid の `<section>` 入れ子は原因ではない

当初「Wikipedia が Parsoid 出力に移行し、`<section>` 入れ子で兄弟遡りが届かなくなった。23 ファイルに波及する」と見立てたが、**誤りだった。`sources/premiership-live` は同じページから 90 件を正しく取れている。**

差は 1 箇所である。live 側（`lib/ingestion/sources/wikipedia-premiership.ts:117-136`）は `prev()` を遡って**節見出しだけ**を探す。results 側は加えて `isWithinRegularSeason`（`lib/scrapers/wikipedia-premiership-results.ts:112-127`）で `h2#Regular_season` を要求する。

実ページの構造はこうである。

```html
<section aria-labelledby="Regular_season">
  <div class="mw-heading mw-heading2"><h2 id="Regular_season">Regular season</h2></div>
  <section aria-labelledby="Results">
    <section aria-labelledby="Round_1">
      <div class="mw-heading mw-heading3"><h3 id="Round_1">…</h3></div>
      <div class="vevent summary">…</div>   ← 試合ブロック
```

試合ブロックの兄弟には `h3` しかない。`h2` は 2 階層上の `<section>` の中にあり、`prev()` では永久に届かない。結果 **93 件の試合ブロックが全部除外される**。

**`<section>` は `aria-labelledby` を持っている**（`Regular_season` / `Results` / `Round_1` …）。祖先を辿れば判定できる。

### Top 14 は #785 と同じ型の別名漏れ

`lib/scrapers/wikipedia-top-14-results.ts:70` は未知名で `throw` する。#785 でプレミアシップから取り除いた挙動が、こちらには残っている。

対応表に **Provence が無い**。さらに本番の `teams` にも Provence が存在しない（Top 14 に登場する 15 チームは bayonne / bordeaux-begles / castres / clermont / grenoble / la-rochelle / lyon / montpellier / pau / perpignan / racing-92 / stade-francais / toulon / toulouse / vannes）。**対応表だけでなくチームレコード自体が未登録である。**

## スコープ

対象:
- `lib/scrapers/wikipedia-premiership-results.ts`: `isWithinRegularSeason` が Parsoid の `<section>` 入れ子を越えられるようにする
- `lib/scrapers/wikipedia-top-14-results.ts`: 未知名を `throw` せず、その試合だけ飛ばして件数・名称・試合情報を戻り値で報告する（#785 と同じ形）
- Top 14 のチーム名対応表を共有モジュールへ切り出す（#785 の `lib/ingestion/sources/premiership-team-slugs.ts` と同じ構成）
- 呼び出し側がスキップ件数を標準出力に出す
- テスト

対象外:
- **`teams` への Provence の追加**。チームレコードの新規登録は取り込みとは別の判断で、**Codex は DB に書き込まない**（下記「未解決の質問」）
- **`sources/urc-live` が 0 件になる件**。要調査で、wikitext が主経路のため実害の形が違う。別 spec
- **`sources/top-14-live` の HTTP 404**。ページ名の問題で、Top 14 は節単位取り込み（D024）。別途確認
- **欠落試合の再取り込み**。修正後に Owner が実行する。**Codex は本番取り込みを実行しない**
- `lib/ingestion/sources/wikipedia-premiership.ts`（live 側）。**正しく動いているので触らない**
- 他の 20 本の Wikipedia パーサ。**実測していないものを予防的に直さない**
- DB への `UPDATE` / `INSERT` / マイグレーション

## データモデル変更

なし。読み取りのみ。

## API サーフェス / UI サーフェス

なし。

## LLM 連携

なし。コスト $0。

## 変更詳細

### 1. セクション判定

`isWithinRegularSeason` を、`<section>` の入れ子を越えて祖先を辿れる形にする。

`aria-labelledby="Regular_season"` を持つ祖先 `<section>` があるかを見るのが素直である。**ただし Parsoid でないフラットな HTML（`<section>` が無い出力）でも動くこと。** 現行の兄弟遡りをフォールバックとして残すか、両方に対応する実装にするかは実装者の判断でよい。

**live 側（`wikipedia-premiership.ts`）を参照実装にしないこと。** あちらは `Regular_season` の判定自体を持たない。ここで必要なのは「通常節に限る」判定であり、live 側には無い要件である。

### 2. Top 14 の未知名処理

#785 が `lib/ingestion/sources/premiership-team-slugs.ts` で採った形をそのまま適用する。

- 対応表を共有モジュールへ切り出す
- `resolveXxxTeamSlug` は未知名で `null` を返す
- 呼び出し側は該当試合を飛ばし、`{ round, unknownTeamNames, ... }` 相当を戻り値に含める
- スキップ件数を標準出力に出す

**Provence を対応表に足すだけでは足りない。** `teams` に Provence が無いため、別名を足しても解決先の slug が存在しない。**未知名として飛ばし、件数を報告する**のが本 spec の到達点である。

## 受け入れ条件

**テスト実行の条件**: `tests/scrapers/` は `vitest.config.ts:16` の `exclude` に該当しない。**既定の `pnpm test` で実行される。** 結果を PR 本文に貼る。

1. **Parsoid の `<section>` 入れ子を含む fixture** で `parsePremiershipResultsHtml` が通常節の試合を返すことを検証するテストがある。fixture は実ページの構造（`<section aria-labelledby="Regular_season">` → `<section aria-labelledby="Results">` → `<section aria-labelledby="Round_1">` → `div.vevent.summary`）を再現すること
2. **フラットな HTML**（`<section>` なし、見出しが試合ブロックの兄弟）でも従来どおり動くことを検証するテストがある
3. **通常節でない試合ブロック**（プレーオフ節など）が除外されることを検証するテストがある。**この判定を失うと本 spec は目的を達しない**
4. `parseTop14ResultsHtml` が未知名で `throw` せず、その試合だけ飛ばすことを検証するテストがある
5. 飛ばした件数と未知名が戻り値に含まれることを検証するテストがある
6. Top 14 の対応表が共有モジュールに集約され、`lib/scrapers/wikipedia-top-14-results.ts` と `lib/ingestion/sources/wikipedia-top-14.ts` の双方が同じ定義を参照している。**両表の差分を全件比較し、結果を PR 本文に書くこと**
7. `lib/ingestion/sources/wikipedia-premiership.ts` に差分が無い
8. **DB への `UPDATE` / `INSERT` / マイグレーションが差分に含まれない**
9. LLM 呼び出しが差分に含まれない
10. `pnpm lint` / `pnpm typecheck` / `pnpm test` が green

## 未解決の質問

**Owner が決めること（実装をブロックしない）:**

1. **`teams` に Provence を追加するか。** 2025-26 の Top 14 に昇格したクラブだが本番に未登録。追加するなら `slug` / `name` / `name_ja` / `lib/format/team-identity.ts` の配色まで揃える必要があり、別作業になる
2. **プレミアシップ 2025-26 の 18 試合をいつ再取り込みするか。** 本 spec の 1 が直れば `scripts/import-premiership-results.ts 2025-26` が動くようになる。実行は Owner

**本 spec で解決しないと明示するもの**:

- **`sources/urc-live` が 0 件を返す件は直らない。** 別 spec。wikitext が主経路なので「試合が消える」のではなく「イベントが取れない」形の実害と見られるが、未確認
- **他の Wikipedia パーサは測っていない。** 今回測ったのは 5 本だけである。**「Wikipedia パーサを直した」と一般化して完了報告しないこと**
- **Provence の試合は取り込めないままである。** `teams` に無いので、飛ばした件数として報告されるだけになる
