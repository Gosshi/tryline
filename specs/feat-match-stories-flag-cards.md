# feat-match-stories-flag-cards: story 画像を「旗チップ主役」の Google 風カードにする

対象リポジトリ: **tryline のみ**（`app/api/og/route.tsx`）。**tryline-mobile の変更・再ビルドは不要**（同一 URL の画像の中身が変わるだけ）。

## 背景

チームカラー背景（feat-match-stories-team-color-backdrop、#590）で「殺風景」は改善したが、画像に視覚的な「顔」がまだない。Owner が Google スポーツの「MATCH STORY」カード（2026-07-18 スクリーンショット共有）を参照デザインとして提示: **大きな旗チップ2枚＋「v」＋極太タイポだけで、写真なしに試合の顔を作っている**。人物写真が権利上使えない本プロダクトの制約と同じ条件での成功例であり、これを story 画像に取り入れる。

## 実装上の前提（2026-07-18 実コード確認済み）

- `getTeamFlagSvg(slug)`（`lib/format/team-identity.ts`）はインライン SVG 文字列を返す。**SVG 旗を持つのはシックスネーションズ6か国のみ**（england / scotland / wales / france / ireland / italy。2026-07-18 に実コードで確定。当初の「7件」は判定コード行の誤カウント）。**日本を含むそれ以外は空文字**
- `getTeamStripeColors(slug)` は全チームをカバー（チームカラー縞の配列。クラブ含む）
- OG ルートには画像を base64 data URI で `<img>` 埋め込む既存パターンあり（`bgDataUri`、605〜627 行付近）。SVG は `data:image/svg+xml;base64,...` で同様に埋め込める（Satori は `<img>` の data URI をサポート）

## スコープ

対象:
- `app/api/og/route.tsx` の `storyImage`（4 タイプ × portrait/landscape × text=full/none）

対象:
- **`TEAM_FLAGS` への `japan` の SVG 追加**（白地＋中央の赤丸のみ。既存エントリと同じ viewBox 513×342 形式。日章旗は単純図形で作画品質リスクがなく、旗艦試合に毎回登場する日本が縞チップでは本 spec の価値が半減するため、例外的にスコープに含める）

対象外:
- `japan` 以外の `TEAM_FLAGS` への SVG 旗追加（ユニオンジャック系・紋章入りなど複雑な国旗の作画は品質リスク。将来の別タスク）
- fallback ブランドカード・他の og type・mobile
- ホーム/ビューアーの UI 変更

## 変更内容

### 旗チップ（両チームぶん描画）

- **SVG 旗があるチーム**: 角丸チップ（境界線＋影相当の縁取り）に SVG 旗を data URI 埋め込みで描画
- **SVG 旗がないチーム**: 同サイズの角丸チップに `getTeamStripeColors(slug)` の縞（`linear-gradient`）を敷き、中央に `short_code`（白・太字）を描画
- チップサイズは Google 参照デザイン相当の存在感（portrait で幅 260〜320px 目安、landscape はやや小さめ）。2 チップの間に「v」（大きめ・muted）

### レイアウト（text=full）

- 現状の「大会名/タイトル/チーム名/スコア」テキストブロックの上部に、旗チップ段（ホーム v アウェイ）を追加して視覚的な主役にする
- タイプラベル（PREVIEW/NEWS/RESULT/RECAP）を現在のピル型から**極太大型タイポ**に強化（Google の「MATCH STORY」相当の押し出し）。既存のテキスト情報（チーム名・スコア・大会名）は維持
- チームカラー背景・スクリム・上部レッドバー・右下ドメインは現行のまま

### text=none（アプリ内背景版）の特則

- **SVG 旗チップは描画してよい**（旗は文字ではない）
- **stripe フォールバックチップは「縞のみ」で short_code 文字を描画しない**（text=none の「テキストは trylinerugby.com のみ」という既存契約を維持する。既存テストの text=none 検証が short_code で壊れないこと）
- タイプラベル等のテキストは従来どおり一切描画しない

### スコア（result）の扱い

- text=full の result は現行どおりスコアを描画（旗チップの間または直下に配置してよい）。preview/news/recap にスコアを出さない既存ルールは不変

## コスト

追加コストゼロ（SVG はコード内の文字列、LLM・外部フェッチなし）。CDN キャッシュは新デプロイで切り替わる（v パラメータ変更不要。端末キャッシュは最長24時間で自然更新 — 前回の学び）。

## 受け入れ条件

1. SVG 旗を持つチーム同士（例: 日本×フランス）で両チップが SVG 旗になる
2. SVG 旗がないチーム（例: ニュージーランド）は stripe＋short_code チップで描画される（text=full）
3. text=none では stripe チップに short_code 文字が**含まれない**（既存の「text=none のテキストは trylinerugby.com のみ」テストが通り続ける。SVG 旗は許容）
4. 4 タイプ × portrait/landscape × text=full/none の全組み合わせでレイアウトが崩れない（スナップショット/要素検証）
5. 既存テスト（チームカラー背景・スコア有無・Cache-Control 等）が無変更で通る
6. `pnpm tsc --noEmit` / `pnpm lint` / `pnpm test` / `pnpm build` が通る
7. **スクリーンショット検証（PR 添付必須・text=full portrait）**: (a) SVG×SVG（日本×フランス）(b) **SVG×stripe の混在**（例: NZ×アイルランド — 混在ペアが不揃いに見えないかが最重要の目視ポイント）(c) stripe×stripe（クラブ戦 or NZ×南ア）(d) text=none 1 枚。実レンダリングで確認（DevTools 値では不可）
8. **Owner 目視承認**: 特に混在ペア（7 チームしか SVG がないため頻出する）の見栄え。不揃いが目立つ場合は「全チーム stripe チップに統一」への切替を Owner が判断できるよう、比較しやすいスクショを提出する（機械的条件だけで完了としない）

## 未解決の質問

- 混在ペアの見栄えが悪い場合の対応: (a) 全チーム stripe チップ統一（一貫性優先）(b) 主要国の SVG 旗を追加作画（品質リスクと相談）— Owner が受け入れ条件 8 のスクショを見て判断
