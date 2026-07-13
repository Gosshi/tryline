`lib/sample-matches.ts` の `PRIMARY_SAMPLE_MATCH_ID` を差し替えてください。

コンテキスト:
- プロジェクト規約は `CLAUDE.md` を読む
- 現在の primary サンプル試合(`a06219be-9d24-486b-92a5-7f9f88ef8826`、ノーザンプトン・セインツ 36–32 グロスター、Premiership の一試合)は無料サンプルとして訴求力が弱いという Owner 判断があり、2023年ラグビーワールドカップ決勝(南アフリカ 12–11 ニュージーランド、match_id: `d31077ee-92c6-480e-bbef-87f955e6bc1d`)に差し替える
- 差し替え先の recap は Owner/Claude Code が2026-07-13に本番データの誤り(勝敗が逆に記述されていた・存在しないイベントデータ)を手動修正済みで、内容は検品済み。この修正自体はコード変更を伴わないデータ修正のため、本タスクのスコープには含まれない
- `lib/db/queries/sample-matches.ts` に `feat-sample-matches-auto-rotation.md` で実装済みのcron自動選定機能があり、`sample_matches` テーブルにレコードがあればそちらが優先される(`listCachedSampleMatchIds()`)。現時点でこのテーブルは空(cron未稼働)なので、`FALLBACK_SAMPLE_MATCH_IDS`（＝`PRIMARY_SAMPLE_MATCH_ID`含む静的配列）が実質的に有効な状態。本タスクはこの静的配列のみを変更する。cronが将来稼働した際に本変更が上書きされる可能性があることは把握済みで、その時の対応は別途 Owner が判断するため本タスクのスコープ外

変更内容:
1. `PRIMARY_SAMPLE_MATCH_ID` の値を `"d31077ee-92c6-480e-bbef-87f955e6bc1d"` に変更
2. `FALLBACK_SAMPLE_MATCH_IDS` 配列内に新しい `PRIMARY_SAMPLE_MATCH_ID` の値が重複して直書きされていないか確認する(先頭は既存通り `PRIMARY_SAMPLE_MATCH_ID` の変数参照のままでよい)
3. 元の primary だった `a06219be-9d24-486b-92a5-7f9f88ef8826` は、既存の8件の配列内に既に含まれているか確認し、含まれていなければ末尾に追加、含まれていれば何もしない(サンプル候補プールから完全に外さない)

処理すべきエッジケース:
- `getPrimarySampleMatchId()` は `getSampleMatchIds()` の先頭を返す実装になっているため、配列の並び順(`PRIMARY_SAMPLE_MATCH_ID` が先頭であること)を崩さないこと
- このファイルを参照している箇所(note-weekly ドラフトの送客リンク文言等)はコード外のドキュメントなので本タスクでは触らない

完了の定義:
- `pnpm tsc --noEmit` / `pnpm lint` / `pnpm test` / `pnpm build` clean
- 既存テストに `PRIMARY_SAMPLE_MATCH_ID` の値を直接アサートしているテストがあれば、新しい値に更新する

要件:
- 曖昧な箇所があれば末尾に質問として列挙する。推測しない
- `lib/db/queries/sample-matches.ts` のcron自動選定ロジック自体は変更しない(スコープ外)

完了時:
- 変更内容を要約する
