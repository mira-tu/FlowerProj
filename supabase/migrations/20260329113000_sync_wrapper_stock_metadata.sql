alter table public.stock_products
add column if not exists wrapper_group_name varchar;

alter table public.stock_products
add column if not exists wrapper_color varchar;

update public.stock_products
set
  name = 'Classic Wrap',
  wrapper_group_name = 'Classic Wrap',
  wrapper_color = case
    when coalesce(wrapper_color, '') <> '' then wrapper_color
    when name in ('Dark Blue', 'Sky Blue', 'Purple') then name
    else wrapper_color
  end,
  updated_at = timezone('utc', now())
where category = 'Wrappers'
  and (
    name in ('Dark Blue', 'Sky Blue', 'Purple')
    or wrapper_group_name = 'Classic Wrap'
  );

update public.stock_products
set
  wrapper_group_name = name,
  updated_at = timezone('utc', now())
where category = 'Wrappers'
  and coalesce(wrapper_group_name, '') = ''
  and coalesce(wrapper_color, '') = '';

insert into public.stock_products (
  name,
  category,
  price,
  quantity,
  unit,
  reorder_level,
  is_available,
  image_url,
  wrapper_group_name,
  wrapper_color
)
select
  item.name,
  'Wrappers',
  item.price,
  item.quantity,
  '1',
  10,
  true,
  item.image_url,
  item.name,
  null
from (
  values
    ('Leaf Arch Wrap', 60::numeric, 24, 'https://luzcecstkebntjnfonwv.supabase.co/storage/v1/object/public/stock-images/wrappers/natural-arch-wrap-cutout.png'),
    ('Leaf Fan Wrap', 60::numeric, 24, 'https://luzcecstkebntjnfonwv.supabase.co/storage/v1/object/public/stock-images/wrappers/natural-fan-wrap-cutout.png'),
    ('Palm Halo Wrap', 60::numeric, 24, 'https://luzcecstkebntjnfonwv.supabase.co/storage/v1/object/public/stock-images/wrappers/natural-palm-wrap-cutout.png')
) as item(name, price, quantity, image_url)
where not exists (
  select 1
  from public.stock_products existing
  where existing.category = 'Wrappers'
    and coalesce(existing.wrapper_group_name, existing.name) = item.name
    and coalesce(existing.wrapper_color, '') = ''
);
