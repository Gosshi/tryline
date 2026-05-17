-- カタカナ外国籍選手の canonical_player_id バックフィル（60件）
-- 注: WHERE id は slug から解決し、仮 UUID の問題を避ける

-- サム・ケイン → sam-cane
UPDATE players SET canonical_player_id = 'dde621dc-67ed-4d8c-add7-e65703253719'
WHERE id = (SELECT id FROM players WHERE slug = 'player-448b9d03');

-- マルコム・マークス → malcolm-marx
UPDATE players SET canonical_player_id = '4186d3f8-2094-4d33-ad07-e4929aa32d6d'
WHERE id = (SELECT id FROM players WHERE slug = 'player-bece7beb');

-- パブロ・マテーラ → pablo-matera
UPDATE players SET canonical_player_id = '9c082ffa-7e07-48ed-b020-c4250217bd8e'
WHERE id = (SELECT id FROM players WHERE slug = 'player-c0a13a50');

-- ファフ・デクラーク → faf-de-klerk
UPDATE players SET canonical_player_id = '0ef6c45a-cd92-45ca-bdcd-ff52eeee5264'
WHERE id = (SELECT id FROM players WHERE slug = 'player-79d82c3c');

-- ジェラード・カウリートゥイオティ → gerard-cowley-tuioti
UPDATE players SET canonical_player_id = '03e8e3db-635e-4902-9565-226aab398425'
WHERE id = (SELECT id FROM players WHERE slug = 'player-d7d1ce9f');

-- リーチマイケル → michael-leitch
UPDATE players SET canonical_player_id = 'a2baf28f-c7ef-41a5-a5e9-deba76c4a016'
WHERE id = (SELECT id FROM players WHERE slug = 'player-e927cacf');

-- ネイサン・ヒューズ → nathan-hughes
UPDATE players SET canonical_player_id = 'd1c63786-acd8-4bd1-8349-a4d5b30717ba'
WHERE id = (SELECT id FROM players WHERE slug = 'player-743af200');

-- ピーターステフ・デュトイ → pieter-steph-du-toit
UPDATE players SET canonical_player_id = '7c7656ab-0fe6-44f8-8c22-f776ab1ab372'
WHERE id = (SELECT id FROM players WHERE slug = 'player-5ed8c888');

-- セミ・ラドラドラ → semi-radradra
UPDATE players SET canonical_player_id = '6252470e-37ee-45ba-ab5a-9d4ba701b195'
WHERE id = (SELECT id FROM players WHERE slug = 'player-39d57f27');

-- シオサイア・フィフィタ → siosaia-fifita-2
UPDATE players SET canonical_player_id = 'be02701f-ad29-44e7-9739-d47b153f0e46'
WHERE id = (SELECT id FROM players WHERE slug = 'player-4ae2f7fa');

-- テビタ・タタフ → tevita-tatafu
UPDATE players SET canonical_player_id = '0cecc68a-4913-40cd-8c5a-1628d978b64f'
WHERE id = (SELECT id FROM players WHERE slug = 'player-a4868cb6');

-- ジェームス・ムーア → james-moore-2
UPDATE players SET canonical_player_id = 'bf888563-1343-4907-ad88-5f0dde314459'
WHERE id = (SELECT id FROM players WHERE slug = 'player-d32fbae2');

-- ヴィンス・アソ → vince-aso
UPDATE players SET canonical_player_id = '6ebd9bd4-8227-49eb-84c4-c8027b50fd3c'
WHERE id = (SELECT id FROM players WHERE slug = 'player-cf6714d7');

-- ブリン・ホール → bryn-hall
UPDATE players SET canonical_player_id = '9a09050c-7c15-4fb9-9083-f1c6d2c76ad5'
WHERE id = (SELECT id FROM players WHERE slug = 'player-4ccd044b');

-- ブレア・ライアル → blair-ryall
UPDATE players SET canonical_player_id = 'a21137a5-9c2c-426c-b69a-62c1975fd93b'
WHERE id = (SELECT id FROM players WHERE slug = 'player-cdc76ee0');

-- フレイザー・クワーク → fraser-quirk
UPDATE players SET canonical_player_id = '59f305d8-234c-440e-9805-ff4f2591165e'
WHERE id = (SELECT id FROM players WHERE slug = 'player-1ed6f801');

-- ジェイコブ・ピアス → jacob-pierce
UPDATE players SET canonical_player_id = '54403476-4b95-4105-8781-0465a2504d30'
WHERE id = (SELECT id FROM players WHERE slug = 'player-70600199');

-- ロブ・トンプソン → rob-thompson
UPDATE players SET canonical_player_id = 'c3b3ccea-9f55-4cbc-b9a4-19c4fb7810b7'
WHERE id = (SELECT id FROM players WHERE slug = 'player-8c24d49c');

-- サム・ジェフリーズ → sam-jeffries
UPDATE players SET canonical_player_id = '27e3e50b-229c-4cf4-8a76-821887963edc'
WHERE id = (SELECT id FROM players WHERE slug = 'player-e8b84c5a');

-- スカルク・エラスマス → schalk-erasmus
UPDATE players SET canonical_player_id = '8585d2dc-8948-49c5-a15c-12e66bf5ba47'
WHERE id = (SELECT id FROM players WHERE slug = 'player-08b4d5f4');

-- シモン・ミラー → simon-miller
UPDATE players SET canonical_player_id = '0c89a61a-8d22-4d5a-9a0c-b70a2dff9dd7'
WHERE id = (SELECT id FROM players WHERE slug = 'player-c9d50cf3');

-- トム・バンクス → tom-banks
UPDATE players SET canonical_player_id = 'b0d1c50e-7941-4fe1-9519-1df24e420881'
WHERE id = (SELECT id FROM players WHERE slug = 'player-bf127ba7');

-- トム・ジェフリーズ → tom-jeffries
UPDATE players SET canonical_player_id = 'f74898a0-41bb-4821-9646-ed6c6788aee6'
WHERE id = (SELECT id FROM players WHERE slug = 'player-37f802d3');

-- トム・パーソンズ → tom-parsons
UPDATE players SET canonical_player_id = '2dd01170-89cb-4faa-b5f9-38464364f43d'
WHERE id = (SELECT id FROM players WHERE slug = 'player-72f902d3');

-- トム・パートン → tom-parton
UPDATE players SET canonical_player_id = 'f588e34a-6e94-46c5-bce0-4b338beba74b'
WHERE id = (SELECT id FROM players WHERE slug = 'player-5f2ae4f6');

-- タイラー・ポール → tyler-paul
UPDATE players SET canonical_player_id = '1fed428b-fd30-4326-95e4-4ef8ee23a37f'
WHERE id = (SELECT id FROM players WHERE slug = 'player-bd27c571');

-- オテレ・ブラック → otere-black
UPDATE players SET canonical_player_id = '477e825a-ae03-40a4-8a2f-b9d983152340'
WHERE id = (SELECT id FROM players WHERE slug = 'player-d826986d');

-- セタ・タマニバル → seta-tamanivalu
UPDATE players SET canonical_player_id = '549bfc35-46b7-455d-a4aa-2049a76e2a6f'
WHERE id = (SELECT id FROM players WHERE slug = 'player-e335924b');

-- トレヴァ・ホゼア → trevor-hosea
UPDATE players SET canonical_player_id = '85bd5e02-8fea-4397-8995-222cff3604a6'
WHERE id = (SELECT id FROM players WHERE slug = 'player-717ef57d');

-- ヴィリー・ポトヒエッター → willie-potgieter
UPDATE players SET canonical_player_id = '4912776b-f7de-4118-9307-356a1de4fbe6'
WHERE id = (SELECT id FROM players WHERE slug = 'player-81e7c4d0');

-- コルマック・ダリー → cormac-daly
UPDATE players SET canonical_player_id = '17bc50e2-3671-40ce-b9de-a03ba50765f2'
WHERE id = (SELECT id FROM players WHERE slug = 'player-06cf38df');

-- マックス・ヒューズ → max-hughes
UPDATE players SET canonical_player_id = 'a53e8395-a488-46b7-b316-c9aeb50a3465'
WHERE id = (SELECT id FROM players WHERE slug = 'player-1abb3ab6');

-- マイケル・コリンズ → michael-collins
UPDATE players SET canonical_player_id = '00c36027-4211-4e3d-a839-abb56c9fa0c1'
WHERE id = (SELECT id FROM players WHERE slug = 'player-f499ab40');

-- リッチモンド・トンガタマ → richmond-tongatama
UPDATE players SET canonical_player_id = '42a06566-09e4-4eee-92c1-881ec84d0eec'
WHERE id = (SELECT id FROM players WHERE slug = 'player-77e03e95');

-- リカス・プレトリアス → rikus-pretorius
UPDATE players SET canonical_player_id = '2494ae97-37ab-46de-8a90-c229755a4c2a'
WHERE id = (SELECT id FROM players WHERE slug = 'player-3761628b');

-- ショーン・スティーブンソン → shaun-stevenson
UPDATE players SET canonical_player_id = 'e9552afe-90f0-4372-96c7-221a29629f23'
WHERE id = (SELECT id FROM players WHERE slug = 'player-633383b0');

-- ティアーン・ファルコン → tiaan-falcon
UPDATE players SET canonical_player_id = '231fc43f-007a-44ef-a765-5816237c3e9b'
WHERE id = (SELECT id FROM players WHERE slug = 'player-90649e39');

-- バティリアイ・ツイドラキ → vatiliai-tuidraki
UPDATE players SET canonical_player_id = '63a9f298-ec8c-4b01-bc88-c95cb4086cdf'
WHERE id = (SELECT id FROM players WHERE slug = 'player-716e3b0b');

-- ゼイビア・スタワーズ → xavier-stowers
UPDATE players SET canonical_player_id = '67cd9d29-4aa0-46c2-af02-43be126e4e63'
WHERE id = (SELECT id FROM players WHERE slug = 'player-53bb8408');

-- ソロモネ・フナキ → solomone-funaki
UPDATE players SET canonical_player_id = '31a892b1-fbd9-446e-938f-4ee28d10a658'
WHERE id = (SELECT id FROM players WHERE slug = 'player-3cfb149d');

-- ヴィリアメ・ツイドラキ → viliame-tuidraki
UPDATE players SET canonical_player_id = 'c12af7cf-3d37-45f6-93ca-1dd6f8ce3970'
WHERE id = (SELECT id FROM players WHERE slug = 'player-335dbc09');

-- ヴィリアミ・タヒトゥア → viliami-tahitua
UPDATE players SET canonical_player_id = '7154a1aa-38ab-4378-82d5-f6a98f8e181e'
WHERE id = (SELECT id FROM players WHERE slug = 'player-9c729993');

-- ウォルト・スティーンカンプ → walt-steenkamp
UPDATE players SET canonical_player_id = 'c787145f-0e7a-45ec-abbf-ca9b0b243b40'
WHERE id = (SELECT id FROM players WHERE slug = 'player-3581d465');

-- ゼファニア・トゥイノナ → zephaniah-tuinona
UPDATE players SET canonical_player_id = '4f4c42bc-9312-40eb-99cb-d392c2782a63'
WHERE id = (SELECT id FROM players WHERE slug = 'player-bcaebd36');

-- ヴィンピー・ファンデルヴァルト → wimpie-van-der-walt
UPDATE players SET canonical_player_id = '55b3557e-b04e-488c-aabb-92787da82ff5'
WHERE id = (SELECT id FROM players WHERE slug = 'player-ca87aff3');

-- ゲラード・ファンデンヒーファー → gerhard-van-den-heever
UPDATE players SET canonical_player_id = '3c24de4a-8e6c-41b1-8dcf-f00f2965d771'
WHERE id = (SELECT id FROM players WHERE slug = 'player-ccd30847');

-- ピーター・ラピース・ラブスカフニ → pieterlappieslabuschagne
UPDATE players SET canonical_player_id = '242924aa-193c-4644-9b66-d4c95c3e3a61'
WHERE id = (SELECT id FROM players WHERE slug = 'player-391e3e77');

-- オペティ・ヘル → opeti-helu
UPDATE players SET canonical_player_id = '12579f81-9fd4-4bf7-882f-c0cd942f331f'
WHERE id = (SELECT id FROM players WHERE slug = 'player-acda0151');

-- ヴィリアメ・タカヤワ → viliame-takayawa
UPDATE players SET canonical_player_id = '0c3c6cd1-7b23-4800-99ed-6595aab8e21e'
WHERE id = (SELECT id FROM players WHERE slug = 'player-c9ffcfb2');

-- タウファ・ラトゥ → taufa-latu
UPDATE players SET canonical_player_id = 'faf41eb6-0f91-4059-b83a-de2a4faec67e'
WHERE id = (SELECT id FROM players WHERE slug = 'player-21dcd5dc');

-- シオネ・ハラシリ → sione-halasili
UPDATE players SET canonical_player_id = '11a76203-713e-4b6f-9d10-ecbd095a5373'
WHERE id = (SELECT id FROM players WHERE slug = 'player-991d2d8f');

-- ロトアヘアアマナキ大洋 → amanaki-taiyo-lotoahea
UPDATE players SET canonical_player_id = '3b2b0d8a-fe0d-41f5-a93e-2528e99718be'
WHERE id = (SELECT id FROM players WHERE slug = 'player-82c03431');

-- ファカタヴァアマト → amato-fakatava
UPDATE players SET canonical_player_id = '92c7a076-2c70-4986-a865-e61bdd75a7a3'
WHERE id = (SELECT id FROM players WHERE slug = 'player-02f7e600');

-- ロトアヘアポヒヴァ大和 → pohiva-yamato-lotoahea
UPDATE players SET canonical_player_id = '096d0466-aa00-4f89-a9ac-b870d4a85f08'
WHERE id = (SELECT id FROM players WHERE slug = 'player-9343e723');

-- シオネ・ラベマイ → sione-lavemai
UPDATE players SET canonical_player_id = '4a963398-3f47-4907-b65c-cb4d0c3b9e2b'
WHERE id = (SELECT id FROM players WHERE slug = 'player-e6ad3059');

-- シルビアン・マフーザ → sylvian-mahuza
UPDATE players SET canonical_player_id = '5a199954-4034-4ff2-8a55-684b48ac8b47'
WHERE id = (SELECT id FROM players WHERE slug = 'player-07bd50c0');

-- ファカタヴァタラウ侍 → talau-samurai-fakatava
UPDATE players SET canonical_player_id = '3a90fd51-049b-4a1a-8e02-ba3bc70b0cd5'
WHERE id = (SELECT id FROM players WHERE slug = 'player-d3dd0f27');

-- ラファエレティモシー → timothy-lafaele
UPDATE players SET canonical_player_id = '6167bc28-3079-46cf-822d-76d159588dbc'
WHERE id = (SELECT id FROM players WHERE slug = 'player-9d3e7a85');

-- シオネ・ブナ → sione-vuna
UPDATE players SET canonical_player_id = '0735cdb8-863f-42cb-8475-37fe165e23b4'
WHERE id = (SELECT id FROM players WHERE slug = 'player-6de4cdd4');

-- ワーナー・ディアンズ → warner-dearns
UPDATE players SET canonical_player_id = '5d1e8669-316e-4495-8b9b-b6ad9a502c26'
WHERE id = (SELECT id FROM players WHERE slug = 'player-0d21ea65');
