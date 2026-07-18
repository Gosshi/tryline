# Codex プロンプト: feat-match-stories-flag-cards

> tryline 単独・1 部構成（mobile 変更・再ビルド不要）。

```
specs/feat-match-stories-flag-cards.md を実装してください。

- AGENTS.md の規約に従うこと
- 仕様書と実環境に食い違いがあれば、その場で実装を停止して Owner に確認すること
- スコープ対象外（TEAM_FLAGS への旗追加・fallback カード・他の og type・mobile）は実装しないこと

### 実装対象

app/api/og/route.tsx の storyImage に「旗チップ段（ホーム v アウェイ）」を追加し、
タイプラベルを極太大型タイポに強化する。参照デザインは Google スポーツの MATCH STORY カード
（旗チップ2枚＋v＋極太タイポ。仕様書の背景節参照）。

- SVG 旗あり（getTeamFlagSvg が非空）: data:image/svg+xml;base64 の <img> で角丸チップに描画
  （既存の bgDataUri と同じ埋め込みパターン。lib/format/team-identity.ts）
- SVG 旗なし: getTeamStripeColors の縞 linear-gradient チップ＋中央に short_code（白・太字）
- text=none では stripe チップの short_code 文字を描画しない（縞のみ。SVG 旗は描画してよい）

### エッジケース（必ずテストで押さえる）

- SVG×SVG / SVG×stripe 混在 / stripe×stripe の3パターン
- text=none の既存契約「テキストは trylinerugby.com のみ」が維持される（short_code が漏れない）
- 4タイプ × portrait/landscape × full/none でレイアウト崩れなし
- 既存のチームカラー背景・スコア有無・Cache-Control テストが無変更で通る

### 完了の定義

- 仕様書の受け入れ条件 1〜7 を満たす（8 の目視は Owner）
- pnpm tsc --noEmit / lint / test / build が通る
- スクリーンショット4枚を PR に添付（text=full portrait × (a)日本×フランス (b)NZ×アイルランド
  (c)NZ×南アフリカ、＋ (d)text=none 1枚）。混在ペアの見栄え比較が Owner 判断の材料になるため、
  (b) は必ず含めること
```

## Owner 向け運用メモ

- マージ・デプロイ後、アプリは再ビルド不要で自動反映（端末キャッシュは最長24時間で更新）
- スクショ (b) の混在ペアが不揃いに見える場合は「全チーム stripe チップ統一」への切替を判断
  （spec の未解決の質問）
