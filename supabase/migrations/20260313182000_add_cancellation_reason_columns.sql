alter table public.orders
add column if not exists cancellation_reason text;

alter table public.requests
add column if not exists cancellation_reason text;
