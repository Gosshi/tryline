`specs/feat-jrfu-lineup-ingestion.md` の仕様を実装してください。

コンテキスト:
- プロジェクト規約は `AGENTS.md` を読む
- 過去の判断は `docs/decisions.md` を読む
- 背景: 2026-08-13、8/15 オーストラリア戦のプレビューが**選手名ゼロ**で生成された。配線は正しく、`match_lineups` が空だったことが原因（第1戦・第2戦とも0行）。プレビューのプロンプトは**ラインアップがあれば各チーム最低3名の実名を出す**実装になっており、空のときは「選手名に言及しない」分岐に落ちる（捏造防止として正しい挙動）
- **既存の Wikipedia 経路では埋まらない。** この試合の `wikipedia_url`（`2026_Australia–Japan_rugby_union_test_series`）には `Line-ups` 見出しも `FB=`/`LP=` 等のパラメータも**0件**で、ソースにデータが無い。パーサの不具合ではない

参考にする既存パターン:
- **取り込みルート**: `app/api/cron/ingest-lineups/route.ts`。59〜78行が `wikipedia_url` → `fetchWithPolicy` → `parseMatchLineupFromHtml` の流れ。**ここに日本代表戦の分岐を足す**
- **選手の作成**: 同ファイル 85行付近の `ensurePlayerIds`（`players` に無ければ作る）。**同じ方針を使う**
- **リーグワン用の別経路**: `app/api/cron/ingest-league-one-lineups/route.ts`。ソース別に経路を分ける前例
- **取得の共通ポリシー**: `lib/scrapers/fetcher.ts` の `fetchWithPolicy`
- **許可ドメイン**: `lib/llm/sourced-facts/allowlist.ts`（`rugby-japan.jp` は登録済み）

ソース URL の辿り方（**ここが実装の核心**）:

```
1. https://www.rugby-japan.jp/braveblossoms/match/{YYYYMMDD}   ← kickoff_at を JST で整形
2. ページ内の「試合登録メンバー/試合記録はこちら」リンク → /match/{id}
3. /match/{id} に両チーム23人が「スターティングメンバー」「リザーブメンバー」で掲載
```

2026-08-13 実測で、8/15 戦は `/match/30035` に両チーム23人（背番号・氏名・身長・体重・生年月日）が載っていることを確認済み。

エッジケース:
- **`/match/{id}` の ID は日付から導出できない。** 必ず `/braveblossoms/match/{YYYYMMDD}` から辿ること。ニュース記事（`/news/54118` 等）の URL も ID が導出できないので使わない
- **`www` を付ける。** `rugby-japan.jp` 直（`www` なし）は**証明書エラー**になる（2026-08-13 実測）
- **日本代表が出場する試合のときだけこの経路を使う**（`teams.slug = 'japan'`、ホーム・アウェイどちらでも）。**それ以外の試合の挙動は一切変えない**
- **メンバーは48時間前に発表される。** 未発表のときは**エラーにせず `{ announced: false }` を返す**（既存と同じ）。プレビュー窓は12〜48時間前なので、窓の開始とほぼ同時に発表される
- **相手国チームが `teams` で解決できない場合はスキップして警告。** 誤ったチームに紐付けないこと
- **日本代表選手は漢字表記のまま登録する。** カタカナに変換しない（`specs/feat-japanese-player-kanji-names.md` で対応済みの方針）
- **`match_lineups.player_id` は NOT NULL。** `players` に無ければ作る

やらないこと:
- Wikipedia 経由の既存取り込みの変更
- **プレビュー／レビューのプロンプト変更**（すでにラインアップを使う実装。データが入れば自動で効く）
- 日本代表以外の試合
- 身長・体重・生年月日の取り込み
- 過去試合のバックフィル
- `docs/decisions.md` / `specs/*.md` / `CLAUDE.md` / `AGENTS.md` の変更

完了の定義:
- spec の受け入れ条件1〜10をすべて満たす
- テストを追加する。最低限、次の6ケース。**フィクスチャは実ページの HTML をそのまま使う**（手作り HTML は実データで壊れる前科がある）
  1. スターティング15人が `is_starter = true`、リザーブ8人が `false` になる
  2. 背番号が1〜23で正しく入る
  3. **日本側と相手側が入れ替わらない**
  4. 相手国が `teams` で解決できないときスキップして警告する
  5. メンバー未発表のとき `{ announced: false }` を返す（例外を投げない）
  6. **日本代表が出場しない試合では従来の Wikipedia 経路が使われる**
- `pnpm lint` / `pnpm tsc --noEmit` / `pnpm test` / `pnpm build` clean
- 変更ファイル一覧を報告する

完了時:
- 実装内容を要約する
- **実データで 8/15 の試合を取り込み、`match_lineups` の行数（期待値46）と、日本側の選手名が漢字で入っていることを報告する**
- **実際に叩いた URL を2つ（`/braveblossoms/match/...` と `/match/{id}`）そのまま貼る**
- spec の受け入れ条件を1項目ずつ、満たしたことをどう確認したかと合わせて報告する（「CI green」だけの報告は不可）
- 曖昧な箇所や仕様書と実環境の食い違いがあれば、その場で実装を停止して質問する
