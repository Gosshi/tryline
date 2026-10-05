# アプリ向け API でチームの色を返す

## 背景

D037 の刷新で、アプリ（tryline-mobile）はチームの色を面・線・グラフに使うようになった（PR #77〜#79）。しかし API にチームの色が無いため、アプリは `src/theme/teamColors.ts` に**26 チームだけ**手で書き写している（モックに出てきたプレミアシップ・URC の一部・トップ14）。それ以外のチーム、たとえば日本代表・オールブラックス・南アフリカ・スーパーラグビーの全チーム・リーグワンは、色の無い墨色の面になる。11 月の日本代表の欧州遠征とネーションズチャンピオンシップで、一番見られる試合ほど色が無い。

Web は `lib/format/team-identity.ts` の `TEAM_IDENTITY` に 87 チームの色を持っている。これを API でも返し、アプリと Web で同じ色を使う（色の定義を 1 か所にする）。

2026-10-05 の本番 DB の確認（Claude Code）:
- `teams` は 91 件。そのうち `TEAM_IDENTITY` に色が無いのは `hong-kong-china`・`zimbabwe`・`honda-heat`・`us-montauban` の 4 件（香港とジンバブエは直近 120 日以内に試合がある）。
- アプリの書き写しと Web の値が食い違っているチームがある（`montpellier`: Web `#0A3A8D`、アプリ `#0A4A8D`）。この spec の後は Web の値に統一する。

この spec は Web 側（API）だけを扱う。アプリ側は tryline-mobile の `docs/specs/feat-team-colors-from-api.md` で扱い、この spec のマージ・デプロイ後に着手する。

## スコープ

対象:
1. API の `V1TeamSummary` に `color` を足す。
2. 順位表の API（`V1Standing`）に `team_slug` と `team_color` を足す。
3. 色が無い 4 チームに色を足す（値は下の「未解決の質問」で Owner が決める）。

対象外: Web の画面の見た目、色の値そのものの見直し（4 チームの追加を除く）、旗（`flag_code`）、`TEAM_STRIPES`（縞の色）、DB への列の追加。

## データモデル変更

なし。色は今どおり `lib/format/team-identity.ts` のコードで持つ（DB に列を足さない。理由: 色は表示だけのもので、取り込みで上書きされる心配が無いコードの定数の方が扱いやすい。`project_competition_name_ja_overwritten_by_ingest` の教訓）。

## API サーフェス

### 1. 色を返す関数（`lib/format/team-identity.ts`）

- 新しい関数 `getTeamColorOrNull(slug: string): string | null` を export する。`TEAM_IDENTITY[slug]?.color ?? null` を返す。
- 今の `getTeamColor` は変えない（色が無いと灰色 `#94a3b8` を返す。Web の画面はこれを前提にしている）。**API では灰色を返さない**。色が無いことと灰色のチームを区別できなくなり、アプリが自分の中立の色（墨色）を使えなくなるため。

### 2. `V1TeamSummary` に `color` を足す（`lib/api/v1/types.ts`）

```ts
export type V1TeamSummary = {
  color: string | null; // "#RRGGBB"（大文字）。色の定義が無いチームは null
  flag_code: string | null;
  id: string | null;
  name: string;
  score: number | null;
  short_code: string;
  slug: string;
};
```

- `V1TeamSummary` を作っているすべての場所で `color: getTeamColorOrNull(<team>.slug)` を入れる。2026-10-05 時点の場所（`rg -n "short_code:" app/api/v1` で 13 件）:
  - `app/api/v1/calendar/route.ts`（2）
  - `app/api/v1/competitions/[slug]/matches/route.ts`（2）
  - `app/api/v1/matches/[id]/route.ts`（4。試合本体と `next_team_matches`）
  - `app/api/v1/stories/route.ts`（2）
  - `app/api/v1/me/next-matches/route.ts`（2）
  - `app/api/v1/competitions/[slug]/standings/route.ts`（1。これは `V1Standing` なので 3 で扱う）
- 旗を隠す処理（`suppressFlags`）は色に関係させない。色は結果を表さないので、スコアを隠す設定でも返してよい（アプリ側で既に色を表示している）。

### 3. `V1Standing` に `team_slug` と `team_color` を足す

```ts
export type V1Standing = {
  // ...今の項目
  team_color: string | null;
  team_slug: string | null;
};
```

- `StandingRow` は既に `teamSlug?: string` を持っている（`lib/db/queries/standings.ts`。通常の順位表とプールの順位表の両方）。`mapStanding` で `team_slug: standing.teamSlug ?? null`、`team_color: standing.teamSlug ? getTeamColorOrNull(standing.teamSlug) : null` を入れる。
- 理由: アプリは今、順位表の `team_short_code` から slug を引く表を自分で持っている（26 件）。slug を返せばその表が要らなくなる。

### 4. 互換性

- フィールドを足すだけで、消したり型を変えたりしない。今のアプリ（1.0.3 / 1.1.0）は知らないフィールドを無視するので壊れない。
- `reference/api-types.ts` は無い。アプリの `src/api/types.ts` へは、tryline-mobile 側の spec で同期する（`feedback_api_types_sync`）。

## UI サーフェス

なし（Web の画面は変えない）。

## LLM 連携

なし。

## 受け入れ条件

1. `getTeamColorOrNull` のテスト: `japan` → `"#BC002D"`、`TEAM_IDENTITY` に無い slug → `null`。
2. **色の網羅のテスト**: 本番の `teams` の slug 一覧（下の 91 件）を fixture にして、`getTeamColorOrNull` が `null` を返す slug が、未解決の質問 1 で Owner が「色なし」と決めたものだけであること。fixture はテストファイルに配列で直書きする（DB に繋がない）。
   - 91 件の一覧は、Claude Code が 2026-10-05 に本番 DB から取った `select slug from teams order by slug` の結果。**この spec の末尾の一覧をそのまま使う**（Codex は本番 DB に繋がない）。
3. 色の値の形式のテスト: `TEAM_IDENTITY` の全 `color` が `/^#[0-9A-F]{6}$/` に合う（小文字・3 桁を混ぜない。アプリ側で比較するため）。
4. ルートのテスト（既存のテストに足す）:
   - カレンダー: 色のあるチームの試合で `home_team.color` が `TEAM_IDENTITY` の値、色の無い slug で `null`。
   - 試合詳細: `home_team.color`・`away_team.color` と、`next_team_matches[].home_team.color` が入る。
   - 順位表: 通常の順位表とプールの順位表の両方で、`team_slug` と `team_color` が入る。`teamSlug` が無い行は両方 `null`。
5. 「壊して落ちる」確認（コミットしない）: `calendar/route.ts` の `color` を 1 か所消すと 4 のテストが落ちる。`getTeamColorOrNull` を `getTeamColor` に替える（灰色を返す）と 1 のテストが落ちる。出力を PR 本文に貼る。
6. `pnpm tsc --noEmit`・`pnpm lint`・`pnpm test`・`pnpm build` がすべて通る（CI の `validate`）。
7. PR 本文に、プレビューの `/api/v1/calendar` の応答の一部（日本代表かオールブラックスの試合 1 件）を貼る。

## 実行範囲（本番操作）

なし。マージ後、Claude Code が本番の `/api/v1/calendar` と `/api/v1/competitions/<slug>/standings` で色が返ることを確認してから、tryline-mobile 側の spec を Codex に渡す。

## 未解決の質問

1. ~~色の無い 4 チームの色~~ → **2026-10-05 Owner 決定**。`TEAM_IDENTITY` に次の 3 チームを足す（`flag` は国代表は国旗、クラブは `"🏉"`。既存の書き方に合わせる）:
   - `hong-kong-china`: `#C8102E`（`flag`: `"🇭🇰"`）
   - `zimbabwe`: `#006B3F`（`flag`: `"🇿🇼"`）
   - `honda-heat`: `#E60012`（`flag`: `"🏉"`）
   - `us-montauban`: **足さない**（色なし＝`null`）。受け入れ条件 2 で `null` を許す slug はこの 1 件だけ。

残る未解決の質問は無い。

## 付録: 本番の teams の slug（2026-10-05、91 件）

```
argentina, australia, bath, bayonne, benetton, blues, bordeaux-begles, bristol-bears, brumbies, bulls,
canada, canon-eagles, cardiff, castres, chiefs, chile, clermont, connacht, crusaders, dragons,
edinburgh, england, exeter-chiefs, fiji, fijian-drua, force, france, georgia, glasgow-warriors, gloucester,
grenoble, harlequins, highlanders, honda-heat, hong-kong-china, hurricanes, ireland, italy, japan, kobelco-kobe-steelers,
kubota-spears, la-rochelle, leicester-tigers, leinster, lions, lyon, mitsubishi-dynaboars, moana-pasifika, montpellier, munster,
namibia, new-zealand, newcastle-falcons, northampton-saints, ospreys, pau, perpignan, portugal, racing-92, rebels,
reds, ricoh-black-rams, romania, saitama-wild-knights, sale-sharks, samoa, saracens, scarlets, scotland, sharks,
shizuoka-blue-revs, south-africa, spain, stade-francais, stormers, tokyo-suntory-sungoliath, tonga, toshiba-brave-lupus, toulon, toulouse,
toyota-verblitz, ulster, urayasu-d-rocks, uruguay, us-montauban, usa, vannes, wales, waratahs, zebre,
zimbabwe
```
