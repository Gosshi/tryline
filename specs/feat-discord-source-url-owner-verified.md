# Discord 事実入力で、ボット拒否（401/403/429）の出典を Owner の目視確認で保存できるようにする

## 背景

**D032・D033（2026-09-12、Owner 承認済み）の実装 spec。D026 の決定3（200 以外はすべて拒否）を 401/403/429 に限って改める。** 元の設計は `specs/feat-discord-research-fact-entry.md`（実装済み）。

2026-09-12、米国代表の公式発表 `https://eagles.rugby/news/usa-eagles-set-to-kick-off-pacific-nations-cup-against-japan-202699` を出典にした事実を `/調査事実を追加` で送ったところ、`出典 URL が HTTP 429 を返しました。` で拒否された。**ページは実在し、Owner がブラウザで開いて内容を確認していた。** 同サイトは robots.txt にも 403 を返すボット拒否だった。Owner が SQL で直接入れて回避した。

拒否しているのは `lib/discord/source-url.ts:63-68`:

```ts
if (response.status !== 200) {
  return {
    ok: false,
    reason: `出典 URL が HTTP ${response.status} を返しました。`,
  };
}
```

**403/429 はボット対策が URL の実在と無関係に返すので、存在確認として機能しない。** D026 が防ぎたかったのは「404 の捏造 URL」で、こちらは今後も拒否し続ける。代表チームの公式サイトはボット拒否が多く、同じ詰まりが繰り返し起きる見込み。

**追記（D033、同日）**: 上記を実装した PR #815 のマージ後、Reuters の記事 `https://www.reuters.com/sports/springboks-make-two-changes-starting-xv-final-new-zealand-test-2026-09-07/` を出典にした事実が、今度は **HTTP 401** で拒否された。許容集合が `{403, 429}` だったため「目視で確認済み」を選んでも通らなかった。**401 も購読判定・ボット判定が実在と無関係に返すので、403/429 と同じ扱いにする。**

## スコープ

対象:

- `lib/discord/source-url.ts`: 失敗結果に HTTP ステータスを載せる
- `app/api/discord/interactions/route.ts`: モーダルに「出典確認」欄を追加し、401/403/429 のときだけ Owner の選択で保存する

対象外:

- **404・401/403/429 以外の 4xx/5xx・タイムアウト・接続失敗の扱い。** 目視確認済みを選んでも拒否のまま
- robots.txt の参照・本文の読み取り（D026 のとおり、どちらもしない）
- 401/403/429 を返すドメインの自動記憶・許可リスト化
- 拒否後にモーダルを入力済みの状態で開き直すこと（後述「制約」参照）
- 自動取得（`lib/llm/sourced-facts/`）・allowlist
- `supabase/`（データモデル変更なし。`metadata` は jsonb）

## データモデル変更

なし。目視確認で保存した行だけ、`match_sourced_facts.metadata` に次の2キーを足す。

```json
{
  "entry_method": "manual",
  "entry_path": "discord_research_command",
  "source_url_check": "owner_verified",
  "source_url_http_status": 429
}
```

`metadata.entry_method === "manual"` はそのままなので、生成側の扱い（`isManualSourcedFact`、`lib/llm/sourced-facts/fetch.ts:71-73`）は変わらない。**通常どおり 200 で確認できた行には2キーを付けない。**

## API サーフェス

### `validateSourceUrl` の戻り値（`lib/discord/source-url.ts`）

失敗側に `status` を追加する。

```ts
export type SourceUrlValidationResult =
  | { ok: true; sourceDomain: string }
  | { ok: false; reason: string; status: number | null };
```

| 失敗の種類 | `status` |
|---|---|
| URL の形式不正・http(s) 以外 | `null` |
| HTTP 応答が 200 以外（HEAD→GET フォールバック後の最終応答） | その HTTP ステータス |
| タイムアウト | `null` |
| 接続失敗 | `null` |

`reason` の文言は変えない。あわせて次の定数を export する。

```ts
export const OWNER_VERIFIABLE_SOURCE_URL_STATUSES: ReadonlySet<number> = new Set([401, 403, 429]);
```

**HEAD が 405/501 で GET にフォールバックする既存の動き（`:3`・`:54-61`）は変えない。** GET の最終応答が 429 なら `status: 429`。

### Discord の interaction

ルート（`POST /api/discord/interactions`）の入出力形式は変わらない。モーダルの定義と、送信の処理だけが変わる。

## UI サーフェス（Discord モーダル）

`buildResearchFactEntryModal`（`route.ts:128-202`）の `components` の**末尾に5つ目**を追加する。

```ts
{
  component: {
    custom_id: "source_check",
    options: [
      { default: true, label: "自動で確認する", value: "auto" },
      { label: "目視で確認済み（401/403/429 のサイト用）", value: "owner_verified" },
    ],
    placeholder: "出典の確認方法",
    required: false,
    type: 3,
  },
  description: "ボット拒否で弾かれたときだけ「目視で確認済み」を選ぶ",
  label: "出典確認",
  type: 18,
},
```

**Discord のモーダルは `components` が1〜5個まで**（Discord 開発者ドキュメント「Interaction Response Object › Modal」の `components` 行: "Between 1 and 5 (inclusive) components that make up the modal"、2026-09-12 確認）。**これで上限に達する。** 今後の追加欄は既存欄の統合が前提になることをコメントで残す。

### 送信の処理（`parseResearchModalSubmission` / `processResearchFactEntry`）

1. `source_check` の値を読む。**未選択（`null`）は `"auto"` とみなす。** `"auto"`・`"owner_verified"` 以外の値なら、既存の不正入力と同じく `null` を返す（`入力内容を確認してください。`）
2. `validateSourceUrl` を呼ぶ（今と同じ位置 `:354`）
3. 結果で分岐する

| 検証結果 | `source_check` | 動作 |
|---|---|---|
| `ok: true` | どちらでも | 今と同じく保存。`metadata` に2キーを付けない |
| `ok: false` かつ `status` が 401/403/429 | `owner_verified` | **保存する。** `source_domain` は入力 URL の `hostname`、`metadata` に2キーを付ける |
| `ok: false` かつ `status` が 401/403/429 | `auto` | 拒否。`reason` の後ろに下記の案内文を付けて返す |
| `ok: false` かつ上記以外（`status` が 404 等・`null`） | どちらでも | 今と同じく `reason` だけ返して拒否 |

401/403/429 で `auto` のときの案内文（`reason` の直後に改行して付ける）:

```
ボット拒否の可能性があります。リンクを開いて内容を確認済みなら、「出典確認」で「目視で確認済み」を選んで送り直してください。
```

目視確認で保存したときは、既存の `保存: N件、重複スキップ: M件。` の直後に改行して次を付ける:

```
出典 URL は自動確認できなかったため（HTTP 429）、目視確認済みとして保存しました。
```

（`429` の部分は実際の `status`）

- `source_url` には入力値を保存する（D026 決定4、変更なし）
- 試合の存在確認（`:359-370`）・字数検査（`:347-352`）の順序は変えない。**URL 検証より前の検査で拒否された場合は、`source_check` に関係なく今と同じ応答**

### 制約（仕様として受け入れる）

処理は deferred 応答（`type: 5`）の後に `after()` で走るため、拒否されたときにモーダルを入力済みで開き直すことはできない。**Owner は事実を貼り直して送り直す。** 403/429 だと分かっているサイトなら、最初から「目視で確認済み」を選べば1回で済む。

## LLM 連携

なし。保存される行の `entry_method` は変わらないため、生成への渡り方は `specs/fix-manual-facts-generation-cap.md` の定義に従う。

## 受け入れ条件

### `validateSourceUrl`（`tests/lib/discord-source-url.test.ts`）

1. HEAD が 404 → `{ ok: false, status: 404 }`、`reason` は従来と同じ文字列
2. HEAD が 429 → `{ ok: false, status: 429 }`
3. HEAD が 405、GET が 403 → `{ ok: false, status: 403 }`
4. タイムアウト → `status: null`（既存テストの期待値に追加）
5. 接続失敗 → `status: null`（同上）
6. `ftp://` などの非 http(s) → `status: null`（同上）
7. `OWNER_VERIFIABLE_SOURCE_URL_STATUSES` が 401・403・429 だけを含む（`has(404) === false`、`has(500) === false`）

### モーダル（`tests/api/discord-interactions.test.ts`）

8. コマンド起動で返るモーダルの `components` が**ちょうど5個**で、5つ目の `component.custom_id` が `"source_check"`、`value: "auto"` の選択肢が `default: true`

### 送信

fetch をモックし、保存（`match_sourced_facts` の upsert）に渡った行と応答文を検証する。

9. URL が 200・`source_check` 未選択 → 保存される。`metadata` は `{ entry_method: "manual", entry_path: "discord_research_command" }` のみ（今と同じ）
10. URL が 429・`source_check = "auto"` → 保存されない（upsert が呼ばれない）。応答に `出典 URL が HTTP 429 を返しました。` と `「目視で確認済み」を選んで送り直してください` を含む
11. URL が 429・`source_check = "owner_verified"` → 保存される。各行の `metadata.source_url_check === "owner_verified"`、`metadata.source_url_http_status === 429`、`source_domain` が入力 URL の hostname、`source_url` が入力値そのもの。応答に `目視確認済みとして保存しました` を含む
12. URL が 403・`owner_verified` → 11 と同じく保存され、`source_url_http_status === 403`。**401 でも同様に保存され、`source_url_http_status === 401`**（Reuters など購読判定のサイト）
13. URL が 404・`owner_verified` → 保存されない。応答は `出典 URL が HTTP 404 を返しました。` で、目視確認の案内文を含まない
14. URL がタイムアウト・`owner_verified` → 保存されない
15. URL が 200・`owner_verified` → 保存され、`metadata` に2キーが**付かない**
16. `source_check` に `"skip"` など想定外の値 → 保存されず、応答は `入力内容を確認してください。`
17. 事実が300字超・`owner_verified`・URL は 429 → 字数エラーが返り、**fetch が呼ばれない**（検査順が変わっていないことの確認）

### 検出力の確認

18. 次の2つを実際に行い、**テストが落ちることを確認してから元に戻す**。結果を PR 本文に書く
    - `OWNER_VERIFIABLE_SOURCE_URL_STATUSES` に 404 を足す → 13 が落ちる
    - `owner_verified` の分岐で `metadata` の2キーを付けない → 11 が落ちる

### 標準チェック

19. `pnpm lint`・`pnpm typecheck`・`pnpm test` がすべて通る

## マージ順と競合

- **`specs/fix-manual-facts-generation-cap.md` を先にマージする。** 同じ `processResearchFactEntry` の保存応答を触るため、本 spec はそれを取り込んだ main から作る
- 応答文の並びは `保存: …` → （本 spec）目視確認の注記 → （先行 spec）手動件数の通知、の順にする
- 本番操作: デプロイ後、Discord 側でモーダルを開き、5欄目が表示されることを Owner が1回確認する（コマンド定義の再登録は不要。モーダルは毎回ルートが返すため）

## 未解決の質問

なし（対象ステータス・既定値・記録するキーは D032 で決定済み）。
