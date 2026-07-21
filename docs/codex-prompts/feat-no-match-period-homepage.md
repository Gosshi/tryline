`/specs/feat-no-match-period-homepage.md` の仕様を実装してください。

コンテキスト:
- プロジェクト規約は `AGENTS.md` を読む
- 2026-07-21、ネーションズチャンピオンシップ2026終了(〜7/18)から8月のラグビーチャンピオンシップ開幕までの間、対象週に試合がない期間に入ることをOwnerが確認した
- 現状 `components/home-matchday-board.tsx` の `HomeMatchdayBoard` は `matches.length === 0` のとき `null` を返し、試合カードが単純に消える。`app/page.tsx` のヒーローセクションも「今週」を主語にした文言が0件時にも残る

やること:
- 新規クエリ関数 `getNextUpcomingMatch()` を `lib/db/queries/matches.ts` に追加する。既存の `getNextMatchForCompetition`（同ファイル1146行目）と同じテーブル・JOINパターンを踏襲し、`family`/`season` の絞り込みなしで `status = 'scheduled'` かつ `kickoff_at >= now` を `kickoff_at` 昇順で1件取得する
- `matches.length === 0` のとき `HomeMatchdayBoard`（または差し替え用の新コンポーネント）が、`getNextUpcomingMatch()` の結果を使った代替カードを返すようにする。内容は「次の試合まであと◯日」のカウントダウン（JST基準）、対戦カード・大会名・キックオフ日時、試合ページ/`/calendar`へのリンク、お気に入りチーム登録・プッシュ通知設定への導線リンク
- `app/page.tsx` のヒーロー見出し・サブコピー（263行目付近）を、`homepageWeekMatches.length === 0` のときだけ「今週」を主語にしない代替文言に差し替える

処理すべきエッジケース:
- `getNextUpcomingMatch()` が `null`（未来の試合が1件もない）を返す場合、代替カードごと非表示にする。クラッシュさせない
- カウントダウンの日数計算はJST基準で行う（UTC基準のずれで日付がずれないよう注意）
- 次戦が翌日・当日である場合の表示文言（「あと0日」等）が不自然にならないようにする

完了の定義:
- specの受け入れ条件1〜10を満たす（9番目のOwner目視確認は、実装後にスクリーンショットを添えて報告し、Owner確認を待つ形でよい）
- `pnpm test` / `pnpm tsc --noEmit` / `pnpm lint` / `pnpm build` clean
- 変更ファイル一覧を報告する

要件:
- スタイルトークンは `app/globals.css` の既存CSS変数（`--color-accent` 等）を再利用し、新しい色・フォントを追加しない
- 汎用的な「試合がありません」だけの空状態プレースホルダーにしない。カウントダウン・次戦情報・行動導線の3点を必ず含める
- 「最近のレビュー」セクション（サンプルレビュー含む）は変更しない
- iOS（tryline-mobile）側の対応は対象外
- `getNextUpcomingMatch()` に大会フィルタ（league-one除外等）は入れず、シンプルに最短の1件を返す実装にする
- 曖昧な箇所や仕様書と実環境の食い違いがあれば、その場で実装を停止して質問する

完了時:
- 実装内容・変更ファイルを要約する
- 試合0件を強制した状態でのホームのスクリーンショット（デスクトップ・375px幅）を添付する
- 仕様書からの逸脱があれば理由を明示する
- 未解決の質問があれば記載する
