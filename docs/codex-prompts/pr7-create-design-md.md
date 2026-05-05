# chore: Tryline の design.md を作成する

## 目的

`github.com/google-labs-code/design.md` のフォーマット仕様に従い、
プロジェクトルートに `design.md` を作成する。
以降の Codex プロンプトはすべて「`design.md` を参照すること」の一文で
デザイン判断を統一できるようにする。

ビジュアル方針: **Apple インスパイア** — 余白の寛さ、強いタイポグラフィ階層、
プレミアム感のある中立パレット。ただし Tryline 固有のスポーツ・ラグビー文脈に適応する。

## 参照すべきファイル

- `app/globals.css` — 現在の CSS カスタムプロパティとフォント設定
- `tailwind.config.ts` — 現在の Tailwind トークン設定
- `components/match-header.tsx` — スコア表示のタイポグラフィ確認
- `components/match-card.tsx` — カードのデザインパターン確認

## フォーマット仕様

`github.com/google-labs-code/design.md` の README を読み、最新の仕様に従うこと。
YAML フロントマターにトークンを機械可読な形式で定義し、
Markdown 本文に設計意図を人間向けに記述する。

## 出力ファイル

プロジェクトルート（`package.json` と同じ階層）に `design.md` を作成する。

## YAML フロントマターに含めるべきトークン

既存の CSS カスタムプロパティ・Tailwind 設定と必ず一致させること。

**colors** — `app/globals.css` の Tryline design tokens から抽出:
- `paper`: `oklch(98.5% 0.005 95)` （--color-paper）
- `ink`: `oklch(18% 0.02 260)` （--color-ink）
- `ink-muted`: `oklch(45% 0.02 260)` （--color-ink-muted）
- `rule`: `oklch(90% 0.01 260)` （--color-rule）
- `accent`: `oklch(58% 0.18 145)` （--color-accent、グリーン）
- `surface`: `#ffffff`
- `surface-raised`: `#f8fafc` （slate-50）

**typography**:
- body: Hiragino Sans / Noto Sans JP / -apple-system、size 1rem、line-height 1.9（日本語長文用）
- heading: Noto Serif JP / Fraunces / Georgia serif、weight 700
- display: Fraunces serif、weight 900、tabular-nums（スコア数字用）
- caption: 0.75rem、weight 600、letter-spacing 0.18em、uppercase

**spacing**: 8px グリッドベース（4 / 8 / 12 / 16 / 24 / 32 / 40 / 48 / 64px）

**radius**:
- sm: 0.5rem（バッジ・タグ）
- md: 0.75rem（カード、--radius と一致）
- lg: 1rem（セクション）
- full: 9999px（ピル）

**shadows**:
- card: 薄いドロップシャドウ（hover で強調）
- none

**components**: card / badge / section-label の基本トークン

## Markdown 本文に記述すべき設計意図

以下のセクションを含めること:

### ブランドポジション
日本のラグビーファン向け。DAZN / J SPORTS 加入者が試合後に日本語分析を読む。
「スポーツメディアのエネルギー × 良質な読み物の知的さ」を両立。

### ビジュアル原則（Apple インスパイア）
1. 余白を惜しまない（breathing room）
2. タイポグラフィが主役（スケールと太さの対比でヒエラルキー）
3. 色は機能的に（アクセントは CTA とデータラベルのみ）
4. サーフェスは静かに（白・淡グレー基調、チームカラーで個性）
5. インタラクションは繊細に（hover = translate + shadow）

### スポーツ文脈での適応
- スコア: display フォント、tabular-nums、4xl 以上
- チームカラー: カードのストライプとグラデーションのみ。テキストには使わない
- 日本語長文: line-height 1.9 以上、モバイルでも font-size 1rem 以上

### コンポーネントパターン
- カード: 白地、1px rule ボーダー、hover で -translate-y-0.5 + shadow 強調
- セクションラベル: uppercase、tracking 広め、ink-muted、xs サイズ
- アクセント線: 見出し左に 2px accent カラーボーダー
- ヒーロー: ink 背景（ほぼ黒）、白テキスト、グリッドパターン

### アクセシビリティ
- ink on paper: 15:1 以上
- ink-muted on surface: 4.5:1 以上（WCAG AA）
- フォーカスリング: ring-2 ring-accent
- prefers-reduced-motion を尊重

## 変更するファイル

- `design.md`（新規作成。プロジェクトルートのみ）

## 変更しないこと

- `app/globals.css`
- `tailwind.config.ts`
- すべてのコンポーネント・ページ

## 完了条件

- プロジェクトルートに `design.md` が存在すること
- YAML フロントマターに colors / typography / spacing / radius / shadows / components が定義されていること
- Markdown 本文に上記 5 セクションが記述されていること
- 既存の CSS カスタムプロパティ（`--color-ink` 等）と値が一致していること
- `pnpm build` が成功すること（design.md はビルドに影響しないが確認する）

## ブランチ・PR

- ブランチ: `chore/create-design-md`
- PR タイトル: `Chore: add design.md — Apple-inspired design system for Tryline`
