ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS is_free_shipping BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.products.is_free_shipping IS 'Marks catalogue products that qualify for free shipping at checkout.';
