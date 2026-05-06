DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'order_status' AND e.enumlabel = 'delivery_failed_attempt'
  ) THEN
    ALTER TYPE order_status ADD VALUE 'delivery_failed_attempt';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'request_status' AND e.enumlabel = 'delivery_failed_attempt'
  ) THEN
    ALTER TYPE request_status ADD VALUE 'delivery_failed_attempt';
  END IF;
END $$;
