# コンテンツ生成パイプラインがスクリプト実行時にクラッシュする問題

## 背景

2026-08-07、8/8 日本×オーストラリア戦のプレビューを `scripts/regenerate-overseas-content.ts` で再生成したところ、次の例外で失敗した。

```
[regenerate-overseas-content] failed for 2c276057-... Error: Invariant: static generation store missing in revalidateTag public-data:content
    at revalidateTag (next/dist/server/web/spec-extension/revalidate.js:39:12)
    at revalidatePublicData (lib/cache/public-data.ts:15:35)
    at generateMatchContent (lib/llm/pipeline.ts)
    at runRegenerateOverseasContent (scripts/regenerate-overseas-content.ts:265:31)
Overseas preview regeneration complete: regenerated=0 published=0 draft=0 skipped=0 failed=1
```

`lib/cache/public-data.ts` の `revalidatePublicData` は Next.js の `revalidateTag` を呼ぶ。`revalidateTag` はリクエスト／静的生成コンテキストを必要とするため、**素の Node スクリプトから実行すると必ず例外を投げる**。

### 実害

**1. DB は更新されているのにスクリプトは失敗を報告する。** 例外はコンテンツ保存の**後**に発生する。上記の実行では `failed=1 / regenerated=0` と報告されたにもかかわらず、`match_content` は実際に更新されていた（691文字 → 582文字）。運用者は「何も起きなかった」と誤認する。

**2. 本番サイトが古い内容を表示し続ける。** キャッシュタグが無効化されないため、DB とサイトが乖離する。上記の件では、DB 更新から数時間経っても本番ページは旧版を表示したままだった。このページは時間ベースの再検証を持たずタグベースのみで動いているため、次に成功する再検証まで解消しない。

**3. バッチ処理が途中で止まる。** 複数 match_id を渡した場合、最初の1件で例外が出た時点で以降が処理されない可能性がある。

### 影響範囲

`revalidatePublicData` の呼び出し元は3箇所。

| 呼び出し元 | 実行環境 | 影響 |
|---|---|---|
| `lib/llm/pipeline.ts:685` | ルートとスクリプトの両方 | **スクリプト実行時に例外** |
| `app/api/cron/ingest-fixtures/route.ts:42` | ルートのみ | 影響なし |
| `app/api/cron/ingest-standings/route.ts:20` | ルートのみ | 影響なし |

問題はパイプライン経路のみだが、そこは**スクリプト6本の共通の出口**になっている。

```
scripts/regenerate-overseas-content.ts
scripts/generate-world-rugby-content.ts
scripts/generate-recaps.ts
scripts/generate-league-one-content.ts
scripts/import-news-digest-facts.ts
scripts/diagnose-winner-mismatch.ts
```

つまり**スクリプト経由のコンテンツ生成・再生成は現状すべて同じ形で壊れている**。

## スコープ

対象:
- `revalidatePublicData` がリクエストコンテキスト外で例外を投げないようにする
- 再検証が行われなかったことを運用者が把握できるようにする
- スクリプトの実行結果レポートが DB の実態と一致するようにする

対象外:
- スクリプトから本番のキャッシュを能動的に無効化する仕組みの新設（未解決の質問に回す）
- `app/api/cron/ingest-fixtures` / `ingest-standings` の変更
- 上記スクリプト6本のロジック変更（レポート表示の整合を除く）
- ページ側のキャッシュ戦略の変更（時間ベース再検証の追加など）
- 既に乖離している本番キャッシュの手動修正（運用作業）

## データモデル変更

なし。

## API サーフェス

### `revalidatePublicData` を安全にする

`lib/cache/public-data.ts` の `revalidatePublicData` が、リクエストコンテキストの不在によって例外を投げないようにする。

- `revalidateTag` の呼び出しを保護し、コンテキスト不在に起因する例外を握って処理を継続する
- **握った場合は `console.warn` で記録する**。メッセージに「キャッシュ再検証がスキップされたこと」と対象タグが分かる情報を含める。今回の問題が長期間気づかれなかったのは失敗が可視化されていなかったためであり、静かに握りつぶす実装にしないこと
- 戻り値で「再検証できたか」を呼び出し側が判定できるようにする（真偽値または対象タグの配列）

コンテキストの有無を事前判定する API に依存せず、例外を捕捉する方式でよい。Next.js のバージョン差で判定 API が変わるリスクを避けるため。

### スクリプトのレポート整合

`scripts/regenerate-overseas-content.ts` の集計が、DB 書き込みの実態を反映するようにする。

- コンテンツが保存された件数を `regenerated` / `published` / `draft` に正しく計上する
- キャッシュ再検証がスキップされた件数を、失敗とは別に集計して最後に表示する
- 例外で1件が落ちても後続の match_id の処理を継続する

他5本のスクリプトについては、同じ集計方式に揃える必要はない。`revalidatePublicData` が例外を投げなくなれば、いずれもクラッシュしなくなる。

### 運用者への出力

スクリプト完了時に、キャッシュ再検証がスキップされた場合は次の趣旨を明示する。

- 本番サイトの表示は更新されていない可能性があること
- 反映には別途キャッシュの再検証が必要であること

## UI サーフェス

なし。

## LLM 連携

なし。本 spec はキャッシュ再検証とエラーハンドリングのみを扱う。生成プロンプト・モデル・QA には触れない。

## 受け入れ条件

1. リクエストコンテキストがない環境で `revalidatePublicData` を呼んでも例外が投げられない。
2. 上記の場合に `console.warn` が出力され、対象タグが判別できる。
3. リクエストコンテキストがある環境では従来どおり `revalidateTag` が呼ばれる（既存のルート経由の挙動が変わらない）。
4. `revalidatePublicData` の戻り値で、再検証が行われたかを呼び出し側が判定できる。
5. `scripts/regenerate-overseas-content.ts` を1件の match_id で実行したとき、コンテンツが保存されていれば `regenerated` に計上され、`failed` に計上されない。
6. 複数 match_id を渡し、途中で1件が例外になっても後続が処理される。
7. キャッシュ再検証がスキップされた件数がスクリプト完了時に表示され、本番表示が更新されていない可能性がある旨が出力される。
8. `app/api/cron/ingest-fixtures` と `ingest-standings` の挙動に変更がない。
9. `pnpm lint` / `pnpm tsc --noEmit` / `pnpm test` / `pnpm build` がすべて clean。

## 未解決の質問

1. **スクリプト実行後に本番キャッシュをどう反映させるか。** 本 spec はクラッシュを止めるところまでで、再検証そのものは行わない。選択肢としては、認証付きの再検証エンドポイントを新設してスクリプトから叩く、既存 cron の次回実行に任せる、対象ページに時間ベースの再検証を併用する、などがある。運用頻度を見て別 spec で判断する。

2. **現在乖離している本番キャッシュの解消。** 8/8 日本×オーストラリア戦のページは DB が582文字、サイトが691文字の状態にある。本 spec の実装とは独立に、Vercel 上のパイプライン（cron 経由）が同じ試合を再生成すれば解消する。急ぎであれば手動対応が要る。

3. **`failed` と報告されながら DB が更新されていた過去の実行がないか未調査。** 同じ経路のスクリプト6本で同種の乖離が起きていた可能性がある。必要なら `match_content` の `generated_at` と本番表示を突き合わせて確認する。
