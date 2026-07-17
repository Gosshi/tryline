# Codex プロンプト: feat-app-icon

**tryline-mobile リポジトリ**で貼る。仕様書なし（1ファイル配線のみの小タスク）。

---

`assets/icon.png`（1024×1024、確定済みの Tryline アプリアイコン。インク地・紙色のラグビーボール・赤いトライライン）を Expo アプリのアイコンとして配線してください。

やること:
- `app.config.ts` に `icon: "./assets/icon.png"` を追加
- Expo の adaptive icon（Android 用、将来の展開に備えて）が必要な場合は同じ画像を `android.adaptiveIcon.foregroundImage` にも設定してよいが、Android 提出予定は無いため必須ではない
- スプラッシュ画面用アイコン（`expo-splash-screen` プラグイン設定）は既存の背景色 `#f5f6f8` 設定はそのまま維持し、アイコン画像は変更しない（別途判断）
- `npx expo prebuild` 相当の生成物・シミュレータでの表示を確認できる範囲で確認する

エッジケース:
- 画像が正方形・1024×1024であることを確認（既に配置済みだが念のため）
- 既存のsplash screen設定・他のアセット参照を壊さない

完了の定義: `app.config.ts` に `icon` フィールドが追加され、`npx expo start` でシミュレータのホーム画面アイコンとして正しく表示されることを確認。PR説明にシミュレータのホーム画面スクリーンショットを添付。
