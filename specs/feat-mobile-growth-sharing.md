# feat-mobile-growth-sharing: 共有導線の修正と拡充

対象リポジトリ: **tryline-mobile**のみ。API・データモデル変更は不要(既存の`destination.url`・大会/試合の既存URLパターンを使う)。

## 背景

2026-07-25の外部GPTによるiOS総合監査(グロース区分)で、共有導線に3件の指摘があった。

- **ストーリー共有がOG画像優先でURLが埋もれる**: `src/stories/MatchStoriesSection.tsx`の`shareCurrentStory`は、画像読み込みに成功している場合`Share.share({ message, url: imageUrl })`のように**画像の直接URL**を`url`に渡している。iOSの共有シートは`url`フィールドをリンクプレビュー生成の主対象として扱うため、受け取った側には画像だけが渡り、記事へのリンクとして機能しない
- **共有シートを開くと背後のストーリーが進む**: `shareCurrentStory`は自動送りタイマーを一時停止しない。共有シートを開いている間に自動送りが働き、閉じたときに別の記事(RESULT等)へ進んでしまっている
- **試合詳細・大会詳細に共有ボタンがない**: ストーリー以外の画面(`src/matches/MatchDetailScreen.tsx`・`app/(tabs)/competitions/[slug].tsx`)には共有手段が一切なく、日程・順位表を友人に送る自然な場面を獲得機会にできていない

**Universal Links(共有したURLをタップしたときにアプリを直接開く)は今回のスコープに含めない。** Apple Developer側のAssociated Domains設定・`apple-app-site-association`のWeb側ホスティングが必要な別レイヤーの作業のため、別spec候補として「未解決の質問」に残す。今回はHTTPSのcanonical URLをブラウザで正しく開ける状態にすることが目標。

## スコープ

対象:
1. `shareCurrentStory`が渡す`url`を、画像読み込み成否に関わらず常に`sharedUrl`(記事のcanonical URL)にする
2. 共有シートを開く前に自動送りを一時停止し、共有シートが閉じたら再開する
3. `MatchDetailScreen.tsx`・`app/(tabs)/competitions/[slug].tsx`に共有ボタンを追加する(それぞれ試合・大会のcanonical URLを共有)

対象外:
- Universal Links対応(「未解決の質問」参照、別spec)
- 画像とリンクを同時に添付するリッチな共有(React Native標準の`Share` APIでは`url`と画像ファイルの同時添付が難しいため見送り。テキスト+URLのみで、まずリンクとして機能することを優先する)

## UI サーフェス

### ストーリー共有の修正(`src/stories/MatchStoriesSection.tsx`)

- `shareCurrentStory`内の`Share.share(...)`呼び出しを、`imageFailed`の分岐をやめて常に`{ message: \`${item.title}\n${sharedUrl}\`, title: item.title, url: sharedUrl }`にする
- `shareCurrentStory`の冒頭で`setPaused(true)`を呼び、`Share.share(...)`が解決(成功・キャンセルどちらも)した後に`setPaused(false)`を呼ぶ(`try/finally`で確実に再開する)

### 試合詳細への共有ボタン追加(`src/matches/MatchDetailScreen.tsx`)

- masthead(`match-masthead-card`)内、または`match.competition.name`表示の近くに共有ボタンを追加する(アイコンボタンでよい、`SpringPressable`使用)
- 共有URLは`storyShareUrl`と同じ解決方法(`appConfig.apiBaseUrl`基準)で`/matches/{match.id}`を組み立てる。既存の`storyShareUrl`関数(`src/stories/storyModel.ts`)をそのまま再利用してよい
- 共有メッセージ例: `` `${match.home_team.name} 対 ${match.away_team.name}\n${url}` ``

### 大会詳細への共有ボタン追加(`app/(tabs)/competitions/[slug].tsx`)

- 「大会一覧に戻る」の近く、またはタイトル付近に共有ボタンを追加する
- 共有URLは大会ハブページ(`/c/{slug}`、Web版の既存ルート)を`appConfig.apiBaseUrl`基準で組み立てる
- 共有メッセージ例: `` `${competition.name}\n${url}` ``

## データモデル変更 / API サーフェス / LLM 連携

なし。

## 受け入れ条件

1. `shareCurrentStory`が`imageFailed`の値に関わらず常に`sharedUrl`を`url`として`Share.share`に渡すことを確認するテスト
2. 共有シートを開く直前に自動送りが一時停止し(`paused`相当がtrueになる)、`Share.share`解決後に再開されることを確認するテスト
3. `MatchDetailScreen`に共有ボタンがあり、押下で試合のcanonical URLを含む`Share.share`が呼ばれることを確認するテスト
4. `app/(tabs)/competitions/[slug].tsx`に共有ボタンがあり、押下で大会のcanonical URLを含む`Share.share`が呼ばれることを確認するテスト
5. TypeScript strict・lint・test green
6. **Owner目視**: TestFlightビルドでストーリー共有(URLがリンクとして機能するか、共有後にストーリー位置が変わらないか)、試合詳細・大会詳細からの共有を確認する

## 未解決の質問

- Universal Links対応(共有したURLをタップした際にブラウザではなくアプリを直接開く)は、Apple Developer PortalでのAssociated Domains設定と、tryline(Web)側での`apple-app-site-association`ファイルのホスティングが必要。これは今回のspecの範囲外とし、Owner判断で別途着手するかを決める
