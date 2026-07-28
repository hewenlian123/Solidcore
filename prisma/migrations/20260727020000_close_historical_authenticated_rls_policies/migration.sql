-- Remove historical direct authenticated access from the private application tables.
-- SolidCore business data remains accessible through trusted server-side Prisma routes.
DO $$
DECLARE
  affected_table_count integer;
  actual_authenticated_policy_count integer;
  matched_authenticated_policy_count integer;
  policy_record record;
BEGIN
  WITH affected_tables(table_name) AS (
    VALUES
      ('AfterSalesTicket'),
      ('AppUser'),
      ('Customer'),
      ('Order'),
      ('OrderItem'),
      ('Product'),
      ('StockLog'),
      ('Supplier'),
      ('Warehouse'),
      ('customers'),
      ('description_templates'),
      ('inventory_movements'),
      ('inventory_stock')
  )
  SELECT count(*)
  INTO affected_table_count
  FROM affected_tables expected
  JOIN pg_catalog.pg_class table_class
    ON table_class.relname = expected.table_name
   AND table_class.relkind = 'r'
  JOIN pg_catalog.pg_namespace table_schema
    ON table_schema.oid = table_class.relnamespace
   AND table_schema.nspname = 'public'
  WHERE table_class.relrowsecurity
    AND table_class.relforcerowsecurity;

  IF affected_table_count <> 13 THEN
    RAISE EXCEPTION
      'Historical RLS closure expected 13 existing public tables with enabled and forced RLS; found %',
      affected_table_count;
  END IF;

  SELECT count(*)
  INTO actual_authenticated_policy_count
  FROM pg_catalog.pg_policies
  WHERE schemaname = 'public'
    AND tablename IN (
      'AfterSalesTicket',
      'AppUser',
      'Customer',
      'Order',
      'OrderItem',
      'Product',
      'StockLog',
      'Supplier',
      'Warehouse',
      'customers',
      'description_templates',
      'inventory_movements',
      'inventory_stock'
    )
    AND 'authenticated' = ANY(roles);

  WITH expected_policies(
    table_name,
    policy_name,
    command_name,
    using_expression,
    check_expression
  ) AS (
    VALUES
      ('AfterSalesTicket', 'authenticated all', 'ALL', 'true', 'true'),
      ('AppUser', 'authenticated all', 'ALL', 'true', 'true'),
      ('Customer', 'authenticated read', 'SELECT', 'true', NULL),
      ('Customer', 'authenticated write', 'ALL', 'true', 'true'),
      ('Order', 'authenticated all', 'ALL', 'true', 'true'),
      ('OrderItem', 'authenticated all', 'ALL', 'true', 'true'),
      ('Product', 'authenticated all', 'ALL', 'true', 'true'),
      ('StockLog', 'authenticated all', 'ALL', 'true', 'true'),
      ('Supplier', 'authenticated all', 'ALL', 'true', 'true'),
      ('Warehouse', 'authenticated all', 'ALL', 'true', 'true'),
      ('customers', 'authenticated all', 'ALL', 'true', 'true'),
      ('description_templates', 'authenticated all', 'ALL', 'true', 'true'),
      ('inventory_movements', 'authenticated all', 'ALL', 'true', 'true'),
      ('inventory_stock', 'authenticated all', 'ALL', 'true', 'true')
  )
  SELECT count(*)
  INTO matched_authenticated_policy_count
  FROM expected_policies expected
  JOIN pg_catalog.pg_policies actual
    ON actual.schemaname = 'public'
   AND actual.tablename = expected.table_name
   AND actual.policyname = expected.policy_name
   AND actual.cmd = expected.command_name
   AND actual.roles = ARRAY['authenticated']::name[]
   AND actual.qual IS NOT DISTINCT FROM expected.using_expression
   AND actual.with_check IS NOT DISTINCT FROM expected.check_expression
   AND actual.permissive = 'PERMISSIVE';

  IF actual_authenticated_policy_count NOT IN (0, 14)
     OR matched_authenticated_policy_count NOT IN (0, 14)
     OR actual_authenticated_policy_count <> matched_authenticated_policy_count THEN
    RAISE EXCEPTION
      'Historical RLS policy topology mismatch: authenticated=%, exact_matches=%',
      actual_authenticated_policy_count,
      matched_authenticated_policy_count;
  END IF;

  IF actual_authenticated_policy_count = 14 THEN
    FOR policy_record IN
      SELECT *
      FROM (
        VALUES
          ('AfterSalesTicket', 'authenticated all'),
          ('AppUser', 'authenticated all'),
          ('Customer', 'authenticated read'),
          ('Customer', 'authenticated write'),
          ('Order', 'authenticated all'),
          ('OrderItem', 'authenticated all'),
          ('Product', 'authenticated all'),
          ('StockLog', 'authenticated all'),
          ('Supplier', 'authenticated all'),
          ('Warehouse', 'authenticated all'),
          ('customers', 'authenticated all'),
          ('description_templates', 'authenticated all'),
          ('inventory_movements', 'authenticated all'),
          ('inventory_stock', 'authenticated all')
      ) AS policies(table_name, policy_name)
    LOOP
      EXECUTE format(
        'DROP POLICY %I ON public.%I',
        policy_record.policy_name,
        policy_record.table_name
      );
    END LOOP;
  END IF;

  FOR policy_record IN
    SELECT *
    FROM (
      VALUES
        ('AfterSalesTicket'),
        ('AppUser'),
        ('Customer'),
        ('Order'),
        ('OrderItem'),
        ('Product'),
        ('StockLog'),
        ('Supplier'),
        ('Warehouse'),
        ('customers'),
        ('description_templates'),
        ('inventory_movements'),
        ('inventory_stock')
    ) AS affected(table_name)
  LOOP
    EXECUTE format(
      'ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',
      policy_record.table_name
    );
    EXECUTE format(
      'ALTER TABLE public.%I FORCE ROW LEVEL SECURITY',
      policy_record.table_name
    );
    EXECUTE format(
      'REVOKE ALL PRIVILEGES ON TABLE public.%I FROM anon, authenticated',
      policy_record.table_name
    );
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (
        'AfterSalesTicket',
        'AppUser',
        'Customer',
        'Order',
        'OrderItem',
        'Product',
        'StockLog',
        'Supplier',
        'Warehouse',
        'customers',
        'description_templates',
        'inventory_movements',
        'inventory_stock'
      )
      AND roles && ARRAY['anon', 'authenticated', 'public']::name[]
  ) THEN
    RAISE EXCEPTION
      'Historical RLS closure left a direct public, anon, or authenticated policy';
  END IF;
END
$$;
