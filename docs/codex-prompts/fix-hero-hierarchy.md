# Codex Prompt: ヒーロービジュアル階層の修正

## 背景

UI 監査で「ホームページのヒーローは "Six Nations 2025"（競技名）が最も大きく見え、サービス名・価値訴求が埋もれている」と指摘された。初回訪問者に "Tryline = AI ラグビー分析サービス" と伝わるよう、視覚的な重み付けを逆転させる。

---

## 変更対象

`app/page.tsx` のヒーローセクションのみ。

## 現状

```tsx
<section className="border-b border-slate-200 bg-white py-12 sm:py-16">
  <div className="mx-auto max-w-6xl px-4 sm:px-6 md:px-8">
    <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-emerald-600">
      AI Rugby Analysis in Japanese
    </p>
    <h1 className="text-4xl font-bold tracking-tight text-slate-950 sm:text-5xl">
      海外ラグビーを、日本語で深掘り。
    </h1>
    <p className="mt-4 max-w-xl text-base text-slate-600">
      Six Nations をはじめとする世界のラグビーリーグを、AI
      が生成した日本語プレビュー・レビューと試合チャットで楽しめます。
    </p>
  </div>
</section>
```

競技名見出し `<h2>` は `text-4xl sm:text-5xl` で、ヒーローの `<h1>` と同じサイズになっている。

## 変更内容

### 1. ヒーロー `<h1>` を大きくする

`text-4xl sm:text-5xl` → `text-5xl sm:text-6xl` に変更し、ヒーロー見出しを競技名より明確に大きくする。

```tsx
<h1 className="text-5xl font-bold tracking-tight text-slate-950 sm:text-6xl">
  海外ラグビーを、日本語で深掘り。
</h1>
```

### 2. eyebrow ラベルを少し大きくする

`text-xs` → `text-sm` に変更して可読性を上げる。

```tsx
<p className="mb-3 text-sm font-semibold uppercase tracking-widest text-emerald-600">
  AI Rugby Analysis in Japanese
</p>
```

### 3. 競技名見出し `<h2>` を小さくする

現在 `text-4xl sm:text-5xl` の `<h2>` を `text-2xl sm:text-3xl` に変更し、ヒーローより明確に下位に見せる。

```tsx
<h2 className="text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">
  {formatCompetitionTitle(competition.name, competition.season)}
</h2>
```

## 完了条件

- [ ] ヒーロー `<h1>` がページ内で最も大きいテキストになっている
- [ ] 競技名 `<h2>` がヒーロー `<h1>` より小さい
- [ ] eyebrow ラベルが `text-sm` で読みやすい
- [ ] モバイル 375px・デスクトップ 1440px 両方でレイアウトが崩れない
- [ ] `pnpm tsc --noEmit` がパスする

## 変更しないこと

- ヒーローセクションの構造・色・余白
- `<h2>` の内容（`formatCompetitionTitle` の出力）
- 競技名下の日付テキスト
- 試合グリッド・順位表以降の要素
