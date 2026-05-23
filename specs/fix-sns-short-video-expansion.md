# SNS 運用: TikTok / Instagram Reels への展開計画

## 背景

現在の SNS 運用は X（Twitter）のみ。
TikTok・Instagram Reels はラグビーファンへのリーチ拡大に有効だが、
動画編集・投稿の工数が X より大きいため、現状のリソースでは非現実的。

**実装タイミング: X フォロワーが 1,000 人を超えた段階で検討開始すること。**

このファイルは将来の計画参照用メモ spec。現時点での実装は不要。

## スコープ

対象: （将来）
- 試合ハイライト動画の自動生成・投稿フロー
- スコアグラフ動画化（Remotion / Canvas アニメーション等）

対象外（現時点）:
- 任意の実装作業

## データモデル変更

（将来検討）`match_content` に `tiktok_post_id TEXT` / `instagram_post_id TEXT` を追加

## API サーフェス

（将来）
- TikTok API v2（動画投稿）
- Instagram Graph API（Reels 投稿）

## UI サーフェス

なし

## LLM 連携

（将来）スコアグラフ + 戦術サマリーのナレーション生成（TTS 連携）

## 受け入れ条件

このタスクは現時点では未着手でよい。
X フォロワーが 1,000 人に達した際に Owner が実装方針を決定すること。

## 未解決の質問

- 動画制作ツール選定: Remotion（コードで動画生成）vs 手動編集
- 投稿頻度・コンテンツフォーマットは SNS 戦略として別途検討
- X 自動投稿（`fix-sns-auto-post.md`）が安定した後に着手すること