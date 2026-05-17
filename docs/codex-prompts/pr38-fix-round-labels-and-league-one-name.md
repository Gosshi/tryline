# PR38: RWC ラウンド名の修正 + ジャパンラグビー リーグワン表示名変更

## 背景

2つの表示上の問題を同時に修正する。

1. RWC 2023 の決勝トーナメントが「第5節」〜「第8節」と表示されている。
   正しくは 準々決勝・準決勝・3位決定戦・決勝 と表示すべき。
2. 「League One」という英語表記をナビゲーション・パンくず・試合カードヘッダー・
   ページタイトルすべてで「ジャパンラグビー リーグワン」に変更したい。
   URL スラグ（`league-one`）は変更しない。

## スコープ

対象:
- `lib/format/round-label.ts`
- `lib/format/competition.ts`
- `components/round-heading.tsx`
- `components/match-header.tsx`
- `app/matches/[id]/page.tsx`（`formatRoundLabel` 呼び出し箇所）
- `app/c/[competition]/[season]/page.tsx` および `SeasonMatchGroups` コンポーネント（family を round-heading に渡せているか確認）

対象外:
- データベースのスキーマ変更
- URL・スラグの変更
- 他競技のラウンド名変更

## 変更詳細

### 1. `lib/format/round-label.ts`

`formatRoundLabel` に省略可能な `family` 引数を追加する。
`family === 'rwc'` のとき、ラウンド番号を以下にマッピングする。

| round | 表示 |
|-------|------|
| 5     | 準々決勝 |
| 6     | 準決勝 |
| 7     | 3位決定戦 |
| 8     | 決勝 |

それ以外の round は従来どおり `第N節`。
他の family では従来の動作を維持する（後方互換性あり）。

```typescript
// 変更後のシグネチャ
export function formatRoundLabel(round: number, family?: string): string
```

### 2. `lib/format/competition.ts`

`FAMILY_DISPLAY_NAMES` の `"league-one"` エントリを変更する。

```typescript
// 変更前
"league-one": "League One",

// 変更後
"league-one": "ジャパンラグビー リーグワン",
```

### 3. 呼び出し元の更新

`formatRoundLabel` を呼んでいる 3 箇所すべてに `family` を追加で渡す。

**`components/round-heading.tsx`**:
- `RoundHeadingProps` に `family?: string` を追加
- `formatRoundLabel(groupKey.round)` → `formatRoundLabel(groupKey.round, family)`

**`components/match-header.tsx`**:
- `formatRoundLabel(match.round)` → `formatRoundLabel(match.round, match.competition.family)`

**`app/matches/[id]/page.tsx`**:
- `formatRoundLabel(match.round)` → `formatRoundLabel(match.round, match.competition.family)`

**`SeasonMatchGroups` コンポーネント → `RoundHeading` への伝播**:
- `SeasonMatchGroups` が `family` prop を受け取り、`RoundHeading` に渡せるよう
  インターフェースを確認・更新すること。
  `app/c/[competition]/[season]/page.tsx` で `family` を渡す。

## 受け入れ条件

- `https://tryline-six.vercel.app/c/rwc/2023` を開くと、決勝トーナメントのセクション見出しが
  「準々決勝」「準決勝」「3位決定戦」「決勝」と表示される
- `https://tryline-six.vercel.app/matches/d31077ee-92c6-480e-bbef-87f955e6bc1d`（RWC 2023 決勝）を開くと
  パンくずと試合カードヘッダーに「決勝」と表示される
- Six Nations・Premiership 等の「第N節」表記は変わらない
- League One を含むすべてのページ（ナビ・パンくず・試合カードヘッダー・`<title>`）で
  「ジャパンラグビー リーグワン」と表示される
- `league-one` という URL スラグを含むいかなる URL も変わらない
- `pnpm build` でエラーなし

## 未解決の質問

なし。
