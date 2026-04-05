alter table public.order_items
  add column if not exists cancelled_quantity integer not null default 0,
  add column if not exists cancellation_history jsonb not null default '[]'::jsonb;

alter table public.order_items
  drop constraint if exists order_items_cancelled_quantity_check;

alter table public.order_items
  add constraint order_items_cancelled_quantity_check
  check (cancelled_quantity >= 0 and cancelled_quantity <= quantity);
