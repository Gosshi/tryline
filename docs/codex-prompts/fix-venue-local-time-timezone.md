仕様書 `specs/fix-venue-local-time-timezone.md` を実装してください。**先に全文を読んでください。**

## 何を直すか

**会場の現地時刻がほぼ全試合で誤っています。** 本番で確認しました（2026-09-06）。

```
https://www.trylinerugby.com/matches/f01f68e2-bdd6-47c8-8910-0ea37a382b0a
表示: 現地 2026-08-15 (Sat) 06:00 BST
会場: North Queensland Stadium, Townsville（クイーンズランド州、UTC+10、DST なし）
正:   現地 2026-08-15 (Sat) 15:00 AEST
```

## 原因は特定済みです

`components/match-header.tsx:26-36`。

```typescript
const TEAM_TIMEZONES: Record<string, string> = {
  england: "Europe/London",  france: "Europe/Paris",
  ireland: "Europe/Dublin",  italy: "Europe/Rome",
  scotland: "Europe/London", wales: "Europe/London",
};

function getVenueTimezone(teamSlug: string) {
  return TEAM_TIMEZONES[teamSlug] ?? "Europe/London";
}
```

`:79` で `getVenueTimezone(match.homeTeam.slug)` として呼ばれ、`:187` で表示されます。

問題は 2 つです。

1. 辞書が欧州 6 か国分しかなく、**それ以外はすべて `Europe/London` にフォールバック**します。豪州・NZ・南アフリカ・日本・アルゼンチン・フィジー、および Premiership / URC / Top 14 / SRP / League One の全クラブが該当します
2. **キーが会場ではなくホームチームです。** 中立会場では原理的に正しい値を出せません

### 2 が致命的な理由

本番データで確認しました。同一会場 `North Queensland Stadium, Townsville` の `home_team` はこうです。

| kickoff | home_slug | away_slug |
|---|---|---|
| 2027-10-16 | spain | canada |
| 2027-10-15 | tonga | zimbabwe |
| 2027-10-09 | chile | hong-kong-china |
| 2027-10-03 | georgia | romania |

**RWC 2027 は全 52 試合が中立会場です。** ホームチーム推定はこの大会で完全に破綻します。

## 設計

`match.venue` を権威にします。**`matches.venue` は既に `MatchListItem` に載っており（`lib/db/queries/matches.ts:48`）、`components/match-header.tsx:189` で表示済みです。props の配線は追加不要です。**

新規 `lib/format/venue-timezone.ts` に純関数を置きます。

```
normalizeVenue(venue: string): string
  - Wikipedia 脚注 /\[\d+\]/g を除去（本番に 53 行あります）
  - trim、連続空白を 1 個に、大小無視の比較形へ

resolveVenueTimezone(venue: string | null): string | null
  - null / 空文字 → null
  - 辞書にあれば IANA 文字列
  - 無ければ null（フォールバックしない）
```

`components/match-header.tsx` は `TEAM_TIMEZONES` と `getVenueTimezone` を削除し、`resolveVenueTimezone(match.venue)` を使います。**結果が `null` のときは現地時刻行そのものをレンダリングしません。**

`Asia/Tokyo` に解決された場合も行を出しません（JST 行と同一内容になるため）。**この判定は「解決結果が `Asia/Tokyo` か」で行い、会場名の日本語判定や国推定で行わないでください。**

## 会場データの実態（本番実測 2026-09-06）

| 項目 | 値 |
|---|---|
| `venue` が非 null | 1,338 / 1,372 |
| distinct（生） | 242 |
| distinct（`[n]` 除去後） | **216** |
| `[n]` 脚注を含む行 | 53 |
| 2026-01-01 以降の distinct | 154 |

自由文字列で、都市名の有無が混在します。

```
"Aviva Stadium, Dublin"                         ← 都市あり
"Franklin's Gardens"                            ← 都市なし
"Prince Chichibu Memorial Rugby Ground (Tokyo)" ← 括弧内に都市
"North Queensland Stadium, Townsville[17]"      ← 脚注付き
```

**国・タイムゾーンを持つ列は存在しません。**

## 辞書を推測で埋めないでください

**確信を持てない会場は辞書に入れないでください。** 入れなければ現地行が出ないだけですが、間違った値を入れれば、この spec が直そうとしているバグそのものになります。

216 件すべてを本 PR で埋める必要はありません。未マッピングは安全側に倒れます。ただし PR 本文に次を書いてください。

- 辞書に入れた会場数
- 2026-01-01 以降が使う 154 会場のうち何件をカバーしたか
- 意図的に入れなかった代表例とその理由

各エントリに都市名と国名のコメントを付けてください。

```typescript
const VENUE_TIMEZONES: Record<string, string> = {
  "north queensland stadium, townsville": "Australia/Brisbane", // Townsville, QLD (no DST)
  "aviva stadium, dublin": "Europe/Dublin",                     // Dublin, Ireland
};
```

## 触るファイル

```
lib/format/venue-timezone.ts            （新規）
tests/format/venue-timezone.test.ts     （新規）
components/match-header.tsx
```

`formatKickoffLocal` の呼び出しは `components/match-header.tsx:187` の **1 箇所のみ**です（`grep -rn --include='*.tsx' --include='*.ts' formatKickoffLocal app components lib` で確認済み）。カレンダー・大会ハブ・OG 画像には波及しません。

## やってはいけないこと

- **`matches` テーブルへの `UPDATE` / `INSERT` / マイグレーション。** `venue` の脚注 `[17]` を DB から消さないでください。表示側で無視します
- **列の追加。** `venue_timezone` 等を作らないでください
- **LLM で会場からタイムゾーンを推定すること。** 非決定的な誤りが混入します。コスト $0 の決定論処理にしてください
- `lib/format/kickoff.ts` の `formatKickoffLocal` の**出力形式**を変えること（`en-GB`、`YYYY-MM-DD (Ddd) HH:mm TZ`）。**引数の既定値 `"Europe/London"` は削除してかまいません**
- JST 表示（`formatKickoffJst`）を触ること
- 現地行の代わりに「不明」「確認中」等のプレースホルダを出すこと。**行を出さないのが正解です**

## テストについて

`tests/format/` は `vitest.config.ts:16` の `exclude` に該当しません。同ディレクトリの `tests/format/kickoff.test.ts` が既定の `pnpm test` で実行されていることを確認済みです。**したがってこの spec のテストは `pnpm test` に含まれます。** 実行結果を PR 本文に貼ってください。

## 完了の定義

受け入れ条件 1〜16 をすべて満たすこと。特に:

- 辞書に無い会場で `"Europe/London"` を返さない（条件 4）
- `venue` が null / 辞書に無い / `Asia/Tokyo` の 3 ケースで現地行が出ない（条件 6・7・8）
- **既存の欧州会場が退行していない**（条件 9。`Twickenham Stadium, London` / `Stade de France, Saint-Denis` / `Aviva Stadium, Dublin` / `Stadio Olimpico, Rome` の 4 件）
- プレビュー URL の `/matches/f01f68e2-bdd6-47c8-8910-0ea37a382b0a` が `AEST` 表示になっている実測（条件 15）

Owner の目視確認（現地行が消えた試合で JST だけでも不足に見えないか、320 / 768 / 1440px）は PR 作成後に Owner が行います。

## 未解決の質問について

仕様書末尾に Owner 判断事項が 2 つありますが、**どちらも実装をブロックしません。**

1 の「辞書のカバレッジ」は、受け入れ条件が「確信を持てる範囲だけを入れる」方針で書いてあるのでそのまま進めてください。2 の「将来 DB へ移すか」は本 PR の対象外です。
