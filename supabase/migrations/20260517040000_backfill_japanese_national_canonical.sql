-- 日本代表選手（漢字名）の canonical_player_id バックフィル
-- 田村優 → yu-tamura
UPDATE players
SET canonical_player_id = '486e71b6-e0b1-45d7-879c-604c4e51a0ed'
WHERE id = '2a340978-2dbb-48d2-91fb-becc7b9c6c20';

-- 中村亮土 → ryoto-nakamura
UPDATE players
SET canonical_player_id = '13430848-2874-4648-b0b1-b0c2218803d5'
WHERE id = 'f0d9f4d2-cac5-4a3e-a101-eb7ef4346f07';

-- 稲垣啓太 → keita-inagaki
UPDATE players
SET canonical_player_id = '8daf9af6-f13e-4d7d-a1ee-6e1de31573fb'
WHERE id = '2a522cf5-1665-474b-a50e-063cae36dac1';

-- 姫野和樹 → kazuki-himeno-2
UPDATE players
SET canonical_player_id = '9256fce2-1857-4f0d-9441-a2a831dd4ba3'
WHERE id = 'ccb7fb9b-1e5a-40dc-ad8f-c97b0a9b436b';

-- 坂手淳史 → atsushi-sakate
UPDATE players
SET canonical_player_id = '264d4300-c82f-40e9-98a0-0b4d5de74cb4'
WHERE id = '2108f69f-0632-419d-8315-7c9643c1f3ac';

-- 松島幸太朗 → kotaro-matsushima
UPDATE players
SET canonical_player_id = '7270bc4b-85d8-4e0c-9d70-04ea58e51975'
WHERE id = 'b6283f22-9692-49cd-a4e7-8111e3726ac3';

-- 中野将伍 → shogo-nakano
UPDATE players
SET canonical_player_id = '6271f9b4-ba2d-4157-834c-3bb1458c327b'
WHERE id = '3d2cfdd1-0e46-4e4c-b78d-9cddfc1d6f27';

-- 流大 → yutaka-nagare-2
UPDATE players
SET canonical_player_id = 'dcb2d617-23bb-4d6b-835d-4ac9a31ed0b5'
WHERE id = '4364852f-5faa-4edd-9b24-681e028d6239';

-- 徳永祥尭 → yoshitaka-tokunaga-2
UPDATE players
SET canonical_player_id = 'd9981f41-c3b8-4d75-8a46-db8b1a9bfc9c'
WHERE id = '4b479ce2-425a-4059-b51e-1f67e39b13e0';
