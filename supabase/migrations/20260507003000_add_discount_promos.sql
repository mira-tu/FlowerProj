do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'discount_channel_scope'
      and typnamespace = 'public'::regnamespace
  ) then
    create type public.discount_channel_scope as enum (
      'catalog',
      'customized',
      'custom_order',
      'all'
    );
  end if;

  if not exists (
    select 1
    from pg_type
    where typname = 'discount_mode'
      and typnamespace = 'public'::regnamespace
  ) then
    create type public.discount_mode as enum (
      'coupon_code',
      'automatic_event',
      'occasion_based'
    );
  end if;

  if not exists (
    select 1
    from pg_type
    where typname = 'discount_target_scope'
      and typnamespace = 'public'::regnamespace
  ) then
    create type public.discount_target_scope as enum (
      'order',
      'item'
    );
  end if;

  if not exists (
    select 1
    from pg_type
    where typname = 'discount_redemption_status'
      and typnamespace = 'public'::regnamespace
  ) then
    create type public.discount_redemption_status as enum (
      'reserved',
      'applied',
      'voided'
    );
  end if;
end
$$;

create table if not exists public.discount_promos (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  discount_type text not null default 'percent' check (discount_type in ('percent', 'amount')),
  discount_percent numeric(5, 2) not null default 0 check (discount_percent >= 0 and discount_percent <= 100),
  discount_amount numeric(10, 2) not null default 0 check (discount_amount >= 0),
  channel_scope public.discount_channel_scope not null default 'all',
  discount_mode public.discount_mode not null default 'coupon_code',
  target_scope public.discount_target_scope not null default 'order',
  is_active boolean not null default true,
  starts_at timestamptz,
  ends_at timestamptz,
  usage_limit_total integer check (usage_limit_total is null or usage_limit_total > 0),
  usage_limit_per_user integer check (usage_limit_per_user is null or usage_limit_per_user > 0),
  minimum_subtotal numeric(10, 2) not null default 0 check (minimum_subtotal >= 0),
  occasion_targets jsonb not null default '[]'::jsonb,
  product_ids jsonb not null default '[]'::jsonb,
  category_ids jsonb not null default '[]'::jsonb,
  custom_order_arrangement_targets jsonb not null default '[]'::jsonb,
  customized_item_targets jsonb,
  applies_to_sale_items boolean not null default true,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint discount_promos_code_uppercase check (code = upper(code))
);

create index if not exists discount_promos_channel_active_idx
  on public.discount_promos (channel_scope, is_active, starts_at, ends_at);

create index if not exists discount_promos_code_idx
  on public.discount_promos (code);

create table if not exists public.discount_redemptions (
  id uuid primary key default gen_random_uuid(),
  promo_id uuid not null references public.discount_promos(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  order_id integer references public.orders(id) on delete set null,
  request_id integer references public.requests(id) on delete set null,
  channel_scope public.discount_channel_scope not null,
  discount_amount numeric(10, 2) not null default 0,
  subtotal_before_discount numeric(10, 2) not null default 0,
  subtotal_after_discount numeric(10, 2) not null default 0,
  status public.discount_redemption_status not null default 'applied',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint discount_redemptions_one_transaction check (
    ((order_id is not null)::int + (request_id is not null)::int) <= 1
  )
);

create index if not exists discount_redemptions_promo_status_idx
  on public.discount_redemptions (promo_id, status);

create index if not exists discount_redemptions_user_promo_status_idx
  on public.discount_redemptions (user_id, promo_id, status);

create index if not exists discount_redemptions_order_idx
  on public.discount_redemptions (order_id)
  where order_id is not null;

create index if not exists discount_redemptions_request_idx
  on public.discount_redemptions (request_id)
  where request_id is not null;

alter table public.orders
  add column if not exists discount_total numeric(10, 2) not null default 0,
  add column if not exists discount_snapshot jsonb,
  add column if not exists applied_promo_code text;

alter table public.requests
  add column if not exists discount_total numeric(10, 2) not null default 0,
  add column if not exists discount_snapshot jsonb,
  add column if not exists applied_promo_code text;

create or replace function public.normalize_discount_promo_code()
returns trigger
language plpgsql
as $$
begin
  new.code := upper(regexp_replace(coalesce(new.code, ''), '\s+', '', 'g'));
  new.discount_type := case
    when lower(coalesce(new.discount_type, 'percent')) = 'amount' then 'amount'
    else 'percent'
  end;
  new.discount_percent := greatest(0, least(100, coalesce(new.discount_percent, 0)));
  new.discount_amount := greatest(0, coalesce(new.discount_amount, 0));
  if new.discount_type = 'amount' then
    new.discount_percent := 0;
  else
    new.discount_amount := 0;
  end if;
  new.minimum_subtotal := greatest(0, coalesce(new.minimum_subtotal, 0));
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists normalize_discount_promo_code_trigger on public.discount_promos;

create trigger normalize_discount_promo_code_trigger
before insert or update on public.discount_promos
for each row
execute function public.normalize_discount_promo_code();

create or replace function public.touch_discount_redemptions_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists touch_discount_redemptions_updated_at_trigger on public.discount_redemptions;

create trigger touch_discount_redemptions_updated_at_trigger
before update on public.discount_redemptions
for each row
execute function public.touch_discount_redemptions_updated_at();

create or replace function public.get_discount_promo_usage(p_promo_ids uuid[])
returns table (
  promo_id uuid,
  total_count bigint,
  user_count bigint
)
language sql
security definer
set search_path = public
as $$
  select
    promo_ids.promo_id,
    count(redemptions.id) filter (where redemptions.status <> 'voided'::public.discount_redemption_status) as total_count,
    count(redemptions.id) filter (
      where redemptions.status <> 'voided'::public.discount_redemption_status
        and redemptions.user_id = auth.uid()
    ) as user_count
  from unnest(coalesce(p_promo_ids, array[]::uuid[])) as promo_ids(promo_id)
  left join public.discount_redemptions redemptions
    on redemptions.promo_id = promo_ids.promo_id
  group by promo_ids.promo_id;
$$;

grant execute on function public.get_discount_promo_usage(uuid[]) to anon, authenticated;

alter table public.discount_promos enable row level security;
alter table public.discount_redemptions enable row level security;

drop policy if exists "Anyone can read promos for checkout validation" on public.discount_promos;
create policy "Anyone can read promos for checkout validation"
  on public.discount_promos
  for select
  to anon, authenticated
  using (true);

drop policy if exists "Staff can manage promos" on public.discount_promos;
create policy "Staff can manage promos"
  on public.discount_promos
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.users
      where users.id = auth.uid()
        and users.role in ('admin', 'employee')
    )
  )
  with check (
    exists (
      select 1
      from public.users
      where users.id = auth.uid()
        and users.role in ('admin', 'employee')
    )
  );

drop policy if exists "Customers can create their own redemptions" on public.discount_redemptions;
create policy "Customers can create their own redemptions"
  on public.discount_redemptions
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Customers can view their own redemptions" on public.discount_redemptions;
create policy "Customers can view their own redemptions"
  on public.discount_redemptions
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Staff can manage redemptions" on public.discount_redemptions;
create policy "Staff can manage redemptions"
  on public.discount_redemptions
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.users
      where users.id = auth.uid()
        and users.role in ('admin', 'employee')
    )
  )
  with check (
    exists (
      select 1
      from public.users
      where users.id = auth.uid()
        and users.role in ('admin', 'employee')
    )
  );
