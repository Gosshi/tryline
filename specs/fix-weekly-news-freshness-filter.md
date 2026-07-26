# fix-weekly-news-freshness-filter: 「今週のニュース」の鮮度フィルタ

対象リポジトリ: **tryline**のみ。`feat-weekly-news-stories-api.md`(PR #645、マージ・デプロイ済み)の直後のフォローアップ。

## 背景

2026-07-26、本番環境で`scripts/fetch-weekly-news.ts`相当の処理を試し焼きしたところ、対象週(2026-07-20〜26)に対して`published_at: 2026-06-30`(3週間以上前)の移籍ニュースが1件だけ取得された。Owner確認の結果、「その週のニュースにしてほしい」というフィードバックを得た。

`lib/llm/weekly-news/fetch.ts`の`buildWeeklyNewsSearchPrompt`はプロンプト内で対象週(`week: ${weekFrom} through ${weekTo} (JST)`)を伝えてはいるが、「その期間内に公開されたニュースのみ返す」という明示的な制約になっておらず、LLMが期間外の古いニュースも「関連する話題」として返してしまう。また`parseWeeklyNewsResponse`にはコード側の鮮度フィルタが一切なく、`published_at`がどんな値でも(nullでも)そのまま採用される。

## スコープ

対象:
1. `buildWeeklyNewsSearchPrompt`に、対象週内に公開されたニュースのみを対象とする明示的な指示を追加する
2. `parseWeeklyNewsResponse`(または`fetchWeeklyNews`)に、`published_at`に基づくコード側の鮮度フィルタを追加する:
   - `published_at`が`weekFrom`(JST 00:00)より前の項目は除外する
   - `published_at`が`null`の項目も除外する(公開日が確認できないニュースは「今週のニュース」として採用しない)
3. 既存の`buildWeeklyNewsSearchPrompt`・`parseWeeklyNewsResponse`のテストに、鮮度フィルタの動作を検証するケースを追加する

対象外:
- `weekTo`より未来の`published_at`(通常発生しないため今回は特別扱いしない。異常値としてそのまま許容する)
- 検索呼び出し回数・許可ドメインリストの変更
- モバイル側の変更

## データモデル変更

なし。

## API サーフェス

なし(`GET /api/v1/stories/weekly-news`のレスポンス形状は変更しない。返る項目の質が変わるのみ)。

## LLM 連携

- `buildWeeklyNewsSearchPrompt`のSearch intentセクションに以下を追加する: 「対象週(`weekFrom`〜`weekTo`、JST)に公開されたニュースのみを対象とすること。それより古いニュースは、たとえ話題として関連していても対象外とすること」という趣旨の英語指示(既存プロンプトの言語に合わせる)
- `parseWeeklyNewsResponse`のフィルタ条件に、`published_at`が`weekFrom`(JST 00:00をUTCに変換した時刻)以降であることを追加する。`published_at`が`null`または不正な日時形式の項目は破棄する(既存の`normalizePublishedAt`は不正値を`null`に正規化するが、今回は`null`になった時点でアイテム自体を除外する扱いに変更する)

## 受け入れ条件

1. `weekFrom`より前の`published_at`を持つ項目は`parseWeeklyNewsResponse`の結果から除外される(テストで検証: 対象週より3週間前の日付を持つ項目が除外されることを確認)
2. `published_at`が`null`または不正な日時文字列の項目も除外される(テストで検証)
3. `weekFrom`〜`weekTo`の範囲内の`published_at`を持つ項目は従来どおり採用される(既存テストが通ることで確認)
4. プロンプトに「対象週内に公開されたニュースのみ」という趣旨の文言が含まれる(テストで文言の存在を確認)
5. 既存の`tests/llm/weekly-news.test.ts`が(今回の変更に合わせた更新を含めて)全て通る
6. `pnpm tsc --noEmit` / `pnpm lint` / `pnpm test` / `pnpm build` が通る

## 未解決の質問

- `published_at`必須化によって取得件数がさらに減る可能性がある(今回の試し焼きでも1回の検索で1件のみだった)。実データでの件数への影響はCodex実装後にOwnerが再度試し焼きして確認する
