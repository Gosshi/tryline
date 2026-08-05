# 放送情報の自動取得

## 背景

`specs/feat-match-broadcasts.md`（2026-07）で `match_broadcasts` テーブル・投入 CLI（`tools/upsert-match-broadcasts.ts`）・Web/モバイルの表示までを実装した。同 spec は投入を「Owner の週次手動運用」とし、自動取得は「需要とコストを見て別 spec」として対象外にしていた。

**その週次運用は定着しなかった。** 2026-08-06 時点で `match_broadcasts` に存在するのは 2026-07-18 の Nations Championship 第3節6試合分（14行）だけで、機能を実装した週の1ラウンドのみ。以降に追加はなく、**今後の全試合の放送情報がゼロ件**である。8/8 の日本×オーストラリアも、11/8・11/15・11/21 の日本代表欧州遠征も空のまま。

「日本 オーストラリア ラグビー 放送」「ラグビー 日本代表 テストマッチ 放送」は日本語圏で最も検索意図の強いクエリ群であり、視聴の意思決定に直結する。手動運用の前提が崩れた以上、自動取得に切り替える。

### 取得元の決定（2026-08-06 実地確認）

初版では放送局の番組表（J SPORTS / WOWOW）を取得元にする設計だったが、実測の結果 **JRFU（日本ラグビーフットボール協会）の試合ページを唯一の取得元とする**。番組表方式より大幅に単純で、取得できる情報も多い。

**JRFU 試合ページ: 1ページ＝1試合で放送情報が揃っている。**

`https://www.rugby-japan.jp/match/{jrfuMatchId}` の生 HTML（実測 45KB、サーバーレンダリング）に次の構造がある。

```html
<div class="gameInfo">
  <span class="dates">08.08 Sat </span>
  <span class="start">19:05 </span>
  <span class="stadium">東大阪市花園ラグビー場（大阪府）</span>
</div>
<div class="broadcast">放送・配信：
  <a href="https://www.bs4.jp/..." target="_blank" rel="noopener">BS日テレ</a>／
  <a href="https://www.jsports.co.jp/program_guide/..." target="_blank" rel="noopener">J SPORTS 1</a>／
  <a href="https://www.hulu.jp/livetv/283" target="_blank" rel="noopener">Hulu</a>／
  <a href="https://jod.jsports.co.jp/..." target="_blank" rel="noopener">J SPORTSオンデマンド</a>
</div>
```

- サービス名（アンカーテキスト）と URL（`href`）が**対で取れる**。`match_broadcasts` が必要とする形そのもの
- 一覧ページ `https://www.rugby-japan.jp/schedule/` から `/match/{id}` のリンクを列挙できる（実測で2026年の日本代表11試合が全て取れ、DB の日本戦11件と1対1で一致。11月の欧州遠征3試合を含む）
- `robots.txt` は 404（不在）で制限なし。`rugby-japan.jp` は `lib/llm/sourced-facts/allowlist.ts` の許可ドメインに既出

**番組表方式より優れている点:**

1. 1ページ＝1試合なので、**番組タイトルと試合を突き合わせる曖昧なマッチングが不要**になる
2. 放送開始時刻を取る必要がない（放送はキックオフ時刻に始まる。既存スキーマに時刻カラムもない）
3. J SPORTS 番組表だけでは拾えない **BS日テレ・Hulu まで取れる**（8/8 の実測で4サービス）

**制約:** JRFU は日本代表戦のみを扱う。Premiership・URC・Top 14・Six Nations などの非日本戦は対象外になる。ただし日本語圏の検索需要と11月の集客計画はいずれも日本代表戦に集中しており、最も価値の高い部分をカバーできる。非日本戦は未解決の質問に回す。

## スコープ

対象:
- JRFU 試合一覧ページからの試合 URL 列挙
- JRFU 試合ページからの放送情報抽出
- 抽出結果と `matches` レコードの**決定論的な**突き合わせ
- `match_broadcasts` への冪等な upsert
- 定期実行の cron ルートと GitHub Actions ワークフロー
- 実行結果と未投入分の Discord 通知

対象外:
- **LLM の使用（この spec のパイプラインに LLM は一切登場させない）**。`feat-match-broadcasts.md` の「視聴先データは公式ページから人間が確認して投入する。LLM による補完・生成は禁止 — 誤った視聴情報は捏造 recap と同種の信頼毀損」を継承し、さらに強めて推論そのものを排除する
- 放送局の番組表（J SPORTS / WOWOW）からの取得。未解決の質問に回す
- 非日本戦の放送情報
- 放送開始時刻の取得・保存
- 過去試合への遡及投入（`feat-match-broadcasts.md` の対象外を継承）
- 既存の手動 CLI `tools/upsert-match-broadcasts.ts` の廃止。緊急投入手段として残す
- `matches.external_ids` への JRFU 試合 ID の保存。日付で一意に決まるため不要
- 有料/無料の区別、解説者情報などのメタデータ拡張

## データモデル変更

**なし。マイグレーション不要。** 既存の `match_broadcasts` をそのまま使う。

- `unique (match_id, service_name)` 制約が既にあるため、同一サービスの再投入で行が増えない（冪等性はこの制約に依存する）
- `source_url` に JRFU 試合ページの URL、`verified_at` に取得時刻を入れる
- RLS は既存の `public read` ポリシーのまま。書き込みは service role（`lib/db/server.ts`）で行う

## API サーフェス

### 新規 cron ルート

`app/api/cron/ingest-broadcasts/route.ts`

- `POST` のみ。`assertCronAuthorized(request)` で認可（`app/api/cron/audit-data-integrity/route.ts` と同じ形）
- `runtime = "nodejs"`、`maxDuration` は 60 を目安にする
- 処理本体は `lib/broadcasts/ingest.ts` に置き、ルートは呼び出しと結果の JSON 返却のみ

### 新規モジュール

`lib/scrapers/jrfu-match-broadcasts.ts`

```
export type JrfuMatchBroadcast = {
  serviceName: string;   // アンカーテキストそのまま。例: "J SPORTS 1"
  url: string;           // href そのまま
};

export type JrfuMatchPage = {
  broadcasts: JrfuMatchBroadcast[];
  dateLabel: string;     // span.dates のテキスト。例: "08.08 Sat"
  sourceUrl: string;     // 試合ページ URL
};

export async function listJrfuMatchUrls(): Promise<string[]>;
export async function fetchJrfuMatchPage(url: string): Promise<JrfuMatchPage>;
```

`lib/broadcasts/ingest.ts`

```
export type BroadcastIngestResult = {
  generatedAt: string;
  linked: Array<{ kind: "tv" | "streaming"; matchId: string; serviceName: string }>;
  matchesStillMissing: Array<{ kickoffAt: string; label: string; matchId: string }>;
  unknownServices: Array<{ serviceName: string; sourceUrl: string; url: string }>;
  unlinkedPages: Array<{ dateLabel: string; reason: string; sourceUrl: string }>;
};

export async function runBroadcastIngest(...): Promise<BroadcastIngestResult>;
```

取得には必ず `lib/scrapers/fetcher.ts` の既存フェッチャを使う（robots 判定・リトライ・レート制限を再実装しない）。

## UI サーフェス

**変更なし。** 放送バッジの描画は試合詳細・チームページともに実装済みで、データが入れば自動的に表示される。

## LLM 連携

**なし。この spec のどの段階でも LLM を呼ばない。**

放送情報は「事実の転記」であり生成物ではない。サービス名・URL は JRFU ページの表記をそのまま保存し、言い換えも要約もしない。

### 試合の突き合わせ（決定論的）

JRFU 試合ページを `matches` の1件に紐付けるのは、次を満たすときに限る。

1. `span.dates` の日付（JST、年はページ取得時点の一覧から判断）が、`matches.kickoff_at` を JST 換算した日付と一致する
2. その試合の対戦チームのいずれかが日本（`teams.slug = 'japan'`）である

日本は1日に2試合行わないため、この2条件で一意に決まる。**該当が0件または2件以上になった場合は紐付けず** `unlinkedPages` に理由付きで入れる。取り違えのリスクを負うより未投入のまま残すほうが安全である。

### `kind` の判定（明示マップのみ）

`match_broadcasts.kind` は `tv` / `streaming` の2値。サービス名から**明示的な対応表**で決める。

| サービス名（完全一致） | kind |
|---|---|
| `BS日テレ` | `tv` |
| `J SPORTS 1` `J SPORTS 2` `J SPORTS 3` `J SPORTS 4` | `tv` |
| `Hulu` | `streaming` |
| `J SPORTSオンデマンド` | `streaming` |

**表にないサービス名が出てきた場合は推測せず、その行を upsert しない。** `unknownServices` に入れて Discord に出し、Owner が表を更新する。「オンデマンド」「配信」などの文字列から機械的に判定するヒューリスティックを入れないこと（新サービスの取り違えを生む）。

### 通知

`lib/llm/notify.ts` に `notifyBroadcastIngestReport(result)` を追加する（既存の `notifyDataIntegrityReport` と同じ Discord 送信経路を使う。モジュール名に llm とあるが配置は既存に合わせる）。

メッセージに含めるもの:
- 投入できた件数と内訳（試合ラベル + サービス名）
- `unknownServices` の一覧（Owner が対応表を更新するための情報）
- `unlinkedPages` の件数と理由
- **14日以内にキックオフする試合のうち、まだ放送情報が1件も無いもの**（非日本戦を含む。JRFU で埋まらない分の手動投入の催促になる）

## 受け入れ条件

1. `POST /api/cron/ingest-broadcasts` が cron 認可なしで呼ばれた場合に 401 を返す。
2. JRFU の取得が `lib/scrapers/fetcher.ts` 経由で行われ、robots 判定を通っている。
3. `https://www.rugby-japan.jp/schedule/` から試合ページ URL が列挙され、各試合ページの `div.broadcast` 内のアンカーからサービス名と URL が対で抽出される。
4. 突き合わせの2条件（JST 日付一致・日本が参加）を満たす場合だけ `match_broadcasts` に upsert される。該当0件または複数件の場合は upsert されず `unlinkedPages` に入る。
5. 同一ページを2回続けて取り込んでも `match_broadcasts` の行数が増えない（`unique (match_id, service_name)` による冪等性）。
6. 対応表にないサービス名は upsert されず `unknownServices` に入る。文字列からの推測による `kind` 判定が行われていない。
7. `service_name` と `url` が JRFU ページの表記から改変されずに保存される（要約・言い換え・補完がない）。
8. `source_url` に JRFU 試合ページの URL が入る。
9. Discord 通知に `unknownServices` と「14日以内にキックオフする試合で放送情報が0件のもの」の一覧が含まれる。
10. パイプラインのどこからも OpenAI クライアント（`lib/llm/` のモデル呼び出し）が呼ばれない。
11. GitHub Actions ワークフロー `.github/workflows/cron-ingest-broadcasts.yml` が追加され、既存の cron ワークフロー（例: `cron-audit-data-integrity.yml`）と同じ認可ヘッダの渡し方をしている。実行頻度は日次。
12. 既存の `tools/upsert-match-broadcasts.ts` が削除も破壊もされていない。
13. `pnpm lint` / `pnpm tsc --noEmit` / `pnpm test` / `pnpm build` がすべて clean。

## 未解決の質問

1. **非日本戦の放送情報は本 spec では埋まらない。** Premiership・URC・Top 14・Six Nations・Nations Championship の非日本戦は JRFU に載らない。当面は Discord 通知の「14日以内で放送情報が0件の試合」を見て手動投入する。自動化するなら J SPORTS の番組表が候補になる。実地確認済みで、`https://www.jsports.co.jp/program_guide/month/japanese/YYMMDD/` の生 HTML（194KB）に番組表が含まれることと、抽出位置（チャンネル名 `th.w-channel__head--ch` の `abbr` 属性 / 番組セル `td.w-channel__item` / 開始時刻 `dt.w-channel__dt > p` は和文12時間制 / 番組名と URL は `dd.w-channel__dd > a`）まで確認してある。ただし番組タイトルと試合の突き合わせが必要になり複雑度が跳ね上がるため、本 spec には含めない。**注意: J SPORTS のグローバルナビには番組名と同一の文字列がメニュー項目として存在するため、ページ全体の文字列検索で番組を探すと必ず誤検出する。** 抽出は `td.w-channel__item` 配下に限定すること。

2. **WOWOW は SPA のため取得できない。** `https://www.wowow.co.jp/schedule/20260808` と `https://www.wowow.co.jp/schedule/` のレスポンスがバイト数まで完全一致（実測 51,344 bytes）で日付パスが無視され、時刻表記が HTML に1件も含まれない。裏に `POST https://www.wowow.co.jp/API/new_prg/programlist.php` が存在すること（robots.txt の `Disallow` 対象外）は確認済みだが、パラメータなしで叩くと `{"result":"1","error_response":{"cd":"202","message":"パラメータ不正（必須未入力）"}}` を返し、必要なパラメータの形は未確定。推測でパラメータを組むことは禁止する。必要になったら開発者ツールで実リクエストを観測してから別 spec を切る。

3. **JRFU の年跨ぎの扱いが未確認。** `span.dates` は `08.08 Sat` の形式で年を含まない。一覧ページから年を判断できるかを実装時に確認すること。判断できない場合は、キックオフが現在時刻から前後1年以内の試合に限定して突き合わせる。

4. **`kind` の対応表は初期4サービスのみ。** 新しい放送局・配信サービスが出るたびに `unknownServices` として通知され、Owner が表を更新する運用になる。頻度が高すぎるようなら設計を見直す。

5. **8/8 日本×オーストラリア（本 spec 作成の2日後）には間に合わない。** 直近の試合は既存の `tools/upsert-match-broadcasts.ts` で手動投入する必要がある。JRFU の該当ページ（`https://www.rugby-japan.jp/match/29968`）に BS日テレ・J SPORTS 1・Hulu・J SPORTSオンデマンドの4サービスが掲載されていることは確認済み。
