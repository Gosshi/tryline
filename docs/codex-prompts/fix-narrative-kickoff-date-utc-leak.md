# Codex 指示: ナラティブ生成の kickoff_at が UTC のままで本文の日付が1日ずれる問題を直す

## 仕様書

`specs/fix-narrative-kickoff-date-utc-leak.md` を読んでから着手すること。以下は補足であり、仕様の置き換えではない。

## 何が問題か（一文）

assembled が `JSON.stringify` でプロンプトに丸ごと入るが、その中の **`kickoff_at` は UTC の ISO 文字列**であり、**LLM パイプラインには JST 変換が一箇所も存在しない**ため、本文の日付が UTC の日付になる。

## 実際に起きたこと（2026-08-21、本番生成）

南アフリカ vs ニュージーランド第1テストのプレビュー本文。

```
エリス・パークで行われる8月22日の初戦は、…
```

**キックオフは 2026-08-23 00:10 JST。** UTC では 2026-08-22 15:10。本文は UTC の日付を書いている。

`greatest-rivalry-2026` は**全8試合が JST 深夜〜早朝キックオフ**なので全滅する。欧州リーグも大半が JST 早朝であり、**公開済みコンテンツにも混入している可能性が高い。**

## 先に実読すべきファイル

| ファイル | 何を確認するか |
|---|---|
| `lib/llm/stages/assemble.ts:993-1010` | 戻り値の `match`。`kickoff_at: match.kickoff_at` が DB の UTC そのまま |
| `lib/llm/prompts/generate-preview.ts:247` | `` `試合データ: ${JSON.stringify(sanitizedAssembled)}` `` |
| `lib/llm/prompts/generate-recap.ts:342` | 同一の行。**両方直す** |
| `lib/format/kickoff.ts` | **既存の JST 変換。ここから使う。新規に日時整形を書かない** |
| `lib/llm/prompts/shared-prompt-blocks.ts` | `PROHIBITIONS_BLOCK` 等の既存ブロック。指示の追加先と形式 |

`grep -rn "Asia/Tokyo" lib/llm/` が **0 件**であることを自分で確認してから始めること。これが「変換が存在しない」ことの根拠。

## やること

1. `assemble.ts` の戻り値 `match` に日本時間の文字列フィールドを追加する。値は `lib/format/kickoff.ts` の既存関数から取る
2. `generate-preview.ts` と `generate-recap.ts` の双方に、日付は日本時間フィールドを使う旨の指示を追加する。**共通なので `shared-prompt-blocks.ts` に置く**
3. `tools/` に読み取り専用の監査スクリプトを追加し、公開済みコンテンツの誤日付を洗い出す

## 絶対にやってはいけないこと

1. **`kickoff_at` を削除・改名しない。** 他の参照が壊れる。追加するだけ
2. **`matches.kickoff_at` の保存形式を変えない。** UTC のまま。マイグレーションを書かない
3. **日時整形を自前で実装しない。** `lib/format/kickoff.ts` の既存関数を使う。`toLocaleString` を新たに書かない
4. **UI 側（`lib/format/kickoff.ts` の呼び出し元）に触らない。** 既に正しい
5. **監査スクリプトに UPDATE / DELETE / DDL を書かない。** SELECT のみ
6. **コンテンツを再生成しない。** 監査結果を出すところまで。再生成は Owner の判断
7. **QA プロンプト（`qa-content.ts`）に触らない。** 別 spec の担当
8. **モデル ID を直書きしない。** `lib/llm/models.ts` の定数を使う

## テストで押さえる点

**境界値が核心。** JST 00:00〜08:59 のキックオフでのみ日付がずれる。

- `kickoff_at = "2026-08-22T15:10:00+00:00"` → 追加フィールドが **8月23日**（UTC 日付の 8月22日を返さないこと）
- JST 昼のキックオフ（例 `2026-08-23T05:00:00+00:00` = 8/23 14:00 JST）→ UTC 日付と JST 日付が一致するケースも押さえる
- `kickoff_at` が従来どおり UTC のまま残っている
- `buildPreviewPrompt` / `buildRecapPrompt` の双方の出力に指示文字列が含まれる

## 完了の定義

- `specs/fix-narrative-kickoff-date-utc-leak.md` の受け入れ条件 1〜9 を満たす
- `pnpm lint` / `pnpm tsc --noEmit` / `pnpm test` / `pnpm build` が green
- **再生成は未実施**（受け入れ条件 10）
- PR 本文に、監査スクリプトを本番で実行した結果の**件数**を書くこと。**推定値ではなく、実際に実行した出力を貼ること**
