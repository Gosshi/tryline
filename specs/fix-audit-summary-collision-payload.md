# fix-audit-summary-collision-payload

> 本 spec は `specs/fix-external-identifier-key-policy.md`（PR #773、マージ済み）が追加した `identifier_quality` の**出力形式だけ**を扱う。判定ロジックには一切触れない。

## 背景

2026-09-06、PR #773 をマージした後の本番実行で、C5 の誤検出は 659 → 0 になり findings は 678 行 → 87 行に減った。**判定は正しく動いている。**

一方で `summary.json` が読めなくなった。

| | 値 |
|---|---|
| `summary.json` のサイズ | **82KB** |
| `unreliable_key_collisions` のエントリ数 | 100（`UNRELIABLE_KEY_COLLISION_LIMIT`） |
| インラインの `match_ids` 合計 | **1,385** |
| 1 エントリ最大の `match_ids` | **144** |

`tools/audit-published-recap-event-integrity.ts:127-137` の `unreliableKeyCollisions` が `matchIds: string[]` を全件保持し、`reportToSummaryJson`（`:356-370`）がそのまま JSON に落とすためである。

`wikipedia_url` は 1 シーズンページに全試合がぶら下がるので、1 エントリが 144 個の UUID を抱える。**このファイルは Owner が開いて読むものであり、`matches_with_fixture_identifier` のような要点が UUID の海に埋もれている。**

同種の失敗は既に一度起きている。週次監査の通知が件数だけで、どの試合か分からず 2026-08-17 から埋もれ続けた（`specs/fix-data-integrity-alert-actionability.md`、PR #769）。**今回はその逆で、情報が多すぎて読めない。** どちらも「Owner が行動できるか」で判断する。

## スコープ

対象:
- `tools/audit-published-recap-event-integrity.ts`: `unreliable_key_collisions` の出力形式のみ
- `tests/tools/audit-published-recap-event-integrity.test.ts`: 上記の検証

対象外:
- **C1〜C5 の判定ロジック。触らない**
- **`severity` の判定式。触らない**
- `findings.csv` の列と内容。**触らない**（87 行で、Owner が URL を開いて確認する用途に足りている）
- `matches_with_fixture_identifier` / `matches_without_fixture_identifier` の算出
- `lib/ingestion/external-identifiers.ts`。**触らない**
- DB への書き込み。**引き続き 1 件も無いこと**

## 訂正（2026-09-06、Codex の指摘による）

初版には**両立しない条件が 2 つ**あった。Codex が実装前に指摘し、手戻りを防いだ。

### 訂正 1: サイズ上限とエントリ上限が矛盾していた

初版は `UNRELIABLE_KEY_COLLISION_LIMIT`（100）を対象外としながら `summary.json` 10KB 未満を要求した。**算術的に不可能である。**

| limit | samples | UUID 分 | エントリ固定費（概算 150B） | 合計 |
|---:|---:|---:|---:|---:|
| 100 | 5 | 19.0KB | 14.6KB | **33.7KB** |
| 100 | 3 | 11.4KB | 14.6KB | 26.1KB |
| 50 | 3 | 5.7KB | 7.3KB | 13.0KB |
| **25** | **3** | 2.9KB | 3.7KB | **6.5KB** |

**`UNRELIABLE_KEY_COLLISION_LIMIT` を 100 → 25 に下げる。** `sample_match_ids` は 3 件とする。これで 10KB に収まる。

エントリ数を減らしても情報は失われない。`unreliable_key_collision_total`（本番実測 215）と `_remaining` が残るため、**全体像は数字で伝わる**。この一覧の用途は `"mw-content-text"` のような明らかなパーサ欠陥を Owner が見つけることであり、上位 25 件で足りる。

**エントリは `match_count` の降順で並べること。** 上位を切り出す意味がなくなるため、現行の並び順のままにしない。

### 訂正 2: 「既存テスト無改変」は不可能だった

初版の受け入れ条件 8 は「既存テストが無改変で green」を求めたが、`tests/tools/audit-published-recap-event-integrity.test.ts` は次を直接検証している。

- `matchIds`（L351、L421）
- `unreliable_key_collision_limit: 100`（L309、L354、L414）

**出力形式と上限を変える以上、これらの更新は必然である。** 条件 8 を「判定が変わらないこと」に限定して書き直す（下記）。

## データモデル変更

なし。読み取り専用ツールの出力形式のみ。

## API サーフェス

なし。

## UI サーフェス

なし。

## LLM 連携

**なし。コスト $0。**

## 変更詳細

`unreliable_key_collisions` の各エントリを次の形にする。

```
{
  key: string,
  value: string,
  match_count: number,        // 衝突している match_id の総数（切り詰め前）
  sample_match_ids: string[], // 先頭 3 件のみ
}
```

`match_count` を必ず持たせること。**「何件が同じ識別子を共有しているか」が、この診断の主たる情報である。** `sample_match_ids` は Owner が 1〜2 件開いて実物を確かめるためのもので、全件を持つ必要はない。

先頭 3 件の選び方は決定論であること。実行ごとに変わってはならない。

**`UNRELIABLE_KEY_COLLISION_LIMIT` を 100 → 25 に下げ、エントリを `match_count` の降順に並べる。** 上位を切り出す意味がなくなるため、現行の並び順のままにしない。

`unreliable_key_collision_limit` / `_total` / `_remaining` は残す（`limit` の値は 25 になる）。総数と残件数が数字で残るので、エントリを減らしても全体像は伝わる。

**全件が必要になった場合の逃げ道を残す。** `key` と `value` があれば Owner は DB を直接引ける。`summary.json` の注記にその旨と次の SQL 例を含めること。

```sql
select id from matches where external_ids->>'<key>' = '<value>';
```

## 受け入れ条件

**テスト実行の条件**: `tests/tools/` は `vitest.config.ts:16` の `exclude` に該当しない。**本 spec のテストは既定の `pnpm test` で実行される。結果を PR 本文に貼ること。**

1. `unreliable_key_collisions` の各エントリが `key` / `value` / `match_count` / `sample_match_ids` を持つ
2. `sample_match_ids` の要素数が **3 以下**である
3. `match_count` が切り詰め前の総数であることを、4 件以上衝突する合成 fixture で検証するテストがある（`sample_match_ids.length === 3` かつ `match_count >= 4`）
4. 同じ入力で 2 回実行したとき `sample_match_ids` が同一であることを検証するテストがある（決定論）
5. `unreliable_key_collision_limit` が **25** を出力し、`_total` / `_remaining` が現行と同じ意味で出力される（`_total` は切り詰め前の総数、`_remaining` は `_total - 出力件数`）
5b. エントリが **`match_count` の降順**で並ぶことを検証するテストがある
6. `matches_with_fixture_identifier` と `matches_without_fixture_identifier` が現行のまま出力される
7. `summary.json` に、全件を引くための `key` / `value` と SQL 例の注記が含まれる
8. **判定が変わっていないこと**（2026-09-06 訂正）。「既存テスト無改変」ではなく、次の範囲で示す。

   - **変更してよいテスト**: `identifier_quality` / `identifierQuality` の payload 形状と `unreliable_key_collision_limit` の期待値を検証している箇所のみ（現行の L305-311、L344-356、L409-421 相当）
   - **変更してはならないテスト**: C1〜C5 の件数、`severity`、`checksHit`、`pairedMatchIds`、`findings.csv` の内容を検証している箇所。**これらが無改変で green であることが、判定を壊していない証拠になる**
   - PR 本文に、**変更したテストの一覧と、それが payload 形状の検証に限られること**を書く
9. `findings.csv` に差分が無い（列・行数・内容）
10. **書き込みが 1 件も無い**。`.insert(` / `.update(` / `.upsert(` / `.delete(` がソースに現れない（既存条件の維持）
11. LLM 呼び出し（`getOpenAIClient` / `MODELS`）が差分に含まれない
12. `pnpm lint` / `pnpm typecheck` / `pnpm test` が green
13. **本番実行での実測**: `summary.json` の実サイズが **10KB 未満**であること（現行 82KB）。**この実行は Owner が行う。** Codex は合成 fixture での見積もりを PR 本文に書き、実測値は Owner が後から貼る

## 未解決の質問

なし。

**本 spec で解決しないと明示するもの**:

- **`"mw-content-text"` を生むパーサの欠陥は直らない。** 本 spec は診断の読みやすさだけを扱う。取り込み側の修正は別 spec
- **`unreliable_key_collisions` は「汚染」ではない。** `wikipedia_url` が同一シーズンの全試合で共有されるのは Wikipedia の構造上そうなるだけで、異常ではない。**この一覧の件数を汚染件数として報告しないこと。** 実際の汚染は C1 = 84 / C3 = 8 / C4 = 2 である
