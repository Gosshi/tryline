# Codex 指示: 大会ガイドを family 単位で生成できるようにし、greatest-rivalry を追加

## 仕様書

`specs/feat-generate-competition-guide-per-family.md` を読んでから着手すること。以下は補足であり、仕様の置き換えではない。

## 何が問題か（一文）

`tools/generate-competition-guides.ts` は **`FAMILIES` 全 11 件を必ず再生成する**ため、**新しく `greatest-rivalry` を 1 本足したいだけで、既存 11 本すべてを LLM で作り直して上書きしてしまう。**

## なぜ今か

2026-08-23 から **南アフリカ vs ニュージーランドの 4 テストシリーズ**が始まる（全 8 試合、9/13 まで）。大会ハブに説明文が無く、**ストーマーズ・シャークス・ブルズ・ライオンズ（フランチャイズ）が南アフリカ代表と同列に並んでいて区別がつかない**状態。

流入の実測では **Bing 流入の 86% が大会ハブに着地**し、滞在 107 秒（試合ページは 3.6 秒）。ハブが入口なので、ここの説明不足が直接効く。

## 先に実読すべきファイル

| ファイル | 何を確認するか |
|---|---|
| `tools/generate-competition-guides.ts:8-39` | `FAMILIES` のハードコード。`context` を持つ家族（`nations-championship` / `autumn-nations`）の書き方 |
| 同 `:102-126` | `main()` が全件ループしていること。**SQL ファイルを書くだけで DB には書かない**こと |
| 同 `:51-96` | `generateGuide` のプロンプト。厳守事項（79-84 行） |
| `lib/llm/models.ts` | `MODELS.NARRATIVE`。**モデル ID を直書きしない** |

## やること

1. CLI 引数で対象 family を絞れるようにする（引数なしなら従来どおり全件）
2. 不正な family 名は**エラー終了**。黙って全件にフォールバックしない
3. `FAMILIES` に `greatest-rivalry` を追加し、`context` を与える
4. 対象を絞った時の出力先を、全件版 `supabase/seeds/competition-guides.sql` と**別ファイル**にする

## greatest-rivalry に渡す context の中身

**すべて本番 DB のキックオフ時刻・会場で確認済みの事実。**

- 2026 年 8〜9 月、オールブラックスが南アフリカに遠征する**全 8 試合のツアー**
- **南アフリカ代表とのテストマッチ 4 戦** ＋ **南アフリカのフランチャイズとのツアー戦 4 戦**（ストーマーズ・シャークス・ブルズ・ライオンズ）
- **総合優勝チームという概念は無い**。テストシリーズの勝敗で争う
- 最終戦（第4テスト）は **米国ボルチモアの M&T Bank Stadium** 開催
- 日本での視聴は **J SPORTS**

## 絶対にやってはいけないこと

1. **既存 11 家族のガイドを再生成・変更しない。** 内容確認済みで本番稼働中
2. **スクリプトから DB へ直接書き込まない。** SQL ファイル出力 → Owner が実行、という既存の設計を維持する
3. **生成を実行しない。** スクリプト変更とテストまで。`greatest-rivalry` の実生成は Owner が行う
4. **テストで実 API を叩かない。** OpenAI / Exa クライアントはモックする
5. **モデル ID を直書きしない。** `MODELS.NARRATIVE` を使う
6. **ハブページ（`app/competitions/[slug]/page.tsx`）を触らない。** テスト戦とツアー戦の区別表示は別 spec
7. **大会ガイドを collapsible に戻さない。** `bd3fba1` で常時展開に変更済み
8. `competitions.name_ja` を変更しない

## テストで押さえる点

**「呼ばれないこと」が核心。**

- 引数なし → 全 family が対象
- `greatest-rivalry` 指定 → **その 1 件のみ**。他 10 件について Exa / OpenAI が**呼ばれない**
- 存在しない family 名 → エラー終了し、**1 件も生成しない**
- 対象を絞った実行で `supabase/seeds/competition-guides.sql` が上書きされない

## 完了の定義

- `specs/feat-generate-competition-guide-per-family.md` の受け入れ条件 1〜11 を満たす
- 変更ファイル: `tools/generate-competition-guides.ts` と対応するテスト
- `pnpm test` と型チェックが green
- **生成は未実施。** 受け入れ条件 12〜14（Owner の検品と SQL 実行）は Owner が行う
- PR 本文に以下を書くこと:
  - 引数の指定方法（複数指定を許したかどうか）
  - 対象を絞った時の出力先ファイル名
  - `greatest-rivalry` に渡した `context` の全文
