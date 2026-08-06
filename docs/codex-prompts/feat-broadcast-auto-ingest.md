`specs/feat-broadcast-auto-ingest.md` の仕様を実装してください。

**着手前に必ず読むこと**: 先行 spec `specs/feat-match-broadcasts.md`。テーブル定義・手動投入 CLI・表示側は実装済みで、本 spec はそこに自動取得を足すもの。既存部分を作り直さないこと。

**取得元は JRFU の試合ページに変更済み（2026-08-06 改訂）**:

初版は放送局の番組表（J SPORTS / WOWOW）を取得元にしていたが、実地確認の結果 JRFU の試合ページのほうが単純かつ情報が多いため差し替えた。前回の調査で「JS 描画で取れない」と報告された番組表方式は、そもそも採用しない。

確認済みの事実:

- `https://www.rugby-japan.jp/schedule/` の生 HTML から `/match/{id}` のリンクが列挙できる（実測で2026年の日本代表11試合が全て取れ、DB の日本戦11件と1対1で一致）
- `https://www.rugby-japan.jp/match/29968` の生 HTML（45KB、サーバーレンダリング）に `div.broadcast` があり、その中のアンカーから**サービス名（アンカーテキスト）と URL（href）が対で取れる**。8/8 の実測では BS日テレ / J SPORTS 1 / Hulu / J SPORTSオンデマンドの4件
- 同ページの `div.gameInfo > span.dates` に `08.08 Sat` 形式の日付がある（年は含まない）
- `rugby-japan.jp` の robots.txt は 404（不在）で制限なし

放送開始時刻は取得しない。放送はキックオフ時刻に始まり、既存スキーマに時刻カラムもない。

コンテキスト:
- プロジェクト規約は `AGENTS.md` を読む
- 過去の判断は `docs/decisions.md` を読む
- 参考にする既存パターン:
  - cron ルートの形: `app/api/cron/audit-data-integrity/route.ts`（`assertCronAuthorized` の使い方、runtime/maxDuration、エラー時の 401 返却）
  - cron ワークフローの形: `.github/workflows/cron-audit-data-integrity.yml`（認可ヘッダの渡し方、`workflow_dispatch` の併記）
  - Discord 通知の形: `lib/llm/notify.ts` の `notifyDataIntegrityReport`（番号付き箇条書きのメッセージ組み立て）
  - スクレイパーの作法: `lib/scrapers/fetcher.ts`（robots 判定 `isAllowed`・リトライ・レート制限が入っている。**必ずこれ経由で取得し、fetch を直接呼ばない**）
- 既存テーブル `match_broadcasts` には `unique (match_id, service_name)` があり、冪等性はこの制約に依存する。マイグレーションは不要
- 書き込みは service role（`lib/db/server.ts` の `getSupabaseServerClient`）。anon クライアント（`lib/db/public-server.ts`）を使わないこと

エッジケース:
- `span.dates` に年が含まれない。一覧ページから年を判断できるか確認し、できない場合はキックオフが現在時刻の前後1年以内の試合に限定して突き合わせる
- 突き合わせの該当が0件または2件以上になったら upsert せず `unlinkedPages` に理由付きで入れる
- `div.broadcast` が存在しない試合ページ（放送未定）がありうる。エラーにせずスキップして続行する
- アンカーテキストに前後の空白や全角スペースが混じる可能性がある。トリムはするが、**文字列の中身は改変しない**
- JRFU 側の取得に失敗しても例外で全体を落とさず、その試合ぶんをスキップして続行する
- 14日以内にキックオフする試合が0件のとき（オフシーズン）、Discord 通知が空リストで正常に送られる

やらないこと:
- **LLM の呼び出し（このパイプラインに LLM を一切登場させない）**。サービス名の言い換え・要約・欠損の補完、すべて禁止。誤った視聴情報は捏造 recap と同種の信頼毀損として扱う
- **`kind` を文字列から推測すること**。spec の対応表に完全一致するサービス名のみ upsert し、表にないものは `unknownServices` に入れてスキップする。「オンデマンド」「配信」等の部分一致で判定するヒューリスティックを入れない
- 放送局の番組表（J SPORTS / WOWOW）からの取得
- 非日本戦の放送情報の取得
- `match_broadcasts` のスキーマ変更・マイグレーション追加
- `matches.external_ids` への JRFU 試合 ID の保存
- 既存 `tools/upsert-match-broadcasts.ts` の削除・変更
- 表示側（試合詳細・チームページ・モバイル）の変更。データが入れば既存の描画が動く
- 過去試合への遡及投入

テスト:
- パーサのフィクスチャは**実際に取得したページの構造から起こす**。手作りの理想的な HTML を書かないこと（過去に手作りフィクスチャが実データで壊れた事例がある）
- 突き合わせの2条件それぞれが欠けたときに紐付かないことをテストする
- 該当が2件以上のときに紐付かないことをテストする
- 対応表にないサービス名が upsert されないことをテストする
- 同一入力の2回取り込みで行数が増えないことをテストする

完了の定義:
- spec の受け入れ条件1〜13をすべて満たす
- `pnpm lint` / `pnpm tsc --noEmit` / `pnpm test` / `pnpm build` clean
- 変更ファイル一覧を報告する

完了時:
- 実装内容を要約する
- 実データで1回試走した結果（紐付いた件数・`unknownServices`・`unlinkedPages`）を報告する。**DB への書き込みを伴う試走は行わず、dry-run で件数だけ出すこと**
- 曖昧な箇所や仕様書と実環境の食い違いがあれば、その場で実装を停止して質問する
