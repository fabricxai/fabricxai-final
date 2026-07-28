-- Extensions the platform depends on (dev-plan §1).
-- Kept as the first migration so a fresh production database is fully provisioned by
-- `pnpm db:migrate` alone, without relying on the docker-compose init hook (which only
-- ever runs on a brand-new dev volume).

-- Order Memory / style similarity lives in this same Postgres (architecture §4).
CREATE EXTENSION IF NOT EXISTS vector;

-- Fuzzy duplicate detection across buyers, styles, workers, fabric rolls.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Composite GIN indexes mixing scalar tenant keys with jsonb / array columns.
CREATE EXTENSION IF NOT EXISTS btree_gin;

-- gen_random_uuid() for primary keys.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
