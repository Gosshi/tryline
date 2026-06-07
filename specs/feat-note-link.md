# サイトに note リンクを追加

## 背景

Tryline の note（週末まとめ等の編集コンテンツを掲載）への導線がサイト上に無い。既存の X (Twitter) フォローリンクと並べて note アカウント（https://note.com/tryline_rugbyjp）へのリンクを常設し、note チャネルの認知・フォロワーを育てる。

> 補足（方針）: 集客の本命は note→サイト（[[project_growth_strategy]]）。サイト→note は外部送客になるため、あくまで X と同列の「フォロー導線」の追加に留める（大きく目立たせない）。

## スコープ

対象:
- 既存の **X リンクが置かれている全箇所**に、同じ作りで note リンクを隣接追加する
  - `components/site-header.tsx`（アイコンのみ）
  - `components/mobile-header-menu.tsx`（アイコン＋ハンドル）
  - `components/site-footer.tsx`（「フォロー」節、アイコン＋表示名）
  - `components/match-content.tsx`（「フォローする」CTA 付近）
- note 用アイコン `NoteIcon` を新規追加（`components/icons/note-icon.tsx`、`XIcon`(`components/icons/x-icon.tsx`) と同じ `{ className }` シグネチャ）

対象外:
- note 記事一覧の取り込み/RSS 表示（将来）
- トップへの大きな note セクション（今回は導線リンクのみ）

## データモデル変更
なし。

## API サーフェス
なし。

## UI サーフェス

- リンク先: `https://note.com/tryline_rugbyjp`、`target="_blank"` `rel="noopener noreferrer"`、`aria-label="note @tryline_rugbyjp"`
- 各箇所で**既存の X リンクのスタイル/構造をミラー**して note リンクを隣に置く（X の右隣を基本）
- `NoteIcon`: **note 公式ロゴ（小文字 note のワードマーク）を SVG で実装**（決定事項）。`XIcon` と同じ `{ className }` を受け、サイズは並ぶ X アイコンに合わせる（header h-4、footer/mobile は該当箇所の XIcon サイズに合わせる）。`currentColor` でテーマ色に追従させる。

## LLM 連携
なし。

## 受け入れ条件

- ヘッダー（PC）・モバイルメニュー・フッター・match-content の4箇所で、X リンクの隣に note リンクが表示される
- note リンクが `https://note.com/tryline_rugbyjp` を新規タブで開く（rel 設定済み）
- `aria-label` 付与・キーボードフォーカス可（既存 X リンクと同等の a11y）
- `NoteIcon`（公式ロゴ SVG）が追加され、各所でサイズ・色が周囲と調和
- 既存のヘッダー/フッターのテスト（`tests/components/site-header.test.tsx`, `tests/components/mobile-header-menu.test.tsx` 等）が緑、note リンクの存在アサートを追加
- `pnpm tsc --noEmit` / `pnpm lint` / `pnpm build` clean

## 決定事項
- `NoteIcon` は **note 公式ロゴ**を使用（テキストバッジ不可）。自社アカウントへの導線でありロゴ使用上の問題なし。
