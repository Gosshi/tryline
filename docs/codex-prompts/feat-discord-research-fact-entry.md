仕様書 `specs/feat-discord-research-fact-entry.md` を実装してください。**先に全文を読んでください。**

## 何を作るか

Owner が ChatGPT で調べた事実を、Discord のスラッシュコマンドから `match_sourced_facts` に登録する経路を追加します。

**既存の入力経路（通知メッセージを長押しするコンテキストメニュー）は変更しません。** そちらは `news_links` との照合を必須にしており、調査由来の事実はその条件を満たせないため、**別のコマンドとして並列に追加**します。

## 触るファイル

| ファイル | 変更 |
|---|---|
| `app/api/discord/interactions/route.ts` | 新コマンドの分岐を追加 |
| （新規）URL 存在確認のユーティリティ | 素の fetch で存在確認のみ |
| テスト | 下記「テスト」参照 |

**次のファイルには差分を作らないでください。**

- `lib/llm/sourced-facts/allowlist.ts`
- `lib/news-links.ts`
- `lib/scrapers/fetcher.ts`

## 既存コードの読みどころ

### 1. 既存のコマンド処理（`app/api/discord/interactions/route.ts`）

```
:16   FACT_ENTRY_COMMAND_NAME = "事実を追加"
:17   FACT_ENTRY_MODAL_PREFIX = "fact-entry"
:21   MODAL_ID_PATTERN … `^fact-entry:(UUID):(UUID)$`
:116  コマンド名の照合
:159  custom_id の組み立て（match_id : news_link_id）
:200  モーダル送信の入口（type 5）
:304  署名検証と Owner 判定
:323  type 1（PING）
:334  type 2（コマンド）
:337  type 5（モーダル送信）
```

**`MODAL_ID_PATTERN` は UUID を2つ要求します。** 調査由来の事実には `news_link_id` が無いので、**新しい prefix と新しいパターン**を用意してください。既存のパターンを緩めないでください。

**interaction type 4（オートコンプリート）は処理されていません。** 実装しないでください。試合の選択はモーダル内の String Select で行います。

### 2. モーダルの組み立て方（既存 `:159` 付近を踏襲）

**過去に2回失敗した箇所です。** PR #738 → #739 → PR（`fix-discord-modal-required-placement.md`）の順で修正済みの形が既に `route.ts` にあります。**その形をそのまま真似てください。**

守るべき点は仕様書に列挙していますが、要点は次の2つです。

- コンポーネントは **Label（type 18）** で包む。Action Row（type 1）に入れると payload ごと破棄される
- **`required` は Label ではなく、包まれる側（Text Input / String Select）** に付ける

**「サーバーは 200 を返しているのに Discord がタイムアウト表示になる」場合、遅延ではなく payload 不正です。** 遅延を疑って defer を足す方向に進まないでください。

### 3. `entry_method` の意味（`lib/llm/sourced-facts/fetch.ts`）

```
:75   metadata?.entry_method === "manual" を判定
:109  .or("metadata->>entry_method.is.null,metadata->>entry_method.neq.manual")
      ← 自動再取得時の削除対象からの除外
:400  isAllowedSourcedFactDomain(row.source_domain) || isManualSourcedFact(row)
      ← 読み取り時の allowlist 例外
```

**`entry_method` は必ず `"manual"` にしてください。** 別の値にすると、保存はできても記事生成時に無言で捨てられるか、次の自動取得で消えます。

**新しい経路であることは別のキー**（例: `entry_path`）で表してください。

### 4. 一意制約

```
match_sourced_facts_match_id_content_type_fact_key  (match_id, content_type, fact)
```

同じ事実の再投入で重複行を作らないよう、この制約に沿った upsert にしてください。

## 1送信で複数の事実を入れます（2026-09-04 に仕様変更）

**当初は1送信=1事実でしたが、実運用の規模で確かめて変更しました。** 仕様書の「入力の流れ」と「事実の分割と書式」を読んでください。

- **「事実」は複数行入力で、1行が1件**
- **HTTP リクエストは1送信につき1回だけ。** 事実の件数に比例させないでください
- **同一送信の全レコードが同じ `source_url` / `source_domain` / `confidence` / `content_type` を持つ**
- **応答に保存件数と重複スキップ件数を含める**

分割の規則（空行の除去・箇条書き記号の除去・1件あたりの上限）は仕様書に列挙してあります。**上限は定数として定義してください。**

**上限が要るのは実害があったからです。** 2026-08-30 の手動入力テストで、**66行の会話体の論評が1件の事実として保存されました。** `match_sourced_facts` は生成パイプラインが事実として読む場所なので、そのまま記事本文に意見が混ざります。

## 3秒制限

**モーダルを開く応答は defer できません。** 試合候補の取得は1クエリで済ませてください。

**モーダル送信の応答は defer してください。** URL への HTTP リクエストが入るため、defer しないとタイムアウト表示になります。

## URL 検証の実装方針

```
http/https 以外 → 拒否
HEAD を試す
  405 等で拒否 → GET にフォールバック
リダイレクトは追う
最終ステータスが 200 → 合格
それ以外・タイムアウト・接続失敗 → 拒否（理由を Owner に返す）
```

- **レスポンスボディを読まないでください。** 存在確認だけです
- **`fetchWithPolicy` を使わないでください。** robots.txt を強制するため、検証段階で弾かれます。**robots.txt を参照しない件は Owner が 2026-09-04 に承認済みです**（`docs/decisions.md` の D026）。仕様書の未解決の質問からは外してあります
- **この例外はこの検証処理の中だけです。** `lib/scrapers/` 配下と `fetchSourcedFactsForMatch` の自動取得は従来どおり robots.txt と allowlist を厳格に適用します。**そちらに手を入れないでください**
- **タイムアウトは定数として定義してください**

`source_url` には**リダイレクト後の URL ではなく入力値**を保存してください。

## テスト

URL 検証の各分岐を必ず覆ってください。

- 200 → 合格
- 404 → 拒否・**1件も保存されない**
- タイムアウト → 拒否・**1件も保存されない**
- `javascript:` 等の不正スキーム → 拒否
- HEAD が 405 → GET にフォールバックして合格

事実の分割も同様に覆ってください。

- 複数行 → 複数レコード
- 空行・空白のみの行が捨てられる
- 行頭の箇条書き記号が除去される
- 全行が空 → 拒否
- 上限超過の行 → 拒否（どの行か分かる）
- 一部が既存と重複 → 残りは保存され、スキップ件数が返る

加えて次の2点を証明してください。

- 保存された行が `loadSourcedFactsForMatch` から返る（**allowlist 外ドメインでも**）
- **自動取得経路の allowlist が緩んでいない**

## 完了の定義

1. `specs/feat-discord-research-fact-entry.md` の受け入れ条件30項目をすべて満たす
2. `pnpm lint` / `pnpm tsc --noEmit` / `pnpm test` / `pnpm build` がすべて clean
3. PR 本文に次を記載する
   - **新設したスラッシュコマンドの `name`**（Owner が登録時に使うため。実装の定数と完全一致させる）
   - **Owner が実行するコマンド登録の手順**
   - **URL 検証のタイムアウト値**
   - **`metadata` に入れた実際のキーと値**
   - **1件あたりの最大文字数**

## 判断に迷ったら

**仕様書に矛盾や不足を見つけたら、実装を進めずに質問してください。** 過去に自己矛盾した仕様書を出して手戻りさせた実績があります。**推測で埋めないでください。**

Discord の API について仕様書に書かれていない点は、**公式ドキュメントのフィールド表を確認してください。** 例示コードに無いことはフィールドが存在しないことを意味しません。この取り違えで一度誤実装が発生しています。
