既存のPR #496（ブランチ `codex/fix-top14-srp-standings-weekly`）に対する修正依頼です。新規PRは作らず、このブランチに修正コミットを追加してください。

見つかった不具合（実データで検証済み）:
- Top14の修正（脚注除去）は機能している（`node --env-file=.env.production.local tools/run-ts.cjs scripts/backfill-standings.ts --family=top-14 --season=2025-26 --dry-run` で `parsed=14`。Montaubanが未マッチなのはこのPRのマイグレーション未マージによるもので想定通り）
- **Super Rugby Pacific は依然として `parsed=0` のまま、直っていません**。同じdry-runコマンドを `--family=super-rugby-pacific --season=2026` で実行しても `No compatible competition standings rows were found.` が出る

原因を実際のページHTML（`https://en.wikipedia.org/wiki/2026_Super_Rugby_Pacific_season`）を取得して特定済み:

Super Rugby Pacificの順位表は Wikipedia の「Sports table」テンプレートモジュールで生成されており、**Teamヘッダーセル（`<th>`）の中に `<style data-mw-deduplicate="TemplateStyles:...">` タグがインラインで埋め込まれている**（`Hlist/styles.css`・`Module:Navbar/styles.css` 由来のCSSルールが数千文字分）。今回のPRで追加された `v t e` テキストパターンの除去では対処できず、実際に `cheerio` で `$(header).text()` を実行すると以下のような結果になることを確認済み:

```
"Team.mw-parser-output .hlist dl,.mw-parser-output .hlist ol,.mw-parser-output .h...[3456 chars total]"
```

正規化（小文字化・非英数字除去）してもこの巨大なCSS文字列に埋もれてしまい、`"team"` に一致しない。**追加したテスト（`tests/scrapers/wikipedia-standings.test.ts` の「parses Super Rugby Pacific standings headers with Wikipedia navbar text」）は、`<style>` タグ混入という実際の構造を反映していない簡略化されたHTML fixture（`<th>Team v t e</th>`）を使っており、テストは通っても実データでは機能しない状態だった**。

修正内容:
- `lib/scrapers/wikipedia-standings.ts` のヘッダーテキスト抽出処理（`normalizeHeader` を呼ぶ箇所、および可能であればデータセルのテキスト抽出全般）で、テキスト取得前に `<style>` と `<script>` タグの中身を除外すること。例: `$(cell).clone().find("style, script").remove().text()` のように、クローンしてから不要なタグを除去してテキストを取る
- テストを実際の構造に合わせて修正する。`tests/scrapers/wikipedia-standings.test.ts` の該当テストのHTML fixtureに、実際に確認された `<style data-mw-deduplicate="...">...(CSS content)...</style>` を含む `<th>` 構造を再現し、それでも正しく "Team" 列として認識されることを検証する

処理すべきエッジケース:
- ヘッダーだけでなく、データセル（チーム名セル等）にも同様の `<style>` タグ混入が将来発生し得るため、テキスト抽出のユーティリティ関数として共通化し、ヘッダー・データセル両方で使うことが望ましい
- 修正後、`node --env-file=.env.production.local tools/run-ts.cjs scripts/backfill-standings.ts --family=super-rugby-pacific --season=2026 --dry-run` を実行し、`parsed` が11件（またはそれに近い正の件数）になることを確認すること。これは本番相手の読み取り専用コマンドなので実行してよい
- Top14（既に動いている）や他の大会（Premiership・URC・Six Nations）のパースを壊していないこと

完了の定義:
- 上記dry-runコマンドで Super Rugby Pacific が `parsed>0` になることを実際に確認する（テストのpassだけでなく、実データでの動作確認を必須とする。今回の不具合はテストが実態を反映していなかったことが原因のため）
- `pnpm test` で全テストが通る
- `pnpm tsc --noEmit` / `pnpm lint` / `pnpm build` clean

要件:
- Top14向けの脚注除去修正・Montaubanのマイグレーション・週次cronの実装は変更しない（正常に動作しているため）
- 曖昧な箇所があれば末尾に質問として列挙する。推測しない

完了時:
- 修正内容を要約する
- Super Rugby Pacificのdry-run結果（parsed件数）を報告する
- Owner への未解決の質問があれば記載する
