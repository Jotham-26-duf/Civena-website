-- Realtime sends only rows visible to the subscriber's authenticated role and RLS policies.
-- Add the inbox tables to the existing Supabase publication idempotently.
do $$
declare
  target_table text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach target_table in array array['messages', 'message_read_receipts'] loop
      if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = target_table
      ) then
        execute format('alter publication %I add table %I.%I', 'supabase_realtime', 'public', target_table);
      end if;
    end loop;
  end if;
end;
$$;
