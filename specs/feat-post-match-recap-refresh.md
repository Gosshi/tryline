# 月曜朝の試合後レビュー強制リフレッシュ

## 背景

`feat-thursday-weekend-preview-refresh.md`でプレビュー側の「一度生成したら二度と事実を再取得しない」問題を修正するが、レビュー（recap）側は設計上さらに徹底していて、`lib/llm/sourced-facts/fetch.ts`の`shouldUseCachedFacts`に`if (contentType === "recap") return true`という明示的な分岐があり、**recapの事実は`force=true`を渡さない限り常にキャッシュ扱い**になる。

Owner の要望: 「試合後のニュースも取得してレビューを反映する必要も感じている」。試合終了直後は判明していない情報（公式Player of the Match、退場・イエローカードに伴う出場停止処分、負傷の詳細、試合後の監督・主将コメント）が、試合後数時間〜数日で判明することがある。現状のrecapは試合終了直後に一度生成されたら、その後どれだけ新しい情報が出ても反映されない。

`buildSearchPrompt`（`lib/llm/sourced-facts/fetch.ts`）には既に`content_type === "recap"`用のsearch intent（公式スタッツ・POTM・負傷・カード＆出場停止・試合後コメント）が実装済みで、`fetch-sourced-facts`エンドポイントも`content_type=recap`をそのまま受け付ける。`force=true`は`shouldUseCachedFacts`の分岐より前段でチェックされるため、`force=true`を渡せば recap でも正しくWeb検索が再実行されることを確認済み。

`feat-thursday-weekend-preview-refresh.md`と同一パターン（既存API・既存インフラを流用し、新規GitHub Actions workflowを1本追加するだけ）で実現できる。

## スコープ

対象:
- 新規 GitHub Actions workflow（`.github/workflows/cron-post-match-recap-refresh.yml`）を追加する
- 毎週月曜 09:05 JST（00:05 UTC。既存`cron-live-pipeline.yml`の09:00 JST枠の直後）に実行。週末（金〜日）に終了した試合をまとめて対象にする
- 実行内容:
  1. `GET /api/v1/calendar?from=<4日前>&to=<今日>`（既存の公開エンドポイント）で対象期間の試合一覧を取得
  2. `status: "finished"`の試合それぞれについて:
     - `POST /api/cron/fetch-sourced-facts?match_id=<id>&content_type=recap&force=true`
     - `POST /api/cron/generate-content`（body: `{"contentType":"recap","matchIds":["<id>"],"language":"ja"}`）で再生成
  3. 各ステップの成功・失敗をログに残す（`cron-ingest-league-one-lineups.yml`と同様、非200はWARNログを出すが処理は続行）
  4. 最後に対象試合数・成功数・失敗数のサマリをログに出す

対象外:
- `orchestrate.ts`本体（初回のrecap生成ロジック）の変更（初回生成は現状のまま。本specは「初回生成後の追いリフレッシュ」のみを扱う）
- 事実が実際に変化したかどうかの差分検知（`feat-thursday-weekend-preview-refresh.md`と同様、週1回・試合数も限られるため対象試合は毎回無条件で再生成する）
- 英語版コンテンツ（`language="en"`）の対象は本specでは扱わない
- 試合後ニュースの収集を「週末ニュースダイジェスト」routineのような人手レビュー付きの別ルートで行うこと（本specは既存の自動化されたsourced-facts機構をそのまま使う。ダイジェストroutineとは別軸）
- プレビュー側の対応（`feat-thursday-weekend-preview-refresh.md`で別途扱う）

## データモデル変更

なし。既存の`match_content`・`match_sourced_facts`テーブルをそのまま使う。

## API サーフェス

新規APIエンドポイントは無し。既存の3エンドポイントを新しいGitHub Actions workflowから呼び出すのみ:
- `GET /api/v1/calendar`（既存、公開）
- `POST /api/cron/fetch-sourced-facts`（既存、`CRON_SECRET`認証、`content_type=recap`）
- `POST /api/cron/generate-content`（既存、`CRON_SECRET`認証、`contentType=recap`）

## LLM 連携

- 使用モデル: 既存の`generateMatchContent`が内部で使う`MODELS.NARRATIVE`（`gpt-4o`）・sourced facts取得の`MODELS.WEB_SEARCH`をそのまま使用。変更なし
- **コスト見積もり**: 週末開催試合数は目安6〜15試合。週1回・1試合あたり通常のrecap生成と同等のコストで、既存の生成コストパターンの再利用のため新規コストパターンではない。Owner承認のもと、毎週自動実行する

## 受け入れ条件

1. `.github/workflows/cron-post-match-recap-refresh.yml`が、毎週月曜09:05 JST（00:05 UTC）に実行されるスケジュールで設定されている
2. `workflow_dispatch`での手動実行にも対応している（対象期間`from`/`to`を入力パラメータで指定できる）
3. `/api/v1/calendar`から取得した試合のうち、`status: "finished"`かつキックオフが対象期間内のものだけが対象になる（`scheduled`のまま・中止の試合は対象外）
4. 各対象試合について`fetch-sourced-facts`（`content_type=recap`, `force=true`）→`generate-content`（`contentType=recap`）の順で呼ばれる
5. `fetch-sourced-facts`が失敗した試合は`generate-content`を呼ばない（古い事実のまま再生成しない）
6. いずれかの試合でAPI呼び出しが失敗しても、他の試合の処理は継続する
7. workflow の実行ログに、対象試合数・成功数・失敗数が分かる形で出力される
8. 本番投入はOwner承認後に別途行う（`CRON_SECRET`・`PRODUCTION_URL`のGitHub Secretsは既存のものを再利用）

## 未解決の質問

- 月曜09:05 JSTの1回だけで十分か、試合終了からのリードタイムが短い試合（日曜深夜キックオフ等）に対しては情報が出揃っていない可能性がある。運用してみて必要なら火曜にもう1回追加するかは、実運用後にOwnerと判断する
