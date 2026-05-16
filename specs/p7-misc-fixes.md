# その他のUI修正・データ補完

## 課題1: 料金ページ大見出しの改行崩れ

### 背景

`/pricing` ページの `<h1>` が長いため、モバイルでは単語途中で改行される。
Tailwind の `text-balance` ユーティリティで自然な折り返しに修正する。

### 対象

- `app/pricing/page.tsx` — L72 付近の `<h1>`

### 変更内容

変更前:
```tsx
<h1 className="mt-4 max-w-3xl font-serif text-4xl font-bold tracking-tight sm:text-6xl">
```

変更後:
```tsx
<h1 className="mt-4 max-w-3xl text-balance font-serif text-4xl font-bold tracking-tight sm:text-6xl">
```

`text-balance` を追加するだけ。他の変更なし。

### 受け入れ条件

- [ ] 375px ビューポートで見出しテキストが自然な位置で折り返される
- [ ] デスクトップ（1280px）での表示が崩れない
- [ ] `pnpm tsc --noEmit` と `pnpm build` が通る

---

## 課題2: Premiership 2025-26 得点経過グラフのバックフィル

### 背景

`backfill-premiership-match-events.ts` スクリプトが既存で存在し、
Premiership の Wikipedia vevent HTML から得点イベントを取得・保存できる。
2025-26 シーズン分がまだ実行されていないため、得点経過グラフが表示されていない。

### 対象

- `scripts/backfill-premiership-match-events.ts`（既存スクリプト、変更不要）

### 実行手順

dry-run で対象試合数を確認してから本番実行する:

```bash
# 1. ドライラン（DB は更新しない）
pnpm tsx scripts/backfill-premiership-match-events.ts --season=2025-26 --dry-run

# 2. 本番実行
pnpm tsx scripts/backfill-premiership-match-events.ts --season=2025-26
```

スクリプトの `--season` オプションが未実装の場合は、
`--family=premiership --season=2025-26` などスクリプトの既存インターフェースに合わせること。

### 受け入れ条件

- [ ] Premiership 2025-26 の終了試合の詳細ページで得点経過グラフが表示される
- [ ] スクリプト実行後にエラーが出ていない

---

## 対応不要の項目

以下は調査の結果、対応不要と判断した。

### URC 大会ページのデフォルト展開

`getDefaultOpenGroupIndex` が「最後に完了したラウンド＋1」を開く仕様は意図的な設計。
コード変更なし。

### URC 得点経過グラフ

URC の Wikipedia は試合ごとの得点詳細を持たないテーブル形式のため、
Premiership と同様のバックフィルは不可能。データソースなし。対応なし。

### レビューを書くボタン

評価レポートに記載されていたが、コードベース内で該当する実装が見当たらなかった。
誤検知の可能性があるため、対応なし。
