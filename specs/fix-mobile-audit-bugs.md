# fix-mobile-audit-bugs: デザイン監査で特定したバグ級修正（束1）

対象リポジトリ: **tryline-mobile**

## 背景

2026-07-15 の並行デザイン監査（Claude Fable 5 / GPT-5.6、`docs/notes/2026-07-15-ios-design-audit-prompt.md` のスクリーンショット12枚＋コード突合）で、両モデル一致または実画像で確認済みの**実装バグ級**の指摘を修正する。デザイン方針の変更（エディトリアル化）は別 spec `feat-mobile-editorial-polish` で扱い、本 spec は挙動・可読性・情報露出の欠陥のみ。

## スコープ

対象:
1. **ナビゲーションの内部情報露出**: 試合詳細の戻るボタンに expo-router の内部ルート名 `(tabs)` が表示される。また試合詳細→試合詳細の遷移で戻るラベルと中央タイトルが「試合詳細」で重複する
2. **空カードの描画**: preview / recap / locked がすべて無い試合で、`MatchDetailScreen` が空の `Card`（中身ゼロの白い帯）を描画する
3. **チーム名の途中折返し**: 3 カラムの対戦表示（`MatchCard` / `MatchDetailScreen` のスコアボード）で「ニュージーラ／ンド」のように単語中で折れる
4. **順位表の見出し崩れ**: 長い大会名（ネーションズチャンピオンシップ等）が不自然に折れ、右上の設定ボタンと重なる
5. **可読性の実測不足**: `colors.muted`（`#767d8b`）が紙背景で 3.83:1 と WCAG の 4.5:1 未達。サインインの無効ボタン（薄ピンク×白文字 約2:1）。「スコアを表示」のタップ領域が 44pt 未満
6. **イベントの「-分」表示**: `minute` が null のイベントで「-分 Menoncello · try」のように表示される（`MatchDetailScreen.tsx` 付近）。null 時は分数ラベルごと省略する

対象外:
- 角丸・影・密度などデザイン方針の変更（`feat-mobile-editorial-polish`）
- 新機能・画面追加

## UI サーフェス（修正内容）

1. ナビゲーション: `matches/[id]` のスタック設定で戻るボタンをラベルなし（chevron のみ）にする（例: `headerBackButtonDisplayMode: "minimal"` 相当。expo-router のバージョンで API 名が異なる場合は同等の手段でよい）。中央タイトルは「試合詳細」1 つだけ残す
2. 空カード: コンテンツが 1 つも無い場合は `ContentSection` を包む `Card` ごと描画しない（`Card` 内が空になる分岐を作らない）
3. 対戦 3 カラム: 両チーム名を `flexBasis: 0` + `minWidth: 0` の可変列、スコア列を固定幅（72pt 目安）にし、チーム名は最大 2 行＋`adjustsFontSizeToFit`（`minimumFontScale: 0.85`）。アウェー側は右揃え
4. 順位表見出し: `Screen` タイトルに最大 2 行＋`adjustsFontSizeToFit`（`minimumFontScale: 0.75`）。右上の設定ボタンと重ならないよう右余白を確保
5. 可読性:
   - `src/theme/tokens.ts` の `muted` を `#626a78` 程度へ濃く（コントラスト 4.5:1 以上を満たす値。変更は tokens 1 箇所で全画面に波及させる）
   - サインインの無効ボタンは `opacity` 減衰をやめ、背景 `colors.line`＋文字 `colors.muted`
   - `ScoreText` の「スコアを表示」Pressable に `minHeight: 44`＋左右 padding

## データモデル変更 / API サーフェス / LLM 連携

なし。

## 受け入れ条件

1. 試合詳細のヘッダに `(tabs)` の文字列がどの遷移経路でも表示されない（コンポーネントテストまたは文字列検索テスト）
2. preview / recap / locked すべて無しの試合詳細で、空の `Card` が DOM（テストレンダラー出力）に存在しない
3. 長いチーム名（例: 20 文字のダミー名）を与えた `MatchCard` / スコアボードで、チーム名が単語中折返しせず 2 行以内・スコア列が固定幅を維持する（スナップショットではなく明示的アサーション）
4. `colors.muted` の新値と紙背景 `#f5f6f8` のコントラスト比が 4.5 以上であることをテストで計算検証する
5. 「スコアを表示」の Pressable が `minHeight: 44` を持つ
6. `minute` が null のイベントで「-分」等のプレースホルダが表示されず、選手名・種別のみ表示される（テスト）
7. TypeScript strict・CI（lint / tsc / test）green
8. **Owner 目視**: 修正後の 01 / 04 / 07 / 09 / 12 相当のスクリーンショットで、監査指摘が解消していることを確認

## 未解決の質問

なし。
