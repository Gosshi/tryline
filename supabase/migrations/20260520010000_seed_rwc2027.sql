INSERT INTO competitions (name, season, family, slug)
VALUES ('Rugby World Cup', '2027', 'rwc', 'rwc-2027')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO teams (name, country, slug)
VALUES
  ('Chile', 'Chile', 'chile'),
  ('Hong Kong China', 'Hong Kong China', 'hong-kong-china'),
  ('Spain', 'Spain', 'spain'),
  ('Canada', 'Canada', 'canada'),
  ('USA', 'USA', 'usa'),
  ('Zimbabwe', 'Zimbabwe', 'zimbabwe'),
  ('Portugal', 'Portugal', 'portugal')
ON CONFLICT (slug) DO NOTHING;
