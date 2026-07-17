# 木曜・金曜夕方の週末プレビュー強制リフレッシュ

## 背景

2026-07-17、日本 vs フランス（7/18土曜開催）のプレビューが、7/16木曜に発表された日本代表23名スコッドやフランスのデュポン離脱情報を反映していない状態で公開されていた。手動で週末ニュースダイジェストの事実を取り込み、`scripts/import-news-digest-facts.ts --regenerate-preview`で個別に再生成して対応した。

調査の結果、根本原因は2つ判明した:

1. `lib/llm/sourced-facts/fetch.ts`の`shouldUseCachedFacts`には、キックオフ72時間前から24時間ごとに事実を再取得する設計が既にあるが、`lib/cron/orchestrate.ts`の対象試合抽出が「プレビュー未生成の試合」のみを対象にしており、**一度プレビューが生成された試合は二度と`fetchSourcedFacts`の対象にならない**。このリフレッシュ設計は事実上デッドコード
2. ラグビーの国際試合（Nations Championship等）は、土曜開催なら火〜木、日曜開催なら金曜までに登録メンバー（スコッド）が発表されることが多い。この現実の発表リズムに、コンテンツ生成のタイミングが追従できていない

Owner の要望: 「木曜日の夕方までには土曜日のメンバーは発表されるので、木曜日の夕方にメンバーとニュースを取得した上で、プレビューを生成するようにしたい」。さらに「日曜日の試合は金曜日にメンバー発表することが多いから分けた方が良い」との追加指摘があり、土曜開催分と日曜開催分で対象日を分けた2回のパスにする。

`orchestrate`の汎用ロジックを複雑化する（1の一般解を作る）よりも、実際の発表リズムに合わせた専用の週次バッチ（木曜夕方に土曜開催分、金曜夕方に日曜開催分をそれぞれ強制リフレッシュ）を追加する方が、シンプルでコストも予測しやすい。1の一般的な72時間リフレッシュ機構を`orchestrate`本体に組み込む対応は、本specでは対象外とし、必要になれば別specで扱う。

## スコープ

対象:
- 新規 GitHub Actions workflow（`.github/workflows/cron-weekend-preview-refresh.yml`）を追加する。1つのworkflowに、対象日の異なる2つのscheduleトリガーを持たせる:
  - **木曜 21:00 JST（12:00 UTC）**: 対象は「直近の金曜・土曜キックオフの試合」（`from=<実行日>`, `to=<実行日+2日>`）
  - **金曜 21:00 JST（12:00 UTC、翌日扱いで金曜は UTC 表記だと12:00のまま曜日だけ変わる）**: 対象は「直近の日曜キックオフの試合」（`from=<実行日+1日>`, `to=<実行日+2日>`）
  - どちらのトリガーで実行されたかは、GitHub Actions の `github.event.schedule`（cron文字列）で分岐し、対象期間の`from`/`to`をjob内で計算する
  - 既存の`cron-live-pipeline.yml`の21:00 JST枠（木曜・金曜とも）と同時刻になるため、`orchestrate`本体より後に実行されるよう、cron時刻をこの回の直後（例: 12:05 UTC）にずらし、同日の通常生成と競合しないようにする
- 実行内容:
  1. `GET /api/v1/calendar?from=<対象開始日>&to=<対象終了日>`（既存の公開エンドポイント）で対象期間の試合一覧を取得
  2. `status: "scheduled"`の試合それぞれについて:
     - `POST /api/cron/fetch-sourced-facts?match_id=<id>&content_type=preview&force=true`（既存エンドポイント、`force=true`で24時間キャッシュを無視して強制的にWeb検索）
     - `POST /api/cron/generate-content`（既存エンドポイント、body: `{"contentType":"preview","matchIds":["<id>"],"language":"ja"}`）で再生成
  3. 各ステップの成功・失敗をログに残す（`cron-ingest-league-one-lineups.yml`と同様、非200はWARNログを出すが処理は続行）

対象外:
- `orchestrate.ts`本体への72時間リフレッシュロジックの組み込み（背景で述べた通り、本specでは扱わない）
- 事実が実際に変化したかどうかの差分検知（今回は週1回・試合数も限られるため、対象試合は毎回無条件で再生成する。コスト見積もりは後述）
- 英語版コンテンツ（`language="en"`）の対象は本specでは扱わない（既存の`generateLeagueOneEnglishContent`相当の処理は呼ばない）
- recap（レビュー）側の対応（別途Owner要望の「試合後ニュース→レビュー反映」specで扱う）
- `ingest-squads`（Wikipedia経由のシックスネーションズ限定スコッド取り込み）の対象大会拡張（優先度を下げ、別specで扱う）

## データモデル変更

なし。既存の`match_content`・`match_sourced_facts`テーブルをそのまま使う。

## API サーフェス

新規APIエンドポイントは無し。既存の3エンドポイントを新しいGitHub Actions workflowから呼び出すのみ:
- `GET /api/v1/calendar`（既存、公開）
- `POST /api/cron/fetch-sourced-facts`（既存、`CRON_SECRET`認証）
- `POST /api/cron/generate-content`（既存、`CRON_SECRET`認証）

## LLM 連携

- 使用モデル: 既存の`generateMatchContent`が内部で使う`MODELS.NARRATIVE`（`gpt-4o`）をそのまま使用。変更なし
- **コスト見積もり**: 週末（金〜日）の対象試合数は目安6〜15試合（Nations Championship等の大会規模による）。木曜分・金曜分で対象試合が分かれるため、1回あたりの試合数はさらに少ない。週2回・1試合あたり通常のプレビュー生成と同等のコストで、既存の生成コストパターンの再利用のため新規コストパターンではない。Owner承認のもと、毎週自動実行する（既存の`orchestrate`と同様、個別実行の都度承認は不要）

## 受け入れ条件

1. `.github/workflows/cron-weekend-preview-refresh.yml`に、木曜21:00 JST・金曜21:00 JST（いずれも12:00 UTC台）の2つのscheduleトリガーが設定されている
2. 木曜トリガーの実行時は、直近の金曜・土曜キックオフの試合が対象になる。金曜トリガーの実行時は、直近の日曜キックオフの試合が対象になる（トリガーごとに対象期間の`from`/`to`が異なる）
3. `workflow_dispatch`での手動実行にも対応している（`cron-ingest-league-one-lineups.yml`と同様、動作確認・不具合時の再実行のため。手動実行時は対象期間を入力パラメータで指定できる）
4. `/api/v1/calendar`から取得した試合のうち、`status: "scheduled"`かつキックオフが対象期間内のものだけが対象になる（既に終了・中止の試合は対象外）
5. 各対象試合について`fetch-sourced-facts`（`force=true`）→`generate-content`の順で呼ばれる
6. いずれかの試合でAPI呼び出しが失敗しても、他の試合の処理は継続する（1試合の失敗でworkflow全体が止まらない）
7. workflow の実行ログに、どちらのトリガーで実行されたか・対象試合数・成功数・失敗数が分かる形で出力される
8. 本番投入はOwner承認後に別途行う（`CRON_SECRET`・`PRODUCTION_URL`のGitHub Secretsは既存のものを再利用）

## 未解決の質問

- 木曜・金曜21:00 JSTの通常`orchestrate`実行と本workflowが同時刻帯に重なる場合の実行順序をどう保証するか（cron時刻を数分ずらす簡易対応で十分か、それとも明示的な依存関係が必要か）は、実装時にOwnerと確認する
- 金/土開催の試合自体（木曜パスの対象そのものが金曜開催の場合）は、金曜開催分のメンバー発表が木曜夕方に間に合わない可能性がある。完全な解決は難しいため、本specでは「多くの土曜開催に間に合わせる」ことを主目的とし、金曜開催分の取りこぼしは許容する
