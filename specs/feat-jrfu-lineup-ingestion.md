# 日本代表戦の試合登録メンバーを sourced_facts として取り込む

> **2026-08-13 全面改稿。** 初版は「JRFU から `match_lineups` へ取り込む」内容だったが、**名寄せが成立しないことが本番実測で判明した**ため方針を変更した。PR #690 でマージされた `match_lineups` 書き込み経路は本 spec で撤去する。経緯は「背景」参照。

## 背景

2026-08-13、8/15 オーストラリア戦のプレビューが**選手名ゼロ**で生成された。

配線もプロンプトも正常だった。`generate-preview.ts:162-169` はラインアップがあれば各チーム最低3名の実名を出す実装で、空のときは「選手名に言及しない」分岐に落ちる（`generate-preview.ts:223`）。**捏造防止として正しく機能している。** 問題は入力データが無かったこと。

### 初版の方針が破綻した理由

初版は JRFU 公式から `match_lineups` へ取り込む設計だった。PR #690 で実装・マージしたが、**本番で `{"error":"Failed to ingest lineups"}` を返した。**

直接の原因は `players.slug` が NOT NULL なのに insert に含まれていなかったこと。しかしこれを直すと、**より深刻な問題が表面化する**ことが本番実測で判明した。

```
日本代表の players 81名
  name が非ASCII（漢字・カタカナ）    0名   ← 全員ローマ字表記
  name_ja あり                       11名
```

既存は `Haruto Kida` / `Dylan Riley` / `Ben Gunter` のようにローマ字で登録されている（slug も `haruto-kida`）。一方 JRFU が返すのは `木田晴斗` / `ディラン・ライリー`。

`ensurePlayerIds` は `players.name` の完全一致で既存選手を探すため、**日本23名＋オーストラリア23名の計46名が新規作成され、既存選手と重複する。** `slug` の NOT NULL 違反は、結果的にこの重複を水際で止めていた。

**Owner 判断（2026-08-13）: JRFU 経路で `players` を新規作成しない。`match_lineups` にも書かない。**

### 代わりの経路

**プレビューのプロンプトは、選手名の出所として `sourced_facts` も認めている。**

> 選手名は入力データ（projected_lineups・match_events・**sourced_facts**）に含まれるものだけを使用すること（`generate-preview.ts:223`）

そして**第1戦では実際に機能していた。** `match_sourced_facts` に `rugby-japan.jp` 由来・`confidence='high'` で先発情報が入っている（実測）:

> 「日本代表FWは岡部崇人、江良颯、竹内柊平がフロントローを構成する。ジャック・コーネルセン、ワーナー・ディアンズがロック、バックローはベン・ガンター、下川甲嗣、マキシ・ファウルアとなった。」

第2戦でこれが無かったのは、**取得経路が LLM の Web 検索頼み**（`lib/llm/sourced-facts/fetch.ts`）で、決まった URL を叩く仕組みが無いため。8/13 の発表を検索が拾えなかった。

**この経路なら `player_id` の名寄せが不要**で、重複作成の問題が丸ごと消える。

## スコープ

対象:
- 日本代表が出場する試合で、**JRFU の試合登録メンバーページを決め打ちで取得し、`match_sourced_facts` に保存する**
- PR #690 で入った **`match_lineups` への書き込み経路を撤去する**

対象外:
- `players` / `match_lineups` への書き込み（**Owner 判断で明示的に除外**）
- Wikipedia 経由の既存取り込みの変更
- プレビュー／レビューのプロンプト変更（すでに `sourced_facts` を使う実装）
- 日本代表以外の試合
- **既存の LLM 検索経路の変更**（本 spec は決め打ち取得を「足す」だけ）
- 選手の身長・体重・生年月日

## データモデル変更

**なし。** 既存の `match_sourced_facts` を使う（`match_id` / `content_type` / `fact` / `fact_ja` / `source_url` / `source_domain` / `confidence` / `fetched_at` / `metadata`）。

## API サーフェス

**変更なし。** `POST /api/cron/fetch-sourced-facts?match_id=...&content_type=preview` の内部処理に、日本代表戦向けの決め打ち取得を追加する。

## 実装詳細

### 1. URL 解決（PR #690 の実装を流用）

```
1. https://www.rugby-japan.jp/braveblossoms/match/{YYYYMMDD}   ← kickoff_at を JST で整形
2. ページ内の「試合登録メンバー/試合記録はこちら」リンク → /match/{id}
```

**この部分は PR #690 で実装済みかつ実ページで動作確認済み**（`lib/scrapers/jrfu-lineups.ts` の `buildJrfuBraveBlossomsMatchUrl` / `findJrfuMatchUrl`）。**再実装しないこと。**

2026-08-13 実測: ランディングページに完全一致のアンカー `試合登録メンバー/試合記録はこちら` と `https://www.rugby-japan.jp/match/30035` が存在する。

### 2. fact の生成は LLM を使わない（重要）

**パース結果から決定的に文字列を組み立てる。** LLM に要約させない。

理由は2つある。**捏造の余地を無くすため**と、**追加の LLM コストを発生させないため**。

形式の例（チームごと・先発とリザーブで分ける）:

```
fact:    "日本代表の先発は1 岡部崇人、2 江良颯、3 竹内柊平、…、15 松永拓朗。"
fact_ja: 同一文字列（すでに日本語のため）
```

- `source_domain`: `rugby-japan.jp`
- `confidence`: `high`（公式一次情報のため）
- `content_type`: `preview`
- `source_url`: 実際に取得した `/match/{id}`
- **`metadata` に決め打ち取得であることを示す印を入れる**（LLM 検索由来と区別できるようにする）

### 3. 既存の検索結果との共存

**既存の LLM 検索経路は残す。** 決め打ち取得の結果を追加する形にする。

- **同じ試合で何度実行しても、決め打ち分が重複して増えないこと**（再実行は日常的に起きる）
- 既存の `force` フラグの挙動と矛盾しないこと

### 4. メンバー未発表のとき

公式ページに「試合登録メンバーはキックオフ予定時刻の48時間前に発表」と明記されている。

**未発表・ページ不在・パース失敗のいずれでも、`fetch-sourced-facts` 全体を失敗させないこと。** 決め打ち取得が取れなくても、既存の検索経路の結果は保存される。警告ログを出して続行する。

### 5. `match_lineups` 経路の撤去

PR #690 で `app/api/cron/ingest-lineups/route.ts` に追加した日本代表分岐を**撤去し、元の Wikipedia 経路に戻す**。

- `lib/scrapers/jrfu-lineups.ts` の**URL 解決とページのパースは残す**（本 spec で使う）
- 撤去するのは `match_lineups` / `players` への書き込みに至る経路のみ

## UI サーフェス

**変更なし。**

## LLM 連携

**プロンプトの変更なし。** `generate-preview.ts` はすでに `sourced_facts` を選手名の出所として認めている。データが入れば実名が出る。

**決め打ち取得そのものは LLM を使わない**（上記2）。

## 受け入れ条件

1. 8/15 オーストラリア vs 日本の試合で `fetch-sourced-facts` を実行すると、**`match_sourced_facts` に JRFU 由来の登録メンバーの fact が入る**（`source_domain='rugby-japan.jp'`、`confidence='high'`、`source_url` が `/match/{id}`）。
2. fact の文面に**両チームの先発15名とリザーブ8名の氏名と背番号**が含まれる。
3. **fact の生成に LLM を使っていない**（パース結果からの決定的な組み立て）。
4. **同じ試合で2回実行しても、決め打ち分の fact が重複しない。**
5. メンバー未発表・ページ不在・パース失敗のいずれでも、**`fetch-sourced-facts` 全体が失敗しない**（警告ログを出して続行）。
6. **日本代表が出場しない試合の挙動が一切変わっていない。**
7. **`players` と `match_lineups` への書き込みが発生しない**（PR #690 の経路が撤去されている）。
8. `ingest-lineups` の日本代表分岐が撤去され、**日本代表戦でも従来の Wikipedia 経路に戻っている。**
9. 取得が `fetchWithPolicy` を経由し、`skipRobotsCheck` を使っていない。URL に `www` が付いている。
10. `pnpm lint` / `pnpm tsc --noEmit` / `pnpm test` / `pnpm build` clean。

## 未解決の質問

1. **取得タイミングのズレは本 spec では解決しない。** メンバーは48時間前発表、プレビュー生成窓は12〜48時間前。**すでにプレビューが published の試合には `orchestrate` が何も実行しない**ため、発表後に自動で反映されない。手動で `fetch-sourced-facts` + `generate-content` を回す必要がある。**汎用の手動ワークフローが存在しない**（`grep -ln "ingest-lineups" .github/workflows/*.yml` が0件。雛形は `cron-ingest-league-one-lineups.yml`）。**別途 spec 化する。**

2. **相手チーム名の扱い。** `match_lineups` を使わないため team_id への紐付けは不要になったが、fact の文面に相手国名をどう書くかは実装判断。公式表記（「オーストラリア代表」）をそのまま使うのが安全。

3. **長期的には `players` の日本語表記を整備すべきか。** 81名中 name_ja は11名のみ。整備すれば将来 `match_lineups` 経路も選べるようになるが、**本 spec では扱わない。**
