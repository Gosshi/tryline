# インデックス肥大の解消（選手ページ noindex / チームURL二重化の統合）

## 背景

GSC 実測（2026-06-02）でインデックスの構造的欠陥が判明した。

| 指標 | 値 |
|------|-----|
| 登録済み（indexed） | 383 |
| 未登録 | 2,323 |
| └ 検出 - インデックス未登録（未クロール） | 2,237 |
| └ クロール済み - 未登録 | 77 |

**登録済み 383 の内訳を実測したところ、約85%が `/players/` ページで、その大半が `/players/player-<hash>`（氏名が解決できなかった匿名選手＝中身ほぼ空の自動生成ページ）だった。** 一方、本来の価値資産である recap（904件）の大半は「検出 - インデックス未登録」側に沈んでいる。

これは典型的な **index bloat（薄い自動生成ページの氾濫）** である。ゼロ権威ドメインに与えられる限られたクロールバジェットが、最も価値の低い匿名選手ページに食い潰され、Google が recap まで到達せず「クロールする価値なし」と判断している。さらに薄いページ群がサイト全体の品質シグナルを下げ、クロールバジェットをさらに抑制する負のループになっている。

被リンク獲得や IndexNow より前に解くべき、かつ**実装で完結する（自分たちのコントロール下にある）最優先課題**である。

加えて、`app/t/[team]/page.tsx`（132行）と `app/teams/[slug]/page.tsx`（169行）が**両方とも実体ページ**として存在し、両系統が index 済み（GSC で `/t/honda-heat` と `/teams/hurricanes` が共存）。チームページが重複コンテンツになっており、クロールと評価シグナルを二重に消費している。

### 既存 spec との関係

- `specs/fix-sitemap-content-only.md` … 試合 sitemap をコンテンツあり試合のみに絞り済み。**ただし「player/team は対象外」と明記**しており、本 spec はその除外部分を埋める後続作業。
- `specs/fix-seo-indexing.md` … recap/match/home の canonical・JSON-LD・内部リンクを対応済み。本 spec は recap 本体ではなく**周辺の薄いページ整理**を担当し、競合せず補完関係。

## スコープ

**対象:**

- `lib/db/queries/players.ts`
  - `listAllPlayerSlugs()`（L199-212）を「インデックス価値のある選手」限定の戻り値に変更、または新規 `listIndexablePlayerSlugs()` を追加。現在は `canonical_player_id IS NULL` の全スラッグを返しており、無名 `player-<hash>` を含む。
  - 選手ページ側でも「この選手は indexable か」を判定できるヘルパー（例: `isIndexablePlayer(player)`）を用意し、sitemap と page.tsx の判定を一元化する（DRY）。

- `app/sitemap.ts`
  - `playerPages`（L81-86）を indexable 選手のみに絞る。
  - チームの二重出力を canonical 一系統に統一（現在は `/t/${slug}` のみ出力だが、`/teams/` 側が内部リンク経由で index されているため、canonical 決定とリダイレクトが必要 → 下記）。

- `app/players/[slug]/page.tsx`
  - 非インデックス対象の選手に `robots: { index: false, follow: true }` を `generateMetadata` で付与。**sitemap 除外だけでは内部リンク（試合ラインアップ等）経由でクロールされ続けるため、noindex と sitemap 除外の両輪が必須。** `follow` は残し、リンク先（試合ページ）への PageRank は流す。

- チームURL二重化の解消（`app/t/[team]/page.tsx` と `app/teams/[slug]/page.tsx`）
  - **canonical = `/teams/[slug]`（決定済み）**。`/t/[team]` を `permanentRedirect`（301）で `/teams/[slug]` へ寄せる。
  - `app/sitemap.ts` の `teamPages`（L75-80）の出力を `/t/${slug}` → `/teams/${slug}` に変更。
  - 内部リンク（ヘッダー/フッター/試合ページ/選手ページ内のチームリンク等、`/t/` を指す全箇所）を `/teams/` に統一。`/t/` 参照の grep 漏れがないこと。
  - `/teams/[slug]` 側に `alternates.canonical` を明示。
  - 注: 移行方向として現状 sitemap・一部リンクが `/t/` を使うため `/teams/` 寄せの方が変更箇所は多いが、`/teams/[slug]`（169行）の方が実装が厚く意味的にも明確なため canonical に採用。

**対象外:**

- recap/match ページ本体の SEO（`fix-seo-indexing.md` で対応済み）。
- 選手ページへのコンテンツ拡充（将来、noindex 解除の判断材料。本 spec では「薄いから index しない」までを扱う）。
- 被リンク・X・note 等の配信施策（Owner 手動・別トラック）。
- robots.txt の変更（sitemap と meta robots で完結）。

## データモデル変更

なし（クエリのフィルタ変更のみ）。

**「インデックス対象選手」の定義（決定済み = (b)）:**

> **実名が解決されている AND「コンテンツありの試合（`match_content.status = 'published'`）」に1回以上出場している選手**のみ index 対象。

実装上の判定:
- **実名条件**: スラッグが `player-<hash>` 形式（氏名未解決の自動生成）でないこと。可能なら `players.name` が実名として解決済みかを DB 属性で判定し、`player-<hash>` 正規表現は最後のフォールバックとする。
- **出場条件**: 選手が、`listMatchIdsWithContent()` に含まれる試合のラインアップ（出場記録）に存在すること。`players` ↔ 出場記録テーブル（ラインアップ）↔ `match_content(published)` の結合で `listIndexablePlayerSlugs()` を構成する。結合に使うテーブル名は Codex が実コードで確認する（選手ページが「出場試合」を表示している箇所のクエリが参照元になる）。

両条件を満たさない選手ページは**ユーザーには従来どおり表示する（削除しない）**が、検索インデックスからは外す（noindex,follow）。将来スタッツ（トライ数・出場試合数など）を選手ページに実装した段階で、index 対象の再評価を行う（下記「将来の含み」）。

## API サーフェス

新規ルート・レスポンス形式の変更なし。内部の以下が変わる:

- `app/sitemap.ts` の出力 URL 集合（選手は indexable のみ、team は canonical 一系統）。
- 非 indexable 選手ページの HTTP レスポンスに `<meta name="robots" content="noindex, follow">`。
- 非 canonical チームURL が 301 を返す。

## UI サーフェス

ユーザー可視の見た目変更は原則なし。ただし:

- 非 canonical チームURL を踏んだ場合に canonical へ 301 で遷移する。
- 内部リンクのチームURLが canonical 系統に統一される（リンク切れを出さないこと）。

## LLM 連携

なし。

## 受け入れ条件（Codex が検証可能な粒度）

1. `https://www.trylinerugby.com/sitemap.xml` に `player-<hash>` 形式の URL が**一切含まれない**。
2. 非インデックス対象の選手ページが `<meta name="robots" content="noindex, follow">` を返す（`curl -s <url> | grep robots` で確認可能）。
3. 実名かつコンテンツありの選手ページは従来どおり index 対象（robots noindex を**付けない**）。
4. チームページは `/teams/[slug]` のみ 200 を返し、`/t/[team]` は 301 で `/teams/[slug]` へリダイレクトする（`curl -sI` で確認）。sitemap の team URL が全て `/teams/` 形式になっている。
5. sitemap の総 URL 数が、除外した非 indexable 選手数ぶん減少する（変更前後の URL 数を PR に記載）。
6. 内部リンクにチームのリンク切れ（404/301ループ）が発生しない。
7. （先行指標・数週後に Owner が GSC で確認）「検出 - インデックス未登録」が減少に転じ、登録済みに占める `/matches/` の比率が上がる。

## 確定した方針（Owner 決定 2026-06-02）

1. **インデックス対象選手 = (b)**: 実名 AND コンテンツあり試合に1回以上出場。上記「データモデル変更」参照。
2. **チーム canonical = `/teams/[slug]`**: `/t/[team]` を301で寄せる。上記「スコープ」参照。
3. **選手ページは削除せず閲覧可能のまま残す**。現状はスタッツ等のコンテンツ計画なしのため非 indexable な選手は noindex。

## 将来の含み（本 spec の対象外・別 spec 候補）

- Owner は将来、選手ページに**トライ数・出場試合数などのスタッツ**を表示して残したい意向。これが実装されれば選手ページは「薄いページ」でなくなり、index 価値を持つ。
- その段階で本 spec の noindex 判定（(b)）を**再評価・緩和**する。`isIndexablePlayer` を一元化しておくことで、将来の判定変更が1箇所で済むよう設計すること（本 spec のヘルパー方針の狙い）。
- スタッツ実装自体は別 spec（例: `feat-player-stats.md`）として起票する。

## 補足: Codex 向けプロンプト作成時の参考パターン

- 選手ページの alias→canonical `redirect` 実装（`app/players/[slug]/page.tsx` L66-67）が、条件付き出し分けの既存パターン。noindex 付与も同じ `generateMetadata` 内で行える。
- sitemap の content-only フィルタ（`listMatchIdsWithContent` を使う `app/sitemap.ts` L49-54）が、「DB クエリ側で対象を絞る」既存パターン。選手も同型で `listIndexablePlayerSlugs` を作るのが一貫的。
- Next.js Metadata の `robots`・`alternates.canonical` フィールドを使用（`app/matches/[id]/page.tsx` の canonical 実装を参照）。
