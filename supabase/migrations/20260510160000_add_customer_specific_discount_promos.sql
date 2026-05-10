alter table public.discount_promos
  add column if not exists customer_id uuid references public.users(id) on delete set null;

create index if not exists discount_promos_customer_idx
  on public.discount_promos (customer_id)
  where customer_id is not null;

drop policy if exists "Anyone can read promos for checkout validation" on public.discount_promos;
create policy "Anyone can read promos for checkout validation"
  on public.discount_promos
  for select
  to anon, authenticated
  using (
    customer_id is null
    or auth.uid() = customer_id
    or exists (
      select 1
      from public.users
      where users.id = auth.uid()
        and users.role in ('admin', 'employee')
    )
  );

notify pgrst, 'reload schema';
