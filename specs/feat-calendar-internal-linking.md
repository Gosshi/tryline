# カレンダーと大会ハブの相互内部リンク

## 背景

GA4 実測（2026-08-09〜10 取得、直近28日）で、滞在時間の長いページに人が届いていないことが判明した。

| ページ | セッション | 1セッション滞在 |
|---|---:|---:|
| `/c/nations-championship/2026`（大会ハブ） | 71 | 107秒 |
| `/`（トップ） | 79 | 36秒 |
| `/calendar` | **11** | **120秒** |
| `/matches/…`（試合詳細） | 7 | **3.6秒** |

`/calendar` は全ページ中で最長の滞在時間を持つのに、セッションは11しかない。一方、最も流入のある大会ハブ（71セッション）には **`/calendar` へのリンクが1本も存在しない**。

コードで確認した現状:

- `app/c/[competition]/[season]/page.tsx` — `/calendar` への内部リンクはゼロ。ヒーローの CTA 2つ（`580-593` 行）は**どちらも iCal フィード**で、iCal は7日で1リクエスト（実質ゼロ）
- `app/c/[competition]/[season]/standings/page.tsx` — 同じく `/calendar` へのリンクなし
- `app/calendar/page.tsx` + `components/calendar/week-schedule.tsx` — カレンダーからの発リンクは `/matches/{id}`（`week-schedule.tsx:114`）と `/matches/{id}#broadcasts`（同 `186`）のみ。**大会ハブへのリンクがゼロ**

つまり 120秒のページと 107秒のページが**両方向とも繋がっておらず**、カレンダーは 3.6秒の試合詳細にだけ人を送っている。`docs/notes/2026-08-10-acquisition-plans.md` の A5（カレンダーの内部露出）と F1（滞在の長いページ同士を繋ぐ）に対応する。

トップページには既に計測付きの導線が2本ある（`app/page.tsx:295-310` の `home_hero_calendar`、`components/home-matchday-board.tsx` の `home_focus_calendar`。`specs/fix-hero-cta-calendar.md` で実装済み）ため、本 spec の対象外とする。

## スコープ

対象:
- 大会ハブ（`/c/[competition]/[season]`）から `/calendar` への導線追加
- 順位表単独ページ（`/c/[competition]/[season]/standings`）から `/calendar` への導線追加
- カレンダー（`/calendar`）から大会ハブへの導線追加
- 上記すべてと、既存の未計測なカレンダー導線への `cta_click` 計測付与

対象外:
- トップページの導線変更（既に2本あり計測済み）
- iCal フィード機能そのものの変更・削除（`docs/notes/2026-08-10-acquisition-plans.md` C1 の通り、母数ができるまで転換率は判定しない）
- カレンダーページのレイアウト・週送り UI の作り替え
- 試合詳細ページへの導線の削除（減らすのではなく、大会ハブという選択肢を足す）
- 新しいクエリ・DB アクセスの追加
- モバイルアプリ（`tryline-mobile`）側の変更

## データモデル変更

**なし。マイグレーション不要。**

カレンダーから大会ハブへのリンクに必要な `family` と `season` は、既に `CalendarMatch.competition`（`lib/db/queries/matches.ts:108-123`）に含まれている。追加のクエリは不要。

**大会ハブの URL は `/c/{family}/{season}` であり、`slug` は使わない。** `app/c/[competition]/[season]/page.tsx:325` が `getCompetitionBySlug(\`${competition}-${season}\`)` を呼んでいる通り、ルート第1セグメントは `competitions.family` で、`slug` は `{family}-{season}` を連結した完全 slug（例 `nations-championship-2026`）である。`slug` をそのまま第1セグメントに入れると `/c/nations-championship-2026/2026` となり 404 になる。

本番の `competitions` 37件すべてで `slug = family || '-' || season` が成立し、`family` / `season` に NULL・空文字は無い（2026-08-10 実測）。`generateStaticParams`（同ファイル `51-67`）も `listFamilies()` の戻り値をそのまま `competition` パラメータに割り当てている。

## API サーフェス

**変更なし。**

## UI サーフェス

### 1. 大会ハブのヒーロー（`app/c/[competition]/[season]/page.tsx:580-593`）

現状、ヒーロー直下の CTA 行には iCal 系の2つだけが並んでいる。

```
[この大会を購読]  [大会iCal URL]
```

ここに `/calendar` への導線を**3本目として足す**。既存の2つは位置も見た目も変えない。

```
[この大会を購読]  [大会iCal URL]   今週の全試合を見る →
```

- 「今週の全試合を見る →」は `/calendar` へのリンク
- **既存の iCal 系2つは現状維持。** ヒーローから外さない、順序を入れ替えない、スタイルを変えない
- **3本目はピルにしない。** 同じ形のピルを3つ並べると階層が消え、既存の2つと役割の違いが読めなくなる。矢印付きのテキストリンクとして、囲みの無い形で置く
- 折り返し時（既存の `flex flex-wrap gap-2`）に、テキストリンクがピル2つと縦に重なっても読めること

### 2. 大会ハブのページ内ナビ（同ファイル `613-638`）

現状は `#schedule` / `#standings` / `#guide` のアンカー3つ。ここは**変更しない**。ページ内アンカーと外部遷移を同じ行に混在させると、ナビの意味が崩れる。

### 3. 大会ハブの日程セクション末尾

日程・結果の一覧が終わった位置に、「他の大会も含めた今週の試合 →」→ `/calendar` を置く。

順位表セクションに既にある「順位表をすべて見る →」（同ファイル `697-703`）と同じ見た目・同じ配置ルールに揃える。

ヒーローと日程末尾の2箇所に `/calendar` への導線が出ることになるが、ハブは縦に長くヒーローが画面外に消えるため重複ではない。計測は別の `cta_id` を振り、どちらが効いているか分離できるようにする。

### 4. 順位表単独ページ（`app/c/[competition]/[season]/standings/page.tsx:196-206`）

ページ下部に既にある大会ハブへの戻り導線の並びに、`/calendar` へのリンクを1本加える。ラベルは「今週の全試合を見る →」。

### 5. カレンダーの各試合カード（`components/calendar/week-schedule.tsx`）

現状、大会名（`118-123` 行）はカード全体を覆う `<Link href={/matches/${match.id}}>`（`112-115` 行）の内側にある**ただのテキスト**。

- 大会名から大会ハブ（**`/c/{competition.family}/{competition.season}`**）へ遷移できるようにする
- **カード全体が既に `<Link>` なので、大会ハブへのリンクをその内側に置いてはならない**（アンカーの入れ子は不正な HTML になる）。`match.hasBroadcasts` の「視聴」チップ（`185-195` 行）が外側の `<Link>` の**兄弟**として置かれているのと同じ構造にする
- `compact` モード（`WeekScheduleProps.compact`）でも破綻しないこと。トップページの `HomeMatchdayBoard` から同じコンポーネントが使われるため

### 6. カレンダーページ本体（`app/calendar/page.tsx`）

その週に試合がある大会の一覧を、週送りナビ（`162-176` 行）の近くに「大会別に見る」として並べ、それぞれ大会ハブへリンクする。

- 表示する大会は、**その週の `matches` に実際に含まれる大会だけ**を重複排除して出す。全大会を並べない
- 重複排除のキーは `family` + `season`（= リンク先 URL と1対1）。同一 family でもシーズンが違えば別ハブなので、まとめない
- 該当週に試合が無い場合はこのブロック自体を出さない

### 7. 計測

すべて `components/tracked-link.tsx` の `TrackedLink` を使う（`lib/analytics.ts:6-15` の `CtaClickParams`）。A5 が効いたかどうかを GA4 で判定できるようにするため、計測の無いリンクを追加しない。

| 場所 | `cta_id` | `cta_location` | `destination` |
|---|---|---|---|
| 大会ハブ ヒーロー | `hub_hero_calendar` | `hub_hero` | `calendar` |
| 大会ハブ 日程末尾 | `hub_schedule_calendar` | `hub_schedule` | `calendar` |
| 順位表単独ページ | `standings_calendar` | `standings_page` | `calendar` |
| カレンダー 試合カードの大会名 | `calendar_match_competition` | `calendar_match_card` | `competition_hub` |
| カレンダー 大会別に見る | `calendar_competition_list` | `calendar_header` | `competition_hub` |
| サイトヘッダー（既存・未計測） | `site_header_calendar` | `site_header` | `calendar` |

`components/site-header.tsx:45-52` の「カレンダー」は現在ただの `Link` で計測が無い。既存の `site_header_pricing` と同じ要領で `TrackedLink` にする。

## LLM 連携

なし。

## 受け入れ条件

1. `/c/nations-championship/2026` のヒーローに `/calendar` へのリンクが表示され、押下で `/calendar` に遷移する。
2. 同ページのヒーローに既存の「この大会を購読」「大会iCal URL」が**両方とも従来通りの位置・見た目で残っている**。3本目はピル状ではなく、既存2つと視覚的に区別できる。
3. 同ページの日程セクション末尾に `/calendar` へのリンクがある。
4. `/c/nations-championship/2026/standings` に `/calendar` へのリンクがある。
5. `/calendar` の各試合カードから `/c/{family}/{season}` へ遷移でき、実際に 200 が返る（`/c/nations-championship/2026` に着地し、`/c/nations-championship-2026/2026` のような 404 にならない）。
6. 5 のリンクが、試合詳細へ向かう外側の `<Link>` の**内側に入っていない**（レンダリング結果に `<a>` の入れ子が存在しない）。
7. `/calendar` に、その週に試合がある大会だけが並ぶ「大会別に見る」があり、試合が無い週には表示されない。
8. `WeekSchedule` を `compact` で使っているトップページ（`HomeMatchdayBoard`）のレイアウトが崩れていない。
9. 上表6つの `cta_id` すべてで `cta_click` イベントが発火する。
10. `/calendar` の既存の週送り・iCal 購読・試合詳細への遷移が、いずれも従来通り動作する。
11. 新しい DB クエリが追加されていない。
12. `pnpm lint` / `pnpm tsc --noEmit` / `pnpm test` / `pnpm build` clean。

## 未解決の質問

1. **効果判定の時期。** `/calendar` は現状11セッション。A5 の効果は 11 → 数十のオーダーで見るべきだが、8月は閑散期のため母数が小さい。**11月の日本代表欧州遠征（Nations Championship）で判定するのが妥当**で、それまでは `cta_click` の発火有無の確認に留める。
