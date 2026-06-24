INSERT INTO competitions (name, name_ja, slug, family, season)
VALUES (
  'Nations Championship 2026',
  'ネーションズチャンピオンシップ 2026',
  'nations-championship-2026',
  'nations-championship',
  '2026'
)
ON CONFLICT (slug) DO NOTHING;
