# fix-venue-local-time-timezone

> 本 spec は `specs/p1-match-pages.md` の**現地時刻表示部分のみ**（L146 の表示仕様、L178 の `ianaTimezone?: string // 省略時は 'Europe/London' 等を呼び出し側で決める`）を改訂する。試合ページの他の仕様は有効なまま残す。

## 背景

2026-09-05 の監査（`docs/audits/gpt6-full-audit-2026-09-05.md` A-3 新規所見）で、**会場の現地時刻がほぼ全試合で誤っている**ことが実測された。

2026-09-06 に本番で再現を確認した。

```
https://www.trylinerugby.com/matches/f01f68e2-bdd6-47c8-8910-0ea37a382b0a
表示: 現地 2026-08-15 (Sat) 06:00 BST
会場: North Queensland Stadium, Townsville（クイーンズランド州、AEST = UTC+10、DST なし）
正:   現地 2026-08-15 (Sat) 15:00 AEST
```

### 原因

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

`:79` で `getVenueTimezone(match.homeTeam.slug)` として呼ばれ、`:187` で `現地 {formatKickoffLocal(match.kickoffAt, localTimezone)}` と表示される。

問題は 2 つある。

1. **辞書が欧州 6 か国分しかなく、それ以外はすべて `Europe/London` にフォールバックする。** 豪州・NZ・南アフリカ・日本・アルゼンチン・フィジー、およびすべてのクラブチーム（Premiership / URC / Top 14 / SRP / League One）が該当する
2. **キーが会場ではなくホームチームである。** 中立会場では原理的に正しい値を出せない

### 2 が致命的である理由: RWC 2027

本番データで確認した（2026-09-06）。同一会場 `North Queensland Stadium, Townsville` の `home_team` はこうなっている。

| kickoff | home_slug | away_slug |
|---|---|---|
| 2027-10-16 | spain | canada |
| 2027-10-15 | tonga | zimbabwe |
| 2027-10-09 | chile | hong-kong-china |
| 2027-10-03 | georgia | romania |
| 2026-08-15 | australia | japan |

**RWC 2027 は全 52 試合がオーストラリア開催の中立会場である。** ホームチームからの推定はこの大会で完全に破綻する。RWC 2027 は本プロダクトの North Star（`CLAUDE.md`「主要成功指標」）であり、その入口で全試合の現地時刻が誤るのは許容できない。

### 会場データの実態（本番実測 2026-09-06）

| 項目 | 値 |
|---|---|
| `matches` 総数 | 1,372 |
| `venue` が非 null | 1,338 |
| distinct `venue`（生） | 242 |
| distinct `venue`（`[n]` 除去後） | **216** |
| `[n]` 脚注を含む行 | 53 |
| 2026-01-01 以降の distinct `venue` | 154 |

`venue` は `matches` テーブルの `string | null` 列で、`lib/db/queries/matches.ts:48` 経由で `MatchListItem` に載り、`components/match-header.tsx:189` で既に表示されている。**プロパティの配線は追加不要である。**

形式は自由文字列で、都市名を含むものと含まないものが混在する。

```
"Aviva Stadium, Dublin"                         ← 都市あり
"Franklin's Gardens"                            ← 都市なし
"Prince Chichibu Memorial Rugby Ground (Tokyo)" ← 括弧内に都市
"North Queensland Stadium, Townsville[17]"      ← Wikipedia 脚注付き
```

**国・タイムゾーンを保持する列は存在しない。**

## スコープ

対象:
- `lib/format/venue-timezone.ts`（新規）: 会場文字列 → IANA タイムゾーンの解決。DB に触らない純関数
- `tests/format/venue-timezone.test.ts`（新規）
- `components/match-header.tsx`: `TEAM_TIMEZONES` / `getVenueTimezone` を削除し、新モジュールを使う。**ホームチームからの推定を完全に撤去する**
- 未知会場では現地時刻の行を出さない

対象外:
- **`matches` テーブルへの列追加・マイグレーション**。`venue` 文字列を権威として扱う。スキーマ変更は影響範囲が広く、本 spec の目的（誤表示を止める）には不要
- **`venue` データ自体の正規化・書き換え**（脚注 `[17]` を DB から消す等）。**DB への UPDATE を差分に含めないこと**。脚注は表示側で無視する
- `lib/format/kickoff.ts` の `formatKickoffLocal` の出力形式（`en-GB` ロケール、`YYYY-MM-DD (Ddd) HH:mm TZ`）の変更。**引数の既定値 `"Europe/London"` は削除してよい**が、出力形式は変えない
- JST 表示（`formatKickoffJst`）。触らない
- カレンダー・大会ハブ・OG 画像の時刻表示。`formatKickoffLocal` の呼び出しは `components/match-header.tsx:187` の 1 箇所のみである（`grep -rn --include='*.tsx' --include='*.ts' formatKickoffLocal app components lib` で確認済み）
- 監査 A-3 のその他の指摘（ページ内導線、見出し重複、チャット位置、出典対応、選手名表記、読了時間、paywall 計測）

## データモデル変更

**なし。** 既存の `matches.venue` を読むだけで、書き込みもマイグレーションも行わない。

## API サーフェス

なし。

## UI サーフェス

試合詳細ヘッダーの現地時刻行（`components/match-header.tsx:187`）。

| 状態 | 現在 | 変更後 |
|---|---|---|
| 会場が辞書にある | 現地 … BST（誤り） | 現地 … AEST（正） |
| 会場が辞書に無い | 現地 … BST（誤り） | **行そのものを出さない** |
| `venue` が null | 現地 … BST（誤り） | **行そのものを出さない** |
| 会場が日本国内 | 現地 … BST（誤り） | **行そのものを出さない**（JST 行と重複するため） |

**「不明」「確認中」等のプレースホルダを出さないこと。** 行を出さないのが正しい。JST は従来どおり常に表示されるので、読者が失うのは補助情報だけである。

会場名の表示（`:189`）は現状のまま維持する。

## LLM 連携

**なし。コスト $0。** 会場からタイムゾーンを LLM に推定させないこと。誤りが非決定的に混入し、本 spec の目的に反する。

## 変更詳細

### 1. `lib/format/venue-timezone.ts`（新規）

```
normalizeVenue(venue: string): string
  - Wikipedia 脚注 `[17]` `[9]` 等（/\[\d+\]/g）を除去
  - 前後の空白を trim、連続空白を 1 個に畳む
  - 大文字小文字を無視した比較ができる形にする

resolveVenueTimezone(venue: string | null): string | null
  - venue が null / 空文字 → null
  - normalizeVenue した結果が辞書にあれば IANA 文字列
  - 無ければ null（フォールバックしない）
```

辞書は会場文字列をキーとする定数とする。**各エントリに都市名と国名のコメントを付けること。**

```typescript
const VENUE_TIMEZONES: Record<string, string> = {
  "north queensland stadium, townsville": "Australia/Brisbane", // Townsville, QLD (no DST)
  "aviva stadium, dublin": "Europe/Dublin",                     // Dublin, Ireland
  // …
};
```

**確信を持てない会場は辞書に入れないこと。** 入れなければ現地行が出ないだけで、誤った時刻は出ない。**推測で埋めることは、この spec が直そうとしているバグそのものである。**

### 2. `components/match-header.tsx`

`TEAM_TIMEZONES` と `getVenueTimezone` を削除する。`match.homeTeam.slug` によるタイムゾーン推定を残さないこと。

`:79` を `resolveVenueTimezone(match.venue)` に置き換え、結果が `null` のとき `:187` の現地時刻行をレンダリングしない。

日本国内会場の扱い: 辞書上 `Asia/Tokyo` に解決された場合も現地行を出さない。JST 行と同一内容になるためである。**この判定は「解決結果が `Asia/Tokyo` か」で行い、会場名の日本語判定や国推定で行わないこと。**

### 3. カバレッジの取り扱い

216 会場すべてを本 PR で埋めることは求めない。**未マッピングは安全側に倒れる**（現地行が出ない）ため、段階的に増やせる。

ただし PR 本文に次を記載すること。

- 辞書に入れた会場数
- 2026-01-01 以降の試合が使う 154 会場のうち、何件をカバーしたか
- 意図的に入れなかった会場のうち代表的なものと、その理由（都市が特定できない等）

## 受け入れ条件

**テスト実行の条件**: `tests/format/` は `vitest.config.ts:16` の `exclude` に該当しない（同ディレクトリの `tests/format/kickoff.test.ts` が既定の `pnpm test` で実行されていることを確認済み）。したがって本 spec のテストは `pnpm test` に含まれる。**実行結果を PR 本文に貼ること。**

1. `resolveVenueTimezone("North Queensland Stadium, Townsville")` が `"Australia/Brisbane"` を返す
2. `resolveVenueTimezone("North Queensland Stadium, Townsville[17]")` が **同じ値**を返す（脚注正規化。本番に 53 行存在する）
3. `resolveVenueTimezone(null)` と `resolveVenueTimezone("")` が `null` を返す
4. 辞書に無い会場文字列（例: `"Nonexistent Stadium"`）で `null` を返す。**`"Europe/London"` を返さないこと**
5. `components/match-header.tsx` に `TEAM_TIMEZONES` と `getVenueTimezone` が存在しない。`homeTeam.slug` からタイムゾーンを導く経路がコード上に残っていない
6. **`match.venue` が null の試合で現地時刻行がレンダリングされない**ことを検証するテストがある
7. **辞書に無い会場の試合で現地時刻行がレンダリングされない**ことを検証するテストがある
8. `Asia/Tokyo` に解決される会場で現地時刻行がレンダリングされないことを検証するテストがある
9. **既存の欧州会場が退行していない**ことを検証するテストがある。少なくとも `Twickenham Stadium, London` → `Europe/London`、`Stade de France, Saint-Denis` → `Europe/Paris`、`Aviva Stadium, Dublin` → `Europe/Dublin`、`Stadio Olimpico, Rome` → `Europe/Rome` の 4 件
10. `formatKickoffLocal` の出力形式が変わっていない（`tests/format/kickoff.test.ts` が無改変で green）
11. JST 表示が変わっていない
12. **`matches` テーブルへの `UPDATE` / `INSERT` / マイグレーションが差分に含まれない**
13. LLM 呼び出し（`getOpenAIClient` / `MODELS`）が差分に含まれない
14. `pnpm lint` / `pnpm typecheck` / `pnpm test` が green。テスト結果を PR 本文に貼る
15. **本番相当での実測**: プレビュー URL で `/matches/f01f68e2-bdd6-47c8-8910-0ea37a382b0a` を開き、現地時刻行が `現地 2026-08-15 (Sat) 15:00 AEST` 相当（BST ではない）になっていることをスクリーンショットまたは DOM テキストで示す
16. **Owner の目視評価**: 現地行が消えた試合で、キックオフ情報が JST だけになっても不足に見えないこと。320 / 768 / 1440px で確認する

## 未解決の質問

**Owner が決めること。**

1. **辞書のカバレッジをどこまで本 PR に含めるか。** 216 会場すべてか、2026 年以降の 154 会場か、主要大会分のみか。未マッピングは安全側（現地行なし）に倒れるため、少なく始めて増やすことができる。**推奨は「確信を持てる範囲だけを入れ、残りは後続 PR」** で、本 spec の受け入れ条件はその方針で書いてある
2. **将来的に `venue_timezone` 列や会場マスタを持つか。** 216 件の辞書がコードに載ることの是非。本 spec では列を追加しないが、RWC 2027 に向けて会場情報（収容人数・都市・アクセス）を持つ判断をするなら、そのときに辞書を DB へ移すのが自然

**本 spec で解決しないと明示するもの**:

- **同名・改称された会場は解決できない。** `"CorpAcq Stadium"`（Sale の現名称）のようなスポンサー名の会場は、改称前後で別文字列になる。辞書に両方を入れない限り片方は現地行が出ない
- **現地行が出ない試合が増える。** これは意図した副作用である。**誤った時刻を出し続けるより望ましい**という判断で本 spec を採る
