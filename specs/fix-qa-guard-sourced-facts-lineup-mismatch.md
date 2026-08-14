# QA ガードを sourced_facts 由来のラインアップに対応させる

## 背景

2026-08-13、8/15 オーストラリア戦のプレビュー生成で `ラインアップ不在にもかかわらず選手個別言及を含む` により 3 回連続 reject が発生した（published は既存版が温存された）。

**これは捏造ではなく、ガードの入力が実態と食い違っている。**

`specs/feat-jrfu-lineup-ingestion.md`（2026-08-13 全面改稿、PR #692 マージ済み）の Owner 判断により、日本代表戦の試合登録メンバーは **`match_lineups` ではなく `match_sourced_facts` に保存される**。`players.name` がローマ字（`Haruto Kida`）、JRFU が返すのが漢字（`木田晴斗`）で名寄せが成立せず、46 名の重複選手が作られる問題を避けるための意図的な設計。

`lib/llm/sourced-facts/fetch.ts:132` の `buildJrfuLineupSourcedFacts()` は、この経路で以下の形の fact を `confidence: "high"` で生成する:

```
「日本代表の先発は1 岡部崇人、2 江良颯、3 竹内柊平、…。」
「日本代表のリザーブは16 …。」
```

つまり**確定した試合登録メンバーが手元にある**。しかしパイプラインはそれを見ていない。

### 実測で確認した矛盾の所在

| 箇所 | sourced_facts を選手名の根拠として認めるか |
|---|---|
| `lib/llm/prompts/generate-preview.ts:223`（プロンプト本文） | **認める**（`projected_lineups・match_events・sourced_facts`） |
| `lib/llm/prompts/verify-entities.ts`（`entity-verification@1.1.0`） | **認める**（`sourced_facts` を渡し、対応付けを明示的に許可） |
| `lib/llm/stages/verify-entities.ts:131` `factSupportsMatchedEntity()` | **認める** |
| `lib/content/fabrication-guard.ts:140` `containsUngroundedPlayerReference()` | **認めない**（引数は `hasLineups` / `hasEvents` の 2 つだけ） |

`lib/llm/pipeline.ts:203` の `hasLineups` は `hasConfirmedProjectedLineups(assembled.projected_lineups)` で算出される。JRFU 経路では `projected_lineups` が空のままなので `hasLineups = false`、`match_events` も試合前なので `hasEvents = false`。結果として `containsUngroundedPlayerReference()` が発火する。

さらにこのガードは**選手名を一切見ていない**:

```ts
// lib/content/fabrication-guard.ts:140-159
if (hasLineups || hasEvents) return false;
if (!KEY_PLAYER_CONTEXT_PATTERN.test(normalized)) return false;  // 先発|マッチアップ|キープレイヤー 等
return PLAYER_WITH_POSITION_PATTERN.test(normalized) || RUGBY_POSITION_PATTERN.test(normalized);
```

`RUGBY_POSITION_PATTERN` は `スクラムハーフ|フライハーフ|…|SH|SO|CTB` 等のポジション語にマッチする。JRFU の fact を根拠に「先発の…スクラムハーフ」と書いた時点で、**実在名しか使っていなくても必ず発火する**。

そして `lib/llm/stages/qa.ts:81` の `isFactualGroundingHardBlock()` がこの issue をハードブロック扱いにするため、リトライしても同じ本文構造を作る限り published に到達しない。

### なぜ単純に緩めてはいけないか

このガードは `specs/fix-preview-fabricated-player-names.md`（PR #464）で、**プロンプト指示だけでは捏造を防げなかった**実例（2026-07-04 日本 vs イタリア、実在しない 3 名が published）を受けて追加された決定的ガードである。続く `specs/fix-projected-lineup-fallback-fabrication.md` では、`hasLineups=true` でも中身がキャップ数順フォールバックなら安全ではないことが判明している。

したがって本 spec は「ガードを外す」のではなく、**根拠データの列挙に第 3 の確定ソースを加える**。名前レベルの検証は `verifyNarrativeEntities`（sourced_facts 対応済み）が独立に担保し続けるため、この追加でガード全体の捏造検出力は落ちない。

### プロンプト側にも同じ食い違いがある

`hasLineups=false` を前提にした分岐が、sourced_facts に確定ラインアップがある場合でも「選手名を出すな」と指示している:

- `generate-preview.ts:104` `isDataSparse = match_events.length === 0 && !hasLineups` → sourced_facts を見ていない
- `generate-preview.ts:149` `dataSparseBlock` → 「ラインアップデータは存在しない」と断定
- `generate-preview.ts:105-122` `structureInstruction` → 「キープレイヤーセクションは省略すること（ラインアップデータなし）」
- `generate-preview.ts:162` `lineupUsageBlock` は `hasLineups` 時のみ生成され、許可名ソースの列挙から **sourced_facts が抜けている**（`projected_lineups・match_events` のみ）
- `generate-preview.ts:223` / `generate-recap.ts:302` の一文は**それ自体が自己矛盾**している（sourced_facts を許可した直後に「ラインアップが空の場合は選手名に言及せず」）

ガードだけ直してもプロンプトが選手名を書かせないため、実名入りプレビューは生成されない。両方を同時に直す必要がある。

## スコープ

対象:
- `lib/content/fabrication-guard.ts` — `containsUngroundedPlayerReference()` に「sourced_facts 由来の確定ラインアップがあるか」を第 3 の根拠として追加
- `lib/llm/stages/qa.ts` — 上記へ渡す値の受け取りと引き回し（`evaluateNarrativeQuality` の options、および `containsUngroundedPlayerReference` を呼ぶ 463 行目の経路）
- `lib/llm/pipeline.ts` — `assembled.sourced_facts` から判定値を算出してガードへ渡す
- `lib/llm/prompts/generate-preview.ts` — `isDataSparse` / `structureInstruction` / `dataSparseBlock` / `lineupUsageBlock` / 223 行目の一文
- `lib/llm/prompts/generate-recap.ts` — 302 行目の同一文、および `hasLineups` 前提の同種分岐
- 判定ロジックの単体テスト（`tests/content/fabrication-guard.test.ts` に追記）

対象外:
- `players` / `match_lineups` への書き込み（`feat-jrfu-lineup-ingestion` の Owner 判断で明示的に除外済み。**この判断を覆さないこと**）
- `verifyNarrativeEntities` の変更（すでに sourced_facts 対応済み）
- `hasLineups` 自体の算出ロジック（`hasConfirmedProjectedLineups`）の変更
- QA の verdict しきい値・リトライ回数・モデル変更
- 既存の published コンテンツの一括再生成（段階実行は受け入れ条件に含めるが、全件 backfill は本 spec の範囲外）
- 日本代表以外のソースからのラインアップ取得経路の追加

## データモデル変更

**なし。** 既存の `match_sourced_facts` と `AssembledContentInput.sourced_facts`（`lib/llm/types.ts:132-137` の `SourcedFactInput` = `{ fact, source_url, source_domain, confidence: "high" | "medium" }`）を使う。

## API サーフェス

**新規ルートなし。** 内部関数シグネチャのみ変更する。

`containsUngroundedPlayerReference()` は現在 `(text, hasLineups, hasEvents)` の位置引数 3 つだが、根拠ソースが 3 つ以上に増えるため **options オブジェクト引数への変更を推奨**する（呼び出し側の取り違えを防ぐため）。既存呼び出しは `lib/llm/stages/qa.ts:463` の 1 箇所とテストのみ。

### 「sourced_facts 由来の確定ラインアップ」の判定

**「sourced_facts が 1 件でもあれば根拠あり」としてはならない。** 天候や会場に関する fact でガードが解除され、`fix-preview-fabricated-player-names` が塞いだ穴が再び開く。

判定は以下をすべて満たす fact が 1 件以上あることとする:

1. `confidence === "high"`
2. fact 本文がラインアップの列挙であること — 具体的には、`先発` / `リザーブ` / `スタメン` / `出場メンバー` / `starting XV` / `replacements` のいずれかを含み、**かつ**背番号付き選手名の列挙パターン（`\d+\s*\S+` が 3 つ以上、または読点区切りの人名が 3 つ以上）を含むこと

判定関数は `lib/content/fabrication-guard.ts` に純関数としてエクスポートし、単体テスト可能にすること。パターンの具体的な正規表現は Codex の判断に委ねるが、**実際の `buildJrfuLineupSourcedFacts()` の出力形式**（`lib/llm/sourced-facts/fetch.ts:132-155`）を実読し、その出力でテストを書くこと。手作りの理想化された文字列だけでテストしないこと。

## UI サーフェス

**変更なし。** プレビュー本文に実名が載るようになるだけで、表示コンポーネントの変更はない。

ラインアップタブは `match_lineups` を参照しており、本 spec ではそこにデータが入らないため**引き続き空のまま**である。これは既知の受容済み挙動（`feat-jrfu-lineup-ingestion` の対象外）。

## LLM 連携

パイプラインの **4 段階目（品質チェック）と 3 段階目（ナラティブ生成）のプロンプト**に手を入れる。

**新規の LLM 呼び出しは増えない。追加コストはゼロ。** 判定はすべてローカルの純関数で行う。

副次的にコストが**下がる**見込み: 現在は同じ本文構造で 3 回リトライして全て reject されており、その分の `MODELS.NARRATIVE` + `MODELS.FAST` 呼び出しが無駄になっている。

モデル ID は直書きせず `lib/llm/models.ts` の定数を参照すること。

## 受け入れ条件

### 判定関数

1. `buildJrfuLineupSourcedFacts()` が実際に生成する形式の fact（`confidence: "high"`、`「日本代表の先発は1 岡部崇人、2 江良颯、3 竹内柊平、…。」`）を渡すと、判定関数が `true` を返す
2. `confidence: "medium"` の同一文面では `false` を返す
3. ラインアップ以外の fact のみ（例: `「会場はタウンズビルのQueensland Country Bank Stadium。」`、`「気温は23度が予想される。」`）を渡すと `false` を返す
4. `先発` を含むが選手名の列挙がない fact（例: `「両チームとも先発を大幅に入れ替えた。」`）では `false` を返す
5. 空配列を渡すと `false` を返す

### ガード

6. `hasLineups=false` / `hasEvents=false` / 確定ラインアップ fact **あり** のとき、本文に `先発のスクラムハーフ齋藤直人` を含めても `containsUngroundedPlayerReference()` が `false` を返す
7. `hasLineups=false` / `hasEvents=false` / 確定ラインアップ fact **なし** のとき、同じ本文で `true` を返す（= `fix-preview-fabricated-player-names` の保護が維持されている）
8. `hasLineups=true` のときの挙動は既存テストと同一である（回帰なし）

### パイプライン

9. `lib/llm/pipeline.ts` が `assembled.sourced_facts` から算出した判定値をガードへ渡しており、`hasLineups` / `hasEvents` を書き換えていない（この 2 つの意味を変えないこと）
10. `verifyNarrativeEntities` 経由の `UNGROUNDED_ENTITY_ISSUE` は従来どおり発火する。sourced_facts にも allowedEntities にも存在しない人名（例: 架空の `山澤拓也`）を含む本文は、確定ラインアップ fact があっても reject される

### プロンプト

11. 確定ラインアップ fact がある場合、`isDataSparse` が `false` と評価される（`dataSparseBlock` の「ラインアップデータは存在しない」が出力されない）
12. 同条件で `structureInstruction` が「キープレイヤーセクションは省略すること」を出力しない
13. `lineupUsageBlock` 相当の指示が、`hasLineups=false` かつ確定ラインアップ fact ありの場合にも出力され、その許可名ソースの列挙に `sourced_facts` が含まれている
14. `generate-preview.ts:223` および `generate-recap.ts:302` の一文から自己矛盾が解消されている（「sourced_facts を認める」と「ラインアップが空なら選手名に言及しない」が両立する表現になっている）
15. 確定ラインアップ fact も `projected_lineups` も `match_events` もない場合、既存の「選手名に言及せず」指示が従来どおり出力される

### 段階実行（本番反映時）

16. 全件再生成をしない。まず 8/15 オーストラリア戦（日本代表戦）**1 件のみ**でプレビューを再生成し、以下を Owner が目視検品する:
    - 実名が本文に登場している
    - 登場する選手名がすべて JRFU 発表の 23 名（または相手チームの発表メンバー）に実在する
    - QA verdict が `publish` に到達している
    - 字数が `lib/llm/content-length.ts` の下限を満たしている（**値をここに書き写さず、実装時に同ファイルを確認すること**）
17. 検品通過後に、他の対象試合へ広げるかを Owner が判断する。Codex は 1 件目の結果を報告して止まること

### テスト

18. `tests/content/fabrication-guard.test.ts` に上記 1〜8 に対応するケースが追加されている
19. `pnpm test` と型チェックが通る

## 未解決の質問

1. **相手チーム（オーストラリア等）の登録メンバー**も JRFU ページから同じ形式で取得できている前提で書いているが、`buildJrfuLineupSourcedFacts()` は `opponent_name` / `opponent_players` を扱っている一方、**片側だけしか取れなかった試合**をどう扱うか。片側のみでもガードを解除してよいか、両チーム揃った場合のみか。→ 実装前に Owner 判断が必要。推奨は「片側のみでも解除」（entity verification が名前レベルで守るため、過度に厳しくすると再び名前ゼロのプレビューに戻る）
2. 本 spec は日本代表戦（JRFU 経路）を主眼に書いているが、判定関数はソースを問わない汎用形になる。LLM の Web 検索経由で偶然ラインアップ形式の fact が入った試合でもガードが解除される。この副作用を許容するか。→ 推奨は許容（`confidence: "high"` かつ列挙形式という条件を満たす時点で根拠として十分であり、名前レベルの検証は別段で担保されている）
3. 過去に同じ理由で reject され draft のまま残っているプレビュー・レビューが他にあるか未調査。調査して一括再生成するかは受け入れ条件 17 の Owner 判断に含める
