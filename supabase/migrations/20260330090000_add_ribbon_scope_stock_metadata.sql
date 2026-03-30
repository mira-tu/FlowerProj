alter table public.stock_products
add column if not exists ribbon_scope varchar;

update public.stock_products
set
  ribbon_scope = 'classic_bouquet',
  updated_at = timezone('utc', now())
where category = 'Ribbons'
  and coalesce(ribbon_scope, '') = '';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'stock_products_ribbon_scope_check'
  ) then
    alter table public.stock_products
    add constraint stock_products_ribbon_scope_check
    check (
      ribbon_scope is null
      or ribbon_scope in ('classic_bouquet', 'palm_halo_wrap')
    );
  end if;
end $$;
