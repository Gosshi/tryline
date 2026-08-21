# Codex 指示: preview が sourced_facts を使わず統計比較に流れる問題を直す

## 仕様書

`specs/fix-preview-sourced-facts-underuse.md` を読んでから着手すること。以下は補足であり、仕様の置き換えではない。

## 何が問題か（一文）

preview は `match_events` が常に 0 件なので、ラインアップ未確定だと **sourced_facts が何件あろうと必ず「データスパース」判定**になり、統計比較へ誘導する 9 項目の指示だけが効いて、**facts が 1 つも本文に出てこない。**

## 実際に起きたこと（2026-08-21、本番生成）

南アフリカ vs ニュージーランド第1テストの sourced_facts は **7 件**あった。

```
・主将シヤ・コリシがハムストリング負傷、スキャン検査へ
・ケイレブ・クラーク（WTB）が肩の腱を断裂、手術のため帰国
・ビリー・プロクター（CTB）も肩の重傷で遠征離脱
・NZ が 44 人の遠征スカッドを発表
・デオン・フーリーが長期離脱から代表復帰
・NZ はツアー州代表 3 戦を全勝
・会場はエリスパーク、4 テストシリーズの第1戦
```

**生成された 1,468 字に、この 7 件は 1 つも登場しない。** 本文は平均得点 45.4 対 45.8、平均失点 12.4 対 15.6 の比較だけで構成され、QA は情報密度 2/5 を付けた。**QA の評価は正しい。**

**素材は取れている。使わせていないことが問題。**

## 先に実読すべきファイル

| ファイル | 何を確認するか |
|---|---|
| `lib/llm/prompts/generate-preview.ts:109-110` | `isDataSparse`。**`sourced_facts.length` が式に一切現れない** |
| 同 `:155-167` | `dataSparseBlock`。統計へ誘導する 9 項目。末尾「手元のデータで書き切ること」 |
| 同 `:145-150` | `sourcedFactsBlock`。**「使ってよい」という許可のみ。義務がない** |
| `lib/llm/prompts/qa-content.ts:115` | `recapSourcedFactsDensityBlock = !isJapaneseRecap ? "" : …` **preview では常に空** |
| 同 `:48` | `isJapaneseRecap = contentType === "recap" && language === "ja"` |
| 同 `:128-139` | `informationDensityRubric`。5点・4点が `isJapaneseRecap && sourcedFactsCount > 0` でしか facts を見ない |
| `lib/llm/prompts/generate-recap.ts` の sourced_facts 周辺 | **踏襲する先例。文面をここから持ってくる** |

## やること

1. `isDataSparse` の判定に sourced_facts を反映する
2. `sourcedFactsBlock` の facts あり側に**反映義務**を追加する
3. `qa-content.ts` の密度チェックとルーブリックを **ja の preview にも効かせる**
4. `PROMPT_VERSION`（`qa-content.ts:11`、現在 `qa@2.6.0`）を上げる

## 設計上の注意（ここを外すと壊れる）

**`|| sourced_facts.length > 0` を足すだけにしないこと。**

単純にそうすると、facts はあるがラインアップが無い試合で `dataSparseBlock` が丸ごと消え、`recent_form` や `standings` から読み取る指示まで失われる。**統計も facts も両方使わせたい。**

3 分岐（`hasPlayerReferenceData` / `isDataSparse` / それ以外）の構造は維持し、**「facts があるのに 9 項目だけが出る」状態の解消**が要件。実装の形は判断してよい。

## 絶対にやってはいけないこと

1. **recap 側の出力を変えない。** `contentType: "recap"` のプロンプト出力が前後で一致することをテストで担保する
2. **英語 preview の出力を変えない。** recap の密度チェックが ja 限定なのと対称にする
3. **`dataSparseBlock` の 9 項目を削除しない。** ラインアップも facts も無い試合では引き続き必要
4. **反映率の閾値を新設計しない。** recap と同じ「おおむね7割」を使う
5. **`lib/llm/content-length.ts` に触らない。** 字数下限は本件と無関係
6. **`isJapaneseRecap` を他の用途ごと書き換えない。** 同ファイル内の他の箇所でも使われている
7. **sourced_facts の取得経路・allowlist に触らない。** 収集は機能している（7 件取れている）
8. **コンテンツを再生成しない。** コードとテストまで
9. **モデル ID を直書きしない。** `lib/llm/models.ts` の定数を使う

## テストで押さえる点

**回帰防止が核心。recap と英語 preview を壊さないこと。**

- facts 0 件・events 0 件・ラインアップ無し → **従来どおり 9 項目が出る**（修正前の挙動を固定）
- facts 1 件以上・events 0 件・ラインアップ無し → 反映義務の文字列が出る
- `buildQaContentPrompt(preview, ja, facts 1件以上)` → 密度ブロックが出る。**修正前は出ないことを固定するテストも置く**
- `buildQaContentPrompt(preview, ja, facts 0件)` → 密度で減点しない旨が出る
- `contentType: "recap"` の出力が前後で一致
- `contentType: "preview"` / `language: "en"` の出力が前後で一致

## 完了の定義

- `specs/fix-preview-sourced-facts-underuse.md` の受け入れ条件 1〜10 を満たす
- `pnpm lint` / `pnpm tsc --noEmit` / `pnpm test` / `pnpm build` が green
- **再生成は未実施**（受け入れ条件 11）
- PR 本文に、`isDataSparse` をどう変えたか（新しい条件式そのもの）と、**facts あり・ラインアップ無しのときに実際に出力されるブロック構成**を貼ること
