-- auth.users に存在するが user_profiles 行がないユーザーを補完する
insert into user_profiles (id)
select id from auth.users
where id not in (select id from user_profiles)
on conflict (id) do nothing;
