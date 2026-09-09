# 2026-09-08 再レビュー

前回の11仕様・対応指示書・スキル更新と、その後の実装を再確認した。コード基準は `682a98b`。前回レポートのコード基準 `53cacee` から比較し、着手時の作業ツリーは clean だった。

**主要な防御は実装されたが、指摘6件が残る。P1が1件、P2が5件。** うち5件は合成データとモックで現在の問題を再現した。アプリコード・仕様書・有効なスキルは変更していない。本レポートと再現用の検証資料だけを追加した。

前回指摘の訂正: **`teams.name_ja` は存在する。** 前回の私の「存在しない列」という指摘と置換案は誤りだった。`git show 53cacee:lib/db/types.ts` にも定義がある。現在の正しい名称列は `name` / `name_ja` / `english_name` で、`name_en` はない。誤った提案が仕様に反映された部分も、下記R6で訂正する。

## 残る指摘

### R1 — P1: ガードで拒否しても、呼び出し元が成功を返す

対象: [fill-event-gaps route](../../../app/api/cron/fill-event-gaps/route.ts#L162)、[League One route](../../../app/api/cron/fill-league-one-playoff-events/route.ts#L287)、[live-ingest](../../../lib/ingestion/live-ingest.ts#L441)、[fill-event-gaps script](../../../scripts/fill-event-gaps.ts#L450)。

共通入口は `{ inserted: 0, rejected: [...] }` を返す契約になったが、cronのfill-event-gapsは戻り値を捨て、無条件で `filled += 1` とする。合成した `score_mismatch` 拒否1件に対し、実際のrouteは **HTTP 200 / `{ errors: [], filled: 1, gaps: 1 }`** を返した。League Oneも拒否を見ず `processed` を増やし、live-ingestも `inserted` しか見ない。新しいJRFU補完経路も `inserted` だけを読む。

さらに、スクリプトへ `assertEventInsertionAccepted` を追加しただけでは不十分。`scripts/fill-event-gaps.ts:450`、`backfill-top14-match-events.ts:334`、`backfill-premiership-match-events.ts:273` は、投げた例外をループ内で警告に変えて終了するため、最外の `main().catch(...exit(1))` に届かない。

書き込みの拒否そのものは効いている。問題は「補完済み」という偽の成功記録と、失敗を処理する運用への伝播漏れである。仕様#1の「拒否時はrun失敗」およびAC8を満たさない。**関数の単体テストだけで全経路対応完了と判定できない。**

修正方向: 全呼び出し元で `rejected` を評価し、成功数へ加算しない。試合ごとの続行を残すなら失敗を集約し、最後にscriptは非ゼロ、cronは失敗と分かる応答を返す。JRFUを含む呼び出し一覧を更新し、返却値だけでなく外側のcatchまで検証する。

再現: [cron-observation.test.ts](./cron-observation.test.ts)。必要な回帰条件は「拒否1件→filled=0・対象ID/理由あり・run失敗」。

### R2 — P2: 検証用キャッシュが、一時的なDB障害をプロセス寿命まで保持する

対象: [events.ts:58](../../../lib/ingestion/events.ts#L58)。

`eventInsertionValidationSnapshot ??= Promise.all(...)` はrejectしたPromiseも保持する。DBが復旧しても、同じプロセスの次回取り込みはDBへ再取得せず、同じ過去のエラーを投げる。モックで初回だけ失敗し、その後は成功するDBを用意しても、2回目は失敗し、全件取得は1回しか呼ばれなかった。

これは仕様末尾に記録済みの「成功スナップショットが古くなる」という限界とは別。**一時障害後に再試行して復旧する経路自体がない。** warmなcronインスタンスや複数試合を扱うscriptで、他の試合の取り込みも止まる。

修正方向: 読み込みがrejectした場合はキャッシュを破棄し、現在の呼び出しにはエラーを伝える。次回呼び出しは再取得する。成功キャッシュの寿命・更新は別途、既知のV3/V4鮮度問題として仕様を決める。

再現: [cache-observation.test.ts](./cache-observation.test.ts)。回帰条件は「1回目は拒否・書き込みなし、DB復旧後の2回目は再取得して通常判定」。

### R3 — P2: 人名欠損のイベント列から、帰属反転をconfirmedにできてしまう

対象: [監査ツールの署名](../../../tools/audit-published-recap-event-integrity.ts#L198)、[severity判定](../../../tools/audit-published-recap-event-integrity.ts#L764)。

人名がないイベントは全て空文字で署名化される。同一の分・種別が4件並び、両チームの帰属が逆なら、無関係に作った匿名イベントでもC3/C4が成立する。片方が得点不足ならC1も立ち、**`confirmed` に昇格する**。4件の匿名tryを使った合成fixtureで再現した。

C1が示す得点不足は、他試合からのコピーの証拠にはならない。正常なdonorまでconfirmedにする前回の対称分類は直っているが、欠損名を同一人物とみなす入口が残る。短署名に4件閾値を置くだけでは防げない。

修正方向: 名前欠損を別状態として扱い、識別根拠のない組をC3/C4の確定材料にしない。C1は独立してsuspectとして残す。交代は `player_in_name` / `player_out_name` に保存されるため、その型の署名契約も明記する。

共通入口側にも注意: `event-integrity.ts` の `__missing_name_0` 等は試合ごとに同じ番号へ戻り、欠損名を試合間で区別できない。ただしこちらのV3は仕様どおり警告のみであり、自動拒否の問題としては扱わない。

再現: [audit-observation.test.ts](./audit-observation.test.ts) の匿名イベント例。回帰条件は「匿名の一致だけではC4/confirmedにしない」。

### R4 — P2: 順位表が1行あれば、参加チームの取得範囲をcompleteと報告する

対象: [audit-competition-guide-facts.ts:378](../../../tools/audit-competition-guide-facts.ts#L378)。

同じfamily/seasonに複数competitionがある場合でも、どれか1つに順位表が1行あるだけで `coverage: "complete"` を返し、他competitionの日程を読まない。2つのcompetitionのうち一方に1チームだけ登録したfixtureで、1チームの集合をcompleteとし、もう一方の名前をguide-only候補として報告することを再現した。

単一competitionでも、部分取り込みの順位表1行から全参加チームの網羅性は証明できない。候補であり誤りと断定しない注記は改善だが、Ownerがその候補を評価するためのcoverageが誤っている。仕様#7末尾の不完全取得時の契約を満たさない。

修正方向: competitionごとに取得状況を扱い、独立した期待チーム数などで完全性を確認できない場合はincompleteとする。順位表と日程の採用・統合ルールを明記し、部分順位表の反例をテストする。入力集合が非空であることを完全性の判定基準にしない。

再現: [audit-observation.test.ts](./audit-observation.test.ts) の部分順位表例。

### R5 — P2: StripeのuserIdをUUID検証せずログ・通知へ出す

対象: [webhookのmetadata読出し](../../../app/api/stripe/webhook/route.ts#L102)、[DB失敗の通知](../../../app/api/stripe/webhook/route.ts#L141)、[通知本文](../../../lib/llm/notify.ts#L413)。

対応event.typeの先行判定と、DB error時の500は直っている。一方、`subscription.metadata.userId` は非空かだけを見て、そのままDBと通知へ渡す。誤設定された値がメールアドレス等なら、UUID列へのDB書き込み失敗をきっかけにその値をログ・Discord本文へ転記する。

署名が正しいことはmetadataの形式が正しいことを保証しない。合成した `synthetic-user@example.invalid` とDBの `22P02` を用い、通知関数にその文字列がそのまま渡ることを再現した。実際の個人情報やStripeへの接続は使っていない。

仕様#8は「検証済みuserId」と「メールを出さない」を要求している。修正方向: UUIDとして検証し、異常な値は通知に含めず、安全な分類とevent.id/typeだけを残す。欠落・不正metadataの扱いとOwnerの復旧手順を揃える。既存テストの正常userIdも、UUIDの合成値へ変更する必要がある。

再現: [stripe-observation.test.ts](./stripe-observation.test.ts)。

### R6 — P2: 改訂を追記した一方、旧指示が有効なまま残っている

次に同じ文書をCodexへ渡すと、仕様との矛盾による停止、不要な再確認、旧実装の復活につながる。単に「末尾に訂正がある」とせず、実行指示とACを一意にする必要がある。

| 対象 | 残っている衝突 | 置換・整理案 |
|---|---|---|
| #1 入口 | [AC5](../../../specs/fix-event-ingestion-identity-guard.md#L132)はV3拒否、9/6確定追記は警告のみ。promptは独立2経路を対象外にもできるが、改訂specは共通化必須 | V3の表・戻り値・ACを「警告して続行」に統一。独立2経路は共通化済みの契約へ置換する |
| #1 キャッシュ | spec末尾に「V1/V2/V4はcanonicalを毎回読むため影響なし」と「V3/V4が古くなる」が併存 | V4の比較先fixture一覧はキャッシュ。対象試合だけ再読しても比較先は新鮮にならない、と訂正する |
| #3 表示 | [prompt:18](../../../docs/codex-prompts/fix-contaminated-events-display-isolation.md#L18)とspec AC8は親ページ変更禁止、prompt:30とUI節は4箇所のprops変更を要求 | 旧禁止文を削除し、AC8を「4箇所全てがstatus/awayTeamId/nullable scoreを渡す」に置換する |
| #7 ガイド | 仕様の修正段落は `name_ja` を不存在とし、古いスキーマ例とpromptは `name_en` を要求する | 私の前回の誤指摘を取り消し、「teamsはid/slug/name/name_ja/english_nameを読む。name_enは使用しない」と統一する。`standings` の表記も `competition_standings` へ揃える |
| #8 決済 | prompt末尾の「upsertは既に冪等で、再送で壊れません」が残る | 「同一内容の再適用とイベント順序逆転は別。今回はerror伝播、順序制御は対象外」と置換する |
| #9 料金 | [prompt:5–7](../../../docs/codex-prompts/fix-billing-terms-consistency.md#L5)がProduct/Price確認待ちで停止を要求。specは9/6の本番Checkout確認済み | 「Ownerが9/6に本番Checkoutの7日を確認済み。再確認不要。共通定義へ集約し現行条件を維持」と置換する |
| #10 health | [prompt:33](../../../docs/codex-prompts/fix-health-endpoint-status-and-llm-monitoring.md#L33)が最終success+48時間で生成能力を判定するよう要求。specは定義未確定でstatus集約のみ先行可 | 完了済みstatus集約と未着手generation監視を分ける。stage1 successを生成成功とする実装は指示しない |

追加の表記整理: #4はDB参照を `kickoff_at/generated_at` に修正したが、CSV契約に `kickoff_utc/recap_updated_at` が残り、実装も後者を出力する。値自体は正しい列から取得しているのでSQL不具合ではない。CSVの既存列名を維持するか改名するかを決め、仕様の両節を揃える。

## 11仕様の再判定

「コード上解消」は本番データ修復やOwner目視の完了を意味しない。古い背景説明は歴史的記録として残してよいが、AC・実行指示の衝突は上記R6の対象とする。

| # / 仕様 | 前回から解消した内容 | 現在の残件・判定 |
|---|---|---|
| 1 取り込み同一性 | 純関数集約、正規DBとのチーム照合、得点過不足の拒否、許可fixtureキー、独立World Rugby/League One実装の共通化、V3警告化 | **修正必要**。R1/R2/R6。12旧経路だけでなく追加JRFU経路も返却値伝播を点検する |
| 2 生成ゲート | 空配列化前のeventIntegrityを保持。mismatchはstage0 failedと通知の後、LLM前にskipped。入力events/timeline/derived_statsを除去 | 主要指摘はコード上解消。`PipelineResult`のskippedに理由がなく、呼び出し側の理由別集計は残る。assemble全体のAC6はコード読解で確認、今回の単体テストは主に判定関数 |
| 3 表示隔離 | status/awayTeamId/null scoreを渡す。第三チームと得点不一致を隠す。APIもevents=[]。注記はhighlights側1箇所 | コード上解消、**文書整合R6**。Ownerの320/768/1440px目視は今回未実施 |
| 4 recap監査 | 正しいDB列、全イベント保有試合との比較、ページ取得、純関数再利用、C4単独はsuspect、言語別記事情報 | **修正必要R3**。offset取得に安定したorderがなく、並行更新下で厳密な全件スナップショットは保証しない。本番全件監査は今回未実施 |
| 5 RWC2027 | 大会52と収録Nの分離、公式開催期間の定数、N=0/36/52、ページ側放送断定の除去 | コード上解消。family guide本文の訂正はOwner作業という分担が明記された。本番guideの現在値は未確認 |
| 6 シーズンFAQ | 詳細broadcast queryから確認日を取得。「一部試合」と範囲を限定し、同じanswerを可視表示/JSON-LDへ利用 | 主要指摘はコード上解消。放送根拠のsourceUrlは取得するが集約表示で落とすため、出典をたどる点は改善余地。データの正しさ自体は今回未確認 |
| 7 ガイド監査 | family/season引数、実在テーブル、歴史的言及と候補の区別、JSON/CSV、読み取り専用 | **修正必要R4/R6**。NC本文の実際の訂正は別のOwner作業 |
| 8 Stripe | DB errorを500へ、未対応eventをmetadata検査前に200、欠落userIdの通知、生DBエラーの転記回避 | **修正必要R5/R6**。RevenueCatは既存のerror throwを確認。順序逆転・ゼロ行update・欠落metadataからの復旧は明記済みの対象外 |
| 9 料金 | 共通BILLING_TERMS、pricing/metadata/FAQ/CTAと特商法の同期、Checkoutのtrial日数共有 | コード上解消、**prompt更新R6**。termsに同期対象の具体的課金条件は見つからない。Ownerの9/6確認を再要求しない |
| 10 health | supabase障害はstatus=error/503、OpenAI障害はdegraded/200 | **先行分のみ完了**。generation未実装は仕様の許容範囲で、無断の欠落とは扱わない。監視全体は未完了。R6のprompt整理が必要 |
| 11 H2H | finished最新へ統一、scheduledかつ有効な未来日時の最短を次回へ、重複Metric除去、CTA計測を維持 | コード上の主要指摘は解消。0件や不正日時等の関連テスト通過。Owner目視は今回未実施 |

前回の10観点も再照合した。ACとテスト実行は上表・検証結果へ対応づけ、未解決事項とスコープは既知の残件として分離した。関数/export/DB列は現コードで確認し、特に前回の列名誤りを訂正した。仕様間の依存は共通純関数・fixtureキー方針・通知・本文開示の後続実装を確認した。match_id単位キャッシュや得点の正規換算を弱める変更は今回提案していない。新しいLLM費用は発生させず、入力整合・エラー伝播の境界を合成fixtureで確認した。UIはDOM/コンポーネントテストまでとし、実画面の目視を合格扱いしていない。

## スキル・エージェントの反映確認

**30スキル・3エージェントが前回のproposed文面とバイト単位で一致。相対リンク32件は全て解決した。** 旧26スキルのうちweekly-opsをtodayへ統合して削除し、5スキルを追加したため、現在は30本になる。前回の改稿案をもう一度生成する必要はない。

| 対象 | 再確認した要点 |
|---|---|
| today / 旧weekly-ops | 日次・週次の司令塔を統合、完了済み施策を再起票しない |
| growth-analysis / biz-strategy / funnel-audit | ユーザーとセッション、流入と訪問後行動、仮説と実測を分離 |
| x-post / x-reply / note-weekly | D017/D019、B型停止/C型保留、返信可視性によるリンク位置が統一 |
| rugby-news / discord-ops | D026のURL存在確認の限定例外とD027の収集停止を維持 |
| hub-audit / rwc2027 / content-plan | family/season、収録件数と大会総数、未確認放送を区別 |
| content-qa / content-regen / prod-investigation / incident-postmortem | 元データ整合、現在値と生成時点、公開版保持と品質合格を区別 |
| spec-writing / codex-handoff / codex-review / pr-merge / decision-log | specとpromptの整合、実行テストの証拠、PR作成とマージ権限の分離 |
| site-audit / image-gen | DOMとRSC、スクロールの意図、画像の権利・検品条件を維持 |
| backlink-outreach / competitor-watch | 未依頼の外部送信なし、比較値に根拠と取得日 |
| 新規production-data-integrity | 得点一致と真正性を分離、件数だけでなく対象と行動を要求 |
| 新規billing-monitor | 契約/請求/権限を区別、ゼロ行更新・順不同も監視対象 |
| 新規bing-webmaster-analysis | Bing実クエリをGSCで代用しない |
| 新規email-delivery-qa | API受付と受信を区別、解除token付きURLを監査で開かない |
| 新規performance-rum | RUM/CrUX/ラボと指標の母数・期間を区別 |
| tryline-site-auditor / tryline-spec-checker / tryline-web-researcher | 読取範囲、根拠、未検証の明示。権限記述だけを技術的sandboxとみなさない |

全33件のパス・hash・一致判定・リンク確認は [skill-validation.json](./skill-validation.json)。Claude Code環境の各MCPツールが実際に使えるか、各スキルを起動したときの行動までを検証したものではない。

追補提案は2点に限定する。共通参照にはD028/D029の決定日と関連仕様への導線を加えるとよい。特にD028の「手元fixtureへ検証条件を実適用」「git reset --soft禁止と隔離作業」、D029の「手動事実優先・上限8」を古い運用で上書きしないこと。ただし各スキルには最新decisionsを読む指示があり、9/5時点の要約がその後の決定を無効にする構造ではない。また、spec-writing/codex-handoffの現行手順を今回のR6にも適用し、追記と同時に矛盾した実行指示・ACを取り除く必要がある。

## 検証の証拠と限界

- 既存の関連テスト: **20ファイル・169件通過、2件は意図的に除外**。アプリの全テストスイートを実行したという意味ではない。
- 新規の観測テスト: **4ファイル・5件通過**。これは「不具合が起きない」テストではなく、R1〜R5の**現在の不正な結果を再現できた**という証拠。修正時には期待する正常動作へ書き換えて回帰テストにする。
- VitestのenvDirをこの監査用設定の専用パスへ変更し、リポジトリの.env読込みを回避した。DB・通知・取得・Stripe・LLMの必要な経路はモックを使用した。
- 2件の除外は既存監査ツールのCSV書出しとcollision出力上限テスト。これらはリポジトリ外の一時ディレクトリへ書き出すため、今回の作業範囲から除外した。以前のテスト結果を今回の実行証拠に混ぜていない。
- 実行時に既存pipelineテストのcache tagモック由来のwarningが出た。失敗ではないが、warningなしの実行とは記録しない。
- 追加検証コードのESLintを実行。アプリのfull lint/typecheck/buildはレビュー対象を変更していないため未実施。本番DB、実LLM、Discord送信、Stripe実通信、GA4再計測、ブラウザの本番目視は行っていない。

結果: [関連テスト・4再現のJSON](./test-results.json)、[最終5再現のJSON](./observation-results.json)、[Stripe再現のJSON](./stripe-test-results.json)。再実行条件は [検証コマンド](./validation-command.txt)、[専用Vitest設定](./vitest.config.ts)。比較した仕様・指摘対象コードのhashは [source-manifest.json](./source-manifest.json)。

## 対応順と、完了へ戻さない項目

まずR1の失敗伝播、次にR2の復旧不能キャッシュを直す。R3/R4は監査結果を本番修復の判断材料にする前に解消し、R5は通知の入力境界を直す。R6はClaude Codeが仕様・promptを同期する文書作業としてまとめて扱える。今回は修正コードや本番修復は実施していない。

前回の残課題のうち、共通通知はmatch_id/URL等を含む形へ改善され、公開記事の不整合注記も後続の `feat-published-content-integrity-disclosure` で追加されている。これらを未実装として再提案しない。ただし注記は本文訂正の証明ではなく、APIのevent_integrityもスコア等の現在データ判定である。

同点時の帰属反転、正常置換のdelete→insert非原子性、成功キャッシュのV3/V4鮮度、Stripe順序逆転/ゼロ行update、generation監視の定義、Ownerによる本文/ガイド修復と目視確認は引き続き残る。仕様に明記された対象外と、R1〜R5の契約を満たさない実装を混同しない。PR #756/#758/#757を含む完了済み施策を再実装する必要はない。
