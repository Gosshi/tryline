# fix-venue-footnote-display-leak

> GPT-6 監査 A-5 `/t/japan`（P1）の「会場の引用脚注 [9] が残る」部分。同項目の「別名 Lee/Seungsin Lee」は選手同一性の問題で `fix-player-name-ja-coverage.md` が扱う。**本 spec は会場表記だけを扱う。**

## 背景

Wikipedia の引用脚注が `matches.venue` にそのまま入り、**画面と構造化データの両方に出ている**（2026-09-09 本番実測）。

```
脚注を含む試合: 71 件 / 異なる会場表記: 55 種
```

実例:

```
Twickenham Stadium, London[9]        4 件
Murrayfield Stadium, Edinburgh[9]    4 件
Eden Park, Auckland[a]               6 件
Eden Park, Auckland[18][19]          2 件
Stadionul Arcul de Triumf, Bucharest[24][23]  1 件
Navigation Homes Stadium, Pukekohe[e][f]      1 件
```

数字脚注（`[9]`）・英字脚注（`[a]`）・複数脚注（`[18][19]`）が混在する。**同一会場が脚注違いで別表記になっている**（Eden Park が 3 種）。

### なぜ #775 で直っていないか

`lib/format/venue-timezone.ts:87-93` の `normalizeVenue` は脚注を除去するが、**`.toLowerCase()` しており照合キー専用**である。表示には使えない。

そして表示側は**生の `match.venue` をそのまま出している**。

```
components/match-header.tsx:181       {match.venue}
components/match-card.tsx:185         {match.venue}
components/calendar/week-schedule.tsx:214  {match.venue}
app/matches/[id]/page.tsx:325         name: match.venue      ← JSON-LD
```

**`app/matches/[id]/page.tsx:325` は JSON-LD の会場名である。** `"Twickenham Stadium, London[9]"` が構造化データとして検索エンジンに送られている。画面の見た目より、こちらのほうが重い。

## スコープ

対象:
- 会場名の**表示用**正規化関数を追加し、画面と JSON-LD の両方に適用する
- 上記 4 箇所の表示経路
- テスト

対象外:
- **`matches.venue` の DB 値そのものの書き換え**。取り込みのたびに戻る可能性があり、まず表示を直す。DB の修復は別途 Owner 判断
- `normalizeVenue`（照合キー用）の**挙動変更**。`resolveVenueTimezone` が依存しており、#775 で 510/669 件の現地時刻表示を実現した本体である。**触らない**
- 会場名の日本語化
- 取り込み側（スクレイパー）での脚注除去。**表示を直してから、必要なら別 spec**

## データモデル変更

なし。**読み取りと表示のみ。**

## API サーフェス

なし。

## UI サーフェス

会場名の表示。**脚注が消えるだけで、レイアウトは変わらない。**

## LLM 連携

なし。コスト $0。

## 変更詳細

表示用の関数を `lib/format/venue-timezone.ts` に追加する（会場表記の処理が既にあるファイル）。**`normalizeVenue` とは別の関数にすること。** 片方を直して両方の意味が変わる状態を作らない。

要件:
- `[9]` / `[a]` / `[18][19]` / `[e][f]` を除去する
- **`.toLowerCase()` しない。** 表示用なので原表記の大小を保つ
- 除去後の余分な空白を詰める
- **null / 空文字を受け取れること。** `match.venue` は nullable で、表示側は既に `{match.venue && (` でガードしている

`normalizeVenue` の正規表現 `/\[[^\]]*\]/g`（`:89`）は、`88a064f` で `/\[\d+\]/g` から修正され**英字脚注 `[a]`〜`[g]` を拾えるようになった**経緯がある。表示用でも同じ範囲を扱うこと。

## 受け入れ条件

1. 表示用の正規化関数が `lib/format/venue-timezone.ts` に追加され、`normalizeVenue` とは別の関数である
2. **`normalizeVenue` に差分が無い**
3. **`resolveVenueTimezone` に差分が無い**
4. 数字脚注 `Twickenham Stadium, London[9]` → `Twickenham Stadium, London` を検証するテストがある
5. 英字脚注 `Eden Park, Auckland[a]` → `Eden Park, Auckland` を検証するテストがある
6. 複数脚注 `Eden Park, Auckland[18][19]` と `Navigation Homes Stadium, Pukekohe[e][f]` を検証するテストがある
7. **脚注が無い会場名が変化しない**ことを検証するテストがある
8. **`null` と空文字を渡しても例外にならない**ことを検証するテストがある
9. **大小が保たれる**ことを検証するテストがある（`.toLowerCase()` していない証拠）
10. `components/match-header.tsx` / `components/match-card.tsx` / `components/calendar/week-schedule.tsx` の 3 箇所に適用されている
11. **`app/matches/[id]/page.tsx:325` の JSON-LD に適用されている**ことを検証するテストがある
12. **現地時刻の表示件数に差分が無い。** #775 の 510/669 件を壊していない
13. DB への `UPDATE` / `INSERT` / マイグレーションが差分に含まれない
14. `pnpm lint` / `pnpm typecheck` / `pnpm test` が green

**テストの置き場所**: `tests/format/` と `tests/app/` 配下（`exclude` 非該当。確認済み）。結果を PR 本文に貼る。

## 未解決の質問

なし。

**本 spec で解決しないと明示するもの**:

- **DB の 71 件は汚れたまま。** 表示だけ直る。次の取り込みでも脚注付きで入り続ける
- **同一会場の表記ゆれ（Eden Park の 3 種）は集約されない。** 脚注が消えれば表示上は同じ文字列になるが、DB 上は別値のままである
