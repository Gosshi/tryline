# 手動入力の事実の上限を30件にし、同時刻の事実を貼った順に並べる

## 背景

`docs/decisions.md` の D036 を参照。要点:

- 2026-09-27、オーストラリア 対 南アフリカに Discord から21件を貼り、上限16件（`MAX_MANUAL_FACTS_FOR_GENERATION`）で5件が落ちた。
- 1回の貼り付けの事実は `fetched_at` が全件同じになる。今の並びは `loadAllowedSourcedFactRows`（`lib/llm/sourced-facts/fetch.ts`）の次の並べ替えで決まる:
  ```ts
  .order("fetched_at", { ascending: false })
  .order("fact", { ascending: true });
  ```
  そのため、落ちるのは「あいうえお順で最後の事実」になる。貼った順番（ChatGPT が書いた順番）は使われていない。

## スコープ

**対象**
1. `MAX_MANUAL_FACTS_FOR_GENERATION` を 16 から 30 にする。
2. Discord の `/調査事実を追加` の保存時に、貼り付けの中の順番を `metadata.paste_index` に入れる。
3. `selectSourcedFactsForGeneration` で、手動の事実を次の順に並べてから上限で切る。

**対象外**
- 自動取得の事実（`MAX_STORED_FACTS = 8`、手動が8件未満のときだけ埋める規則）は変えない。
- すでに保存済みの行への `paste_index` の後付けはしない。
- ChatGPT の指示の変更（Owner が行う。`docs/chatgpt-prompts/weekend-preview-facts.md` は Claude Code が更新済み）。

## データモデル変更

なし（`match_sourced_facts.metadata` は既存の jsonb 列。キーを1つ足すだけ）。

## API サーフェス

### 1. 上限（`lib/llm/sourced-facts/fetch.ts`）

```ts
export const MAX_MANUAL_FACTS_FOR_GENERATION = 30;
```

### 2. 保存時の順番（`app/api/discord/interactions/route.ts` の `processResearchFactEntry`）

- 今の `rows.push({ ... metadata: { entry_method: "manual", entry_path: "discord_research_paste", ... } })` に、`paste_index` を足す。
- `paste_index` は **貼り付け全体を通しての 0 始まりの連番**（出典ブロックをまたいで数える）。数えるのは実際に `rows` に入った事実だけ（保存しなかった出典の事実は数えない）。つまり `rows.push` の時点の `rows.length` と同じ値。

### 3. 並べ替え（`selectSourcedFactsForGeneration`）

`manual` を上限で切る前に、次の比較で並べ替える（元の配列は変えず、新しい配列を作る）。

1. `fetched_at` の新しい順（`Date.parse` で比較）
2. 同じ時刻なら、`metadata.paste_index` の小さい順。**`paste_index` が無い行（既存の行、Discord 以外の手動入力）は、ある行より後ろ**
3. それでも同じなら、`fact` の文字列順（今の SQL の並びと同じ `a.fact < b.fact ? -1 : a.fact > b.fact ? 1 : 0`）

- `paste_index` は数値のときだけ使う（`typeof === "number"`。それ以外は「無い」として扱う）。
- 自動の事実（`automatic`）の並びは変えない。
- `droppedManual` は、並べ替えた後の 31 件目以降。

## UI サーフェス

Discord の返信（`app/api/discord/interactions/route.ts:238` の `formatManualFactsGenerationNotice`）の今の文言:

```ts
const notice = `この試合の手動事実は${params.manualTotal}件で、生成に使われるのは新しい順に16件です。次の${params.droppedManual.length}件は使われません:`;
```

を次にする（`16` を定数から出し、並び方の説明を実態に合わせる）:

```ts
const notice = `この試合の手動事実は${params.manualTotal}件で、生成に使われるのは新しい順（同じ時刻なら貼った順）に${MAX_MANUAL_FACTS_FOR_GENERATION}件です。次の${params.droppedManual.length}件は使われません:`;
```

## LLM 連携

段 3（ナラティブ）と段 4（QA）の入力が、手動が16件を超える試合でだけ最大14件ぶん長くなる。1本あたり最大約 $0.02 増（D036）。

## 受け入れ条件

1. **上限:** `fetched_at` が同じで `paste_index` 0〜29 の手動事実30件 → 30件すべて選ばれ、`droppedManual` は空。31件（0〜30） → `paste_index = 30` の1件だけが `droppedManual` に入る。
2. **貼った順:** `fetched_at` が同じ手動事実31件で、`fact` の文字列順と `paste_index` の順が逆になるように作る（`paste_index = 30` の行の `fact` が文字列順で最も前）。`droppedManual` が `paste_index = 30` の行になり、`selected` の手動部分が `paste_index` の昇順になる。
3. **`paste_index` が無い行:** 同じ `fetched_at` で、`paste_index` がある行2件と無い行2件 → ある行が先（`paste_index` 順）、無い行が後（`fact` の文字列順）。
4. **時刻が優先:** `fetched_at` が新しい行（`paste_index = 5`）と古い行（`paste_index = 0`） → 新しい行が先。
5. **保存:** 出典ブロック2つ（事実2件＋3件）を貼ったとき、保存する5行の `metadata.paste_index` が `0,1,2,3,4` の順になる。保存しなかった出典（404）のブロックを間に挟んだ場合、その事実は数えず、後ろのブロックの事実は続きの番号になる。
6. **既存テストの更新:** `grep -rn "16" tests/llm/sourced-facts.test.ts tests/api/discord-interactions.test.ts` で、上限16を前提にした assert を洗い出し、30 に合わせる（テストを消さない。件数だけ合わせる）。PR 本文に、変えた assert の一覧を書く。
7. **壊して落ちる確認（コミットしない）:** 並べ替えの 2（`paste_index`）を外すと、受け入れ条件 2 のテストが落ちること。
8. `pnpm lint`、`pnpm typecheck`、`pnpm test` が通る。**3 つとも実行して、結果を完了報告に含める。**

## マージ後の確認（Claude Code が行う）

9. 次に Discord から貼った試合について、`match_sourced_facts.metadata->>'paste_index'` が 0 から連番で入っていることを確かめる。

## 未解決の質問

なし。
