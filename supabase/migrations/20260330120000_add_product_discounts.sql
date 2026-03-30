alter table public.products
  add column if not exists original_price decimal(10, 2),
  add column if not exists discount_percentage decimal(5, 2) not null default 0,
  add column if not exists discounted_price decimal(10, 2);

update public.products
set
  original_price = coalesce(original_price, price),
  discount_percentage = greatest(0, least(100, coalesce(discount_percentage, 0))),
  discounted_price = round(
    (
      coalesce(original_price, price)
      * (1 - (greatest(0, least(100, coalesce(discount_percentage, 0))) / 100.0))
    )::numeric,
    2
  );

create or replace function public.sync_product_discount_fields()
returns trigger
language plpgsql
as $$
declare
  base_price numeric(10, 2);
  safe_discount numeric(5, 2);
begin
  base_price := coalesce(new.original_price, new.price, 0);
  safe_discount := greatest(0, least(100, coalesce(new.discount_percentage, 0)));

  new.price := round(base_price::numeric, 2);
  new.original_price := new.price;
  new.discount_percentage := safe_discount;
  new.discounted_price := round((new.price * (1 - (safe_discount / 100.0)))::numeric, 2);

  return new;
end;
$$;

drop trigger if exists trg_sync_product_discount_fields on public.products;

create trigger trg_sync_product_discount_fields
before insert or update on public.products
for each row
execute function public.sync_product_discount_fields();
