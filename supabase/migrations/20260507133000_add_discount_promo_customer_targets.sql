alter table public.discount_promos
  add column if not exists eligible_user_ids jsonb not null default '[]'::jsonb;

update public.discount_promos
set eligible_user_ids = '[]'::jsonb
where eligible_user_ids is null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'discount_promos_eligible_user_ids_array'
      and conrelid = 'public.discount_promos'::regclass
  ) then
    alter table public.discount_promos
      add constraint discount_promos_eligible_user_ids_array
      check (jsonb_typeof(eligible_user_ids) = 'array');
  end if;
end;
$$;

create index if not exists discount_promos_eligible_user_ids_gin_idx
  on public.discount_promos using gin (eligible_user_ids);

drop policy if exists "Anyone can read promos for checkout validation" on public.discount_promos;
drop policy if exists "Anon can read public promos for checkout validation" on public.discount_promos;
drop policy if exists "Authenticated can read promos for checkout validation" on public.discount_promos;

create policy "Anon can read public promos for checkout validation"
  on public.discount_promos
  for select
  to anon
  using (jsonb_array_length(eligible_user_ids) = 0);

create policy "Authenticated can read promos for checkout validation"
  on public.discount_promos
  for select
  to authenticated
  using (true);
