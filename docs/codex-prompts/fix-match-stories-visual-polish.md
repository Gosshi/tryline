# Codex プロンプト: fix-match-stories-visual-polish

> **2 部構成・貼る順番厳守**: **プロンプト A（tryline）→ マージ・デプロイ後に → プロンプト B（tryline-mobile）**。

---

## プロンプト A（tryline リポジトリに貼る）

```
specs/fix-match-stories-visual-polish.md の A（Web 側）を実装してください。

- AGENTS.md の規約に従うこと
- 仕様書と実環境に食い違いがあれば、その場で実装を停止して Owner に確認すること
- スコープ対象外（仕様書のスコープ節）は実装しないこと

### 実装対象

`app/api/og/route.tsx` の `type=story` に `text` パラメータ（full デフォルト / none）を追加。
`text=none` は背景グラデーション・上部レッドバー・右下 trylinerugby.com のみ描画し、
タイプラベル・TRYLINE・大会名・タイトル・チーム名・スコア・vs を全て省略する。

### エッジケース

- text 省略・text=full・未知値 → 現行と同一出力（既存テストが無変更で通ること）
- text=none × item=result → スコア数字が出力に含まれない
- portrait / landscape 両方で機能する
- fallback カード（match 不在）は従来どおり

### 完了の定義

- 仕様書 A の受け入れ条件 1〜4 を満たす
- tests/api/og-competition.test.tsx に text=none のテストを追加（storyMatch フィクスチャ再利用）
- pnpm tsc --noEmit / lint / test / build が通る
- text=none の portrait 出力スクリーンショットを PR に添付
```

---

## プロンプト B（tryline-mobile リポジトリに貼る。A のマージ・デプロイ後）

```
docs/specs/fix-match-stories-visual-polish.md の B（iOS 側）を実装してください。

- AGENTS.md の規約に従うこと
- 仕様書と実環境に食い違いがあれば、その場で実装を停止して Owner に確認すること
- 新規依存パッケージの追加は禁止（react-native-safe-area-context は既存依存）

### 実装対象

1. ビューアーの safe area 対応（useSafeAreaInsets。src/components/Screen.tsx の扱いに倣う）
2. カードサムネ・ビューアー背景の画像 URL に text=none を付与（src/stories/storyModel.ts にヘルパ追加）。
   共有 URL には付けない
3. カード下部のチーム表記を重ならない形に変更（TeamIdentity×2 横並びを廃止）。
   「1 ITEMS」→「全 1 件」等の日本語化

### エッジケース

- 最長のチーム表記（サブディビジョン旗＋3 文字コード）でも重ならない
- spoiler マスク中に画像 fetch なしの既存挙動を壊さない（既存テストが通ること）
- 共有フロー（storyShareUrl / Share.share）は変更しない

### 完了の定義

- 仕様書 B の受け入れ条件 5〜9 を満たす（10 の実機目視は Owner が TestFlight で実施）
- __tests__/match-stories.test.tsx に text=none の URL 検証・カード表記のテストを追加
- typecheck / lint / test が通る
- ホームカードとビューアーのスクリーンショットを PR に添付
```

---

## Owner 向け運用メモ

- A は API 契約変更なし・マイグレーションなし。マージ→デプロイ後に B を貼る
- B マージ後は TestFlight 再ビルド（eas build --local → submit）で受け入れ条件 10 の実機目視
