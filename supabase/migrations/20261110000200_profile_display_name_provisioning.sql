-- Persist a safe initial display name on newly provisioned profiles.
-- Existing profile rows are intentionally left untouched.
create or replace function public.provision_profile()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  default_role smallint;
  initial_display_name text;
begin
  initial_display_name := nullif(btrim(new.raw_user_meta_data ->> 'display_name'), '');
  if initial_display_name is not null then
    initial_display_name := left(initial_display_name, 80);
  end if;

  insert into public.profiles(id, display_name)
  values (new.id, initial_display_name)
  on conflict (id) do nothing;

  select id into default_role from public.roles where name = 'user';
  insert into public.user_roles(user_id, role_id)
  values (new.id, default_role)
  on conflict do nothing;
  return new;
end
$$;
