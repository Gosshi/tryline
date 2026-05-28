# コンテンツ統計捏造の根絶（extract 例示・QA 決定論ガード・既存資産是正）

> このファイルは「データに存在しない統計値の捏造」を根絶する権威ある仕様書。
> 関連する既存 spec との関係:
> - `specs/fix-prompt-player-name-examples.md` … プロンプト例示の見直し（数値例の問題はこちらに統合）
> - `specs/fix-pricing-sample-content.md` … 料金ページ SAMPLE（差し替え方針をこちらで上書き）
> - `specs/fix-qa-factual-grounding.md` … QA への勝者スコア受け渡し（**別問題・補完関係**。本 spec の QA ガードと同時に実装すると相性が良い）

## 背景

2026-05-29 の評価で、本番 Supabase（project `rtoljbvqvbxcgpesohpt`）の `match_content` を直接精査した結果、**有料コンテンツの約3割で、入力データに存在しない統計値（スクラム成功率・テリトリー%・ランメートル・ラインブレイク数など）が捏造されている**ことが数値で確定した。

確定した事実（本番データ実測）:

- recap 全 907 件中 **255 件（28.1%）が「成功率」を含む**。「○○%」を含む recap 46 件、「テリトリー」2 件、「支配率/ポゼッション」10 件。
- データモデル（`lib/llm/types.ts` の `AssembledContentInput`）には、スクラム成功率・テリトリー%・ラインアウト獲得率・ランメートル・ラインブレイク数は**一切存在しない**。実在するのは `key_stats`（avg_score / win_rate_last_5 / avg_score_diff_last_5 / result_streak / penalty_count / try_count / late_scoring）、`match_events`、`score_timeline`、`recent_form`、`competition_standings`、`h2h_last_5` のみ。
- 料金ページの**ショーケース SAMPLE**（クボタ 26-3 東芝, match `8bf38c7c-0c06-4a81-b659-9c35c22da6bb`）が「スクラム成功率85%/70%」「フィールドポジション60%支配」「ラインアウト成功率75%」を含み、**`qa_scores` はオール 5/5**（factual_grounding=5）。
- QA judge は `gpt-4o-mini`（`lib/llm/stages/qa.ts`）。捏造統計を検出できず満点を付けている。字数も誤判定（1,107 字の recap に information_density=5。ルーブリックは「5=2,000字以上」）。
- 本番 ja コンテンツは目標字数に未達（preview ≈ 950〜1,140 字 vs 目標 1,500、recap ≈ 1,210 字 vs 目標 1,600〜2,000）。
- 公開中コンテンツの大半は旧プロンプト版（recap@1.8.0=370 / 2.1.0=211 / 2.0.0=210 / 1.6.0=101）。最新 recap@4.4.0 は 3 件のみで、改善が読者にほぼ届いていない。

### 根本原因

`lib/llm/prompts/extract-tactical-points.ts` の「戦術次元の例」が、データに存在しない指標を列挙している:

```
- スクラム優位性（被ペナルティ数・ドライビングモール成功率）
- キックゲーム制御（exitキック精度・カウンターアタック成功率）
- ラインアウト精度（自チームボール獲得率・スティール率）
- オフロードアタック（ランメートル・ラインブレイク数）
- フィールドポジション支配（テリトリー%・22m進入回数）
```

モデルはこの枠を「精密な数値」で埋めようとし、`generate-narrative` がそれを事実として本文化、`qa` が検出できず publish される。イベントが豊富な試合（例: Western Force vs Fijian Drua `a0c7977d`）は実在の得点経過に忠実で捏造がない。**捏造はデータが薄い試合ほど発生する**＝extract の「埋めようとする」挙動が原因という因果が裏付けられている。

## スコープ

対象:
- `lib/llm/prompts/extract-tactical-points.ts` の例示・禁止事項の修正
- `lib/llm/prompts/shared-prompt-blocks.ts` の `PROHIBITIONS_BLOCK` 追記
- `lib/llm/stages/qa.ts` への決定論的ガード追加（数値検証・字数検証）
- 料金ページ SAMPLE の差し替え
- 既存 `match_content` の再生成（捏造を含む 255 件＋旧プロンプト版）

対象外:
- QA judge モデルの格上げ（別途検討。本 spec は決定論ガードで補強）
- 新統計指標を実データとして収集する取り込み層の拡張（将来課題）
- 勝者整合性へのスコア受け渡し（`fix-qa-factual-grounding.md` 側）

## データモデル変更

なし（既存フィールドのみで完結）。

## API サーフェス

なし（バッチ・パイプライン内部の変更のみ）。

## UI サーフェス

- 料金ページ `/pricing` の SAMPLE recap を、捏造統計を含まない実在コンテンツに差し替える。
  - 推奨: Western Force vs Fijian Drua（`a0c7977d-528e-48cc-b96b-5a88882aee90`）。実在の得点経過に忠実で精密%を含まず、tactical 表現が定性的。
  - SAMPLE は捏造チェックを通過した content のみ出せる仕組みにする（ハードコード文字列を避け、DB の検証済み content を参照）。
  - `fix-pricing-sample-content.md` の「空欄フォールバック改善」はこの差し替えに統合してよい。

## LLM 連携

パイプライン段階: ステージ2（extract）とステージ4（QA）。モデルは現行どおり（extract/QA = `gpt-4o-mini`、narrative = `gpt-4o`）。

### 変更1: extract プロンプト（`extract-tactical-points.ts`）

- 「戦術次元の例」から、データに存在しない指標（成功率・テリトリー%・ランメートル・ラインブレイク数・22m進入回数・獲得率・スティール率・exitキック精度）を**全削除**。
- 実在フィールドに基づく例のみに置換。例:
  - 得点力の対比（`key_stats.avg_score` / `avg_score_diff_last_5`）
  - 直近フォーム（`recent_form` の連勝/連敗・`win_rate_last_5`）
  - 規律（`key_stats.penalty_count`）
  - 試合運び（`score_timeline.lead_changes` / `late_scoring`）
  - 対戦相性（`h2h_last_5`）
  - 順位・大会文脈（`competition_standings`）
- 禁止事項に明文追加: 「入力データに存在しない指標（◯◯成功率、テリトリー%、ランメートル、ラインブレイク数、ポゼッション%、22m進入回数等）を数値で記述してはならない。これらは入力に含まれないため創作は禁止。」
- `home_situation` / `away_situation` は「`key_stats` に実在する数値、または `match_events`/`recent_form` から導ける事実のみ」と限定。

### 変更2: narrative プロンプト（`shared-prompt-blocks.ts` の `PROHIBITIONS_BLOCK`）

- 追記: 「入力データに無い統計（成功率・テリトリー%・支配率・ランメートル・ラインブレイク数・22m進入回数）を数値で書くことを禁止。スコア・トライ数・ペナルティ数・平均得失点・順位など入力に実在する数値のみ使用すること。」
- これにより preview / recap 両方に一括適用される。

### 変更3: QA 決定論ガード（`qa.ts` の `applyDeterministicQaGuards`）

LLM judge の自己申告に依存せず、コードで機械的に検証する。

- **捏造数値ガード**: 本文に対し正規表現で検出:
  - `/\d+\s*%/`（パーセンテージ）
  - `/成功率|テリトリー|支配率|ポゼッション|ランメートル|ラインブレイク|獲得率|スティール率|22m進入/`
  - これらにマッチした場合、現データモデルには対応指標が存在しないため**無条件で捏造とみなし**、`factual_grounding` を 1 に強制、`issues` に「データに存在しない統計値を含む」を追加 → `resolveVerdict` で retry/reject。
  - 実装が単純で誤検出が起きにくい（実データにこれらの指標が無いため）。将来データを持ったら例外を追加する。
- **字数ガード**: `length(content_md)` をコードで判定。
  - recap < 1,600 字 または preview < 1,500 字なら `information_density` を最大 3 に制限。
  - judge が付けた長さ系スコアをコードで上書きし、判定を一本化。

### 変更4: 既存資産の再生成（要 Owner 承認・コスト発生）

- **再生成対象の確定クエリ**（read-only, 調査用）:
  ```sql
  select prompt_version, count(*)
  from match_content
  where content_type in ('recap','preview') and language in ('ja','en')
    and (content_md ~ '\d+\s*%' or content_md like '%成功率%' or content_md like '%テリトリー%'
         or content_md like '%ランメートル%' or content_md like '%ラインブレイク%' or content_md like '%支配率%')
  group by 1 order by 2 desc;
  ```
- 段階的に再生成（コスト保護）:
  1. まず「成功率を含む 255 件」を新 extract + 新 QA ガードで再生成（概算 $5〜13）。
  2. 効果確認後、旧プロンプト版（recap@1.x/2.x ≈ 890 件）を順次再生成（概算 全件で $20〜45）。
- **コスト見積もりを Codex 実装時に必ず再計算し、Owner が承認してから実行する**（CLAUDE.md のコスト保護ルール）。本番 API キーでのループ実行は承認必須。

## 受け入れ条件

1. `extract-tactical-points.ts` の例示・禁止事項から、データ非存在指標が完全に除去されている（grep で「テリトリー」「ランメートル」「ラインブレイク」「成功率」が例示部に存在しない）。
2. `PROHIBITIONS_BLOCK` に捏造統計禁止の明文が含まれる。
3. `qa.ts` の決定論ガードにより、捏造統計を含む本文が `factual_grounding<=1` となり publish されない。ユニットテストで検証:
   - 「スクラム成功率85%」を含む recap → factual_grounding=1, verdict≠publish
   - 1,107 字の recap → information_density<=3
   - 実在数値（スコア・トライ数・順位）のみの recap → 減点されない（誤検出なし）
4. 料金ページ SAMPLE が捏造統計を含まない（`\d+%`・「成功率」を含まないことをテストで保証）。
5. 再生成バッチに、実行前のコスト見積もり出力と Owner 承認ゲートがある。
6. 再生成後、上記確定クエリの捏造ヒット件数が大幅に減少（目標: 再生成対象群で「成功率」を含む recap が 0 件）。

## 未解決の質問（Owner 判断）

1. 再生成の範囲: 「捏造を含む 255 件のみ」か「旧プロンプト版 ≈890 件すべて」か。
2. テリトリー%・スクラム成功率などを将来「実データ」として取り込むか。載せないなら恒久的に「書かせない」運用。
3. QA judge を `gpt-4o` 級へ格上げするか（本 spec の決定論ガードで十分か）。
4. SAMPLE を Western Force vs Fijian Drua で確定してよいか。