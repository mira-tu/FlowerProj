alter table public.discount_promos
  add column if not exists discount_type text not null default 'percent',
  add column if not exists discount_amount numeric(10, 2) not null default 0;

update public.discount_promos
set
  discount_type = case
    when lower(coalesce(discount_type, 'percent')) = 'amount' then 'amount'
    else 'percent'
  end,
  discount_percent = greatest(0, least(100, coalesce(discount_percent, 0))),
  discount_amount = greatest(0, coalesce(discount_amount, 0));

alter table public.discount_promos
  alter column discount_type set default 'percent',
  alter column discount_type set not null,
  alter column discount_amount set default 0,
  alter column discount_amount set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'discount_promos_discount_type_check'
      and conrelid = 'public.discount_promos'::regclass
  ) then
    alter table public.discount_promos
      add constraint discount_promos_discount_type_check
      check (discount_type in ('percent', 'amount'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'discount_promos_discount_amount_check'
      and conrelid = 'public.discount_promos'::regclass
  ) then
    alter table public.discount_promos
      add constraint discount_promos_discount_amount_check
      check (discount_amount >= 0);
  end if;
end;
$$;

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

notify pgrst, 'reload schema';
