仕様書 `specs/fix-external-identifier-key-policy.md` を実装してください。**先に全文を読んでください。**

## 何を直すか

PR #772 の監査ツールを本番で初回実行したところ（2026-09-06、対象 848 試合）、**C5（fixture 重複）が 659 件**出ました。

```
targets=848 C1=84 C2=0 C3=8 C4=2 C5=659 incomplete=0
```

findings 677 行のうち **591 行が「C5 のみ」**です。実際に確認すべきは 86 件（C1 / C3 / C4）で、**C5 が結果の 87% を誤検出で埋めています。**

## 原因は特定済みです

`tools/audit-published-recap-event-integrity.ts:296-301` が `external_ids` の**キー名**を正規表現で拾っています。

```typescript
!/(?:id|url|fixture|event)/i.test(key)
```

`url` を含むキーがすべて fixture 識別子扱いになります。本番の実態です。

| キー | 出現行数 | distinct | 実体 |
|---|---:|---:|---|
| `match_url` | 306 | **306** | 一意 ✅ |
| `league_one_match_id` | 216 | **216** | 一意 ✅ |
| `world_rugby_match_id` | 90 | **90** | 一意 ✅ |
| `top14_lnr_id` | 21 | **21** | 一意 ✅ |
| `top14_lnr_match_path` | 21 | **21** | 一意 ✅ |
| `wikipedia_url` | 1,148 | **43** | シーズンページの URL ❌ |
| `wikipedia_event_id` | 1,261 | 923 | 節見出しアンカー ❌ |
| `top14_lnr_url` | 21 | **3** | ラウンドページの URL ❌ |

`wikipedia_url` が 1,148 行で 43 種類しかないことが、591 件をほぼ単独で生んでいます。

## `wikipedia_event_id` を「大会で絞れば使える」と考えないでください

検算済みです。

| 条件 | 衝突している (値, 大会) の組 |
|---|---:|
| 素の値 | 171 値 / 494 行 |
| `competition_id` で絞る | 9 |
| さらに `mw-content-text` を除く | 8 |

大会で絞るとほぼ消えますが、**残る 9 件はすべて偽陽性**で 3 つの型に分かれます。

1. `"mw-content-text"`（32 行）— Wikipedia のコンテンツ div の `id`。パーサが試合アンカーを取れずページ側の要素 id にフォールバックしている
2. 同一シーズン内の再対戦（SRP 2025 で 6 値）— `"Brumbies_v_Hurricanes"` がレギュラー 4/26 とプレーオフ 6/7 の 2 試合に付く
3. ノックアウトの節見出し（Top 14）— `"Semi-finals"` が 2 試合、`"Semi-final_Qualifiers"` が 2 試合に付く

素の値には `"England_v_Scotland"` のように Six Nations 2021 / 2023 / 2025 / 2027 の 4 試合で共有されるものもあります。

**これは節見出しアンカーであって、対戦カードが 1 回しか現れない場合にだけ偶然 fixture 識別子の形をしているだけです。** 許可リストに入れないでください。

## 認めるべき事実

| | 件数 |
|---|---:|
| `matches` 総数 | 1,372 |
| 一意キー 5 種のいずれかを持つ | **327（24%）** |
| どれも持たない | **1,045（76%）** |

Wikipedia 由来の試合には fixture 識別子が存在しません。これは仕様書に明記してあります。**「識別子で同一性を担保した」と完了報告しないでください。**

## 触るファイル

```
lib/ingestion/external-identifiers.ts                      （新規）
tests/ingestion/external-identifiers.test.ts               （新規）
tools/audit-published-recap-event-integrity.ts
tests/tools/audit-published-recap-event-integrity.test.ts
specs/fix-event-ingestion-identity-guard.md                （未解決の質問 1 に追記のみ）
```

`lib/ingestion/` に置くのは、`specs/fix-event-ingestion-identity-guard.md` の V4 が後でこのモジュールを使うためです。#765 が `lib/ingestion/event-integrity.ts` を先に切り出してから消費側を直したのと同じ順序です。

**キーの判定を正規表現で書かないでください。** 許可リストの定数にし、各エントリに本番実測をコメントで残してください（例: `// 306 rows / 306 distinct as of 2026-09-06`）。

## やってはいけないこと

- **C1 / C2 / C3 / C4 の判定ロジックと `severity` の判定式を変えること。** 触るのは C5 の識別子抽出だけです
- **取り込み時のガード（`lib/ingestion/events.ts`）を実装すること。** それは `fix-event-ingestion-identity-guard.md` の担当で、同 spec には未決の Owner 判断が別に 2 件残っています
- **スクレイパーを直すこと。** `"mw-content-text"` を生む欠陥はパーサ側にありますが、本 PR は件数を可視化するところまでです
- **`matches.external_ids` の `UPDATE`。** `"mw-content-text"` を DB から消さないでください
- 新しいテーブル・列を追加すること
- LLM を呼ぶこと（コスト $0 の決定論処理です）

## 既存テストの回避コードについて

現行ソースの `signatureHash()` は `hasher["update"](signature)` とブラケット記法で書かれています。これは crypto のハッシュ更新であって DB 書き込みではありませんが、受け入れ条件の `.update(` 走査を避けるための記法です。

**本 PR で `.update(` に戻してかまいません。** その場合はテスト側の正規表現を Supabase チェーンに限定する形へ変え、理由をコメントに残してください。戻すか残すかは判断にお任せしますが、**どちらにせよ PR 本文で言及してください。**

## テストについて

`tests/ingestion/` には `vitest.config.ts:16` の `exclude` 対象が 3 つあります（`events.test.ts` / `standings.test.ts` / `upsert.test.ts`）。**`external-identifiers.test.ts` はこれに該当しないため既定の `pnpm test` で実行されます。** `tests/tools/` も除外対象外です。

## 完了の定義

受け入れ条件 1〜17 をすべて満たすこと。特に:

- `wikipedia_url` / `wikipedia_event_id` / `top14_lnr_url` で空配列（条件 2〜4）
- `wikipedia_url` のみを共有する 2 試合が **C5 に計上されない**（条件 9）
- `match_url` を共有する 2 試合が **C5 に計上される**（条件 10）
- **既存テスト 5 件が green**。特に「第2戦が `confirmed`、`paired_match_id` が第1戦」が壊れていない（条件 8）
- `summary.json` の `identifier_quality` に 327 / 1,045 相当が出る（条件 11）
- `specs/fix-event-ingestion-identity-guard.md` の**未解決の質問 1 だけ**に追記し、質問 2・3 は未決のまま残す（条件 16）

`pnpm lint` / `pnpm typecheck` / `pnpm test` の結果を PR 本文に貼ってください。
