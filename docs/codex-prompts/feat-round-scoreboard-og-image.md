`/specs/feat-round-scoreboard-og-image.md` の仕様を実装してください。

コンテキスト:
- プロジェクト規約は `CLAUDE.md` を読む
- 対象は `app/api/og/route.tsx`（既存の `type=competition`〈45行目付近〉・`type=result`〈169行目付近〉の分岐パターンに倣い、新しい `type=round-scoreboard` を追加）と `lib/seo/og-image.ts`（呼び出しヘルパー追加）
- `type=result` 分岐の背景グラデーション（`linear-gradient(135deg, #06111f 0%, #0f172a 100%)`）・フォント指定等の既存スタイルをそのまま流用し、新規デザインをゼロから作らないこと
- この画像が置き換える現状の手動プロセスは `.claude/skills/x-post/SKILL.md` の「データ画像の作り方」セクションに記載されている（スクラッチパッドHTML作成→ローカルサーバー→Playwrightスクショ→クロップという完全手動フロー）。今回はこれを `/api/og` の自動生成に置き換える
- データソースは `matches.home_score`/`away_score` のみ。`match_events` 由来の集計（トライ王ランキング等）は使わない（過去のイベント汚染事故を踏まえた既定方針）

入出力の例:
- `/api/og?type=round-scoreboard&competition_id=<uuid>&round=<number>` にアクセスすると、該当ラウンドの全 finished 試合（home_score/away_score が両方 not null）を1枚の画像にまとめて返す
- 該当試合が0件の場合、エラーで落ちずに適切なフォールバックを返す

処理すべきエッジケース:
- 指定した `competition_id`/`round` に一致する試合が存在しない場合
- ラウンド内の試合数が多い場合（画像内でのレイアウト崩れを避ける。既存の `type=result` のレイアウト定数を参考に、試合数に応じた行間調整を検討してよい）
- 日本語フォント表示（`@vercel/og` はWebフォント読み込み不可の制約があるため、既存の `route.tsx` 内のフォント指定パターンをそのまま使う）

完了の定義:
- specs の受け入れ条件 1〜5 をすべて満たす
- `pnpm tsc --noEmit` / `pnpm lint` / `pnpm test` / `pnpm build` clean
- 試合0件・複数試合・多数試合（レイアウト崩れ確認）のケースでユニットテストまたはスナップショットテストを追加する

要件:
- スコープ対象外（順位表画像、X自動投稿、match_events由来の統計)は実装しない
- 未解決の質問（画像サイズ、Owner側のURL取得方法）について、迷う場合は完了報告で選択肢を提示する。推測しない

完了時:
- 実装内容、変更・新規ファイルを要約する
- 選んだ画像サイズ・レイアウト方針を明記する
- 仕様書からの逸脱があれば理由を明示する
