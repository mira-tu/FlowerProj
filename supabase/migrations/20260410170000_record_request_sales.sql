create table if not exists public.sales (
  id bigserial primary key,
  order_id bigint,
  request_id bigint,
  user_id uuid not null,
  sale_date timestamptz not null default now(),
  total_amount numeric(10, 2) not null default 0,
  created_at timestamptz default now()
);

alter table public.sales
  add column if not exists request_id bigint;

alter table public.sales
  alter column order_id drop not null;

alter table public.sales
  drop constraint if exists chk_sale_source;

alter table public.sales
  add constraint chk_sale_source
  check (order_id is not null or request_id is not null);

create unique index if not exists sales_request_id_conflict_idx
  on public.sales (request_id);

create or replace function public.record_request_sale()
returns trigger
language plpgsql
as $$
declare
  sale_total numeric(10, 2);
  should_record boolean := false;
begin
  sale_total := coalesce(nullif(new.final_price, 0), 0);

  if new.status::text in ('completed', 'claimed') and sale_total > 0 then
    if tg_op = 'INSERT' then
      should_record := true;
    else
      should_record := old.status is distinct from new.status
        or old.final_price is distinct from new.final_price;
    end if;

    if should_record then
      insert into public.sales (request_id, user_id, sale_date, total_amount)
      values (new.id, new.user_id, now(), sale_total)
      on conflict (request_id) do update
      set total_amount = excluded.total_amount,
          sale_date = excluded.sale_date;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists on_request_complete on public.requests;

create trigger on_request_complete
after insert or update on public.requests
for each row
execute function public.record_request_sale();

insert into public.sales (request_id, user_id, sale_date, total_amount)
select
  requests.id,
  requests.user_id,
  coalesce(requests.created_at, now()),
  requests.final_price
from public.requests
where requests.status::text in ('completed', 'claimed')
  and requests.final_price > 0
on conflict (request_id) do update
set total_amount = excluded.total_amount,
    sale_date = excluded.sale_date;
