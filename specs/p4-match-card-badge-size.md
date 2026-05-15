# 試合カードのチームバッジサイズ統一

## 背景

`components/match-card.tsx` でのチームバッジは `size={20}` (20px) で表示されている。
Six Nations のようにインラインSVG国旗を持つチームは 20px でも視認性が高いが、
SRP のようにシールドバッジ（SVGフォールバック）や絵文字フラグを使うチームは
20px だと小さく識別しにくい。
サイズを `size={28}` に統一することで、全大会で同水準の視認性を確保する。

## スコープ

対象:
- `components/match-card.tsx` — TeamBadge の size を 20 → 28 に変更

対象外:
- `components/match-header.tsx`（既に size=28 のため変更不要）
- `components/team-badge.tsx`（サイズのスケール動作は変更なし）

## 変更内容

`match-card.tsx` の TeamBadge 呼び出し箇所（2箇所）を変更する:

```tsx
// 変更前
<TeamBadge shortCode={match.homeTeam.shortCode} size={20} slug={match.homeTeam.slug} />
<TeamBadge shortCode={match.awayTeam.shortCode} size={20} slug={match.awayTeam.slug} />

// 変更後
<TeamBadge shortCode={match.homeTeam.shortCode} size={28} slug={match.homeTeam.slug} />
<TeamBadge shortCode={match.awayTeam.shortCode} size={28} slug={match.awayTeam.slug} />
```

バッジのサイズ変更によりカードの高さが若干増すが、
既存のレイアウト（`grid-cols-[1fr_auto_1fr]`）は変更不要。
デザイン上問題がある場合は Codex が周辺のパディング・gap を微調整してよい。

## 変更ファイル

- `components/match-card.tsx`

## 受け入れ条件

- [ ] 全大会（Six Nations・Premiership・URC・SRP 等）の試合カードでバッジサイズが 28px になる
- [ ] モバイル（375px）でレイアウトが崩れない
- [ ] デスクトップでレイアウトが崩れない
- [ ] `pnpm tsc --noEmit` と `pnpm build` が通る
