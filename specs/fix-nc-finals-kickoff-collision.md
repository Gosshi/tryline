# ネーションズチャンピオンシップ: 決勝週末と同じ組み合わせの試合が、決勝の日時へ書き換わる

## 背景
2026-11-22 14:46 JST の取り込みで、決勝週末（第7節）と同じ組み合わせの過去の試合 4 件が壊れた。

| 行 | 本来 | 取り込み後 |
|---|---|---|
| `452acd61` イングランド×NZ | 第6節 11/21 23:10 JST、37-12 | 11/29 01:40、第7節扱い、終了 37-12 |
| `8461c743` ウェールズ×日本 | 過去の節、28-21、レビュー公開済み | 11/28 22:10（日本の決勝週末の試合）、第7節扱い、終了 28-21 |
| `7cf4f5ed` フランス×南ア | 過去の節、21-19、レビュー公開済み | 11/30 01:40、第7節扱い、終了 21-19 |
| `f00294b4` イタリア×フィジー | （存在しなかった） | 11/28 01:40 に新規、終了 16-21（第6節 `e249c5a0` の複製） |

影響:
- 決勝週末の 4 試合（日本戦を含む）に本来の行が無い。日本の 11/28 22:10 の試合は「終了 28-21」と表示され、プレビューも作られない
- 試合ページ `/matches/8461c743…` に過去のレビューが、決勝の日付で表示されている
- `452acd61` に、終了した試合を「11月29日に行われた」と書いたプレビューが公開された（2026-11-22 21:12 JST 生成、preview@3.15.3）。11/21 のプレビューはこれで上書きされ、残っていない
- 順位表が複製行を二重に数えている可能性がある

## 原因（コードで確認済み）
**1. キックオフ時刻を「組み合わせ」だけで引いている。**
`lib/ingestion/sources/wikipedia-nations-championship.ts` の `parseNationsChampionshipLiveHtml` は World Rugby の時刻を

```ts
const kickoffTimeByTeams = new Map(
  kickoffTimes.map((match) => [`${match.homeTeamSlug}:${match.awayTeamSlug}`, match]),
);
```

で引く。World Rugby 側に決勝週末の試合が載ると、同じ組み合わせが 2 件になり、`Map` は後の 1 件（決勝）だけを残す。その結果、第6節以前の表の行（`wikipedia_event_id = round_N_…`）にも決勝のキックオフ・節番号（`round: kickoffTime.round`）が付く。

**2. 付いたキックオフで既存行を動かしてしまう。**
`lib/ingestion/upsert.ts` の `findExistingMatch` は `wikipedia_event_id` で既存行を見つけ、`buildMatchUpdate` が `kickoff_at: candidate.kickoffAt` で上書きする。終了済みの行でも何日でも動かせる。

**3. 動いた行に、決勝の候補が重なる。**
同じ実行の後半で、決勝の候補（Parsoid の id `mwBE…`、スコア無し）が「同じ組み合わせ・同じキックオフ」で、動いた行と一致する（`findExistingMatch` の `exactMatch`）。`external_ids` は第7節の id で上書きされる。一方 `keepExistingFinishedScore` があるので、終了とスコアは残る。今の 3 行の状態はこれで説明がつく。

イタリア×フィジーは、第6節の既存行 `e249c5a0` が Parsoid の id（`mwBEU`）で保存されていた。そのため id で見つからず、決勝の日時で新しい行が作られ、そこに決勝の候補が重なった（推定。修正後の dry-run で確かめる。受け入れ条件 6）。

**4. 終了した試合に、プレビューが作られた。**
`lib/cron/orchestrate.ts` と `cron-weekend-preview-refresh.yml` は、どちらも `status = scheduled` で候補を絞っている。それでも `452acd61`（終了）にプレビューが作られた。どの経路で作られたかは未特定（同時刻の GitHub Actions の run は無かった）。

## スコープ
対象:
- A. World Rugby の時刻を、組み合わせと日付の近さで引く（原因 1）
- B. 終了済みの試合のキックオフを、取り込みで大きく動かさない（原因 2・3 の歯止め。全大会に効く）
- C. 終了済みの試合にプレビューを作らない（原因 4。経路を特定し、`generateMatchContent` の入口で止める）
- D. 本番を直すための dry-run スクリプト（書き込まない）

対象外:
- 本番データの書き換え。D の出力を見て、Claude Code が承認を得て UPDATE を、Owner が DELETE を実行する
- 失われた 11/21 のプレビューの復元、過去記事の修正
- Parsoid の id が不安定な問題そのもの（RWC 2027 で既知）。A により、id で見つからなくても正しいキックオフで `exactMatch` に当たるようになる

## データモデル変更
なし

## API サーフェス
### A. `parseNationsChampionshipLiveHtml` の時刻の引き方
- Wikipedia の候補 1 件ごとに、World Rugby の時刻から「`homeTeamSlug`・`awayTeamSlug` が同じ」かつ「`|WR.kickoffAt − 候補.kickoffAt| ≤ 36 時間`」のものを探す（候補の `kickoffAt` は Wikipedia の日付から作った値）
- ちょうど 1 件なら今と同じく `kickoffAt`・`kickoffTimeTbd: false`・`round`・`venue` を付ける
- 0 件または 2 件以上なら付けずに候補のまま返し、2 件以上のときは `console.warn` に組み合わせと候補の日付を出す
- 候補に `kickoffAt` が無いときは付けない

### B. 終了済みの行のキックオフを動かさない
- `lib/ingestion/upsert.ts` の `writeMatches` で、`existing.status === "finished"` かつ `candidate.kickoffAt` と `existing.kickoff_at` の差が 48 時間を超える候補は、更新も挿入もしない
- 止めた候補は `console.error`（既存行の id・組み合わせ・前後のキックオフ）に出し、戻り値に件数を足す（`matchesSkippedUnsafe` など。今の `UpsertedMatch` の形に合わせる）
- `planMatchUpserts` も同じ条件の候補を `operation: "blocked"` として返す（`MatchUpsertPlan` の operation に追加）
- 正当に過去の試合の日付を直したいときは、この経路ではなく手動で直す（この仕様で許容する）

### C. 終了済みの試合にプレビューを作らない
- 2026-11-22 12:12:51Z（UTC）に `452acd61` のプレビューを作った経路を、Vercel の実行ログやコードから特定し、PR 本文に書く
- `generateMatchContent`（`lib/llm/pipeline`）で、`contentType === "preview"` かつ試合の `status === "finished"` のときは LLM を呼ばずに `status: "skipped"`（理由の文字列付き）を返す。既存の skip の返し方に合わせる

### D. `scripts/repair-nc-2026-finals-collision.ts`（dry-run のみ）
- 本番 DB と現在の Wikipedia・World Rugby を読み、A・B を入れた後の `planMatchUpserts` の計画を出力する
- 加えて、上の表の 4 行について「戻すべき値」を出す: World Rugby の同じ組み合わせのうち第7節でない方の `kickoffAt`・`round`、表の行の `wikipedia_event_id`（`round_N_home_v_away`）
- 出力は、`UPDATE` 文（対象 id と前後の値）と、`f00294b4` を消すための確認用 `select`（`match_content`・`match_events`・`match_lineups` の件数）。書き込みはしない
- 実行方法は `node --env-file=.env.production.local tools/run-ts.cjs scripts/repair-nc-2026-finals-collision.ts`

## UI サーフェス
なし

## LLM 連携
C で LLM を呼ぶ回数が減るだけ。新たな呼び出しはない。

## 受け入れ条件
1. A: World Rugby に同じ組み合わせが 2 件ある fixture（ウェールズ×日本の、過去の節 1 件と第7節 11/28 の 1 件。過去の節の番号・日付は fixture 上の値でよい）で、過去の節の表の行にはその節の時刻・`round` が、決勝の候補には第7節の時刻・`round: 7` が付く
2. A: 36 時間以内に 2 件ある fixture では時刻を付けず、`console.warn` が 1 回出る
3. B: 終了済み・11/21 の既存行に、11/29 のキックオフの候補を `upsertMatches` へ渡すと、`update` も `insert` も呼ばれず、戻り値の件数が 1。`planMatchUpserts` では `operation: "blocked"`
4. B: 終了済みで差が 48 時間以内（時刻の訂正）の候補は今どおり更新される。`scheduled` の行は差が何日でも今どおり更新される（既存テストを変えずに通る）
5. C: `status: "finished"` の試合に `contentType: "preview"` で `generateMatchContent` を呼ぶと、LLM のモックが 0 回で `skipped` が返る。`recap` は今どおり
6. D: スクリプトを本番に対して実行した出力を PR 本文に貼る（書き込みが 0 件であることも示す）。次の 3 点が出力に含まれること
   - 上の表の 4 行の戻し先
   - 決勝週末の 6 試合（アイルランド×豪州、スコットランド×アルゼンチン、ウェールズ×日本、イングランド×NZ、フランス×南ア、イタリア×フィジー）が、修復後にそれぞれ別の行として `insert` または既存行の `update` になる計画
   - 第6節以前の終了済みの行で、**キックオフの時刻そのもの**が変わる `update` が 0 件であること（2026-11-22 改訂）。時刻は文字列でなく時点として比べる（`+00:00` と `.000Z` は同じ時点）。表記だけの差は許容する。`e249c5a0` の `wikipedia_event_id` が `mwBEU` から `round_6_italy_v_fiji` に変わるのも許容する（Parsoid の id を安定した id に置き換えるため）。それ以外の列が変わる `update` は 0 件
   - B の判定（48 時間）も、時刻を時点として比べる
7. 意図的に壊す確認: A を元の `Map` に戻すと 1 が落ちる。B の条件を外すと 3 が落ちる。C の分岐を外すと 5 が落ちる（各出力を PR 本文に貼り、変更は戻す）
8. 既存テストの期待値を変えない・弱めない・消さない
9. `pnpm tsc --noEmit`・`pnpm lint`・`pnpm test`・`pnpm build` がすべて通る

## 本番の修復手順（マージ後・コード外）
1. D の出力を Claude Code が確かめ、Owner に UPDATE の対象行・前後の値を示して承認を得る。承認後に Claude Code が UPDATE を実行し、影響件数を確かめる
2. `f00294b4` に紐づく行が 0 件なら、Owner が DELETE を実行する（Claude Code は実行しない）。**次の取り込みより前に行う。** 残っていると、決勝のイタリア×フィジーの候補が同じ時刻のこの行（終了 16-21）に重なる
3. `452acd61` の誤ったプレビュー（終了した試合を 11/29 と書いたもの）の扱いは Owner が決める（下書きに戻すなら status の UPDATE）
4. 次の取り込みの後に、決勝週末の 6 試合が別の行で `scheduled`、第6節以前の行が元の日時のままであることを本番で確かめる

**期限:** 日本の決勝週末の試合は 11/28 22:10 JST。プレビューは前日の夜に作られるので、11/27 の昼までに 1〜4 を終える。

## 未解決の質問
- 3 の誤ったプレビューを下書きに戻すか、そのままにするか（Owner）
