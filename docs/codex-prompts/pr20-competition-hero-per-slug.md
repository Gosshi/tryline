# feat: 大会ハブページの固有ヒーロー写真（slug 別）

## 目的

現在、全大会ハブページ（Six Nations、Super Rugby Pacific、URC 等）が同一の Unsplash 写真を表示している。
大会スラグに対応した固有写真を設定し、各大会の臨場感・個性を出す。

**必ず `design.md` を最初に読んでから実装すること。**

---

## 変更ファイル

- `app/c/[competition]/page.tsx` のみ

---

## タスク: slug ごとの写真 URL マップを追加

### 写真 URL マップ

`app/c/[competition]/page.tsx` に以下の定数を追加する。
Unsplash の写真は商用利用可・帰属表示不要のライセンス。

```typescript
const COMPETITION_HERO_IMAGES: Record<string, string> = {
  "six-nations":
    "https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=1200&q=80",
  "premiership":
    "https://images.unsplash.com/photo-1516026672322-bc52d61a55d5?w=1200&q=80",
  "urc":
    "https://images.unsplash.com/photo-1508098682722-e99c43a406b2?w=1200&q=80",
  "top-14":
    "https://images.unsplash.com/photo-1575361204480-aadea25e6e68?w=1200&q=80",
  "super-rugby-pacific":
    "https://images.unsplash.com/photo-1504450758481-7338eba7524a?w=1200&q=80",
  "rugby-championship":
    "https://images.unsplash.com/photo-1560272564-c83b66b1ad12?w=1200&q=80",
};

const DEFAULT_COMPETITION_HERO =
  "https://images.unsplash.com/photo-1767190937750-d6aaf8ea99d0?w=1200&q=80";
```

### 既存の写真バナーコンポーネントを修正

既存の `<Image>` に渡している `src` をマップから引くよう変更する。

```typescript
// 変更前（ハードコードされた単一 URL）
src="https://images.unsplash.com/photo-1767190937750-d6aaf8ea99d0?w=1200&q=80"

// 変更後
src={COMPETITION_HERO_IMAGES[competition] ?? DEFAULT_COMPETITION_HERO}
```

`competition` は既存のルートパラメータ（`params.competition`）を使う。

---

## 変更しないこと

- シーズン一覧のリスト
- ナビゲーション・パンくず
- フォント・レイアウト
- 写真のオーバーレイグラデーション・テキスト配置

---

## 完了条件

- [ ] `/c/six-nations` で Six Nations に合う写真が表示される
- [ ] `/c/super-rugby-pacific` でラグビー（南半球系）の写真が表示される
- [ ] マップにないスラグはデフォルト写真にフォールバックする
- [ ] `pnpm tsc --noEmit` パス
- [ ] `pnpm build` パス
