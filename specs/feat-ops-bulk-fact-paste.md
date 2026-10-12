# ChatGPT の調査結果を、1回の貼り付けで全試合分入れる

Owner 決定（2026-10-12）: Discord ではなくサイト内の Owner 専用ページで、ChatGPT の出力を全文まとめて貼る。通すアカウントは gosshi.dev のみ。後続: `specs/fix-preview-hold-for-research.md`（このページの保存処理を使う）。

## 背景

今は Discord の `/調査事実を追加` で、試合を1つ選んで、その試合の部分だけを貼っている（`specs/feat-discord-research-fact-paste.md`、D035）。

- 2026-10-12 の月曜の回は 9 試合・1 万字超。**9 回の送信**が要る。週末は 18 試合前後。
- Discord の入力欄は 4,000 字までなので、全文を一度には貼れない（前の spec でも同じ理由で「対象外」にした）。
- 見出しの試合名で試合を引くのは危ない。2026-10-12 の出力では「ニューカッスル・ファルコンズ」と書かれていたが、出典は `newcastleredbulls.com` だった（チーム名の変更）。

そこで、ChatGPT に**見出しへ試合ページの URL を入れてもらい**（`docs/chatgpt-prompts/weekend-preview-facts.md`・`weekend-recap-facts.md` は 2026-10-12 に変更済み）、URL の試合 ID で試合を決める。

```
## トゥールーズ 対 バイヨンヌ — https://www.trylinerugby.com/matches/<36文字のID>

### 出典: [https://www.minutesports.fr/...](https://www.minutesports.fr/...?utm_source=chatgpt.com)

- トゥールーズのアントワーヌ・デュポン主将は、…と振り返った。

- **注記:** 公式Player of the Matchは確認できず。
```

## スコープ

対象:
- Owner 専用ページ `/ops/facts`：全文を貼る → 読み取り結果を確認する → 保存する → 試合ごとに作り直す
- Discord と同じ保存処理を共通の関数に切り出し、Discord とこのページの両方から使う
- Owner だけを通す確認（`OPS_OWNER_USER_IDS`）

対象外:
- Discord の `/調査事実を追加` の廃止（残す。保存処理を共通の関数に置き換えるだけ）
- 見出しに URL が無いブロックの試合を、名前から推測すること（保存しない。画面に出すだけ）
- 事実の中身の確認（LLM は使わない）
- 生成の時刻の変更（`specs/fix-preview-hold-for-research.md`）

## データモデル変更

なし。保存する行は今の `match_sourced_facts` と同じ。`metadata.entry_path` は `ops_bulk_paste` にする（`discord_research_paste` と区別するため）。

## 認証

- `lib/env.ts` に `OPS_OWNER_USER_IDS: z.string().min(1).optional()` を足す（カンマ区切りの Supabase ユーザー ID）。本番の値は Owner が Vercel に入れる（gosshi.dev の ID）。
- `lib/auth/ops.ts` に `requireOpsOwner()` を足す。`getUser()`（`lib/auth/server.ts:35`）でログイン中のユーザーを取り、ID が `OPS_OWNER_USER_IDS` に含まれなければ `notFound()` を呼ぶ。**未設定・空なら誰も通さない。**
- ページ本体と、下の API ルート3つの**すべて**の先頭で `requireOpsOwner()` を呼ぶ。API ルートでは `notFound()` の代わりに 404 を返す（403 にしない。ページがあること自体を知らせない）。
- API ルートは `POST` だけ。`Origin` ヘッダーが `SITE_URL`（`lib/site.ts`）の origin と一致しなければ 404。
- `/ops` 配下は `robots: { index: false, follow: false }`。`app/robots.ts` に `disallow: "/ops"` を足す。サイトマップには載せない。
- DB への書き込みはサーバーのクライアント（`getSupabaseServerClient()`）だけで行う。ブラウザから DB に直接書かない。

## 読み取り（新規の純関数）

`lib/ops/bulk-research-paste.ts` に次を足す。

```ts
export type BulkPasteBlock = {
  heading: string;              // 「## 」を除いた見出しの文字列
  headingLine: number;
  matchId: string | null;       // 見出しの /matches/<uuid> から。無ければ null
  paste: ParsedResearchPaste;   // そのブロックの本文を parseResearchPaste に通した結果
};
export function splitBulkResearchPaste(text: string): {
  blocks: BulkPasteBlock[];
  linesBeforeFirstHeading: number; // 最初の「## 」より前の空でない行の数（冒頭の説明文など）
};
```

- 「`## `」（`#` がちょうど2つ）で始まる行で区切る。「`### 出典:`」は区切りにしない。
- 試合 ID は、見出しの行に含まれる `/matches/` の直後の 36 文字を `isUuid`（`lib/ids.ts`）で確かめて取る。Markdown のリンク（`[名前](URL)`）でも、そのままの URL でも取れること。`utm_source` などのクエリは無視する。
- 本文は今の `parseResearchPaste`（`lib/discord/research-paste.ts`）にそのまま通す。注記・300字超・出典外の行の扱いは今と同じ。
- 同じ試合 ID の見出しが2つあれば、本文を1つにまとめる（出典の順は貼った順）。
- 最初の見出しより前の行（「今日は…」の説明やカレンダーへのリンク）は読み飛ばす。

## API サーフェス

### `POST /api/ops/facts/preview`（読み取りだけ。書き込みなし・出典 URL の確認もしない）

- 入力: `{ text: string }`。100,000 字を超えたら 400。
- 出力: ブロックごとに `heading`・`matchId`・試合の情報（DB から: ホーム・アウェイの日本語名、キックオフ、`status`）・保存予定の事実の数・出典の数・読み飛ばした行の数と理由。
- 次は「保存できない」として理由を付けて返す（保存の対象から外す）: 見出しに試合 URL が無い / ID の試合が DB に無い / 事実が0件。
- 試合は `matches` を ID の一覧で1回だけ引く（試合ごとに引かない）。

### `POST /api/ops/facts/save`（保存）

- 入力: `{ text: string }`（確認画面で見たのと同じ全文を送り直す。サーバーでもう一度読み取る）。
- 保存できるブロックごとに、共通の保存関数（下）を呼ぶ。出典 URL の確認は今と同じ（`validateSourceUrl`、401・403・429 は「目視で確認済み」として保存、それ以外の失敗は保存しない）。**URL の確認は同時に 4 本まで。**
- 出力: 試合ごとに、保存件数・重複スキップ件数・保存しなかった出典と理由・**作り直しの要否**（`"regenerate" | "generate" | "none"` と `contentType`）。
- **このルートでは生成しない。** 生成は時間がかかる（1本 30〜60 秒）ため、下の別のルートで試合ごとに行う。

### `POST /api/ops/facts/regenerate`（1 試合の生成）

- 入力: `{ matchId: string }`。
- サーバーで、共通の判定関数（下）を**もう一度**呼び、要否が `"none"` なら生成せずに `"none"` を返す（画面から任意の試合を作り直させないため）。
- `"regenerate"` / `"generate"` なら `generateMatchContent(matchId, contentType, "ja")`（`lib/llm/pipeline.ts`）を呼び、結果（公開 / QA 不合格で公開中の版を残した / 見送り（理由）/ 失敗（理由））を返す。文言は今の Discord の返信（`app/api/discord/interactions/route.ts` の `regenerationNotice`）と同じ。
- `export const maxDuration = 300`。

### 共通の保存関数と判定関数（`lib/sourced-facts/manual-entry.ts`、新規）

`app/api/discord/interactions/route.ts` の `processResearchFactEntry`（427〜700 行あたり）から、Discord に依存しない部分を切り出す。

```ts
export async function saveManualResearchFacts(input: {
  matchId: string;
  paste: ParsedResearchPaste;
  entryPath: "discord_research_paste" | "ops_bulk_paste";
}): Promise<ManualFactSaveResult>;

export async function decideManualFactRegeneration(input: {
  matchId: string;
  contentType: ContentType;
}): Promise<"regenerate" | "generate" | "none">;
```

- `saveManualResearchFacts` は、今の処理（URL の確認 → 行の組み立て → `content_type` をキックオフ前なら `preview`・後なら `recap` に決める → `upsert(... ignoreDuplicates, onConflict: "match_id,content_type,fact")`）を**変えずに**移す。`paste_index`・`confidence: "high"`・`model_version: "manual"`・`source_url_check` の付け方も同じ。
- `decideManualFactRegeneration` は、今の Discord の条件をそのまま移す: その試合・`contentType` の日本語の `match_content`（`published` または `draft`）があれば `"regenerate"`、無ければ `"none"`。**`"generate"` を返す条件は `specs/fix-preview-hold-for-research.md` で足す**（この spec では返さない）。
- 保存件数が0（全部重複）のときは、呼び出し側で作り直さない（今と同じ）。
- Discord の `processResearchFactEntry` は、この2つの関数を使う形に書き換える。返信の文言・`after()` での作り直し・`onRegenerationStart` の途中経過は変えない。

## UI サーフェス（`/ops/facts`）

1. **貼り付け:** 大きなテキスト欄1つと「読み取る」ボタン。
2. **確認:** ブロックごとに1行の表。
   - 列: 見出し（貼った文字列）/ DB の試合（ホーム 対 アウェイ、キックオフ JST）/ 種類（プレビュー or レビュー）/ 事実の数 / 出典の数 / 状態
   - 見出しの名前と DB の名前が違っても止めない（チーム名の変更がある）。並べて見せて Owner が目で確かめる。
   - 保存できないブロックは赤で理由を出す。
   - 冒頭で読み飛ばした行があれば、その数を出す。
   - 「保存する」ボタン（保存できるブロックが1つ以上のときだけ押せる）。
3. **保存結果と作り直し:** 試合ごとに保存件数・スキップ・保存しなかった出典を出す。作り直しが要る試合は、画面から `/api/ops/facts/regenerate` を**同時に 3 本まで**順に呼び、各行に「作り直し中… → 結果」を出す。
   - 画面に「作り直しが終わるまでこのページを閉じないでください（閉じた試合は作り直されません。事実は保存済みです）」と出す。
   - 全部終わったら「完了: 公開 N / QA 不合格 N / 見送り N / 失敗 N」を出す。
4. 見た目は既存のトークンと部品を使う。Owner しか見ないので装飾は最小限でよい。幅 1280px で崩れなければよい。

## LLM 連携

- 新しい LLM 呼び出しは無い。作り直しは今の Discord と同じ `generateMatchContent`（段 1〜4、1本約 $0.05）。
- 回数は今と同じ（送信ごとではなく、保存して新しい事実が入った試合ごとに1回）。週末 18 試合すべてでも約 $1。

## 受け入れ条件

1. **読み取り:** `tests/lib/ops-bulk-research-paste.test.ts` で、2026-10-12 の実際の出力（この spec の背景の形。見出しに URL を足したもの）を fixture にして、次を確かめる。
   - 冒頭の説明文は読み飛ばされ、ブロック数が見出しの数と一致する。
   - リンク形式（`## [名前](URL)`）・そのままの URL・`utm_source` 付きの、どれでも試合 ID が取れる。
   - URL の無い見出しは `matchId: null`。
   - 同じ ID の見出し2つが1つにまとまる。
   - `- **注記:**` の行は保存対象に入らない（今の `parseResearchPaste` と同じ結果になる）。
2. **認証:** 3 つの API ルートとページのそれぞれで、次を確かめる（モック）。
   - 未ログイン → 404 / `notFound()`
   - ログイン済みで ID が `OPS_OWNER_USER_IDS` に無い → 404
   - `OPS_OWNER_USER_IDS` が未設定 → Owner の ID でも 404
   - `Origin` が違う → 404
   - いずれの場合も DB の書き込み・`validateSourceUrl`・`generateMatchContent` が1回も呼ばれない。
3. **保存処理は変わらない:** Discord の既存テスト（`tests/` 配下の `/調査事実を追加` のテスト。`grep -rln "processResearchFactEntry\|discord_research_paste" tests` で列挙）が、アサーションを弱めずにそのまま通る。
4. **保存:** `/api/ops/facts/save` で、2試合分の全文を送ると、試合ごとに `saveManualResearchFacts` が1回ずつ、`entryPath: "ops_bulk_paste"` で呼ばれる。保存できないブロックの試合では呼ばれない。
5. **作り直しの判定:** `/api/ops/facts/regenerate` で、日本語の `match_content` が無い試合は `generateMatchContent` が呼ばれず `"none"` が返る。ある試合は1回呼ばれる。
6. **robots:** `app/robots.ts` の出力に `/ops` の disallow が入る。`/ops/facts` のメタデータが noindex。
7. **わざと壊して確かめる:**
   - `requireOpsOwner()` の ID の照合を外す（常に通す）と、受け入れ条件2が落ちる。
   - `/regenerate` の判定の呼び出しを外すと、受け入れ条件5が落ちる。
   - どちらも出力を PR 本文に貼り、変更は戻す。
8. **本番での確認（マージ後、Owner と Claude）:** Owner が Vercel に `OPS_OWNER_USER_IDS` を入れたあと、次を確かめる。
   - ログアウト状態と gota.nakanishi.0904 で `/ops/facts` が 404（Claude が確かめる）
   - gosshi.dev で開ける（Owner）
   - 次の ChatGPT の回の出力を貼り、確認画面の試合が正しいことを Owner が目で見てから保存する

## 未解決の質問

なし。
