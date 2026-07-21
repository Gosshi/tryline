# feat-competition-hub-post-tournament-navigation: 大会終了後の最新レビュー・日本代表次戦導線

## 背景

2026-07-21、GPTとの壁打ちで「大会ハブが開催前・開催中・開催後で表示を切り替え、開催後は最新レビューと日本代表の次戦（大会をまたいで）へ接続すべき」という提案があった。

実コード確認: `app/c/[competition]/[season]/page.tsx`には既に`SeasonSummaryBand`（次戦・首位・日本代表の次戦の3タイル、該当データが無いタイルは自動非表示）という状態適応の仕組みが存在する。ゼロから作る必要はなく、このコンポーネントに機能を追加する形で対応できる。

現状の制約2点を確認した:
1. `nextJapanMatch`（335行目付近: `findNextScheduledMatch(matches.filter(isJapanMatch))`）は**このシーズンの試合の中でのみ**次戦を探す。日本代表の試合が全て終了すると、このタイルは単に消える
2. `SeasonSummaryBand`には「最新レビュー」タイルが存在しない。大会が終了した直後の訪問者に対し、直近の試合のレビューへ直接誘導する導線がない

`getContentStatusForMatches`（`lib/db/queries/match-content.ts`）は既にpage内で呼び出し済みで、`matches`の各試合IDについて`hasRecap`を保持している。

**重要な訂正（2026-07-21レビューで判明）**: 当初「シーズン内の`nextJapanMatch`が`null`のときだけ大会横断検索する」という設計だったが、これは誤り。Nations Championship 2026は2026-11-07（対ウェールズ）が既にスケジュールされているため、`nextJapanMatch`（シーズン内）は`null`にならず、「日本代表の次戦」タイルは11月のウェールズ戦を表示し続けてしまう。実際にはその前の2026-08-08（リポビタンDチャレンジカップ2026）の方が早いにも関わらず、それが埋もれる。

正しい設計は「シーズン内の次戦がnullかどうかに関わらず、常に大会横断で日本代表の直近の次戦を取得し、シーズン内の次戦と比較して早い方を採用する」。取得には`feat-featured-competition-auto-selection.md`で実装する共通関数`getNextMatchForTeamSlug("japan", afterIso)`（`lib/db/queries/matches.ts`にexport）を再利用する。実装順序に関わらず、後から実装する方が先行実装済みの関数を参照すること（`feat-featured-competition-auto-selection.md`側で既にこの関数を用意する設計になっている）。

## スコープ

対象:
- `SeasonSummaryBand`に「最新レビュー」タイルを追加する: `matches`のうち`status === "finished"`かつ`contentStatusMap[match.id]?.hasRecap === true`の試合の中から、**`kickoffAt`が最大（＝最も新しい）のものを明示的に選んで**（`matches`の並び順に依存しない）`/matches/{id}`へのリンクとして表示する。該当がなければタイル自体を出さない
- 「日本代表の次戦」タイルのロジックを変更する: `hasJapanInSeason`が`true`の場合、常に`getNextMatchForTeamSlug("japan", 現在時刻のISO文字列)`を呼んで大会横断の日本代表次戦を取得する。シーズン内の`nextJapanMatch`と比較し、大会横断の結果の方が早い（またはシーズン内の次戦が存在しない）場合はそちらを採用する
  - 採用した試合が**現在表示中の大会と異なる大会**に属する場合のみ、タイルのsecondaryラベルに大会名を添える（例: 「リポビタンDチャレンジカップ2026」）。同じ大会内の次戦を表示する場合は現状通り大会名を添えない
- このシーズン内に日本代表の試合が一つもない大会（`hasJapanInSeason === false`）については、このタイルの拡張は行わない（既存通り非表示のまま）
- `SeasonSummaryBand`のグリッドは現状「次戦・首位・日本代表の次戦」の最大3タイル・3カラム固定だが、「最新レビュー」追加により最大4タイルになりうるため、4タイル時にレイアウトが崩れないよう（例: `sm:grid-cols-2 lg:grid-cols-4`等）調整する

対象外:
- 既存の「次戦」「首位」タイルの**選定・表示ロジック自体**は変更しない（現状維持で十分機能している）。**ただし「最新レビュー」タイルの追加と「日本代表の次戦」の大会横断化は、大会の開催状態（開催前・開催中・開催後）を問わず全状態に適用する**。実際、本specの主要な検証対象であるNations Championship 2026は2026-07-21時点で「開催中」（7月シリーズ終了・11月シリーズ未開催）であり、このタイル拡張はまさに開催中の大会に対して機能する必要がある
- 大会ページ全体のレイアウト再設計（グリッドのカラム数調整のみ）
- ホームページの注目大会選定ロジック（`feat-featured-competition-auto-selection.md`の対象）

## データモデル変更

なし。

## API サーフェス

なし。

## LLM連携

なし。

## 受け入れ条件

1. 大会内に`status === "finished"`かつ`hasRecap === true`の試合が複数存在する場合、`kickoffAt`が最大のもの（配列の並び順に依存せず明示的に選定）への「最新レビュー」タイルが`SeasonSummaryBand`に表示される
2. 該当する試合がない場合、「最新レビュー」タイルは表示されない
3. 実データ検証: Nations Championship 2026のハブページで、固定の基準時刻（2026-07-21相当）でテストすると、日本代表の次戦タイルが「2026-08-08 対オーストラリア」（リポビタンDチャレンジカップ2026、同大会の2026-11-07対ウェールズ戦より早いため採用される）を指し、secondaryラベルに「リポビタンDチャレンジカップ2026」が添えられる
4. このシーズン内の次戦が大会横断の次戦より早い場合（開催中のシーズン等）は、従来通りシーズン内の次戦が採用され、大会名ラベルは付かない
5. `hasJapanInSeason === false`の大会では、この拡張タイルは表示されない
6. 「最新レビュー」タイル追加時、`SeasonSummaryBand`が最大4タイルをレイアウト崩れなく表示する
7. `pnpm tsc --noEmit` / `pnpm lint` / `pnpm test` / `pnpm build` が通る
8. 本番デプロイ前に実際のブラウザでスクリーンショットを確認する。本番デプロイ自体はOwner承認後に別途行う

## 未解決の質問

なし。「日本代表の次戦を大会横断で取得する」共通関数（`getNextMatchForTeamSlug`）は`feat-featured-competition-auto-selection.md`側で`lib/db/queries/matches.ts`にexportする設計で確定済み。本specはそれを再利用する。
