# Preview生成ウィンドウ修正：47–49h窓はcronスケジュールと噛み合わない

## 背景

`match_content` の preview が一件も生成されていない。原因はpreviewウィンドウとcronスケジュールの不整合。

### 現状

`lib/cron/orchestrate.ts` のpreviewウィンドウ定数:

```
PREVIEW_WINDOW_START_HOURS = 47
PREVIEW_WINDOW_END_HOURS   = 49
```

→ キックオフの 47〜49時間前（= 2時間の窓）にのみ生成を試みる。

GitHub Actions cronスケジュール（`.github/workflows/cron-orchestrate.yml`）:

```
0 12 * * *      毎日 12:00 UTC
0 15 * * 6,0    土日 15:00 UTC
```

### なぜ噛み合わないか

SRP（Super Rugby Pacific）の試合例: Chiefs vs Highlanders、キックオフ 2026-05-15 07:05 UTC  
→ 窓 = 2026-05-13 06:05〜08:05 UTC  
→ その日のcronは 12:00 UTC に実行 → 窓がすでに閉じている → **永遠に生成されない**

SRP以外も UTC 早朝キックオフ（04:35, 07:05, 09:35 UTC）の試合は全滅。
Premiership/URCの夜間試合もウィンドウが短すぎて取り逃しリスクが高い。
実際、`match_content` にpreviewレコードはゼロ件。

## スコープ

- 対象: `contentType === "preview"` の生成ウィンドウ制御
- 対象外: recap生成、cron認証、pipeline内部

## 変更箇所

### `lib/cron/orchestrate.ts`

定数を変更する:

```ts
// 変更前
const PREVIEW_WINDOW_START_HOURS = 47;
const PREVIEW_WINDOW_END_HOURS   = 49;

// 変更後
const PREVIEW_WINDOW_START_HOURS = 12;
const PREVIEW_WINDOW_END_HOURS   = 72;
```

- `12h` = 毎日12:00 UTCのcronが「翌日00:00 UTC以降にキックオフする試合」を拾える最小値
- `72h` = 3日前から生成開始（`getMatchIdsMissingContent` が既存コンテンツをフィルタするので重複生成なし）

この変更により、毎日12:00 UTCのcronが:
- SRP 04:35 UTC キックオフ → 翌日以降であれば確実に拾う ✓
- Premiership/URC 19:45 UTC キックオフ → 当日 00:00 UTC 以降であれば拾う ✓

### テスト更新

`tests/cron/orchestrate.test.ts` 内でプレビューウィンドウの時間定数（47/49）をハードコードしているテストを新しい値（12/72）に合わせて更新する。

## ワンタイム手動対応（仕様書適用後に Owner が実行）

window修正だけでは、すでに窓を過ぎた **5月15日の試合** はcronに拾われない。
修正デプロイ後、下記のmatch_idに対して `/api/cron/generate-content` を手動で呼び出す:

| 試合 | kickoff (UTC) | match_id |
|---|---|---|
| Chiefs vs Highlanders | 2026-05-15 07:05 | `241570ff-614e-4a4c-818f-f722e346f9d7` |
| Northampton vs Bristol | 2026-05-15 18:45 | `040cdb1a-74b6-41b1-906a-70ea06f2ad1c` |
| Cardiff vs Stormers | 2026-05-15 19:45 | `591ed51d-acaa-45a0-b833-0b7b3d799c90` |
| Edinburgh vs Connacht | 2026-05-15 19:45 | `9283b559-9952-4ee0-ac93-cea658f7a792` |
| Ulster vs Glasgow | 2026-05-15 19:45 | `9849e921-54c1-4ab4-a685-c94c92c99cec` |

```bash
curl -X POST https://tryline-six.vercel.app/api/cron/generate-content \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "matchIds": [
      "241570ff-614e-4a4c-818f-f722e346f9d7",
      "040cdb1a-74b6-41b1-906a-70ea06f2ad1c",
      "591ed51d-acaa-45a0-b833-0b7b3d799c90",
      "9283b559-9952-4ee0-ac93-cea658f7a792",
      "9849e921-54c1-4ab4-a685-c94c92c99cec"
    ],
    "contentType": "preview"
  }'
```

## 受け入れ条件

- `PREVIEW_WINDOW_START_HOURS = 12`、`PREVIEW_WINDOW_END_HOURS = 72` に変更されている
- 毎日12:00 UTCのcronが翌日04:35 UTCキックオフの試合を拾えるようになる
  - テスト例: `now = 2026-05-15T12:00:00Z`、キックオフ `2026-05-16T04:35:00Z` → previewCandidates に含まれる
- 既存previewがある試合は二重生成されない（`getMatchIdsMissingContent` の既存ロジックで担保）
- recap生成は影響を受けない
