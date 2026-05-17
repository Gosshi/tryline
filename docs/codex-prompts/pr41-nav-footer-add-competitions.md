# PR41: ナビゲーション・フッターへの大会リンク追加

## 背景

現在のヘッダードロップダウン（`HEADER_COMPETITIONS`）およびフッターの
`competitionLinks` には RWC・ジャパンラグビー リーグワン・Autumn Nations が含まれていない。
ユーザーがこれらの大会ページへ到達するには直接 URL を知っている必要があり、
ナビゲーションとして機能していない。

アクセス確認済みの URL:
- `/c/rwc/2023`、`/c/rwc/2027`（シーズンページ正常表示）
- `/c/league-one`（ハブページ → 最新シーズンにリダイレクト）
- `/c/autumn-nations`（ハブページ → 最新シーズンにリダイレクト）

## スコープ

対象:
- `components/competition-nav-dropdown.tsx`（`HEADER_COMPETITIONS` 配列）
- `components/site-footer.tsx`（`competitionLinks` 配列）
- `components/mobile-header-menu.tsx`（`HEADER_COMPETITIONS` を import しているため自動対応）

対象外:
- ルーティング・データベース変更
- デザイン変更

## 変更詳細

### 1. `components/competition-nav-dropdown.tsx` — `HEADER_COMPETITIONS` 追加

```typescript
// 現状（6 エントリ）
export const HEADER_COMPETITIONS = [
  { family: "six-nations", href: "/c/six-nations/2025", label: "Six Nations 2025" },
  { family: "premiership", href: "/c/premiership/2025-26", label: "Premiership 2025-26" },
  { family: "urc", href: "/c/urc/2025-26", label: "URC 2025-26" },
  { family: "top-14", href: "/c/top-14/2024-25", label: "Top 14 2024-25" },
  { family: "super-rugby-pacific", href: "/c/super-rugby-pacific/2026", label: "Super Rugby Pacific 2026" },
  { family: "rugby-championship", href: "/c/rugby-championship/2025", label: "Rugby Championship 2025" },
] as const;
```

以下 4 エントリを追加する:

```typescript
{ family: "rwc", href: "/c/rwc/2023", label: "RWC 2023" },
{ family: "rwc", href: "/c/rwc/2027", label: "RWC 2027" },
{ family: "league-one", href: "/c/league-one", label: "ジャパンラグビー リーグワン" },
{ family: "autumn-nations", href: "/c/autumn-nations", label: "Autumn Nations" },
```

**挿入位置の判断基準**: 既存エントリの後ろに追加する（アルファベット順・重要度順どちらも可）。
ただし `as const` の型が壊れないよう `family` の型チェックを確認すること。

**family の色対応確認**:
`getCompetitionFamilyColor` は `COMPETITION_FAMILY_COLORS` を参照する。
`lib/format/competition.ts` を確認すると、`"rwc"`・`"league-one"`・`"autumn-nations"` は
すでに登録済みのため追加不要。

### 2. `components/site-footer.tsx` — `competitionLinks` 追加

```typescript
// 変更前
const competitionLinks = [
  { href: "/c/six-nations", label: "Six Nations" },
  { href: "/c/premiership", label: "Premiership" },
  { href: "/c/urc", label: "URC" },
  { href: "/c/top-14", label: "Top 14" },
  { href: "/c/super-rugby-pacific", label: "Super Rugby Pacific" },
  { href: "/c/rugby-championship", label: "Rugby Championship" },
];
```

以下 3 エントリを追加する:

```typescript
{ href: "/c/rwc", label: "RWC" },
{ href: "/c/league-one", label: "ジャパンラグビー リーグワン" },
{ href: "/c/autumn-nations", label: "Autumn Nations" },
```

フッターはハブページ（シーズン未指定）で問題ない。
`/c/rwc` へのアクセスは最新シーズンにリダイレクトされる。

## 受け入れ条件

- デスクトップのヘッダー「大会」ドロップダウンに RWC 2023 / RWC 2027 / ジャパンラグビー リーグワン / Autumn Nations が表示される
- モバイルメニューの「大会」アコーディオンに同じエントリが表示される（`HEADER_COMPETITIONS` を共有しているため自動）
- フッターの「大会」セクションに RWC / ジャパンラグビー リーグワン / Autumn Nations が追加される
- 各リンクをクリックすると対応するページに遷移できる
- 各エントリのサイドボーダーに大会カラーが表示される（`getCompetitionFamilyColor` が正しい色を返す）
- `pnpm build` でエラーなし

## 未解決の質問

なし。
