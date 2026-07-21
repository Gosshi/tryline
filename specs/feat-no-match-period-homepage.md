# feat-no-match-period-homepage: 対象週に試合がないときのホーム表示

## 背景

2026-07-21、ネーションズチャンピオンシップ2026南半球シリーズ終了（〜7/18）から8月のラグビーチャンピオンシップ開幕までの間、試合が空く期間に入ることをOwnerが確認した。GPTとの壁打ちで「試合がない期間こそサイト・iOSの品質を上げる好機」という方針が固まり、その最優先項目として本機能が挙がった。

現状のコードを確認したところ、対象週（`homepageWeekMatches`）に試合が0件のとき:
- `components/home-matchday-board.tsx` の `HomeMatchdayBoard` は `matches.length === 0` で即 `return null`（同ファイル93行目）。試合カードが単純に消える
- `app/page.tsx:263-268` のヒーローセクションは `homepageWeekMatches.length > 0` の分岐でレイアウトが変わり、0件時は見出し「今週の海外ラグビーを、日本時間で追う。」とサブコピー「週末に重なる試合を、日程・結果・順位・日本語レビューまで…」だけが残る。実際には「今週」の試合がゼロなのに「今週」を主語にした文言が表示され続け、やや空虚に見える
- 「最近のレビュー」セクション（`app/page.tsx:450`）は `recentReviewGroups.length === 0` でも `shouldShowSampleReview`（`feat-sample-matches-auto-rotation.md`実装済み）が真なら常設サンプルレビューを表示するため、完全な空白にはならない。**この部分は既に対応済みで、本specの対象外**

つまり空白になるのは「今週の注目試合ボード」1箇所であり、そこだけを「次の試合への導線」に差し替えるのが最小のスコープになる。

## スコープ

対象:
- `matches.length === 0` のとき `HomeMatchdayBoard` が `null` を返す代わりに、直近の次戦情報を使った代替カードを表示する
- 新規クエリ関数 `getNextUpcomingMatch()`（`lib/db/queries/matches.ts`。既存の `getNextMatchForCompetition`（同ファイル1146行目）と同じテーブル・JOINパターンを踏襲し、`family`/`season` 絞り込みなしで `status = 'scheduled'` かつ `kickoff_at >= now` を `kickoff_at` 昇順で1件取得する）を追加する
- 代替カードの内容:
  - 「次の試合まであと◯日」のカウントダウン（JST基準）
  - 対戦カード・大会名・キックオフ日時（JST）
  - 試合ページまたは `/calendar` へのリンク
  - お気に入りチーム登録・プッシュ通知設定への導線（実装時に判明: どちらも専用URLページが存在しない。通知設定は `components/user-menu.tsx` 内のモーダルUIのため、`useSearchParams()` で読み取るクエリパラメータ（例: `?notifications=open`）でモーダルを外部から開けるようにする。お気に入り登録は次戦カードの対戦チーム名を `/teams/{slug}` へのリンクにし、チームページ上の既存フォローボタンに委ねる。いずれも新規ページ・新規UIコンポーネントの追加ではない）
- ヒーローセクションの見出し・サブコピー（`app/page.tsx` 263行目付近）を、`homepageWeekMatches.length === 0` のときだけ「今週」を主語にしない代替文言に差し替える（例: 「次の試合まで◯日。日本時間で待つ。」等、具体的な文言はCodexが既存のトーン・文字数感覚に合わせて決めてよい）

対象外:
- 「最近のレビュー」セクション（サンプルレビュー含む）の変更 — 既に `feat-sample-matches-auto-rotation.md` で対応済み
- iOS（tryline-mobile）側の対応 — ホームボードはWeb（tryline）のみの機能のため対象外
- 次戦が1ヶ月以上先になるような極端な閑散期の特別文言分岐（「次の試合まで45日」等でもそのままカウントダウン表示でよく、追加のUI分岐は行わない）
- `getNextUpcomingMatch()` の対象競技を絞り込むフィルタリング（league-one除外等）— 全大会から最短の1件を返す単純な実装とし、除外が必要ならCodexの完了報告で提案してよい

## データモデル変更

なし。既存 `matches` / `teams` / `competitions` テーブルを読み取るのみ。

## API サーフェス

なし。新規HTTP APIは追加しない。`getNextUpcomingMatch()` はサーバーコンポーネント内から直接呼び出すデータ取得関数。

## UI サーフェス

- `components/home-matchday-board.tsx`: `matches.length === 0` のときに `null` を返す代わりに、次戦情報を使った代替UIを返す（同コンポーネント内で分岐するか、`app/page.tsx` 側で `HomeMatchdayBoard` と代替コンポーネントを出し分けるかはCodexの実装判断に委ねる）
- スタイルトークンは `app/globals.css` のCSS変数（`--color-accent` 等、既存の `HomeMatchdayBoard` が使っているものと同じ）を再利用し、新しい色・フォントを追加しない
- 避けるべき表現: 汎用的な「試合がありません」というだけの空状態プレースホルダー。カウントダウン・次戦情報・行動導線（お気に入り登録／通知設定）の3点を必ず含め、「次の観戦に備える期間」に見えるようにする
- **Owner目視確認を受け入れ条件に含める**: 機械的なテスト通過だけでなく、実際に試合が0件の週（または `matches=[]` を強制した状態）でホームを開き、既存のヒーローセクション・下部セクションとのビジュアルの一貫性（余白・階層・トーン）を確認する

## LLM連携

なし。新規LLM呼び出しはゼロ。

## 受け入れ条件

1. `matches.length === 0` を渡したとき、`HomeMatchdayBoard`（または差し替え後のコンポーネント）が `null` を返さず、次戦カウントダウンカードを返す
2. カウントダウンの日数は `Math.ceil` 等でJST基準の日単位になっている（テストでモック日時を使い検証）
3. 対戦カード・大会名・キックオフ日時（JST表記）が正しく表示される
4. `getNextUpcomingMatch()` が `status='scheduled'` かつ `kickoff_at >= now` の中から `kickoff_at` 最小の1件のみを返す（複数大会にまたがる場合も正しく最短のものを選ぶことをテストで検証）
5. 該当する未来の試合が1件も存在しない場合（`getNextUpcomingMatch()` が `null` を返す場合）、代替カードごと非表示になる（クラッシュしない）
6. `homepageWeekMatches.length === 0` のときヒーローの見出し・サブコピーが「今週」を主語にした文言から差し替わる
7. お気に入り登録・通知設定への導線リンクが正しい遷移先を持つ
8. `pnpm tsc --noEmit` / `pnpm lint` / `pnpm test` / `pnpm build` が通る
9. **Owner実機目視**: 試合0件の状態で実際にホームを開き、既存デザインとのトーン・余白の一貫性、カウントダウンカードが「間延び」せず情報密度を保っているかを確認する
10. 本番デプロイはOwner承認後に別途行う

## 未解決の質問

- 代替カードに「前節（直近終了大会）の順位表」まで含めるか（GPTの提案の一部）は、`feat-home-recent-review-competition-status-pane.md` で実装済みの「大会の現在地」ペインと機能が重複する可能性があるため、v1では含めずCodexの完了報告後にOwnerが要否を判断する
- `getNextUpcomingMatch()` が返す試合の大会が、サイトの主要カバー対象外（マイナー大会・地域予選等）だった場合の除外基準は、実データを見てから決める
