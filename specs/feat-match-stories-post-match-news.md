# feat-match-stories-post-match-news: match storiesの試合後ニュース（Phase 2）

対象リポジトリ: **tryline（Web/API）のみ**。iOS（tryline-mobile）は既存の `contains_result` 汎用ロジックで自動対応するため追加実装は原則不要（後述）。

## 背景

`feat-match-stories-news-items.md`（Phase 1、マージ済み）は「未解決の質問」で次のように明記していた:

> 試合後ニュース（POTM・出場停止等）はspoiler guardとの連動設計（contains_resultの判定方法）を含めてPhase 2 specで扱う

2026-07-21、OwnerがGPTと壁打ちした内容をClaude Codeが実コードで検証したところ、以下が確認できた:

- `app/api/v1/stories/route.ts` の `buildNewsItems()` は `contentType === "preview" || "shared"` かつ `fetchedAt < kickoffAt` の事実のみをnews item化しており、`recap`（試合後）の事実は対象外
- `lib/llm/sourced-facts/fetch.ts` の `buildSearchPrompt()` は、`contentType === "recap"` のとき既に「公式戦後スタッツ・POTM・記録/マイルストーン・負傷・イエロー/レッドカードと出場停止・監督/主将の試合後コメント」を検索意図に含めている（`searchIntent`のrecap分岐）。**ただしこの分岐には `fact_ja`（日本語言い換え）生成の指示が入っていない**（preview分岐にのみ存在）
- DB実測（`match_sourced_facts`）: `preview` 48件・`recap` 95件とも `fact_ja` は現状**全件null**
- 一部のnews itemが日本語で表示できているのは、`fact_ja` ではなく生の `fact` 列自体が日本語文字を含むケースを拾う独立したフォールバック条件（`JAPANESE_CHARACTER_PATTERN.test(candidate.fact)`）による。これは `preview/shared` のみに効く偶発的な経路であり、`recap` には適用されない
- mobile側 (`tryline-mobile/src/stories/storyModel.ts`) の spoiler guard判定は `spoilerGuard && match.status === "finished" && item.contains_result && !revealedMatchIds.has(match.id)` という **`contains_result` 汎用ロジック**で、story item の `type` を問わない。既存の `result`/`recap` タイプは既に `contains_result: true` を設定しており（`app/api/v1/stories/route.ts` 183行目・212行目）、同じ扱いを `news` タイプの試合後版にも適用すれば mobile側の追加実装は不要

## スコープ

対象:
- `lib/llm/sourced-facts/fetch.ts` の `buildSearchPrompt()` で `contentType === "recap"` の `contentTypeRules` に、preview分岐と同様の `fact_ja` 生成指示（「80〜160字の自然な日本語ニュース調の言い換え、内容の追加・推測は禁止」）を追加する
- `app/api/v1/stories/route.ts` の `buildNewsItems()`（または試合後版として新設する関数）で、`contentType === "recap"` の事実も対象に含める:
  - `fetchedAt < kickoffAt` の制約は外す（recapの事実は試合後に取得されるため構造的に成立しない）
  - `confidence === "high"` の閾値はPhase 1と同じ基準を維持する（カテゴリ別の確度基準は導入しない。未解決の質問に記載）
  - 日本語判定条件（`JAPANESE_CHARACTER_PATTERN.test(fact) || factJa非空`）、同一 `source_domain` の重複排除、1試合あたり上限3件のロジックはPhase 1と同じものを再利用する
  - 生成する item は `contains_result: true`、`type: "news"`、タイトルは既存と同じ `ニュース｜<対戦カード>` 形式
- 表示順を「`preview` → 試合前 `news`（`contains_result: false`）→ `result` → `recap` → 試合後 `news`（`contains_result: true`）」に更新する
- 1試合あたりのitems上限（現行6: preview1 + news3 + result1 + recap1）を、試合後news最大3件を加えた**上限9**に引き上げる

対象外:
- iOS（tryline-mobile）側の追加実装 — `contains_result` 汎用ロジックが既に効くため不要と判断する。ただしCodexは実装完了後、実際にmobileでrecap由来のnews itemがspoiler guard対象ユーザーにブラー表示されることを確認し、もし個別実装が必要だと分かった場合は完了報告に明記する
- GPTが提案したカテゴリ別確度基準（「出場停止確定は公式ソース必須」「負傷・監督コメントは公式または複数ソース」等の細分化）— `match_sourced_facts` にカテゴリを区別するフィールドがなく、導入には `fetch.ts` のLLM出力スキーマ変更が必要になるため、v1では見送る（未解決の質問に記載）
- 既存95件の `recap` sourced facts（`fact_ja` が null のまま）のバックフィル・再取得 — 新規取得分から `fact_ja` が入り始める設計とし、過去分の再取得は別途Owner判断（未解決の質問に記載）
- 「試合がない閑散期のニュースフィード」（チーム/大会単位のローリング更新）— これは match stories とは異なる取得単位・表示単位になるため、必要なら別specとする

## データモデル変更

なし。既存 `match_sourced_facts` テーブル（`content_type='recap'` は既存の値）をそのまま使用する。

## API サーフェス

`GET /api/v1/stories` のレスポンスに変更あり（追加的・後方互換）:
- 既存の `V1StoryItemType`（`"preview" | "news" | "result" | "recap"`）に変更なし。`news` タイプの `contains_result` が `true` になるケースが新たに発生する点のみが変更（クライアントは既に `contains_result` を汎用的に見ているため後方互換）
- 1試合あたりの `items` 配列の要素数上限が6→9に変わる

## LLM連携

- 対象: `lib/llm/sourced-facts/fetch.ts` の recap用検索プロンプト（`MODELS.FAST` 相当、既存の週次recap取得フローで使用中のモデルをそのまま使う。モデルIDは `lib/llm/models.ts` を直接参照し、spec内に書き写さない）
- **追加のAPI呼び出し・追加コストはゼロ**: 既存の「月曜09:05 JST recap refresh cron」（`.github/workflows/cron-post-match-recap-refresh.yml`）が定期的に呼んでいる同じ検索呼び出しに `fact_ja` フィールドを1つ追加するだけで、呼び出し回数・頻度は変わらない。出力トークンが `fact_ja` 分（1事実あたり80〜160字程度）だけ微増する

## 受け入れ条件

1. `contentType === "recap"` のsearch promptに `fact_ja` 生成指示が含まれる（preview分岐と同等の文言であることをテストで検証）
2. 新しく取得された `recap` の sourced fact に `fact_ja` が保存される（`--dry-run` 等で実データ確認、または既存のsourced facts取得テストの拡張で検証）
3. `contentType === "recap"` の事実が news item として返る。`fetchedAt < kickoffAt` の制約が適用されないことをテストで検証
4. 試合後由来の `news` item は `contains_result: true` を持つ。試合前由来の `news` item（Phase 1既存分）は引き続き `contains_result: false` のままである
5. `confidence` が `high` 以外（`medium`/`low`）の recap事実は対象外になる
6. 同一 `source_domain` からの重複事実は1件のみ採用される（Phase 1と同じロジックの再利用をテストで確認）
7. 1試合の items 配列が preview → news（試合前）→ result → recap → news（試合後）の順で返る
8. 1試合あたりの items 上限が9件を超えない
9. `pnpm tsc --noEmit` / `pnpm lint` / `pnpm test` / `pnpm build` が通る
10. **Owner実機目視**: mobile（TestFlight）とWebの両方で、実データ（試合後のPOTM・出場停止等のfact）を使い、(a) 試合後news itemが自然な日本語で読める品質か (b) spoiler guard ONのユーザーに対して正しくブラー表示されるか、を確認する。機械的なテスト通過だけで完了としない

## 未解決の質問

- カテゴリ別確度基準（出場停止確定=公式ソース必須、負傷/コメント=公式or複数ソース等）を導入するかはOwner判断。導入する場合は `match_sourced_facts` にカテゴリ列を追加する別specが必要になる
- 既存の95件（`fact_ja` null）の recap sourced factsを再取得してバックフィルするかはOwner判断。再取得する場合は `content-regen` スキルの「少件数の試し焼き→検品→全件」の段階実行に従う
- 「試合がない閑散期のニュースフィード」（`feat-no-match-period-homepage.md` とは別軸の、チーム/大会単位のローリング更新機能）を別途作るかはOwner判断
