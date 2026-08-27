# Discord から sourced fact を入力する

## 背景

`feat-news-link-digest.md`（PR #730〜#732）で **RSS からニュースリンクを収集し Discord ops へ通知する仕組みが稼働**した。2026-08-27 の実測で実用性も確認できた。

| 時刻（JST） | 通知件数 |
|---|---:|
| 08-27 14:25 | 4 |
| 08-27 04:30 | 3 |
| 08-26 18:09〜18:10 | 20（初回の滞留分） |

**定常運用では1回あたり3〜4件**で読める量。内容も第2テストのメンバー変更・戦術という**プレビューに直接効く材料**が届いている。

**しかし、読んだ記事の事実を記事生成に反映する経路が無い。** 現状 Owner ができるのは「読んで知る」だけで、`match_sourced_facts` に入れる手段が存在しない。

### なぜ手動入力なのか

海外ラグビーの主要ソースは robots.txt か利用規約のどちらかで**自動取得を閉じている**（2026-08-26 監査で確定）。allowlist の拡大では解決しない。

規制の対象は「Tryline が自動でサイトへアクセスし、**本文を AI に渡す**こと」である。Owner がブラウザで記事を読み、事実を自分の言葉で入力するのは、記者が取材源を読んで事実を報じるのと同じで対象外と整理する。**事実そのものに著作権は無い。**

### なぜ Discord bot なのか

**CLI 案は Owner が却下した（2026-08-26）。** 記事を見つけるのはたいてい移動中やスマホで、そのとき laptop を開くのは非現実的なため。

**通知が来た同じ場所で入力できれば、文脈の切り替えがゼロになる。**

## スコープ

対象:
- Discord Interactions を受ける API ルートの新設
- Ed25519 署名検証
- メッセージのコンテキストメニューコマンド（長押し → アプリ → 事実を追加）
- モーダルでの入力受付
- `match_sourced_facts` への保存
- 読み取り時 allowlist の例外（手動入力のみ）
- 自動再取得からの保護

対象外:
- **`lib/llm/sourced-facts/allowlist.ts` の変更。** 自動取得の制約は一切緩めない
- **`lib/news-links.ts` の変更**（収集側は動いている）
- Discord 通知フォーマットの変更（**本 spec が `match_id: <uuid>` 行に依存する側**）
- 記事の再生成トリガー（別途 `content-regen` の手順で行う）
- 入力した事実の編集・削除機能
- スラッシュコマンド（`/fact` 等）。**コンテキストメニューのみ**

## 常駐 bot は不要

Discord には2つの方式がある。**HTTP 方式を使うこと。**

| 方式 | 仕組み | Vercel |
|---|---|---|
| Gateway | WebSocket の常時接続 | ❌ 動かない |
| **Interactions（HTTP）** | Discord が POST してくる | ✅ **動く** |

Discord アプリの設定で **Interactions Endpoint URL** を登録すると、コマンド使用時に Discord が
`POST /api/discord/interactions` を叩く。常駐プロセスは要らない。

**メッセージへの「返信」を読む方式は Gateway が必要なので採用しない。**

## セキュリティ（最重要）

**これは DB に書き込む公開エンドポイントになる。** CLAUDE.md のセキュリティ要件に直接関わる。

### 1. Ed25519 署名検証は必須

Discord は全リクエストに `X-Signature-Ed25519` と `X-Signature-Timestamp` を付ける。**検証しないと誰でも叩ける。**

- 検証には Discord アプリの **Public Key** を使う（環境変数、例: `DISCORD_PUBLIC_KEY`）
- **Node 標準の `crypto.verify` で Ed25519 検証が可能。** 新規パッケージは不要
- 検証は**生のリクエストボディ**に対して行う。JSON パース後の再シリアライズでは署名が合わない
- 検証失敗は **401** を返す

署名検証つき webhook の前例が2つある。**同じ流儀にすること。**
- `app/api/stripe/webhook/route.ts:46-58`
- `app/api/revenuecat/webhook/route.ts`

### 2. PING に PONG を返す

Discord は Endpoint URL 登録時に `type: 1`（PING）を送る。`type: 1` を返さないと登録できない。

### 3. Owner 以外を拒否する

**Discord のユーザー ID で照合する。** 環境変数に許可する ID を持ち、一致しなければ拒否する。

署名検証だけでは「Discord からの正当なリクエスト」しか保証されない。**同じ bot を他のサーバーに追加されたら誰でも叩ける。**

### 4. 3秒以内に応答する

Discord は3秒で切る。処理が長ければ**先に defer（`type: 5`）を返し、後から結果を送る**こと。

## 入力の流れ

```
① Discord に通知が届く
   🗞 8/29 South Africa × New Zealand
      デイブ・レニー、第2テストに向けフォワード陣の組み合わせを検討
      https://www.rnz.co.nz/...
      match_id: 12d74f1b-0032-4288-a8f8-cd11f3a5bd9f

② その通知を長押し → アプリ → 「事実を追加」

③ モーダルが開く
   - 事実（複数行テキスト・必須）
   - 確度（high / medium / low・任意。既定は medium）

④ 送信 → match_sourced_facts に保存
```

### 試合と出典の特定

**コンテキストメニューコマンドは対象メッセージの内容を丸ごと渡してくる。** そこから抽出する。

- `match_id`: 通知末尾の `match_id: <uuid>` 行から取る
- `source_url`: メッセージ内の URL から取る
- `source_domain`: `source_url` から導出する

**いずれかが取れない場合はエラーを返す。** 推測で埋めない。Owner が通知以外のメッセージに対してコマンドを実行した場合、静かに失敗せず「この形式のメッセージではない」と返すこと。

### content_type の決め方

**キックオフ時刻で機械的に決める。**

- キックオフ前 → `preview`
- キックオフ後 → `recap`

モーダルで選ばせない。項目が増えるほど入力が億劫になる。

## 保存する内容

| カラム | 値 |
|---|---|
| `match_id` | 通知から抽出 |
| `content_type` | キックオフ時刻から決定 |
| `fact` | モーダルの入力（日本語想定） |
| `fact_ja` | **`fact` と同じ値**（生成側が `fact` を読む経路で欠落させないため） |
| `source_url` | 通知から抽出 |
| `source_domain` | `source_url` から導出 |
| `confidence` | モーダルの選択（既定 `medium`） |
| `model_version` | **`manual`** |
| `metadata` | **`{"entry_method": "manual"}` を必ず含める** |

**言語の自動判定はしない。** Owner は日本語で書く前提で、`fact` と `fact_ja` の両方に同じ値を入れる。

## 読み取り時 allowlist の例外

`loadSourcedFactsForMatch`（`lib/llm/sourced-facts/fetch.ts:391`）が読み取り時に無条件でフィルタしている。

```ts
isAllowedSourcedFactDomain(row.source_domain),
```

**このままだと手動入力（rnz.co.nz 等）は記事生成時に無言で捨てられる。**

条件を「**allowlist 内 または 手動入力**」に変える。除外件数の `console.warn` は残すこと。

**自動取得側の検証は一切緩めないこと。** `fetchSourcedFactsForMatch` では従来どおり allowlist を厳格に適用する。

## 自動再取得からの保護

`replaceSourcedFactsForSourceDomains`（同 `:98-101`）は次の条件で DELETE する。

```ts
.delete()
  .eq("match_id", matchId)
  .eq("content_type", contentType)
  .eq("source_domain", sourceDomain);
```

`source_domain` 単位の全削除なので、**allowlist 内のドメイン（例 `springboks.rugby`）から手動で足した事実は、次の自動再取得で消える。**

allowlist 外のドメインなら自動側が取得しないため偶然生き残るが、**その偶然に依存させない。**

DELETE 条件から手動入力行を除外すること（`metadata->>'entry_method' is distinct from 'manual'` 等）。

## 由来の判定

**`metadata.entry_method` を正とする。** `model_version === "manual"` だけで判定しない。`model_version` は表示・デバッグ用の補助。

判定用のヘルパを1つ設けること（例: `isManualSourcedFact(row)`）。

## データモデル変更

なし

## API サーフェス

`POST /api/discord/interactions` を新設。**cron 認証ではなく Ed25519 署名検証**を使う。

## UI サーフェス

なし（Discord 内で完結）。ただし入力した事実は他の事実と同様に記事へ反映され、出典リンクが表示される。

## LLM 連携

パイプラインの段階は変えない。手動入力した事実は自動取得と同じ扱いで「事実抽出」の出力に混ざり、ナラティブ生成と QA に渡る。

## Owner 側の作業（実装前に必要）

**Codex では完結しない。** 以下は Owner が Discord Developer Portal で行う。

1. Discord アプリを作成（既にあれば流用）
2. **Public Key** を取得し、Vercel の環境変数に設定
3. **Interactions Endpoint URL** に `https://trylinerugby.com/api/discord/interactions` を登録
   - **実装をデプロイしてから登録する。** Discord は登録時に PING を送り、応答が無いと拒否する
4. **メッセージのコンテキストメニューコマンド**「事実を追加」を登録
5. Owner の Discord ユーザー ID を環境変数に設定

**spec には必要な環境変数名を明記すること。**

## 受け入れ条件

1. `POST /api/discord/interactions` が Ed25519 署名を検証し、不正な署名を **401** で拒否する
2. 検証が**生のリクエストボディ**に対して行われている（パース後の再シリアライズを使っていない）
3. `type: 1`（PING）に `type: 1`（PONG）を返す
4. **Owner 以外の Discord ユーザー ID からのリクエストを拒否する**
5. 3秒以内に応答する（必要なら defer を返す）
6. 通知メッセージから `match_id` と `source_url` を抽出できる
7. **抽出できない場合、推測せずエラーを返す**
8. `content_type` がキックオフ時刻から決定される（前なら `preview`、後なら `recap`）
9. 保存された行の `metadata.entry_method` が `"manual"`、`model_version` が `"manual"`
10. `fact` と `fact_ja` の両方に同じ値が入る
11. **allowlist 外のドメイン（例 `rnz.co.nz`）でも保存でき、`loadSourcedFactsForMatch` が返す**
12. **自動取得の経路では allowlist が従来どおり厳格に効く**（緩んでいないことをテストで証明する）
13. **`replaceSourcedFactsForSourceDomains` が手動入力行を削除しない。** allowlist 内ドメインで手動追加した行が自動再取得後も残ることをテストで確認する
14. 同じ `fact` を再投入しても重複行を作らない（一意制約 `match_id, content_type, fact`）
15. `lib/llm/sourced-facts/allowlist.ts` と `lib/news-links.ts` に差分が無い
16. 必要な環境変数名が spec と PR 本文に明記されている
17. `pnpm lint` / `pnpm tsc --noEmit` / `pnpm test` / `pnpm build` がすべて clean

## 未解決の質問

- **入力後の記事再生成。** 事実を足しても既存の記事は自動更新されない。`content-regen` の手順で再生成が要る。**本 spec では扱わない**が、運用で頻繁に必要になるなら別 spec の候補
- **鮮度管理。** 手動入力は入れっぱなしになる。情報が後で覆った場合の上書きは Owner の手作業
- **出典リンクの扱い。** 手動入力でも記事に出典リンクが出る。allowlist 外ドメインへのリンクを記事に出すことの是非は `project_news_item_copyright_posture`（出典リンク化を決めた PR #603）と合わせて別途確認する余地がある
- **紐付け精度。** 現在は `All Blacks` を含む記事がすべて直近の該当試合に紐付く。実際に 8/25 のライオンズ戦の記事が 8/29 の第2テストに紐付いた例がある。**複数試合が並行する11月の欧州遠征では精度が問題になる。** 本 spec では扱わないが、いずれ手当てが要る
