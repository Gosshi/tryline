# Web検索で信頼ソースから事実を取得しコンテンツを厚くする

> 作成: 2026-06-06 / 起票: Track B 調査・eval 完了 → Track A
> 調査根拠: `docs/research-web-sourced-facts.md`（コスト・サイト・引用・モデル eval）
> 関連: `p1-content-pipeline.md`（4段）／`fix-factual-grounding-over-length.md`(#375 捏造ガード)／`feat-lineup-aware-previews.md`

## 背景

ja コンテンツが「捏造なしだが浅い」。深さの天井＝**入力データの薄さ**（DBはスコア・フォーム・ラインアップのみ）。Web検索で**信頼ソースから事実を取得→言い換えて利用**すれば、けが/欠場・物語・戦術文脈など DBに無い深みを足せる。eval（決勝1試合×3モデル）で、**web検索は捏造を出さず（H2H等はDB照合で実在）、Marx欠場・負傷・カード等の実材料を取得**できると実証。生再配信は禁止（不変条件）＝事実抽出＋言い換え。

## スコープ

対象:
- 新ステージ **web-sourced-facts**（`lib/llm/` 配下＋スクレイパ/ツール）。OpenAI Responses API の **web_search ツール（モデル=`gpt-4o`）** で事実を取得・構造化。
- `lib/llm/stages/assemble.ts`: `sourced_facts` を `AssembledContentInput` に載せる。
- `lib/llm/prompts/generate-preview.ts` / `generate-recap.ts`: sourced_facts を本文に活用（DB＋sourced_facts のみ・捏造禁止は維持）。
- `lib/llm/stages/qa.ts` / `qa-content.ts`: **grounding 集合を DB＋sourced_facts に拡張**（#375 を壊さず web事実も“検証可能な事実”に）。
- allowlist 設定（新 lib）＋取得結果の**後段 allowlist フィルタ**。

対象外:
- Reddit/SNS（D009・Responsible Builder Policy 待ち）。
- 全試合一斉適用（段階導入＝下記）。
- narrative/QA モデルの世代更新（別論点）。

## データモデル変更

新テーブル **`match_sourced_facts`**（監査・再利用・出典保持のため）:
- `id` uuid / `match_id` uuid (FK) / `content_type` text(`preview`|`recap`|`shared`) /
- `fact` text / `source_url` text / `source_domain` text / `confidence` text(`high`|`medium`|`low`) /
- `fetched_at` timestamptz / `model_version` text / `metadata` jsonb
- 一意制約: `(match_id, fact)` 程度（重複抑制）。RLS: 読み取りは既存コンテンツ同様、書込はサーバのみ。

> 生スクレイプ本文は保存しない（事実＋出典のみ）。不変条件「生テキスト再配信禁止」順守。

## API / 取込サーフェス

- 新 cron/route（例 `app/api/cron/fetch-sourced-facts/route.ts`）: `?match_id=` で1試合、web_search で取得→allowlist フィルタ→`match_sourced_facts` upsert。`assertCronAuthorized` + `fetchWithPolicy` 方針（ただし取得は OpenAI 経由）。
- orchestrate から、対象試合（段階導入＝後述）に対しナラティブ生成**前**に呼ぶ。
- **試合単位キャッシュ**（`fetched_at`）。preview は鮮度が要るので「キックオフ直前なら再取得」等の閾値（未解決質問）。

## LLM 連携（中核・ガバナンス）

1. **取得**: web_search ツール（gpt-4o）。クエリは試合名＋大会＋日付＋「recent form / injuries / key players / head-to-head / stakes」＋**recency 指示**。
2. **出典付き構造化出力**: `{ fact, source_url, confidence }[]`。**事実のみ・推測/創作禁止**。
3. **allowlist を hard 制約に（最重要・eval で露呈）**: 取得後、**source_domain が allowlist 外の fact は破棄**。allowlist 初版＝各リーグ/クラブ公式 ＋ `rugbypass.com`（＋ `league-one.jp`）。賭け/ブログ（例 sportytrader）は除外。「プロンプトで優先」では不十分＝**コードで後段フィルタ**。
4. **2ソース/公式優先**: 非自明な事実は2ソース一致 or 公式のみ `high`。単一第三者は `medium`。ナラティブは `high`/`medium` を使い、QA は `low`/出典不一致を弾く。
5. **ナラティブ**: DB＋sourced_facts のみから記述（言い換え・15語超引用なし・同一ソース複数引用なし）。
6. **QA grounding 拡張**: factual_grounding 照合の対象に sourced_facts を含める＝web事実が「許可された事実」になり #375 と両立。

## allowlist v1（確定 2026-06-06・robots 実地確認済み）

hard フィルタの通過リスト（source_domain がこれ以外の fact は破棄）。

**Tier 1 — 公式**
- `world.rugby`（World Rugby・国際全般）／`rugbyworldcup.com`（RWC）／`sixnationsrugby.com`／`premiershiprugby.com`／`unitedrugby.com`（URC）／`lnr.fr`（Top 14）／`super.rugby`（Super Rugby Pacific・※Cloudflare防御で取得困難な可能性）／`league-one.jp`（既存）
- Rugby Championship: `rugbychampionship.com`（全面許可＋`LLM-Policy: /llms.txt`＝AI開放・確認済 2026-06-06）。※`sanzaarrugby.com` は接続不可で不採用。

**Tier 2 — 検証済みメディア（AI開放）**
- `rugbypass.com`（AI明示Allow＋llms.txt）／`planetrugby.com`／`rugbyasia247.com`（crawl-delay 3s・eval で良質と実証・アジア/League One に有用）

**除外**: `espn.co.uk`（AI全面禁止）・賭け/予想サイト（例 `sportytrader.com`）・一般ブログ/SNS。

**v2 候補（必要時追加）**: 各国協会（englandrugby.com / irishrugby.ie / ffr.fr / sarugby.co.za / rugby.com.au / japanrugby.jp 等）・各クラブ公式。

実装メモ: allowlist は1箇所集約・**サブドメイン含めた末尾一致**で判定（例 `*.world.rugby`）。Super Rugby は公式が取得困難前提でメディア補完。

## 段階導入

- まず **注目試合のみ**（League One プレーオフ等、competition/round フラグ or 明示 match_id）。品質・コストを見てから拡大。
- フィーチャーフラグ or 対象大会の allowlist で制御。

## 受け入れ条件（検証可能）

1. ある試合で web-sourced-facts を実行すると、`match_sourced_facts` に **allowlist ドメインのみ**の fact が入る（賭け/ブログ等 allowlist 外は0件＝後段フィルタが効く）。
2. 決勝級の試合で **けが/欠場（例: Marx欠場）等の recency 事実**を取得できる。
3. 取得 fact は**出典付き**で、捏造（実在しないスコア/試合）が無い（サンプル人手照合）。
4. ナラティブが sourced_facts を活用し**深くなる**（情報密度↑）一方、**factual_grounding が下がらない**（QA grounding に sourced_facts 統合）。#375 を弱めない。
5. **試合単位キャッシュ**（同一試合の再生成で再検索しない／鮮度閾値内）。ユーザー数で検索が増えない。
6. モデル=gpt-4o、コストが1試合 想定内（~$0.02-0.07）。
7. 段階導入（対象外試合では従来通り・回帰なし）。
8. `npm run typecheck`/`lint`/既存テスト green。allowlist フィルタ・grounding 統合の単体テスト追加。

## 検証手順
1. 注目試合で fetch-sourced-facts 実行 → `match_sourced_facts` の source_domain が allowlist のみか SQL 確認。
2. 同試合のプレビュー再生成 → 本文の深さ↑・factual_grounding 維持・捏造ゼロを確認。
3. allowlist 外（賭けサイト）が混ざらないことを確認。

## 鮮度ポリシー（確定 2026-06-06）
- **recap**: 結果確定のため**試合後に1回取得**・再取得不要。
- **preview**:
  - 生成時に sourced_facts 未取得なら取得。
  - **キックオフ72時間前以降は、cached `fetched_at` が24時間より古ければ再取得**（直近のけが/メンバー発表を拾う）。
  - 72時間より前は1回取得で再利用（安定優先）。
  - **検索は1試合の preview ライフサイクルで ≤3回**（コスト保護）。

## 段階導入（確定 2026-06-06）
- **Phase 1（初期）**: League One ＋ 各大会の**ノックアウト/決勝級・注目カード**に限定（フィーチャーフラグ＋対象 competition/round 指定）。高stakes＝web材料が厚く本数少＝品質監視しやすい。
- **Phase 2**: 2〜3週間「捏造ゼロ・factual維持・深さ↑」を確認後、対象大会のレギュラー戦へ拡大。
- 対象外試合は従来通り（本ステージskip・回帰なし）。

## 未解決の質問（残・Owner 判断）
1. ~~allowlist 初版／SANZAAR ドメイン／鮮度／段階導入~~ → **すべて確定**（上記参照）。
2. 各クラブ/協会の **v2 追加**判断（運用しながら）。
3. confidence と 2ソースの**厳密度**（運用しながら調整可）。
