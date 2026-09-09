仕様書 `specs/fix-venue-footnote-display-leak.md` を実装してください。**先に全文を読んでください。**

## 何が問題か

Wikipedia の引用脚注が `matches.venue` に入り、**画面と JSON-LD の両方に出ています**（2026-09-09 本番実測）。

```
脚注を含む試合: 71 件 / 異なる会場表記: 55 種

Twickenham Stadium, London[9]                  4 件
Eden Park, Auckland[a]                         6 件
Eden Park, Auckland[18][19]                    2 件
Navigation Homes Stadium, Pukekohe[e][f]       1 件
Stadionul Arcul de Triumf, Bucharest[24][23]   1 件
```

数字・英字・複数の脚注が混在し、同一会場が脚注違いで別表記になっています（Eden Park が 3 種）。

### #775 で直っていない理由

`lib/format/venue-timezone.ts:87-93` の `normalizeVenue` は脚注を除去しますが、**`.toLowerCase()` しており照合キー専用**です。表示には使えません。

表示側は**生の `match.venue`** を出しています。

```
components/match-header.tsx:181              {match.venue}
components/match-card.tsx:185                {match.venue}
components/calendar/week-schedule.tsx:214    {match.venue}
app/matches/[id]/page.tsx:325                name: match.venue      ← JSON-LD
```

**`app/matches/[id]/page.tsx:325` は JSON-LD の会場名です。** `"Twickenham Stadium, London[9]"` が構造化データとして検索エンジンに送られています。**画面の見た目よりこちらのほうが重いです。**

## やること

表示用の正規化関数を `lib/format/venue-timezone.ts` に追加し、上記 4 箇所に適用してください。

- **`normalizeVenue` とは別の関数にすること。** 片方を直して両方の意味が変わる状態を作らないでください
- `[9]` / `[a]` / `[18][19]` / `[e][f]` を除去する
- **`.toLowerCase()` しない。** 表示用なので原表記の大小を保ちます
- **`null` / 空文字を受け取れること。** `match.venue` は nullable です

`normalizeVenue` の正規表現 `/\[[^\]]*\]/g`（`:89`）は `88a064f` で `/\[\d+\]/g` から修正され、英字脚注 `[a]`〜`[g]` を拾えるようになった経緯があります。表示用でも同じ範囲を扱ってください。

## やってはいけないこと

- **`normalizeVenue` を変えること。** `resolveVenueTimezone` が依存しており、#775 で 510/669 件の現地時刻表示を実現した本体です
- **`resolveVenueTimezone` を変えること**
- **`matches.venue` の DB 値を書き換えること。** 取り込みのたびに戻る可能性があります。まず表示を直します
- 取り込み側（スクレイパー）を変えること。必要なら別 spec です
- 会場名を日本語化すること
- DB への `UPDATE` / `INSERT` / マイグレーション

## 完了の定義

受け入れ条件 1〜14 を満たすこと。特に:

- **`normalizeVenue` と `resolveVenueTimezone` に差分が無い**（条件 2・3）
- 数字 `[9]` / 英字 `[a]` / 複数 `[18][19]` `[e][f]` の 3 形式（条件 4〜6）
- **脚注が無い会場名が変化しない**（条件 7）
- **`null` と空文字で例外にならない**（条件 8）
- **大小が保たれる**＝`.toLowerCase()` していない証拠（条件 9）
- **JSON-LD に適用されている**（条件 11）
- **現地時刻の表示件数に差分が無い。** #775 の 510/669 件を壊していない（条件 12）

テストは `tests/format/` と `tests/app/` 配下へ（`exclude` 非該当。確認済み）。

git worktree で `origin/main` から切ってください（`docs/runbooks/codex-worktree.md`）。

**DB の 71 件は汚れたままです。** 表示だけが直ります。「会場データを修正した」と報告しないでください。

仕様と現状が食い違うと判断したら、実装を止めて指摘してください。
