# 大会シーズンハブ: 日程・結果がサーバー HTML に出ていない問題の修正

## 背景

大会シーズンページ `/c/[competition]/[season]` は、**Bing 流入の86%が着地する Tryline の最重要サーフェス**（`project_bing_dominates_google`、`project_hubs_are_the_product`）でありながら、**ページの中心である日程・結果がサーバー HTML に1件も出ていない。**

### 実測（2026-08-31、`curl -sL` で取得した生 HTML を検査）

| ページ | サーバー HTML 内の `href="/matches/<uuid>"` | ブラウザ描画後 |
|---|---|---|
| **`/c/urc/2025-26`（シーズンハブ）** | **1** | **151** |
| `/c/urc/2025-26/round/5`（ラウンドハブ） | 8 | 8 |
| `/calendar` | 9 | 9 |
| `/c/nations-championship/2026` | 3 | — |
| `/c/pnc/2026` | 2 | — |

**壊れているのはシーズンハブだけ。** ラウンドハブもカレンダーも正常にサーバーレンダリングされている。シーズンハブに残る 1〜3 件は `SeasonSummaryBand`（次戦・最新レビュー）由来で、日程節のものではない。

### データは既に HTML に入っている。リンクになっていないだけ

`/c/urc/2025-26` の HTML は 291,750 バイト。この中に:

- 試合 UUID が **150件（重複除去後）** 含まれている
- チーム名（例: `グラスゴー`）が **34回** 出現する
- しかし `href="/matches/<uuid>"` の形は **1件**しかない

つまり試合データは既に**クライアントコンポーネントの props としてシリアライズ済みで転送されている。** 欠けているのはレンダリングされたマークアップだけである。

**サーバーレンダリングに切り替えても転送バイト数はほとんど増えない。**

### 原因

`app/c/[competition]/[season]/page.tsx` は静的生成されている。

```ts
export const revalidate = 3600;                        // :56
export async function generateStaticParams() { ... }   // :58
```

日程節は `<Suspense>`（`:823`、**`fallback` 未指定**）の中で `SeasonMatchGroups` を描画している。`components/season-match-groups.tsx` は `"use client"` かつ `useSearchParams()` を呼ぶ（`:4`, `:113`）。

Next.js App Router は、**静的プリレンダ対象のルートで `useSearchParams()` を使うクライアントサブツリーに遭遇すると、そのサブツリーのプリレンダをバイパスする。** `<Suspense>` に `fallback` が無いため、静的 HTML にはそこが**空**として出力される。試合カードはハイドレーション後にはじめて DOM に現れる。

`useSearchParams()` は**ラウンドフィルタ（`?round=`）のためだけ**に使われている。

### 影響

1. **クロール可能な内部リンクが150本欠落している。** ハブから試合ページへの導線が HTML 上に存在しない
2. **ハブの本文テキストがインデックス対象から外れている。** チーム名・キックオフ時刻・節構成のいずれもマークアップされていない
3. **利用者には、ページの主コンテンツ領域が JS 実行まで空白**として見える。`<Suspense>` に `fallback` が無いため、スケルトンすら出ない

### 先行する依存

**本 spec は `specs/fix-hub-preseason-standings-and-round-filter.md` のマージ後に着手すること。** 同 spec が `ROUND_FILTERS` のハードコードを廃止し、**プールを持つ大会（rwc/2023・rwc/2027・nations-championship/2026 の3件のみ）以外ではフィルタ列そのものを描画しない**ようにする。これにより `useSearchParams()` を必要とする大会が3件に限定され、本 spec の修正範囲が大きく縮む。**順序を入れ替えると同じファイルで衝突する。**

## スコープ

対象:
- `components/season-match-groups.tsx` — サーバー／クライアントの分割
- `app/c/[competition]/[season]/page.tsx:823` の `<Suspense>` 境界

対象外:
- **静的生成をやめること。** `export const revalidate = 3600` と `generateStaticParams()` は**維持する**。ハブを動的レンダリングに落とすと `project_site_performance` で解消済みのキャッシュ MISS 問題を再発させる。**このルートを `dynamic = "force-dynamic"` にしない**
- ラウンドハブ（`/c/[competition]/[season]/round/[round]`）とカレンダー（正常動作中）
- `app/c/rwc/2027/page.tsx`（同じ問題があるか確認し PR 本文で報告するだけでよい。修正は対象外）
- 折りたたみの既定挙動（`shouldCollapseRoundGroups` / `getDefaultOpenGroupIndexes`）の変更
- 試合カード（`components/match-card.tsx`）の見た目
- デスクトップの情報密度（別 spec）

## データモデル変更

なし。

## API サーフェス

なし。`?round=` の挙動は `fix-hub-preseason-standings-and-round-filter.md` で決まったものを維持する。

## UI サーフェス

**見た目は変えない。** 変えるのは「いつマークアップが生成されるか」だけ。

### 満たすべき構造

1. **全試合カードがサーバー HTML に含まれる。** 折りたたまれている節の中身も含む
2. 折りたたみは**マークアップの有無ではなく表示制御で行う。** 現行の実装（`components/season-match-groups.tsx:250` 付近、`isOpen ? "grid gap-4 md:grid-cols-2" : "hidden"`）は**既にこの形**なので、これは現行挙動の維持である
3. **`useSearchParams()` を使うのは、フィルタ列を実際に描画する大会だけ**にする。フックは条件分岐できないため、`useSearchParams()` を呼ぶ部分を最小のクライアントコンポーネントに切り出し、**試合カードのツリーはサーバーコンポーネントとして生成して children で渡す**か、同等の分割を行う
4. `<Suspense>` を残す場合は `fallback` を指定する。空フォールバックのまま主コンテンツを包まない

### アクセシビリティ

- 折りたたみの `aria-expanded` と開閉ボタンの挙動を維持する
- 閉じている節の試合カードが HTML に存在することになるが、**スクリーンリーダーから見えないこと**を担保する（`hidden` クラスが `display:none` を当てているなら現行どおりで足りる。CSS で視覚的にだけ隠す方式に変えないこと）

## LLM 連携

なし。

## 受け入れ条件

**すべて `curl -sL <URL>` で取得した生 HTML に対して検証すること。ブラウザで確認しても意味がない。**

1. `/c/urc/2026-27` の HTML に `href="/matches/<uuid>"` が **144件以上**
2. `/c/urc/2025-26` の HTML に **150件以上**
3. `/c/premiership/2026-27` の HTML に **90件以上**
4. 同じ HTML に節見出し（`第1節` 等）が節グループ数と同数含まれる。`/c/urc/2026-27` なら **18件**
5. 同じ HTML にチーム名（日本語表記）が含まれる（0件でないこと）
6. `/c/nations-championship/2026` の HTML にフィルタタブ（`[role="tab"]`）と試合カードの**両方**が含まれる（フィルタが必要な大会でも SSR が壊れないこと）
7. `app/c/[competition]/[season]/page.tsx` に `export const revalidate = 3600` と `generateStaticParams` が**残っている**
8. 同ファイルに `export const dynamic` が**追加されていない**
9. ビルドログで `/c/[competition]/[season]` が静的生成（`●` / SSG・ISR）として扱われている。動的（`ƒ`）に変わっていない
10. `<Suspense>` が主コンテンツを包む形で残る場合、`fallback` が指定されている
11. **ブラウザでの挙動が変わっていないこと**: `/c/urc/2026-27` で節グループ18件、`aria-expanded="true"` が2件、開いている節の試合カード16件。`/c/urc/2025-26` で節グループ20件、試合カード150件
12. 折りたたみボタンをクリックすると開閉する
13. `/c/nations-championship/2026` でフィルタタブを選ぶと絞り込みが効く
14. 閉じている節の試合カードが `display:none` 相当で隠れ、スクリーンリーダーに露出しない
15. **HTML の転送サイズが `/c/urc/2025-26` で 400KB を超えない**（現状 291,750 バイト。データは既に payload に入っているため大幅増は設計ミスの兆候）
16. `pnpm lint` / `pnpm tsc --noEmit` / `pnpm test` / `pnpm build` がすべて clean

### デザイン品質

17. 見た目に差分が無い。`/c/urc/2026-27` と `/c/urc/2025-26` のデスクトップ幅 1440 のスクリーンショットを変更前後で比較し**差分ゼロ**
18. `fallback` を追加する場合、レイアウトシフトを起こさない高さを持つこと（既存トークンのみ使用）

## 判定方法（効果測定）

### 一次指標（SEO、反映に4〜8週）

`tools/gsc-pull.ts` を `--dims page,date` で実行する（**既定の `query,page` はクリックを100%取りこぼす**。`reference_gsc_query_dimension_data_loss`）。

| 指標 | 期待 |
|---|---|
| `/c/urc/2026-27`・`/c/premiership/2026-27` のインプレッション（4週後 vs 前） | 増加 |
| `/matches/` 配下のインデックス済み URL 数 | 増加（ハブからのリンクが150本増えるため） |

**Bing は GSC に映らない。** Bing 側は `tools/bing-pull.ts` で別途確認する。Bing がハブ流入の主役（Google の3倍）である以上、**GSC だけで判定しない。**

### 二次指標（即時）

| 指標 | 期待 |
|---|---|
| `/c/urc/2026-27` の LCP / CLS | CLS 改善（主コンテンツの遅延挿入が無くなるため）。目標 LCP < 2.5s / CLS < 0.1 |
| GA4 `/c/urc/2026-27` の 90% スクロール到達率 | 現行の長尺ハブ実測 19.0%（NC 2026、29/153、2026-06-01〜08-30）を下回らない |

**注意**: 効果は再クロールに依存するため **4週未満で判定しない。**

## 未解決の質問

1. **閉じている節も含め全カードを HTML に出すか、開いている節だけにするか。** 本 spec は「全カード」を選んだ。理由は (a) データが既に payload に入っており転送増が小さい、(b) 150本の内部リンクこそが主目的、(c) 現行実装が既に「全カードを描画して CSS で隠す」形で挙動差分が出ない。ただし受け入れ条件 15（400KB）を超えるなら、**開いている節＋全節見出し（ラウンドハブへのリンク付き）**に落とす案へ切り替える。ラウンドハブは既に正常に SSR されているため、リンクだけでもクロール経路は確保できる
2. **`app/c/rwc/2027/page.tsx` に同じ問題があるか。** 確認して PR 本文で報告すること。修正は別 spec
3. **ホーム（`/`）とチーム／選手ページに同種の問題があるか。** 本 spec では調べない。`/` は 366 ページビュー（2026-06〜08）で最大の面のため、別途確認する価値がある
