# fix-mobile-story-swipe-worklet-crash: マッチストーリーのスワイプでworklet違反

対象リポジトリ: **tryline-mobile**

## 背景

2026-07-22〜23、mobile-mcp（iOS Simulator を実際に操作する MCP サーバー）を使った自律型 UI 監査（Claude Sonnet）で、マッチストーリーのスワイプ操作時に Reanimated の worklet 違反が発見された。ソースコードで裏取り済み:

- `src/stories/MatchStoriesSection.tsx` 62-73 行目 `getStorySwipeDirection` には `"worklet";` ディレクティブがある
- 同 75-77 行目 `updateStorySwipePosition`、79-86 行目 `setStorySwipePosition` には `"worklet";` ディレクティブが**ない**（通常の JS 関数）
- にもかかわらず、385 行目（`Gesture.Pan().onUpdate(...)` 内）で `updateStorySwipePosition(dragX, event.translationX)`、390・395 行目（`.onEnd(...)` 内）で `setStorySwipePosition(...)` が、worklet コンテキストから直接（`runOnJS` を介さず）同期呼び出しされている

Gesture Handler の `.onUpdate` / `.onEnd` コールバックは UI スレッド（worklet）上で実行されるため、worklet化されていない関数を直接呼ぶと "Tried to synchronously call a non-worklet function on the UI thread" 系のエラーになる。開発ビルドでは RedBox 表示、本番ビルドでは無音での機能停止・クラッシュのリスクがある。複数回連続スワイプでエラーが積み上がる再現性も確認済み。

## スコープ

対象:
- `updateStorySwipePosition` / `setStorySwipePosition` を worklet コンテキストから安全に呼び出せる形にする

対象外:
- ストーリーカルーセルのスワイプしきい値・アニメーション挙動（`storySwipeThreshold` 等の値）の変更
- Match Stories 機能のその他の不具合（`fix-mobile-ios-audit-findings-batch1` で別途対応）

## UI サーフェス（修正内容）

以下いずれか、既存のスワイプ挙動（速度・しきい値による前後遷移、spring 復帰）を変えない形で修正する。実装方法は Codex の裁量:

- `updateStorySwipePosition` / `setStorySwipePosition` の関数本体先頭に `"worklet";` ディレクティブを追加し、worklet として呼び出せるようにする
- または、`SharedValue.value` への代入を呼び出し元の worklet コールバック内に直接インライン化し、共通処理はロジックのみを純粋関数として切り出す

`completeStorySwipe`（369-376 行目、`useCallback` = JS スレッド実行）からの呼び出しは現状のままで問題ない。修正対象は worklet コンテキスト（`.onUpdate` / `.onEnd`）からの呼び出し経路のみ。

## データモデル変更 / API サーフェス / LLM 連携

なし。

## 受け入れ条件

1. `updateStorySwipePosition` と `setStorySwipePosition` が、worklet コンテキスト（`.onUpdate` / `.onEnd`）から呼ばれる経路において worklet として正しく実行される（`"worklet";` ディレクティブの付与、またはインライン化により、非worklet関数の同期呼び出しが発生しない）
2. 既存のスワイプ挙動に変更がない: 速度・しきい値による前後遷移、キャンセル時の spring 復帰が修正前と同じ
3. `completeStorySwipe` 経由（JS スレッド）の呼び出しが引き続き正常動作する
4. TypeScript strict・lint・test green
5. **Owner 目視**: iOS Simulator またはデバイスでマッチストーリーを連続で複数回スワイプし、RedBox・コンソールエラー・スワイプの引っかかりが発生しないことを確認する

## 未解決の質問

なし。
