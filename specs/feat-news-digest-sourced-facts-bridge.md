# 週末ニュースダイジェストの調査結果をsourced_factsに橋渡しする

## 背景

2026-07-10〜11、週末ニュースダイジェスト（金曜18:00 JST発火のルーティン、Web検索でメンバー発表・負傷情報を収集し`docs/notes/news-digest-YYYY-MM-DD.md`として`draft:` PRを作る）と、サイト自身のプレビュー生成が使う`sourced_facts`（試合単位でOpenAI Web検索を自動実行し`match_sourced_facts`テーブルに保存、`feat-sourced-facts-nations-championship.md`で今週Nations Championshipに有効化）が、**互いに接続されておらず、同じ種類の調査を独立に重複して行っている**ことが判明した。

`docs/notes/news-digest-2026-07-10.md`の実データを確認したところ、以下の形式で事実が記載されている:

```
- **事実**: 日本代表の先発は、主将LOワーナー・ディアンズ（BL東京）...
  確度: 公式発表／出典: [日本ラグビーフットボール協会 登録メンバー発表](https://www.rugby-japan.jp/news/54051)／確認日時: 2026-07-10（JST）
```

この形式は`match_sourced_facts`テーブルの`fact`/`confidence`/`source_url`とほぼ1対1で対応可能。ただしダイジェストが引用するソース（ESPN・ラグビーリパブリック・Yahoo!ニュース等）の一部は、`lib/llm/sourced-facts/allowlist.ts`の`SOURCED_FACT_ALLOWED_DOMAINS`（world.rugby・BBC・RugbyPass・PlanetRugby等）に含まれていない。

ダイジェストの内容を`match_sourced_facts`に取り込めれば、(a) プレビュー/レビューがダイジェストの発見（スタメン変更・負傷情報等）を直接活用でき、(b) 既に事実が存在する試合では`sourced_facts`のキャッシュ判定（`shouldUseCachedFacts`）により重複するOpenAI Web検索が走らず、コスト削減にもなる。

## スコープ

対象:
- `docs/notes/news-digest-YYYY-MM-DD.md`形式のファイルをパースし、「事実」ブロック（`確度:`・`出典:`・`確認日時:`を含むもの）を抽出するパーサーを実装する
- 抽出した各事実について、ダイジェスト内の見出し（対戦カード名・日本語チーム名）とキックオフ日時から`matches`テーブルの該当試合を特定する（チーム名の日本語表記マッチング + 日付の近接一致）
- 抽出した事実の出典ドメインを、既存の`isAllowedSourcedFactDomain`（`lib/llm/sourced-facts/allowlist.ts`）でフィルタする。許可ドメイン外の事実は取り込まず、除外件数を実行結果に明記する
- フィルタを通過した事実を`match_sourced_facts`テーブルに`content_type='preview'`・`confidence`（ダイジェストの「確度」ラベルをhigh/medium/lowにマッピング）・`source_url`・`source_domain`・`fetched_at`（インポート実行日時）で保存する
- 上記処理をCLIスクリプト（`scripts/import-news-digest-facts.ts`）として実装する。**Ownerがダイジェストのdraft PRをレビュー・マージした後に手動実行する**運用とし、完全自動化（cron化）は本specの対象外とする

対象外:
- ダイジェスト生成ルーティン自体の変更（既存のまま。本specはその成果物を後から取り込むだけ）
- 許可ドメインリストへの新規ドメイン追加（ESPN等を許可リストに加えるかはOwner判断。加えたい場合は別途`SOURCED_FACT_ALLOWED_DOMAINS`を編集する形で対応し、本spec内では扱わない）
- インポート処理の完全自動化・cron化（Owner承認の手動実行に留める）
- ダイジェスト側のフォーマット自体の変更

## データモデル変更

なし（既存`match_sourced_facts`テーブルをそのまま使用）。

## API サーフェス

なし（CLIスクリプトのみ）。

## 受け入れ条件

1. `scripts/import-news-digest-facts.ts --file=docs/notes/news-digest-2026-07-10.md --dry-run`で、実際のダイジェストファイルから抽出された事実件数・マッチした試合・除外された事実（許可ドメイン外）の一覧が表示される
2. 許可ドメイン内の事実のみが`match_sourced_facts`に保存され、許可ドメイン外（例: ESPN）の事実は保存されずに除外件数として報告される
3. 試合の特定に失敗した事実（チーム名・日付が一致する試合が見つからない）は、保存せずにエラーまたは警告として一覧化される
4. 既に同じ`match_id`・`fact`の組み合わせが`match_sourced_facts`に存在する場合、重複挿入されない（既存の`onConflict: "match_id,fact"`相当の挙動を踏襲する）
5. `pnpm tsc --noEmit` / `pnpm lint` / `pnpm test` / `pnpm build` が通る
6. 本番DBへの実際の書き込みはOwner承認後に別途実施する。本spec自体はスクリプト実装・テスト・`--dry-run`確認までで完了とする

## 未解決の質問

- ダイジェストの「確度」ラベル（公式発表／複数ソース一致／単一ソース報道等）を`match_sourced_facts.confidence`（high/medium/low）へどうマッピングするかは、Codexの実装判断に委ねる。迷う場合は完了報告で質問として提示する
- 将来的にインポートを自動化（cron化）する場合、ダイジェストPRがマージされたことをどう検知するか（GitHub Actions等）は別specの候補とする
