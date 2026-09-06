仕様書 `specs/fix-audit-summary-collision-payload.md` を実装してください。**先に全文を読んでください。**

## 何を直すか

PR #773 のマージ後、本番実行で C5 の誤検出は 659 → 0 になり findings は 678 行 → 87 行に減りました。**判定は正しく動いています。** 直すのは出力の読みやすさだけです。

`summary.json` が **82KB** になり、Owner が開いて読めなくなりました。

| | 値 |
|---|---|
| エントリ数 | 100（`UNRELIABLE_KEY_COLLISION_LIMIT`） |
| インラインの `match_ids` 合計 | **1,385** |
| 1 エントリ最大 | **144** |

`tools/audit-published-recap-event-integrity.ts:127-137` の `unreliableKeyCollisions` が `matchIds: string[]` を全件保持し、`reportToSummaryJson`（`:356-370`）がそのまま JSON に落としています。

`wikipedia_url` は 1 シーズンページに全試合がぶら下がるので、1 エントリが 144 個の UUID を抱えます。**`matches_with_fixture_identifier` のような要点が UUID の海に埋もれています。**

## 変更内容

各エントリをこの形にします。

```
{
  key: string,
  value: string,
  match_count: number,        // 切り詰め前の総数
  sample_match_ids: string[], // 先頭 3 件のみ
}
```

**あわせて `UNRELIABLE_KEY_COLLISION_LIMIT` を 100 → 25 に下げ、エントリを `match_count` の降順に並べてください。**

**`match_count` が主たる情報です。**「何件が同じ識別子を共有しているか」を Owner は見ます。`sample_match_ids` は 1〜2 件開いて実物を確かめるためのもので、全件は要りません。

先頭 3 件の選び方は**決定論**であること。実行ごとに変わってはいけません。

`unreliable_key_collision_total` / `_remaining` は現行の意味のまま残してください。エントリ数を減らしても、総数（本番実測 215）と残件数が数字で残るので全体像は伝わります。

全件が必要になったときのために、`summary.json` の注記に次の SQL 例を含めてください。

```sql
select id from matches where external_ids->>'<key>' = '<value>';
```

## 触るファイル

```
tools/audit-published-recap-event-integrity.ts
tests/tools/audit-published-recap-event-integrity.test.ts
```

## やってはいけないこと

- **C1〜C5 の判定ロジックと `severity` の判定式を変えること。** 出力形式だけです
- **`findings.csv` を変えること。** 87 行で用途に足りています。列・行数・内容に差分を作らないでください
- `lib/ingestion/external-identifiers.ts` を触ること
- `matches_with_fixture_identifier` / `matches_without_fixture_identifier` の算出を変えること
- DB への書き込み。**引き続き 1 件も無いこと**
- LLM を呼ぶこと

## 数え方を間違えないでください

**`unreliable_key_collisions` は「汚染」ではありません。** `wikipedia_url` が同一シーズンの全試合で共有されるのは Wikipedia の構造上そうなるだけで、異常ではありません。**この一覧の件数を汚染件数として PR 本文に書かないでください。** 実際の汚染は C1 = 84 / C3 = 8 / C4 = 2 です。

## テストについて

`tests/tools/` は `vitest.config.ts:16` の `exclude` に該当しないため、**既定の `pnpm test` で実行されます。** 結果を PR 本文に貼ってください。

**「既存テスト無改変」は求めません**（初版の誤りでした。下記「訂正」参照）。変更してよいのは `identifier_quality` の payload 形状と `unreliable_key_collision_limit` の期待値を検証している箇所だけです。C1〜C5 の件数・`severity`・`checksHit`・`pairedMatchIds`・`findings.csv` を検証しているテストは**無改変で green** であること。それが判定を壊していない証拠になります（受け入れ条件 8）。

## 完了の定義

受け入れ条件 1〜13 を満たすこと。特に:

- `sample_match_ids` が 3 件以下（条件 2）
- 4 件以上衝突する合成 fixture で `sample_match_ids.length === 3` かつ `match_count >= 4`（条件 3）
- 2 回実行して `sample_match_ids` が同一（条件 4・決定論）
- `unreliable_key_collision_limit` が 25、エントリが `match_count` 降順（条件 5・5b）
- 変更したテストの一覧と、それが payload 形状の検証に限られることを PR 本文に書く（条件 8）
- `findings.csv` に差分なし（条件 9）

**条件 13（本番の実サイズ 10KB 未満）は Owner が実行して貼ります。** Codex は合成 fixture での見積もりを PR 本文に書いてください。**本番の env ファイルを使う実行はしないでください。**

## 訂正（2026-09-06）

初版には**両立しない条件が 2 つ**ありました。実装前に指摘してもらい、手戻りを防げました。

**1. サイズ上限とエントリ上限の矛盾。** 「上限 100 は変えるな」と「10KB 未満」を同時に要求していました。算術的に不可能です。

| limit | samples | UUID 分 | 固定費（概算） | 合計 |
|---:|---:|---:|---:|---:|
| 100 | 5 | 19.0KB | 14.6KB | **33.7KB** |
| **25** | **3** | 2.9KB | 3.7KB | **6.5KB** |

上限を 25 に下げることで解決します。`_total` と `_remaining` が残るので情報は失われません。

**2. 「既存テスト無改変」は不可能でした。** `tests/tools/audit-published-recap-event-integrity.test.ts` が `matchIds`（L351、L421）と `unreliable_key_collision_limit: 100`（L309、L354、L414）を直接検証しています。形式と上限を変える以上、更新は必然です。条件 8 を「判定が変わらないこと」に限定して書き直しました。
