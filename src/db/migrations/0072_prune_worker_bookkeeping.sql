-- ============================================================================
-- Pruning the worker's bookkeeping.
--
-- Two tables grow forever and nothing ever removed a row from either (audit
-- DB-M1, DB-M2). Both are pure bookkeeping: once a redelivery of an event is no
-- longer plausible, neither row answers a question anybody asks.
--
--   outbox            1,987 rows on a demo database, all published. The relay
--                     marks `published_at` and moves on. The partial index
--                     `WHERE published_at IS NULL` keeps the hot path fast, so
--                     this degrades quietly — as bloat, as vacuum work, and as
--                     the cost of a `companies` cascade delete — rather than as
--                     a slow queue.
--   processed_events  4,137 rows. The consumer dedupe ledger.
--
-- ## Why a function, and why SECURITY DEFINER
--
-- Migration 0002 deliberately grants the app role SELECT + INSERT + UPDATE on
-- `outbox` and withholds DELETE: nothing in a request should be able to remove
-- an event whose consequences have not happened yet. That is the right grant,
-- and it means the prune cannot be a plain `delete` from the service layer.
--
-- So: one definer function per table, each taking a cutoff, each refusing to
-- touch anything that is still live. The scheduler calls them nightly.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Published events past their window.
--
-- `published_at IS NOT NULL` is the whole safety property: an unpublished event
-- is work that has not happened, and no cutoff makes it stale. A poison event
-- parked at MAX_ATTEMPTS also has `published_at` NULL, so this cannot quietly
-- delete the evidence of a failure somebody still needs to look at.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.prune_outbox(p_before timestamptz)
  RETURNS bigint
  LANGUAGE plpgsql
  -- Not STABLE: it writes.
  SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
  DECLARE
    removed bigint;
  BEGIN
    DELETE FROM public.outbox
    WHERE published_at IS NOT NULL
      AND published_at < p_before;

    GET DIAGNOSTICS removed = ROW_COUNT;
    RETURN removed;
  END;
  $$;--> statement-breakpoint

COMMENT ON FUNCTION app.prune_outbox(timestamptz) IS
  'Delete PUBLISHED outbox rows older than the cutoff. Never touches unpublished events — those are consequences that have not happened yet. The app role has no DELETE on outbox by design, which is why this is SECURITY DEFINER.';--> statement-breakpoint

REVOKE ALL ON FUNCTION app.prune_outbox(timestamptz) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app.prune_outbox(timestamptz) TO fabricxai_app;--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- The consumer dedupe ledger.
--
-- A row here says "queue X already handled event Y". It stops a redelivered
-- event being processed twice, so it only needs to outlive the window in which
-- a redelivery is possible — which is bounded by the queue's own retry policy
-- (5 attempts, exponential from 2s) plus however long a stalled job can sit.
-- Days, not months.
--
-- The retention is passed in rather than fixed here so the policy stays with the
-- other job-health numbers instead of being buried in a migration.
--
-- Definer for a different reason than the outbox: `processed_events` has no
-- `company_id` and no RLS (it is cross-tenant by design — the worker dedupes by
-- event id, which is global), so a scoped transaction cannot see it. The app
-- role DOES hold DELETE here, but going through a function keeps the two prunes
-- shaped alike and gives the deletion one auditable definition.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.prune_processed_events(p_before timestamptz)
  RETURNS bigint
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
  DECLARE
    removed bigint;
  BEGIN
    DELETE FROM public.processed_events
    WHERE processed_at < p_before;

    GET DIAGNOSTICS removed = ROW_COUNT;
    RETURN removed;
  END;
  $$;--> statement-breakpoint

COMMENT ON FUNCTION app.prune_processed_events(timestamptz) IS
  'Delete consumer dedupe rows older than the cutoff. Safe once redelivery is no longer possible for those events — bounded by the queue retry policy, so days rather than months.';--> statement-breakpoint

REVOKE ALL ON FUNCTION app.prune_processed_events(timestamptz) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app.prune_processed_events(timestamptz) TO fabricxai_app;
