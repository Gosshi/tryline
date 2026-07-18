# feat-match-stories-team-color-backdrop: story 画像の背景をチームカラーで彩る

対象リポジトリ: **tryline のみ**（`app/api/og/route.tsx`）。**tryline-mobile の変更は不要**（アプリは同じ URL の画像を表示するだけ。ミラー配置も不要）。

## 背景

マッチストーリーズ Phase 1 完了後の Owner 実機フィードバック（2026-07-18）:「写真がなくて画像が殺風景」。現状の `type=story` 画像（text=none 背景版・text=full 共有版とも）は固定の濃紺グラデーション1種で、どの試合も同じ見た目になる。

報道写真は権利上使えず、実在選手の生成画像も禁止（`image-gen` スキル制約）のため、**チームカラーの動的グラデーション**で試合ごとの表情を作る。試合詳細ページのヒーロー（`components/match-header.tsx` 81-102行）に同じ設計が実装済みで、`getTeamColor(slug)`（`lib/format/team-identity.ts`）から home/away の色を取り、左上=ホーム色・右下=アウェイ色の radial-gradient を重ねる構図が確立している。これを OG 側に移植する。

この改善は preview / result / recap と、将来の news タイプ（Phase 2 候補）の全 Story Item に自動で効く。

## スコープ

対象:
- `app/api/og/route.tsx` の `storyImage`（text=full / text=none 両モード、portrait / landscape 両向き）

対象外:
- fallback ブランドカード（match 不在時）は現行の固定配色のまま（チーム情報が無いため）
- 雰囲気背景画像プール（gpt-image-1 生成のシルエット素材等）は本 spec に含めない（§未解決の質問）
- tryline-mobile 側の変更・API レスポンスの変更・story 以外の og type の変更

## 変更内容

1. `storyImage` の背景を、固定グラデーションから **home/away チームカラーの2点 radial-gradient 合成**に変更する
   - 色の取得: `getTeamColor(match.home_team.slug)` / `getTeamColor(match.away_team.slug)`（既存関数。DB クエリ追加なし）
   - 構図は `components/match-header.tsx` の実装（左上=ホーム・右下=アウェイ・下地は現行の濃紺）を基準にする
2. **Satori（@vercel/og）の CSS 制約に注意**: match-header は `color-mix()` を使うが Satori は非対応の可能性が高い。hex+アルファ（例 `#RRGGBBcc`）または rgba 換算で同等の透過を実現すること。実装時に実レンダリングで確認する
3. **文字可読性の確保**: text=full では白文字が乗るため、現行の暗色スクリムレイヤー（`linear-gradient(180deg, rgba(6,17,31,0.48)...0.92)`）を必ず残す。明るいチームカラー（白系・黄系）でもスコア・チーム名のコントラストが保たれること
4. text=none（アプリ内背景版）も同じチームカラー背景にする（アプリ側が文字を乗せる前提のため、スクリムも維持）

## コスト

追加コストゼロ（LLM・画像生成 API 不使用。既存の @vercel/og ランタイム描画のみ）。CDN キャッシュは Vercel のデプロイ単位で切り替わるため、旧デザインのキャッシュ残留は新デプロイで自然に解消する（`v` パラメータの変更は不要）。

## 受け入れ条件

1. 異なる対戦カードで背景の配色が変わる（例: 日本×フランス と 南ア×ウェールズ で異なる。スナップショット/要素検証テストで background に `getTeamColor` 由来の色値が含まれることを確認）
2. text=full / text=none、portrait / landscape の4通り全てでチームカラー背景が適用される
3. fallback カード（match 不在）は現行どおり固定配色
4. 既存テスト（text=none のテキスト不在検証・スコア検証・キャッシュヘッダ等）が無変更で通る
5. `pnpm tsc --noEmit` / `pnpm lint` / `pnpm test` / `pnpm build` が通る
6. **スクリーンショット検証（PR 添付必須）**: (a) 日本×フランス等の明彩色カード (b) **濃色同士の対戦**（例: ニュージーランド黒×南アフリカ緑）(c) 白系チームカラーを含むカード — の3パターン × text=full portrait。濃色同士でも背景が「ほぼ無地」に見えないこと、白系でも文字が読めることを目視できる状態で提出（CSS レイヤーは DevTools 値でなく実レンダリングで確認する。2026-07-07 の2連続不可視バグの教訓）
7. **Owner 実機/実画像目視で「殺風景が改善した」ことの確認**（機械的条件だけで完了としない）

## 未解決の質問

- 雰囲気背景プール（実在選手が写らないラグビー情景を gpt-image-1 で5〜8枚生成し、チームカラーグラデと合成 or ローテーション。一回きり $5〜10 見込み）は、本 spec の結果を見てから追加判断する（Owner）
- 旗・short_code の大型モノグラムを背景に薄く敷く案も同様に後続判断
