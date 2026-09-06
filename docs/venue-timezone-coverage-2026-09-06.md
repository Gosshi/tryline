# 会場タイムゾーン カバレッジ一覧（2026-01-01 以降）

`specs/fix-venue-local-time-timezone.md` の `VENUE_TIMEZONES` を埋めるための元データ。**本番から生成した実測値であり、タイムゾーンの推定値は一切含まない。**

- 生成: 2026-09-06T12:07:52.648Z
- 対象: `kickoff_at >= 2026-01-01` かつ `venue` が非 null の **669 試合**
- 正規化後の distinct 会場: **146**
- うち脚注付きの表記を含む会場: **10**（下記「脚注付き」参照）

## 読み方

- `venue` は `/\[[^\]]*\]/g` で脚注を除去し空白を畳んだ文字列。**数字脚注 `[17]` と英字脚注 `[a]` の両方を除去している。現行実装は数字のみなので、この一覧を使う前に正規表現を直すこと**
- 辞書のキーは、この文字列をさらに小文字化したもの（`normalizeVenue` の出力）
- `home_teams` はその会場をホームとして使うチーム。**国を判断する材料であって、タイムゾーンを home_team から導いてはならない。** 中立会場では複数国が並ぶ（RWC 2027 の会場を見れば分かる）
- 同一会場が別表記で複数行に現れる場合は、**両方をキーとして登録する**（「表記ゆれ」参照）
- **確信を持てない会場は登録しない。** 未登録は現地行が出ないだけで安全側に倒れる。推測で埋めることは、この仕様が直そうとしているバグそのもの

## 一覧

| # | venue（正規化後） | 試合 | competitions | home_teams |
|---:|---|---:|---|---|
| 1 | `Prince Chichibu Memorial Rugby Ground (Tokyo)` | 27 | league-one-2025-26 | canon-eagles, honda-heat, kobelco-kobe-steelers, kubota-spears, mitsubishi-dynaboars, ricoh-black-rams, saitama-wild-knights, tokyo-suntory-sungoliath, toshiba-brave-lupus, urayasu-d-rocks |
| 2 | `Kings Park Stadium, Durban` | 16 | greatest-rivalry-2026, urc-2025-26, urc-2026-27 | sharks |
| 3 | `Ravenhill Stadium, Belfast` | 15 | urc-2025-26, urc-2026-27 | ulster |
| 4 | `Cape Town Stadium` | 14 | urc-2025-26, urc-2026-27 | stormers |
| 5 | `CorpAcq Stadium` | 14 | premiership-2025-26, premiership-2026-27 | sale-sharks |
| 6 | `Edinburgh Rugby Stadium` | 14 | urc-2025-26, urc-2026-27 | edinburgh |
| 7 | `Franklin's Gardens` | 14 | premiership-2025-26, premiership-2026-27 | northampton-saints |
| 8 | `Parc y Scarlets, Llanelli` | 14 | urc-2025-26, urc-2026-27 | scarlets |
| 9 | `Sandy Park` | 14 | premiership-2025-26, premiership-2026-27 | exeter-chiefs |
| 10 | `The Sportsground, Galway` | 14 | urc-2025-26, urc-2026-27 | connacht |
| 11 | `Cardiff Arms Park` | 13 | urc-2025-26, urc-2026-27 | cardiff |
| 12 | `Rodney Parade, Newport` | 13 | urc-2025-26, urc-2026-27 | dragons |
| 13 | `Welford Road` | 13 | premiership-2025-26, premiership-2026-27 | leicester-tigers |
| 14 | `Ashton Gate` | 12 | premiership-2025-26, premiership-2026-27 | bristol-bears |
| 15 | `Aviva Stadium, Dublin` | 12 | six-nations-2026, six-nations-2027, urc-2025-26 | ireland, leinster |
| 16 | `Kingsholm` | 12 | premiership-2025-26, premiership-2026-27 | gloucester |
| 17 | `The Recreation Ground` | 12 | premiership-2025-26, premiership-2026-27 | bath |
| 18 | `StoneX Stadium` | 11 | premiership-2025-26, premiership-2026-27 | saracens |
| 19 | `Twickenham Stoop` | 11 | premiership-2025-26, premiership-2026-27 | harlequins |
| 20 | `Thomond Park, Limerick` | 10 | urc-2025-26, urc-2026-27 | munster |
| 21 | `Ellis Park Stadium, Jo'burg` | 9 | urc-2026-27 | lions |
| 22 | `Ellis Park Stadium, Johannesburg` | 9 | greatest-rivalry-2026, urc-2025-26 | lions, south-africa |
| 23 | `Kingston Park` | 9 | premiership-2026-27 | newcastle-falcons |
| 24 | `Loftus Versfeld, Pretoria` | 9 | urc-2026-27 | bulls |
| 25 | `One NZ Stadium, Christchurch` | 9 | super-rugby-pacific-2026 | blues, chiefs, crusaders, highlanders, hurricanes |
| 26 | `St Helen's, Swansea` | 9 | urc-2026-27 | ospreys |
| 27 | `Stadio Monigo, Treviso` | 9 | urc-2026-27 | benetton |
| 28 | `Stadio Sergio Lanfranchi` | 9 | urc-2026-27 | zebre |
| 29 | `FMG Stadium Waikato, Hamilton` | 8 | super-rugby-pacific-2026 | chiefs |
| 30 | `Kumagaya Rugby Stadium (Saitama)` | 8 | league-one-2025-26 | saitama-wild-knights |
| 31 | `Loftus Versfeld Stadium, Pretoria` | 8 | greatest-rivalry-2026, urc-2025-26 | bulls |
| 32 | `RDS Arena, Dublin` | 8 | urc-2026-27 | leinster |
| 33 | `Scotstoun Stadium` | 8 | urc-2026-27 | glasgow-warriors |
| 34 | `Allianz Stadium, Sydney` | 7 | super-rugby-pacific-2026 | waratahs |
| 35 | `GIO Stadium, Canberra` | 7 | super-rugby-pacific-2026 | brumbies |
| 36 | `Hnry Stadium, Wellington` | 7 | super-rugby-pacific-2026 | hurricanes |
| 37 | `Murrayfield Stadium, Edinburgh` | 7 | six-nations-2026, six-nations-2027, urc-2025-26, urc-2026-27 | edinburgh, glasgow-warriors, scotland |
| 38 | `Suncorp Stadium, Brisbane` | 7 | super-rugby-pacific-2026 | reds |
| 39 | `Adelaide Oval, Adelaide` | 6 | rwc-2027 | argentina, england, fiji, japan, south-africa, wales |
| 40 | `Brewery Field, Bridgend` | 6 | urc-2025-26 | ospreys |
| 41 | `Brisbane Stadium, Brisbane` | 6 | rwc-2027 | argentina, australia, england, france, scotland, south-africa |
| 42 | `Docklands Stadium, Melbourne` | 6 | rwc-2027 | argentina, france, ireland, new-zealand, scotland, wales |
| 43 | `Eden Park, Auckland` | 6 | super-rugby-pacific-2026 | blues |
| 44 | `Forsyth Barr Stadium, Dunedin` | 6 | super-rugby-pacific-2026 | highlanders |
| 45 | `HBF Park, Perth` | 6 | super-rugby-pacific-2026 | force |
| 46 | `Kobe Universiade Memorial Stadium (Hyogo)` | 6 | league-one-2025-26 | kobelco-kobe-steelers |
| 47 | `Scotstoun Stadium, Glasgow` | 6 | urc-2025-26 | glasgow-warriors |
| 48 | `SPEARS EDORIKU FIELD（Edogawa Athletic Stadium） (Tokyo)` | 6 | league-one-2025-26 | kubota-spears |
| 49 | `Millennium Stadium, Cardiff` | 5 | six-nations-2026, six-nations-2027 | wales |
| 50 | `North Harbour Stadium, Albany` | 5 | super-rugby-pacific-2026 | moana-pasifika |
| 51 | `North Queensland Stadium, Townsville` | 5 | lipovitan-challenge-cup-2026, rwc-2027 | australia, chile, georgia, spain, tonga |
| 52 | `Paloma Mizuho Rugby Stadium (Aichi)` | 5 | league-one-2025-26 | toyota-verblitz |
| 53 | `Perth Stadium, Perth` | 5 | rwc-2027 | australia, ireland, new-zealand, south-africa, usa |
| 54 | `Stade de France, Saint-Denis` | 5 | six-nations-2026, six-nations-2027, top-14-2025-26 | france, toulouse |
| 55 | `Stadio Comunale di Monigo, Treviso` | 5 | urc-2025-26 | benetton |
| 56 | `Stadio Olimpico, Rome` | 5 | six-nations-2026, six-nations-2027 | italy |
| 57 | `Twickenham Stadium, London` | 5 | six-nations-2026, six-nations-2027 | england |
| 58 | `Yamaha Stadium (Shizuoka)` | 5 | league-one-2025-26 | shizuoka-blue-revs |
| 59 | `Churchill Park, Lautoka` | 4 | super-rugby-pacific-2026 | fijian-drua |
| 60 | `Honda HEAT Green Stadium (Tochigi)` | 4 | league-one-2025-26 | honda-heat |
| 61 | `Komazawa Olympic Park General Sports Ground (Tokyo)` | 4 | league-one-2025-26 | ricoh-black-rams, urayasu-d-rocks |
| 62 | `Murrayfield, Edinburgh, Scotland` | 4 | nations-championship-2026 | fiji, scotland |
| 63 | `Newcastle Stadium, Newcastle` | 4 | rwc-2027 | fiji, italy, japan, uruguay |
| 64 | `Sagamihara Gion Stadium (Kanagawa)` | 4 | league-one-2025-26 | mitsubishi-dynaboars |
| 65 | `Stadio Sergio Lanfranchi, Parma` | 4 | urc-2025-26 | zebre |
| 66 | `TBC` | 4 | premiership-2026-27, urc-2026-27 | bath, leinster, saracens |
| 67 | `Allianz Stadium, London, England` | 3 | nations-championship-2026 | england |
| 68 | `Apollo Projects Stadium, Christchurch` | 3 | super-rugby-pacific-2026 | crusaders |
| 69 | `Aviva Stadium, Dublin, Ireland` | 3 | nations-championship-2026 | ireland |
| 70 | `Cape Town Stadium, Cape Town` | 3 | greatest-rivalry-2026, urc-2025-26 | south-africa, stormers |
| 71 | `Musgrave Park, Cork` | 3 | urc-2025-26, urc-2026-27 | munster |
| 72 | `Principality Stadium, Cardiff, Wales` | 3 | nations-championship-2026 | wales |
| 73 | `Suzuka Sports Garden Rugby Ground (Mie)` | 3 | league-one-2025-26 | honda-heat |
| 74 | `Sydney Football Stadium, Sydney` | 3 | rwc-2027 | france, ireland, italy |
| 75 | `Twickenham Stadium` | 3 | premiership-2025-26, premiership-2026-27 | harlequins, northampton-saints |
| 76 | `CRASUS DOME OITA (Oita)` | 2 | league-one-2025-26 | canon-eagles |
| 77 | `Four R Stadium, Ba` | 2 | super-rugby-pacific-2026 | fijian-drua |
| 78 | `Hanazono Rugby Stadium, Higashiōsaka` | 2 | pnc-2026 | fiji, japan |
| 79 | `Nippatsu Mitsuzawa Stadium (Kanagawa)` | 2 | league-one-2025-26 | canon-eagles |
| 80 | `Stade de France, Saint-Denis, France` | 2 | nations-championship-2026 | france |
| 81 | `Stade Vélodrome, Marseille` | 2 | top-14-2025-26 | montpellier, toulouse |
| 82 | `Stadium Australia, Sydney` | 2 | rwc-2027 | england, new-zealand |
| 83 | `Ajinomoto Stadium (Tokyo)` | 1 | league-one-2025-26 | tokyo-suntory-sungoliath |
| 84 | `Allianz Stadium` | 1 | premiership-2025-26 | harlequins |
| 85 | `Allianz Stadium, Turin, Italy` | 1 | nations-championship-2026 | italy |
| 86 | `BENEX Municipal General Recreation Park (Nagasaki)` | 1 | league-one-2025-26 | mitsubishi-dynaboars |
| 87 | `Bluenergy Stadium, Udine, Italy` | 1 | nations-championship-2026 | italy |
| 88 | `Brisbane Stadium, Brisbane | Meeanjin, Australia` | 1 | nations-championship-2026 | australia |
| 89 | `Cardiff City Stadium, Cardiff, Wales` | 1 | nations-championship-2026 | fiji |
| 90 | `Daiwa House PREMIST DOME (Hokkaido)` | 1 | league-one-2025-26 | toshiba-brave-lupus |
| 91 | `DHL Stadium, Cape Town` | 1 | urc-2025-26 | stormers |
| 92 | `Eden Park, Auckland, New Zealand` | 1 | nations-championship-2026 | new-zealand |
| 93 | `Egao Kenko Stadium (Kumamoto)` | 1 | league-one-2025-26 | tokyo-suntory-sungoliath |
| 94 | `Emirates Airline Park, Johannesburg, South Africa` | 1 | nations-championship-2026 | south-africa |
| 95 | `Estadio 23 de Agosto, San Salvador de Jujuy` | 1 | puma-trophy-2026 | argentina |
| 96 | `Estadio del Bicentenario, San Juan, Argentina` | 1 | nations-championship-2026 | argentina |
| 97 | `Estadio Malvinas Argentinas, Mendoza` | 1 | puma-trophy-2026 | argentina |
| 98 | `Estadio Mario Alberto Kempes, Cordoba, Argentina` | 1 | nations-championship-2026 | argentina |
| 99 | `Estadio Único Madre de Ciudades, Santiago del Estero, Argentina` | 1 | nations-championship-2026 | argentina |
| 100 | `FNB Stadium, Johannesburg` | 1 | greatest-rivalry-2026 | south-africa |
| 101 | `Groupama Stadium, Lyon, France` | 1 | nations-championship-2026 | france |
| 102 | `Hampden Park` | 1 | urc-2026-27 | glasgow-warriors |
| 103 | `Hanazono Rugby Stadium (Osaka)` | 1 | league-one-2025-26 | kobelco-kobe-steelers |
| 104 | `Hawaiians Stadium Iwaki (Fukushima)` | 1 | league-one-2025-26 | ricoh-black-rams |
| 105 | `HBF Park, Perth | Boorloo, Australia` | 1 | nations-championship-2026 | australia |
| 106 | `HFC Bank Stadium, Suva` | 1 | super-rugby-pacific-2026 | fijian-drua |
| 107 | `HIF Health Insurance Oval, Joondalup` | 1 | super-rugby-pacific-2026 | force |
| 108 | `Hill Dickinson Stadium, Liverpool, England` | 1 | nations-championship-2026 | fiji |
| 109 | `HIMARAYA STADIUM GIFU (Gifu)` | 1 | league-one-2025-26 | toyota-verblitz |
| 110 | `Hollywoodbets Kings Park, Durban, South Africa` | 1 | nations-championship-2026 | south-africa |
| 111 | `IAI Stadium Nihondaira (Shizuoka)` | 1 | league-one-2025-26 | shizuoka-blue-revs |
| 112 | `JIT Recycle Ink Stadium (Yamanashi)` | 1 | league-one-2025-26 | tokyo-suntory-sungoliath |
| 113 | `KUROKIRI STADIUM (Miyazaki)` | 1 | league-one-2025-26 | urayasu-d-rocks |
| 114 | `Loftus Versfeld, Pretoria, South Africa` | 1 | nations-championship-2026 | south-africa |
| 115 | `M&T Bank Stadium, Baltimore, United States` | 1 | greatest-rivalry-2026 | south-africa |
| 116 | `McLean Park, Napier` | 1 | super-rugby-pacific-2026 | hurricanes |
| 117 | `MIKUNI WORLD STADIUM KITAKYUSHU (Fukuoka)` | 1 | league-one-2025-26 | toyota-verblitz |
| 118 | `Millennium Stadium` | 1 | premiership-2026-27 | bristol-bears |
| 119 | `MUFG STADIUM（Japan National Stadium） (Tokyo)` | 1 | league-one-2025-26 | kobelco-kobe-steelers |
| 120 | `National Olympic Stadium, Tokyo, Japan` | 1 | nations-championship-2026 | japan |
| 121 | `Navigation Homes Stadium, Pukekohe` | 1 | super-rugby-pacific-2026 | moana-pasifika |
| 122 | `Newcastle Stadium, Newcastle | Awabakal-Worimi, Australia` | 1 | nations-championship-2026 | japan |
| 123 | `Nissan Stadium (Kanagawa)` | 1 | league-one-2025-26 | canon-eagles |
| 124 | `One New Zealand Stadium, Christchurch, New Zealand` | 1 | nations-championship-2026 | new-zealand |
| 125 | `Prince Chichibu Memorial Stadium, Tokyo, Japan` | 1 | nations-championship-2026 | japan |
| 126 | `Principality Stadium` | 1 | premiership-2025-26 | bristol-bears |
| 127 | `Rotorua International Stadium, Rotorua` | 1 | super-rugby-pacific-2026 | moana-pasifika |
| 128 | `Shiranami Stadium (Kagoshima)` | 1 | league-one-2025-26 | toshiba-brave-lupus |
| 129 | `Shizuoka Stadium ECOPA (Shizuoka)` | 1 | league-one-2025-26 | shizuoka-blue-revs |
| 130 | `Sky Stadium, Wellington` | 1 | super-rugby-pacific-2026 | hurricanes |
| 131 | `Sky Stadium, Wellington, New Zealand` | 1 | nations-championship-2026 | new-zealand |
| 132 | `Stade du Hameau, Pau` | 1 | top-14-2025-26 | pau |
| 133 | `Stade Jean-Bouin, Paris` | 1 | top-14-2025-26 | stade-francais |
| 134 | `Stade Pierre-Mauroy, Villeneuve-d'Ascq` | 1 | six-nations-2026 | france |
| 135 | `Stadio Luigi Ferraris, Genova, Italy` | 1 | nations-championship-2026 | italy |
| 136 | `Sydney Football Stadium, Sydney | Gadigal, Australia` | 1 | nations-championship-2026 | australia |
| 137 | `Takebishi Stadium Kyoto (Kyoto)` | 1 | league-one-2025-26 | mitsubishi-dynaboars |
| 138 | `Tottenham Hotspur Stadium` | 1 | premiership-2025-26 | saracens |
| 139 | `TOYOTA Stadium (Aichi)` | 1 | league-one-2025-26 | toyota-verblitz |
| 140 | `Uvance Todoroki Stadium by Fujitsu (Kanagawa)` | 1 | league-one-2025-26 | toshiba-brave-lupus |
| 141 | `Villa Park` | 1 | premiership-2025-26 | gloucester |
| 142 | `YUMENOSHIMA (Tokyo)` | 1 | league-one-2025-26 | urayasu-d-rocks |
| 143 | `Yurtec Stadium Sendai (Miyagi)` | 1 | league-one-2025-26 | urayasu-d-rocks |
| 144 | `デンカビッグスワンスタジアム` | 1 | lipovitan-challenge-cup-2026 | japan |
| 145 | `秩父宮ラグビー場` | 1 | lipovitan-challenge-cup-2026 | japan |
| 146 | `東大阪市花園ラグビー場` | 1 | lipovitan-challenge-cup-2026 | japan |

## 脚注付きの表記

`matches.venue` に脚注が残っている会場。**DB は直さず、表示側の正規化で吸収する。**

- `One NZ Stadium, Christchurch` ← `One NZ Stadium, Christchurch[43]`
- `FMG Stadium Waikato, Hamilton` ← `FMG Stadium Waikato, Hamilton[42]` / `FMG Stadium Waikato, Hamilton[46]`
- `Hnry Stadium, Wellington` ← `Hnry Stadium, Wellington[42]` / `Hnry Stadium, Wellington[46]` / `Hnry Stadium, Wellington[49]`
- `Eden Park, Auckland` ← `Eden Park, Auckland[a]`
- `Churchill Park, Lautoka` ← `Churchill Park, Lautoka[e]`
- `Four R Stadium, Ba` ← `Four R Stadium, Ba[f]`
- `HFC Bank Stadium, Suva` ← `HFC Bank Stadium, Suva[g]`
- `McLean Park, Napier` ← `McLean Park, Napier[c]`
- `Navigation Homes Stadium, Pukekohe` ← `Navigation Homes Stadium, Pukekohe[b]`
- `Rotorua International Stadium, Rotorua` ← `Rotorua International Stadium, Rotorua[d]`

## 表記ゆれ（同一会場の可能性がある組）

先頭語が一致する会場名を機械的に並べたもの。**同一会場かどうかは実装者が判断すること。** 別会場が混ざりうる（例: 同名スタジアムが複数都市にある場合）。

- **allianz stadium**: `Allianz Stadium, Sydney` / `Allianz Stadium, London, England` / `Allianz Stadium` / `Allianz Stadium, Turin, Italy`
- **aviva stadium**: `Aviva Stadium, Dublin` / `Aviva Stadium, Dublin, Ireland`
- **brisbane stadium**: `Brisbane Stadium, Brisbane` / `Brisbane Stadium, Brisbane | Meeanjin, Australia`
- **cape town stadium**: `Cape Town Stadium` / `Cape Town Stadium, Cape Town`
- **eden park**: `Eden Park, Auckland` / `Eden Park, Auckland, New Zealand`
- **ellis park stadium**: `Ellis Park Stadium, Jo'burg` / `Ellis Park Stadium, Johannesburg`
- **hanazono rugby stadium**: `Hanazono Rugby Stadium, Higashiōsaka` / `Hanazono Rugby Stadium (Osaka)`
- **hbf park**: `HBF Park, Perth` / `HBF Park, Perth | Boorloo, Australia`
- **loftus versfeld**: `Loftus Versfeld, Pretoria` / `Loftus Versfeld, Pretoria, South Africa`
- **millennium stadium**: `Millennium Stadium, Cardiff` / `Millennium Stadium`
- **newcastle stadium**: `Newcastle Stadium, Newcastle` / `Newcastle Stadium, Newcastle | Awabakal-Worimi, Australia`
- **principality stadium**: `Principality Stadium, Cardiff, Wales` / `Principality Stadium`
- **scotstoun stadium**: `Scotstoun Stadium` / `Scotstoun Stadium, Glasgow`
- **sky stadium**: `Sky Stadium, Wellington` / `Sky Stadium, Wellington, New Zealand`
- **stade de france**: `Stade de France, Saint-Denis` / `Stade de France, Saint-Denis, France`
- **stadio sergio lanfranchi**: `Stadio Sergio Lanfranchi` / `Stadio Sergio Lanfranchi, Parma`
- **sydney football stadium**: `Sydney Football Stadium, Sydney` / `Sydney Football Stadium, Sydney | Gadigal, Australia`
- **twickenham stadium**: `Twickenham Stadium, London` / `Twickenham Stadium`
