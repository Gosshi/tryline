# Codex プロンプト: feat-match-stories-team-color-backdrop

> tryline 単独・1 部構成（mobile 変更なし）。

```
specs/feat-match-stories-team-color-backdrop.md を実装してください。

- AGENTS.md の規約に従うこと
- 仕様書と実環境に食い違いがあれば、その場で実装を停止して Owner に確認すること
- スコープ対象外（fallback カード・雰囲気画像プール・mobile・他の og type）は実装しないこと

### 実装対象

app/api/og/route.tsx の storyImage の背景を、getTeamColor(home.slug)/getTeamColor(away.slug)
（lib/format/team-identity.ts）による home/away 2点 radial-gradient 合成に変更。
構図の基準は components/match-header.tsx 81-102行（左上=ホーム・右下=アウェイ・下地は濃紺）。

### 注意点

- Satori は color-mix() 非対応の可能性が高い。hex+アルファ or rgba で透過を実現し、
  実レンダリング（スクリーンショット）で確認する
- 既存の暗色スクリムレイヤーは必ず残す（白系チームカラーでも文字が読める状態を維持）
- text=full / text=none、portrait / landscape の4通り全てに適用

### エッジケース（必ずテストで押さえる）

- 異なる対戦カードで背景色が変わる（getTeamColor 由来の色値が style に含まれる）
- fallback カードは現行の固定配色のまま
- 既存の text=none テキスト不在検証・スコア検証・Cache-Control テストが無変更で通る

### 完了の定義

- 仕様書の受け入れ条件 1〜6 を満たす（7 の目視は Owner）
- pnpm tsc --noEmit / lint / test / build が通る
- スクリーンショット3パターンを PR に添付:
  (a) 明彩色カード（日本×フランス等）
  (b) 濃色同士（ニュージーランド×南アフリカ等）— 「ほぼ無地」に見えないこと
  (c) 白系チームカラーを含むカード — 文字が読めること
```

## Owner 向け運用メモ

- マージ後は新デプロイで CDN キャッシュが切り替わるため追加作業なし（v パラメータ変更不要）
- マージ・デプロイ後、アプリ側は再ビルド不要で自動的に新背景になる（同一 URL の画像が変わるだけ）
- 結果を見て「雰囲気背景プール」「モノグラム」を足すかは別途判断（spec の未解決の質問）
