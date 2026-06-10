# Codex プロンプト: note リンク追加

仕様: `specs/feat-note-link.md` を参照（内容はインライン展開しない）。

## タスク

サイト全体の X リンクが置かれている箇所に、同じ作りで note リンクを隣接追加する。
新規アイコンコンポーネント 1 件 + 既存コンポーネント 4 件の修正。

## 変更ファイルと内容

### 1) `components/icons/note-icon.tsx`（新規作成）

`components/icons/x-icon.tsx` と同じ `{ className?: string }` シグネチャで `NoteIcon` を実装する。
note の公式ロゴ SVG（黒背景なし・アウトラインのみ）を使用。

### 2) `components/site-header.tsx`

X アイコンリンクの隣に note リンクを追加する（アイコンのみ表示）。

```tsx
<a
  href="https://note.com/tryline_rugbyjp"
  target="_blank"
  rel="noopener noreferrer"
  aria-label="note"
>
  <NoteIcon className="..." />
</a>
```

既存 X リンクの className をそのまま踏襲する。

### 3) `components/mobile-header-menu.tsx`

X リンクの隣に note リンクを追加する（アイコン＋ハンドル `@tryline_rugbyjp` を表示）。

### 4) `components/site-footer.tsx`

「フォロー」節の X リンク隣に note リンクを追加する（アイコン＋表示名 `note`）。

### 5) `components/match-content.tsx`

「フォローする」CTA 付近の X リンク隣に note リンクを追加する。

## 受け入れ条件（完了の定義）

- `pnpm build` 相当のビルド・TypeScript エラーなし。
- `NoteIcon` コンポーネントが `{ className?: string }` を受け取りレンダリングできる。
- 上記 4 箇所すべてに `https://note.com/tryline_rugbyjp` へのリンクが追加されている。
- 既存の X リンクを変更・削除していない。

## エッジケース・注意事項

- note の SVG は `viewBox` を保持し、`fill="currentColor"` で色が継承されるようにする。
- `aria-label="note"` を付与して a11y を確保する。
- `target="_blank"` には必ず `rel="noopener noreferrer"` を付ける。

## 参考パターン

- `components/icons/x-icon.tsx` を NoteIcon の雛形として使う。
- 各コンポーネントで X リンクを grep し、note リンクをその直後（または直前）に挿入する。
