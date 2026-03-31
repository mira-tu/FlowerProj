DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'payment_status' AND e.enumlabel = 'partial'
  ) THEN
    ALTER TYPE payment_status ADD VALUE 'partial';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'order_status' AND e.enumlabel = 'claimed'
  ) THEN
    ALTER TYPE order_status ADD VALUE 'claimed';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'request_status' AND e.enumlabel = 'ready_for_pickup'
  ) THEN
    ALTER TYPE request_status ADD VALUE 'ready_for_pickup';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'request_status' AND e.enumlabel = 'out_for_delivery'
  ) THEN
    ALTER TYPE request_status ADD VALUE 'out_for_delivery';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'request_status' AND e.enumlabel = 'claimed'
  ) THEN
    ALTER TYPE request_status ADD VALUE 'claimed';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'stock_reservation_scope'
  ) THEN
    CREATE TYPE stock_reservation_scope AS ENUM ('flower', 'wrapper', 'ribbon', 'other');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'stock_reservation_status'
  ) THEN
    CREATE TYPE stock_reservation_status AS ENUM ('reserved', 'consumed', 'released');
  END IF;
END $$;

ALTER TABLE orders
  ALTER COLUMN address_id DROP NOT NULL;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS amount_received NUMERIC(10, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS status_timestamps JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS additional_receipts JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS request_id BIGINT REFERENCES requests(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS request_type TEXT,
  ADD COLUMN IF NOT EXISTS request_data JSONB,
  ADD COLUMN IF NOT EXISTS request_image_url TEXT,
  ADD COLUMN IF NOT EXISTS assigned_rider UUID,
  ADD COLUMN IF NOT EXISTS third_party_rider_name TEXT,
  ADD COLUMN IF NOT EXISTS third_party_rider_info TEXT;

ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS image_url TEXT;

ALTER TABLE requests
  ADD COLUMN IF NOT EXISTS image_url TEXT,
  ADD COLUMN IF NOT EXISTS shipping_fee NUMERIC(10, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS estimated_price NUMERIC(10, 2),
  ADD COLUMN IF NOT EXISTS payment_method TEXT,
  ADD COLUMN IF NOT EXISTS payment_status payment_status NOT NULL DEFAULT 'to_pay',
  ADD COLUMN IF NOT EXISTS receipt_url TEXT,
  ADD COLUMN IF NOT EXISTS delivery_method delivery_method,
  ADD COLUMN IF NOT EXISTS pickup_time TEXT,
  ADD COLUMN IF NOT EXISTS amount_received NUMERIC(10, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS status_timestamps JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS additional_receipts JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS assigned_rider UUID,
  ADD COLUMN IF NOT EXISTS third_party_rider_name TEXT,
  ADD COLUMN IF NOT EXISTS third_party_rider_info TEXT;

UPDATE requests
SET image_url = COALESCE(image_url, photo_url)
WHERE COALESCE(image_url, '') = ''
  AND COALESCE(photo_url, '') <> '';

CREATE TABLE IF NOT EXISTS stock_products (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  price NUMERIC(10, 2) NOT NULL DEFAULT 0,
  quantity INTEGER NOT NULL DEFAULT 0,
  unit TEXT,
  reorder_level INTEGER NOT NULL DEFAULT 10,
  is_available BOOLEAN NOT NULL DEFAULT TRUE,
  image_url TEXT,
  preview_image_url TEXT,
  layer_image_url TEXT,
  stem_image_url TEXT,
  wrapper_group_name TEXT,
  wrapper_color TEXT,
  ribbon_scope TEXT,
  customization_config JSONB,
  wrapper_behavior JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE stock_products
  ADD COLUMN IF NOT EXISTS preview_image_url TEXT,
  ADD COLUMN IF NOT EXISTS layer_image_url TEXT,
  ADD COLUMN IF NOT EXISTS stem_image_url TEXT,
  ADD COLUMN IF NOT EXISTS customization_config JSONB,
  ADD COLUMN IF NOT EXISTS wrapper_behavior JSONB NOT NULL DEFAULT '{}'::jsonb;

UPDATE stock_products
SET
  preview_image_url = COALESCE(preview_image_url, image_url),
  layer_image_url = COALESCE(layer_image_url, image_url),
  stem_image_url = COALESCE(stem_image_url, image_url),
  wrapper_behavior = CASE
    WHEN COALESCE(wrapper_behavior, '{}'::jsonb) = '{}'::jsonb THEN COALESCE(customization_config, '{}'::jsonb)
    ELSE wrapper_behavior
  END
WHERE preview_image_url IS NULL
   OR layer_image_url IS NULL
   OR stem_image_url IS NULL
   OR COALESCE(wrapper_behavior, '{}'::jsonb) = '{}'::jsonb;

CREATE TABLE IF NOT EXISTS stock_reservations (
  id BIGSERIAL PRIMARY KEY,
  request_id BIGINT NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  stock_product_id BIGINT NOT NULL REFERENCES stock_products(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  scope stock_reservation_scope NOT NULL DEFAULT 'other',
  status stock_reservation_status NOT NULL DEFAULT 'reserved',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stock_reservations_request_id
  ON stock_reservations(request_id);

CREATE INDEX IF NOT EXISTS idx_stock_reservations_stock_product_id
  ON stock_reservations(stock_product_id);

CREATE INDEX IF NOT EXISTS idx_stock_reservations_status
  ON stock_reservations(status);

CREATE OR REPLACE FUNCTION set_current_timestamp_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS stock_products_set_updated_at ON stock_products;
CREATE TRIGGER stock_products_set_updated_at
BEFORE UPDATE ON stock_products
FOR EACH ROW
EXECUTE FUNCTION set_current_timestamp_updated_at();

DROP TRIGGER IF EXISTS stock_reservations_set_updated_at ON stock_reservations;
CREATE TRIGGER stock_reservations_set_updated_at
BEFORE UPDATE ON stock_reservations
FOR EACH ROW
EXECUTE FUNCTION set_current_timestamp_updated_at();

CREATE OR REPLACE FUNCTION sync_request_stock_reservations()
RETURNS TRIGGER AS $$
DECLARE
  transition_to_released BOOLEAN := TG_OP = 'UPDATE' AND NEW.status IN ('cancelled', 'declined');
  transition_to_consumed BOOLEAN := TG_OP = 'UPDATE' AND NEW.status IN ('processing', 'ready_for_pickup', 'out_for_delivery', 'completed', 'claimed');
BEGIN
  IF TG_OP = 'INSERT' THEN
    WITH item_source AS (
      SELECT
        item,
        ROW_NUMBER() OVER () AS item_index
      FROM jsonb_array_elements(COALESCE(NEW.data->'items', '[]'::jsonb)) AS item
    ),
    flower_distribution AS (
      SELECT
        (flower_item->>'id')::BIGINT AS stock_product_id,
        CASE
          WHEN flower_count = 0 OR bundle_size <= 0 THEN 0
          ELSE (bundle_size / flower_count)
            + CASE WHEN flower_position <= (bundle_size % flower_count) THEN 1 ELSE 0 END
        END AS quantity,
        'flower'::stock_reservation_scope AS scope
      FROM (
        SELECT
          item,
          COALESCE(NULLIF(item->>'bundleSize', '')::INTEGER, 0) AS bundle_size,
          flower_item,
          ROW_NUMBER() OVER (PARTITION BY item_index) AS flower_position,
          COUNT(*) OVER (PARTITION BY item_index) AS flower_count
        FROM item_source
        CROSS JOIN LATERAL jsonb_array_elements(COALESCE(item->'flowers', '[]'::jsonb)) AS flower_item
        WHERE jsonb_typeof(COALESCE(item->'flowers', '[]'::jsonb)) = 'array'
      ) distributed
      WHERE flower_item ? 'id'
        AND COALESCE(flower_item->>'id', '') ~ '^[0-9]+$'
    ),
    explicit_flower_breakdown AS (
      SELECT
        COALESCE(
          NULLIF(breakdown_item->>'stock_product_id', '')::BIGINT,
          NULLIF(breakdown_item->>'flowerId', '')::BIGINT,
          NULLIF(breakdown_item->>'id', '')::BIGINT
        ) AS stock_product_id,
        COALESCE(
          NULLIF(breakdown_item->>'quantity', '')::INTEGER,
          NULLIF(breakdown_item->>'stems', '')::INTEGER,
          0
        ) AS quantity,
        'flower'::stock_reservation_scope AS scope
      FROM item_source
      CROSS JOIN LATERAL jsonb_array_elements(COALESCE(item->'flowerStemBreakdown', item->'flowerAllocations', '[]'::jsonb)) AS breakdown_item
      WHERE jsonb_typeof(COALESCE(item->'flowerStemBreakdown', item->'flowerAllocations', '[]'::jsonb)) = 'array'
        AND (
          COALESCE(breakdown_item->>'stock_product_id', '') ~ '^[0-9]+$'
          OR COALESCE(breakdown_item->>'flowerId', '') ~ '^[0-9]+$'
          OR COALESCE(breakdown_item->>'id', '') ~ '^[0-9]+$'
        )
    ),
    wrapper_and_ribbon AS (
      SELECT
        NULLIF(item->'wrapper'->>'id', '')::BIGINT AS stock_product_id,
        1 AS quantity,
        'wrapper'::stock_reservation_scope AS scope
      FROM item_source
      WHERE COALESCE(item->'wrapper'->>'id', '') ~ '^[0-9]+$'
      UNION ALL
      SELECT
        NULLIF(item->'ribbon'->>'id', '')::BIGINT AS stock_product_id,
        1 AS quantity,
        'ribbon'::stock_reservation_scope AS scope
      FROM item_source
      WHERE COALESCE(item->'ribbon'->>'id', '') ~ '^[0-9]+$'
    ),
    explicit_request_allocations AS (
      SELECT
        NULLIF(allocation->>'stock_product_id', '')::BIGINT AS stock_product_id,
        COALESCE(NULLIF(allocation->>'quantity', '')::INTEGER, 0) AS quantity,
        CASE lower(COALESCE(NULLIF(allocation->>'scope', ''), NULLIF(allocation->>'reservation_kind', ''), 'other'))
          WHEN 'flower' THEN 'flower'::stock_reservation_scope
          WHEN 'wrapper' THEN 'wrapper'::stock_reservation_scope
          WHEN 'ribbon' THEN 'ribbon'::stock_reservation_scope
          ELSE 'other'::stock_reservation_scope
        END AS scope
      FROM jsonb_array_elements(COALESCE(NEW.data->'stock_allocations', '[]'::jsonb)) AS allocation
      WHERE jsonb_typeof(COALESCE(NEW.data->'stock_allocations', '[]'::jsonb)) = 'array'
        AND COALESCE(allocation->>'stock_product_id', '') ~ '^[0-9]+$'
    ),
    raw_reservations AS (
      SELECT stock_product_id, quantity, scope
      FROM explicit_flower_breakdown
      WHERE stock_product_id IS NOT NULL AND quantity > 0
      UNION ALL
      SELECT stock_product_id, quantity, scope
      FROM flower_distribution
      WHERE stock_product_id IS NOT NULL
        AND quantity > 0
        AND NOT EXISTS (
          SELECT 1
          FROM explicit_flower_breakdown explicit_rows
          WHERE explicit_rows.stock_product_id = flower_distribution.stock_product_id
        )
      UNION ALL
      SELECT stock_product_id, quantity, scope
      FROM wrapper_and_ribbon
      WHERE stock_product_id IS NOT NULL AND quantity > 0
      UNION ALL
      SELECT stock_product_id, quantity, scope
      FROM explicit_request_allocations
      WHERE stock_product_id IS NOT NULL AND quantity > 0
    ),
    aggregated_reservations AS (
      SELECT
        stock_product_id,
        SUM(quantity)::INTEGER AS quantity,
        scope
      FROM raw_reservations
      GROUP BY stock_product_id, scope
    ),
    inserted_reservations AS (
      INSERT INTO stock_reservations (request_id, stock_product_id, quantity, scope, status)
      SELECT
        NEW.id,
        stock_product_id,
        quantity,
        scope,
        'reserved'
      FROM aggregated_reservations
      RETURNING stock_product_id, quantity
    ),
    reservation_totals AS (
      SELECT stock_product_id, SUM(quantity)::INTEGER AS quantity
      FROM inserted_reservations
      GROUP BY stock_product_id
    )
    UPDATE stock_products stock
    SET
      quantity = GREATEST(0, COALESCE(stock.quantity, 0) - reservation_totals.quantity),
      updated_at = NOW()
    FROM reservation_totals
    WHERE stock.id = reservation_totals.stock_product_id;

    RETURN NEW;
  END IF;

  IF transition_to_released THEN
    WITH released_reservations AS (
      UPDATE stock_reservations
      SET
        status = 'released',
        updated_at = NOW()
      WHERE request_id = NEW.id
        AND status = 'reserved'
      RETURNING stock_product_id, quantity
    ),
    release_totals AS (
      SELECT stock_product_id, SUM(quantity)::INTEGER AS quantity
      FROM released_reservations
      GROUP BY stock_product_id
    )
    UPDATE stock_products stock
    SET
      quantity = COALESCE(stock.quantity, 0) + release_totals.quantity,
      updated_at = NOW()
    FROM release_totals
    WHERE stock.id = release_totals.stock_product_id;

    RETURN NEW;
  END IF;

  IF transition_to_consumed THEN
    UPDATE stock_reservations
    SET
      status = 'consumed',
      updated_at = NOW()
    WHERE request_id = NEW.id
      AND status = 'reserved';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS requests_sync_stock_reservations_after_insert ON requests;
CREATE TRIGGER requests_sync_stock_reservations_after_insert
AFTER INSERT ON requests
FOR EACH ROW
EXECUTE FUNCTION sync_request_stock_reservations();

DROP TRIGGER IF EXISTS requests_sync_stock_reservations_after_update ON requests;
CREATE TRIGGER requests_sync_stock_reservations_after_update
AFTER UPDATE OF status ON requests
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION sync_request_stock_reservations();

UPDATE stock_products
SET wrapper_behavior = COALESCE(
  NULLIF(wrapper_behavior, '{}'::jsonb),
  CASE
    WHEN name = 'Classic Wrap' THEN jsonb_build_object(
      'ribbonMode', 'classic',
      'previewStyle', jsonb_build_object(
        'width', '84%',
        'maxHeight', '86%',
        'top', 'auto',
        'bottom', '2%',
        'transform', 'translateX(-50%)'
      ),
      'flowerZoneConfig', jsonb_build_object(
        'mode', 'fixed',
        'left', '50%',
        'top', 0,
        'width', 320,
        'height', 250,
        'transform', 'translateX(-50%)',
        'shape', 'rectangle'
      )
    )
    WHEN name = 'Leaf Arch Wrap' THEN jsonb_build_object(
      'ribbonMode', 'none',
      'isNaturalWrapper', true,
      'flowerZoneConfig', jsonb_build_object(
        'mode', 'relative',
        'leftFactor', 0.08,
        'topFactor', 0.13,
        'widthFactor', 0.82,
        'heightFactor', 0.64,
        'shape', 'ellipse'
      )
    )
    WHEN name = 'Leaf Fan Wrap' THEN jsonb_build_object(
      'ribbonMode', 'none',
      'isNaturalWrapper', true,
      'flowerZoneConfig', jsonb_build_object(
        'mode', 'relative',
        'leftFactor', 0.02,
        'topFactor', 0.08,
        'widthFactor', 0.96,
        'heightFactor', 0.68,
        'shape', 'ellipse'
      )
    )
    WHEN name = 'Palm Halo Wrap' THEN jsonb_build_object(
      'ribbonMode', 'palm-halo',
      'isNaturalWrapper', true,
      'previewStyle', jsonb_build_object(
        'width', 'auto',
        'height', '100%',
        'maxWidth', '116%',
        'maxHeight', '116%',
        'top', 'auto',
        'bottom', '-4%',
        'transform', 'translateX(-50%) scale(1.24)'
      ),
      'ribbonPreviewConfig', jsonb_build_object(
        'mode', 'relative',
        'leftFactor', 0.5,
        'topFactor', 0.47,
        'widthFactor', 0.46,
        'transform', 'translate(-50%, -50%)',
        'fallbackStyle', jsonb_build_object(
          'top', '58%',
          'left', '50%',
          'width', '30%',
          'transform', 'translate(-50%, -50%)'
        )
      ),
      'flowerZoneConfig', jsonb_build_object(
        'zones', jsonb_build_array(
          jsonb_build_object(
            'id', 'palm-halo-top',
            'mode', 'relative',
            'leftFactor', 0.07,
            'topFactor', 0.02,
            'widthFactor', 0.86,
            'heightFactor', 0.54,
            'shape', 'ellipse',
            'stemShare', 0.72
          ),
          jsonb_build_object(
            'id', 'palm-halo-bottom',
            'mode', 'relative',
            'leftFactor', 0.05,
            'topFactor', 0.73,
            'widthFactor', 0.7,
            'heightFactor', 0.28,
            'shape', 'ellipse',
            'stemShare', 0.28
          )
        )
      )
    )
    ELSE COALESCE(wrapper_behavior, '{}'::jsonb)
  END
)
WHERE category = 'Wrappers';
