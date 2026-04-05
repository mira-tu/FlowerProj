ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS free_shipping_min_order_amount numeric(10, 2) NOT NULL DEFAULT 0;

UPDATE public.products
SET free_shipping_min_order_amount = 0
WHERE free_shipping_min_order_amount IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'products_free_shipping_min_order_amount_nonnegative'
  ) THEN
    ALTER TABLE public.products
    ADD CONSTRAINT products_free_shipping_min_order_amount_nonnegative
    CHECK (free_shipping_min_order_amount >= 0);
  END IF;
END
$$;
