# feat-weekly-news-dual-focus-search: 週間ニュース検索を2系統に分割

対象リポジトリ: **tryline**のみ。`feat-weekly-news-stories-api.md`(PR #645)・`fix-weekly-news-freshness-filter.md`(PR #647、マージ・デプロイ済み)の後続。

## 背景

2026-07-26、本番で2回試し焼きしたところ、1回目は1件(結果的に鮮度フィルタで除外)・2回目は0件と、取得件数が非常に少なかった。原因は単一の検索呼び出しで「移籍」「選手・コーチのコメント」「大会」「負傷」の4種類の話題を同時に探させていることだと考えられる。`temperature: 0`で呼んでいるため、同じプロンプトを単純に複数回リピートしても新しい記事を拾える見込みは薄い。

既存の`lib/llm/sourced-facts/fetch.ts`が`content_type`(preview/recap)で検索意図を分けているのと同様に、検索意図を2系統に分割して呼び出し回数を2回にすることで、各回がより狭く深く探索できるようにする。

## スコープ

対象:
1. `buildWeeklyNewsSearchPrompt`に`focus: "player" | "competition"`引数を追加し、search intentを分割する:
   - `"player"`: 選手・コーチ関連(移籍・契約ニュース、選手・コーチのコメント)
   - `"competition"`: 大会関連(大会・トーナメントの動向、今後の試合に影響する負傷情報)
2. `fetchWeeklyNews`が`createWebSearchJsonResponse`を**focusごとに1回ずつ、計2回**呼び出す
3. 2回分の結果を`source_url`で正規化(小文字化・末尾スラッシュ除去)して重複排除してから`weekly_news_items`にinsertする
4. 既存の鮮度フィルタ・許可ドメインフィルタ(`parseWeeklyNewsResponse`)は両方の呼び出し結果に同一のロジックで適用する(focus別に別実装を作らない)

対象外:
- 呼び出し回数を3回以上に増やすこと(今回は2回に留め、実績を見て追加検討する)
- モバイル側の変更
- `weekly_news_items`のテーブル定義変更

## データモデル変更

なし。

## API サーフェス

なし(`GET /api/v1/stories/weekly-news`のレスポンス形状は変更しない)。

## LLM 連携

- `MODELS.WEB_SEARCH`を**週2回**呼び出す(従来の1回から倍増)。既存の許可ドメインフィルタ・著作権配慮ルール(15語超引用禁止・記事転載禁止・言い換え必須)・鮮度フィルタ(`fix-weekly-news-freshness-filter.md`)は両方の呼び出しに共通して適用する
- 2回の呼び出し結果は`source_url`(正規化後)で重複排除してから保存する。同一記事が両方のfocusで拾われた場合、1件のみ採用する(採用順序はCodexの実装判断に委ねる)

## 受け入れ条件

1. `fetchWeeklyNews`が1回の実行で`createWebSearchJsonResponse`をちょうど2回呼び出す(テストで呼び出し回数を検証)
2. `"player"`focusのプロンプトに移籍・コメント関連の検索意図が含まれ、大会・負傷関連の意図は含まれない(逆も同様)。テストで両focusのプロンプト内容を検証する
3. 両方の呼び出し結果に対して既存の鮮度フィルタ・許可ドメインフィルタが適用される(片方だけ緩い、ということがない)
4. 同一`source_url`(大文字小文字・末尾スラッシュの差異を正規化した上で)が両方の呼び出し結果に含まれる場合、`weekly_news_items`には1件のみinsertされる(テストで重複排除を検証)
5. 既存の`tests/llm/weekly-news.test.ts`が(今回の呼び出し回数変更に合わせた更新を含めて)全て通る
6. `pnpm tsc --noEmit` / `pnpm lint` / `pnpm test` / `pnpm build` が通る

## 未解決の質問

- 週2回のWeb検索呼び出しの実際の$コストはCodex実装後にOwnerが試し焼きで確認する。従来の1回から倍増するが、絶対額としては引き続き小さい想定(試合単位の`sourced_facts`検索と比べて桁違いに少ない)
- 2回に分割しても件数が十分増えない場合、3回以上への拡張・focus粒度の見直しをOwner判断で検討する
