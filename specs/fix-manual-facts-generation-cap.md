# 手動入力の事実を8件を超えても生成に渡す

## 背景

**D031（2026-09-12、Owner 承認済み）の実装 spec。D029 の決定3（上限 8 据え置き）を改める。** 前段は `specs/fix-manual-facts-priority-in-selection.md`（D029、実装済み）。

2026-09-12 の日本×アメリカ（`match_id = 1e74662b-af45-4ef1-b267-156eb87329d5`）で、アメリカの先発発表を手動で9件追加した。**同じ試合の手動事実が16件になり、生成には新しい8件しか渡らない状態になった。** 落ちる側は日本の先発・対戦成績・キックオフの7件だった。Owner が SQL で8件に統合して回避した。

現在の選択処理:

```ts
// lib/llm/sourced-facts/fetch.ts:402-407
const manualRows = allowedRows.filter(isManualSourcedFact);
const automaticRows = allowedRows.filter(
  (row) => !isManualSourcedFact(row),
);

return [...manualRows, ...automaticRows].slice(0, MAX_STORED_FACTS);
```

`MAX_STORED_FACTS = 8`（同 `:25`）。**手動が8件を超えると、古い手動事実が何の通知もなく落ちる。**

### 同じ原因のもう1つの不具合（同時に直す）

キャッシュ判定もこの上限つきの関数を使っている。

```ts
// lib/llm/sourced-facts/fetch.ts:449-452, 470-473
const cachedFacts = await loadSourcedFactsForMatch(options.matchId, options.contentType);
...
const cachedSearchFacts = cachedFacts.filter(
  (fact) => typeof fact.metadata?.prompt_version === "string",
);
```

**手動が8件以上ある試合では、戻り値が手動だけで埋まり `cachedSearchFacts` が常に空になる。** その結果、`force` を付けていない呼び出し（`app/api/cron/orchestrate/route.ts:79`）でも、キャッシュが無いと判定されて毎回 Web 検索（`MODELS.WEB_SEARCH`）をやり直している。

### 影響の実測（2026-09-12、D031 に記録済み）

| 項目 | 値 |
|---|---|
| 手動事実がある 試合×種別 | 21組。8件超が3組、16件超が1組、最大17件 |
| 手動事実1件のプロンプト上の長さ | JSON で平均278字 |
| 9/12 の7試合の再生成費用（`pipeline_runs.cost_usd`） | 合計 $0.4266、1試合 $0.0364〜0.0848 |
| 手動8件追加による上乗せの上限見積もり | 1試合 約 $0.011 |

上乗せの内訳: 約2,224字（8件×278字、1字1トークンで上限見積もり）が、ナラティブ（`MODELS.NARRATIVE` = gpt-5.6-terra、入力 $2/1M）の最大2回（初回＋`MAX_LENGTH_REVISION_ATTEMPTS = 1`、`lib/llm/pipeline.ts:59`）と、QA・検証（`MODELS.FAST` = gpt-5.6-luna、入力 $0.2/1M）の最大3回に乗る。`2,224 × 2 × $2/1M + 2,224 × 3 × $0.2/1M ≈ $0.0102`。**対象は手動が8件を超える試合だけ。**

## スコープ

対象:

- `lib/llm/sourced-facts/fetch.ts` の、生成用の事実の選び方と、キャッシュ判定に使う行の取り方
- `app/api/discord/interactions/route.ts` の保存応答メッセージ（件数の通知を追加）

対象外:

- **`MAX_STORED_FACTS = 8` の値。** 自動取得の保存上限（`:556`）と、自動で埋める合計件数の両方に使われており、どちらも変えない
- プロンプトテンプレート（`lib/llm/prompts/`）。事実は `JSON.stringify` でそのまま入るので変更不要
- 自動取得の検索内容・allowlist
- Discord のモーダル（入力欄）。`specs/feat-discord-source-url-owner-verified.md` が同じファイルのモーダルを変える（マージ順は後述）
- 手動事実の削除・編集手段
- `supabase/`（データモデル変更なし）

## データモデル変更

なし。

## 選択ロジック（この定義どおりに実装すること）

### 定数

```ts
const MAX_STORED_FACTS = 8;                         // 既存。変えない
export const MAX_MANUAL_FACTS_FOR_GENERATION = 16;  // 新規
```

### 1. 行の取得（上限なし）

新しい関数 `loadAllowedSourcedFactRows(matchId, contentType): Promise<StoredSourcedFact[]>` を `fetch.ts` に置き、**現在の `loadSourcedFactsForMatch` の `:374-400` をそのまま移す。** 絞り込みの条件（`content_type in [contentType, "shared"]`、`confidence in ["high","medium"]`、allowlist または手動）は変えない。

**並び順だけ1点変える。** `fetched_at` の降順に加えて、`fact` の昇順を2番目のキーにする。

```ts
.order("fetched_at", { ascending: false })
.order("fact", { ascending: true })
```

理由: 1回の Discord 送信や1本の SQL で入れた手動事実は `fetched_at` が完全に同じになる（9/12 の9件は全件 `2026-09-11 15:17:08.742332+00`）。第2キーが無いと、上限で切る境目がどれになるかが実行ごとに変わりうる。

### 2. 生成用の選択（純粋関数）

`fetch.ts` から次の関数を export する。**DB に触らない純粋関数にすること。**

```ts
export type SourcedFactSelection = {
  selected: StoredSourcedFact[];          // 生成に渡す
  manualTotal: number;                    // 手動の総数（上限適用前）
  droppedManual: StoredSourcedFact[];     // 上限16を超えて落ちた手動
  automaticTotal: number;                 // 自動の総数
  automaticSelected: number;              // 渡した自動の件数
};

export function selectSourcedFactsForGeneration(
  rows: StoredSourcedFact[],   // loadAllowedSourcedFactRows の戻り値（並び順を保つ）
): SourcedFactSelection
```

算出方法:

```ts
const manual = rows.filter(isManualSourcedFact);
const automatic = rows.filter((row) => !isManualSourcedFact(row));
const selectedManual = manual.slice(0, MAX_MANUAL_FACTS_FOR_GENERATION);
const automaticSlots = Math.max(0, MAX_STORED_FACTS - selectedManual.length);
const selectedAutomatic = automatic.slice(0, automaticSlots);
// selected = [...selectedManual, ...selectedAutomatic]
// droppedManual = manual.slice(MAX_MANUAL_FACTS_FOR_GENERATION)
```

**手動が8件以下なら、結果は現在の実装と完全に同じになる。** 手動9〜16件は全件渡り、自動は0件。手動17件以上は新しい16件が渡る。

### 3. 既存関数の置き換え

- `loadSourcedFactsForMatch(matchId, contentType)`: シグネチャと戻り値の型を変えない。中身を `selectSourcedFactsForGeneration(await loadAllowedSourcedFactRows(...)).selected` にする。**`assemble.ts:965` は変更しない。**
- `:394-400` の allowlist 除外件数の `console.warn` は `loadAllowedSourcedFactRows` に残す。
- **`droppedManual` が1件以上なら `console.warn` を1行出す。** 形式は `[sourced-facts] Dropped ${n} manual fact(s) over the generation cap for match_id=${matchId}.`。本文は出さない。

### 4. キャッシュ判定の切り離し（`fetchSourcedFactsForMatch`）

`:449-452` を次の意味に変える。

- キャッシュ判定（`cachedSearchFacts`・`newestFetchedAt`・`cachedPromptVersion`）には **`loadAllowedSourcedFactRows` の全行**を使う
- キャッシュ命中時の戻り値 `facts`（`:488`）は、`selectSourcedFactsForGeneration(全行).selected` の前に `jrfuRows` を付けたものにする（今と同じ意味の値）

`facts` の利用者は `app/api/cron/fetch-sourced-facts/route.ts` の JSON 応答だけで、`orchestrate` は戻り値を使っていない。

### 5. Discord の保存応答

`processResearchFactEntry`（`app/api/discord/interactions/route.ts:338-401`）の保存成功後、**`loadAllowedSourcedFactRows(submission.matchId, contentType)` → `selectSourcedFactsForGeneration` を呼び、その結果から次の文を追記する。** 件数を別の SQL で数えないこと（生成側と数え方がずれるのを防ぐため）。

| 条件 | 追記する文 |
|---|---|
| `manualTotal <= 8` | なし（今の応答のまま） |
| `8 < manualTotal <= 16` | `この試合の手動事実は${manualTotal}件です。全件が生成に使われ、自動取得の事実は使われません。` |
| `manualTotal > 16` | `この試合の手動事実は${manualTotal}件で、生成に使われるのは新しい順に16件です。次の${droppedManual.length}件は使われません:` に続けて、落ちる事実を1行ずつ `- ` 付きで、各40字で切って列挙する |

- 既存の `保存: N件、重複スキップ: M件。` の後ろに改行して付ける
- **Discord のメッセージ上限は2,000字。** 全体が2,000字を超える場合は列挙を途中で止め、最後の行を `…ほか${残り}件` にする
- 件数の取得に失敗しても**保存は成功扱いのまま**にする。追記文の代わりに `（件数の確認に失敗しました）` を付ける。例外を投げない
- `contentType` は保存時に決めたもの（`:372-373`）を使う

## API サーフェス

変更なし。`POST /api/cron/fetch-sourced-facts` の応答 `facts` の意味は変わらない（生成に渡す事実＋JRFU）。

## UI サーフェス

Discord の保存応答メッセージのみ（上記5）。サイトの画面は変わらない。

## LLM 連携

- 変わるのは、**手動事実が8件を超える試合の、ナラティブ・検証・QA の入力**だけ。モデルは `MODELS` のまま
- 試行回数は変わらない（ナラティブ最大2回）
- 費用の上乗せは1試合あたり最大約 $0.011（背景の表）
- **Web 検索（`MODELS.WEB_SEARCH`）の呼び出しは減る。** 手動8件以上の試合で、キャッシュ有効期間内の再検索がなくなるため

## 受け入れ条件

`tests/llm/sourced-facts.test.ts` と `tests/api/discord-interactions.test.ts` に追加・更新する。

### 選択ロジック（`selectSourcedFactsForGeneration` を直接呼ぶ）

1. 手動3件＋自動10件 → `selected` は手動3件＋自動5件の順で計8件。`droppedManual` は空（**今の挙動と同じであることの確認**）
2. 手動8件＋自動5件 → `selected` は手動8件のみ。`automaticSelected = 0`
3. 手動12件＋自動5件 → `selected` は手動12件のみ。`manualTotal = 12`、`droppedManual` は空
4. 手動17件 → `selected` は新しい16件。`droppedManual` は最も古い1件
5. 手動0件＋自動10件 → `selected` は自動の新しい8件
6. 空配列 → `selected` は空。例外を投げない

### 並び順

7. `loadAllowedSourcedFactRows` のクエリで、`order("fetched_at", { ascending: false })` の次に `order("fact", { ascending: true })` が呼ばれることを、ビルダーのモックへの呼び出し順と引数で検証する

### 既存テストの更新

8. `tests/llm/sourced-facts.test.ts:1052` の `uses only the newest manual cached facts when at least eight exist`（手動10件）は、**手動10件が全件渡る**期待値に書き換える。テスト名も内容に合わせる

### キャッシュ判定

9. 手動9件＋自動（`metadata.prompt_version = SEARCH_PROMPT_VERSION`、`fetched_at` が有効期間内）3件がある試合で `fetchSourcedFactsForMatch({ force: false })` を呼ぶ → **`createWebSearchJsonResponse` が呼ばれず**、`cached: true` が返る
10. 同じ条件で `force: true` → Web 検索が呼ばれる（既存の force 挙動が保たれる）

### Discord の保存応答

11. 保存後の手動が5件 → 応答は `保存: …件、重複スキップ: …件。` だけ
12. 保存後の手動が12件 → 応答に `この試合の手動事実は12件です。全件が生成に使われ、自動取得の事実は使われません。` を含む
13. 保存後の手動が17件 → 応答に `次の1件は使われません:` と、落ちる事実の先頭40字を含む
14. 手動100件（各事実50字以上）→ 落ちる84件を全部列挙すると `84 × (2 + 40 + 1) = 3,612字` で2,000字を超える。応答全体が2,000字以下で、最終行が `…ほか${n}件` の形になり、`n` と列挙した件数の合計が84になる
15. 件数取得のクエリがエラーを返す → 保存は成功扱い、応答に `（件数の確認に失敗しました）` を含み、HTTP 応答は既存の成功時と同じ

### 検出力の確認

16. 次の2つを実際に行い、**テストが落ちることを確認してから元に戻す**。結果を PR 本文に書く
    - `MAX_MANUAL_FACTS_FOR_GENERATION` を 8 に変える → 3 が落ちる
    - キャッシュ判定を `loadSourcedFactsForMatch`（上限つき）に戻す → 9 が落ちる

### 標準チェック

17. `pnpm lint`・`pnpm typecheck`・`pnpm test` がすべて通る

## マージ順と競合

- `specs/feat-discord-source-url-owner-verified.md` と `app/api/discord/interactions/route.ts` の同じ関数（`processResearchFactEntry`）を触る。**本 spec を先にマージし、もう一方はそれを取り込んでから作ること**
- 本番操作は不要。マージ・デプロイ後に、次の生成から効く

## 未解決の質問

なし（上限16・自動の埋め方・通知の出し方は D031 で決定済み）。
