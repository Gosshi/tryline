# 汚染の片付けスクリプトと週次監査の読み込み漏れの修正と、公開中のレビューを残す指定

## 背景

`specs/fix-event-contamination-residue.md`（#881 でマージ済み）のマージ後、Claude Code が片付けのスクリプトを dry-run で実行した（2026-09-24）。

- **汚染と判定されたのは 3 試合だけ**だった（フィジー 対 ウェールズ `8504834e`、アルゼンチン 対 スコットランド `42bebc1f`、オーストラリア 56-17 日本 `f01f68e2`）。
- 残りの汚染 3 試合（オーストラリア 対 アイルランド `59513a57`、南アフリカ 対 イングランド `b5b2af27`、日本 対 イタリア `f56e9ee9`）と、持ち主のニュージーランド 対 フランス（`e13e388d`）が出てこない。Nations Championship の組は「持ち主なし」と表示された。
- 本番 DB の SQL では、6 試合の分・種別の並びは一致している（spec の背景を参照）。

**原因:** `scripts/cleanup-contaminated-events.ts` の `loadFinishedMatchesWithEvents`（66-91 行）は、完了済みの試合を 1 回の問い合わせで読んでいる。完了済みの試合は 1,088 件（2026-09-24 実測）で、Supabase の 1 回あたりの上限 1,000 件で打ち切られる。並び順も指定していないので、どの 88 件が落ちるかは決まっていない。

週次のデータ整合監査（`lib/data-integrity/audit.ts` の `loadFinishedMatches`（474 行））も、完了済みの試合を同じ形で読んでおり、同じく約 88 試合を見ていない。

あわせて、Owner の決定（2026-09-24）: **片付けで削除する試合の公開中のレビューは、下書きに戻さず公開のまま残す。** 現行のスクリプトは、削除した試合の公開済みレビューを下書きに戻す（`runCleanup`、6 月からの既存の動き）。Nations Championship 第 1 節の 5 試合のレビューは 7/4〜7/8 に生成されており、7/12 の汚染より前のため。本文は、正しいイベントを取り直したあとで Claude Code が照合する。

## スコープ

**対象**
1. 片付けのスクリプトと週次監査で、完了済みの試合を全件読む（`lib/db/pagination.ts` の `loadAllPages` を使う）。
2. 片付けのスクリプトに `--keep-published` を足す。指定したときは、イベントの削除だけを行い、レビューの状態を変えない。

**対象外**
- 判定の仕組み（`findStructuralContamination`）の変更。
- 他のスクリプトや cron の、同じ種類の読み込み漏れの全件調査（見つけたら別に報告する）。

## データモデル変更

なし。

## API サーフェス

### 1. 全件の読み込み

- `scripts/cleanup-contaminated-events.ts` の `loadFinishedMatchesWithEvents` を `loadAllPages` で書き直す。
  - 並び順は `id` の昇順に固定する（ページの境界で行が重複したり落ちたりしないようにするため）。
  - 埋め込み（`match_events`、`match_content`、チーム名）は今のまま。
- `lib/data-integrity/audit.ts` の `loadFinishedMatches`（474 行）も、同じく `loadAllPages` と `id` の昇順にする。
- 同じファイルの他の読み込み（下書きのレビュー、順位表、キックオフを過ぎた予定の試合）は、今の件数（それぞれ 1,000 件未満）では打ち切られないので、変えない。

### 2. `--keep-published`

- `parseOptions` が `--keep-published` を受け付ける。`--confirm-owner-approved` と一緒に使う。単独でも受け付けるが、dry-run では何も変えないので意味は持たない。
- `runCleanup` に `keepPublished: boolean` を足す。`true` のときは `match_content` の更新（下書きに戻す処理）を呼ばない。
- 実行結果の表示は、`keepPublished` のとき「レビューの状態は変更していない（公開中 N 本を維持）」と出す。N は対象の試合の公開済みレビューの本数。
- dry-run の一覧の末尾に、`--keep-published` を付けた場合と付けない場合で、レビューがどうなるかを 1 行ずつ表示する。

## UI サーフェス

なし。

## LLM 連携

なし。

## 受け入れ条件

1. **全件を読む。**
   - `loadFinishedMatchesWithEvents` が、1,000 件を超える試合を複数ページに分けて全件返すこと。
   - Supabase のクライアントをモックにし、1,500 件を 2 ページで返すテストで確かめる。
   - 確認方法: ページ分けを外すと、このテストが落ちること。
2. 週次監査の完了済みの試合の読み込みも、同じテストの形で全件を返すこと。
3. **`--keep-published`:**
   - `--confirm-owner-approved --keep-published` では、`match_events` の削除は呼ばれ、`match_content` の更新は呼ばれない。
   - `--confirm-owner-approved` だけでは、今までどおり両方が呼ばれる。
   - どちらもモックで確かめる。
4. `pnpm lint`、`pnpm typecheck`、`pnpm test` が通る。**3 つとも実行して、結果を完了報告に含める。**

## マージ後の確認（Claude Code が行う）

5. 片付けのスクリプトを dry-run で実行し、次のとおりになることを確かめる。
   - 汚染と判定される試合が `42bebc1f`、`b5b2af27`、`8504834e`、`59513a57`、`f56e9ee9`、`f01f68e2` の 6 試合で、それ以外にないこと。
   - 持ち主が `e13e388d` と `2c276057` であること。
   - 6 試合以外が出た場合は、削除に進まずに内容を報告する。
6. Owner が `--confirm-owner-approved --keep-published` で実行する（削除を伴うので、Claude Code は実行しない）。

## 未解決の質問

なし。
