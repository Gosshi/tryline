# 2026-09-10 再レビュー

**判定: 前回から改善しているが、完了にはできない。P1が1件、P2が5件残る。**

比較基準は9/8レビューの `682a98b`、現在は `ce9687e`。#789〜#795と文書改訂の差分を確認した。変更されたアプリ実装は35ファイル。作業ツリーに元からあった拒否伝播spec/promptの変更と未追跡のデザインバッチ文書も参照したが、変更・コミットはしていない。本レビューで追加したのは、このディレクトリの報告・検証資料だけ。

これは9/8以降の修正に対する再レビューであり、9/5の全サイト・全領域を新しい実測で監査し直したものではない。本番DB、公開記事本文の修復状況、GA4/BWT/GSCの最新値は未確認。

## 今回の指摘

### N1 — P1: JRFUで拒否の後に取得エラーが起きると、拒否情報が消えてrunが成功する

対象: [JRFUのループ](../../../lib/ingestion/jrfu-match-event-fallback.ts#L214)、[上位のcatch](../../../lib/ingestion/live-competitions.ts#L174)。

JRFU補完は拒否をローカル配列に追加して続行する。しかし次の試合の `fetchJrfuMatchEvents` やDB呼び出しがthrowすると、配列をreturnする前に関数を抜ける。上位のcatchは、既存live sourceの結果だけを返すため、先に起きたJRFUの拒否が消える。

**再現:** 1試合目のupsertが `fixture_conflict` を返し、2試合目のページ取得が失敗する合成fixtureで、実際の `POST /api/cron/ingest-live-competitions` は **HTTP 200 / `status: "ok"` / rejectionsなし**。upsertは1回、ページ取得は2回呼ばれ、JRFUの結果自体がレスポンスから消えた。DB・取得・他live sourceをモックし、JRFU補完本体→集約本体→routeを実行した。

前回R1の単独拒否は直ったが、拒否と一時障害が同じrunに混在する場合は未解消。ガードの書き込み拒否自体は効く。既存の拒否通知まで消えると主張するものではなく、runの成功判定が誤る問題である。

修正方向: 試合ごとのネットワーク・パース・DB例外を処理しても、既に集約した拒否を最外まで保持する。ネットワーク失敗だけのrunは成功のまま、拒否が1件でもあれば500にするという現行仕様を維持する。**拒否→次の取得失敗→最終500**の回帰テストが必要。

証拠: [jrfu-rejection-observation.test.ts](./jrfu-rejection-observation.test.ts)。

### N2 — P2: 部分的な2テーブルの一致で「網羅」と判定し、日程に実在するチームを捨てる

対象: [loadActualTeamIds](../../../tools/audit-competition-guide-facts.ts#L434)。

順位表と `competition_teams` の非空集合が一致すると `coverage: "complete"` を返す。その分岐では、既に取得したmatchesのチームを使わない。

**再現:** 同じcompetitionについて、順位表={A}、参加チーム登録={A}、日程={A対B}、ガイド本文={AとB}を与えると、結果は **complete / actualDataTeams={A} / Bがguide-only候補**。Bの存在をDBから読み取っているのに無視している。

`competition_teams` が常に独立した完全名簿であるという保証もない。[Top 14 importer](../../../scripts/import-top-14-results.ts#L181)は取得済み試合からteamLookupを作り、同じ集合を参加チーム表へ保存する。テーブルが別であることだけでは完全性の独立した証拠にならない。

修正方向: 少なくとも日程に別チームが存在すればcompleteにしない。照合集合には観測済みの全チームを保持する。完全性を確認した名簿・期待数などの根拠がなければincompleteとする。本文修復の前に、このツールの候補を誤りと即断しない。

証拠: [coverage-observation.test.ts](./coverage-observation.test.ts)。前回R4は、複数competitionの例は解消したが、単一competitionの部分取得では未解消。

### N3 — P2: 記事のpaywall_viewが「境界への到達」を計測していない

対象: [PaywallViewTracker](../../../components/paywall-view-tracker.tsx#L26)、[記事側の設置](../../../components/match-content.tsx#L401)。

認証状態の確定後、effectから即座にイベントを送る。境界のviewport内への進入を確認する処理がないため、記事の上部だけを見て離脱した読者も露出の分母に入る。今回追加されたcontent_type / viewer_type / is_sample / match_id / paywall_locationの軸は有用だが、それだけでは仕様の「有料境界に到達した人数」を測れない。

合成DOMの `hidden` な親に置いても1回送信された。またStrictModeのeffect再実行では2回送信された。後者は開発時の再実行条件の証拠であり、本番で常に2倍になるという意味ではない。jsdomの結果を実ブラウザのレイアウト計測としては扱っていない。

修正方向: 記事の既存CTA要素を参照して可視化時に一度だけ送る。Observer等の処理と、同一対象の送信済み状態が必要。仕様の「非表示コンポーネントはnullを返す」「見た目を変えない」は、既存要素の監視と両立する。チャットの既存mount計測を維持する場合は、記事到達とは測定条件が異なることを明記する。

証拠: [paywall-observation.test.tsx](./paywall-observation.test.tsx)。既存の `match-content-paywall-view.test.tsx` はrender直後の発火を期待しており、スクロール前の未発火を検査していない。

### N4 — P2: スクリプトが最初の拒否で終了し、残りの試合を処理しない

対象: [fill-event-gapsのcatch](../../../scripts/fill-event-gaps.ts#L451)、同様のcatchがあるTop 14/Premiership/URC backfill、World Rugby detail import。

型付きの `EventInsertionRejectedError` を再throwするため、**exit 1へ届く点は改善済み**。ただし `fix-event-insertion-rejection-propagation` の「拒否は集約して最後に非ゼロ終了する」という契約に対して、実装は最初の1件で終了する。

**再現:** `[拒否する試合, 正常な試合]` の2件を実際のfill-event-gapsのmainへ渡すと、exit 1は呼ばれるがupsertは1回だけで、2件目は一度も処理されない。拒否が繰り返し先頭に現れると、未処理の試合を残したまま同じ場所で止まる。

修正方向: 拒否情報をmatch_idとともに集約し、残りを処理してから失敗終了する。ネットワーク・パース失敗は現行どおり区別する。2件以上のfixtureで「拒否後の正常試合にも到達する」と「最後はexit 1」をセットで検証する。

証拠: [script-continuation-observation.test.ts](./script-continuation-observation.test.ts)。他の4スクリプトの同じ早期throwはコードで確認した。

### N5 — P2: R1/R2の重要な回帰テストが通常CIで実行されない

対象: [Vitestのinclude](../../../vitest.config.ts#L32)、[キャッシュ復旧テスト](../gpt6-spec-review-followup-2026-09-08/cache-observation.test.ts)、[fill-event-gaps拒否テスト](../gpt6-spec-review-followup-2026-09-08/cron-observation.test.ts)。

修正後の期待値へ更新された2本は `docs/audits/` に残っている。既定includeは `tests/**/*.test.ts` / `tests/**/*.test.tsx` だけで、[CI](../../../.github/workflows/ci.yml#L45)は `pnpm test` を実行する。既存の `tests/ingestion/event-ingestion-validation-cache.test.ts` は成功キャッシュの再利用だけ、`tests/api/fill-event-gaps.test.ts` は空結果とmatchIds指定だけで、この2つの回帰条件を代替しない。

既定のinclude/excludeを維持し `.env` 読み込みだけ無効にした [discovery設定](./default-discovery.config.ts) で、2ファイルを指定した `vitest list` はテスト0件。一方、今回の監査用includeで明示実行すると両方通過する。

修正方向: この2本を通常の `tests/api/` / `tests/ingestion/` の非除外ファイルへ移すか、対応する既存ファイルへ統合する。過去監査の不正挙動を期待する観測テストまで含まれるため、`docs/audits/**` 全体を通常CIへ追加してはいけない。

### N6 — P2: R6の文書整合は一部残存している

改訂済みの判断を否定する指摘ではない。次回の実装者が読む本文・例・ACに、訂正と衝突する旧指示が残る。

| 対象 | 残存箇所 | 必要な整理 |
|---|---|---|
| 入口同一性spec | [本文90行](../../../specs/fix-event-ingestion-identity-guard.md#L90)は4条件すべて拒否、111行のrejected型にもduplicate_signatureが残る。一方AC5は警告のみ | 本文の表・返却型もwarningsへ統一する |
| 表示隔離spec | [UI節51行](../../../specs/fix-contaminated-events-display-isolation.md#L51)は4箇所のprops変更を要求、[AC8](../../../specs/fix-contaminated-events-display-isolation.md#L100)は4箇所に差分なし | AC8を必要なpropsが4箇所で渡る検証へ置換する。promptだけの取り消しでは足りない |
| ガイド検証spec/prompt | [specの訂正文](../../../specs/fix-competition-guide-participant-verification.md#L37)はenglish_nameを指定するが、その下の例と[prompt25行](../../../docs/codex-prompts/fix-competition-guide-participant-verification.md#L25)はname_en | 例とpromptをname/name_ja/english_name、competition_standingsへ同期する |

前回のname_ja不存在という監査側の誤りは引き続き撤回する。現コードの照合列は正しい。料金確認待ち・health生成監視の先行実装指示・Stripeの順序と冪等性の混同・CSV列名の判断は改訂されており、再起票しない。

## 前回R1〜R6の判定

| 前回 | 今回の確認 | 判定 |
|---|---|---|
| R1 拒否の成功扱い | 単独拒否の500、成功カウンタ除外、live sourceからの伝播、5スクリプトの型付き例外とexit 1を確認 | 部分解消。N1/N4/N5 |
| R2 rejectしたキャッシュの保持 | 読み込み失敗時に同じPromiseだけ破棄。復旧後に再取得・成功、成功時は再利用 | 実装上解消。CI登録にN5 |
| R3 匿名イベントのconfirmed | 無名を署名対象外にし、交代はin/out両名を使う。匿名反例、既存の帰属反転、交代のテスト通過 | 今回の対象は解消 |
| R4 部分順位表のcomplete | competitionごとの集合と日程・参加登録の和集合へ改善 | 部分解消。N2 |
| R5 Stripe不正userIdの転記 | UUID検証がDB前に実行され、不正値は通知へ渡らない。DB失敗の500、欠落metadata、未対応eventも維持 | 今回の対象は解消 |
| R6 仕様とpromptの衝突 | 課金・health・CSV・V4キャッシュの説明は改善 | 一部残存。N6 |

成功キャッシュのV3/V4鮮度、対称スコアの帰属反転、delete→insertの原子性、Stripeイベント順序・ゼロ行update、生成能力監視の定義は既知の別スコープ。今回修正されなかったことだけを理由に、新しい不具合として数えていない。

## デザインの再評価

`frontend-design` の既存デザイン・レスポンシブ確認の観点を使い、現行CSSとページ構造、D018/D020、9/8追補を照合した。**Block Intent節の前回4指摘は文書上解消**。ブロック分類、最初の完結したデータ単位、新規/再設計への限定、主要タスクの優先順が明記されている。未測定の共通px上限を追加していない点も妥当。

| 面 | 現行コードで確認できたこと | 残る確認 |
|---|---|---|
| 商品名・チャット | MATCH Q&A、位置別の日本語名詞形/見出し、AI生成・根拠範囲・限界の開示が追加。pricingの両description分岐に価格、trialありには無料期間が残る | 実画面の折返し・狭幅・読みやすさは未確認 |
| 記事の有料境界 | 表示面と利用者区分の軸は追加され、読み込み中/Premiumでは発火しないテストが通過 | 到達計測にはN3。転換率の改善とは扱わない |
| ホーム | [hero](../../../app/page.tsx#L258)はpy-16 / sm:py-24、lgでコピーとboardを並列にする構造。9/8以降、ホームとboardに差分なし | 導入量と最初のカードへの距離は改善確認に至らない。9/5の900pxを現在値に流用しない |
| カレンダー | ページとWeekScheduleに差分なし。newsletterは日程の後を維持 | 見出し・週操作・大会リンク群から最初のカードまでを再測定する必要がある。古い591pxは現在値ではない |
| 試合詳細 | 商品名と計測配線が主な変更。記事と記録の密度分離・ページ内移動の再設計はこの差分にはない | 全体compact化は求めない。狭幅・デスクトップそれぞれの主要タスクで評価する |
| Top 14の表示元 | 時刻のない結果を捨てず、既存kickoffを保持し、新規で時刻不明ならスキップ。複数日・7試合・診断・他ソースの関連テスト通過 | 本番7試合の反映と時刻保持は未確認。取得fixtureが最新公開ページと一致するかも再取得していない |

デザインバッチ9項目は、#9商品名がコード上完了、#1計測はN3で部分完了。残る7項目はspec/promptが存在するが、このHEADに実装差分はない。newsletter結果、開催なし/未取得、会場脚注、読了時間、姓名空白、bracket、動画公開日を「修正済み」とは扱わない。個々の未実装spec全文の新規設計レビューは今回の範囲外。

進捗台帳には更新漏れがある。**動画公開日はOwner確認済みの2026-05-18**とspecにあり、入力待ちではない。#794/#795が入った状態に対して、旧表の「未作成」や「10箇所」を使い続けると再作業になる。台帳はOwner側の未追跡ファイルなので、このレビューでは変更していない。

スキル・エージェントは9/8以降のgit差分なし。前回の30スキル・3エージェントの改稿反映を覆す変更は見つからない。集客・記事品質・収益について、最新の利用実績を得ずに改善度や新しい数値を作ってはいない。

## 検証

- 既存関連テストと修正済みの旧監査回帰テスト: **27ファイル、125件通過、2件除外**。全スイートではない。
- 今回の観測テスト: **4ファイル、5件通過**。N1/N2/N3/N4の現在の問題を再現できたという意味。修正時の期待値は正常動作に変える必要がある。
- 変更されたアプリ実装35ファイルのESLint: **エラー・警告0**。監査用の追加TS/TSXもESLint通過。
- 通常CIのdiscovery条件でR1/R2の2回帰ファイルを指定: **0件**。監査用includeでは両方通過。
- envDir=falseの専用設定を使用し、実際のfetchを拒否するsetupを追加。DB・取得・Stripe・通知等はモック。機密ファイル読込み・本番書込み・LLM API呼び出しは行っていない。
- 除外2件は、既存recap監査テストの一時ディレクトリへのCSV書出し/衝突一覧ファイル出力。今回は判定ロジックに絞り、リポジトリ外の出力を伴うケースを実行しなかった。
- 全体のtypecheck/buildは未実行。今回はレビューで実装コードを変更しておらず、標準buildが読む.envや標準tsconfigが含むgitignore対象の生成物を使用しなかった。ビルド成功や本番表示成功は主張しない。

設定と再実行コマンド: [validation.md](./validation.md)。

**本番の実画面確認は未実施。** ブラウザで公開ホームを開く操作がセキュリティ審査で拒否され、「このサイトへのアクセス許可が拒否されている」と返された。別ブラウザ・外部fetch等による回避はしていない。この制約により、今回のデザイン判定はコードと文書に限定する。
