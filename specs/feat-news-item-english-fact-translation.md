# news item の英語 sourced_facts を日本語ニュース文体に翻訳して掲載対象に加える

## 背景

Owner から「海外サイトのニュースを LLM で日本語にまとめてプレビューやレビューに活かしたら価値が生まれるのでは」との指摘(2026-07-19、`feat-recap-density-rewards-sourced-facts.md` 対応後)。これを受けて `match_sourced_facts` の実データを確認した。

**確認済みの事実**(2026-07-19 実測、SQL確認済み):

| content_type | confidence | 日本語fact | 英語fact |
|---|---|---|---|
| preview | high | 19 | 2 |
| preview | medium | 4 | 23 |
| recap | high | 2 | 38 |
| recap | medium | 0 | 50 |

- news item(`feat-match-stories-news-items.md`、実装済み・稼働中)は **`content_type in ('preview','shared')` かつ `confidence = 'high'` かつ日本語判定(ひらがな/カタカナ含有)** の fact のみを対象にしている(`app/api/v1/stories/route.ts` の `JAPANESE_CHARACTER_PATTERN` フィルタ)。この母集団(21件)はすでに大半が日本語(19件)であり、翻訳しても増分はごく小さい
- 一方 **confidence=medium の preview fact は英語23件・日本語4件**と英語が大多数で、news item には一切使われていない(未活用)。これが実質的な機会損失
- recap の facts(英語中心)は news item の対象外のまま(結果を含みうるため kickoff 前ゲートの対象にならない。`content_type in ('preview','shared')` 限定は維持)
- `confidence in ('high','medium')` は recap/preview 本文生成側の QA(`lib/db/queries/sourced-facts.ts` の `countFactsForContentType`)がすでに採用している基準と同じであり、news item だけ high 限定にしている理由は仕様上明記されていない(v1 スコープの単純化のみ)

## スコープ

対象:
1. `lib/llm/sourced-facts/fetch.ts` の **preview 用検索プロンプトのみ**(`buildSearchPrompt` の `contentType !== "recap"` 分岐)に、fact ごとに `fact_ja`(自然な日本語ニュース文体の言い換え、目安80〜160字)を同一の JSON レスポンス内で返させる指示を追加する。**追加の LLM 呼び出しは発生しない**(既存の web search 呼び出し1回の出力に1フィールド追加するのみ)
2. `match_sourced_facts` テーブルに `fact_ja text null` カラムを追加し、`fetch.ts` の insert 時に保存する
3. news item の選定ロジック(`app/api/v1/stories/route.ts`)の対象を拡張する:
   - confidence フィルタを `high` のみから `in ('high','medium')` に拡張(本文生成側と基準を揃える)
   - 採用条件を「元の fact が日本語」**または**「`fact_ja` が非 null」に拡張
   - 表示テキストは `fact_ja ?? fact` を使う(日本語originalには影響なし、英語originalは翻訳文を表示)
4. `lib/db/queries/sourced-facts.ts` の `getStorySourcedFactsForMatches` に `fact_ja` カラムの select と `factJa` フィールドを追加

対象外:
- recap 用検索プロンプトへの `fact_ja` 追加(recap facts は news item に使われないため、このspecでは不要。将来「試合後ニュース」(ラダー3、別spec)で必要になったら追加検討)
- confidence=`low` を news item 対象に含めること(現状どおり除外)
- 既存(このspec以前に取得済み)の fact に対する `fact_ja` の遡及バックフィル。**今後の週次リフレッシュで新規取得される fact から段階的に翻訳文が付与される**。既存 fact は `fact_ja is null` のまま従来どおり日本語判定でのみ拾われる(非破壊)
- news item の掲載件数上限(`MAX_NEWS_ITEMS_PER_MATCH = 3`)・ドメイン重複排除ロジックの変更
- recap の `information_density` 変更(`feat-recap-density-rewards-sourced-facts.md` で対応済み・別件)

## データモデル変更

```sql
alter table public.match_sourced_facts add column if not exists fact_ja text;
```

- nullable、既存行への影響なし(default 無し = NULL)
- **⚠️ マイグレーション適用順序(重要)**: このリポジトリでは過去3回、コードが先にデプロイされマイグレーション未適用のまま本番リクエストが失敗する事故が発生している(直近は 2026-07-19 の `players.name_ja`)。本PRをマージする前に、Owner または Codex がこのマイグレーションを本番 Supabase に適用済みであることを確認すること。`getStorySourcedFactsForMatches` の select 文に `fact_ja` を含めるコードがデプロイされた時点でカラムが存在しないと、stories API 全体(preview/result/recap を含む全 story item)が 500 になる

## API サーフェス

`lib/api/v1/types.ts` の `V1StoryItem` に変更なし(`summary` フィールドの中身が変わるだけで、型定義自体は既存のまま)。`fact_ja` は DB 内部用のフィールドであり、API レスポンスに直接露出しない(`source_domain` は既存どおり露出したまま)。

## UI サーフェス

変更なし。news item の表示コンポーネント(Web `app/api/og/route.tsx`、iOS `MatchStoriesSection.tsx`)は `summary` テキストを表示するのみで、翻訳元が日本語か英語かを意識しない。

## LLM 連携

- 対象ステージ: sourced facts 取得(`fetch.ts`、`fetchSourcedFactsForMatch`)の **preview 用呼び出しのみ**
- モデル: `MODELS.WEB_SEARCH`(`gpt-4o`)。既存呼び出しに準拠、変更なし
- **追加コスト**: 新規の API 呼び出しは発生しない。既存の1回の web search 呼び出しの出力に、fact ごとに `fact_ja`(目安100〜150トークン)を追加するのみ。最大 `MAX_STORED_FACTS=8` 件 × 150トークン ≒ 1,200トークン増 × $10/1M(gpt-4o output)= **1試合あたり約$0.012の増分**。週次リフレッシュの対象試合数(直近実績: 週あたり十数試合)を掛けても週$0.2以下で無視できる規模
- プロンプトルール(捏造防止)は維持: `fact_ja` は `fact` の言い換えに限定し、`fact` にない情報を翻訳時に付け加えてはならない旨を明記する

## 受け入れ条件

1. `buildSearchPrompt`(preview分岐)が `fact_ja` を JSON スキーマに含めるよう指示していることを確認するテストがある
2. `fetch.ts` が web search レスポンスの `fact_ja` を `match_sourced_facts.fact_ja` に保存することを確認するテストがある(`fact_ja` が欠落・空文字の場合は `null` として保存し、エラーにしない)
3. `app/api/v1/stories/route.ts` の news item 選定が、confidence `medium` かつ `fact_ja` ありの英語 fact を採用し、`summary` に `fact_ja` の内容が使われることを確認するテストがある
4. 既存の「日本語 fact かつ confidence=high」のケースが従来どおり採用され、`summary` に(`fact_ja` が null のため)元の `fact` が使われることを確認する既存テストが壊れていない
5. `confidence='low'` の fact が引き続き news item から除外されることを確認するテストがある
6. `pnpm test` / `pnpm tsc --noEmit` / `pnpm lint` が通る
7. マイグレーション適用後、対象試合(sourced_facts に confidence=medium の英語factを持つ試合)で news item の掲載件数が変更前より増えていることを本番で目視確認する(Owner確認)

## 未解決の質問

- confidence=medium の fact を news item に含めることで、稀に確度がやや低い情報が「確定情報」のような見た目で配信される可能性がある。本文生成(recap/preview)では既に medium を許容しているため基準は揃うが、news item は単独カード表示で文脈(出典)が薄いため、実際の掲載後にOwnerが違和感を感じたら medium 除外に戻す判断もありうる
- `fact_ja` が既存 fact に付与されるまで(新規取得分から段階的)、当面は「新しく取得された試合ほど news item が増える」という過渡的な状態になる。急ぎ増やしたい場合は別途バックフィルスクリプトの要否を判断する(本specではスコープ外)
