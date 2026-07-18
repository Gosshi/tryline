# fix-match-stories-visual-polish: マッチストーリーズの文字重なり・視認性修正

対象リポジトリ: **tryline（Web/OG）＋ tryline-mobile（iOS）**。実装順は必ず **A(Web) → デプロイ後に B(iOS)**。

## 背景

2026-07-18、TestFlight 実機確認（feat-match-stories v1、mobile PR #13）で Owner から「機能はしているが文字が重なって見づらい」との指摘。スクリーンショットから 3 つの独立した問題を特定した。

1. **ビューアーが safe area を無視**: フルスクリーン Modal の上部バー（PREVIEW ラベル・大会名・✕ボタン）が iOS ステータスバー（時刻・電波表示）と重なる。下部のアクション行も画像内の `trylinerugby.com` 表記や ホームインジケータ領域と干渉
2. **OG 画像の焼き込みテキストとアプリのオーバーレイが二重表示**: `type=story` 画像には大会名・「試合プレビュー」・チーム名が焼き込まれているが、アプリ側もタイトル・要約をオーバーレイ描画するため同じ情報が二重に見える。さらに画像は 9:16（1080×1920）を 9:19.5 前後の実機画面に `cover` 表示するため左右がクロップされ、焼き込みテキストの行頭が見切れる（「試合プレビュー」の「試」が欠ける等）
3. **ホームカードのチームコードが重なる**: 142pt 幅のカードに `TeamIdentity`（旗＋コード）×2 と「v」を横並びさせており、`NZLvIRL`・`AUSITA` のように文字が衝突。加えて縮小表示された画像内の焼き込みテキストが判読不能なノイズになっている

## 方針: 「表示用は文字なし背景、共有用は文字入り」に役割分担する

- アプリ内表示（カードサムネ・ビューアー背景）には**テキストを一切焼き込まない背景版**の画像を使う。テキストはアプリが一元的に描画する（二重表示とクロップ見切れの根治）
- 共有（share sheet）は従来どおり**文字入りのフル版** portrait を渡す（SNS に貼られる画像は自己完結している必要があるため）
- API 契約（`V1StoryItem`）は変更しない。クライアントが画像 URL にクエリパラメータを 1 つ追加するだけで済ませる

## スコープ

対象:
- A（tryline）: `app/api/og/route.tsx` の `type=story` に `text` パラメータを追加
- B（tryline-mobile）: safe area 対応・背景版画像の使用・カードレイアウト修正

対象外:
- API レスポンス（`lib/api/v1/types.ts` / `/api/v1/stories`）の変更
- 共有フローの変更（`storyShareUrl` / `Share.share` は現行のまま。画像ファイル共有化は別件の Phase 2 候補のまま）
- OG 画像のデザイン刷新（レイアウト・配色は現行踏襲。テキスト省略のみ）
- 新規依存パッケージの追加（`react-native-safe-area-context` は既存依存（~5.7.0）にあるため対象外の追加に当たらない）

## A: Web（tryline）

`GET /api/og?type=story&...&text=none` を追加する。

- `text` パラメータ: `full`（デフォルト・現行どおり）| `none`
- `text=none` のとき、**タイプラベル（PREVIEW 等）・TRYLINE ワードマーク・大会名・タイトル（試合プレビュー等）・チーム名・スコア・「vs」のテキスト要素を全て描画しない**。残すのは背景グラデーション・上部レッドバー・右下の `trylinerugby.com` のみ
- スコアを含まないため、`text=none` は spoiler 的にも安全（マスク中に fetch しない設計は B 側で維持する。防御は多層のまま）
- 未知の `text` 値は `full` として扱う（後方互換）
- fallback カード（match 不在時）は現行どおりでよい（text パラメータの影響を受けなくてよい）

### A の受け入れ条件

1. `text=none` の story 画像出力に、チーム名・スコア数字・「試合プレビュー/試合結果/試合レビュー」・大会名のテキストが含まれない（result item のテストで検証）
2. `text` 省略時・`text=full`・未知値のとき現行と同一の出力（既存テストが無変更で通る）
3. portrait / landscape 両向きで `text=none` が機能する
4. `pnpm tsc --noEmit` / `pnpm lint` / `pnpm test` / `pnpm build` が通る

## B: iOS（tryline-mobile）

### B-1 safe area 対応（ビューアー）

- `react-native-safe-area-context` の `useSafeAreaInsets` を使い、ビューアーのプログレスバー・上部バーを `insets.top` の下に、下部アクション行を `insets.bottom` の上に配置する
- 参考: 既存の `Screen` コンポーネント（`src/components/Screen.tsx`）の safe area 取り扱いに倣う

### B-2 表示用画像を背景版に切り替え

- カードサムネとビューアー背景の画像 URL に `text=none` を付与する（`src/stories/storyModel.ts` にヘルパを追加。例: `storyBackgroundUrl(url)` — `resolveStoryAssetUrl` 後に `URLSearchParams` で `text=none` を追加）
- **共有（`shareCurrentStory`）は現行どおり `text=none` を付けないフル版 URL を渡す**
- ビューアーの `resizeMode` は cover のまま（文字が無いためクロップ無害）。アプリ側オーバーレイ（タイトル・要約・日付・locked パネル）は現行の下部パネルを維持

### B-3 カードレイアウト修正

- カード下部から `TeamIdentity`×2 の横並びを廃止し、重ならない表現に変える。推奨: `short_code` ベースの 1 行テキスト「🇳🇿 NZL v IRL 🇮🇪」を単一 `Text`（`numberOfLines={1}`・`adjustsFontSizeToFit` か固定小サイズ）で描画するか、ホーム／アウェイを 2 行に縦積みする。どちらを採るかは実装時に見た目で判断してよいが、**いかなるチーム名長でも文字同士が重ならないこと**
- 「1 ITEMS」表記は「全 1 件」等の日本語にする（UI は日本語が既定。mobile 表記日本語化 PR #3 の方針に合わせる）

### B の受け入れ条件

5. ビューアーの上部バー・プログレスバーがステータスバーと重ならず、下部アクションがホームインジケータと重ならない（insets を反映したスタイルのコンポーネントテスト＋実機確認）
6. カードサムネ・ビューアー背景の画像 URL に `text=none` が含まれ、共有時の URL には含まれない（テストで検証）
7. カードのチーム表記が NZL/IRL 等どの組み合わせでも重ならない（最長ケース: サブディビジョン旗＋3 文字コード）
8. spoiler マスク中に画像 fetch が発生しない既存挙動が維持される（既存テストが通る）
9. 新規依存パッケージなし・`typecheck` / `lint` / `test` が通る
10. **Owner 実機目視で「重なり・見切れが解消された」ことを確認**（TestFlight 再ビルド。機械的条件だけで完了としない）

## 受け入れ条件（共通）

11. デプロイ順: A を本番デプロイ後に B を実装・検証する（B のテストは `text=none` 付き URL を組み立てるだけなので A 未デプロイでも通るが、実機確認は A デプロイ後）

## 未解決の質問

- カードの縮小サムネに背景版（文字なし）を使うと視覚情報が減るため、カード自体の魅力が下がる可能性がある。実機確認で「カードが寂しい」となった場合は、Phase 2 でカード専用のコンパクト版画像（`text=card` 等）を検討する
