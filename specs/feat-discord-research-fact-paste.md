# `/調査事実を追加` を「試合を選んで、ChatGPT の出力を貼るだけ」にする

## 背景

ChatGPT で調べた試合の事実は、Discord の `/調査事実を追加`（`app/api/discord/interactions/route.ts`）で 1 件ずつ入れている。今のモーダルは次の 5 つで、**1 回の送信で「試合 1 つ・出典 URL 1 つ」しか扱えない**。

| 入力 | 今の中身 |
|---|---|
| 試合 | 選択（前後 2 週間・最大 25 件） |
| 事実 | 複数行（1 行 1 件、300 字以内） |
| 出典 URL | 1 つだけ |
| 確度 | high / medium / low（既定 medium） |
| 出典確認 | 自動で確認する / 目視で確認済み（401・403・429 のサイト用） |

ChatGPT の出力は試合ごとに出典が 2〜3 本あるので、週末 18 試合なら 40 回前後の送信になり、1 回ごとに「URL のコピー」「事実のコピー」「確度と出典確認の選択」が要る。Owner の要望（2026-09-26）: **試合の選択と、ChatGPT の出力の貼り付けだけで完結させたい。確度は high 固定、出典確認は「目視で確認済み」が既定でよい。**

ChatGPT の出力は、すでに次の形で試合ごとに出ている（2026-09-25 の実際の出力。プロンプトの「出力の形」で指定している）。

```
## ペルピニャン 対 ボルドー

### 出典: [L'Équipe — Perpignan - Bordeaux-Bègles](https://www.lequipe.fr/...live/42417?utm_source=chatgpt.com)
- ペルピニャンは3試合1勝2敗で10位、…で対戦する。 :chatgpt-content-reference{index="2"}

### 出典: [Scores24 — ...](https://scores24.live/...?utm_source=chatgpt.com)
- ペルピニャンは前節…1勝。 :chatgpt-content-reference{index="4"}

- **試合前コメント:** Rugbyrama、L'Équipeなどを…確認できず。
```

## スコープ

**対象**
- モーダルを「試合」と「貼り付け」の 2 つだけにする。
- 貼り付けた文章から、出典ごとの事実をまとめて読み取り、1 回の送信で全出典を保存する。
- 確度は `high` に固定する。
- 出典 URL の確認は今までどおり自動で行い、**401・403・429（ボット拒否）は確認の操作なしで「目視で確認済み」として保存する**。それ以外の失敗（404 など）の出典は保存しない。

**対象外**
- 貼り付けだけで試合まで自動で特定すること（見出しの試合名から試合を引く）。Discord の入力欄は 1 つ 4,000 字までで、週末分（1 万字前後）は一度に貼れないうえ、試合名の取り違えの危険がある。
- 事実の中身の確認（LLM は使わない）。
- 生成への反映のしかた（上限 8 件の扱いなど、既存のまま）。

## データモデル変更

なし。保存する行の形（`match_sourced_facts`）は今と同じ。`metadata.entry_path` は `discord_research_paste` にする（今の `discord_research_command` と区別するため）。

## API サーフェス

### 1. モーダル（`buildResearchFactEntryModal`）

- 残す入力: 「試合」（選択、今のまま）。
- 入力「事実」を「ChatGPT の出力（この試合の部分）」に置き換える。複数行、最大 4,000 字（Discord の上限）、必須。説明文は「`### 出典:` から始まるブロックを、この試合の分だけ貼ってください」。
- 削除する入力: 「出典 URL」「確度」「出典確認」。

### 2. 貼り付けた文章の読み取り（新規の純関数。`lib/discord/research-paste.ts`）

```ts
export type ParsedResearchSource = {
  sourceUrl: string;
  facts: Array<{ fact: string; lineNumber: number }>;
};

export type ParsedResearchPaste = {
  sources: ParsedResearchSource[];
  skippedLines: Array<{ lineNumber: number; reason: "outside_source" | "note" | "too_long" }>;
};

export function parseResearchPaste(text: string): ParsedResearchPaste;
```

読み取りのきまり:
- `### 出典:` で始まる行が、1 つの出典ブロックの始まり。
  - URL は、行の中の Markdown リンク `[…](URL)` の URL、無ければ行の中の最初の `http(s)://` から空白までを使う。見つからない行は、そのブロックを無視する（その下の事実は `outside_source` として読み飛ばす）。
  - URL のクエリから `utm_source`・`utm_medium`・`utm_campaign` を取り除く。ほかのクエリは残す。
- 出典ブロックの中で `- ` で始まる行を、事実 1 件とする。
  - 行末の `:chatgpt-content-reference{…}`（1 行に複数あってもすべて）と、前後の空白を取り除く。
  - `- **` で始まる行（`- **試合前コメント:** …確認できず` などの注記）は、事実として保存せず `note` として読み飛ばす。
  - 取り除いたあとに 300 字を超える行は保存せず、`too_long` として読み飛ばす。**ブロック全体は捨てない。**
- `## ` で始まる行（試合名の見出し）、`---`、空行、`**補足:**` などそれ以外の行は、何もせず読み飛ばす（`skippedLines` にも載せない）。
- 出典ブロックの外にある `- ` の行は、`outside_source` として読み飛ばす。

### 3. 保存（`processResearchFactEntry`）

- 出典ブロックごとに `validateSourceUrl` で URL を確かめる。
  - 成功: 保存する。
  - 401・403・429（`OWNER_VERIFIABLE_SOURCE_URL_STATUSES`）: **目視で確認済みとして保存する**（`metadata.source_url_check = "owner_verified"`、`source_url_http_status` を今と同じく記録）。
  - それ以外の失敗: そのブロックは保存せず、理由を返信に載せる。**ほかのブロックの保存は続ける。**
- 確度は `high` に固定する。
- `content_type` の決め方（キックオフが未来なら `preview`、過去なら `recap`）と、重複を除く方法（`onConflict: "match_id,content_type,fact"`）は今のまま。
- 保存したあとの、生成の上限を超えた手動事実の通知（今の `droppedManual` の通知）は今のまま出す。

### 4. 返信

1 回の送信について、次をまとめて返す。

```
保存: 7件（出典 3 本）、重複スキップ: 1件
目視確認済みとして保存: lequipe.fr（HTTP 403）
保存しなかった出典: https://example.com/...（HTTP 404）
読み飛ばした行: 12行目（注記）、15行目（300字超）
```

- 保存できた事実が 0 件なら、「保存できる事実がありませんでした」と、その理由（出典ブロックが無い、すべての出典が失敗した、など）を返す。

## UI サーフェス

Discord のモーダルだけ。Tryline のサイトの表示は変えない。

## LLM 連携

なし。

## 受け入れ条件

読み取りのテストには、2026-09-25 に実際に ChatGPT が出した出力の一部（上の背景の例のように、Markdown リンク・`utm_source`・`:chatgpt-content-reference{…}`・`- **試合前コメント:**` の注記を含むもの）を fixture として使う。

1. **読み取り:** 出典が 2 本・事実が計 3 件・注記が 1 行ある貼り付けから、出典 2 本、それぞれの事実が正しく読み取れる。URL から `utm_source` が消え、事実の末尾から `:chatgpt-content-reference{…}` が消えている。注記の行は `note` として `skippedLines` に入る。
2. **行の読み飛ばし:** 300 字を超える事実は `too_long`、出典ブロックの外の `- ` 行は `outside_source` になり、同じブロックのほかの事実は読み取られる。
3. **URL の形:** `### 出典: https://…`（リンクの形でない）でも URL が読み取れる。URL の無い `### 出典:` 行の下の事実は保存されない。
4. **保存:**
   - 出典 3 本のうち、1 本が 200、1 本が 403、1 本が 404 の場合、200 と 403 の事実が保存され、404 の事実は保存されない。403 の行は `metadata.source_url_check = "owner_verified"` になる。返信に、目視確認済みの出典と、保存しなかった出典が載る。
   - 保存した行の `confidence` がすべて `high` で、`metadata.entry_path` が `discord_research_paste`。
   - 確認方法: 403 を保存しない実装に戻すと、このテストが落ちること。
5. **モーダル:** 入力が「試合」と「ChatGPT の出力」の 2 つだけで、後者の最大字数が 4,000。
6. `pnpm lint`、`pnpm typecheck`、`pnpm test` が通る。**3 つとも実行して、結果を完了報告に含める。**

## マージ後の作業

7. Owner: Discord のコマンド定義が変わる場合（モーダルはコマンドの定義ではないので、通常は不要）だけ、コマンドの再登録を行う。
8. Owner: 次の ChatGPT の出力で 1 試合分を貼って送り、返信の内容を確かめる。

## 未解決の質問

なし。
