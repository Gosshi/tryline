# feat-indexnow-hub-expansion: IndexNow送信対象を大会ハブ・カレンダーへ拡張

## 背景

2026-07-21、GPTとの壁打ちで「試合コンテンツ公開時のIndexNow送信を、個別試合ページだけでなく大会ハブ・該当節・カレンダーにも広げるべき」という提案があった。

実コード確認: `lib/seo/indexnow.ts`の`submitUrlsToIndexNow(urls: string[])`は任意のURL配列を受け取れる汎用関数で、URL数の制限はコード上ない。呼び出し元は`lib/llm/pipeline.ts`の1箇所のみで、コンテンツ（preview/recap）が`published`になったときに以下のみを送信している:

```ts
if (persistedStatus === "published") {
  const urls = [`${SITE_URL}/matches/${matchId}`];

  if (contentType === "recap" && assembled.match.competition?.family === "league-one") {
    urls.push(`${SITE_URL}/matches/${matchId}/en`);
  }

  await submitUrlsToIndexNow(urls);
}
```

この`urls`配列に、変更が実際に反映される他のページのURLを追加するだけで対応できる。

**訂正1（1回目レビュー、2026-07-21）**: `assembled.match.round`という直接フィールドは存在しない（`lib/llm/types.ts`確認済み）。`matches`テーブル自体にも`round`カラムは無く、round情報は常に`external_ids`（JSON列）に`round`または`wikipedia_round`として格納されている。

**訂正2（2回目レビュー、2026-07-21）**: 当初「`externalIds.round ?? externalIds.wikipedia_round`だけで正規化」としていたが不完全。既存の正規化ロジック`getRoundFromExternalIds()`（`lib/db/queries/matches.ts:491`、非公開関数）は以下の検証まで行っている:

```ts
function getRoundFromExternalIds(externalIds: Json): number | null {
  if (!externalIds || typeof externalIds !== "object" || Array.isArray(externalIds)) {
    return null;
  }
  const round = externalIds.round ?? externalIds.wikipedia_round;
  if (typeof round === "number" && Number.isInteger(round)) {
    return round;
  }
  if (typeof round === "string" && /^\d+$/.test(round.trim())) {
    return Number.parseInt(round, 10);
  }
  return null;
}
```

単純に`round ?? wikipedia_round`を取り出すだけだと、不正な文字列（数字以外を含む値）がそのままURLパスに埋め込まれ、存在しない節URLをIndexNowに送信するリスクがある。**この既存関数をexportし、IndexNow送信箇所からも再利用する**（同じ検証ロジックを重複実装しない）。

またLeague Oneにも節（round）ハブページ（`app/c/[competition]/[season]/round/[round]/page.tsx`）が存在するため、**League Oneをround送信の対象外にする理由はない**。round情報が正規化できた大会であれば、ファミリーを問わず節ハブURLを送信対象に含める。

## スコープ

対象:
- `lib/db/queries/matches.ts`の`getRoundFromExternalIds()`を`export`する
- `lib/llm/pipeline.ts`のIndexNow送信箇所（`persistedStatus === "published"`時）で、`urls`配列に以下を追加する:
  - 大会ハブページ: `${SITE_URL}/c/${family}/${season}`（`assembled.match.competition`から`family`・`season`を取得。取得できない場合はこのURLの追加をスキップする）
  - 節ハブページ: `${SITE_URL}/c/${family}/${season}/round/${round}`（exportした`getRoundFromExternalIds()`で正規化したroundが取得できた場合のみ追加する。整数または数字のみの文字列以外はnull扱いとし、その場合は節URLを追加しない。大会ファミリーによる除外は行わない）
  - カレンダーページ: `${SITE_URL}/calendar`
- 上記のうち取得できないフィールドがあっても、そのURLの追加をスキップするだけで既存の試合ページ送信自体は継続する（一部失敗が全体を止めない）

対象外:
- IndexNow送信のトリガー自体（コンテンツ公開時のみ）を変更すること — 例えばスコア更新のみ・順位表更新のみでの追加送信は対象外
- IndexNow以外の送信先（Google Indexing API等）の追加
- 送信頻度・レート制限の変更

## データモデル変更

なし。

## API サーフェス

なし。

## LLM連携

なし。既存のIndexNow送信ロジックへのURL追加のみで、新規LLM呼び出しは発生しない。

## 受け入れ条件

1. コンテンツが`published`になったとき、`submitUrlsToIndexNow`に渡される`urls`に、既存の試合ページURLに加えて大会ハブURL（`/c/{family}/{season}`）が含まれる
2. `getRoundFromExternalIds()`で正規化できた場合（整数または数字のみの文字列）、大会ファミリーを問わず節ハブURL（`/c/{family}/{season}/round/{round}`）も含まれる（League Oneを含む）。数字以外を含む不正な値では節URLが追加されない
3. 数値・数字文字列・null・不正文字列（例: `"R1"`）の各パターンに対する`getRoundFromExternalIds()`のテストが存在する（既存テストがあれば流用、無ければ追加する）
4. カレンダーURL（`/calendar`）が含まれる
5. `family`・`season`・`round`のいずれかが取得できない場合でも、既存の試合ページURLの送信自体は失敗せず継続する
6. `pnpm tsc --noEmit` / `pnpm lint` / `pnpm test` / `pnpm build` が通る
7. 本番デプロイはOwner承認後に別途行う

## 未解決の質問

なし。
