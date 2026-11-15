begin;
select plan(8);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('00000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'cineva-a@example.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{"display_name":" Test User A "}', now(), now()),
  ('00000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'cineva-b@example.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{"display_name":"Test User B"}', now(), now()),
  ('00000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'cineva-c@example.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{"display_name":"Test User C"}', now(), now()),
  ('00000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'cineva-suspended@example.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{"display_name":"Test User Suspended"}', now(), now());

update public.profiles set account_status='suspended' where id='00000000-0000-4000-8000-000000000004';
insert into public.message_blocks(blocker_id, blocked_id)
values ('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002');

select is((select display_name from public.profiles where id='00000000-0000-4000-8000-000000000001'),
  'Test User A', 'new profile receives a trimmed display name from Auth metadata');

insert into public.content_items (id, content_type, legacy_id, slug, title, status)
values ('10000000-0000-4000-8000-000000000001', 'movie', 999001, 'rls-fixture', 'RLS fixture', 'draft');
insert into public.content_items (id, content_type, legacy_id, slug, title, status)
values ('10000000-0000-4000-8000-000000000002', 'movie', 999002, 'rls-published-fixture', 'RLS published fixture', 'published');
insert into public.movie_parts (id, movie_id, part_number, title)
values ('11000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 1, 'RLS draft part'),
       ('11000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', 1, 'RLS published part');
insert into public.favorites(user_id, content_id)
values ('00000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001');

insert into public.conversations(id, conversation_type, direct_user_low, direct_user_high, created_by)
values ('20000000-0000-4000-8000-000000000001', 'direct',
  '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000001');
insert into public.conversation_participants(conversation_id, user_id) values
  ('20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001'),
  ('20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002');
insert into public.messages(id, conversation_id, sender_id, body)
values ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000001', 'RLS fixture message');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', true);
select is((select count(*)::integer from public.favorites where user_id='00000000-0000-4000-8000-000000000002'), 0,
  'User A cannot read User B favorites');
select is((select count(*)::integer from public.search_message_recipients('Test User')), 1,
  'Recipient search excludes self, suspended users and blocked users');
select throws_ok($$insert into public.favorites(user_id,content_id) values
  ('00000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001')$$,
  '42501', null, 'User A cannot create a favorite for User B');
select throws_ok($$insert into public.watch_history(user_id,movie_part_id)
  values ('00000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000001')$$,
  '42501', null, 'User A cannot create watch history for a draft title');
select lives_ok($$insert into public.watch_history(user_id,movie_part_id)
  values ('00000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000002')$$,
  'User A can create watch history for published content');

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000003', true);
select is((select count(*)::integer from public.messages where id='30000000-0000-4000-8000-000000000001'), 0,
  'Nonparticipant User C cannot read a private message');

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000004', true);
select throws_ok($$insert into public.favorites(user_id,content_id) values
  ('00000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000002')$$,
  '42501', null, 'Suspended user cannot create a favorite');

select * from finish();
rollback;
