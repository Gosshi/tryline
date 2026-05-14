# p3-pricing-page-redesign: 料金ページ LP リデザイン

## 背景

現状の `/pricing` は Free / Premium の 2 カラムカードに各 2 行の機能リストがあるだけで、
画面の 70% が空白。訪問者が「なぜ ¥980 払うべきか」を理解できず、
コンバージョン動線として機能していない。
サンプルコンテンツ・具体的な価値訴求・FAQ を追加し、LP として成立させる。

## スコープ

対象:
- `/pricing` ページの全面リデザイン
- プレミアム価値の具体的な訴求（実コンテンツ例・機能詳細比較表）
- ページタイトルメタデータの修正（現状 "Tryline" のみ）
- FAQ セクションの追加

対象外:
- 価格・プラン構成の変更
- 年払いプランの追加
- Stripe Checkout フローの変更

## UI サーフェス

### ページ構成（上から順）

#### 1. ヒーローセクション

見出し「海外ラグビーを、もっと深く。」  
サブコピー「AI が生成した日本語プレビュー・レビューと試合チャットで観戦体験を格上げする。」  
CTA ボタン 2 つ:
- Primary: 「Premium を始める — ¥980/月」→ Stripe Checkout POST
- Secondary: 「無料で試す」→ `/` へ Link

背景は `--color-ink` のダークトーン（ホームヒーローと同じトーン）。

#### 2. 機能比較表

現状の 2 カラムカードを拡充する。

| 機能 | Free | Premium |
|---|---|---|
| 試合スコア・順位表 | ✓ | ✓ |
| 大会アーカイブ閲覧 | ✓ | ✓ |
| AI 日本語レビュー（冒頭 300 文字） | ✓ | ✓ |
| AI 日本語レビュー全文 | — | ✓ |
| AI 日本語プレビュー全文 | — | ✓ |
| 試合 AI チャット | — | ✓ |
| Web プッシュ通知 | ✓ | ✓ |

#### 3. コンテンツサンプルセクション（新規）

「Premium のレビューはこんな内容です」として実際のレビュー冒頭を表示。

- Server Component 側で `getRecentlyReviewedMatches(1)` を呼び、
  レビューの最初の 200 文字程度を取得する
- テキストの末尾にグラデーションフェードアウトを重ねて「続きがある」ことを示す
- 「続きを読む → Premium を始める」CTA を下部に配置

#### 4. FAQ セクション（新規）

- Q: いつでもキャンセルできますか？  
  A: はい。Stripe カスタマーポータルからいつでも解約できます。次回更新日まで引き続きご利用いただけます。

- Q: どの大会のコンテンツが読めますか？  
  A: Six Nations、Premiership、URC、Top 14、Super Rugby Pacific、Rugby Championship、Autumn Nations Series に対応しています。

- Q: 支払い方法は？  
  A: クレジットカード・デビットカードに対応しています（Stripe 決済）。

### ファイル構成の変更

現状の `app/pricing/page.tsx` は `"use client"` 全体で `metadata` export ができない。
以下に分割する:

```
app/pricing/
  page.tsx          — Server Component（metadata export + データ取得）
  pricing-form.tsx  — "use client"（Stripe POST フォーム・AuthModal 制御）
```

`page.tsx` に追加する metadata:
```ts
export const metadata: Metadata = {
  title: 'プランを選ぶ | Tryline',
  description: '¥980/月で海外ラグビーの AI 日本語レビュー全文・AI チャットが読み放題。',
}
```

## 受け入れ条件

- [ ] `/pricing` の `<title>` が `プランを選ぶ | Tryline` になっている
- [ ] ヒーローセクションに Premium CTA ボタンと Secondary ボタンが表示される
- [ ] 機能比較表に 7 項目すべてが表示される
- [ ] コンテンツサンプルセクションに実際のレビューテキストが表示される
- [ ] FAQ が 3 項目表示される
- [ ] 未ログインユーザーが CTA を押すと AuthModal が表示される
- [ ] ログイン済みユーザーが CTA を押すと Stripe Checkout に遷移する
- [ ] `pnpm tsc --noEmit` と `pnpm build` が通る

## 未解決の質問

- コンテンツサンプルはどの試合を使うか（直近レビュー自動取得 or 固定 match_id 指定）
- FAQ に追加すべき Q&A があれば Owner から指示
