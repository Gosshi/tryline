# 対戦成績ページを、次の試合の入口にする

## 背景

検索で人が着地しているのは、大会のシーズンページと対戦成績ページです。試合ページ（記事があるページ）は、入口になっていません。2026-11-16 時点の実測は次のとおりです。

| 面 | 実測 |
|---|---|
| GA4 の着地（10/19〜11/15、ユーザー数） | `/c/nations-championship/2026` 104、`/h2h/japan-vs-wales` 14、`/h2h/fiji-vs-japan` 13、`/h2h/england-vs-japan` 8。試合ページは 1 ページあたり 3〜4 |
| GSC（10/17〜11/13） | `/h2h/japan-vs-scotland` 表示 28・平均順位 2.4。`/h2h/fiji-vs-japan` 表示 100・クリック 11 |
| GSC の URL 検査（`/matches/` 15 本） | 登録 0。「検出 - インデックス未登録」11、「認識されていません」3、noindex 1 |
| Bing のクエリ | 「スコットランド 日本対戦成績」「日本 スコットランド 2026 ラグビー」のほか、「〇〇 放送」「中継」「テレビ」が多い |

日本代表の試合前に、相手チーム名で検索した人は対戦成績ページに着地します。ところが今のページで次の試合について分かるのは、日時と「次回対戦の詳細を見る →」だけです。放送局を知りたい人は、まだ Google に登録されていない試合ページへ進まないと答えにたどり着けません。

次回対戦の欄に、放送・配信とプレビューへのリンクを出します。検索結果の説明文にも、次の試合の日時と放送局を入れます。最初に効くのは **11/21 スコットランド対日本**（`/h2h/japan-vs-scotland`）で、その後の日本代表戦にも同じ仕組みで効きます。

## スコープ

対象:
- `app/h2h/[pair]/page.tsx` の `NextMatchCta`：放送・配信の一覧、確認日、プレビューへのリンク
- 同じファイルの `generateMetadata`：次の試合が近いときだけ、description の先頭に日時と放送局を足す

対象外:
- **title は変えない。** 今の title で順位 2.4 が出ており、既存テスト「preserving the title」（`tests/app/h2h-page.test.tsx:458`）が守っている
- 試合ページのメタデータ、インデックス未登録の解消（別件。Owner の「3」で扱う）
- 放送データの取り込み（`match_broadcasts` の既存データを読むだけ）
- 構造化データ（SportsEvent 等）の追加

## データモデル変更

なし。`match_broadcasts`（`service_name`・`url`・`kind`・`display_order`・`verified_at`・`source_url`）を読むだけ。

## API サーフェス

なし。ページ内で既存の `getMatchBroadcastsForMatches(matchIds: string[]): Promise<Map<string, MatchBroadcast[]>>`（`lib/db/queries/match-broadcasts.ts:48`）を使う。

- 呼ぶのは次の試合 1 件分だけ（`selectNextHeadToHeadMatch(data.matches, now)`、`app/h2h/[pair]/page.tsx:361` の結果）。次の試合がなければ呼ばない
- `getMatchBroadcastsForMatches` が例外を投げたら、放送の一覧を出さずに表示を続ける（ページ全体を 500 にしない）。サーバーログに `console.error` を 1 行出す
- `generateMetadata` とページ本体の両方で使う。どちらも `resolveHeadToHeadPage` と同じく、同一リクエスト内で重複して取得しないよう `react` の `cache` で包む

## UI サーフェス

### `NextMatchCta`（`app/h2h/[pair]/page.tsx:432`）

今の表示（見出し「次回対戦」、カード名、`formatKickoffJst(...)`、「次回対戦の詳細を見る →」）は残し、日時の下に次を足す。

1. **放送・配信**：`display_order` の順に、`kind` のラベル（「放送」「配信」。`components/match-header.tsx` の「視聴方法」ブロックと同じラベル）と `service_name` を並べる。`url` があればリンクにする（`target="_blank"`・`rel="noopener noreferrer"`）
   - 確認日を「確認日: M/D」で出す。算出方法は `components/match-header.tsx:50` の `formatBroadcastVerifiedDate` と同じにする。関数は `lib/` 側へ移して共通化し、`match-header.tsx` もそれを使う（表示は変えない）
   - 放送データが 0 件なら、この行は出さない（「未定」「未発表」とも書かない）
2. **プレビューへのリンク**：`getContentStatusForMatches` の結果（`MatchContentStatus.hasPreview`、すでにページ本体で取得済み、`:111`）が `true` のときだけ、「プレビューを読む →」を出す。リンク先は `/matches/${match.id}`。`TrackedLink` の `cta_id` は `h2h_next_match_preview` とする

既存の「次回対戦の詳細を見る →」（`cta_id: "h2h_next_match"`）は変えない。

### 文言の例（スコットランド対日本、2026-11-16 時点のデータ）

```
次回対戦
日本 対 スコットランド
2026-11-21 (土) 23:10 JST
放送  WOWOWプライム ↗
放送  J SPORTS 1 ↗
配信  WOWOWオンデマンド ↗
配信  J SPORTSオンデマンド ↗
確認日: 11/15
次回対戦の詳細を見る →
```

## メタデータ（`generateMetadata`、`:64`）

次の試合が「今から 14 日以内にキックオフ」のときだけ、description の先頭に 1 文足す。それ以外は今と同じ description にする。

- 文の形: `次戦は{M}月{D}日({曜}){HH}:{mm} JST キックオフ、{放送局}で放送・配信。`
  - 日時は JST。キックオフ時刻が未定（`kickoffTimeTbd`）なら、時刻と「キックオフ」を省いて `次戦は{M}月{D}日({曜})、…`
  - `{放送局}` は `display_order` 順の `service_name` を「・」でつなぐ。最大 3 件まで。4 件以上は 3 件目の後に「など」を付ける
  - 放送データが 0 件なら `、{放送局}で放送・配信` を省き、`次戦は{M}月{D}日({曜})… JST キックオフ。`
- 例: `次戦は11月21日(土)23:10 JST キックオフ、WOWOWプライム・J SPORTS 1・WOWOWオンデマンドなどで放送・配信。ラグビー日本とスコットランドの通算対戦成績（9試合 1勝8敗）。過去の全対戦のスコアと、直近の日本語レビューへのリンク。`
- `openGraph.description` も同じ値にする
- `14` は名前付き定数にする（`H2H_NEXT_MATCH_DESCRIPTION_WINDOW_DAYS`）

`generateMetadata` の中で現在時刻を使うので、ページの `revalidate = 3600`（`:35`）のまま、最大 1 時間ずれることを許容する。試合が終わると `selectNextHeadToHeadMatch` は `status !== "scheduled"` か `kickoffAt < now` で次の試合を返さなくなる。その結果、description は自然に元へ戻る。

## LLM 連携

なし。

## 受け入れ条件

テストは `tests/app/h2h-page.test.tsx` に足す。既存テストの期待値は変えない。

1. 次の試合があり、放送データが 4 件あるとき、`NextMatchCta` に 4 件が `display_order` 順で、「放送」「配信」のラベル付きで出る。`url` のある項目はリンクで、`rel="noopener noreferrer"` を持つ。「確認日: 11/15」が出る
2. 放送データが 0 件のとき、放送の行も確認日も出ない。「未定」「未発表」の文字も出ない
3. `getMatchBroadcastsForMatches` が例外を投げても、ページは描画され、次回対戦のカード名と日時は出る
4. `hasPreview: true` のときだけ「プレビューを読む →」が出て、`href` が `/matches/<id>` になる。`false` のときは出ない
5. 次の試合がないとき、`getMatchBroadcastsForMatches` が呼ばれない
6. `generateMetadata`：
   - (a) キックオフが 7 日後で放送 4 件 → description が上の「例」と同じ形の 1 文（`…・WOWOWオンデマンドなどで放送・配信。`）で始まり、その後ろが今の description と完全一致する
   - (b) キックオフが 15 日後 → description が今の description と完全一致する
   - (c) キックオフ時刻未定 → 時刻と「キックオフ」を含まない
   - (d) 放送 0 件 → 「放送・配信」を含まない
   - (e) どの場合も `title` は `ラグビー {A} 対 {B} 対戦成績 | Tryline` のまま（既存テスト `:458` が通る）
   - 時刻は `vi.useFakeTimers` で固定する（`tests/app/home-page.test.tsx` 等の既存パターンに合わせる）
7. `components/match-header.tsx` の「視聴方法」と確認日の表示が変わらない（既存テストがそのまま通る）
8. **壊して落ちる確認**（PR 本文に出力を貼る。コミットしない）: (a) 14 日の比較を `>=` と `>` で入れ替える、(b) `hasPreview` の条件を外して常に出す。それぞれで条件 6(b) と 4 のテストが落ちること。(a) は境界ちょうど（14 日 0 時間）のテストを足して確かめる
9. `pnpm tsc --noEmit`・`pnpm lint`・`pnpm test`・`pnpm build` が通り、CI が緑
10. PR 本文に、プレビュー環境の `/h2h/japan-vs-scotland` の、375px 幅と 1280px 幅のスクリーンショットを貼る（次回対戦の欄が見える位置）

## 競合とマージ順

- 触るファイル: `app/h2h/[pair]/page.tsx`、`components/match-header.tsx`（関数の移動だけ）、`lib/` の移動先 1 ファイル、テスト
- 進行中の spec で `app/h2h/[pair]/page.tsx` を触るものはない（2026-11-16 時点、`rg "h2h/\[pair\]" specs/` で確認すること）
- **11/21 23:10 JST の試合に間に合わせたい。11/18 中のマージが目安**

## 本番操作

なし。マージ後、Owner が GSC の URL 検査で `/h2h/japan-vs-scotland` の再クロールをリクエストする（任意）。

## 未解決の質問

なし（title を変えないことは本 spec で決めた。変えたくなったら、順位への影響を見てから別に判断する）。
