# Codex 指示書: 放送情報取り込みの通知を意味のあるものにする

仕様書: `specs/fix-broadcast-ingest-signal.md`
受け入れ条件（1〜13）は仕様書を正とする。ここでは繰り返さない。

## 直したいこと

`cron-ingest-broadcasts` が 10 日連続 HTTP 500。**クラッシュではなく設計どおり**で、
「JRFU に今後の試合の放送情報が 1 件も無い」ときに 500 になる。

JRFU は日本代表戦しか載せないため、日本代表戦の放送欄が全部空の期間は必ず赤になる。
**赤が常態なので信号として機能せず、10 日間誰も気づかなかった。**

そして今、**11月の日本代表 3 試合（11/08 ウェールズ・11/15 イングランド・11/21 スコットランド）の
放送情報が JRFU に載ったかどうかを、この仕組みでは判別できない。**

## 触るファイル

- `app/api/cron/ingest-broadcasts/route.ts`
- `lib/broadcasts/ingest.ts`
- `lib/llm/notify.ts`（`notifyBroadcastIngestReport`）
- `tests/api/ingest-broadcasts.test.ts`
- `tests/broadcasts/ingest.test.ts`

**`lib/scrapers/jrfu-match-broadcasts.ts` は触らない。**
2026-09-22 に実データで検証し、パーサと日付照合は正常と確認済み
（`dateLabel = "11.07 Sat"` → 許容日付 `{11/07, 11/08}` で DB の 11/08 JST と一致する）。

## 修正箇所（2026-09-22 実測の行番号。main 基準）

| 場所 | 現状 |
|---|---|
| `route.ts:24-26` | `hasRemainingWork` と `status` の判定 |
| `ingest.ts:347-349` | `fourteenDaysLater` による欠損監視の絞り込み |
| `ingest.ts:333` | 個別ページの処理失敗が `console.error` だけで結果に残らない |
| `ingest.ts:143-145` | **`isJapanMatch` は既に存在する**（`:286` で使用中）。新設不要 |

## 設計の要点

### 500 は技術障害のときだけ

| 状態 | HTTP |
|---|---|
| 成功・変更なし | 200 |
| 日本代表戦の放送欄が正常に空 | 200 |
| 日本代表戦の放送行が新規追加／変更 | 200 |
| 未知サービス、候補0件・複数件で紐付け不可 | 200（要確認として可視化） |
| **取得失敗・解析失敗・DB失敗・通知送信失敗** | **500** |

**「放送がまだ発表されていない」は正常。** 技術障害と区別する。

### 取得範囲は変えない。欠損監視だけ絞る

`loadScheduledMatches` の範囲（現在時刻〜一覧の年の年末）は**維持する**。
ここを狭めると、14 日より先にある 11月の放送情報を取り込めなくなる。

絞るのは `matchesStillMissing` の判定だけ。既存の `isJapanMatch` を使って
**日本代表戦かつ 14 日以内**に限定する。

クラブ大会は JRFU が載せないので永久に埋まらない。
現在 14 日以内で欠損しているのは URC 16・Premiership 10・Top 14 7 の計 33 試合だが、
**これらを毎日警告する意味がない。**

### 変化検知は既存実行の中でやる。新規ジョブを作らない

- 比較キー: 試合ID × 正規化サービス名。比較値: `kind` と `url`
- **`verified_at` だけの更新は変化と数えない。** 同じ候補の毎日 upsert を毎日「新規」と通知しない
- 通知するのは「初めて視聴先が入った試合」「サービス追加」「`url`/`kind` 変更」
- **JRFU 側から案内が消えても自動削除しない。** Owner の再確認対象として通知する。
  空欄は提供終了の証拠ではない
- 永続ハッシュ表や新しい監視サービスは不要。登録前の既存 DB 行と取得結果を比較すれば足りる

## 既存テストの巻き添え（必ず直す）

**`tests/api/ingest-broadcasts.test.ts:69-96`** に
`it.each([...])("returns 500 when nothing linked and there is $name", ...)` があり、
`expect(response.status).toBe(500)` を assert している。ケースは2つ。

- `unlinkedPages: [{ dateLabel: "11.07 Sat" }]`
- `matchesStillMissing: [{ matchId: "match-1" }]`

**本変更でどちらも 200 になるので、このテストは必ず落ちる。**
新しい意味に沿って書き直すこと（技術障害で 500、それ以外は 200）。
**テストを削除して済ませない。**

`tests/broadcasts/ingest.test.ts` は 14 件あり、`linked` / `unlinkedPages` /
`matchesStillMissing` を assert している。`matchesStillMissing` の意味が変わるので影響を確認すること。

## 入出力の例（形のみ。実データではない）

日本代表戦が14日以内にあり未発表:

```
HTTP 200
{ "status": "ok", "result": { "linked": [], "matchesStillMissing": [
    { "matchId": "...", "label": "Japan v ...", "kickoffAt": "..." } ], ... } }
→ 通知: 当該試合を要確認として1件
```

クラブ大会のみ欠損:

```
HTTP 200
→ 欠損警告なし（matchesStillMissing は空）
```

JRFU の取得が失敗:

```
HTTP 500
→ 技術障害として通知。部分成功していても失敗を隠さない
```

## やってはいけないこと

- `loadScheduledMatches` の取得範囲を狭めること。**11月分が取り込めなくなる**
- 欠損判定を単純に全部 200 に変えて、取得失敗まで隠してしまうこと
- `console.error` のまま個別ページの失敗を結果に残さないこと
- `verified_at` の更新を「変化」として通知すること
- JRFU から案内が消えた行を自動削除すること
- `tests/api/ingest-broadcasts.test.ts` の 500 テストを削除すること
- `lib/scrapers/jrfu-match-broadcasts.ts` を直すこと。パーサは正常
- 新規テストを、修正前でも通る形で書くこと

## 完了の定義

- 仕様書の受け入れ条件 1〜13 をすべて満たす
- **AC 1 / 2 / 3 / 5 のテストが修正前のコードで落ちることを先に確認**し、
  どう落ちたかを PR 本文に書く
- 書き直した既存テスト（`tests/api/ingest-broadcasts.test.ts:69-96` を含む）を PR 本文に列挙する
- `pnpm vitest run tests/api tests/broadcasts` が全緑
- `pnpm tsc --noEmit` / `pnpm lint` が通る
- **spec から逸脱した場合は PR 本文の "Intentional deviations" に必ず書く。**
  #850 で spec の値を変えた判断が正しかったのに "None" と書かれ、検算するまで気づけなかった
- `gh pr checks` で CI の緑を確認してから完了報告する
