# 記事QAの信頼性監査 — 2026-11-16

対象コミット: `e74cf00f5992f74667bdb05fe5ccd68462733b32`。ローカルHEADも一致。コード変更、LLM実行、本番DB照会、記事修正は行っていない。これは実装仕様の改訂案であり、既存ゲートや仕様書を変更したものではない。

## 1. 結論と証拠の限界

**現行QAを「本文の事実誤りを安定して止める仕組み」とは評価できない。** 決定的なのは、抽出済みの値を比較する部分だけである。主張を拾うか、誰に帰属させるか、どの期間かはLLMに依存し、時点スコア・前後半・区間得点には本文とのコード照合がない。

最優先は、①判定過程の保存、②時系列根拠の信頼度と順序の明示、③原文・対象・期間を持つ主張照合、④曖昧な得点者表現の禁止と生成／QAの因果基準の整合である。LLMの採点を繰り返して多数決する方法は勧めない。

| 区分 | 今回確認したこと／確認できないこと |
|---|---|
| コードで確認 | 日本語・イベントありレビューはB系 `recap@5.0.0` を使用する。依頼文にある `recap@4.21.2` はA系で、主な本番経路ではない。[lib/llm/stages/generate-narrative.ts:52](https://github.com/Gosshi/tryline/blob/e74cf00f5992f74667bdb05fe5ccd68462733b32/lib/llm/stages/generate-narrative.ts#L52)、[lib/llm/prompts/variant-b/generate-recap-b.ts:9](https://github.com/Gosshi/tryline/blob/e74cf00f5992f74667bdb05fe5ccd68462733b32/lib/llm/prompts/variant-b/generate-recap-b.ts#L9) |
| 添付で確認 | 指定フォルダの11ファイルを確認。summary、試し焼き1本、不一致9本。元のqa-compare/model-trial内の対応ファイルとバイト単位で一致する。不一致9/28本、うち選手別統計ガードの有無が異なるものは6本。これは監査用標本で、全記事の誤り率ではない |
| 提供値として使用 | 直近30日の本番DB集計。今回DBから取り直していない。47/(57+47)=45.19%、35/(96+35)=26.72%は段階4の実行行ベースの比率 |
| 未確認 | 各実行の生の `statedPlayerStats`、LLM採点の上書き前の値、試し焼きと比較時の根拠JSONの完全一致、公式の前半終了スコア。比較スクリプトは実行時に根拠を再取得するため、「同じ本文」は「全く同じ入力」を保証しない。[scripts/compare-qa-models.ts:355](https://github.com/Gosshi/tryline/blob/e74cf00f5992f74667bdb05fe5ccd68462733b32/scripts/compare-qa-models.ts#L355) |

二つの注意点がある。

1. **F=1だけではコードガード発火の証明にならない。** LLM自身もF=1を返せる（[lib/llm/prompts/qa-content.ts:483](https://github.com/Gosshi/tryline/blob/e74cf00f5992f74667bdb05fe5ccd68462733b32/lib/llm/prompts/qa-content.ts#L483)）。issues／entityVerificationでの確認が必要。保存値は上書き後なので、ガードが動いた記事について元のLLM採点は分からない（[lib/llm/stages/qa.ts:673](https://github.com/Gosshi/tryline/blob/e74cf00f5992f74667bdb05fe5ccd68462733b32/lib/llm/stages/qa.ts#L673)）。
2. **summaryの「reject」はretryを含む。** 不一致9件の非公開側は実際にはretry。`retryCount: 0`での比較なので、生成をやり直した後の最終却下率ではない（添付 `summary.md:30`、[scripts/compare-qa-models.ts:377](https://github.com/Gosshi/tryline/blob/e74cf00f5992f74667bdb05fe5ccd68462733b32/scripts/compare-qa-models.ts#L377)）。

以下、「高」はコードまたは添付で確認、「中」は原因・効果の推定を意味する。提案が未実装である以上、改善率は未測定である。

## 2. 主張の分類と担当

| 主張の種類 | 今の担当 | 推奨の担当／変更の叩き台 | 根拠（現行） | 確度 |
|---|---|---|---|---|
| イベント合計と最終スコア | 集約後のコード | 維持。ただし本文中の最終スコア検査とは別物として記録 | [lib/llm/stages/assemble.ts:338](https://github.com/Gosshi/tryline/blob/e74cf00f5992f74667bdb05fe5ccd68462733b32/lib/llm/stages/assemble.ts#L338)、[lib/llm/pipeline.ts:235](https://github.com/Gosshi/tryline/blob/e74cf00f5992f74667bdb05fe5ccd68462733b32/lib/llm/pipeline.ts#L235) | 高 |
| 本文の最終スコア | LLMのF採点 | 対象match・チームの向きを持つclaimを抽出しDBとコード比較。過去対戦／予想／途中経過と区別 | [lib/llm/prompts/qa-content.ts:251](https://github.com/Gosshi/tryline/blob/e74cf00f5992f74667bdb05fe5ccd68462733b32/lib/llm/prompts/qa-content.ts#L251)、`:478`、[lib/llm/stages/qa.ts:397](https://github.com/Gosshi/tryline/blob/e74cf00f5992f74667bdb05fe5ccd68462733b32/lib/llm/stages/qa.ts#L397) | 高 |
| 勝者・引き分け | LLMの `statedWinner` → コード | 全文の明示主張を原文付きで検査。drawも値に含める。勝者不明と引き分けを分離 | [lib/llm/stages/qa.ts:64](https://github.com/Gosshi/tryline/blob/e74cf00f5992f74667bdb05fe5ccd68462733b32/lib/llm/stages/qa.ts#L64)、`:419`、[lib/llm/prompts/qa-content.ts:252](https://github.com/Gosshi/tryline/blob/e74cf00f5992f74667bdb05fe5ccd68462733b32/lib/llm/prompts/qa-content.ts#L252) | 高 |
| ある得点直後のスコア・点差 | LLMのF採点 | event参照／before・after、チーム方向を持つclaimをコード比較。同分内順序が不明なら不明扱い | [lib/llm/prompts/qa-content.ts:452](https://github.com/Gosshi/tryline/blob/e74cf00f5992f74667bdb05fe5ccd68462733b32/lib/llm/prompts/qa-content.ts#L452)、[lib/llm/types.ts:42](https://github.com/Gosshi/tryline/blob/e74cf00f5992f74667bdb05fe5ccd68462733b32/lib/llm/types.ts#L42) | 高 |
| 前半／後半の帰属、HTスコア | LLMのF採点。材料は40分境界で計算 | periodまたは検証済みのHT根拠を使用。単純なminute境界を真実として昇格させない | [lib/llm/stages/assemble.ts:228](https://github.com/Gosshi/tryline/blob/e74cf00f5992f74667bdb05fe5ccd68462733b32/lib/llm/stages/assemble.ts#L228)、[lib/llm/stages/derived-stats.ts:149](https://github.com/Gosshi/tryline/blob/e74cf00f5992f74667bdb05fe5ccd68462733b32/lib/llm/stages/derived-stats.ts#L149) | 高 |
| 区間の得点・点差変化・連続得点 | LLMのF採点 | 区間の開始前／終了後のevent境界を固定しコード差分。最大リード／逆転前点差も別指標 | [lib/llm/stages/derived-stats.ts:148](https://github.com/Gosshi/tryline/blob/e74cf00f5992f74667bdb05fe5ccd68462733b32/lib/llm/stages/derived-stats.ts#L148)、[lib/llm/prompts/variant-b/shared.ts:47](https://github.com/Gosshi/tryline/blob/e74cf00f5992f74667bdb05fe5ccd68462733b32/lib/llm/prompts/variant-b/shared.ts#L47) | 高 |
| 選手別トライ・CG・PG・総得点 | LLM抽出 → 全試合集計とコード比較 | 原文、選手・チーム、指標、期間、exact/at-least、event集合を保持。単一得点・区間と全試合を分離 | [lib/llm/stages/qa.ts:66](https://github.com/Gosshi/tryline/blob/e74cf00f5992f74667bdb05fe5ccd68462733b32/lib/llm/stages/qa.ts#L66)、`:286`、`:435` | 高 |
| カードの人・色・時刻 | LLMのF採点 | eventに対象・時間・種別があればコード照合。発言fact由来でしか確認できない場合は別の根拠種別 | [lib/llm/prompts/qa-content.ts:457](https://github.com/Gosshi/tryline/blob/e74cf00f5992f74667bdb05fe5ccd68462733b32/lib/llm/prompts/qa-content.ts#L457)、[lib/llm/stages/derived-stats.ts:201](https://github.com/Gosshi/tryline/blob/e74cf00f5992f74667bdb05fe5ccd68462733b32/lib/llm/stages/derived-stats.ts#L201) | 高 |
| シンビン「中」の失点 | 機械算出値をLLMが採点 | 復帰・period・時計・同分順序が確認できたときだけコード比較。現在の固定10分窓を実在の在場区間と同一視しない | [lib/llm/stages/derived-stats.ts:209](https://github.com/Gosshi/tryline/blob/e74cf00f5992f74667bdb05fe5ccd68462733b32/lib/llm/stages/derived-stats.ts#L209) | 高 |
| 人物の使用許可 | LLM抽出・対応付け＋許可集合／fact照合 | 維持し、既知の別名はコードで一意解決。存在許可と「その人が蹴った」は別検査 | [lib/content/allowed-entities.ts:65](https://github.com/Gosshi/tryline/blob/e74cf00f5992f74667bdb05fe5ccd68462733b32/lib/content/allowed-entities.ts#L65)、[lib/llm/stages/verify-entities.ts:112](https://github.com/Gosshi/tryline/blob/e74cf00f5992f74667bdb05fe5ccd68462733b32/lib/llm/stages/verify-entities.ts#L112) | 高 |
| チーム統計・0という断定・直近成績・順位 | LLM＋語／数値存在ガード | 根拠をsubject/metric/value/scope/as-ofの組で比較。現ガードを単純削除しない | [lib/content/fabrication-guard.ts:112](https://github.com/Gosshi/tryline/blob/e74cf00f5992f74667bdb05fe5ccd68462733b32/lib/content/fabrication-guard.ts#L112)、`:135`、[lib/llm/stages/qa.ts:506](https://github.com/Gosshi/tryline/blob/e74cf00f5992f74667bdb05fe5ccd68462733b32/lib/llm/stages/qa.ts#L506) | 高 |
| 字数・必要見出し | コード＋重複したLLM指示 | コードに統一。字数を満たすかはコード、冗長さはLLM。見出し欠落は専用理由にする | [lib/llm/stages/qa.ts:571](https://github.com/Gosshi/tryline/blob/e74cf00f5992f74667bdb05fe5ccd68462733b32/lib/llm/stages/qa.ts#L571)、`:589`、[lib/llm/prompts/qa-content.ts:472](https://github.com/Gosshi/tryline/blob/e74cf00f5992f74667bdb05fe5ccd68462733b32/lib/llm/prompts/qa-content.ts#L472) | 高 |
| 原因、評価、比較の意味、文体、反復 | LLM | LLMに残す。原因の観測根拠、引用した原文位置、問題の説明を必須にする。コードが検証した数値を再計算して覆させない | [lib/llm/prompts/qa-content.ts:478](https://github.com/Gosshi/tryline/blob/e74cf00f5992f74667bdb05fe5ccd68462733b32/lib/llm/prompts/qa-content.ts#L478)、`:485` | 高 |
| 数字だけからの心理・疲労・守備崩壊、根拠なしの戦術機構 | LLM任せになり得る | 生成で書かせない。因果の観測があればその範囲だけ許容。QAも因果の創作を要求しない | [lib/llm/prompts/variant-b/shared.ts:32](https://github.com/Gosshi/tryline/blob/e74cf00f5992f74667bdb05fe5ccd68462733b32/lib/llm/prompts/variant-b/shared.ts#L32)、[lib/llm/prompts/qa-content.ts:326](https://github.com/Gosshi/tryline/blob/e74cf00f5992f74667bdb05fe5ccd68462733b32/lib/llm/prompts/qa-content.ts#L326) | 高 |
| キッカー不明時の個人帰属、scope不明の本数、順序不明の瞬間スコア | LLMが補完／抽出省略し得る | 生成で個人帰属・細区間を避ける。検査ではunverifiableとして止め、チーム得点・確認可能な区間に書き換える | [lib/llm/prompts/qa-content.ts:275](https://github.com/Gosshi/tryline/blob/e74cf00f5992f74667bdb05fe5ccd68462733b32/lib/llm/prompts/qa-content.ts#L275)、[lib/llm/stages/qa.ts:460](https://github.com/Gosshi/tryline/blob/e74cf00f5992f74667bdb05fe5ccd68462733b32/lib/llm/stages/qa.ts#L460) | 高 |
| キック試投数・成功率、履歴不十分な「史上初」、材料のない次戦予測 | 指示の禁止とLLM採点 | 根拠の完全性が仕様化されるまで生成しない。CGの試投可能数を個人の実試投数と同一視しない | [lib/llm/prompts/variant-b/shared.ts:31](https://github.com/Gosshi/tryline/blob/e74cf00f5992f74667bdb05fe5ccd68462733b32/lib/llm/prompts/variant-b/shared.ts#L31)、`:51`、[lib/llm/prompts/shared-prompt-blocks.ts:33](https://github.com/Gosshi/tryline/blob/e74cf00f5992f74667bdb05fe5ccd68462733b32/lib/llm/prompts/shared-prompt-blocks.ts#L33) | 高 |

「コードで照合可能」は「自由文からコードだけで完全に意味を読める」という意味ではない。**自由文＋LLM抽出を残したまま、全主張の検出を決定的と呼ぶことはできない。** 対象を絞った文型の機械検出、抽出漏れの検査、曖昧時の保留を組み合わせる必要がある。

LLMとコードが食い違った場合、単に「コードでpassだから」と既存のF<=2を引き上げて公開しない。原文と対象eventの対応を点検し、解決しなければ保留する。責任分担を改める仕様では、LLMに機械検証項目の再計算・訂正を要求せず、残る因果・意味判断を担当させる。既存のhard blockを迂回する実装は提案していない。

## 3. P1修正案（この順で仕様化）

### P1-1: 採点・抽出・ガード・最終判断を別々に保存する

現行の `parseQaResponse` はraw採点をガードで上書きし、抽出結果は戻り値に残さない（[lib/llm/stages/qa.ts:642](https://github.com/Gosshi/tryline/blob/e74cf00f5992f74667bdb05fe5ccd68462733b32/lib/llm/stages/qa.ts#L642)）。段階4は最終QaResultとentity結果を保存するだけで、入力ハッシュも本文だけ（[lib/llm/pipeline.ts:692](https://github.com/Gosshi/tryline/blob/e74cf00f5992f74667bdb05fe5ccd68462733b32/lib/llm/pipeline.ts#L692)）。この状態では抽出誤り、比較誤り、LLM採点のどれかを切り分けられない。

追加候補は既存 `pipeline_runs.output` の診断情報。DBスキーマ変更を前提にしない。

- pipeline実行ID、attempt、revisionか通常生成か、match_id/type/language、本文hash。
- usable根拠のhashと再現用スナップショット参照、QA/entity/生成のモデル・prompt版、claim schema版、guard版。
- `llmScores`、`llmIssues`、抽出claims、`guardChecks`、`effectiveScores`、最終verdict、publishを妨げた全reason code。
- guardChecksには本文span、対象、期間、claimed/actual、根拠event参照、`verified / contradicted / unverifiable` を保存する。
- 生スクレイプや秘密情報は保存・公開しない。内部診断には必要な最小限の本文抜粋と正規化根拠のみ。

スコアは4項目すべて整数1〜5、claimは型・必須項目・原文範囲を検証する。現在はscoresの存在確認だけで、壊れたstat項目は黙って捨てる（[lib/llm/stages/qa.ts:280](https://github.com/Gosshi/tryline/blob/e74cf00f5992f74667bdb05fe5ccd68462733b32/lib/llm/stages/qa.ts#L280)、`:286`、`:659`）。壊れた応答を「主張なし」と扱わず、既存のJSON再試行後に非公開にする。JSON schemaの説明文だけでは入力検証にならない（[lib/llm/openai.ts:35](https://github.com/Gosshi/tryline/blob/e74cf00f5992f74667bdb05fe5ccd68462733b32/lib/llm/openai.ts#L35)）。

対のテスト:

| 通る例 | 落ちる／別扱いになる例 |
|---|---|
| 全てのscoreが整数1〜5、引用位置が実際の本文と一致 | scoreが文字列 `"5"`／6／欠損、本文にないspan → schema_error。正常採点でpublishに化けない |
| LLM F=5、統計不一致でeffective F=1。両値・該当claimを保存 | 同じ不一致でraw F=1としてしか記録されない → 診断保存テスト失敗 |
| publish、retry、rejectをそれぞれのverdictとして集計 | rejectをsuccess行だから公開成功と数える → 集計テスト失敗 |

実装時のテストはモックLLMでよい。既存テストは指定した `statedPlayerStats` の比較を検証しており、自由文から正しく拾われたことの証明ではない（[tests/llm/stages/qa.test.ts:642](https://github.com/Gosshi/tryline/blob/e74cf00f5992f74667bdb05fe5ccd68462733b32/tests/llm/stages/qa.test.ts#L642)）。

### P1-2: 時系列の根拠を正してから、本文の時系列をコード照合する

**先に材料の問題を扱う。** 現在はイベントをminuteだけで並べ、id・period・source sequenceを生成／QAへ渡していない（[lib/llm/stages/assemble.ts:742](https://github.com/Gosshi/tryline/blob/e74cf00f5992f74667bdb05fe5ccd68462733b32/lib/llm/stages/assemble.ts#L742)、[lib/llm/types.ts:213](https://github.com/Gosshi/tryline/blob/e74cf00f5992f74667bdb05fe5ccd68462733b32/lib/llm/types.ts#L213)）。同分内の順序も、最終スコア一致からは保証できない。null時刻はtimelineでは0、derivedでは時間集計から除外される（[lib/llm/stages/assemble.ts:221](https://github.com/Gosshi/tryline/blob/e74cf00f5992f74667bdb05fe5ccd68462733b32/lib/llm/stages/assemble.ts#L221)、[lib/llm/stages/derived-stats.ts:117](https://github.com/Gosshi/tryline/blob/e74cf00f5992f74667bdb05fe5ccd68462733b32/lib/llm/stages/derived-stats.ts#L117)）。

提案する正規化材料（必要フィールドが取得可能かを実装前に仕様確認する）:

```ts
type TimelineEvent = {
  eventRef: string; // 内部ID。元ソースの時系列を保証するものではない
  period: "first_half" | "second_half" | "extra_time" | "unknown";
  displayClock: string | null; // 40+1等。画面表記を保持
  minute: number | null;
  sourceSequence: number | null;
  orderVerified: boolean;
  team: "home" | "away";
  playerRef: string | null;
  type: string;
  points: number;
  before: { home: number; away: number } | null;
  after: { home: number; away: number } | null;
};
```

併せて `halftime: {home, away, evidenceRef, verified}`、team/metricごとの完全性を持つ。HT・各eventのperiod・前後半合計の整合を検査する。公式HTとイベント合計が食い違う場合は根拠エラーとして止め、LLMに選ばせない。period不明を `minute > 40` で埋めない。同分順序の根拠がなければ分終了時の確定合計だけを使い、個別event直後の値は使わない。ランダムなID順を付けて「正しい順序」とみなすのも不可。

現在の最終スコア一致ゲートはそのまま維持する。そこへ時刻・period・帰属の検査を追加する。最終合計の一致は必要条件であり、各中間値が正しいことの十分条件ではない（[lib/llm/stages/assemble.ts:396](https://github.com/Gosshi/tryline/blob/e74cf00f5992f74667bdb05fe5ccd68462733b32/lib/llm/stages/assemble.ts#L396)）。

生成とQAに**同じ**正規化材料を渡す。本文の得点主張はP1-3の共通claim形式で、前半終了、event後、区間、点差をコード比較する。時点を特定できない主張はunverifiable。時間情報不足では、最終結果など確認可能な主張だけを許す。

対のテスト:

| 通る例 | 落ちる／保留になる例 |
|---|---|
| 検証済みHT=47–10のfixtureで「前半終了の差は37点」 | 「前半終了の差は44点」→ contradicted |
| 検証済みperiodが後半の45分トライを「後半45分」と記述 | 同じeventを「前半終了まで」に含める → contradicted |
| first_halfの40+1分CGを前半に含める | minute=41という理由だけで後半に含める → timelineテスト失敗 |
| 38分後42–10 → 45分後54–10なら区間12得点・44点差 | 「前半に12点」と期間を付け替える → period照合で落ちる |
| 順序根拠ありで44分のCG直後26–21 | 同じevent直後を21–21とする → contradicted |
| 同分順序不明なら「44分終了時26–21」のみ | 順序不明の「トライ直後」のスコア → unverifiable。作った順序で断定しない |
| null時刻の得点を全試合合計にだけ含める | nullを0分として「開始直後の得点」に使う → unverifiable |

カードの色・人・時刻にも同じ仕組みを使う。ただし退場後の人数や復帰は競技・大会ルール／実際の交代記録が必要で、色とminuteだけから自動補完しない。

### P1-3: statedPlayerStatsを「原文と期間のある主張」にする

現在は `playerName + counts` だけであり、区間と全試合を区別できない。さらに「得点者名一覧に対応できなければ含めない」という指示があり、検出したが同定できない主張が消える（[lib/llm/prompts/qa-content.ts:270](https://github.com/Gosshi/tryline/blob/e74cf00f5992f74667bdb05fe5ccd68462733b32/lib/llm/prompts/qa-content.ts#L270)）。

叩き台は次のとおり。新規LLM呼び出しは設けず、既存QAの出力を拡張する。

```ts
type Claim = {
  sourceSpan: { start: number; end: number; text: string };
  scopeSpan: { start: number; end: number; text: string } | null;
  kind: "player_count" | "score" | "margin" | "event" | "winner";
  subject: { surface: string; team: "home" | "away" | null;
             playerRef: string | null };
  scope: { kind: "match" | "half" | "interval" | "event" | "unknown";
           fromEventRef?: string; toEventRef?: string;
           startInclusive?: boolean; endInclusive?: boolean };
  metric: string;
  value: number | { home: number; away: number } | string;
  relation: "exact" | "at_least";
  attribution: "explicit" | "ambiguous";
};
```

この型は説明用で、実装ではkind別discriminated union、期間のhalf値などを必須化する。offsetの単位はJavaScript文字列のUTF-16 index等に固定し、本文を正規化する場合の対応も定義する。

抽出と比較の役割:

1. コードが候補箇所を走査する。スコア対、分、前後半、本／回／点、トライ・CG・PG、カードを対象に、数字だけでなく「二本」「ハットトリック」等の採用対象表現も定義する。全文の否定・引用・過去試合を区別できない候補は除去せず、scope分類へ送る。
2. LLMは原文・対象・期間・数値の抽出と曖昧性分類をする。正誤を判断して修正値を返さず、不明な人名／期間も省略しない。日本語名を英名へ推測置換するよりsurfaceを保持する。
3. コードがspan実在、数値が原文にあること、claimのscope、候補の未処理箇所を検査する。明示文型についてはコード抽出を優先し、LLMが `[]` を返しても通らないようにする。候補ごとの「非主張」分類も無条件に信用しない。
4. 選手はチーム＋一意なID／既知別名で解決する。現行の姓のsuffix一致で最初の1件を採る実装を、曖昧時保留へ変える（[lib/stats/player-stats.ts:38](https://github.com/Gosshi/tryline/blob/e74cf00f5992f74667bdb05fe5ccd68462733b32/lib/stats/player-stats.ts#L38)、`:83`）。辞書にいることを出場許可にはしない。
5. コードが対象event集合で集計する。exactは一致、at_leastは下限を比較する。scope不明を全試合に暗黙変換しない。前文にある期間はscopeSpanで保持する。
6. `contradicted` は既存F=1相当のhard blockへ、`unverifiable`／曖昧／未処理候補も非公開の修正対象へ。数値・entityの既存ガードは保持する。適切なscopeを理解するよう既存比較を改める変更は、仕様改訂と正誤対の回帰テストを先に行う。

キッカー名が欠ける場合、現在はそのチームのキック／総得点検査を広くスキップする（[lib/llm/stages/qa.ts:460](https://github.com/Gosshi/tryline/blob/e74cf00f5992f74667bdb05fe5ccd68462733b32/lib/llm/stages/qa.ts#L460)）。これを「一致」と記録してはいけない。分かる範囲の下限／上限で明確に矛盾する主張は止め、残りはunverifiableとし、個人の断定を書かせない。名前がないイベントを勝手に特定選手に配賦しない。

「〇〇のトライとコンバージョン」は、**個人のCG=1という確定主張へ機械変換せず、帰属曖昧のissueとして止める**。誤りだと断定しなくても、読者に曖昧な本文を公開しない方針にできる。「〇〇がトライとCGを決めた」は明示的な個人帰属であり、別のclaimとして照合する。

揺れへの対処は、抽出の再抽選より次の順序がよい。

- 明示的な危険文型と数値候補をコードで拾う。
- 解釈不能なら公開しない。LLMの「自信あり」を通行証にしない。
- 原文単位のfixtureで抽出器と照合器を別々に評価する。
- さらに安定が必要な高リスク主張は、生成時に検証済みfact参照から定型文をコードで描画する。生成LLMが出したfact参照と自由文の対応だけを信用してはいけない。

最後の方式なら、その文型の値・人・期間・表現を決定的にできる。その他の自由文に同種の主張が残れば、依然として検査対象である。汎用NLP基盤の先行開発は不要で、今回の得点・期間表現から始める。

対のテスト:

| 通る例 | 落ちる／保留になる例 |
|---|---|
| 「31分から前半終了までにベローがCGを2本」→ 対象区間2本 | 「試合全体でベローがCGを2本」→ 実際は4本、contradicted |
| 前文が区間を示し、次文が「ベローが2本」。scopeSpanが前文を指す | 同じ本文をscope=matchと抽出 → 抽出fixture失敗。全試合集計4本との誤比較を防ぐ |
| 「試合全体でフォードがCGを4本」→ 実際4本 | 「71分以降にフォードがCGを4本」→ 区間2本、contradicted |
| 「キーナンのトライと、プレンダーガストのCG」 | 「キーナンのトライとCG」→ ambiguous_attribution。個人CG=1を捏造抽出しない |
| 「キーナンはトライ、プレンダーガストはCGを決めた」 | 「キーナンがトライとCGを決めた」→ 実際のeventと矛盾 |
| 名前・チームが一意、実際4本で「少なくとも2本」 | 実際1本で「少なくとも2本」→ contradicted。exact比較と混同しない |
| 試合全体の統計が正しく、LLM抽出にも候補漏れなし | 明示的な「Xがトライ2本」をLLMが省略／playerRef=null → 未処理またはunresolvedで止める |
| 同名姓でもチーム＋IDで一意に解決 | 姓しかなく同一候補が複数 → unverifiable。最初の選手を採らない |
| キッカー不明なら「チームはCGで2点を加えた」 | 同じ材料で「Xが蹴った」→ unverifiable。欠損を0とも成功とも扱わない |

各guard単体で通っても記事全体のpublishを意味しない。他の安全装置・F/T/J/密度・構成の判定は引き続き必要。

### P1-4: 本番BとQAを同時に整える

得点者の曖昧な接続を防ぐ指示は必要。ただしAの `generate-recap.ts` だけに足しても、本番Bには効かない。

配置候補は、共通の得点帰属ルールを `shared-prompt-blocks.ts` に定義し、Aと `variant-b/shared.ts` の両方で明示的に組み込む。字数改訂プロンプトにも適用する。単に定数を作っただけではBへ入らない。

提案文:

> トライとコンバージョンを続けて書く場合、誰が蹴ったかを明示する。「Aのトライとコンバージョン」は使わず、「AのトライとBのコンバージョン」と書く。キッカーが確認できなければ、個人に帰属させず「Aのトライ後、チームは追加点を得た」のように書く。

時系列ルールは `variant-b/shared.ts` の「時間と点差」に追記し、Aでも同じ材料定義を利用する。minuteだけで前後半を推測せず、検証済みperiod／HT／event前後スコアに従う。得点者表にはtry scorerとkickerを別々に示すが、トライとCGの組合せも時刻の近さだけで勝手に作らない。

**生成Bはカード前後の時系列と因果を区別するのに、QAは「カードと該当局面の因果に触れない場合は密度を下げる」と要求している。** [lib/llm/prompts/variant-b/generate-recap-b.ts:44](https://github.com/Gosshi/tryline/blob/e74cf00f5992f74667bdb05fe5ccd68462733b32/lib/llm/prompts/variant-b/generate-recap-b.ts#L44) と [lib/llm/prompts/qa-content.ts:326](https://github.com/Gosshi/tryline/blob/e74cf00f5992f74667bdb05fe5ccd68462733b32/lib/llm/prompts/qa-content.ts#L326) は未整合。実際、添付のイングランド対日本の密度3のissuesはカードへの言及不足であり、単なる文章の薄さとは分ける必要がある。

QA側は「記事の問いに必要なカード事実と、その前後の記録上の変化を適切に扱う。直接原因は観測根拠があるときだけ要求する」へ改める。記録だけに基づく比較を、戦術機構の記述がない理由だけで低く評価しない。数値や実名の量ではなく、問いへの答えと裏付けのつながりを評価する。

対のテスト:

| 通る例 | 落ちる例 |
|---|---|
| A/B/字数改訂すべての組立promptに同じ帰属ルールを含む | Aにだけ追加し、本番Bと改訂promptにない → promptテスト失敗 |
| 「カード後の区間で7点差が動いた」と記録比較 | 根拠なく「カードが守備崩壊を引き起こした」→ 根拠不足として止める |
| 記事の問いに沿う、根拠付きの得点比較 | 同じ比較に未確認の接点・疲労を付け足す → 加筆で評価が上がらず、F違反が付く |

最後の二つはLLMの意味判断を含むため、コードの単体テストだけで品質保証できない。プロンプト組立のオフライン検証と、Owner承認後の固定入力評価を分けて実施する。

## 4. P2修正案

### P2-1: 密度4を「証拠のない1点差」に依存させない

レビューD>=4は既存仕様・Owner判断であり、無断で3へ下げない（[specs/fix-qa-gate-density.md:95](https://github.com/Gosshi/tryline/blob/e74cf00f5992f74667bdb05fe5ccd68462733b32/specs/fix-qa-gate-density.md#L95)）。ただし、D=3の現ルーブリックは「情報密度は普通」、D=4との差に字数も混在し、字数は既にコードで測定している（[lib/llm/prompts/qa-content.ts:332](https://github.com/Gosshi/tryline/blob/e74cf00f5992f74667bdb05fe5ccd68462733b32/lib/llm/prompts/qa-content.ts#L332)）。さらにD=5にはfacts約7割という網羅基準があり、Bの「問いに必要な事実を選ぶ」方針とは一致しない。

短期案: D>=4を維持したまま、各減点に本文span・欠けた内容・根拠を付ける。字数はルーブリックの判断から除外し、専用ガードに任せる。「材料にない戦術を書かなかった」「因果を断定しなかった」は減点理由にしない。数字だけのD=3/4を保存せず理由を必須化する。

中期の仕様改訂案: 事実のゲートと編集品質を分離し、次を証拠付きの項目判定にする。

- 中心の問いへの回答があるか。
- その答えを支える根拠・比較があるか。
- 有料節が無料節の反復だけになっていないか。
- 根拠のない一般論・反復が支配的でないか。

これらにもLLM判断は残る。全項目通過なら「密度4相当」とする等の基準をOwnerが決め、D=3という整数だけで通常生成を引き直す方式を置き換える。反復検出は補助コードにできるが、事実の多さや文数を新しい代理指標にしない。判定不能は保留とし、安全ゲートを迂回して公開しない。

対の評価例: 根拠付きの区間比較と新しい結論がある本文は通し、同じ事実を言い換えただけの本文は編集不合格とする。前者を「実名が少ない」だけで不合格にしない。数値を一つ誤らせた変異版は編集評価に関係なく事実ゲートで落とす。改訂前後を固定本文・固定根拠で比較し、正しい記事の誤ブロックと誤った記事の通過を別々に測る。

同じ本文を何度もQAへ投げ、最高点を採る／通るまで投げる方法は不可。誤りが最終的に通る確率を上げてしまう。多数決でも正しさは保証されず呼び出しだけ増える。

### P2-2: 統計・人物役割の照合を主語と期間に結び付ける

前回P1の未解消部分。現在は、記事に現れる「ポゼッション」「60%」がどこかのfactにあれば通り得る一方、どちらか一方に反則があれば「反則なし」を他方に書いても止め得る。特定人物ではなく、本文全体のポジション語共起でラインアップ不足を判定する（[lib/content/fabrication-guard.ts:101](https://github.com/Gosshi/tryline/blob/e74cf00f5992f74667bdb05fe5ccd68462733b32/lib/content/fabrication-guard.ts#L101)、`:148`、`:203`）。

P1-3のclaimをチーム統計へ段階拡張する。数値はteam/metric/value/scopeの一致で検査する。人名使用許可、出場・先発、役割・評価は別属性で検証する。sourced factの単語一致を「その人の先発」の証明にしない。既存ガードを一括解除する変更はしない。

対のテスト:

- home反則0、away反則8なら「homeは反則0」が通り、「awayは反則0」が落ちる。
- homeポゼッション40%、away60%なら正しい帰属は通り、逆帰属・41%への改変が落ちる。
- factに「Aは欠場」があれば欠場の言及は通り、「Aが先発」は落ちる。
- 未確定lineupしかなければ、その名前での先発記述は落ちる。出典で確認された選手と役割があれば通る。

### P2-3: 同一本文の再評価と修正を再現可能にする

QAの再利用キーはmatch_idだけでは不足。match_id/type/language＋本文hash＋usable根拠hash＋QA/entityのモデル・prompt版＋claim/guard版で特定する。本文や根拠・ガード更新時は再計算する。キャッシュは揺れを固定するだけで、誤りを直す機能ではない。P1の検査を先に整える。

通常の再生成には、検証済みissueのspan、理由、正規化根拠をフィードバックする。現在の人名違反以外を伝えない再生成（[lib/llm/pipeline.ts:545](https://github.com/Gosshi/tryline/blob/e74cf00f5992f74667bdb05fe5ccd68462733b32/lib/llm/pipeline.ts#L545)、[lib/llm/stages/generate-narrative.ts:168](https://github.com/Gosshi/tryline/blob/e74cf00f5992f74667bdb05fe5ccd68462733b32/lib/llm/stages/generate-narrative.ts#L168)）を、同じ失敗の引き直しから対象修正へ変える。LLMの未検証の「正解」を新しい事実として渡さない。修正後は記事全体の既存QA・entityガードを再実行する。

対のテスト: 完全一致のキーなら同じ結果を再利用し、本文一文字・eventのperiod・guard版のいずれかが変われば再検査する。誤った45分の前半帰属にはそのissueを渡し、正しい後半帰属には誤った訂正指示を渡さない。修正で別の選手名・数値誤りを入れた版は全体QAで落ちる。

## 5. 添付本文での机上検証

以下は提案後の部分検査の期待値。未実装のため実際に提案コードを走らせた結果ではない。Pythonで添付JSONの本数・スコア・ガード差の集計を検算した。公式記録との再照合はしていない。

| 本文・主張 | 提案した仕組みでの扱い | 留保・根拠 |
|---|---|---|
| ENG–JPN fast6「前半終了までに…45分のトライ…12点」「前半…44点差」 | 45分eventが後半と確認されればperiod不一致。HT=47–10を権威ある根拠として確認できれば44点差は37点差と矛盾。LLM F=5でも公開不可 | `tmp/gpt-qa-audit-2026-11-16/76171330-c00b-4daa-8332-f9181976aa92-fast6.md:30` |
| 同じ本文「38分42–10から45分54–10へ12点」だけ | 両event後の累計差としては一致。誤りは足し算ではなく「前半」という帰属 | 同ファイル`:30`。区間の事実まで誤りと扱わない |
| 修正版「38分から後半45分までに12点。前半終了の差は37点」 | 当該2claimは、periodとHTの検証後に通る | 記事中の他の主張・編集基準は別途検査 |
| キーナン／ライナハ／アティソグベ「AのトライとCG」 | ambiguous_attributionで止める。LLMがAのCG=1と読むかに依存させない | 添付アイルランド`:180`、仏–南ア`:138`、仏–フィジー`:202`。別キッカーのeventがある |
| 「Aのトライと、BのCG」でeventが一致 | event単位の得点帰属検査を通る | 氏名を増やすことが必須ではない。キッカー不明ならチームの加点として書く |
| ベロー「31分から前半終了まで…CG2本」 | scope=intervalなら2本で通る。全試合は4本なので、全試合2本という改変版は落ちる | 添付ノーザンプトン`:158`。CGは36分と40分、および後半の2本。原文のscopeを保持する |
| フォード「4本のトライ後のCGをすべて成功」 | 明示的に全試合とすれば4本で一致。元の文脈は直前に71分以降の話があるため、scope曖昧なら言い換え要求 | 添付バース`:212`。FordのCGは14/45/72/80分。71分以降だけなら2本。raw抽出がないため、今回の不一致を「Fordを誤抽出した」とまでは断定できない |
| WAL–NZ「NZのCG後26–21」 | 添付に記録されたevent順を正と置けば一致。21–21という訂正は誤り。コード比較ならその訂正を採用しない | 添付ウェールズ`:192`。44分にhomeトライ→away CGの順。ただし現DB取得はminuteのみのsortなので、その順序の実在性は別途確認が必要 |

**ENG–JPNには材料側の未解決点がある。** 添付timelineはHT=47–10、40分トライ後47–10、41分CG後49–10、45分トライ後54–10（同試合の比較ファイル`:12`、`:130`、`:138`、`:146`）。HT=47–10は現コードの `>40` 境界と整合するが、それだけで実際のHTの証明にはならない。41分のCGが前半ならHTの算出が誤りであり、後半ならそのperiodを裏付ける資料が必要。この監査では47–10を公式に確認できていない。

したがって、この例への最初の安全な対応は「HT/periodの根拠を確認するまで公開保留」。確認後に、誤った本文を落とす。今あるhtフィールドをそのまま新しい強制ゲートに使い、正しい本文を落とす実装は勧めない。

また、試し焼きfast6と比較スクリプトの全入力が同一だった証拠は保存されていない。添付で両モデルF=5が確認できるfile-2/file-3とfast6本文の対応は、summary単体では示されない。**実行ごとの判定差というOwner報告は採用するが、その全原因がモデルの非決定性だったとまでは今回の資料から証明できない。** 入力hash・抽出結果の保存がここでも必要になる。

## 6. プレビュー作り直し率45%の解釈と計測

`DENSITY_PUBLISH_MIN=4` はレビュー限定（[lib/llm/stages/qa.ts:382](https://github.com/Gosshi/tryline/blob/e74cf00f5992f74667bdb05fe5ccd68462733b32/lib/llm/stages/qa.ts#L382)）。プレビューは他軸と同じくD>=3なので、レビューのD=3/4問題をプレビュー45%の主因にするのは誤り。

現時点での原因候補:

| 候補 | 確認できた仕組み | 45%への寄与 |
|---|---|---|
| ラインアップ未確認なのに人物・役割・先発を述べる | 本文全体のキープレイヤー語＋ポジション語を検査。confirmed lineup/event/lineup factのどれかがあれば一括スキップ。特定の人・役割を照合していない | Owner提示の1件は該当。全47行の主因かは不明 |
| 数値の単語一致ガード／0断定の両チーム混同 | 前回指摘と同じ限界が残る | あり得る。頻度未測定 |
| 入力不足からの予測・能力評価 | sparse指示に予想スコア、得失点差の正負から攻守評価、戦術描写要求が残る（[lib/llm/prompts/generate-preview.ts:33](https://github.com/Gosshi/tryline/blob/e74cf00f5992f74667bdb05fe5ccd68462733b32/lib/llm/prompts/generate-preview.ts#L33)、`:163`） | 裏付け・戦術採点低下への寄与は仮説 |
| 冒頭字数・内容指示の矛盾 | 本体200字以内、ラッパー250〜350字（[lib/llm/prompts/generate-preview.ts:84](https://github.com/Gosshi/tryline/blob/e74cf00f5992f74667bdb05fe5ccd68462733b32/lib/llm/prompts/generate-preview.ts#L84)、[lib/llm/stages/generate-narrative.ts:206](https://github.com/Gosshi/tryline/blob/e74cf00f5992f74667bdb05fe5ccd68462733b32/lib/llm/stages/generate-narrative.ts#L206)） | 反復や字数救済への寄与は仮説 |
| 字数不足、羅列、LLMのF/T/Jの低得点、人名照合 | 実装上は別々のretry原因 | 集計がないので順位付け不可 |

下書き11本のF=1は最終的に残った失敗の分布であって、途中のretry47行の原因分布ではない。公開記事平均も通過後の標本なので、QA感度の評価には使えない。

既存ログを読む場合もstatusだけで成功率を計算しない。現在は `verdict === retry ? retry : success` なのでrejectもstatus=successで記録される（[lib/llm/pipeline.ts:703](https://github.com/Gosshi/tryline/blob/e74cf00f5992f74667bdb05fe5ccd68462733b32/lib/llm/pipeline.ts#L703)、`:881`）。例外失敗と品質不合格を分け、`output.qa.verdict` を使う。さらに同一記事の再試行・字数改訂を同じ母数に混ぜない。

P1-1実装後の集計単位:

1. attemptベースの全reason code出現率（重複可）。raw LLM由来とコード由来を分ける。
2. runベースの初回不合格率、最終非公開率、平均生成回数。言語・type・prompt版・大会・根拠量で分ける。
3. 修正の前後でどのissueが消え、どのissueが新しく出たか。
4. Ownerが正誤を付けた固定標本で、誤主張の通過率、正しい主張の誤ブロック率、検証不能率、claim抽出漏れ率。headlineのpublish率だけを最適化しない。

全47行のissue内訳と実行単位が揃うまでは「主な原因はX」とは断定しない。既存出力にguard issueが残る分は、追加LLMなしで初期分類できる。

## 7. 前回指摘の短い確認

判定は現コミットの実行経路を含む。Aのコードが残っていてBで回避した場合はその旨を記す。設計改善の実装効果・本番の発生率を証明した表ではない。

### 7.1 content-prompt-auditのP1全9件

| 前回P1 | 状態 | 今の根拠 |
|---|---|---|
| 人物辞書を非人物として除外 | 解消（当該経路） | 非人物はteam/competitionのみ。人物別名は許可済み本人にだけ追加。[lib/content/allowed-entities.ts:92](https://github.com/Gosshi/tryline/blob/e74cf00f5992f74667bdb05fe5ccd68462733b32/lib/content/allowed-entities.ts#L92)、`:146` |
| 抽出・加筆から未確定lineup等が再流入 | 解消（通常経路） | usableを作り抽出、生成、加筆、QAへ渡す。[lib/llm/lineups.ts:57](https://github.com/Gosshi/tryline/blob/e74cf00f5992f74667bdb05fe5ccd68462733b32/lib/llm/lineups.ts#L57)、[lib/llm/pipeline.ts:470](https://github.com/Gosshi/tryline/blob/e74cf00f5992f74667bdb05fe5ccd68462733b32/lib/llm/pipeline.ts#L470)、`:485`、`:546`、`:728`、`:606` |
| PG数を反則・規律と読み替え | 解消（当該指示） | penalty_goal_countへ意味を明示。[lib/llm/stages/assemble.ts:159](https://github.com/Gosshi/tryline/blob/e74cf00f5992f74667bdb05fe5ccd68462733b32/lib/llm/stages/assemble.ts#L159)、`:182`、[lib/llm/prompts/extract-tactical-points.ts:61](https://github.com/Gosshi/tryline/blob/e74cf00f5992f74667bdb05fe5ccd68462733b32/lib/llm/prompts/extract-tactical-points.ts#L61) |
| 統計ガードの主語・値・期間／選手役割の結合 | 未解消 | 単語・%の存在、両軍のどちらかが正数、全体の語の共起。[lib/content/fabrication-guard.ts:101](https://github.com/Gosshi/tryline/blob/e74cf00f5992f74667bdb05fe5ccd68462733b32/lib/content/fabrication-guard.ts#L101)、`:135`、`:203` |
| previewの予測・攻守評価・戦術描写の強制 | 未解消 | [lib/llm/prompts/generate-preview.ts:37](https://github.com/Gosshi/tryline/blob/e74cf00f5992f74667bdb05fe5ccd68462733b32/lib/llm/prompts/generate-preview.ts#L37)、`:39`、`:163` |
| 根拠のない因果を生成とQAが要求 | 一部 | 本番Bは観測と因果を分離。QAのカード因果減点とAの統計因果要求は残る。[lib/llm/prompts/variant-b/shared.ts:32](https://github.com/Gosshi/tryline/blob/e74cf00f5992f74667bdb05fe5ccd68462733b32/lib/llm/prompts/variant-b/shared.ts#L32)、[lib/llm/prompts/qa-content.ts:326](https://github.com/Gosshi/tryline/blob/e74cf00f5992f74667bdb05fe5ccd68462733b32/lib/llm/prompts/qa-content.ts#L326)、[lib/llm/prompts/generate-recap.ts:238](https://github.com/Gosshi/tryline/blob/e74cf00f5992f74667bdb05fe5ccd68462733b32/lib/llm/prompts/generate-recap.ts#L238) |
| 冒頭と全体の字数二重指定 | 一部 | Bはラッパーを迂回し節最低字数なし。preview/Aは旧ラッパーが残る。[lib/llm/stages/generate-narrative.ts:178](https://github.com/Gosshi/tryline/blob/e74cf00f5992f74667bdb05fe5ccd68462733b32/lib/llm/stages/generate-narrative.ts#L178)、`:203`、[lib/llm/prompts/variant-b/generate-recap-b.ts:46](https://github.com/Gosshi/tryline/blob/e74cf00f5992f74667bdb05fe5ccd68462733b32/lib/llm/prompts/variant-b/generate-recap-b.ts#L46) |
| 片側lineupで双方の実名ノルマ | 一部 | Bは人数ノルマなし。preview最低1マッチアップと片側限定は共存、A最低各3名も残る。[lib/llm/prompts/variant-b/shared.ts:38](https://github.com/Gosshi/tryline/blob/e74cf00f5992f74667bdb05fe5ccd68462733b32/lib/llm/prompts/variant-b/shared.ts#L38)、[lib/llm/prompts/generate-preview.ts:194](https://github.com/Gosshi/tryline/blob/e74cf00f5992f74667bdb05fe5ccd68462733b32/lib/llm/prompts/generate-preview.ts#L194)、`:196`、[lib/llm/prompts/generate-recap.ts:255](https://github.com/Gosshi/tryline/blob/e74cf00f5992f74667bdb05fe5ccd68462733b32/lib/llm/prompts/generate-recap.ts#L255) |
| H2H等の根拠が生成とQAで不一致 | 一部 | H2H・JSTはQAへ供給済み。H2H取得は直近20件から抽出のまま、phaseはQA grounding対象外。[lib/llm/pipeline.ts:308](https://github.com/Gosshi/tryline/blob/e74cf00f5992f74667bdb05fe5ccd68462733b32/lib/llm/pipeline.ts#L308)、[lib/llm/prompts/qa-content.ts:71](https://github.com/Gosshi/tryline/blob/e74cf00f5992f74667bdb05fe5ccd68462733b32/lib/llm/prompts/qa-content.ts#L71)、[lib/llm/stages/assemble.ts:931](https://github.com/Gosshi/tryline/blob/e74cf00f5992f74667bdb05fe5ccd68462733b32/lib/llm/stages/assemble.ts#L931)、`:1001` |

順位の件数鮮度は `played === expected_played` に強化済み（[lib/llm/lineups.ts:8](https://github.com/Gosshi/tryline/blob/e74cf00f5992f74667bdb05fe5ccd68462733b32/lib/llm/lineups.ts#L8)）。これはas-of付きの完全な履歴スナップショット保証とは別であり、ここでその保証が完成したとは判定しない。

### 7.2 prompt-structure-auditのH1〜H14

| 指摘 | 状態 | 今の根拠 |
|---|---|---|
| H1 2000字強制と実QA下限の不一致 | 一部 | 本番Bは1400〜1800目安・節最低なし。Aは2000字強制、QA下限1200。[lib/llm/prompts/variant-b/generate-recap-b.ts:46](https://github.com/Gosshi/tryline/blob/e74cf00f5992f74667bdb05fe5ccd68462733b32/lib/llm/prompts/variant-b/generate-recap-b.ts#L46)、[lib/llm/prompts/generate-recap.ts:87](https://github.com/Gosshi/tryline/blob/e74cf00f5992f74667bdb05fe5ccd68462733b32/lib/llm/prompts/generate-recap.ts#L87)、[lib/llm/content-length.ts:26](https://github.com/Gosshi/tryline/blob/e74cf00f5992f74667bdb05fe5ccd68462733b32/lib/llm/content-length.ts#L26) |
| H2 冒頭ラッパーの字数と見出し名 | 一部 | B迂回、preview/Aは残存。[lib/llm/stages/generate-narrative.ts:178](https://github.com/Gosshi/tryline/blob/e74cf00f5992f74667bdb05fe5ccd68462733b32/lib/llm/stages/generate-narrative.ts#L178)、`:203`、[lib/llm/prompts/generate-preview.ts:84](https://github.com/Gosshi/tryline/blob/e74cf00f5992f74667bdb05fe5ccd68462733b32/lib/llm/prompts/generate-preview.ts#L84) |
| H3 加筆時の引用禁止との衝突 | 未解消 | 改訂で引用禁止、preview/Aで引用1回必須。[lib/llm/stages/generate-narrative.ts:268](https://github.com/Gosshi/tryline/blob/e74cf00f5992f74667bdb05fe5ccd68462733b32/lib/llm/stages/generate-narrative.ts#L268)、[lib/llm/prompts/generate-preview.ts:269](https://github.com/Gosshi/tryline/blob/e74cf00f5992f74667bdb05fe5ccd68462733b32/lib/llm/prompts/generate-preview.ts#L269) |
| H4 「好調」推奨と禁止 | 未解消 | [lib/llm/prompts/generate-preview.ts:38](https://github.com/Gosshi/tryline/blob/e74cf00f5992f74667bdb05fe5ccd68462733b32/lib/llm/prompts/generate-preview.ts#L38)、[lib/llm/prompts/shared-prompt-blocks.ts:24](https://github.com/Gosshi/tryline/blob/e74cf00f5992f74667bdb05fe5ccd68462733b32/lib/llm/prompts/shared-prompt-blocks.ts#L24) |
| H5 キック分母の扱い | 一部 | Bは成功本数へ統一し矛盾回避。種類別の許容条件は未整備、Aは4/5推奨と分母禁止が共存。[lib/llm/prompts/variant-b/shared.ts:31](https://github.com/Gosshi/tryline/blob/e74cf00f5992f74667bdb05fe5ccd68462733b32/lib/llm/prompts/variant-b/shared.ts#L31)、[lib/llm/prompts/generate-recap.ts:229](https://github.com/Gosshi/tryline/blob/e74cf00f5992f74667bdb05fe5ccd68462733b32/lib/llm/prompts/generate-recap.ts#L229)、[lib/llm/prompts/shared-prompt-blocks.ts:33](https://github.com/Gosshi/tryline/blob/e74cf00f5992f74667bdb05fe5ccd68462733b32/lib/llm/prompts/shared-prompt-blocks.ts#L33) |
| H6 previewの勝者・最終スコア指示削除 | 未解消 | [lib/llm/prompts/generate-preview.ts:272](https://github.com/Gosshi/tryline/blob/e74cf00f5992f74667bdb05fe5ccd68462733b32/lib/llm/prompts/generate-preview.ts#L272) |
| H7 未確認の逆転原因・次戦を強制 | 一部 | Bは観測に限定、Aは強制が残る。[lib/llm/prompts/variant-b/shared.ts:43](https://github.com/Gosshi/tryline/blob/e74cf00f5992f74667bdb05fe5ccd68462733b32/lib/llm/prompts/variant-b/shared.ts#L43)、`:56`、[lib/llm/prompts/generate-recap.ts:127](https://github.com/Gosshi/tryline/blob/e74cf00f5992f74667bdb05fe5ccd68462733b32/lib/llm/prompts/generate-recap.ts#L127) |
| H8 根拠のない因果例文 | 一部 | Bでは旧例文を不使用。Aはスクラム→PG等を残す。[lib/llm/prompts/variant-b/generate-recap-b.ts:44](https://github.com/Gosshi/tryline/blob/e74cf00f5992f74667bdb05fe5ccd68462733b32/lib/llm/prompts/variant-b/generate-recap-b.ts#L44)、[lib/llm/prompts/generate-recap.ts:36](https://github.com/Gosshi/tryline/blob/e74cf00f5992f74667bdb05fe5ccd68462733b32/lib/llm/prompts/generate-recap.ts#L36) |
| H9 実名・数値・マッチアップのノルマ | 一部 | Bは役割・問いに必要な項目だけ。preview/Aには残る。[lib/llm/prompts/variant-b/shared.ts:38](https://github.com/Gosshi/tryline/blob/e74cf00f5992f74667bdb05fe5ccd68462733b32/lib/llm/prompts/variant-b/shared.ts#L38)、[lib/llm/prompts/variant-b/generate-recap-b.ts:44](https://github.com/Gosshi/tryline/blob/e74cf00f5992f74667bdb05fe5ccd68462733b32/lib/llm/prompts/variant-b/generate-recap-b.ts#L44)、[lib/llm/prompts/generate-preview.ts:194](https://github.com/Gosshi/tryline/blob/e74cf00f5992f74667bdb05fe5ccd68462733b32/lib/llm/prompts/generate-preview.ts#L194)、[lib/llm/prompts/generate-recap.ts:237](https://github.com/Gosshi/tryline/blob/e74cf00f5992f74667bdb05fe5ccd68462733b32/lib/llm/prompts/generate-recap.ts#L237) |
| H10 スタッツから特定トライへの因果 | 一部 | Bは禁じるがAとQAの要求は残る。[lib/llm/prompts/variant-b/shared.ts:32](https://github.com/Gosshi/tryline/blob/e74cf00f5992f74667bdb05fe5ccd68462733b32/lib/llm/prompts/variant-b/shared.ts#L32)、[lib/llm/prompts/generate-recap.ts:238](https://github.com/Gosshi/tryline/blob/e74cf00f5992f74667bdb05fe5ccd68462733b32/lib/llm/prompts/generate-recap.ts#L238)、[lib/llm/prompts/qa-content.ts:326](https://github.com/Gosshi/tryline/blob/e74cf00f5992f74667bdb05fe5ccd68462733b32/lib/llm/prompts/qa-content.ts#L326) |
| H11 大会固有文脈の無差別な例示 | 未解消 | 共通buildStandingsBlockはBも使用する。[lib/llm/prompts/shared-prompt-blocks.ts:76](https://github.com/Gosshi/tryline/blob/e74cf00f5992f74667bdb05fe5ccd68462733b32/lib/llm/prompts/shared-prompt-blocks.ts#L76)、[lib/llm/prompts/variant-b/shared.ts:69](https://github.com/Gosshi/tryline/blob/e74cf00f5992f74667bdb05fe5ccd68462733b32/lib/llm/prompts/variant-b/shared.ts#L69) |
| H12 圧力語の整理 | 一部 | Bの構成指示は整理。preview/A/共通禁止/抽出に旧表現。[lib/llm/prompts/variant-b/generate-recap-b.ts:35](https://github.com/Gosshi/tryline/blob/e74cf00f5992f74667bdb05fe5ccd68462733b32/lib/llm/prompts/variant-b/generate-recap-b.ts#L35)、[lib/llm/prompts/shared-prompt-blocks.ts:23](https://github.com/Gosshi/tryline/blob/e74cf00f5992f74667bdb05fe5ccd68462733b32/lib/llm/prompts/shared-prompt-blocks.ts#L23)、[lib/llm/prompts/generate-preview.ts:41](https://github.com/Gosshi/tryline/blob/e74cf00f5992f74667bdb05fe5ccd68462733b32/lib/llm/prompts/generate-preview.ts#L41)、[lib/llm/prompts/extract-tactical-points.ts:43](https://github.com/Gosshi/tryline/blob/e74cf00f5992f74667bdb05fe5ccd68462733b32/lib/llm/prompts/extract-tactical-points.ts#L43) |
| H13 冒頭禁止4行を原則1行に | 一部 | Bは原則1行、Aとpreviewで使う共通禁止には4行残る。[lib/llm/prompts/variant-b/shared.ts:58](https://github.com/Gosshi/tryline/blob/e74cf00f5992f74667bdb05fe5ccd68462733b32/lib/llm/prompts/variant-b/shared.ts#L58)、[lib/llm/prompts/shared-prompt-blocks.ts:35](https://github.com/Gosshi/tryline/blob/e74cf00f5992f74667bdb05fe5ccd68462733b32/lib/llm/prompts/shared-prompt-blocks.ts#L35) |
| H14 読者は得点表を既に見ている文脈 | 一部（本番Bは解消） | Bに明記。Aは旧来の「骨格」指示が残る。[lib/llm/prompts/variant-b/generate-recap-b.ts:25](https://github.com/Gosshi/tryline/blob/e74cf00f5992f74667bdb05fe5ccd68462733b32/lib/llm/prompts/variant-b/generate-recap-b.ts#L25)、[lib/llm/prompts/generate-recap.ts:180](https://github.com/Gosshi/tryline/blob/e74cf00f5992f74667bdb05fe5ccd68462733b32/lib/llm/prompts/generate-recap.ts#L180) |

## 8. 呼び出し回数とLLM費用

| 変更 | 呼び出し回数 | 費用への影響 |
|---|---|---|
| P1-1の診断・schema検査 | 通常は増えない | 診断・保存はコード処理。壊れた応答を検出して既存再試行へ進む分は増える場合がある |
| P1-2の正規化timeline・コード照合 | 増えない | 根拠JSONの入力量は増え得る。重複した材料ブロックを整理すれば一部相殺可能 |
| P1-3のclaim出力拡張 | 増えない | 抽出用の追加入力・出力トークン分。LLM抜き出しを既存QA内に置く |
| P1-4のprompt整合／曖昧表現チェック | 増えない | 指示追加は小幅増。誤検出・再発減による再生成削減効果は未測定 |
| P2の密度基準・フィードバック・キャッシュ | 追加の審査呼び出しは設けない | 既存生成回数の減少は期待できるが、unverifiableで止める件数が増えれば逆もある |

通常のgateはQAとentity各1回で、entity違反時の再照合やJSON失敗時の再試行が既にある（[lib/llm/pipeline.ts:261](https://github.com/Gosshi/tryline/blob/e74cf00f5992f74667bdb05fe5ccd68462733b32/lib/llm/pipeline.ts#L261)、[lib/llm/stages/verify-entities.ts:179](https://github.com/Gosshi/tryline/blob/e74cf00f5992f74667bdb05fe5ccd68462733b32/lib/llm/stages/verify-entities.ts#L179)、[lib/llm/stages/qa.ts:731](https://github.com/Gosshi/tryline/blob/e74cf00f5992f74667bdb05fe5ccd68462733b32/lib/llm/stages/qa.ts#L731)）。「通常2回」を絶対上限と誤認しない。

概算には現リポジトリの設定値を使う。これは請求書・最新公開価格を確認した値ではない（[lib/llm/pricing.ts:18](https://github.com/Gosshi/tryline/blob/e74cf00f5992f74667bdb05fe5ccd68462733b32/lib/llm/pricing.ts#L18)）。5.6-lunaは入力$0.2／出力$1.2 per 1M tokens。仮にQA1回あたり入力+1000、出力+1000 tokensなら **+$0.0014／回**、3回なら+$0.0042。terraで追加のnarrative生成を避けられる効果の方が大きい可能性はあるが、現在の各attemptの実トークンがないため削減額は断定しない。

複数回サンプリングによる安定性評価は本番判定とは別の実験である。Owner承認後に、同じ本文だけでなく同じ根拠snapshot・prompt・モデルを固定し、事前に対象本数と反復回数・上限費用を決めて実行する。今回は有料呼び出しをしていない。

## 9. 検証範囲

- コード・前回監査2本・関連仕様・既存テストを静的に確認した。
- 添付11ファイルの一致、不一致9件中のstatガード差6件、ベロー区間2本／全体4本、フォード4本、ウェールズ44分のsnapshot順をPythonで検算し、assertionは通った。これは提案実装のテスト結果ではない。
- lint/typecheck/test/buildは未実行。実装コードを変更しておらず、提案したテストはこれからの仕様化・実装用である。
- 既存記事・本番DB・設定は変更していない。Ownerの既存ローカル差分にも触れていない。レポート以外のコミット／PRは作成していない。

次の実装仕様は、P1-1 → P1-2 → P1-3 → P1-4の順に小さく分ける。P1-2のperiod／HT／同分順序の取得可能性と権威を確定する前に、派生値を強制照合の正解へ昇格させない。
