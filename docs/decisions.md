# 意思決定記録

アーキテクチャ上の決定を記録します。追記のみ、書き換えません。各決定には日付、背景、決定内容、影響を記載します。

## D001 — Next.js 15（App Router）を採用（2026-05）

**背景**: プレビュー・レビューページの SEO のため SSR が必要。LLM 呼び出しの API ルートも必要。Owner は既習。

**決定**: Next.js 15 App Router + RSC。

**影響**: SEO 向けの SSR がシームレス。RSC の新しいパターンへの学習コストは受容する。

## D002 — Supabase を採用（セルフホスト postgres は不採用、2026-05）

**背景**: DB + auth + RLS を運用負担なく使いたい。Stripe 連携も上に載せる前提。

**決定**: Supabase で DB、auth、Edge Functions を担う。

**影響**: ベンダーロックインを受容。スキーママイグレーションは Supabase CLI 経由。RLS を主要なセキュリティ境界とする。

## D003 — コスト制御のため Haiku と Sonnet を使い分け（2026-05）

**背景**: コンテンツパイプラインは 5 段階あり、段階ごとに品質要求が異なる。Haiku は Sonnet の約 1/20 のコスト。

**決定**: Haiku を段階 1・2・3・5（抽出・QA）に、Sonnet を段階 4（ナラティブ生成）のみに使用。

**影響**: 日本語品質を 1 段階に集中させる。プレビューあたり LLM コストを $0.15 以下に抑制。Haiku の日本語品質を抽出タスクで検証する必要あり。

## D004 — 試合中心のデータモデル（2026-05）

**背景**: コンテンツを「ユーザー単位（パーソナライズドフィード）」か「試合単位（共有キャッシュ）」で構成するかの選択。

**決定**: Match を中心エンティティとし、試合ごとに 1 回生成して全ユーザーに配信。

**影響**: LLM コストが劇的に削減される。パーソナライズはフィルタと UI で実現し、コンテンツの再生成はしない。ユーザー固有コンテンツは AI チャットに限定。

## D005 — Freemium + ¥980/月 Premium の価格設定（2026-05）

**背景**: 日本のラグビーファンは既に DAZN（¥2,600〜4,200）や J SPORTS に支払っている。追加サブスクは同じ土俵で競合すべきでない。

**決定**: Freemium モデル。無料層は主要大会の基本コンテンツを提供。Premium ¥980/月 ですべての大会、完全版コンテンツ、無制限 AI チャット、Discord が解放される。

**影響**: サインアップのハードルが下がる。ファネルは無料ユーザーの 3〜5% の有料転換に依存。プラン間の価値差を明確にする必要あり。

## D006 — Rugby Championship 2026 を MVP ローンチ対象に（2026-05）

**背景**: ドッグフード対象の大会が必要。選択肢は RC（8〜10月）、日本代表サマー／オータムツアー（試合数少）、リーグワン後半戦（12〜3月）。

**決定**: Rugby Championship。12 試合、戦術レベルが高く、日本語コンテンツが薄い海外リーグ。

**影響**: 2026年 8 月初旬に MVP を間に合わせるハードデッドライン。最優先でスクレイパーを RC のデータソース（オールブラックス、ワラビーズ、スプリングボクス、プーマス）に対応させる。

## D007 — MVP ローンチ対象を Six Nations 2027 に変更（2026-04、D006 を supersede）

**背景**: 2026 年の Rugby Championship は World Rugby のカレンダー再編に伴い実施されない見通しであることが判明した。D006 の前提としていた大会が成立しないため、Phase 1 のドッグフード対象を見直す必要がある。

**決定**: MVP ローンチ対象を Six Nations 2027（2027年2〜3月）に変更する。6 チーム総当たり 15 試合で、短期間に十分な試合数を確保でき、日本語の分析コンテンツ需要も引き続き見込める。

**代替案と却下理由**:
- Nations Championship 2026: 構造・放映権が 2026-04 時点で未確定であり、MVP の前提としてリスクが大きい
- Autumn Nations Series 2026: Nations Championship への吸収可能性があり、2026 年の大会形態が未確定
- Japan League One: 「海外リーグ観戦」というプロダクト仮説から外れる

**影響**: `p1-match-ingestion.md` を Six Nations 2027 向けに改訂し、`competitions` シードの slug、対象チーム、試合数を変更する。Phase 1 の検証対象は England / France / Ireland / Scotland / Wales / Italy の 6 代表戦に移る。

**D006 との関係**: D006 は履歴として残すが、本決定で supersede する。以後の Phase 1 仕様書と Codex プロンプトは D007 を優先して参照する。

## D008 — LLM プロバイダを OpenAI に変更（2026-04、D003 を supersede）

**背景**: D003 は Anthropic Claude（Haiku / Sonnet）でパイプラインを組む前提だったが、Owner は OpenAI を採用する方針を選んだ。p0-foundation 実装時点で既に `lib/llm/client.ts` は OpenAI SDK で構築済みであり、`.env` も `OPENAI_API_KEY` を使っている。ドキュメントと仕様書だけが Claude ベースの記述で残っており、整合性が取れていなかった。

**決定**: Tryline の LLM プロバイダは OpenAI とする。モデルは以下の 2 つに集約し、`lib/llm/models.ts` の `MODELS` 定数で一元管理する。

- `MODELS.FAST = "gpt-4o-mini"` — 抽出・Reddit フィルタ・品質チェック等、コスト感度の高い段階
- `MODELS.NARRATIVE = "gpt-4o"` — 日本語ナラティブ生成

**代替案と却下理由**:
- Anthropic Claude（D003 当初案）: Owner が OpenAI を選択済み
- `o1-mini` / `o1` をナラティブに使用: 推論特化でコストが高く、ナラティブ生成には現時点で不要（将来の品質要件次第で再検討）
- `gpt-4.1` 系: 候補だが、2026-04 時点では `gpt-4o` 系が安定・情報量多で当面優位

**影響**:
- 仕様書・ドキュメントから「Claude」「Anthropic」「Haiku」「Sonnet」「ANTHROPIC_API_KEY」の記述を削除し、OpenAI モデル名 / `OPENAI_API_KEY` に置換する（本 PR で一括実施）
- D003 の段階別モデル割り当て（Haiku を 1・2・3・5、Sonnet を 4）は「`FAST` を 1・2・3・5、`NARRATIVE` を 4」として解釈を引き継ぐ
- モデル ID 変更時は `lib/llm/models.ts` の 1 箇所だけを書き換えればよい。仕様書には具体モデル名を直書きしない方針に寄せる（参照は `MODELS.FAST` / `MODELS.NARRATIVE`）
- コスト感は D003 の「プレビューあたり $0.15 以下」目標を引き継ぐが、OpenAI 価格で再計算する必要あり（p1-content-pipeline 着手時に見直し）

**D003 との関係**: D003 は履歴として残すが、本決定で supersede する。以後の Phase 1 仕様書と Codex プロンプトは D008 を優先して参照する。

## D009 — Phase 1 を 4 段階パイプラインに縮退、Reddit は承認後に再追加（2026-04）

**背景**: 2025-11 に Reddit が Responsible Builder Policy を導入し、新規 API アプリは全て事前承認制に移行した。商用利用は別途承認必須で、承認目安は 7 日、却下リスクも存在する。Tryline は ¥980/月 の有料プランを持つため商用扱いとなり、`specs/p1-reddit-ingestion.md`（PR #16 でマージ済み）は承認が下りるまで実装できない。Six Nations 2027 ローンチ（2027-02〜03）のクリティカルパスを Reddit 承認に依存させるリスクが高い。

**決定**: Phase 1 のコンテンツパイプラインは 4 段階構成とする。

1. 集約
2. 事実抽出（`MODELS.FAST`）
3. ナラティブ生成（`MODELS.NARRATIVE`）
4. 品質評価（`MODELS.FAST`）

Reddit フィルタ（元の段階 3）は削除せず「承認後に差し込む拡張点」として温存する。ナラティブ段階の入力に `additionalSignals: AdditionalSignal[]` を定義し、Phase 1 では常に空配列を渡す。Reddit 承認または他ソース採用時は、新段階が同 shape の配列を返すだけでナラティブ側の変更は不要。

**代替案と却下理由**:
- **Reddit 承認待ちで Phase 1 を止める**: 7 日〜未知の遅延を Six Nations 2027 クリティカルパスに載せるのは容認不可
- **別ソース（公式プレス、RugbyPass 等）を Phase 1 に組み込む**: 新規スクレイパーは robots.txt / ToS 確認 / 仕様書作成コストがかかる。縮退でも MVP 品質は成立するため先送り
- **Reddit を恒久的に外す**: コミュニティ・シグナルは将来の差別化要素として価値が高い。恒久除外は失う情報量が大きい

**影響**:
- `specs/p1-content-pipeline.md` を 4 段階に改訂（段階番号繰り上げ、`additionalSignals` 型定義追加）
- `CLAUDE.md` / `AGENTS.md` / `docs/architecture.md` の「5 段階」記述を「Phase 1 は 4 段階」に更新
- `specs/p1-reddit-ingestion.md` / `docs/codex-prompts/p1-reddit-ingestion.md` は削除せず、先頭に「Reddit 承認後に実装、現時点では着手禁止」のバナーを追加。承認取得時にそのまま復活可能
- Owner は並行して Reddit Developer Support に承認申請を提出する（テンプレート: `docs/reddit-approval-request.md`）
- MVP 品質への影響: コミュニティ発の戦術的色味は Phase 1 で提供されない。公式統計 + 過去対戦 + LLM 生成で日本語プレビューは成立するが、「海外ファンの視点」は Phase 2 以降

**Reddit との関係**: `specs/p1-reddit-ingestion.md` を supersede しない（温存）。承認取得時点で本決定を発展的に解消し、段階追加として別 PR で仕様改訂する。

## D010 — `p1-content-pipeline` 未解決事項の一括決着（2026-04-24）

**背景**: `specs/p1-content-pipeline.md` は PR #18（D009 による 4 段階化）時点で 4 つの未解決質問を持ち、Codex への実装依頼を出せない状態だった。未解決のまま放置するとコンテンツパイプライン（Phase 1 のコア機能）が進まず、Six Nations 2027 ローンチ（2027-02）クリティカルパスに直撃する。Claude Code がコスト再試算と各論点の推奨を提示し、Owner が全推奨に同意して決着。

**決定**:

1. **レビュー生成タイミング**: 試合終了後 T+1h で即時実行。公式詳細スタッツの到着を待たない
2. **リトライ戦略**: 段階 3 は temperature の振幅のみ（`0.7 → 0.9 → 0.4`）。モデル昇格は行わない
3. **手動レビューフロー**: Slack 通知 + Supabase Studio 運用。管理 UI は作らない
4. **Reddit 却下時の代替外部シグナル**: Phase 1 では追加しない（`additionalSignals: []` 前提）
5. **`match_content.status` カラム追加**: `draft` / `published` / `rejected` の 3 値
6. **`model_version` 書式**: OpenAI が返す物理バージョン（`gpt-4o-2024-11-20` 等）
7. **`prompt_version` カラム追加**: semver 文字列
8. **コストアラート**: Phase 1 は `pipeline_runs.cost_usd` の DB クエリ監視のみ。Slack 連携は Phase 2（`p1-observability.md`）

**代替案と却下理由**:
- **レビュー遅延公開（T+6h 以降）**: 公式詳細スタッツを待つ案。日本時間で Six Nations の試合終了は早朝のため、通勤時刻までに読める UX 価値のほうが大きいと判断。品質劣化が顕著なら Phase 2 で遅延オプションを追加
- **リトライ時のモデル昇格**: 段階 3 は既に `MODELS.NARRATIVE`（最上位）なので昇格先がない
- **管理 UI を Phase 1 で実装**: 15 試合 × preview/recap = 30 件規模、reject 率 10% でも月数件。実装コストに見合わない
- **Phase 1 での代替外部シグナル（RugbyPass 等）**: 新規スクレイパーは robots.txt / ToS 確認 + 仕様書起票コストが高い。Reddit 承認結果（7 日目安）を待ってから判断

**影響**:
- `specs/p1-content-pipeline.md` を本決定で改訂（同一 PR で実施）
- `docs/architecture.md` の「LLM 利用予算」セクションを OpenAI 試算で上書き
- コンテンツ生成コストは 1 試合あたり ~$0.08（preview + recap 合算、最悪値で ~$0.23）。Six Nations 2027 大会合計で最悪 ~$4
- `match_content` のスキーマ拡張（`status` / `prompt_version`）は Phase 1 の初回マイグレーション（Codex が本仕様書を実装する PR）で適用。既存データがないため後方互換の心配なし
- 後続仕様書として `p1-match-content-display.md`（プレースホルダー差し替え）と `p1-pipeline-scheduling.md`（Vercel Cron）を別途起票予定

**関係する仕様書**: `specs/p1-content-pipeline.md` を本決定の内容で確定。以後、パイプライン関連の判断は D010 を優先参照する。

## D011 — Rugby Championship 2026 は不開催、後継は「Rugby's Greatest Rivalry」（2026-07-13、D007 を補足・確定）

**背景**: D007（2026-04）は「2026年の Rugby Championship は World Rugby のカレンダー再編に伴い実施されない見通し」としたが、その後 `.claude/skills/hub-audit/SKILL.md` や `docs/marketing-strategy-2026-07-06.md`（07-06、⑤「TRC 2026 ハブ整備」施策）が「8月開幕大会」として SEO 施策の優先項目に組み込んでおり、D007 と矛盾したまま放置されていた。2026-07-13 の運用インフラ監査（Claude Fable 5 / Codex 並行分析）でこの矛盾が発覚し、Owner 確認により決着。

**決定**: The Rugby Championship（従来の SANZAAR 南半球大会）は D007 の通り 2026 年は開催されない。後継として「Rugby's Greatest Rivalry」という名称の大会が 2026 年から開催される。DB 上の `competitions`（`family='rugby-championship', season='2026'`）レコード（2026-07-13 実測: 試合 0 件・`start_date`/`end_date` とも null）は、開催されない大会の誤ったプレースホルダーである可能性が高い。

**影響**:
- `docs/marketing-strategy-2026-07-06.md` の「TRC 2026 ハブ整備」施策・`hub-audit` スキルの8月開幕前提は、これらの記述通りには実装しない
- 「Rugby's Greatest Rivalry」が DB 上どの大会として扱われるべきか（新規競技として追加するか、既存の `nations-championship`/2026 の一部か）は未調査。DB の `rugby-championship`/2026 レコードの扱い（削除・不開催ステータス付与等）も含め、別途調査・spec 化が必要
- 本決定は方針の確定のみで、DB 変更・spec 起票は未実施

**未解決の質問**: 「Rugby's Greatest Rivalry」の対象チーム・試合形式・開催時期・DB 上の扱いは、Owner 確認・追加調査のうえで別 spec に起票する。

## D012 — X運用方針v2: 投稿フォーマットを実測に基づき刷新（2026-07-13）

**背景**: Owner 提供の X アナリティクス CSV（42投稿・約4週間分）を Claude Fable 5 / Codex が並行分析。総インプレッション1,038（中央値17/投稿）、エンゲージメント65の83%がクリック系、いいね・RTによる拡散複利ゼロ、新規フォロー1件、プロフィールアクセス4件。同型フォーマットの連投（7/1 プレビュー6連投=各4〜11imp）が最低インプレッション帯であること、Tier 0 公式への祝辞型 reply が129impでも転換ゼロであることが判明。

**決定**: 90日コミット（チャネル継続）は維持したまま、投稿フォーマットを刷新する。

1. **1投稿=1メッセージ**、冒頭は「最も驚く事実」から（日付・大会名始まりの定型文廃止）
2. **分割連投廃止**: 複数試合は強い1本＋スレッド形式。**2026-07-05 の「3試合ずつ分割・各投稿リンク可」ルールを廃止・置換**
3. **引用リポスト解禁**: 対象を日本代表絡みから海外ラグビー全般の公式発表・信頼できる現地報道へ拡張。日本語の付加価値（日本のファンへの意味・次戦への影響）必須、1日1〜2件
4. **タイムライン配分**: 独自分析50% / ニュース引用30% / reply・会話20%
5. **重心は日本代表＋その週の主要国際試合**（認知獲得フェーズの集中投下）
6. **reply の質**: 祝辞・感想だけの reply 禁止、「事実＋自分の見方」必須
7. **プロフィール確定**: アカウント名「Tryline｜海外ラグビー日本語分析」、bio・固定ポスト文案は `docs/x-reply-strategy.md`
8. **4週間プロセスKPI**: インプレッション中央値17→50、プロフィールアクセス率0.39%→1%、週2フォロー、4投稿に1エンゲージ、同型連投ゼロ

**立ち位置**: 「海外ラグビーのニュースが日本語で分かり、それが次の試合にどう影響するかまで分かる」。速報の速さでは勝負しない（速報量産をやらない方針は維持）。

**影響**: `.claude/skills/x-post/SKILL.md`（投稿の原則セクション新設・型5拡張・分割ルール置換）、`.claude/skills/x-reply/SKILL.md`（reply の質セクション追加）、`docs/x-reply-strategy.md`（確定プロフィール文案・4週間プロセスKPI）、`docs/marketing-strategy-2026-07-06.md` 2.3節（実測値の確定と判断の更新）を同日改訂済み。

**追記（2026-07-14、ハッシュタグ戦略の修正）**: Claude Fable 5 / GPT-5.6 の並行検討で、ハッシュタグ運用を投稿タイプ別に精緻化。42投稿の実測で「ハッシュタグのクリック数」が全件0だったことを踏まえ、固定ポスト・引用リポスト・note返信は0個、独自分析/結果は0〜1個、試合実況のみ当日の公式タグを確認して1〜2個、という表に更新（`.claude/skills/x-post/SKILL.md`）。あわせて「#週末の海外ラグビー」は検索需要のない自作タグだったため、ハッシュタグ化をやめ「【週末の海外ラグビー】」という本文中のシリーズ名表記に変更（番組化の効果はブランド一貫性で担保し、ハッシュタグ検索への期待は持たない）。4週間のタグあり/なしA/Bテスト枠を追加。

**追記（2026-07-14、固定ポストのリンクカード staleness 発見・修正）**: 固定ポスト適用直後、実際に本番投稿してリンクカード画像が表示されないことが判明。調査の結果、X（および note 等）はリンクカードの画像をURL初回クロール時点でキャッシュし、`/calendar` のように週次で内容が変わるページでも自動で再クロールされない。週次投稿（毎回新規クロール）は問題ないが、**長期間表示され続ける固定ポストで週次変動する動的OG画像のURLをリンクカードとして使うと、初回クロール時点の古いデータで画像が固定され続ける**（Claude Fable 5 / GPT-5.6 の並行検討で特定）。対策として固定ポスト本文から URL を削除し「今週の試合日程はプロフィールのリンクから」に変更（プロフィールのウェブサイトリンクは既に `/calendar` を指すため、本文にURLがなければリンクカード自体が生成されず問題を回避できる）。週次投稿では引き続き `/calendar` へのリンクカード、または `/api/og?type=calendar` をネイティブ画像添付する運用（`.claude/skills/x-post/SKILL.md` 型2）を継続。カレンダーOG画像自体の視覚改善（注目試合にキックオフ時刻を追加、色を緑からブランド色 `#c93a40` へ変更）は `specs/fix-calendar-og-image-styling.md` で別途対応。

## D013 — note 運用方針v1: 記事ポートフォリオを3タイプ制へ再設計（2026-07-13、Owner 承認済み）

**背景**: Codex 調査（`docs/codex-prompts/research-note-redesign-2026-07.md` への回答）と Claude Code の突合。X 実測で日本×アイルランド深掘り記事（URLクリック4/24imp）が同日の週次まとめ（0/23imp）を上回った（N=1）。note の推薦は独自性・1記事1テーマ・一次情報を重視し、「全試合を均等に並べる記事」より「一つの問いを検証する記事」と相性が良いことを公式資料で確認。

**決定**:

1. **記事ポートフォリオ3タイプ制**: A=日本代表戦翌日の単発深掘り（最優先、試合後12〜18時間以内・翌朝7〜10時）/ B=テーマ型週次（2〜3試合に絞る、最大週1、A を出す週は休止）/ C=月1エバーグリーン・独自データ企画（交互、別枠最大3時間）
2. **旧「全試合を各3〜4文」の週次まとめルール（2026-07-06 Owner フィードバック）を置換**。「1行では情報量不足」の教訓は「絞った試合を深く書く」形で継続。全試合の記録は Tryline 本体が担当
3. **CTA 2段構成**: 主CTA=記事内容に一致した導線1本＋フッター固定=カレンダーページ。UTM 付与率100%
4. **数値は Tryline DB で確認できるもののみ**。外部公式スタッツは sourced_facts 取り込み済みのもの以外使わない
5. **note 内交流は週15分・4週間テスト**（推薦アルゴリズムへの直接効果は公式資料で未確認のため、関係構築テストに格下げ）
6. **X 連動**: 単独 URL 告知廃止。試合直後の X 親スレッドへの返信で告知 → 条件付き引用RT → 選択式質問。24h/72h 計測
7. **KPI は相対値判定**: A=直近5記事の7日ビュー中央値の1.5倍、C=中央値の2倍 or UTM referral 3件以上、全体=note referral 8→15セッション/28日
8. 独自データ企画（「904試合」等）は公開時点の実件数・対象期間・定義を本文に明記できる場合のみ

**Owner 事前作業**: note 管理画面の直近5記事ベースライン記録、外部配信許諾設定の確認、アナリティクスβの確認、公開記事とリポジトリ原稿の同一性確認。

**影響**: `.claude/skills/note-weekly/SKILL.md` 全面改訂（3タイプ制）、`docs/note-owned-media-playbook.md` v2 へ全面改訂（旧「X シャドウバン回復中」前提を除去）、`.claude/skills/x-post/SKILL.md` 型3（note 連動）更新、`docs/x-reply-strategy.md` note 連動節更新。いずれも同日実施済み。初回適用は 7/18 日本×フランス戦（国立競技場）の翌朝深掘り（7/19 公開）。

## D014 — iOS アプリ（tryline-mobile）を正式プロダクトラインへ昇格（2026-07-14、Owner 承認済み）

**背景**: 外部集客が立ち上がらない中（GA4 実測約4セッション/日・X フォロワー3人）、App Store を新しい認知・獲得チャネルとする案を検討。競合調査（2026-07-14）で、海外ラグビー横断アプリは英語のみ（RugbyPass: 日本53件・評価4.7・日本語対応要望レビューあり / Gainline: 日本の放送情報非対応）、日本語アプリは国内・日本代表中心（JAPAN RUGBY APP: 118件・評価3.4）と判明。「日本語 × 海外大会横断 × 日本での視聴方法 × Tryline 独自分析」の空白が存在する。ただし競合のレビュー件数から日本のラグビーアプリ市場は数千〜数万 DL オーダーと推定され、公開だけで流入が生まれる規模ではない。

**決定**:

1. **iOS アプリを正式プロダクトラインへ昇格**。目的は「App Store を Tryline のもう一つの入口とし、Web + iOS 合計の利用者・有料購読者を増やす」。サイトセッションのみを KPI にしない
2. **位置づけは「RWC 2027 に向けた器」**。App Store 検索は需要スパイク時にしか効かず、順位は DL 数・評価で決まるため、スパイク前に評価を貯める逆算でローンチは早いほど有利
3. **タイムライン**: 7/18 日本×フランス（X→note 導線テスト、D012/D013 の最優先を維持）終了後、7/20 週に p0 着手 → 8月アプリ本体 → 9月中〜下旬 App Store 公開 → 11月オータムインターナショナル（日本代表欧州遠征）が最初のスパイク → Six Nations 2027 → RWC 2027 で刈り取り
4. **v1 は IAP なし**（Netflix 型: Web 購入済み Premium をログインで解錠、アプリ内販売・外部購入リンクなし）。StoreKit 2 + App Store Server Notifications V2 による IAP は v1.1 で判断。スマホソフトウェア競争促進法（2025-12 施行）下で日本ストアの外部決済リンクが認められる場合は IAP 自体を恒久スキップできる可能性があるため、v1.1 判断前に要調査
5. **技術方式は Expo（React Native）**。TypeScript 資産（型・API クライアント）と supabase-js をそのまま利用、expo-updates の OTA 配信で審査を挟まず緊急修正可能、将来の Android はほぼ追加費用ゼロ。コードは**別リポジトリ `tryline-mobile`**（本リポジトリの本番構成を触らない）。仕様書は従来どおり本リポジトリ `specs/` に置く
6. **v1 スコープ**: 週間カレンダー / 試合詳細（スコア・順位・ラインナップ）/ プレビュー・レビュー閲覧 / お気に入りチーム・大会 / 試合前・記事公開通知（spoiler_guard 対応、`specs/p2-push-notifications.md` の設計を継承）/ 日本の視聴先公式リンク / Supabase Auth / Web Premium の entitlement 共有 / アカウント削除（審査要件 5.1.1(v)）。**対象外**: AI チャット、ニュースハブ、IAP、ウィジェット / Live Activities、Web の SEO 専用ページの移植

**MVP 不変条件との整合**: 「モバイルファーストの PWA、MVP ではネイティブアプリなし」（CLAUDE.md / AGENTS.md）は Phase 1〜2 の MVP に対する制約であり、MVP は完了済み。iOS は MVP 後の新フェーズとして扱う（不変条件の改訂ではなく適用範囲の明確化）。試合中心データモデル・試合単位キャッシュ・生テキスト再配信禁止・robots.txt 尊重・**Web と iOS で同一コンテンツを配信（クライアント別に別生成しない）**は iOS でもそのまま維持する。

**影響**: `specs/feat-premium-entitlement-refactor.md`・`specs/feat-mobile-api-v1.md` を同日起票（p0、Web 単体でも価値がありアプリ中止でも無駄にならない）。アプリ本体・APNs push・IAP の spec は p0 完了後に順次起票。Apple Developer Program 登録は Owner が開発と独立して先行申請する。

**未解決の質問**: フェーズゲート（アプリ本体着手前の数値条件）は設けず 7/20 週着手を Owner が決定済み。IAP 導入可否と価格差（Web ¥980 との関係）は v1 の通知許可率・継続率を見て v1.1 で判断。→ **D015 で決着（審査却下により前倒し）。**

## D015 — iOS の IAP を RevenueCat で実装（2026-08-10、D014 決定4を改訂）

**背景**: 2026-08-02 に App Store へ審査提出し、2026-08-06 に **Guideline 3.1.1 でリジェクト**された。

> The app accesses digital content purchased outside the app, such as Premium plan, but that content isn't available to purchase using In-App Purchase.

D014 決定4の「v1 は IAP なし（Netflix 型）」は、Web 購入済み Premium をログインで解錠し、アプリ内販売・外部購入リンクを持たない構成だった。しかし Apple は、アプリ外で購入したコンテンツへのアクセスを認める条件として **同じものが IAP でも購入できること**（Guideline 3.1.3(b) Multiplatform Services）を求める。監査の結果、アプリ内に `/pricing` への誘導も価格表記も無く **anti-steering 違反は無い**。純粋に「IAP が無い」ことだけが却下理由である。

したがって v1.1 まで待つ選択肢は無く、**IAP 実装が公開の必須条件**となった。

**決定**:

1. **D014 決定4の「v1 は IAP なし」を撤回し、v1 で IAP を実装する。** 判断時期を v1.1 から前倒しする理由は、通知許可率・継続率を見る前に審査が通らないため
2. **実装方式は RevenueCat**。D014 が挙げていた StoreKit 2 + App Store Server Notifications V2 の直接実装を採らない。理由は、レシート検証・更新イベント・復元・将来の Android を1つの抽象で扱え、entitlement 同期の実装量が小さいこと
3. **スキーマ変更は行わない。** `user_profiles.premium_until` / `premium_source` は既存で、`premium_source` の check 制約に `'apple'` が既に含まれている（`supabase/migrations/20260714084400_add_premium_entitlement_columns.sql`）。判定は `isProfilePremium`（`lib/auth/server.ts:67-75`）が期限のみを見て課金元に依存しないため、Apple 由来の権利をそのまま載せられる
4. **Stripe と Apple の共存ルール**: `premium_source = 'stripe'` かつ有効期限が未来の profile は、RevenueCat の webhook・同期エンドポイントのいずれからも上書きしない。既存の Web 契約者は Guideline 3.1.3(b) により **再購入不要**で、アプリ内では購入 CTA を出さない
5. **スマホソフトウェア競争促進法（2025-12 施行）による外部決済リンクでの IAP 恒久スキップは追わない。** D014 決定4が「v1.1 判断前に要調査」としていた論点だが、審査が現に止まっている以上、法制度の適用可否を待つ判断は取らない
6. **Android / Google Play 課金は対象外。** RevenueCat は将来そのまま流用できるが本決定では扱わない

**影響**: `specs/feat-ios-in-app-purchase.md` を 2026-08-09 起票、`docs/codex-prompts/feat-ios-in-app-purchase.md` を 2026-08-10 作成（web Phase 1 / mobile Phase 2 に分割、Phase 1 のマージが Phase 2 の前提）。`specs/feat-ios-app-mvp.md` の「v1 は IAP なし」の記述は本決定で上書きされる。`specs/feat-support-page.md` の Premium 解約手順の iOS 側は、本 spec の実装確定後に具体化する。App Store 再提出は実装完了後。

**Owner 作業（実装完了だけでは審査に出せない）**: App Store Connect で自動更新サブスクリプションを作成 / Small Business Program 登録（年間収益 $1M 未満なら手数料 30% → 15%）/ RevenueCat アカウント作成・App Store Connect 接続・商品マッピング / RevenueCat の webhook URL に `https://trylinerugby.com/api/revenuecat/webhook` を設定 / `REVENUECAT_WEBHOOK_SECRET`・`REVENUECAT_SECRET_API_KEY` を Vercel 本番へ / `EXPO_PUBLIC_REVENUECAT_IOS_KEY` を EAS へ（過去に EAS への env 登録漏れで事故があるため要注意）。

**未解決の質問**: iOS の価格を Web の ¥980/月 と揃えるか。同額にすると Apple 手数料ぶん利益が減る。iOS のみ高く設定することは Apple のルール上問題ないが、ユーザーから見た不整合をどう扱うか。App Store Connect の設定値のため**実装をブロックしない**。

## D016 — Wikipedia 由来の取り込みを HTML パースから wikitext（`?action=raw`）へ移行（2026-08-12）

**背景**: Top 14 のレギュラーシーズン欠落を調査した結果、Wikipedia 系パーサ15本が共通して抱える構造的な弱点が判明した。いずれも**レンダリング後の HTML**（見出し `id`、`div.mw-heading`、テーブルの列順）に依存しており、Wikipedia 側の表示形式が変わると壊れる。過去の事故（`[edit]` / `[edit source]` の表記ゆれで `matches_updated: 0`、Parsoid 対応、ja.wikipedia の書式非対応）はすべてこの層に起因する。

**`{{rugbybox}}` は名前付きパラメータで試合を表現しており、`date` / `time` / チーム / `score` / `stadium` / `attendance` に加え、`try1` / `con1` / `pen1` に得点イベントを分単位で持つ。** 表示形式の変更や `[edit]` ノイズの影響を受けない。

**チームのパラメータ名は `home` / `away` と `team1` / `team2` の2系統があり、大会ごとに分かれている**（Premiership・SRP・Rugby Championship・PNC が前者、URC・Six Nations・Nations Championship が後者）。テンプレート名も `Rugbybox` / `rugbybox` で揺れ、PNC は同一ページ内で混在する。**共通基盤は最初から両方に対応する必要がある。**

### 取得経路は `?action=raw` を使う（robots.txt により MediaWiki API は使えない）

**当初 MediaWiki API（`/w/api.php?action=query&prop=revisions`）を前提に起票したが、これは robots.txt 違反であり誤りだった。** 2026-08-12 に Codex が実装中に `RobotsDisallowedError` で停止し発覚。`en.wikipedia.org/robots.txt` の `User-agent: *` は次のとおり:

```
Allow: /w/api.php?action=mobileview&
Allow: /w/load.php?
Allow: /api/rest_v1/?doc
Disallow: /w/
Disallow: /api/
```

**`/w/` 配下の許可例外は `action=mobileview` だけで、`action=query` は含まれない。** REST API（`/api/rest_v1/`）も `Disallow: /api/` で塞がれている。`skipRobotsCheck` での回避は設計不変条件「robots.txt は常に尊重」に反するため採らない。

**代わりに `/wiki/{ページ名}?action=raw` を使う。** `/wiki/` 配下は `Special:` 等を除き Disallow の対象外で、同一の wikitext が `text/x-wiki` で返る。実装が使っている `robots-parser` で各経路を検証した結果:

| 経路 | 判定 |
|---|---|
| `/w/api.php?action=query&prop=revisions...` | **不可** |
| `/api/rest_v1/page/html/...` | **不可** |
| `/wiki/Special:Export/...` | **不可** |
| **`/wiki/{ページ名}?action=raw`** | **可** |

Premiership 2025-26 を `?action=raw` で取得して 200・159KB・`{{rugbybox}}` 93件を確認済みで、**API 経由で数えた件数と一致する**。取得できる内容は同じ。

### 実測（2026-08-12、現行パーサが使う実ページで確認）

| 大会 | `{{rugbybox}}` | DB | 判定 |
|---|---|---|---|
| URC 2025-26 | 151 | 150 | 対象 |
| Premiership 2025-26 | **93** | **75** | 対象。差18の原因は HTML パースではなかった（下記） |
| SRP 2026（`List of ...` ページ + 本文） | 77 + 6 = **83** | 83 | 対象 |
| Nations Championship 2026（南北2ページ） | 18 + 18 = **36** | 36 | 対象 |
| Autumn Nations 2025 | — | 32 | 対象。**ただし下記のとおりページ名が別問題** |
| Six Nations 2026 | 15 | 15 | 対象 |
| Rugby Championship 2025 | 12 | 12 | 対象 |
| PNC 2025 | 11 | 11 | 対象 |
| Greatest Rivalry 2026 | 8 | 8 | 対象 |
| RWC 2023 Pool A | **0** | — | 対象外。別テンプレート形式 |
| Top 14 2025-26 | 6 | 5 | 対象外。**日付が存在しない** |

### Premiership の18件欠落は HTML パースが原因ではなかった（2026-08-13 訂正）

**当初「HTML パーサが毎月1〜3試合ずつ黙って落としている」と結論し、それを移行の主たる根拠にしたが、誤りだった。** PR #689 で `parsePremiershipLiveHtml` に現在のページを直接渡すと **93件すべてを返す**ことが判明し、前提が崩れた。

欠落18件を実データで特定した結果、**すべてニューカッスル戦だった**（18試合 = 10チームリーグでの1チームの全対戦数）。

| シーズン | DB のニューカッスル戦 | Wikipedia 上の表記 |
|---|---|---|
| premiership-2024-25 | 18 | Newcastle Falcons |
| **premiership-2025-26** | **0** | **Newcastle Red Bulls**（改称） |
| premiership-2026-27 | 18 | Newcastle Falcons |

**2025-26 シーズンだけクラブ名が Newcastle Red Bulls に変わっており、`TEAM_SLUG_BY_WIKIPEDIA_NAME` に対応が無かったためチーム解決に失敗し、`continue` で黙って捨てられていた。** 残り3件はプレーオフの未確定枠で、これは正常な挙動。

対応が入ったのは `d69a9cf fix: warn on unknown live teams`（2026-08-10）。**ところが同日の `ae4d302` で live ソースの登録が `premiership-2025-26` から `premiership-2026-27` に切り替わっている。** 修正が入った日にそのシーズンの取り込みが止まったため、**18件は一度も再取得されていない。**

**したがって wikitext 移行だけでは18件は復旧しない。** `premiership-2025-26` を一度だけ再取り込みする必要がある（下記「未解決の質問」(5)）。

### Autumn Nations は「欠落」ではなく参照先ページが存在しない（2026-08-12 訂正）

当初この表に「49 対 32 で17試合欠落」と記載したが、**49 という数字は現行パーサが参照していない別ページ（`2025 end-of-year rugby union internationals`）のもので、比較として成立していなかった**。

`lib/ingestion/sources/wikipedia-autumn-nations.ts:38` の URL 生成は `${season}_Autumn_Nations_Series` だが、**2025 / 2024 / 2023 のいずれも 404**。つまりこのパーサは全シーズンで存在しないページを叩いており、`isMissingWikipediaPage` で黙って握り潰されている。DB にある32試合は別経路で入ったものとみられる。

**これは wikitext 移行では直らない、参照先ページ名そのものの誤りである。** 移行と切り離して別途調査する（下記「未解決の質問」(4)）。

**決定**:

1. **`{{rugbybox}}` を持つ大会は、`/wiki/{ページ名}?action=raw` で wikitext を取得し、テンプレートのパラメータを読む方式へ移行する。** HTML は解析しない。**MediaWiki API と REST API は robots.txt で禁止されているため使わない**（上記参照）。取得は既存の `fetchWithPolicy` を通し、`skipRobotsCheck` は使わない
2. **移行対象は9大会**: URC / Premiership / SRP / Nations Championship / Autumn Nations / Six Nations / Rugby Championship / PNC / Greatest Rivalry。**移行の価値は「表示形式の変更に壊されない」ことであって、欠落試合の復旧ではない**（Premiership の18件はチーム名改称、Autumn Nations はページ名誤りが原因で、どちらも移行では直らない）
3. **RWC は対象外**。Pool ページに `{{rugbybox}}` が0件で、別テンプレート形式を使っている。移行するなら別途調査が必要
4. **リーグワンは対象外**。`league-one.jp`（公式・許可ドメイン）から取得しており Wikipedia に依存していない。114試合×2シーズンで健全
5. **Top 14 のレギュラーシーズンは Wikipedia では修復不能**と結論する。英語版は `Match_grid`（14×14 の成績表、スコアのみ）、フランス語版も `Résultats` が成績表で `Calendrier` は期間のみ。**試合単位の日付がどちらにも存在しない**。別ソースの確保（例: lnr.fr の規約監査）が必要で、本決定の範囲外とする
6. **一度に全部移さない。** まず1〜2大会で移行し、実データで件数が増える／変わらないことを確認してから横展開する

**調査上の教訓**:

1. **カバレッジ調査は現行パーサが実際に使っている URL で行う。** 当初 SRP を「6/83 だから対象外」と判断したが、`List of {season} Super Rugby Pacific matches` という別ページを見ていなかった誤りだった。Nations Championship も南北2ページ構成で、推測したページ名では正しく測れなかった。Autumn Nations は逆に、**パーサの URL を確認しないまま実在する別ページの数字を使ってしまい、存在しない「17試合の欠落」を報告した**
2. **外部ソースの取得方法を仕様に書くときは、robots.txt を先に読む。** 「公式 API だから許諾が明確」という一般論で MediaWiki API を選んだが、実際の robots.txt は逆に API を禁止し HTML 側を許可していた。**一般論ではなく当該ドメインの robots.txt が唯一の根拠。** 幸い Codex が `skipRobotsCheck` で回避せず停止したため、違反コードはマージされていない
3. **外部データの構造は、対象そのもので確認してから仕様に書く。** `{{rugbybox}}` のパラメータ名を Six Nations の1例だけ見て `team1` / `team2` と断定したが、**移行対象の Premiership は `home` / `away`** で、そのまま実装すれば93件すべて解決できず取り込み0件になるところだった。同様に「テンプレート部分を取り出す」という指示も、リンクと `{{flagicon}}` が併存する URC では国コードを拾ってしまう誤りだった。**1例からの一般化をやめ、対象全ページでパラメータ名と値の書式を集計する。** この3件はいずれも Codex が実装中に発見しており、**仕様側で潰せていれば往復は起きなかった**
4. **仕様に書いた件数は、書いた時点で検算する。** 「17試合の欠落」は 93 − 75 = 18 と合わず、月別内訳の再集計で18が正しいと判明した
5. **差分の件数だけで原因を断定しない。** 「wikitext 93 対 DB 75」から「HTML パーサが落としている」と推論したが、**現行パーサを実際に走らせれば93件返ることはすぐ分かった**。欠落した18件が何かを1件ずつ突き合わせていれば、全部ニューカッスル戦であることも即座に見えた。**件数の差は症状であって原因ではない。原因は必ず個別レコードまで降りて確認する**
6. **「移行すれば直る」を検証せずに移行の根拠にしない。** 誤った原因分析のまま進めたため、移行が完了しても18件は復旧しない。移行自体は表示形式変更への耐性という別の価値で正当化できるが、**根拠が入れ替わったことを記録しておく**

**影響**: `specs/feat-wikitext-ingestion-migration.md` を同日起票。既存の週次監査 cron（`app/api/cron/audit-data-integrity/route.ts`）は5項目（イベント重複・スコア不一致・イベント0件・draft 滞留・順位表鮮度）を検査するが、**「取り込めた試合数が想定より少ない」を検知しない**。Premiership・Autumn Nations の欠落も URC 2024-25（150試合あるはずが7件）も、この盲点で見逃されていた。試合数の異常検知（同一大会の他シーズンとの比較方式）の追加を別途検討する。

**未解決の質問**: (1) Top 14 の代替ソース。lnr.fr（公式リーグ）の robots.txt と AI 利用規約の監査が必要だが、2026-08-07 の監査では大手ほど禁止が多かった。取得不可なら現状維持か対象から外す判断になる。集客上の優先度は低い（GSC で Top 14 の検索需要は未確認）。(2) 過去シーズンのバックフィル。URC 2024-25 等の壊れたシーズンを再取り込みするかは、移行が安定してから判断する。(3) 得点イベントの統合。`try1` / `con1` / `pen1` から `match_events` を取れる見込みがあり、イベント汚染事故の再発防止にも効くが、影響範囲が大きいため別途起票する。(5) **`premiership-2025-26` の再取り込み**。ニューカッスル戦18件を復旧するには、このシーズンを一度だけ取り込み直す必要がある。live ソースの登録は 2026-08-10 に 2026-27 へ切り替わっているため、一時的に登録を戻すか、シーズン指定のバックフィルを回す。**同種の欠落が他大会・他シーズンにもある可能性が高い**（チーム改称は毎年起きる）ため、`TEAM_SLUG_BY_WIKIPEDIA_NAME` に無いチームで `continue` した件数を可視化する仕組み（週次監査への追加）も併せて検討する。(4) **Autumn Nations の参照先ページ**。`{season}_Autumn_Nations_Series` が全シーズン 404 で、DB の32試合がどの経路で入ったのかが未確認。正しいページ名の特定と、そもそもこのパーサが機能しているのかの調査が必要。**wikitext 移行とは独立した問題。**

## D017 — note の週次B型を停止し、時間を大会ハブへ振り替える（2026-08-15、Owner 承認済み。D013 決定1・7 を改訂）

**背景**: 8/13 公開の B型記事（`docs/notes/2026-08-13-weekly.md`）について、X 投稿から note、note からサイトまでの全段を実測した。

```
X インプレッション   115
  ↓ 7.0%
詳細クリック           8
  ↓ 12.5%
リンククリック         1
                            note 7 ビュー（X 経由 1 + note 内 6）
  ↓
サイトへのセッション   0
```

**各段の転換率は壊れていない。** ポストを開いた 8 人のうち 1 人がリンクを踏んでおり（12.5%）、CTA の文言・位置の問題ではない。**壊れているのは母数**で、115 インプレッションから始まる漏斗では出口が 0 か 1 にしかならない。いいね 0・返信 0・プロフィールアクセス 0 も同じことの裏返し。

GA4 実測（2026-07-19〜08-14 の 28 日）では **note.com referral が 0 セッション / 0 ユーザー**。前 28 日（2026-06-21〜07-18）の 28 セッションも「1 ユーザーが 28 回・滞在 437 秒」で、外部読者ではなく Owner 自身の回遊とみられる。**D013 決定7 の KPI「note referral 8→15 セッション/28日」は未達どころか 0 に後退している。**

**note 流入が UTM で別チャネルに紛れている線は消えている**（GA4 の Unassigned 45 セッションの内訳は `x/profile` 36 + `(not set)` 9 で数が一致し、note 由来は含まれない）。

**記事の質は原因ではない。** 8/13 の記事は数字を 1 文で終わらせず意味まで展開しており、`feedback_note_content_density` の基準を満たしている。

**より重い構造的論点**: B型記事の中身（第1戦の得点経過・前後半の反則比較・第2戦のメンバー変更）は、**Tryline のプレビュー／レビューが本来担う内容そのもの**である。現状は、サイトの中核コンテンツを到達量が桁違いに少ない外部に置き、そこから自分のサイトへ戻ってもらう構造になっている。

| 置き場所 | 28 日間の到達（実測） |
|---|---|
| note（1 記事） | 7 ビュー → サイト 0 セッション |
| サイトの大会ハブ（Bing 経由） | **85 ユーザー**（`/c/nations-championship/2026` だけで 45） |

**決定**:

1. **B型（テーマ型週次）を停止する。** D013 決定1 の 3 タイプ制から B を外す
2. **A型（日本代表戦翌日の深掘り）は当面 note のまま継続する。** 需要の発生タイミングが明確で、11 月の日本代表欧州遠征では毎週書ける。サイト本体への移設は、受け皿の設計ができてから別途判断する（本決定では決めない）
3. **C型（月1エバーグリーン）は判断保留。** SEO 資産として時間差で効く性質があり、記事数が少ない段階で切るのは早い
4. **空いた時間は大会ハブの整備に振り替える。** 優先は Nations Championship 2026（11 月の欧州遠征につながり、実需が Bing 実測で確認できている唯一の大会）
5. **D013 決定7 の KPI を保留する。** note referral のセッション目標は、B型停止で母数が変わるため再設定するまで判定に使わない

**この決定が意味しないこと**: note そのものの撤退ではない。X のリーチ（28 日で実流入 9 ユーザー = t.co 7 + x/social 2）が増えれば前提が変わるため、2026 年 10 月第 1 週の X 90 日判定と合わせて再評価する。

**影響**:
- `.claude/skills/note-weekly/SKILL.md` — 3 タイプ制から B型を外す
- `.claude/skills/today/SKILL.md` — 月曜ルーチンの「note 週次まとめドラフトの検品」を削除
- **クラウド routine「note週次まとめドラフト」（月曜 7:00 JST 発火）の停止が必要。** 停止しない限り毎週ドラフト PR が生成され続ける。https://claude.ai/code/routines で Owner が停止する
- `docs/note-owned-media-playbook.md` — B型の記述の扱いを要確認

**教訓**: **単一チャネルのセッション数だけを見て「唯一機能している referral」と評価していた**（2026-07 時点の診断）。実際には 28 セッションが 1 ユーザーで、外部読者はゼロだった。**referral を評価するときはセッション数ではなくユーザー数を見る。** セッション数はひとりの回遊で容易に膨らむ。

## D018 — `design.md` を実装に合わせて書き直す（実装を文書に寄せない）（2026-08-25、Owner 承認済み）

**背景**: デザイン監査（PR #722、`docs/design/audit-2026-08-24.md` 所見 A-1）で、`design.md` と現行実装が別のデザインシステムになっていることが検出された。

時系列を確認したところ、原因は文書の陳腐化だった。

| 日付 | 出来事 |
|---|---|
| 2026-05-06 | `design.md` 作成（commit `91ea49f`「Apple-inspired design system」） |
| **2026-06-23** | 試合ページ刷新のモック3案から Owner が **案1「やわらかモダン」を選定**。案3「余白プレミアム」（細身セリフ＋余白）は「上品だが訴求が弱く不採用」 |
| 2026-07-07 | bento カード刷新（PR #489/#490/#491/#492） |
| — | `design.md` はこの間**一度も更新されていない** |

**`design.md` の内容は、実質的に却下された案3である。**

| 項目 | design.md | 実装 |
|---|---|---|
| accent | 緑 `oklch(58% 0.18 145)` | `#c93a40`（赤） |
| 見出し | `Noto Serif JP`（セリフ） | `Zen_Maru_Gothic`（丸ゴシック） |
| display | `Fraunces` | 数値のみ `Outfit` |
| カード radius | `md = 0.75rem` | `--radius-md: 1.375rem` |
| 性格 | "crisp and premium, **not playful**" | 親しみやすくアプリらしい |

**決定**:

1. **`design.md` を現行実装に合わせて書き直す。** 実装側は変更しない。実装を design.md に寄せることは、Owner が明示的に却下した案3への回帰を意味するため
2. **全面書き換えではない。** Elevation & Depth 節のチームカラーの扱い等、実装と既に一致している記述は残す（`docs/codex-prompts/feat-upcoming-fixture-visual-redesign.md:11` が既に実装根拠として参照している）
3. **Do's and Don'ts 節は空にしない。** 現行の禁止事項（decorative gradients / glassmorphism / heavy shadows）はいずれも意図的な実装と衝突するが、削除して「何でもOK」にはせず、現行ブランドで実際に避けるべきことに置き換える
4. **未達は未達と書く。** コントラスト比と `prefers-reduced-motion` は現状 WCAG AA を満たしていない。design.md は「目標」ではなく「現状 ＋ 既知の未達」として記述する
5. **a11y の実バグ修正は本決定に含めない。** design.md の記述とは独立した別 spec とする

**この決定が意味しないこと**: 現行ブランドを恒久的に固定するものではない。方向性を変える判断は将来あってよいが、そのときは「文書が古いから実装を直す」ではなく、方向性の変更として明示的に決める。

**影響**:
- `specs/fix-design-md-brand-realignment.md` / `docs/codex-prompts/fix-design-md-brand-realignment.md`（作成済み）
- `docs/codex-prompts/pr7-create-design-md.md`・`pr8-ui-design-md-polish.md` は却下された方向の指示書。**今後参照しない**
- 未 spec の実バグ2件が別途残る: ink-muted のコントラスト（実 body 背景上 3.60:1 / 白カード上 4.14:1、要求 4.5:1）、`prefers-reduced-motion` 対応 0 箇所（transition/animation は 125 箇所）
- トークンの命名・値の不整合2件も別 spec 候補: `--color-paper`（#f5f6f8）が body の実背景（#f1efe9）と別値、`--font-serif-jp` が丸ゴシックを指しており名前と実体が乖離

**教訓**: **デザイン文書を「権威ある基準」として扱う前に、作成日と、その後の方向性決定との前後関係を確認する。** 今回、Claude Code は監査プロンプトで design.md を無条件に適合基準と指定したが、これは誤りだった（Codex 側が所見 A-1 で「基準が未確定」と留保したため実害は出なかった）。同様に、監査レポートの数値を検算する際は**トークン名ではなく実際に描画される値**を使う。`--color-paper` を body 背景と取り違えてコントラスト比を再計算し、正しかった Codex の値を誤りと判定しかけた。
