`/specs/feat-indexnow-hub-expansion.md` の仕様を実装してください。

コンテキスト:
- プロジェクト規約は `AGENTS.md` を読む
- `lib/llm/pipeline.ts`のIndexNow送信箇所は現状、コンテンツ公開時に個別試合ページのURLのみ`submitUrlsToIndexNow`に渡している
- **重要**: `assembled.match.round`という直接フィールドは存在しない。round情報は常に`external_ids`（JSON列）に格納されている。既存の非公開関数`getRoundFromExternalIds()`（`lib/db/queries/matches.ts:491`）が正しい正規化・検証ロジック（整数、または数字のみの文字列のみ許可。それ以外はnull）を持っているため、これを`export`して再利用する（単純な`round ?? wikipedia_round`の取り出しだけでは不正な値をそのまま節URLに埋め込むリスクがある）
- またLeague Oneにも節ハブページが存在するため、league-oneをround送信から除外する理由はない

やること:
- `lib/db/queries/matches.ts`の`getRoundFromExternalIds()`を`export`する
- `lib/llm/pipeline.ts`の`persistedStatus === "published"`時のIndexNow送信箇所で、`urls`配列に以下を追加する:
  - 大会ハブページ: `${SITE_URL}/c/${family}/${season}`（`assembled.match.competition`からfamily・seasonを取得）
  - 節ハブページ: `${SITE_URL}/c/${family}/${season}/round/${round}`（exportした`getRoundFromExternalIds()`で正規化。取得できた場合はファミリーを問わず追加する）
  - カレンダーページ: `${SITE_URL}/calendar`
- roundの取得に`external_ids`が必要な場合、既にpipeline内のスコープにあればそれを使い、無ければ小さな追加クエリ（`matches`テーブルの`external_ids`列を対象matchIdで取得）で対応する

処理すべきエッジケース:
- `family`・`season`・`round`のいずれかが取得できない場合、そのURLの追加だけをスキップし、既存の試合ページURL送信は継続する
- league-oneを含む、roundが正規化できた大会は全てround URLの対象にする
- `getRoundFromExternalIds()`に数値・数字文字列・null・不正文字列（例: `"R1"`）を渡した各パターンのテストを用意する（既存テストの流用可）

完了の定義:
- specの受け入れ条件1〜6を実装する（7番目「本番デプロイはOwner承認後」はOwner側の事項であり、Codexの完了条件には含めない）
- `pnpm test` / `pnpm tsc --noEmit` / `pnpm lint` / `pnpm build` clean
- 変更ファイル一覧を報告する

要件:
- IndexNow送信のトリガー条件自体（コンテンツ公開時のみ）は変更しない
- IndexNow以外の送信先は追加しない
- **動作確認は`submitUrlsToIndexNow`をモックした単体テストで行う。実際のコンテンツ公開をトリガーして未キャッシュのLLM呼び出しや実際のIndexNow APIへの送信を発生させない**（コスト・外部送信の観点で避ける）
- 曖昧な箇所や仕様書と実環境の食い違いがあれば、その場で実装を停止して質問する

完了時:
- 実装内容・変更ファイルを要約する
- モックテストで`urls`配列に何が含まれたかの確認結果を報告に含める
- 仕様書からの逸脱があれば理由を明示する
- 未解決の質問があれば記載する
