# feat-competition-hub-state-based-title: 大会ハブの検索タイトルを開催状態で切り替え

## 背景

2026-07-21、`fix-competition-hub-title-ctr.md`（マージ済み）で大会ハブの検索結果タイトルを全大会共通で`${competitionTitle} 順位表・日程・結果`に固定改善した。GPTとの壁打ちで、これをさらに一歩進め、**大会の開催状態（開催前・開催中・開催後）に応じてタイトル・descriptionの強調点を変える**ことが提案された。

実コード確認: `app/c/[competition]/[season]/page.tsx`の`generateMetadata()`は現状`comp`（`getCompetitionBySlug`）のみ取得しており、試合データを見ていない。ページ本体（`SeasonPage`関数）では`listMatchesForCompetition(comp.slug)`で試合一覧を取得済みだが、`generateMetadata`とは別実行のため、状態判定には`generateMetadata`内でも同じ関数を呼ぶ必要がある（Next.jsの`generateMetadata`とページ本体は独立して実行されるため、Supabaseクエリの重複が1回発生するが許容する）。

**訂正1（1回目レビュー、2026-07-21）**: 「Nations Championship 2026は開催後」という当初の実例は誤り。2026-11-07（対ウェールズ）が`scheduled`のまま残っており現時点で「開催中」。「開催後」の実データ例は`six-nations-2026`（DB実測: 全15試合`finished`）を使う。

**訂正2（2回目レビュー、2026-07-21）**: 当初「開催中は最新順位、開催後は最終順位」という文言にしていたが、これは**順位表（`competition_standings`）を持たない大会**（例: リポビタンDチャレンジカップ2026、対戦相手ごとに個別のホーム&アウェーで戦う形式のため順位表の概念が無い。DB実測: `competition_standings`0件）で成立しない。同様に「日本語レビュー」も、その大会にレビューが1本も無ければ誇張になる。加えて、以下の運用ルールとの整合も必要:
- 全試合`cancelled`の大会を「開催後・最終順位・全結果」と表現するのは不適切（試合が実施されていないため）
- コンテンツ（recap）が0本の状態で「日本語レビュー」と言い切らない
- 試合が0件の大会でも「日程」と言い切らない（日程自体が未定のため）
- `AGENTS.md`は「エラーを握り潰してPromiseをresolveする（throwが基本）」を明確に禁止している。放送情報の有無チェックで**クエリが失敗した場合はthrowする**（fallbackで握り潰さない）。「放送情報なし」と判定してよいのは、クエリが正常に成功した上で結果が0件だった場合のみ

これらを踏まえ、状態区分と文言を「順位表・レビューの有無に依存しない、全大会で成立する表現」に作り直す。

**訂正3（3回目レビュー、2026-07-21）**: 状態判定の文章表現とロジックが不一致だった（「finishedとcancelledの混在も開催後」と書きつつ、実際の条件は「全試合finished」のみだった）。以下のアルゴリズムに一本化する:

```ts
const activeMatches = matches.filter((match) => match.status !== "cancelled");

if (activeMatches.length === 0) {
  // 大会情報のみ（0試合、または全試合cancelled）
} else if (activeMatches.every((match) => match.status === "scheduled")) {
  // 開催前
} else if (activeMatches.every((match) => match.status === "finished")) {
  // 開催後（finished + cancelledの混在を含む）
} else {
  // 開催中（scheduled + cancelledの混在等を含む）
}
```

また「開催中に順位表があれば『・順位』を追加してよい（Codexの実装判断）」という記述は結果が不定になるため、**`getStandingsForCompetition(comp.slug)`の結果が1件以上あれば必ず「・順位」を追加する**と確定する（本specは既にこの関数を呼ぶ設計のため、判定は自然に行える）。

本specは`fix-competition-hub-title-ctr.md`（マージ済み）の`generateMetadata()`実装を上書きする。同specで確定した「6カ国対抗」併記ロジックは維持する。

## スコープ

対象:
- `generateMetadata()`内で`listMatchesForCompetition(comp.slug)`・`getStandingsForCompetition(comp.slug)`・`getMatchBroadcastPresenceForMatches`・`getContentStatusForMatches`（recapの有無確認用）を呼び、上記の`activeMatches`ベースのアルゴリズムで状態を判定する
- 状態に応じてtitleを変える（順位表・レビューの有無に依存しない基本文言にし、存在する場合のみ追加要素を足す）:
  - 大会情報のみ: `${competitionTitle} 大会情報・見どころ`
  - 開催前・放送情報あり: `${competitionTitle} 日程・放送予定・見どころ`
  - 開催前・放送情報なし: `${competitionTitle} 日程・見どころ`
  - 開催中・順位表あり: `${competitionTitle} 最新結果・次戦・日程・順位`
  - 開催中・順位表なし: `${competitionTitle} 最新結果・次戦・日程`
  - 開催後・recapが1本以上ある: `${competitionTitle} 全試合結果・日本語レビュー`
  - 開催後・recapが0本: `${competitionTitle} 全試合結果`（「日本語レビュー」を含めない）
- descriptionも同様の原則（順位表・レビューの有無に依存しない基本文言＋存在する場合のみ追加）で調整する
- `family === "six-nations"`の「6カ国対抗」併記（`fix-competition-hub-title-ctr.md`で追加済み）は全状態で維持する
- 放送情報の有無確認（`getMatchBroadcastPresenceForMatches`）は、クエリ自体が失敗した場合は**throwする**（catchしてfallbackしない）。「放送情報なし」の判定は、クエリが正常終了した上で結果が0件のときのみ行う

対象外:
- `SeasonSummaryBand`等のページ本体UIの変更（`feat-competition-hub-post-tournament-navigation.md`の対象）
- OG画像・構造化データ（FAQ等）の状態別変更
- 大会ハブページ本体への放送情報の**表示**（本specは`generateMetadata`内でのtitle文言判定にのみ放送情報の有無を使う。画面上に放送情報を表示する施策は別途）

## データモデル変更

なし。

## API サーフェス

なし。

## LLM連携

なし。

## 受け入れ条件

1. 試合が0件、または全試合が`cancelled`の大会で、titleが「大会情報・見どころ」になる
2. 全試合が`scheduled`かつ放送情報が1件以上ある大会（例: 開幕前のリポビタンDチャレンジカップ2026）で、titleが「日程・放送予定・見どころ」を含む
3. 全試合が`scheduled`だが放送情報が0件の大会で、titleに「放送予定」を含まない
4. 一部の試合が`finished`・一部が`scheduled`の大会（実データ検証: `nations-championship-2026`）で、titleが「最新結果・次戦・日程」を含む。`getStandingsForCompetition`の結果が1件以上ある場合は必ず「・順位」も含まれる
5. `scheduled`と`cancelled`のみが混在する大会（`finished`が無い）は「開催前」として扱われ、`finished`と`cancelled`が混在する大会（`scheduled`が無い）は「開催後」として扱われる（`activeMatches`ベースのアルゴリズムをテストで検証する）
6. 全試合が`finished`でrecapが1本以上ある大会（実データ検証: `six-nations-2026`）で、titleが「全試合結果・日本語レビュー」を含む
7. 全試合が`finished`だがrecapが0本の大会で、titleに「日本語レビュー」を含まない
8. 順位表を持たない大会（実データ検証: `lipovitan-challenge-cup-2026`、`competition_standings`0件）で、いずれの状態でも「順位」という語がtitleに含まれない
9. `family === "six-nations"`の大会では、いずれの状態でもdescriptionに「6カ国対抗」が含まれる
10. `getMatchBroadcastPresenceForMatches`のクエリ自体が失敗した場合、`generateMetadata()`はエラーをthrowする（catchして「放送情報なし」にフォールバックしない）
11. `pnpm tsc --noEmit` / `pnpm lint` / `pnpm test` / `pnpm build` が通る
12. 本番デプロイはOwner承認後に別途行う。GSCでの実際のCTR変化は数週間の観測が必要なため受け入れ条件には含めない

## 未解決の質問

なし。
