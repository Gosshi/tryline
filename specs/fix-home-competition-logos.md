# ホームページ: 大会リストに大会ロゴ・カラーを追加する

## 背景

ホームページの大会リスト（`/c/[competition]` へのリンク一覧）は
現在プレーンなテキストのみで、大会ブランド（ロゴ・カラー）が全く活かされていない。

Six Nations・Premiership・URC などは認知度の高いビジュアルブランドを持っており、
リストにロゴを追加するだけでページの情報密度と回遊意欲が大幅に上がる。

関連仕様: `p3-competition-color-accent.md`（シーズンページのヘッダーカラー対応）

## スコープ

対象:
- `app/page.tsx` — 大会リスト表示部分に画像追加
- `public/logos/` — 各大会のロゴ画像ファイルを配置

対象外:
- 大会ページ（`/c/[competition]`）のヘッダー（`p3-competition-color-accent.md` が対象）
- ロゴの権利取得（SVG または PNG を Owner が準備する）

## データモデル変更

なし

## API サーフェス

なし

## UI サーフェス

### 大会リストカードのデザイン変更

```tsx
// 変更前: テキストのみ
<a href={`/c/${comp.family}`}>{comp.name}</a>

// 変更後: ロゴ + テキスト
<a href={`/c/${comp.family}`} className="flex items-center gap-3 p-3 rounded-lg border hover:bg-slate-50">
  <img
    src={`/logos/${comp.family}.png`}
    alt=""
    width={40}
    height={40}
    className="object-contain"
    onError={(e) => { e.currentTarget.src = "/logos/default-competition.png"; }}
  />
  <span className="font-medium">{comp.name}</span>
</a>
```

### ロゴファイル配置規則

```
public/logos/
  six-nations.png
  premiership.png
  urc.png
  top-14.png
  super-rugby-pacific.png
  rugby-championship.png
  rwc.png
  autumn-nations.png
  pnc.png
  league-one.png
  default-competition.png   ← フォールバック用
```

## LLM 連携

なし

## 受け入れ条件

1. ホームページの大会リストに各大会のロゴ画像が表示される
2. ロゴファイルが存在しない大会でフォールバック画像が表示される
3. モバイル（375px）でロゴが見切れない
4. `tsc --noEmit` でビルドエラーなし

## 未解決の質問

- ロゴ画像（PNG / SVG）は Owner が各大会の公式リソースから準備すること
- `next/image` を使う場合の `domains` 設定は Codex が判断すること