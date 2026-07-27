-- Add operational customer relationships without rewriting historical transactions.
CREATE TYPE "CustomerFollowUpStatus" AS ENUM ('OPEN', 'COMPLETED', 'CANCELLED');

CREATE TABLE "customer_contacts" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_contacts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "customer_job_sites" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "contact_id" TEXT,
    "name" TEXT NOT NULL,
    "address1" TEXT NOT NULL,
    "address2" TEXT,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "zip_code" TEXT NOT NULL,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_job_sites_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "customer_follow_ups" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "due_at" TIMESTAMP(3) NOT NULL,
    "next_action" TEXT NOT NULL,
    "status" "CustomerFollowUpStatus" NOT NULL DEFAULT 'OPEN',
    "completed_at" TIMESTAMP(3),
    "completion_note" TEXT,
    "created_by" TEXT,
    "creation_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_follow_ups_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "customer_contacts_customer_id_is_primary_idx"
ON "customer_contacts"("customer_id", "is_primary");

CREATE INDEX "customer_contacts_email_idx"
ON "customer_contacts"("email");

CREATE INDEX "customer_job_sites_customer_id_active_idx"
ON "customer_job_sites"("customer_id", "active");

CREATE INDEX "customer_job_sites_contact_id_idx"
ON "customer_job_sites"("contact_id");

CREATE UNIQUE INDEX "customer_follow_ups_creation_key_key"
ON "customer_follow_ups"("creation_key");

CREATE INDEX "customer_follow_ups_customer_id_status_due_at_idx"
ON "customer_follow_ups"("customer_id", "status", "due_at");

CREATE INDEX "customer_follow_ups_owner_status_due_at_idx"
ON "customer_follow_ups"("owner", "status", "due_at");

ALTER TABLE "customer_contacts"
ADD CONSTRAINT "customer_contacts_customer_id_fkey"
FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "customer_job_sites"
ADD CONSTRAINT "customer_job_sites_customer_id_fkey"
FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "customer_job_sites"
ADD CONSTRAINT "customer_job_sites_contact_id_fkey"
FOREIGN KEY ("contact_id") REFERENCES "customer_contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "customer_follow_ups"
ADD CONSTRAINT "customer_follow_ups_customer_id_fkey"
FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Compatibility backfill. Legacy columns stay authoritative until each record is reviewed.
INSERT INTO "customer_contacts" (
    "id",
    "customer_id",
    "name",
    "role",
    "phone",
    "email",
    "is_primary",
    "created_at",
    "updated_at"
)
SELECT
    gen_random_uuid()::text,
    "id",
    "name",
    'Primary contact',
    "phone",
    "email",
    true,
    "created_at",
    CURRENT_TIMESTAMP
FROM "customers"
WHERE trim("name") <> '';

INSERT INTO "customer_job_sites" (
    "id",
    "customer_id",
    "name",
    "address1",
    "city",
    "state",
    "zip_code",
    "created_at",
    "updated_at"
)
SELECT
    gen_random_uuid()::text,
    "id",
    COALESCE(NULLIF(trim("company_name"), '') || ' primary site', 'Primary job site'),
    COALESCE("address", ''),
    COALESCE("city", ''),
    COALESCE("state", ''),
    COALESCE("zip_code", ''),
    "created_at",
    CURRENT_TIMESTAMP
FROM "customers"
WHERE "address" IS NOT NULL
   OR "city" IS NOT NULL
   OR "state" IS NOT NULL
   OR "zip_code" IS NOT NULL;
