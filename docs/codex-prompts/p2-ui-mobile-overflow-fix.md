# Codex Prompt: モバイル overflow 修正 + UI 細部改善（一括）

## 前提

`p2-match-card-redesign.md`、`p2-ui-*` シリーズが完了済み。
デザイントークン（`--color-ink`、`--color-ink-muted`、`--color-rule`、`--color-accent`）が利用可能。

---

## 背景

Vercel 本番で以下の問題が確認された。モバイルで情報が欠落するバグを最優先で修正し、
あわせて空状態と詳細ページナビゲーションの UX を改善する。

---

## 変更対象ファイル

- `components/match-events-section.tsx`
- `components/match-card.tsx`
- `components/standings-table.tsx`
- `components/content-placeholder.tsx`
- `app/matches/[id]/page.tsx`

---

## Task 1 — `components/match-events-section.tsx`：得点タイムラインの選手名 overflow 修正

### 問題

`grid-cols-[1fr_3rem_1fr]` のレイアウトでモバイルの 1fr 列が狭くなりすぎ、
`truncate` が「Attissogbé ト…」のように核心情報を切り捨てる。

### 修正

1. 中央タイム列を `3rem` → `2.5rem` に縮小して左右に少し幅を確保
2. 選手名のフォントサイズを `text-sm` → `text-xs sm:text-sm` に変更
3. `truncate` を維持しつつ `title={label}` を追加（ツールチップで全文表示）

**ヘッダー行（チーム名）**:

```tsx
<div className="mb-2 grid grid-cols-[1fr_2.5rem_1fr] gap-2 text-xs font-semibold text-slate-500">
```

**イベント行**:

```tsx
<div
  className="grid grid-cols-[1fr_2.5rem_1fr] items-center gap-2 rounded py-1.5 hover:bg-slate-50/80"
  key={event.id}
  style={...}
>
  <span
    className="min-w-0 truncate text-xs text-[var(--color-ink)] sm:text-sm"
    title={isHome ? label : ""}
  >
    {isHome ? label : ""}
  </span>
  <span className="text-center text-xs font-semibold tabular-nums text-[var(--color-ink-muted)]">
    {event.minute !== null ? `${event.minute}'` : "—"}
  </span>
  <span
    className="min-w-0 truncate text-right text-xs text-[var(--color-ink)] sm:text-sm"
    title={!isHome ? label : ""}
  >
    {!isHome ? label : ""}
  </span>
</div>
```

---

## Task 2 — `components/match-card.tsx`：会場名の overflow 修正

### 問題

会場名 `<p>` に `truncate` がなく、長い会場名（例: "Stade de France, Saint-Denis"）が
折り返してカード高さが崩れる。

### 修正

```tsx
{match.venue && (
  <p className="mt-4 truncate text-xs text-slate-400" title={match.venue}>
    {match.venue}
  </p>
)}
```

---

## Task 3 — `components/standings-table.tsx`：モバイルで列を間引く

### 問題

全 9 列がモバイル幅に収まらず、W/D/L/得点 列が潰れて読めない。

### 修正

情報優先度が低い列をモバイルで非表示にする。
`hidden sm:table-cell` を対象列の `<th>` と `<td>` の**両方**に追加する。

対象列:

| 列 | ヘッダーテキスト | 追加するクラス |
|---|---|---|
| 分（drawn） | 分 | `hidden sm:table-cell` |
| 得点（pointsFor-pointsAgainst） | 得点 | `hidden sm:table-cell` |
| T（triesFor） | T | `hidden sm:table-cell` |

変更後のモバイル表示列: `# / チーム / 試 / 勝 / 敗 / 勝点` の 6 列。

---

## Task 4 — `components/content-placeholder.tsx`：空状態を情報豊かに

### 問題

絵文字 + 1 行テキストのみで「プロダクトが動いている感」がない。

### 変更前

```tsx
<div className="flex items-start gap-3 rounded-lg bg-slate-50 px-4 py-4">
  <span aria-hidden className="mt-0.5 shrink-0 text-lg leading-none" role="img">
    {ICON[state]}
  </span>
  <p className="text-sm text-slate-500">{COPY[type][state]}</p>
</div>
```

### 変更後

```tsx
<div className="rounded-lg border border-slate-100 bg-slate-50 px-5 py-5">
  <div className="flex items-center gap-2">
    <span aria-hidden className="shrink-0 text-base leading-none" role="img">
      {ICON[state]}
    </span>
    <p className="text-sm font-medium text-[var(--color-ink)]">
      {COPY[type][state]}
    </p>
  </div>
  {state !== "unavailable" && (
    <p className="mt-2 text-xs text-[var(--color-ink-muted)]">
      コンテンツは自動生成されます。しばらくお待ちください。
    </p>
  )}
</div>
```

---

## Task 5 — `app/matches/[id]/page.tsx`：戻りリンクをパンくずに変更

### 問題

「← 一覧に戻る」が `/` に飛ぶだけで、どのシーズンから来たか文脈が失われる。

### 修正

`match.competition.slug`（例: `"six-nations-2025"`）から family と season を分解して
シーズンページへのパンくずを構築する。

### 変更前

```tsx
<Link
  className="inline-flex w-fit items-center gap-1 text-sm font-medium text-slate-500 transition-colors hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
  href="/"
>
  ← 一覧に戻る
</Link>
```

### 変更後

```tsx
{(() => {
  const slugMatch = match.competition.slug.match(/^(.+)-(\d{4})$/);
  const family = slugMatch?.[1] ?? "";
  const season = slugMatch?.[2] ?? "";
  const seasonHref = family && season ? `/c/${family}/${season}` : "/";
  return (
    <nav aria-label="パンくずリスト">
      <ol className="flex flex-wrap items-center gap-1 text-sm text-[var(--color-ink-muted)]">
        <li>
          <Link
            className="transition-colors hover:text-[var(--color-ink)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
            href={seasonHref}
          >
            {match.competition.name} {match.competition.season}
          </Link>
        </li>
        {match.round !== null && (
          <>
            <li aria-hidden className="select-none">/</li>
            <li className="text-[var(--color-ink)]">Round {match.round}</li>
          </>
        )}
      </ol>
    </nav>
  );
})()}
```

---

## 完了条件

- [ ] スコアタイムラインの得点者名が 375px 幅でも読める（全文または `title` 属性で確認可能）
- [ ] 試合カードの会場名が 1 行で収まる（長い名前は `truncate`）
- [ ] standings テーブルがモバイルで 6 列（# / チーム / 試 / 勝 / 敗 / 勝点）表示になる
- [ ] content-placeholder の空状態にサブテキスト「コンテンツは自動生成されます」が出る
- [ ] 試合詳細ページのナビゲーションが「Six Nations 2025 / Round 1」のパンくず形式になる
- [ ] `pnpm tsc --noEmit` がパスする
- [ ] `pnpm build` が成功する

## 変更しないこと

- コンポーネントのレイアウト構造
- データ取得ロジック（`getMatchById` 等）
- `app/globals.css`、`tailwind.config.ts`
- `components/match-header.tsx`
- `components/match-lineups-section.tsx`
