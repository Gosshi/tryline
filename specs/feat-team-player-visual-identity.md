# チーム・選手ページに視覚要素を追加する

## 背景

サイト全体の画像・ビジュアル監査（tryline-site-auditorエージェント、2026-07-07）で判明。チームページ（`/teams/[slug]`）・選手ページ（`/players/[slug]`）は視覚要素が実質ゼロで、`TeamBadge`（国旗SVGまたは絵文字、`components/team-badge.tsx`）以外に画像・色分け・アイコンが存在しない。選手一覧は同じ白背景の角丸ボックスが名前だけ変えて並ぶため、「データベースの生テーブル」に近い無機質な印象になっている。

AI生成画像は使わない。既存の `getTeamColor`（`lib/format/team-identity.ts`）と `getPositionGroup`（`lib/utils/rugby-positions.ts`）という**既存のデータ**だけで視覚的差別化ができるため、新規アセット生成・Owner側の作業待ちなしにCodexだけで完結できる。これは大会ロゴ（`public/logos/*.svg`）が公式エンブレムでなく自作の簡易バッジである、という既存の方針を踏襲する。

**既知の制約**: `getTeamColor` は国代表チーム（`argentina`・`japan`等）のみに固有色を持ち、クラブチーム（Leinster・Toulouse等のURC/Top14/Premiership勢）には未登録でフォールバック色 `#94a3b8`（グレー）を返す（`lib/format/team-identity.ts:240-242` で確認済み）。したがってクラブチームのページでは背景が単色グレーになる。これは新しいバグではなく、`match-card.tsx` 等が既に同じ関数を使っている既存の仕様であり、本specで解消はしない。

## スコープ

対象:
- `app/teams/[slug]/page.tsx:99-117`（チームページのヘッダーセクション）に、`getTeamColor(data.team.slug)` を使ったカラーウォッシュ背景を追加する
- `components/team-players-section.tsx`（選手一覧グリッド）の各選手リンクに、`getPositionGroup(player.position)` で色分けした汎用シルエットアイコンを追加する
- `app/players/[slug]/page.tsx:103-135`（選手ページのプロフィール見出し）に同じシルエットアイコンを追加する
- 新規共有コンポーネント `components/player-avatar.tsx`（汎用シルエットSVG、position groupに応じて色を変える）

対象外:
- AI生成画像・写真素材の導入（本specでは使わない）
- 選手の実際の顔写真・実在ユニフォームの表現
- チームページ・選手ページのレイアウト全体の刷新（既存の白カード構造は維持し、色とアイコンだけ足す）
- クラブチームのグレーフォールバックを解消する専用配色マップの新規作成

## データモデル変更

なし

## API サーフェス

なし

## UI サーフェス

### 新規: `components/player-avatar.tsx`

`public/logos/*.svg` と同じ「自作のシンプルなバッジ」路線で、円形フレーム内に汎用の人型シルエットを描く。ポジショングループで色分け（FW = `var(--color-ink)` / BK = `var(--color-accent)` / unknown = `var(--color-ink-muted)`）。

```tsx
import { getPositionGroup } from "@/lib/utils/rugby-positions";

const GROUP_COLOR: Record<ReturnType<typeof getPositionGroup>, string> = {
  bk: "var(--color-accent)",
  fw: "var(--color-ink)",
  unknown: "var(--color-ink-muted)",
};

type PlayerAvatarProps = {
  position: string | null;
  size?: number;
};

export function PlayerAvatar({ position, size = 40 }: PlayerAvatarProps) {
  const group = getPositionGroup(position);
  const color = GROUP_COLOR[group];

  return (
    <svg
      aria-hidden
      height={size}
      viewBox="0 0 40 40"
      width={size}
    >
      <circle cx="20" cy="20" fill={color} r="20" />
      <circle cx="20" cy="15" fill="#fff" fillOpacity="0.9" r="6" />
      <path
        d="M8 34c0-8 5.4-13 12-13s12 5 12 13"
        fill="#fff"
        fillOpacity="0.9"
      />
    </svg>
  );
}
```

（座標・形状の細部はCodexの裁量でよい。「顔の特徴を描かない・正面を向いた抽象的な人型」という条件だけ守ること。既存のアイコンコンポーネント命名規則 `components/icons/` を使うかどうかも既存パターンに合わせて判断してよい。）

### `app/teams/[slug]/page.tsx` ヘッダー

既存の `<section className="rounded-xl border border-slate-200 bg-white p-5 ...">` に、`getTeamColor` を使った控えめな背景ウォッシュを追加する。

```diff
+ import { getTeamColor } from "@/lib/format/team-identity";
  ...
  <section
-   className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/50 sm:p-6"
+   className="relative overflow-hidden rounded-xl border border-slate-200 p-5 shadow-sm shadow-slate-200/50 sm:p-6"
+   style={{
+     background: `linear-gradient(135deg, color-mix(in srgb, ${getTeamColor(data.team.slug)} 12%, #fff), #fff 70%)`,
+   }}
  >
```

### `components/team-players-section.tsx` 選手一覧

各選手 `<Link>` の先頭に `<PlayerAvatar position={player.position} size={32} />` を追加し、名前と横並びにする。

### `app/players/[slug]/page.tsx` プロフィール見出し

`<h1>` の左に `<PlayerAvatar position={player.position} size={48} />` を配置する。

## LLM 連携

なし

## 受け入れ条件

1. チームページのヘッダーに、そのチームの `getTeamColor` に応じた色のグラデーション背景が表示される（クラブチーム等フォールバック色の場合は薄いグレーの背景になり、崩れないこと）
2. 選手一覧グリッドの各項目に、ポジショングループに応じて色分けされたシルエットアイコンが表示される（FW/BK/不明で見た目が変わる）
3. 選手ページのプロフィール見出しに同じシルエットアイコンが表示される
4. アイコンに実在選手を示唆する要素（顔の特徴・実ユニフォーム柄）が一切ない
5. 既存のパンくず・スタッツパネル・試合一覧など他のセクションに regression がない
6. `pnpm tsc --noEmit` / `pnpm lint` / `pnpm build` clean

## 未解決の質問

なし。
