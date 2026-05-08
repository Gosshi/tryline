# fix-orchestrate-large-in-clause: orchestrate の大量 IN 句バグ修正

## 背景

`lib/cron/orchestrate.ts` の `getMatchIdsMissingContent` 関数が、finished 試合 ID（現在 710 件）を `.in("match_id", allMatchIds)` で `match_content` テーブルに投げている。URL クエリパラメータが 25,000 文字超になり Supabase/PostgREST のリクエストが失敗する。エラーは catch ブロックで `{ triggered: 0, skipped: 0 }` に変換されるため、orchestrate が常に全ゼロを返す。

---

## 修正対象

### ファイル: `lib/cron/orchestrate.ts`

`getMatchIdsMissingContent` 関数内で `.in("match_id", allMatchIds)` を使っている箇所を修正する。

### 変更後のロジック

IN 句を使わず、2 つの独立したクエリの差分をメモリ内で計算する:

```ts
async function getMatchIdsMissingContent(params: {
  db: SupabaseClient<Database>;
  status: "scheduled" | "finished";
  contentType: ContentType;
  kickoffGte?: string;
  kickoffLte?: string;
}) {
  // Step 1: 対象ステータスの試合 ID を全件取得
  let matchQuery = params.db
    .from("matches")
    .select("id")
    .eq("status", params.status);

  if (params.kickoffGte) {
    matchQuery = matchQuery.gte("kickoff_at", params.kickoffGte);
  }
  if (params.kickoffLte) {
    matchQuery = matchQuery.lte("kickoff_at", params.kickoffLte);
  }

  const { data: matches, error: matchError } = await matchQuery;
  if (matchError) throw matchError;

  const allMatchIds = matches.map((match) => match.id);

  if (allMatchIds.length === 0) {
    return { eligibleIds: [] as string[], skippedCount: 0 };
  }

  // Step 2: コンテンツ済みの match_id を IN 句なしで全件取得
  const { data: existingContent, error: contentError } = await params.db
    .from("match_content")
    .select("match_id")
    .eq("content_type", params.contentType)
    .in("status", [...EXISTING_CONTENT_STATUSES]);

  if (contentError) throw contentError;

  // Step 3: メモリ内で差分計算
  const existingIds = new Set(existingContent.map((row) => row.match_id));
  const eligibleIds = allMatchIds.filter((id) => !existingIds.has(id));

  return {
    eligibleIds,
    skippedCount: allMatchIds.length - eligibleIds.length,
  };
}
```

変更点は1箇所のみ: `match_content` クエリから `.in("match_id", allMatchIds)` を削除し、全件取得に変える。絞り込みはメモリ内で行う。

---

## 変更しないこと

- 関数のシグネチャ・呼び出し元
- `runOrchestrate` のロジック・結果フォーマット
- orchestrate route の catch ブロック
- 他のファイル

---

## 完了条件

- [ ] `pnpm tsc --noEmit` パス
- [ ] `pnpm build` パス
- [ ] orchestrate を叩いたとき `recaps.skipped` が 490 前後になる
- [ ] `recaps.triggered` が 200 超になる（レビューなし試合の生成が開始される）
