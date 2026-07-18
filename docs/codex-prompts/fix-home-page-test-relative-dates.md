# Codex プロンプト: fix-home-page-test-relative-dates

```
specs/fix-home-page-test-relative-dates.md を実装してください。

- AGENTS.md の規約に従うこと
- テストのみの変更。プロダクトコードを変更しないこと
- 仕様書と実環境に食い違いがあれば、その場で実装を停止して Owner に確認すること

### 実装対象

tests/app/home-page.test.tsx に vi.useFakeTimers() + vi.setSystemTime を導入し、
「今週の試合」フィルタに依存するテストが実行日の実日付と無関係に通るようにする。
参考パターン: tests/api/mobile-api-v1-stories.test.ts（同構成を採用済み）。
フィクスチャ日付・アサーション文字列は変更しない。

### エッジケース

- 同ファイル内の他テストが fake timers の副作用を受けない（afterEach で確実に useRealTimers）
- 同種の日付ハードコードが他テストファイルにあれば、修正せず完了報告で列挙のみ

### 完了の定義

- 仕様書の受け入れ条件 1〜4 を満たす
- pnpm tsc --noEmit / lint / test / build が通る（validate が完全グリーンに戻る）
```
