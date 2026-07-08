# カレンダーの週ナビゲーションと状態ピル分解

## 背景

2026-07-08 の集客レビューで、`/calendar` は「全大会横断・JST 表示」という強い価値を持ちながら、以下の理由で「毎週戻るページ」になっていないことが判明した。

1. **1 週分の表示で行き止まり**。前週の結果・翌週の予定に移動できず、週末が終わると訪問理由が消える
2. **「解説」バッジが 1 種類**で、プレビューだけの試合とレビュー公開済みの試合が区別できない（`components/calendar/week-schedule.tsx:132` の `hasContent` 単一 boolean）
3. 注目試合（日本代表戦・高レベルカード）がリスト内で埋没する

集客戦略上、`/calendar` は X プロフィール・固定ポスト・note 記事末尾 CTA の共通着地点にする方針（2026-07-08 決定）。着地したユーザーが前後の週を回遊でき、試合ごとの状態が一目で分かることが再訪の前提になる。

デザインの基準モック: `docs/design/mock-growth-home-calendar.html` の「今週の試合」帯（週タブ・状態ピル・注目行ハイライト）。ただし全体のトーンはマージ済みの bento 改修（PR #490、日付縦ブロック方式）と紙テクスチャ（PR #493）を維持し、モックは追加要素（週タブ・ピル・ハイライト）の参考としてのみ使う。

関連 spec: `feat-weekly-match-calendar.md`（初版実装済み）、`feat-bento-card-redesign.md`（実装済み・PR #490）、`feat-home-matchday-board.md`（本 spec に依存する姉妹 spec）。

## スコープ

対象:

1. `/calendar` に `?week=` クエリパラメータによる週切り替えを追加（前週/今週/翌週タブ + 前後リンク）
2. `components/calendar/week-schedule.tsx` の「解説」バッジを「プレビュー」「レビュー」の 2 種類に分解（共有コンポーネントのため、ホームの「今週の試合」帯にも自動反映される）
3. 週内の注目試合 1 件の行ハイライト（日本代表戦優先、なければレベルスコア最高）
4. `/calendar` の metadata 改善（title に「日本時間」を含める）

対象外:

- ホームページの変更（`feat-home-matchday-board.md` が担当）
- メール登録フォーム・共有用 CTA（別 spec 候補。今回は入れない）
- 「チャット」「H2H」ピル（未解決の質問に記載）
- 日付縦ブロックのデザイン変更（PR #490 のまま維持）
- 大会フィルタ UI

## データモデル変更

なし。

## API サーフェス

新規ルートなし。既存関数の変更のみ:

### 1. `lib/format/week.ts`

`getCurrentJstWeekRangeUtc` に加えて、任意の週開始日から範囲を計算する関数を追加:

```
getJstWeekRangeUtc(weekStartJst: string /* "YYYY-MM-DD"、JST月曜 */): WeekRangeUtc
```

- 入力が `YYYY-MM-DD` 形式でない、または月曜日でない場合は今週にフォールバック（エラーにしない）
- 今週の月曜から **前後 8 週以内** に丸める（クロール爆発と無意味な過去/未来週の防止）

### 2. `lib/db/queries/matches.ts` — `CalendarMatch` 型

`hasContent: boolean`（`matches.ts:86-87`）を以下に置き換える:

```
hasPreview: boolean;
hasRecap: boolean;
```

`getMatchesInRange` 内の published コンテンツ取得（`matches.ts:1050` 付近の `contentMatchIds`）を `content_type` 別の 2 つの Set に分ける。クエリ回数は増やさない（既存クエリの select に `content_type` を含めて仕分けるだけ）。

既存の `hasContent` 参照箇所（`week-schedule.tsx` 以外にあれば grep で洗い出す）は `hasPreview || hasRecap` に置き換える。

### 3. 注目試合の選定

`feat-home-multi-competition-featured-reviews.md`（PR #497）で実装されるレベルスコア計算（国代表戦= `teams.world_ranking` の合計が小、クラブ戦= `competition_standings.position` の合計が小）を共有ユーティリティとして切り出し、週内試合にも適用する:

1. 日本代表が出場する試合があればそれが注目試合（複数あれば最初のキックオフ）
2. なければレベルスコアが最良の試合
3. ランキング・順位データがどちらも無い週はハイライトなし（エラーにしない）

PR #497 側の実装がユーティリティ化されていない場合は、本 spec の実装時に共通化して両方から使うこと（ロジックの複製をしない）。

## UI サーフェス

### 1. 週ナビゲーション（`app/calendar/page.tsx`）

- URL: `/calendar`（今週・正準）、`/calendar?week=2026-07-13`（週指定。値は JST 月曜の日付）
- ヘッダー右に「前週 | 今週 | 翌週」のタブ型リンク（モック `.week-tabs` 参照。実装は `<Link>`、現在週タブは `?week` なしの `/calendar` を指す）
- タブとは別に、表示中の週レンジ（例:「7/6 (月) 〜 7/12 (日)」）を h1 直下に表示
- 過去週では試合行がスコア表示になる（既存の `getMatchStateLabel` がそのまま機能する）

### 2. SEO 制御

- `?week=` 付きページは `robots: { index: false, follow: true }`（薄いページの index bloat 防止）
- canonical は常に `${SITE_URL}/calendar`
- sitemap には `/calendar` のみ（現状維持。`tests/app/sitemap-calendar.test.ts` が変わらないこと）
- title を「今週の試合カレンダー｜海外ラグビー 日本時間」に変更（「海外ラグビー 日本時間」クエリの受け皿）

### 3. 状態ピル（`components/calendar/week-schedule.tsx`）

現行の単一「解説」バッジ（`week-schedule.tsx:132-136`）を置き換える:

| 条件 | ピル | スタイル |
|---|---|---|
| `hasRecap` | レビュー | 現行の accent 系（`bg-[var(--color-accent)]/10` + accent 文字）|
| `hasPreview && !hasRecap` | プレビュー | ニュートラル系（現行バッジの slate 版）|
| どちらも false | ピルなし | — |

- レビューとプレビューが両方 published の試合は「レビュー」のみ表示（2 個並べない）
- ステータスバッジ（ライブ等）・スコア表示は現状維持

### 4. 注目試合ハイライト

- 注目試合の `MatchRow` に薄い accent グラデーション背景（モック `.calendar-row.highlight` 参照: `linear-gradient(90deg, rgba(201,58,58,0.09), transparent)`）と「注目」ピル（accent 塗り）を付ける
- ハイライトは `/calendar` ページのみ。`compact`（ホーム側）では「注目」ピルのみ表示し背景ハイライトは省略してよい

## LLM 連携

なし。

## 受け入れ条件

1. `/calendar?week=<今週+1週の月曜>` にアクセスすると翌週の試合が表示され、`getMatchesInRange` に翌週月曜 00:00 JST 起点の UTC 範囲が渡る
2. `?week=` が不正値（非日付・月曜以外・±8 週超）のとき、今週の表示にフォールバックし 200 を返す（500/404 にしない）
3. `?week=` 付きページの `<meta name="robots">` が `noindex, follow` 相当、canonical が `/calendar` である
4. `?week=` なしの `/calendar` は現状同様 index 可能で、title が「今週の試合カレンダー｜海外ラグビー 日本時間」を含む
5. preview のみ published の試合に「プレビュー」ピル、recap が published の試合に「レビュー」ピルが表示され、両方 published なら「レビュー」のみ表示される
6. ホームの「今週の試合」帯（`app/page.tsx` の `WeekSchedule compact`）でも同じピル分解が表示される（共有コンポーネント経由の自動反映を確認）
7. 日本代表戦がある週はその試合行に「注目」ピルが付く。日本代表戦がなく、両チームの world_ranking が揃う試合がある週はランキング合計最小の試合に付く。どちらのデータも無い週はハイライトなしで正常表示される
8. `tests/app/calendar-page.test.tsx` と `tests/db-queries-matches-calendar.test.ts` を新仕様（`hasPreview`/`hasRecap`、`?week=` パース、noindex）に合わせて更新し、`pnpm test` が通る
9. `pnpm build` が通る

## 未解決の質問

- 「チャット」ピル: AI チャットは recap 公開済み試合で最も意味を持つが、「レビュー」ピルとほぼ同義になり情報量が薄い。今回は見送り、試合ページ側の導線改善（別 spec）で扱うでよいか
- 「H2H」ピル: H2H ページへの内部リンク強化は別 spec 候補（集客レビュー項目）として分離した。カレンダー行から H2H に直接飛ばすかはそこで判断
- 週送りの上限 ±8 週は暫定。シーズンオフに「次の開幕週へジャンプ」のようなショートカットが欲しくなったら別途
