# Wikipedia vevent走査: Parsoid の `<section>` ラップ構造に未対応な問題を修正

## 背景

`specs/feat-nations-championship-event-source.md`（PR #471、マージ済み）を本番dry-runしたところ、Southern Hemisphere Series記事に実データ（試合・トライ・スコアラー）が存在するにもかかわらず `eventMatches: 0`（1件も抽出できない）という結果になった。

**根本原因を実際のページのHTMLで特定済み（2026-07-04）**: Wikipediaは近年、旧来の「見出し div と本文が同階層の兄弟要素として並ぶ」フラットな構造から、**各サブセクション（h3見出しとその中身）を `<section data-mw-section-id="N" aria-labelledby="Round_1">` という別要素でラップする**新しいレンダリング形式（Parsoid）に移行している。実際に `2026_Nations_Championship_Southern_Hemisphere_Series` を fetch して確認した実データ:

```html
<div class="mw-heading mw-heading2"><h2 id="Fixtures">Fixtures</h2>...</div>
<p>Southern Hemisphere teams...</p>
<section data-mw-section-id="5" id="mwNg" aria-labelledby="Round_1">
  <div class="mw-heading mw-heading3"><h3 id="Round_1">Round 1</h3>...</div>
  <div class="vevent summary" id="New_Zealand_v_France">...(実際のトライ・スコアラー情報を含む)...</div>
  <div class="vevent summary" id="Japan_v_Italy">...</div>
  ...
</section>
<section data-mw-section-id="6" aria-labelledby="Round_2">...</section>
```

`lib/ingestion/sources/wikipedia-six-nations.ts` の `parseWikipediaSixNationsHtml`（201行目付近）は、`#Fixtures` から `.next()` で**直接の兄弟要素だけ**を走査し、`cursor.is("div.mw-heading")` / `cursor.is("div.vevent.summary")` という**divタグ限定**の判定をしている。「Fixtures」見出し直後の `<p>` までは兄弟として辿れるが、その次の `<section aria-labelledby="Round_1">` は `div` ではないため `cursor.is("div.mw-heading")` に一致せず、**中に入っている見出し・vevent（トライ情報含む）が丸ごと無視される**。

`lib/ingestion/sources/wikipedia-pnc.ts` の `collectSectionVevents`（58行目付近）も**同一パターンの脆弱性**を持つ（`.closest("div.mw-heading")` / `cursor.is("div.mw-heading")` / `cursor.is("div.vevent.summary")`）。

**影響範囲（importer 全リストを grep で確認済み・2026-07-04）**: `parseWikipediaSixNationsHtml` は以下からimportされている。全てが同一の脆弱な走査ロジックに依存している:

ライブ取り込みソース（`lib/ingestion/sources/`）:
- `wikipedia-pnc.ts`（PNC 2026、独自の同型ロジック `collectSectionVevents` も別途持つ）
- `wikipedia-nations-championship.ts`（NC本体。ただし Round 1-6 は別関数 `parseRoundTableMatches` を使うため**影響なし**と確認済み。Finals Weekend の `parseFinalsMatches` のみこの関数を使うが、対象試合が未作成のため実害なし）
- `wikipedia-autumn-nations.ts`（Autumn Nations 2026）
- `wikipedia-rugby-championship.ts`（Rugby Championship 2026）
- `wikipedia-six-nations-2027.ts`（Six Nations 2027、開幕前）
- `wikipedia-nations-championship-events.ts`（本spec の直接のきっかけ、PR #471）

※ Autumn Nations 2026・Rugby Championship 2026 は `LIVE_COMPETITION_SOURCES` に登録済みだが、**本番DBに両大会の試合行は現時点で0件**（2026-07-04 実クエリ確認）。つまり現在進行形のデータ欠落はまだ発生していない。両大会のフィクスチャ取り込み・開幕前に本修正が入っていれば実害ゼロで防げる

一括インポート/バックフィル系（再実行時に現在のParsoidページで同じ問題が起きる）:
- `lib/scrapers/wikipedia-autumn-nations-results.ts`
- `lib/scrapers/wikipedia-pacific-nations-cup-results.ts`
- `lib/scrapers/wikipedia-rugby-championship-results.ts`
- `lib/scrapers/wikipedia-rwc-results.ts`（**RWC 2027 で使用予定**）
- `scripts/backfill-match-events.ts`
- `scripts/backfill-match-lineups.ts`（**ラインアップのバックフィルも本パーサー依存**。過去の 6N/ANS/PNC のラインアップはこの経路で入っており、cron の `ingest-lineups` 経路ではない — 下記「今回発覚した個別対応」参照）

なお、現在の `2026_Six_Nations_Championship` ページも Parsoid 形式（`<section data-mw-section-id>` が25個、vevent 15個）で配信されていることを実 fetch で確認済み。修正後のフィクスチャ候補として有用。

## スコープ

対象:
- `lib/ingestion/sources/wikipedia-six-nations.ts` の `parseWikipediaSixNationsHtml`: 見出し・vevent の走査を、`div.mw-heading` 限定ではなく `<section data-mw-section-id>`（Parsoid形式）と `div.mw-heading`（旧形式）の**両方**に対応させる。兄弟要素の浅い走査ではなく、セクションラッパーの中まで正しく辿れるようにする
- `lib/ingestion/sources/wikipedia-pnc.ts` の `collectSectionVevents`: 同様の修正
- 対応するテスト（本spec記載の実データ由来の最小フィクスチャを使用）

対象外:
- 各ソースファイル固有のチーム名マッピング・スコア抽出ロジック自体の変更
- 過去の一括インポートスクリプトの再実行（本spec実装後、Owner判断で個別に実行）
- Autumn Nations / Rugby Championship / Six Nations 2027 の実際のライブ稼働状況の監査（本spec範囲外。**別途「今回発覚した個別対応」として推奨**）

## データモデル変更

なし。

## 実装方針（提案）

見出し・vevent の判定を「要素自身が特定タグか」ではなく「その要素または子孫に該当する id/class を持つ要素が存在するか」に寄せることで、`div` でラップされていようが `section` でラップされていようが頑健に検出できるようにする。例えば:

```typescript
function isHeadingContainer(node: ReturnType<typeof $>, level: "h2" | "h3") {
  return node.find(level).length > 0 || node.is(level);
}

function isVeventBlock(node: ReturnType<typeof $>) {
  return node.hasClass("vevent") && node.hasClass("summary")
    ? true
    : node.find(".vevent.summary").length > 0 && node.children(".vevent.summary").length > 0;
}
```

具体的なセレクタ・走査アルゴリズム（兄弟走査を維持しつつ `section` ラッパーも認識する／あるいは全体を `.find()` で一括収集してから見出しでグルーピングし直す等）はCodexの判断に委ねる。**重要なのは、classic（div.mw-heading が兄弟として並ぶ）と Parsoid（section要素が見出しと中身をラップする）の両方の実データで動作を確認すること。**

## 受け入れ条件

1. 本spec記載の実際のHTML構造（`<section data-mw-section-id="5" aria-labelledby="Round_1">` が h3見出しと vevent ブロックをラップするパターン）を再現したフィクスチャで、`parseWikipediaSixNationsHtml` が正しく試合・ラウンド番号を抽出できることを単体テストで確認する
2. 同フィクスチャで `wikipedia-nations-championship-events.ts` 経由の `fetchNationsChampionship2026EventMatches`（PR #471）が実際にイベント（トライ・スコアラー・分数）を抽出できることを確認する
3. 既存の classic構造（div.mw-heading が兄弟として並ぶ、既存テストのフィクスチャ）でも引き続き正しく動作することを確認する（後方互換）。また `wikipedia-six-nations.ts` 226行目付近の既存フォールバック（`#Fixtures` セクションが無いページでは全 `div.vevent.summary` をページ全体から収集する）の挙動を退行させないこと
4. `collectSectionVevents`（`wikipedia-pnc.ts`）も同様のParsoid構造で正しく動作することを確認する単体テストを追加する
5. 本番 dry-run（`node --env-file=.env.production.local tools/run-ts.cjs scripts/backfill-nations-championship-match-events.ts`）で、NC Round1の3試合（日本vsイタリア含む）から実際にイベント件数が抽出されることを確認する（Owner側で実行）
6. `pnpm test`・`pnpm tsc --noEmit` 通過

## 今回発覚した個別対応（spec範囲外・Owner判断事項）

- Autumn Nations 2026・Rugby Championship 2026 は本番DBに試合行が0件（2026-07-04確認）のため、現時点のデータ欠落は無い。ただし両大会のフィクスチャ取り込み・開幕**前に**本修正をマージしておくこと（順序が逆になると NC と同じサイレント欠落が再発する）
- Six Nations 2027 も同様に開幕前にこの修正が入っていることを確認すること
- **cron 経路のラインアップ取り込みは季節ページに対して元々機能していない（本レビューで発覚・別spec候補）**: `app/api/cron/ingest-lineups/route.ts` は `parseWikipediaLineupHtml`（`#Line-ups` 見出し前提）のみを使い、見出しが無ければ黙って `{ announced: false }` を返す。国際大会の `wikipedia_url` は季節ページであり `#Line-ups` 見出しは存在しない（`2026_Six_Nations_Championship` 実ページで確認済み）。過去の 6N/ANS/PNC ラインアップは `scripts/backfill-match-lineups.ts`（季節ページの vevent 隣接テーブルを読む `parseLineupFromTableHtml` 経路）の手動実行由来。**NC 2026 のラインアップを cron で自動取得するには、`ingest-lineups` に季節ページ用フォールバック（`parseLineupFromTableHtml` 経路）を追加する別specが必要**。なおこの経路も vevent 特定に本specのパーサーを使うため、本specがその前提修正になる
- `toEmptyWhenMissingOrUnstructured` によるサイレント空配列化が今回の障害検知を遅らせた（dry-run まで気づけなかった）。ライブソースが「対象大会に finished 試合が存在するのに 0 件を返す」状態を warn ログ等で可視化する軽量な観測性改善も別spec候補

## 未解決の質問

- 走査アルゴリズムの具体的な実装方式（section要素も辿れるよう既存の兄弟ループを拡張するか、`.find()`で一括収集してから見出しごとにグルーピングし直す設計にするか）はCodexの判断に委ねる。既存の`round`判定（見出しidから`Round_N`を抽出する`parseRoundFromId`等）との整合性を優先すること
