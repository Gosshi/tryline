# feat-mobile-weekly-news-stories: 「今週のニュース」ストーリー表示(iOS)

対象リポジトリ: **tryline-mobile**(本ファイルはtrylineに置く決定記録の原本。Codexが読む実体は`tryline-mobile/docs/specs/`にミラーする)。**前提: `feat-weekly-news-stories-api.md`がtrylineにデプロイ済みであること**(`GET /api/v1/stories/weekly-news`が実データを返す状態)。

## 背景

2026-07-26、実際の週間ラグビーニュースを使ったモックアップをOwnerに確認し、「マッチストーリーズと同じ縦型ストーリー形式で、既存に統合したい」という方針で合意した。

既存の`src/stories/MatchStoriesSection.tsx`のコード構造を確認したところ、`MatchStoryViewer`は「試合の輪(matches配列)× 各試合内の項目(items配列)」という二重ネスト構造で、下部の主アクションボタンも`matchStories.match.id`に決め打ちで試合詳細へ遷移する設計になっている。このコンポーネントは今セッション中に共有バグ(shareボタン押下中の自動送り)を3回の修正サイクルで安定させた経緯があり(`pauseReasons: Set<PauseReason>`パターンの導入)、ここに無理な汎用化を加えるとリグレッションのリスクが高い。

一方、週間ニュースは「1つの輪の中身」しかない(試合という外側のネストが不要)ため、構造としてはむしろ`MatchStoryViewer`より単純になる。よって本specでは**既存の`MatchStoriesSection`/`MatchStoryViewer`には一切手を加えず、視覚的に統一された別コンポーネントを新規追加する**方針を取る。統一感は「同じカードサイズ・境界線・未読ドット・ビューアーの間合い・進捗ドット・pause/共有の挙動」を踏襲することで実現し、コードパスは独立させる。

## スコープ

対象:
1. 新規コンポーネント`src/stories/WeeklyNewsSection.tsx`(または近い名称。既存`MatchStoriesSection.tsx`の構成に倣うが、ネストなしの単一階層)
2. ホーム画面(`app/(tabs)/index.tsx`)への組み込み: 既存の「マッチストーリーズ」レールと視覚的に統一されたカード(同じ`StoryCard`相当の見た目)を、同じ並び・同じセクション近接に配置する
3. `src/api/types.ts`・`reference/api-types.ts`に`V1WeeklyNewsItemCategory`・`V1WeeklyNewsItem`・`V1WeeklyNewsData`を追加(tryline側`lib/api/v1/types.ts`と手動同期、既存運用どおり)
4. `GET /api/v1/stories/weekly-news`を叩くフック/クエリの追加(既存の`useQuery`パターンに倣う)
5. ビューアーの主アクションは「出典を読む」(`Linking.openURL(item.source_url)`)。「試合詳細を見る」ボタンは存在しない
6. 既読管理(`src/stories/seenStore.ts`)を再利用。weekly-newsのidは`weekly-news:<item.id>`のように既存match story idと衝突しない名前空間にする

対象外:
- `MatchStoriesSection.tsx`・`MatchStoryViewer`本体への変更(既存動作に一切影響を与えない)
- プレミアム制限・ネタバレガード(v1のニュース項目は対象外。将来必要になれば別spec)
- 複数週をまたぐ既読管理の高度化(既存`pruneSeenStoryWeeks`と同等の単純な仕組みで十分)

## データモデル変更

なし(モバイル側)。

## API サーフェス

`src/api/types.ts`(`reference/api-types.ts`と同時に更新):

```ts
export type V1WeeklyNewsItemCategory = "transfer" | "quote" | "competition" | "injury" | "other";

export type V1WeeklyNewsItem = {
  id: string;
  category: V1WeeklyNewsItemCategory;
  title: string;
  summary: string;
  source_domain: string;
  source_url: string;
  published_at: string | null;
  image: { landscape_url: string; portrait_url: string };
};

export type V1WeeklyNewsData = {
  items: V1WeeklyNewsItem[];
  week: { from: string; to: string; label: string };
};
```

## UI サーフェス

- ホーム画面: 既存マッチストーリーズのレールと同じ視覚言語(カード寸法・境界線・未読ドット)を持つ「今週のニュース」カードを1枚追加。0件の場合はカードごと非表示(既存`MatchStoriesSection`の`if (!matches.length) return null`と同じパターン)
- タップで`WeeklyNewsViewer`(新規、フルスクリーンModal)を開く。以下は`MatchStoryViewer`と同じ挙動を踏襲する:
  - 進捗ドット(`items.length`ぶん)
  - `pauseReasons: Set<PauseReason>`によるpause管理(gesture/appState/share)
  - 横スワイプでの次/前アイテム送り、上→下スワイプで閉じる
  - タップゾーン(左1/3=前、右2/3=次)
  - 画像ロード中フォールバック(`viewerFallback`と同様のTrylineワードマーク背景)
  - 自動送り(`storyDurationMs`)、`reduceMotion`/スクリーンリーダー時は自動送り無効
- 差分:
  - 下部主ボタン: 「出典を読む」(`item.source_url`を`Linking.openURL`)。押下中は`pauseReason("appState", true)`と同じ扱いにする(既存の出典リンクタップと同じ挙動)
  - 「試合詳細を見る」ボタンなし
  - ネタバレマスク(`shouldMaskStoryItem`相当)は適用しない
  - トップバーの`viewerMeta`は大会名の代わりにカテゴリラベル(「移籍」「選手コメント」「大会」等)を表示

## LLM 連携

なし(本specはUI・データフェッチのみ。LLM連携は`feat-weekly-news-stories-api.md`側で完結)。

## 受け入れ条件

1. `GET /api/v1/stories/weekly-news`が0件を返す週は、ホーム画面に「今週のニュース」カードが表示されない
2. 1件以上ある場合、既存マッチストーリーズのカードと同じ視覚サイズ・境界線・未読ドットの扱いでカードが表示される
3. カードタップで`WeeklyNewsViewer`が開き、進捗ドット・スワイプ送り・タップゾーン・上→下スワイプでの終了が機能する
4. 共有ボタン押下中・アプリがバックグラウンドに回った間はストーリーが自動送りされない(`MatchStoryViewer`と同じpause機構を独立実装で再現)
5. 下部主ボタンは「出典を読む」で、タップで`item.source_url`がブラウザで開く。「試合詳細を見る」ボタンは存在しない
6. 既読管理が機能し、既読アイテムには未読ドットが表示されない。idの名前空間が既存マッチストーリーズと衝突しない
7. `MatchStoriesSection.tsx`・`MatchStoryViewer`の既存テストが無変更で通る(既存機能への影響がないことの確認)
8. アクセシビリティ: `accessibilityLabel`/`accessibilityRole`が既存ビューアーと同水準で設定されている
9. 新規依存パッケージなし。`pnpm typecheck` / `pnpm lint` / `pnpm test` が通る
10. **Owner実機目視**: 実データで表示・スワイプ・出典リンク遷移・pause挙動を確認する(機械的条件だけで完了としない。過去のshare-pauseバグが2回の機械的完了判定をすり抜けた教訓を踏まえる)

## 未解決の質問

- ホーム画面での配置順(マッチストーリーズより前か後か)はCodexの実装判断に委ねる。迷う場合は完了報告で質問として提示する
- カテゴリラベルの日本語文言(「移籍」「選手コメント」「大会」「負傷」「その他」)はCodex実装時に確定させ、完了報告に含める
