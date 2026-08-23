# QA にラインアップと得点イベントが渡らず、正しい記述が却下される

## 背景

2026-08-23、南アフリカ vs ニュージーランド第1テストの recap が QA に reject された（事実根拠 **2/5**）。

```
入力データにない先発・ポジション情報（ホランド、ラブ、コルビら）や両軍のメンバー構成を断定しています。
得点イベントに記録されていない各得点の正確な時刻（コルビのペナルティゴール、ラブのコンバージョン）を断定しています。
```

**2件とも誤りである。本番 DB で全件照合した。**

### 誤指摘1: 先発・ポジション

`match_lineups` に **46件**（両チームの先発・リザーブ）が入っている。本文の背番号は実データと一致する。

| 本文 | `match_lineups` |
|---|---|
| 先発5番 ファビアン・ホランド | RL Fabian Holland |
| 先発10番 ルーベン・ラブ | FH Ruben Love |
| 先発14番 チェスリン・コルビ | RW Cheslin Kolbe |
| 先発7番 ルーク・ジェイコブソン | OF Luke Jacobson |

### 誤指摘2: 得点時刻

`match_events` に **14件**が分単位で入っている。本文の時刻は**全件一致**した。

```
 4' penalty_goal  Cheslin Kolbe    26' penalty_goal Cheslin Kolbe
 8' try           Will Jordan      46' penalty_goal Cheslin Kolbe
13' try           (SA)             47' try          Fabian Holland
14' conversion    Cheslin Kolbe    48' conversion   Ruben Love
22' try           Josh Moorby      58' try          Luke Jacobson
23' conversion    Ruben Love       59' conversion   Ruben Love
                                   74' try          Will Jordan
                                   75' conversion   Ruben Love
```

スコア推移（3-0 → 3-5 → 10-5 → 10-12 → 13-12 → 16-12 → 16-17 → 16-33）も合致する。

### 根本原因

`lib/llm/prompts/qa-content.ts:21-35` の `QaMatchContext` は以下を持つ。

```ts
awayScore / awayTeam / competitionName / derivedStats / formStats /
homeScore / homeTeam / recent_form / sourcedFacts / teamStats / venue
```

**`projected_lineups` が存在しない。** 同ファイルを `projected_lineups` で grep すると **0件**。

`match_events` も本体は渡っていない。`buildQaContentPrompt` の引数は `hasEvents`（真偽値、43行）と `playerStatNames`（得点者名の配列、42行）だけで、**分・種別・スコア推移は QA から見えない**。

一方 `generate-recap.ts` は `JSON.stringify(assembled.match_events)` で**イベント全体を生成側へ渡している**。

**生成側は見えていて、判定側からは見えない。**

### これは同型の非対称の3度目

| spec | 渡すようにしたもの | 状態 |
|---|---|---|
| `fix-qa-prompt-missing-form-and-match-metadata.md` | 大会名・会場・直近フォームの**集計値** | 実装済み |
| `fix-qa-form-stats-individual-results.md` | 直近5試合の**個別スコア** | 実装済み |
| **本 spec** | **ラインアップと得点イベント本体** | — |

`fix-qa-form-stats-individual-results.md` の未解決の質問3にこう書かれている。

> 同種の欠落が他のフィールド（h2h、順位表、ラインアップ）にも残っている可能性がある。本 spec では憶測で広げないが、**3度目の同型事故が起きたら QA 入力と生成入力の差分を機械的に検出する仕組みを検討する価値がある**

**3度目が起きた。本 spec はその検出の仕組みも対象に含める。**

### 影響

preview では事実根拠4/5で公開を止めなかったが、**recap では reject に至った**。再取得・再生成後も3/5のままである。**過検出が実害に変わっている。**

## スコープ

対象:

- `QaMatchContext` にラインアップを追加し、判定プロンプトへ出力する
- `match_events` 本体（分・種別・得点者・チーム）を QA へ渡し、判定プロンプトへ出力する
- **QA 入力と生成入力の差分を検出する仕組み**を追加する

対象外:

- プログラム側ガード（`containsUnsupportedStatistic` / `containsUngroundedPlayerReference` 等）の判定ロジック変更
- 採点ルーブリック・閾値の変更
- `playerStatCheckBlock`（`qa-content.ts:92-104`）の既存の役割。**「ここでは正誤判定をしない。match_events との照合はプログラム側で行う」という設計は維持する**
- 生成プロンプトの変更
- h2h・順位表の配線（**実例が出ていない。憶測で広げない**）
- カード情報（`match_events` に入っていない。別 spec）
- 既存記事の再生成

## データモデル変更

**なし。マイグレーション不要。** `assemble` が既に持っている値を QA へ渡すだけ。

## API サーフェス

### 1. `QaMatchContext` の拡張（`qa-content.ts:21-35`）

ラインアップと得点イベントを追加する。

**型は `AssembledContentInput` の該当フィールドを再利用すること。** `recent_form` が `AssembledContentInput["recent_form"]` を参照している（31行）のと同じ形にする。**新しい構造を発明しない。**

### 2. 判定プロンプトへのブロック追加

既存の `formStatsBlock` / `teamStatsBlock` / `matchMetadataBlock` と**同じ形式**で追加する。

- **ラインアップ**: 「本文がこれらの先発・リザーブ・背番号に言及している場合、入力データに基づく正当な記述として扱い factual_grounding を下げないこと」
- **得点イベント**: 同上。分・種別・得点者・スコア推移について

値が空のときはブロックを出力しない（既存ブロックと同じ挙動）。

**選手名は日本語表記で照合できる必要がある。** 本文はカタカナで書く。`recent_form` が `resolveTeamName(..., language, ...)` を通しているのと同様に、ラインアップの選手名も日本語で渡るか確認すること。渡らない場合は `japanese_name_glossary` の経路を調べ、**どう解決したかを PR 本文に書くこと**。

### 3. QA 入力と生成入力の差分検出

**本 spec の再発防止の中核。**

生成プロンプトが参照している `assembled` のフィールドのうち、QA へ渡っていないものを**機械的に検出できる仕組み**を追加する。

実装の形は判断してよい（型レベルの網羅チェック、テスト、リンタ等）。**要件は「生成側にあって QA 側に無いフィールドが増えたとき、気づけること」である。**

過去3回とも「気づいたのは本番で記事が落ちてから」だった。**次は落ちる前に分かる状態にする。**

### 4. `PROMPT_VERSION`

`qa-content.ts:12` の `PROMPT_VERSION`（現在 `qa@2.9.0`）を上げること。**現在値はコードを実読して確認する。**

## UI サーフェス

なし。

## LLM 連携

段階5（QA）の判定プロンプトのみ。

**新規 LLM 呼び出しを追加しない。** 増えるのはラインアップ46件分とイベント14件分の JSON。モデル・段数・採点スキーマは変更しない。モデル ID は直書きせず `lib/llm/models.ts` を参照すること。

**プロンプト長に注意。** ラインアップは両チーム合計で40件超になる。既存の `sourcedFacts` も渡っているため、合計のトークン増を PR 本文で報告すること。

## 受け入れ条件

1. `QaMatchContext` にラインアップと得点イベントのフィールドが存在する。
2. 型が `AssembledContentInput` の該当フィールドを再利用している。**独自構造を新設していない**ことをコードレビューで確認できる。
3. `buildQaContentPrompt` の出力に、先発・リザーブ・背番号を含むブロックが現れる。
4. 同出力に、得点イベントの分・種別・得点者を含むブロックが現れる。
5. **修正前は両方とも出力されないことを固定するテストを置くこと。**
6. 値が空・未指定のとき、それぞれのブロックが出力されない。
7. 既存の `formStatsBlock` / `teamStatsBlock` / `matchMetadataBlock` / `recentFormBlock` が引き続き出力される。
8. `playerStatCheckBlock` の既存の文面と役割が変わっていない。
9. `lib/llm/pipeline.ts` の QA 呼び出しで配線されている。**値の出どころが生成側と同一である**ことをテストで担保する。
10. 生成側にあって QA 側に無いフィールドを検出する仕組みが存在し、**現在の欠落が無いことを確認できる**。
11. `PROMPT_VERSION` が上がっている。
12. 本 spec 背景の実データ（先発5番ホランド、47分のトライ等）を含む本文で、該当ブロックに値が現れることをテストで確認できる（**LLM の採点結果は非決定的なのでテスト対象にしない**）。
13. `pnpm lint` / `pnpm tsc --noEmit` / `pnpm test` / `pnpm build` がすべて clean。
14. **既存記事の再生成は実施しない。**

## 未解決の質問

1. **プロンプトが長くなりすぎないか。** ラインアップ40件超＋イベント＋sourced_facts＋recent_form が1つのプロンプトに入る。`sourced_facts` には重複が多いことが分かっており（別 spec）、そちらの解消と合わせて総量を見る必要がある。

2. **カード情報が `match_events` に無い。** 2026-08-23 の試合では70分・71分に南アフリカがシンビン2枚を受け、その直後の74分に決勝トライが生まれた。**試合の因果を説明するのに不可欠だが、DB に入っていないため QA にも生成側にも渡らない。** 別 spec。

3. **`match_team_stats` が空である。** 同試合の公式スタッツ（ラインアウト成功率、反則数、シンビン数）は allowlist 内の springboks.rugby に存在するが、**JS レンダリングのため機械取得できない。** `teamStats` を QA へ渡す配線は既にあるが、値が入らない。別 spec。
