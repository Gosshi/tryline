# preview のナラティブが sourced_facts を使わず、データスパースモードの統計比較に流れる

## 背景

2026-08-21 03:47 JST、南アフリカ vs ニュージーランド第1テスト（match_id: `d6d5b1ab-58ec-44c8-a31d-54fadc0a662e`）の preview が QA に reject された。

```
QAスコア: 情報密度 2/5 / 日本語品質 5/5 / 事実根拠 3/5
問題点: 戦術分析が平均得点・失点の比較と一般的な試合展開の予測にとどまり、
        選手名、セットプレー、ブレイクダウン、キック戦略などの具体性が不足しています
```

**この試合には sourced_facts が 7 件あり、内容は薄くない。**

| ソース | 件数 | 内容 |
|---|---|---|
| springboks.rugby | 3 | 会場・シリーズ位置づけ / NZ の44人遠征スカッド発表 / デオン・フーリーの負傷明け復帰招集 |
| therugbypaper.co.uk | 4 | **主将シヤ・コリシのハムストリング負傷とスキャン検査** / **ケイレブ・クラークの肩腱断裂で手術帰国** / **ビリー・プロクターの肩負傷で離脱** / NZ のツアー3戦全勝とブルズ戦の得点者 |

主将の負傷、離脱者3人、遠征スカッドの発表。プレビューの核になる材料が揃っている。

**しかし生成された本文 1,468 字には、この 7 件が 1 つも登場しない。** 本文は直近5試合の平均得点 45.4 対 45.8、平均失点 12.4 対 15.6 という DB 集計値の比較だけで構成されている。QA の情報密度 2/5 は妥当な評価である。

**素材の問題ではない。素材を使わせていないことが問題。**

### 根本原因1: `isDataSparse` が sourced_facts を見ていない

`lib/llm/prompts/generate-preview.ts:109-110`

```ts
const isDataSparse =
  assembled.match_events.length === 0 && !hasPlayerReferenceData;
```

preview は未実施の試合が対象なので `match_events` は**常に0件**。したがって `hasPlayerReferenceData`（確定ラインアップ、または sourced_facts 由来の確定ラインアップ）が無ければ**必ず `isDataSparse = true` になる。**

**この式に `assembled.sourced_facts.length` は一切現れない。** 負傷情報や選手コメントが何件あろうと「データスパース」と判定される。

### 根本原因2: データスパースモードが統計比較へ誘導する

`isDataSparse` が true のとき、`generate-preview.ts:155-167` の `dataSparseBlock` が出力される。中身は 9 項目の具体的な指示で、その内訳がこれ。

- `recent_form` の直近5試合スコアから攻撃力・守備力・ストリークを読み取れ
- `competition_standings` の順位・勝ち点差から大会的意味を述べよ
- `h2h_last_5` の直近対戦傾向を引用せよ
- `key_stats` の平均得点・失点から予想スコアレンジを推論せよ
- `win_rate_last_5` で「好調」「低調」を描写せよ
- `avg_score_diff_last_5` の正負で攻守を読み取れ
- `result_streak` で連勝・連敗を明示せよ
- 「情報が少ない」等の逃げ表現は禁止。**手元のデータで書き切ること**

**生成された本文は、この指示に忠実に従った結果である。** バグではなく、指示どおりの出力になっている。

### 根本原因3: sourced_facts ブロックは許可しかしていない

同ファイル 145-150 行。

```ts
: [
    "【出典付き補強事実 sourced_facts】以下はallowlist済みの信頼ソースから抽出した事実です。本文の根拠として使ってよい。",
    "使う場合は必ず自分の日本語で言い換えること。原文の長い直接引用は禁止。同一ソースから複数引用しないこと。",
    "sourced_facts に含まれないWeb由来の負傷・欠場・統計・発言を推測して書いてはならない。",
    JSON.stringify(assembled.sourced_facts),
  ].join("\n");
```

**「使ってよい」という許可のみ。反映義務も密度要求もない。** 9 項目の具体的な指示と、1 行の許可が並べば、後者が負ける。

### 根本原因4: QA 側に preview の密度チェックが存在しない

`lib/llm/prompts/qa-content.ts:115`

```ts
const recapSourcedFactsDensityBlock = !isJapaneseRecap
  ? ""
  : sourcedFactsCount === 0
```

`isJapaneseRecap` は同ファイル 48 行で `contentType === "recap" && language === "ja"` と定義される。**preview では常に空文字になる。**

情報密度のルーブリック（128-139 行）も同様。

```ts
isJapaneseRecap && sourcedFactsCount > 0
  ? `- 5: ${minLength}${unitLabel}以上かつ...本文の趣旨に沿う sourced_facts のおおむね7割以上を自分の日本語で反映している`
  : `- 5: ${minLength}${unitLabel}以上かつ具体的な試合描写・戦術分析・選手名が豊富`,
```

**preview は sourced_facts を反映しても加点されず、無視しても減点されない。**

### まとめると両端で欠けている

| | recap（ja） | preview（ja） |
|---|---|---|
| 生成側の反映義務 | あり | **なし（許可のみ）** |
| QA の密度加点 | あり（7割基準） | **なし** |
| データスパース時の誘導 | — | **統計比較へ強く誘導** |

recap 側は `feat-recap-density-rewards-sourced-facts.md` で既に整備済み。**本 spec は同じ整備を preview に対して行う。**

## スコープ

対象:

- `isDataSparse` の判定に sourced_facts の有無を反映する
- sourced_facts がある場合の反映義務ブロックを preview 生成プロンプトに追加する
- QA の preview 版 sourced_facts 密度チェックとルーブリックを追加する

対象外:

- **recap 側の既存挙動の変更。** `feat-recap-density-rewards-sourced-facts.md` の結果を維持する
- sourced_facts の取得経路・allowlist（本件では 7 件取得できており、収集は機能している）
- 反映率の閾値の新規設計。**recap と同じ「おおむね7割」を使う**
- 英語 preview。recap の密度チェックが ja 限定であるのと対称にする
- `dataSparseBlock` の 9 項目そのものの削除。**ラインアップも facts も無い試合では引き続き必要**
- 字数下限の変更（`lib/llm/content-length.ts` は触らない）
- 該当 preview の再生成そのもの（マージ後に `content-regen` の手順で実施）

## データモデル変更

**なし。マイグレーション不要。** 既存の `match_sourced_facts` を読むだけ。

## API サーフェス

### 1. `isDataSparse` の判定変更（`generate-preview.ts:109-110`）

sourced_facts が存在する場合は「スパース」と扱わない方向へ変更する。

**ただし単純に `|| sourced_facts.length > 0` を足すと、facts はあるがラインアップが無い試合で `dataSparseBlock` が丸ごと消え、統計から読み取る指示まで失われる。** 3 分岐（`hasPlayerReferenceData` / `isDataSparse` / それ以外）の構造は維持し、facts がある場合に統計比較への誘導を弱めつつ facts 反映を要求する形にすること。

実装方針は Codex の判断でよいが、**「facts があるのに `dataSparseBlock` の 9 項目だけが出る」状態を解消することが要件**である。

### 2. 反映義務ブロックの追加（`generate-preview.ts`）

`sourcedFactsBlock` の `length > 0` 側に、反映義務を明示する行を追加する。

**recap 側の対応箇所（`generate-recap.ts` の sourced_facts 周辺と `qa-content.ts:122-127`）の文面を踏襲すること。** 新しい言い回しを発明しない。

### 3. QA の preview 密度チェック（`qa-content.ts`）

`recapSourcedFactsDensityBlock` と `informationDensityRubric` の分岐条件を、ja の preview も含むように拡張する。

- 変数名が `recap` 固定になっているため、意味に合う名前へ改める
- `isJapaneseRecap` はファイル内の他箇所でも使われている。**それらの挙動を変えないこと**
- `PROMPT_VERSION`（`qa-content.ts:11`、現在 `qa@2.6.0`）を上げること

## UI サーフェス

なし。

## LLM 連携

段階4（ナラティブ生成）と段階5（QA）のプロンプトのみ。

**新規 LLM 呼び出しは追加しない。** sourced_facts の JSON は既に両プロンプトへ渡っており、増えるのは指示文の数行のみ。コスト増は実質ゼロ。モデル ID は直書きせず `lib/llm/models.ts` の定数を参照すること。

## 受け入れ条件

1. `assembled.sourced_facts` が 0 件・`match_events` 0 件・ラインアップ無しのとき、`buildPreviewPrompt` の出力に従来どおり `dataSparseBlock` の 9 項目が含まれる。**修正前の挙動を固定する回帰テストを置くこと。**
2. `assembled.sourced_facts` が 1 件以上・`match_events` 0 件・ラインアップ無しのとき、`buildPreviewPrompt` の出力に sourced_facts の反映義務を示す文字列が含まれる。
3. 同条件で、統計比較のみへ誘導する 9 項目がそのまま単独で出力される状態になっていない。
4. `buildQaContentPrompt` を `contentType: "preview"` / `language: "ja"` / `sourcedFacts` 1 件以上で呼ぶと、密度チェックのブロックが出力される。**修正前は出力されないことを固定するテストを置くこと。**
5. 同条件で、情報密度ルーブリックの 5 点・4 点の記述に sourced_facts の反映率が含まれる。
6. `contentType: "preview"` / `language: "ja"` / `sourcedFacts` 0 件のとき、密度で減点しない旨の記述が出力される（recap の 0 件時と同じ扱い）。
7. `contentType: "recap"` の出力が本変更の前後で一致する。**recap 側のテストで担保すること。**
8. `contentType: "preview"` / `language: "en"` の出力が本変更の前後で一致する。
9. `qa-content.ts` の `PROMPT_VERSION` が上がっている。
10. `pnpm lint` / `pnpm tsc --noEmit` / `pnpm test` / `pnpm build` がすべて clean。
11. **コンテンツの再生成は実施しない。** Codex の作業はコードとテストまで。

## 未解決の質問

1. **再生成の順序。** 本 spec と `fix-narrative-kickoff-date-utc-leak.md` はどちらも preview の生成プロンプトを変更する。**両方マージしてから再生成しないと、片方の修正しか入らない preview が生まれる。** 順序と再生成タイミングは Owner が決める。

2. **第1テストの再生成が間に合うか。** キックオフは 2026-08-23 00:10 JST。両 spec の実装・レビュー・マージが間に合わない場合、当該 preview は現状の draft のまま、または統計比較のみの内容で公開されることになる。**間に合わない場合の扱い（draft のまま見送るか、現状で publish するか）は Owner が判断する。**

3. **反映率 7 割が preview に妥当か。** recap は試合後の確定情報を反映するのに対し、preview の facts は負傷・スカッドなど流動的な情報を含む。すべてを盛り込むと不自然になる可能性がある。まず recap と同じ基準で運用し、**過剰な詰め込みが観測されたら閾値を見直す。**

4. **`dataSparseBlock` の 9 項目が水増しを誘発していないか。** 「手元のデータで書き切ること」という指示は、材料が乏しいときに同じ統計を言い換えて字数を満たす動機になりうる。今回の本文も平均得点・失点の比較を 3 セクションで繰り返している。`fix-qa-prompt-missing-form-and-match-metadata.md` の未解決の質問1（GPT-5.6 は字数を繰り返しで満たす）と同根であり、**別 spec の候補。**
