# 新セッション用スターター: サイト再評価

## このドキュメントの目的

このファイルを読んだセッションは、Tryline の現サイトを Playwright MCP でブラウザ操作しながら再評価し、改善すべき点を優先順位付きでまとめて Codex プロンプトとして `docs/codex-prompts/` に出力する。

---

## 役割分担の確認

- **Claude Code（このセッション）**: 評価・仕様策定・Codex プロンプト作成
- **Codex**: 実装（Claude Code は実装コードを書かない）
- **Owner**: 最終判断・Codex への依頼

---

## サイト情報

| 項目 | 値 |
|------|-----|
| 本番 URL | `https://tryline-six.vercel.app` |
| ローカル開発 | `http://localhost:3000`（`pnpm dev` で起動） |
| リポジトリ | `/Users/gota/Documents/src/tryline` |
| 技術スタック | Next.js 15 App Router, TypeScript, Tailwind CSS, Supabase |

### 主要ページ

| ページ | URL パターン | 説明 |
|--------|-------------|------|
| トップ | `/` | ヒーロー、今後の試合、最近のレビュー、大会アーカイブ |
| 大会ハブ | `/c/six-nations` | シーズン一覧 |
| シーズン | `/c/six-nations/2025` | 試合一覧 + 順位表 |
| 試合詳細 | `/matches/:id` | スコア、得点経過、出場選手、プレビュー、レビュー |

### 確認すべき URL（本番）

```
https://tryline-six.vercel.app
https://tryline-six.vercel.app/c/six-nations
https://tryline-six.vercel.app/c/six-nations/2025
https://tryline-six.vercel.app/c/super-rugby-pacific
https://tryline-six.vercel.app/c/urc
```

試合詳細 ID は `/c/six-nations/2025` のシーズンページ → 試合リンクから取得する。

---

## 前回の監査レポート（2026年5月）

`docs/site-audit-report-2026-05.md` に詳細がある。要点：

### 指摘済み・未対応の課題

**デザイン**
- 全ページの情報階層が平坦・均質。トップ・シーズン・試合詳細で密度差が少ない
- 写真・チームエンブレム・動画がなく「データ UI」止まり
- 長文レビューに目次・小見出し・重要スタッツのサイドバーがない

**UX**
- トップページに「今週の注目試合」「レビュー公開済み」「日本時間で見やすい試合」がない
- グローバルナビの `順位表` リンクが `/#standings` 固定でコンテキストとずれる
- 空状態の説明が薄い（なぜ空か・次にどこへ行くか不明）

**コンテンツ**
- LLM レビューが一般表現に偏り、具体スタッツに紐づいていない
- プレビュー未公開のままレビューだけある試合で枠が不自然
- モバイルの長文コンテンツにジャンプ機能がない

### 今回特に確認したいこと

1. **直近の修正が反映されているか**
   - ヒーロー画像の opacity が 0.25 になり背景写真が見えるか（commit `7997047`）
   - recap バックログ消化でレビューが増えているか（Super Rugby Pacific 2026 など）
   - URC 2025-26 の試合データが取り込まれているか

2. **前回レポートの「短期改善」のうち未着手のもの**
   - トップページの「レビュー公開済み」「次の試合」導線
   - プレビュー未公開 + レビュー公開済みの試合詳細ページの表示
   - モバイルの長文レビューの読みやすさ

3. **URC・Super Rugby Pacific などのページが実際に表示されるか**

---

## 評価の進め方

1. **Playwright MCP でスクリーンショット撮影**
   - デスクトップ: 1440×900
   - モバイル: 375×812
   - 撮影先: `docs/site-audit-screenshots/2026-05b/`

2. **評価観点**

   | 観点 | チェック内容 |
   |------|-------------|
   | 視覚的な第一印象 | テンプレート感があるか、ラグビーらしいか |
   | 情報の優先順位 | ユーザーが最初に見るべき情報が目立っているか |
   | モバイル | 折り返し、タップ領域、テキスト読みやすさ |
   | 空状態 | データなし時にユーザーが迷わないか |
   | コンテンツ品質 | LLM 生成テキストが具体的か、根拠データと紐づいているか |
   | 導線 | 次のアクションが明確か |

3. **改善候補の優先順位**

   - P0: ユーザーが迷子になる・離脱する致命的な問題
   - P1: 価値を下げている明確な課題（1週間以内に直したい）
   - P2: 改善すれば差別化につながる（1ヶ月以内）
   - P3: 長期的な取り組み

4. **Codex プロンプト作成**

   P0・P1 の課題ごとに `docs/codex-prompts/<課題名>.md` を作成する。フォーマットは既存ファイル（例: `docs/codex-prompts/frontend-homepage-redesign.md`）に倣う。

---

## 参考ファイル

```
docs/site-audit-report-2026-05.md         — 前回の詳細監査レポート
docs/codex-prompts/                        — 既存の Codex プロンプト群（書き方の参考）
app/page.tsx                               — トップページ
app/c/[competition]/page.tsx               — 大会ハブページ
app/c/[competition]/[season]/page.tsx      — シーズンページ
app/matches/[id]/page.tsx                  — 試合詳細ページ
```

---

## アウトプット

このセッションが終わるまでに以下を作成する:

- [ ] スクリーンショット（`docs/site-audit-screenshots/2026-05b/`）
- [ ] 再評価レポート（`docs/site-audit-report-2026-05b.md`）— 前回との差分・新たな課題・優先順位
- [ ] Codex プロンプト（P0・P1 の課題分）
