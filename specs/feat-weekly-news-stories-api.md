# feat-weekly-news-stories-api: 試合非依存「今週のニュース」ストーリーAPI

対象リポジトリ: **tryline**のみ。後続でモバイルUI(`feat-mobile-weekly-news-stories.md`)が本APIに依存する。**実装順は必ずこちら(Web/API)が先、デプロイ後にモバイル側に着手する**。

## 背景

2026-07-26、モバイルの「試合ない期間のニュース表示」検討の一環で、実際にThe Rugby Paper・Premiership Rugby・URC等から今週のラグビーニュースを調べ、Instagram風ストーリー表示のモックアップをOwnerに確認した。方向性の承認を得た。対象は「移籍」「選手・コーチのコメント」「大会の話題」など、特定の試合1件に紐付かないニュース。

`lib/llm/sourced-facts/`の既存機構(試合単位でOpenAI Web検索→`match_sourced_facts`に保存、`lib/llm/sourced-facts/allowlist.ts`で出典ドメインを制限)と技術的な土台は共通だが、決定的な違いが1つある: 既存の`feat-match-stories-news-items.md`は「試合ごとに既に取得済みのfactを転用するだけ(新規LLM呼び出しゼロ)」で実現できたが、**本機能は試合に紐付かないニュースを対象とするため、新規のWeb検索呼び出しが必要**になる。

`therugbypaper.co.uk`は2026-07-26に規約(Terms of Sale・Privacy Policy)とrobots.txtの両方を確認済みで、AIクローラー・スクレイピングを制限する条項は見当たらない(`fix-sourced-facts-allowlist-compliance.md`でMEDIA_DOMAINSに追加済み、PR #643でマージ済み)。本機能はこのドメインを主要な情報源として想定するが、実装は`lib/llm/sourced-facts/allowlist.ts`の`SOURCED_FACT_ALLOWED_DOMAINS`をそのまま再利用し、新たなドメインリストを増やさない。

**CLAUDE.mdの設計不変条件との関係**: 「すべてのコンテンツはmatch_idに紐付く」という不変条件に対し、本機能は文字どおりには抵触する(match_idを持たないニュース項目)。ただし同不変条件の趣旨は「LLM生成物をユーザー単位でなく共有単位でキャッシュし、ユーザー数増加でコストが増えないようにする」ことであり、本機能も**週単位で全ユーザー共有のキャッシュ**とすることでこの趣旨は維持する。文字どおりの条件からの逸脱であることをここに明記し、Ownerの了解のもとで進める(2026-07-26会話内で合意済み)。

## スコープ

対象:
1. 新規テーブル`weekly_news_items`(下記データモデル参照)
2. 新規モジュール`lib/llm/weekly-news/fetch.ts`: `lib/llm/sourced-facts/fetch.ts`と同じ`createWebSearchJsonResponse`ベースのWeb検索を、試合単位ではなく**週単位**で実行する。1回の実行で1〜3回程度のWeb検索呼び出しに収める(既存の試合単位検索が試合数ぶん呼ばれるのに対し、桁違いに少ない呼び出し回数)
3. プロンプトは`lib/llm/sourced-facts/fetch.ts`の`buildSearchPrompt`にある著作権配慮ルールを踏襲する: 15語を超える引用の禁止、記事本文の転載禁止、事実の言い換え必須、出典URL必須
4. 出典ドメインは既存の`isAllowedSourcedFactDomain`(`lib/llm/sourced-facts/allowlist.ts`)でフィルタする。新規ドメインリストは作らない
5. 新規APIエンドポイント`GET /api/v1/stories/weekly-news`: 当該週の`status='published'`な項目のみ返す
6. `lib/api/v1/types.ts`に新規型`V1WeeklyNewsItem`を追加(既存`V1StoryItem`とは別の型。理由は下記「データモデル変更」参照)
7. `app/api/og/route.tsx`に`type=weekly-news`対応を追加: カテゴリ別のトーン背景(チームカラーではない)、スコア非表示、text=noneパターンを踏襲
8. 手動トリガー用のCLIスクリプトまたはroute handler(cron化はOwner判断、下記「未解決の質問」参照)

対象外:
- cronによる完全自動実行(Owner判断待ち。まずは手動実行で数件試し焼きする運用とする。過去の全件draft化事故の教訓を踏まえる)
- レビュー・公開UI(v1は`status`列の直接更新で運用。管理画面は別spec)
- モバイル側のUI実装(`feat-mobile-weekly-news-stories.md`で扱う)
- 既存の`match_sourced_facts`・`V1StoryItem`・`V1StoriesData`・既存stories APIの変更

## データモデル変更

新規テーブル`weekly_news_items`:

```sql
create table weekly_news_items (
  id uuid primary key default gen_random_uuid(),
  week_from date not null,
  week_to date not null,
  category text not null check (category in ('transfer', 'quote', 'competition', 'injury', 'other')),
  title_ja text not null,
  summary_ja text not null,
  source_domain text not null,
  source_url text not null,
  published_at timestamptz,
  fetched_at timestamptz not null,
  confidence text not null check (confidence in ('high', 'medium', 'low')),
  status text not null default 'draft' check (status in ('draft', 'published')),
  model_version text,
  metadata jsonb,
  created_at timestamptz not null default now()
);
```

- `category`はOG画像のトーン背景・カード上のキッカーラベルを決める(モックアップの「移籍」「選手コメント」「大会」相当)
- `week_from`/`week_to`は既存stories APIの週算出ロジック(`V1StoriesData.week`)と揃える
- `status`はOwnerレビュー用のゲート。デフォルト`draft`で、`published`にするまでAPIレスポンスに出ない

**なぜ`V1StoryItem`を再利用しないか**: `V1StoryItem.destination`は`{ type: "match"; url: string }`とリテラル型で固定されており、ニュース項目には「試合詳細への遷移」に相当する行き先がない(「出典記事を開く」が主アクション)。既存型・既存stories APIのレスポンス構造を変更するとモバイル側の既存story描画コードに影響するリスクがあるため、新規の並行した型として追加する。

## API サーフェス

```ts
// lib/api/v1/types.ts に追加
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

`GET /api/v1/stories/weekly-news` → `V1WeeklyNewsData`。0件でも200(空配列)を返す(既存stories APIの挙動と揃える)。

`GET /api/og?type=weekly-news&category=<category>&item=<id>&orientation=<landscape|portrait>` → カテゴリ別トーン背景の画像。試合名・スコアは描画しない。

## LLM 連携

- パイプライン段階: 新規(既存4段階パイプラインとは別系統。事実収集のみで、ナラティブ生成・品質チェック段階は持たない軽量パイプライン)
- モデル: `MODELS.WEB_SEARCH`(`lib/llm/sourced-facts/fetch.ts`と同一。`lib/llm/models.ts`経由、直書き禁止)
- プロンプト: `lib/llm/sourced-facts/fetch.ts`の`buildSearchPrompt`の著作権ルール(15語超引用禁止・記事転載禁止・言い換え必須・出典URL必須)を流用し、search intentを「今週の移籍・コメント・大会関連ニュース、対象6大会(Six Nations・Premiership・URC・Top14・SRP・RWC/Nations Championship)」に変更する
- レスポンススキーマにJSON項目`category`を追加させ、`"transfer"|"quote"|"competition"|"injury"|"other"`のいずれかを返させる(不明な値はother扱い)
- 出典ドメインは`isAllowedSourcedFactDomain`でフィルタ。フィルタ後0件でもエラーにしない(次回実行を待つ)
- 全項目`status='draft'`で保存。`published`への変更はOwnerが個別に確認して行う(v1は手動SQL、CLAUDE.mdのDB操作ルールに従う)

## 受け入れ条件

1. `lib/llm/weekly-news/fetch.ts`が週単位で1〜3回のWeb検索呼び出しを行い、`weekly_news_items`に`status='draft'`で保存する(試合数に比例した回数を呼ばないことをテストで確認)
2. 出典ドメインが`SOURCED_FACT_ALLOWED_DOMAINS`外の項目は保存されない
3. プロンプトが15語超の引用禁止・記事転載禁止・出典URL必須のルールを含む(既存`buildSearchPrompt`との一貫性をテストで確認)
4. `GET /api/v1/stories/weekly-news`が当該週の`status='published'`項目のみを返す(`draft`は含まれない)
5. `GET /api/v1/stories/weekly-news`は0件でも200・空配列を返す
6. `GET /api/og?type=weekly-news&category=transfer&item=...`が200を返し、スコア・試合名を含まない画像を生成する。`category`不正値は`other`のトーンにフォールバックする
7. 既存の`/api/v1/stories`・`V1StoryItem`・`V1StoriesData`のテストが無変更で通る(既存stories APIに影響がないことの確認)
8. `pnpm tsc --noEmit` / `pnpm lint` / `pnpm test` / `pnpm build` が通る

## 未解決の質問

1. **コスト**: 週1〜3回のWeb検索呼び出しの実際の$コストはCodex実装時点でOwnerが確認する(既存`match_sourced_facts`の実績$と比較して、試合単位検索より桁違いに少ないことは構造的に保証されるが、正確な数字は未確定)。本番cron化はこの数字を見てからOwnerが判断する
2. `status`を`draft`→`published`に切り替える運用フロー(v1は手動SQLか、簡易スクリプトか)はCodexの実装判断に委ねる。迷う場合は完了報告で質問として提示する
3. カテゴリ分類(`transfer`/`quote`/`competition`/`injury`/`other`)をLLM任せにするか、キーワードベースの後処理で補正するかは、実装後の実データを見てOwnerが判断する
4. `docs/notes/news-digest-YYYY-MM-DD.md`(週末ニュースダイジェスト、`feat-news-digest-sourced-facts-bridge.md`参照)との重複可能性がある。両者は目的が異なる(ダイジェストは試合単位のsourced_facts補完、本機能は独立したニュース表示)ため当面は別系統のまま進めるが、将来的な統合要否はOwner判断
