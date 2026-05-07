alter table user_profiles
  add column if not exists chat_daily_count int not null default 0,
  add column if not exists chat_daily_reset_date date not null default current_date;
