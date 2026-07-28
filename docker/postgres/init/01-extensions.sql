-- Extensions required by the platform (dev-plan §1).
-- Runs once, on first cluster init. The same statements are also in migration
-- 0000_extensions.sql so a fresh production database gets them from `pnpm db:migrate`
-- without depending on this container-only hook.

-- Order Memory / style similarity search lives in the same Postgres (architecture §4).
CREATE EXTENSION IF NOT EXISTS vector;

-- Fuzzy duplicate detection: buyers, styles, workers, fabric rolls.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Composite GIN indexes mixing scalar tenant keys with jsonb/array columns.
CREATE EXTENSION IF NOT EXISTS btree_gin;

-- gen_random_uuid() for primary keys.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Slow-query review cadence (dev-plan §8).
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
