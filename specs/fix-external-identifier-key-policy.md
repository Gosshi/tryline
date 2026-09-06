# fix-external-identifier-key-policy

> 本 spec は `specs/fix-event-ingestion-identity-guard.md` の**未解決の質問 1**（L146「V4 の fixture 識別子: `external_ids` のどのキーを source fixture id とするか」）に、本番データに基づく答えを与える。同 spec の V4 判定（L97）は、本 spec が切り出す共有モジュールを使う。**本 spec 自体は取り込み時のガードを実装しない。**
>
> 直近の適用先は `tools/audit-published-recap-event-integrity.ts` の C5 判定である。#765 が `lib/ingestion/event-integrity.ts` を先に切り出してから消費側を直したのと同じ順序を採る。

## 背景

2026-09-06、PR #772 の監査ツールを本番で初回実行した（対象 848 試合）。

```
targets=848 C1=84 C2=0 C3=8 C4=2 C5=659 incomplete=0
```

**C5（fixture 重複）が 659 件**で、findings 677 行のうち 591 行が「C5 のみ」だった。実際に確認すべきは C1 / C3 / C4 に該当する 86 件であり、**C5 は誤検出で結果の 87% を埋めている。**

### 原因

`tools/audit-published-recap-event-integrity.ts:296-301` が、`external_ids` の**キー名**を正規表現で拾っている。

```typescript
if (
  (typeof nestedValue !== "string" && typeof nestedValue !== "number") ||
  !/(?:id|url|fixture|event)/i.test(key)
) {
  return [];
}
```

`url` にマッチするキーがすべて fixture 識別子として扱われる。本番の実態はこうである。

| キー | 出現行数 | distinct 値 | 実体 |
|---|---:|---:|---|
| `match_url` | 306 | **306** | 試合ページ URL。一意 |
| `league_one_match_id` | 216 | **216** | 一意 |
| `world_rugby_match_id` | 90 | **90** | 一意 |
| `top14_lnr_id` | 21 | **21** | 一意 |
| `top14_lnr_match_path` | 21 | **21** | 一意 |
| `wikipedia_url` | 1,148 | **43** | **シーズンページの URL。同一シーズンの全試合が共有する** |
| `wikipedia_event_id` | 1,261 | 923 | Wikipedia の節見出しアンカー（後述） |
| `top14_lnr_url` | 21 | **3** | **ラウンドページの URL** |

`wikipedia_url` が 1,148 行で 43 種類しかないことが C5 の 591 件をほぼ単独で生んでいる。**これは試合の識別子ではなくページの URL である。**

### `wikipedia_event_id` は competition で絞っても識別子にならない

一見すると使えそうに見えるので、本番で検算した。

| 条件 | 衝突している (値, 大会) の組 |
|---|---:|
| 素の値のみ | 171 値 / 494 行 |
| `competition_id` で絞る | **9** |
| さらに `mw-content-text` を除く | **8** |

大会で絞ればほぼ解消するが、**残る 9 件はすべて偽陽性で、3 つの型に分かれる。**

1. **`"mw-content-text"`（32 行、`autumn-nations-2025`）** — Wikipedia / Parsoid のコンテンツ div の `id`。パーサが試合アンカーを取れずページ側の要素 id にフォールバックしている。**識別子ではない**
2. **同一シーズン内の再対戦（SRP 2025 で 6 値）** — `"Brumbies_v_Hurricanes"` がレギュラー（4/26）とプレーオフ（6/7）の 2 試合に付く。アンカーが節・日付で区切られていない
3. **ノックアウトの節見出し（Top 14 2024-25 で 2 値）** — `"Semi-finals"` が 2 試合、`"Semi-final_Qualifiers"` が 2 試合に付く。**アンカーが節そのものの見出しである**

さらに素の値には `"England_v_Scotland"` のように **Six Nations 2021 / 2023 / 2025 / 2027 の 4 試合で共有される**ものがある。

つまり `wikipedia_event_id` は**節見出しアンカーであって、対戦カードが 1 回しか現れない場合にだけ偶然 fixture 識別子の形をしている**。恒久的に信頼できない。

### 認めるべき事実: 76% の試合に使える識別子が無い

| | 件数 |
|---|---:|
| `matches` 総数 | 1,372 |
| 一意キー 5 種のいずれかを持つ | **327（24%）** |
| どれも持たない | **1,045（76%）** |

Wikipedia 由来の試合には fixture 識別子が存在しない。**これは `fix-event-ingestion-identity-guard.md` の V4 が全体の 24% しか守れないことを意味する。** 同 spec の V1（スコア）/ V2（チーム帰属）/ V3（署名）が Wikipedia 系の主防御であり、V4 は補助であるという位置づけを明示する必要がある。

## スコープ

対象:
- `lib/ingestion/external-identifiers.ts`（新規）: `external_ids` から fixture 識別子を取り出す純関数。DB に触らない
- `tests/ingestion/external-identifiers.test.ts`（新規）
- `tools/audit-published-recap-event-integrity.ts`: `externalIdentifiers()` を上記モジュールに置き換える。加えて**識別子品質の欠陥を C5 とは別のカウンタで報告する**
- `tests/tools/audit-published-recap-event-integrity.test.ts`: 上記の検証を追加
- `specs/fix-event-ingestion-identity-guard.md` の未解決の質問 1 に、本 spec で確定した旨を追記する

対象外:
- **取り込み時のガードの実装**（`lib/ingestion/events.ts`）。`fix-event-ingestion-identity-guard.md` の担当で、同 spec には未決の Owner 判断が別に 2 件残っている
- **`matches.external_ids` の書き換え・正規化**。`"mw-content-text"` を DB から消さないこと。**`UPDATE` / `INSERT` / マイグレーションを差分に含めない**
- **スクレイパー側の修正**（`"mw-content-text"` を拾わないようにする等）。原因はパーサにあるが、本 spec は識別子の解釈側のみを扱う。取り込み側の修正は本 spec の出力（欠陥件数）を見てから別 spec で決める
- C1 / C2 / C3 / C4 の判定ロジック。**触らない**
- `severity` の判定式。**触らない**（C5 のみの findings が減る結果として `suspect` 件数は減るが、判定式は変えない）
- 新しいテーブル・列の追加

## データモデル変更

**なし。** `matches.external_ids`（`Json`）を読むだけで、書き込みもマイグレーションも行わない。

## API サーフェス

なし。

## UI サーフェス

なし。

## LLM 連携

**なし。コスト $0。**

## 変更詳細

### 1. `lib/ingestion/external-identifiers.ts`（新規）

キーの許可リストを定数として持つ。**正規表現でキー名を判定しない。**

```
FIXTURE_IDENTIFIER_KEYS = [
  "match_url",
  "league_one_match_id",
  "world_rugby_match_id",
  "top14_lnr_id",
  "top14_lnr_match_path",
]
```

各エントリに、本番で distinct 数と行数が一致した事実をコメントで残すこと（例: `// 306 rows / 306 distinct as of 2026-09-06`）。

```
extractFixtureIdentifiers(externalIds: Json): string[]
  - オブジェクトでなければ空配列
  - FIXTURE_IDENTIFIER_KEYS のキーのうち、値が空でない string / number のものだけを返す
  - 返す形式は `${key}=${value}`（既存ツールと同じ）
  - ネストは辿らない。本番の external_ids はすべてフラットなオブジェクトである
```

**`wikipedia_event_id` / `wikipedia_url` / `top14_lnr_url` を許可リストに入れないこと。** 理由は上記の実測にある。

```
UNRELIABLE_IDENTIFIER_KEYS = ["wikipedia_event_id", "wikipedia_url", "top14_lnr_url"]

extractUnreliableIdentifiers(externalIds: Json): string[]
  - 上記キーの値を同じ形式で返す。品質報告専用で、重複判定には使わない
```

### 2. `tools/audit-published-recap-event-integrity.ts`

`externalIdentifiers()`（`:276-305`）を削除し、`extractFixtureIdentifiers` を使う。C5 の判定ロジック自体（`:640-665`）は変えない。

加えて、`summary.json` に**識別子品質の診断**を追加する。これは C5 とは別の区画に置き、`findings.csv` の `checks_hit` には出さない。

```
identifier_quality: {
  matches_with_fixture_identifier: number,      // 期待値 327
  matches_without_fixture_identifier: number,   // 期待値 1045
  unreliable_key_collisions: [
    { key: string, value: string, match_ids: string[] }
  ]
}
```

`unreliable_key_collisions` は**大会をまたぐものも含めて**列挙するが、件数が多いため上限を設ける（`DATA_INTEGRITY_ACTION_ITEM_LIMIT` と同様の考え方で、上限と残件数を明示する）。`"mw-content-text"` のような明らかなパーサ欠陥を Owner が見つけられることが目的である。

### 3. `specs/fix-event-ingestion-identity-guard.md`

未解決の質問 1 に、本 spec で確定した旨と結論（許可リスト 5 キー、V4 のカバレッジは 24%、Wikipedia 系は V1〜V3 が主防御）を追記する。**質問 2（V3 を自動 reject にするか）と質問 3（独立した 2 実装）には触らない。** これらは未決のまま残す。

## 受け入れ条件

**テスト実行の条件**: `tests/ingestion/` には `vitest.config.ts:16` の `exclude` に該当するファイルがある（`tests/ingestion/events.test.ts` / `standings.test.ts` / `upsert.test.ts`）。**`tests/ingestion/external-identifiers.test.ts` はこの 3 つに該当しないため既定の `pnpm test` で実行される。** `tests/tools/` も除外対象外である。**実行結果を PR 本文に貼ること。**

1. `extractFixtureIdentifiers` が `{"match_url": "https://example.org/m/1"}` に対して 1 件返す
2. `extractFixtureIdentifiers` が `{"wikipedia_url": "https://example.org/wiki/2026_Six_Nations"}` に対して**空配列**を返す
3. 同様に `{"wikipedia_event_id": "England_v_Scotland"}` と `{"top14_lnr_url": "https://example.org/round/1"}` で空配列を返す
4. `{"source": "wikipedia", "wikipedia_event_id": "mw-content-text", "wikipedia_url": "https://example.org/wiki/x"}` で空配列を返す
5. `external_ids` が `null` / 配列 / 文字列のとき空配列を返し、例外を投げない
6. 値が空文字・`null` のキーは無視される
7. `extractUnreliableIdentifiers` が 3 キーの値を返し、`extractFixtureIdentifiers` の結果と重複しない
8. **監査ツールの既存テスト 5 件が引き続き green**。特に「第2戦が `confirmed`、`paired_match_id` が第1戦」のケースが壊れていない
9. **合成 fixture で、`wikipedia_url` のみを共有する 2 試合が C5 に計上されない**ことを検証するテストがある
10. **合成 fixture で、`match_url` を共有する 2 試合が C5 に計上される**ことを検証するテストがある
11. `summary.json` に `identifier_quality` が含まれ、`matches_with_fixture_identifier` と `matches_without_fixture_identifier` の両方がある
12. `unreliable_key_collisions` に上限と残件数の表示がある
13. **ツールに書き込みが 1 件も無い**。`.insert(` / `.update(` / `.upsert(` / `.delete(` がソースに現れない（既存の条件の維持）

    注: 現行ソースは `hasher["update"](signature)` というブラケット記法で crypto のハッシュ更新を書き、この検査を回避している。**本 PR でこれを `.update(` に戻してよい。** その場合はテスト側の正規表現を Supabase チェーンに限定する形へ変更し、変更理由をコメントに残すこと。回避のためのブラケット記法を残すか直すかは実装側の判断でよいが、**どちらにせよ PR 本文で言及すること**
14. `matches` / `match_events` / `match_content` への `UPDATE` / `INSERT` / マイグレーションが差分に含まれない
15. LLM 呼び出し（`getOpenAIClient` / `MODELS`）が差分に含まれない
16. `specs/fix-event-ingestion-identity-guard.md` の未解決の質問 1 に確定の追記がある。質問 2・3 は未決のまま残っている
17. `pnpm lint` / `pnpm typecheck` / `pnpm test` が green。結果を PR 本文に貼る

## 未解決の質問

なし。キーの選定は本番実測で確定している。

**本 spec で解決しないと明示するもの**:

- **Wikipedia 由来の 1,045 試合（76%）に fixture 識別子は存在しない。** 本 spec はそれを作らない。「識別子で同一性を担保した」と完了報告しないこと
- **`"mw-content-text"` を生むパーサの欠陥は直らない。** 本 spec は件数を可視化するところまでで、取り込み側の修正は別 spec とする
- **C5 の件数が減ることは、汚染が減ったことを意味しない。** 誤検出が消えるだけである。C1 = 84 / C3 = 8 / C4 = 2 という実態は変わらない
