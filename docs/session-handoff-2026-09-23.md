# セッション引き継ぎ — 2026-09-23

前セッション（2026-09-21〜23）からの引き継ぎ。**最初に「1. 次にやること」を読むこと。**

---

## 1. 次にやること（Owner 了承済み）

**大会トップページ `/c/<大会>` の改修を spec にする。** spec と Codex 指示書を同時に作る（`specs/` と `docs/codex-prompts/` に同名で）。

### 根拠（2026-09-23 実測）

GSC 28日（`tools/gsc-pull.ts --range 28d --dims page`、表示計 2,226）:

| ページ種別 | ページ数 | 表示 | クリック | CTR |
|---|---:|---:|---:|---:|
| **大会トップ `/c/<大会>`** | 7 | **828（37%）** | 7 | **0.8%** |
| シーズン `/c/<大会>/<年>` | 12 | 484（22%） | 14 | 2.9% |
| その他 | 292 | 920（41%） | 41 | 4.5% |

- 年の付かない広い検索語（「パシフィックネーションズカップ」「ラグビー ワールドカップ」）は大会トップに着地する
- そのページは薄い一覧で、検索者が知りたいこと（いつ・日本は出るか・日本時間の日程・次の試合）が載っていない
- **`/c/rwc`**: title は「順位表・日程・日本での視聴方法」と約束しているのに、本文 1,591 字は大会の歴史紹介と「2027 の試合一覧を見る →」だけ。**「ラグビー ワールドカップ」で順位 32**
- 年ありの「ラグビーワールドカップ 2027 日程」「出場国」は `/c/rwc/2027` で順位 10〜15
- ページの共食いは主因ではない（RWC 系 32 クエリ中 3 件のみ）

### 施策の方向

大会トップに**現在シーズンの要点を直接出す**（開催期間・次の試合と日本時間・日本代表の試合・順位上位・視聴方法）。データはシーズンページに既にあるので**テンプレート変更で記事執筆ではない**。1 回直せば全大会に効く。

### 規模は正直に書くこと

CTR がシーズン並みになっても Google で月 +15〜20 クリック程度。**本命は RWC 2027**（2027-10-01〜11-13）。順位が上がるまで数か月かかるので今始める。判定は変更後 4〜6 週の GSC で大会トップ 7 ページの順位・CTR。**「中身を合わせれば順位が上がる」は仮説**として spec に明記する。

### spec を書く前に必ずやること

- 大会トップのテンプレート（`app/c/[competition]/page.tsx` 付近）を読む。**パスは推測せず `find`/`grep` で確認**
- シーズンページ（`app/c/[competition]/[season]/page.tsx`）が既に出している要素と、それを取るクエリ関数を特定する
- 既存テストで大会トップの文言・構造を assert しているものを grep する
- 過去の UI 判断を `git log --oneline -- <path>` で確認する（`feedback_spec_history_check`）

---

## 2. 前セッションの成果

| PR | 内容 |
|---|---|
| #848 | Top 14 のドロップゴール対応＋取り込みの試合単位エラー分離 |
| #850 | 順位表の鮮度ゲート＋Top 14 の自前計算（公式 lnr.fr と 14 チーム全項目一致を確認） |
| #851 | QA が順位表を根拠として見るように（`competition_standings: "grounded"`） |
| #852 | 放送情報取り込みの 500 を技術障害だけに。10 日ぶりに緑 |
| #853 | 既存コンテンツ除外の 1000 行上限バグ修正（公開済み記事が毎日作り直されていた） |
| #849 | **クローズ**（spec の誤診。#850 が置き換え） |

- Top 14 第 3 節 7 試合のレビューが 0 本 → **7 本 published**（FG5 が 4 本）
- 11 月日本代表 3 試合の放送情報経路を確定（JRFU 公開待ち）

---

## 3. 未解決（優先順）

1. **orchestrate が 504**（`cron-live-pipeline` が 9/22 に 3 回連続 failure）
   - 内部予算 `ORCHESTRATE_TIME_BUDGET_MS = 210_000` に対し `maxDuration = 300`。210 秒直前に生成を開始すると超える
   - 書き込みは試合ごとに確定するのでデータは失われない。バックログが残る間は毎回赤
2. **11 月日本代表 3 試合の放送情報**（11/08 ウェールズ・11/15 イングランド・11/21 スコットランド）
   - JRFU 公開待ち。**期限 10/10**。#852 により、JRFU が載せれば `changes` に `first_destination` が出る
   - 期限までに出なければ Owner から情報をもらい `tools/upsert-match-broadcasts.ts` 用 JSON を作る
   - WOWOW のスクレイピングは**不採用**（会員規約第14条(7)(9)・第17条2項。Owner がアカウント保有者）
   - 詳細: `docs/broadcast-info-path-research-2026-09-22.md`
3. **メール登録欄が刺さっていない**（204 人が見て入力開始 1 人）。約束を「日本代表戦の前日リマインド」等に変える案。**Owner 判断待ち・spec 未作成**
4. **品質の下がった版に置き換わった 9 件**（9/17〜9/22、#853 以前の除外漏れ）。旧版は無い。戻すなら再生成
5. Montpellier v Perpignan の recap が FG3（`recent_form` がシーズンをまたぎ QA が誤検出）
6. `h2h_last_5` が QA で `out_of_scope` のまま
7. Top 14 イベント取り込みが 60 秒でタイムアウト（`maxDuration = 60`、6 試合で 62 秒）。2 回に分ければ入る

---

## 4. 未追跡ファイル（**コミット要否を Owner に確認すること**）

前セッションで**一度 `git stash -u` → drop で消し、`git fsck` で復元した**。未追跡のままだと再び消えうる。

```
docs/bing-traffic-analysis-2026-09-22.md
docs/market-demand-research-2026-09-22.md           ← GPT-6 市場需要調査
docs/market-demand-research-2026-09-22-evidence.json
docs/broadcast-info-path-research-2026-09-22.md     ← GPT-6 放送経路調査
docs/chatgpt-prompts/gpt6-market-demand-research-2026-09-22.md
docs/chatgpt-prompts/gpt6-broadcast-info-path-2026-09-22.md
docs/pmf-audit-2026-06-10.md                        ← 6 月の PMF 監査（stash から救出）
docs/session-handoff-2026-09-23.md                  ← このファイル
specs/fix-recap-standings-delta-fabrication.md      ← 置き換え済み（#849 の誤診 spec）
docs/codex-prompts/fix-recap-standings-delta-fabrication.md  ← 同上
```

最後の 2 本は誤診の spec なので、残すか消すかも Owner 判断。

---

## 5. Owner とのやり取りで守ること

前セッションで繰り返し指摘された。

- **いちいち聞かずに進める。** 確認は本当に Owner の判断が要るもの（プロダクトの方向性・破壊的操作）だけ
- **確認してから断定する。** 前セッションは 1 日で 9 回訂正した。「無い」は全体検索で判定／ツールの出力（summary）を先に読む／仮説を発見として報告しない（`feedback_verify_before_asserting`）
- **着手前に「この面は何セッション/28 日か」を出す。** 4 セッションの面に 1 日使った（`feedback_surface_traffic_before_work`）
- **集客が最優先。** コンテンツ品質の修正を選択肢に並べるときは、同じ工数でできる集客側の選択肢と並べる
- **`git stash -u` を使わない**（未追跡の自作文書まで消える）

---

## 6. 使えるツールと所在

| 用途 | 方法 |
|---|---|
| Google 検索 | `node --env-file=.env.gsc.local tools/run-ts.cjs tools/gsc-pull.ts --range 28d --dims page`（`--dims query` / `query,page` も可、`--out` は無い）→ `tmp/gsc/` |
| Bing 検索 | `node --env-file=.env.bing.local tools/run-ts.cjs tools/bing-pull.ts` → `tmp/bing/`。**期間と合計は `summary-*.md` を読む** |
| GA4 | `mcp__analytics__run_report`（property `538067713`、`date_ranges` は `start_date`/`end_date`） |
| 放送情報の手動登録 | `tools/upsert-match-broadcasts.ts <json>`（`specs/feat-match-broadcasts.md` 参照） |
| 本番 DB 読み取り | `mcp__supabase__execute_sql`（SELECT のみ） |
