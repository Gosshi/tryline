# fix: 大会ハブページのヒーロー写真を修正（rugby-championship / super-rugby-pacific / urc）

## 問題

`app/c/[competition]/page.tsx` の `COMPETITION_HERO_IMAGES` に定義されている以下3件の写真が壊れている。

| slug | 現状 |
|------|------|
| `rugby-championship` | サッカー写真が表示される |
| `super-rugby-pacific` | 意味不明な画像（夜間で視認不可） |
| `urc` | リンク切れ（画像が表示されない） |

---

## 修正内容

`app/c/[competition]/page.tsx` の `COMPETITION_HERO_IMAGES` 定数を以下の通り更新する。**3行のみ変更。他は触らない。**

```typescript
// 変更前
"urc":
  "https://images.unsplash.com/photo-1508098682722-e99c43a406b2?w=1200&q=80",
"super-rugby-pacific":
  "https://images.unsplash.com/photo-1759760300494-7378d88180f9?w=1200&q=80",
"rugby-championship":
  "https://images.unsplash.com/photo-1560272564-c83b66b1ad12?w=1200&q=80",

// 変更後
"urc":
  "https://images.unsplash.com/photo-1480099225005-2513c8947aec?w=1200&q=80",
"super-rugby-pacific":
  "https://images.unsplash.com/photo-1595432973730-d07ba6b406c2?w=1200&q=80",
"rugby-championship":
  "https://images.unsplash.com/photo-1570878786170-0723365bdf35?w=1200&q=80",
```

**写真の内容（Unsplash で確認済み・商用利用可・帰属表示不要）:**
- `urc` (`photo-1480099225005-2513c8947aec`): ラグビーマッチ、選手が密集してプレー中
- `super-rugby-pacific` (`photo-1595432973730-d07ba6b406c2`): ラグビーマッチ、昼間・芝生フィールド
- `rugby-championship` (`photo-1570878786170-0723365bdf35`): ラグビーマッチ、霧の雰囲気

---

## 変更しないこと

- `six-nations`、`premiership`、`top-14`、`DEFAULT_COMPETITION_HERO` の URL
- その他のコンポーネント・ロジック

---

## 完了条件

- [ ] `/c/urc` でラグビー写真が表示される
- [ ] `/c/super-rugby-pacific` でラグビー写真が表示される
- [ ] `/c/rugby-championship` でラグビー写真が表示される
- [ ] `pnpm tsc --noEmit` パス
- [ ] `pnpm build` パス
