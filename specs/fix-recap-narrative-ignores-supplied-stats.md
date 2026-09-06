# fix-recap-narrative-ignores-supplied-stats

> 本 spec は `specs/fix-preview-sourced-facts-underuse.md`（preview 側、2026-08-21）の recap 版にあたる。取得側の `fix-recap-sourced-facts-zero-result-retry.md` / `fix-recap-sourced-facts-stats-retry-gap.md`（いずれも実装・マージ済み）は**取得**の問題を扱っており、本 spec は**取得できた事実が本文で使われない**問題を扱う。

## 背景

2026-09-06、南アフリカ 29–24 ニュージーランド（`dcd576dd-f778-4690-b4e1-3d960bd664f1`）で、**recap 用の sourced facts 18 件のうち、数値スタッツとカードが本文に 1 つも反映されなかった**ことを実測した。

### 経緯

初回生成（2026-09-05 20:08 UTC、フルタイムの約3時間後）は recap 用 sourced facts **0 件**で走った。既存の 15 件はすべて `content_type = 'preview'` で、`lib/llm/sourced-facts/fetch.ts:388` の `.in("content_type", [contentType, "shared"])` により recap からは読まれない。

QA はその結果を正しく指摘していた。

> 得点経過の具体性は高い一方、戦術面の記述は少なく、試合の流れや一般的な示唆の反復が目立ちます

`tactical_depth: 3` / `information_density: 4` で **publish 条件（全指標 ≥3 かつ density ≥4）をぎりぎり通過**した。

Owner が recap 用の事実 14 件を手動投入し（02:53–02:55 UTC）、再生成した（03:08 UTC）。再生成時の `fetch-sourced-facts` が自動で 4 件を追加したため（03:06 UTC、onrugby.it 2 / springboks.rugby 2）、**生成時点で存在したのは合計 18 件**である。

**この 18 件は `tests/fixtures/recap-sourced-facts-dcd576dd.json` に実データとして記録した。** 受け入れ条件のテストはこれを使う。

| | 再生成前 | 再生成後 |
|---|---:|---:|
| tactical_depth | 3 | **4** |
| information_density | 4 | **5** |
| factual_grounding | 4 | **5** |
| QA issues | 2 件 | **0 件** |

**供給は効いた。** ただし本文が使った材料は一部だった。

| 供給した材料 | 本文で使用 |
|---|---|
| 公式 Player of the Match（Ethan Hooker） | ✓ |
| モール約 20m 前進、交代3枚の実名、タッチキック、ブレイクダウンのペナルティ | ✓ |
| Rennie の振り返り（ミス増 → スクラム反則 → 陣地後退） | ✓ |
| **ポゼッション 57% / テリトリー 53%** | **✗** |
| **タックル 150 対 106 / 反則 11 対 12** | **✗** |
| **ラインアウト 11/11 対 11/12 / スクラム投入 11 対 5** | **✗** |
| **イエローカード 2 枚**（Love 36分・Feinberg-Mngomezulu 10分、いずれも理由付き） | **✗** |
| Kolbe の顎骨折 / Savea の肩 / Kolisi の主将 55 勝 | ✗ |

**カードの欠落が特に重い。** 36 分のペナルティトライは「Love のイエロー → 南アフリカが 5m スクラムを選択 → 押し込んでペナルティトライ」という因果で、供給した事実にその全部が書いてある。本文はペナルティトライに触れながら**経緯を書いていない**。

### なぜ問題か

**数値スタッツは Owner が最も欲しい情報である。** `match_team_stats` は全期間 0 行で、数値表は取り込めていない（`project_official_stats_unreachable`）。手動投入はその唯一の供給経路であり、**入れても使われないなら供給の努力が無駄になる。**

`lib/llm/prompts/generate-recap.ts` の `sourcedFactsBlock` は「本文の趣旨に沿うものはできるだけ多く反映すること」と指示しているが、**強制力がなく、QA も「使ったか」を採点していない。**

## スコープ

対象:
- **`lib/llm/sourced-facts/statistical-fact.ts`（新規）**: 数値スタッツ判定を純粋モジュールへ切り出す
- `lib/llm/sourced-facts/fetch.ts`: 切り出し先を import する形に変える（**挙動は変えない**）
- `lib/llm/prompts/generate-recap.ts`: 数値スタッツとカードを本文へ反映させる指示の強化
- `lib/llm/prompts/qa-content.ts`: 供給された数値スタッツ・カードが本文で未使用の場合に減点する採点軸の追加

### なぜ切り出しが必要か（2026-09-06 追記）

初版は「既存判定を再利用する」とだけ書いたが、**その判定は import できない状態にある**。

- `STATISTICAL_FACT_PATTERN`（`lib/llm/sourced-facts/fetch.ts:26`）と `containsStatisticalFact`（同 `:249`）は**どちらも非 export**
- `fetch.ts` は `getSupabaseServerClient` / `createWebSearchJsonResponse` / `fetchJrfuMatchLineup` を**値として import** しており、QA プロンプトから引き込むべきではない

#765（`lib/ingestion/event-integrity.ts`）と同じ形で、**DB 非依存の純粋モジュールへ切り出して両側から共有する。**

対象外:
- **取得側の再検索**（`fix-recap-sourced-facts-*-retry` 系で対応済み。本 spec は取得後を扱う）
- sourced facts のスキーマ変更
- `information_density` / `tactical_depth` の publish 閾値の変更（別 spec）
- preview 側（`fix-preview-sourced-facts-underuse.md`）
- 手動投入の運用（`docs/chatgpt-prompts/`）

## データモデル変更

なし。

## API サーフェス

なし。

## UI サーフェス

なし。

## LLM 連携

**プロンプト文字列を変更するため `PROMPT_VERSION` のバンプが必要。** `lib/llm/prompts/generate-recap.ts` の `recap@4.19.0` と `lib/llm/prompts/qa-content.ts` の該当バージョンを上げる。

**LLM 呼び出し回数は増えない。** 既存の生成 1 回・QA 1 回のプロンプト内容を変えるだけで、モデルは `MODELS.NARRATIVE` / `MODELS.FAST` のまま。

**ただしリトライが増える可能性がある。** QA に新しい減点軸を足すと retry が発生しやすくなる。**リトライ上限は現行実装（`lib/llm/stages/qa.ts`）のままとし、上限を上げないこと。** 最悪費用は「1 試合あたり現行の最大リトライ回数 × 生成 1 回分」で変わらない。

## 変更詳細

### 1. 生成プロンプト

`sourcedFactsBlock` に、**数値スタッツとカードを別扱いする指示**を足す。

- 供給された事実に**数値（%、本数、回数）が含まれる場合、本文のいずれかのセクションで最低 1 つは使う**
- 供給された事実に**カード（イエロー・レッド）が含まれる場合、該当する得点局面の記述でその因果に触れる**
- **使えない事実を無理にこじつけない**という既存の指示は維持する。数値が試合の筋と無関係なら使わなくてよい

**捏造の余地を作らないこと。** 「数値を使え」という指示が、供給されていない数値の創作を誘発してはならない。**供給された事実に無い数値を書いてはならない**という既存の禁止を明示的に再掲する。

### 2. QA

`qa-content.ts` の入力に、**供給された sourced facts のうち数値スタッツ・カードに該当するものの一覧**を渡す。

判定は決定論の前処理で行う。`fix-recap-sourced-facts-stats-retry-gap.md` が実装した判定を、**新規の純粋モジュールへ移して共有する**（新たに書き起こさない）。

### 正規表現の拡張が必要（2026-09-06 追記・初版の「書き換えないこと」を撤回）

fixture で実測したところ、**現行の `STATISTICAL_FACT_PATTERN` は 18 件中 2 件しか検出しない。**

```
/\d+(?:\.\d+)?\s*%|\b(?:penalt\w*|tackles?|possession|territory|turnovers?|lineouts?|scrums?|carries|metres?|meters?)\b/i
```

| 検出結果 | |
|---|---|
| 検出 | ポゼッション 57% の fact（`%` に一致） |
| 検出 | `South Africa tries: … penalty try (36')`（**`penalt` の誤検出**。統計ではなく得点イベント） |
| **未検出** | **「ラインアウトは 11/11 対 11/12。スクラム投入数は 11 回対 5 回」** |

**実質的に有効な検出は 1 件のみ。**

原因は前提の陳腐化にある。`fix-recap-sourced-facts-stats-retry-gap.md`（2026-07）は「統計用語（**英語で保存されるため**）」と明記していた。当時は Web 検索の自動取得だけだった。**その後 D026 で Owner が Discord から日本語で手入力する経路ができ、前提が崩れた。**

**したがって正規表現の拡張を認める。** 次の 2 点を行う。

1. **日本語の統計語を追加する**: ポゼッション / テリトリー / タックル / ラインアウト / スクラム / ターンオーバー / キャリー / ゲイン / 反則 など。**「〜回」「〜本」「N/M」の形も拾えるようにする**
2. **`penalt\w*` の誤検出を直す**: 「ペナルティトライ」「ペナルティゴール」は得点イベントであって統計ではない。**英語の `penalty try` / `penalty goal` と日本語の「ペナルティトライ」「ペナルティゴール」を統計として数えない**

`g` フラグは付いていないため `lastIndex` の持ち越しは起きない（現行は `/i` のみ）。**フラグを増やさないこと。**

### `fetch.ts` の再検索への影響

`fetch.ts:526` の「数値スタッツが 1 件も無ければ再検索」は、語彙を増やすと**発火しにくくなる**。

**許容する。** 同経路が判定するのは Web 検索の戻り値で主に英語であり、日本語の手入力分は再検索の対象ではない。**ただし誤検出の修正により、`penalty try` しか含まない検索結果で再検索が発火するようになる。これは意図した改善である。**

該当する事実が供給されているのに本文がどれにも触れていない場合、`information_density` を減点する。**新しい採点軸は増やさない**（4 軸のまま）。

## 受け入れ条件

**テスト実行の条件**: 既定の `pnpm test` は `vitest.config.ts` の `exclude` により `tests/llm/pipeline.test.ts` / `tests/llm/stages/assemble.test.ts` を実行しない。除外されていない新規ファイルに置くか、除外を外した実行コマンドを用意し、**PR 本文に実行コマンドと結果を貼ること。**

1. `tests/fixtures/recap-sourced-facts-dcd576dd.json`（実データ 18 件）を使い、**ポゼッション・タックル・ラインアウトのいずれの数値も本文に現れない出力**に対して、QA が `information_density` を減点することを検証するテストがある
2. 同 fixture で、数値を 1 つ以上使った本文には減点が入らないことを検証するテストがある
3. **カード 2 件（10 分 Feinberg-Mngomezulu / 36 分 Love）が供給されているのに本文がカードに触れていない**出力が減点されることを検証するテストがある
4. **供給された事実に数値スタッツもカードも含まれない試合では、本ゲートが一切適用されない**ことを検証するテストがある（`match_team_stats` が 0 行の大会が大半であるため、ここを誤ると全試合が減点される）
5. sourced facts が 0 件の試合で、従来どおりの採点になることを検証するテストがある
6. `lib/llm/sourced-facts/statistical-fact.ts` が存在し、**import が最小限**である（`getSupabaseServerClient` / `createWebSearchJsonResponse` / `fetchJrfuMatchLineup` を引き込まない）
6-b. 正規表現が日本語の統計語を検出する。**fixture の「ラインアウトは 11/11 対 11/12。スクラム投入数は 11 回対 5 回」の fact が検出される**ことを検証するテストがある
6-b-2. **`South Africa tries: … penalty try (36')` が統計として検出されない**ことを検証するテストがある（得点イベントの誤検出）
6-b-3. 正規表現にフラグを追加していない（`/i` のみ）
6-c. **`fetch.ts` の既存テストがそのまま通る。** 特に「数値スタッツが 1 件も無ければ再検索」（`fetch.ts:526` 付近）の挙動が変わっていないこと
7. `generate-recap.ts` と `qa-content.ts` の `PROMPT_VERSION` が両方バンプされている
8. **プロンプトに「供給された事実に無い数値を書いてはならない」旨の禁止が明示されている**
9. リトライ上限が変更されていない
10. `pnpm typecheck` が green

## 未解決の質問

**Owner が決めること。**

**再生成の対象範囲。** プロンプトをバンプすると、既存の公開記事は古い版のままになる。全件再生成は 900 本規模で費用が大きい。`project_regen_length_incident`（2026-06 の 297 件 draft 化事故）の教訓により、**少件数の試し焼き → 検品 → 段階実行**が前提。

**どの範囲を再生成するかは本 spec では決めない。** 実装後に、数値スタッツが供給されている試合だけを対象にするなどの絞り込みを Owner が判断する。
