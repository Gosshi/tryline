# Nations Championship 2026: Wikipedia見出しの「[edit source]」表記でRound判定が全滅する不具合を修正

## 背景

`fix-nations-championship-vercel-ingestion-silent-zero.md`・`-round2.md`(いずれもマージ済み)で追加した診断ログにより、`nations-championship-2026` のingestionがVercel本番で0件になる**真因が確定した**。

**確認済みの事実**(2026-07-19、本番の実ログで確定):

新しく追加した `mwHeadingTexts` 診断ログ(PR #596)により、Vercel本番で実際に取得された見出しテキストが判明した:

```
'Round 1[edit source]', 'Round 2[edit source]', 'Round 3[edit source]',
'Round 4[edit source]', 'Round 5[edit source]', 'Round 6[edit source]'
```

一方、Claude Codeがローカルから同じページを取得した際は:

```
'Round 1[edit]', 'Round 2[edit]', 'Round 3[edit]', ...
```

**Wikipediaは同じ記事に対して、編集リンクのラベルが `[edit]` の場合と `[edit source]` の場合の2種類のレンダリングバリアントを返しうる**(`Vary: ...,Cookie,...` ヘッダの存在からも示唆される通り、キャッシュノード・セッション状態等により変動しうる)。

現在のコード(`lib/ingestion/sources/wikipedia-nations-championship.ts`)は、見出しテキストから末尾の編集リンクラベルを取り除く際に以下の正規表現を使っている(53-93行目の `getHtmlStructureDiagnostics`、171-188行目の `parseRoundTableMatches` の2箇所):

```ts
const roundName = normalizeWhitespace($(heading).text()).replace(
  /\[edit\]$/i,
  "",
);
```

この正規表現は**リテラルの `[edit]` のみ**にマッチし、`[edit source]` にはマッチしない。そのため `"Round 3[edit source]"` は `.replace()` で除去されず、`parseRoundNumber()`(45-50行目)の完全一致判定 `/^Round\s+(\d+)$/i` に一致せず、**Round見出しとして一切認識されなくなる**。見出しの総数(`mwHeadingCount`)自体は正しく26件検出されていたにもかかわらず、"Round N"と認識できた件数(`roundHeadingCount`)だけが0になっていた現象は、これで完全に説明がつく。

なお、UA不一致(修正済み)や送信元IP・Parsoid構造の違いといった当初の仮説はいずれも直接の原因ではなく、**Wikipediaが返す編集リンクラベルの表記ゆれに対して、パーサー側の除去ロジックが片方のパターンしか想定していなかった**、というシンプルな不具合だった。

## スコープ

対象:
1. `wikipedia-nations-championship.ts` 内の2箇所(`getHtmlStructureDiagnostics`・`parseRoundTableMatches`)の見出しテキスト正規化ロジックを、`[edit]` と `[edit source]` の両方(および将来出現しうる同種のバリアント)に対応できるよう修正する。実装方針は以下のいずれか(Codex判断):
   - (a) 正規表現を `/\[edit(?:\s+\S+)*\]$/i` のように緩めて `[edit ...]` 形式全般を除去する
   - (b) より堅牢に、テキストから正規表現で除去するのではなく、見出し要素内の編集リンク(`span.mw-editsection` 等、実際のDOM構造をCodexが確認して判断)自体をcheerio上で `.remove()` してから `.text()` を取る方式に変える
   - 実装しやすく・かつ将来の表記ゆれにも耐性がある方を選んでよいが、選んだ理由を完了報告に書く
2. 上記修正により、`fetchNationsChampionship2026()` が `[edit source]` 表記のページからも正しく試合データをパースできることをテストで担保する
3. 修正マージ後、Owner承認の上で本番の `nations-championship-2026` が正常に取り込まれることを確認する(手動 `gh workflow run` 等。今回追加済みの `target_url` を使ってPR Previewで先に検証してもよい)

対象外:
- 診断ログ自体の変更(前2回のspecで完了済み。本specは実際の修正のみ)
- 他大会ソース(URC・Premiership等)の同種パーサーへの横展開(`grep`で確認済みの通り、この`[edit]`除去パターンを使っているのは本ファイルのみ)
- Wikipediaが `[edit]` と `[edit source]` のどちらを返すかの根本原因(Wikipedia側の挙動)の特定

## データモデル変更

なし。

## API サーフェス

なし。

## LLM 連携

なし。ただし本修正により `nations-championship-2026` のスコア・イベントが正しく取り込まれた後、既存のrecap生成パイプラインが通常通り走る想定(追加のLLM呼び出しは発生しない)。

## 実装方針(提案。詳細実装は Codex 判断)

1. まず実際のWikipediaページ(`https://en.wikipedia.org/wiki/2026_Nations_Championship`)の見出しDOM構造を確認し(`div.mw-heading` 配下に編集リンクがどう入っているか)、テキストベースの正規表現除去とDOM要素除去のどちらが確実か判断する
2. `getHtmlStructureDiagnostics` と `parseRoundTableMatches` の両方に同じロジックを適用する(重複を避けたい場合は共通関数に抽出してよい)
3. 修正後、`[edit]` と `[edit source]` の両方のfixture HTMLに対してテストし、どちらでも同じ結果になることを確認する

## 受け入れ条件

1. 見出しテキストが `"Round 3[edit source]"` 形式の fixture HTML に対して、`parseRoundTableMatches()` が `round: 3` として正しくパースするユニットテストがある
2. 見出しテキストが `"Round 3[edit]"` 形式(従来通り)の fixture HTML に対しても、引き続き正しくパースすることを確認する既存テストが壊れていない
3. `fetchNationsChampionship2026()` の統合テスト(`tests/ingestion/live-sources.test.ts` 784行目付近)で、`[edit source]` 形式のHTMLを使ったケースでも6試合が正しく返ることを確認するテストがある
4. `getHtmlStructureDiagnostics` 側(診断ログ)も同様に、`[edit source]` 形式で `roundHeadingCount` が正しくカウントされることを確認する
5. `pnpm test` / `pnpm tsc --noEmit` / `pnpm lint` が通る
6. `fetchNationsChampionship2026` / `parseNationsChampionshipLiveHtml` の戻り値の型・呼び出し元インターフェースに破壊的変更がない
7. (Owner確認事項、実装スコープ外)マージ・デプロイ後、本番の `nations-championship-2026` Round 3の4試合(Australia v Italy, Fiji v Scotland, South Africa v Wales, Argentina v England)が正しく `finished` + 正スコアで取り込まれる

## 未解決の質問

- Round3の停滞している4試合の本番データ再取り込み自体は、修正マージ後の次回cron実行(または手動実行)で自然に解消される見込み。Owner承認の上で手動トリガーするかは別途判断
