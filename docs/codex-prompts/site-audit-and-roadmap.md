# Tryline サイト調査・改善ロードマップ策定

## 目的

現在の Tryline（https://tryline-six.vercel.app/）のデザイン・UI・情報品質を多角的に調査し、
改善提案と今後のロードマップ案を策定する。**コードの変更は行わない。調査・分析・提案のみ。**

## 調査対象ページ

| ページ | URL |
|---|---|
| トップページ | https://tryline-six.vercel.app/ |
| 試合詳細 A | https://tryline-six.vercel.app/matches/07cd8659-898e-453f-948a-1055ed3a383c |
| 試合詳細 B | https://tryline-six.vercel.app/matches/4cdfe50e-083d-420a-912e-28f8b7529ef4 |
| 試合詳細 C | https://tryline-six.vercel.app/matches/1911a4f1-ab3f-4b43-937d-86295ed153cd |
| シーズン一覧（任意） | トップページから代表的な大会・シーズンページに遷移して確認 |

## 調査手順

1. Playwright で各 URL にアクセスし、PC（1440px）・モバイル（375px）それぞれのスクリーンショットを撮影
2. 以下のコードベースの主要ファイルを読む:
   - `app/page.tsx`（トップページ）
   - `app/c/[competition]/[season]/page.tsx`（シーズンページ）
   - `app/matches/[id]/page.tsx`（試合詳細ページ）
   - `components/match-header.tsx`
   - `components/match-card.tsx`
   - `components/match-content.tsx`
   - `components/match-content-section.tsx`
   - `components/match-events-section.tsx`
   - `components/match-lineups-section.tsx`
   - `components/standings-table.tsx`
   - `components/site-header.tsx`
   - `components/site-footer.tsx`
3. 以下の観点で分析し、Markdown レポートにまとめる

## 調査観点

### A. デザイン品質

- ビジュアル階層（見出し・スコア・本文の優先度が一目で分かるか）
- タイポグラフィ（フォント選択・サイズスケール・行間）
- カラーパレット（ブランドカラーの一貫性、コントラスト比）
- スペーシングリズム（余白が規則的か、窮屈または間延びしていないか）
- モバイル表示の完成度（375px で主要情報が欠落・溢れしていないか）
- デザインの「テンプレート感」（汎用的すぎてラグビーサイトに見えないか）

### B. UI / UX

- グローバルナビゲーションの分かりやすさ
- トップページから試合詳細までの導線
- 大会・シーズン切替の使いやすさ
- CTAの明確さ（次に何をすれば良いかが分かるか）
- ローディング中・データなし状態の表示

### C. 情報品質・情報量

- 試合詳細ページの情報充実度（スコア・選手・スタッツ・得点経過・ラインアップ）
- LLM生成の日本語コンテンツの質（読みやすさ・ファクトの正確さ・深さ）
- **【重要懸念】ビジュアルコンテンツの欠如**
  - チーム・選手の画像・写真がない
  - YouTube ハイライト動画リンクがない
  - 試合会場の写真・地図がない
  - テキストと数字だけで視覚的なアクセントが少ない
- 競合他社（ESPN、BBC Sport、Rugbypass 等）と比べて不足している情報は何か

### D. コンテンツ戦略上の課題

- 現在のコンテンツ（LLM生成プレビュー・レビュー）がユーザーの滞在時間・再訪を促せているか
- 「日本語でラグビーを深掘りする」というバリュープロポジションがページから伝わるか
- ユーザーが「次の試合を楽しみにする」動機づけになるコンテンツが揃っているか

## レポート形式

以下の構成で `docs/site-audit-report-2026-05.md` に出力すること。

```markdown
# Tryline サイト調査レポート（2026年5月）

## サマリー（3〜5文）

## スクリーンショット一覧
（Playwright で撮影したものを参照パスとして列挙）

## A. デザイン品質 評価（◎/○/△/×）
### 良い点
### 改善が必要な点

## B. UI/UX 評価（◎/○/△/×）
### 良い点
### 改善が必要な点

## C. 情報品質・情報量 評価（◎/○/△/×）
### 良い点
### 改善が必要な点
### ビジュアルコンテンツ欠如の影響分析

## D. コンテンツ戦略上の課題

## 今後の改善ロードマップ案

### 短期（〜1ヶ月）
優先度高・実装コスト低の改善

### 中期（1〜3ヶ月）
ビジュアルコンテンツ・情報拡充

### 長期（3ヶ月〜）
プロダクト方向性に関わる大きな施策

## ビジュアルコンテンツ実現可能性メモ
- YouTube Data API / oEmbed によるハイライト埋め込みの実現可能性
- Wikimedia Commons・Wikipedia Infobox からのチームエンブレム取得の可否
- 著作権・利用規約上のリスク評価

## 競合比較メモ
（ESPN、BBC Sport、Rugbypass 等と比較して気づいたこと）
```

## ビジュアルコンテンツ不足に関する追加調査

特に YouTube リンク・チーム画像の実現可能性について以下を調べること:

1. **YouTube oEmbed / Data API v3** でラグビー試合ハイライト動画を検索・埋め込みできるか（公式チャンネル例: World Rugby、Six Nations Rugby、Premiership Rugby）
2. **Wikimedia Commons** から無料のチームエンブレム・試合写真を取得できるか（ライセンス確認必須）
3. フロントエンドへの YouTube 動画埋め込みに必要な実装コスト（Next.js での `next/image` + iframe / `lite-youtube-embed` 等）
4. 著作権・Terms of Service 上のリスクがないか

## 注意事項

- コードは書かない。読むだけ
- 既存の `specs/` や `docs/` も参照して現在の設計意図を理解した上で評価すること
- 個人的な好みではなく、ターゲットユーザー（日本在住・DAZN/WOWOW加入のラグビーファン）視点で評価すること
- 改善提案は実現可能性（技術的難易度・コスト・著作権リスク）も考慮すること
