insert into public.teams (slug, name, short_code, country)
values
  ('bordeaux-begles', 'Union Bordeaux Bègles', 'UBB', 'FRA'),
  ('clermont', 'ASM Clermont Auvergne', 'CLM', 'FRA'),
  ('la-rochelle', 'Stade Rochelais', 'LAR', 'FRA'),
  ('lyon', 'Lyon OU', 'LYO', 'FRA'),
  ('montpellier', 'Montpellier Hérault Rugby', 'MHR', 'FRA'),
  ('pau', 'Section Paloise', 'PAU', 'FRA'),
  ('racing-92', 'Racing 92', 'RAC', 'FRA'),
  ('stade-francais', 'Stade Français', 'SFP', 'FRA'),
  ('toulouse', 'Stade Toulousain', 'TOU', 'FRA'),
  ('toulon', 'RC Toulon', 'RCT', 'FRA'),
  ('perpignan', 'USA Perpignan', 'PER', 'FRA'),
  ('castres', 'Castres Olympique', 'CAS', 'FRA'),
  ('bayonne', 'Aviron Bayonnais', 'BAY', 'FRA'),
  ('vannes', 'RC Vannes', 'VAN', 'FRA'),
  ('grenoble', 'FC Grenoble', 'GRE', 'FRA')
on conflict (slug) do update
set
  name = excluded.name,
  short_code = excluded.short_code,
  country = excluded.country;
