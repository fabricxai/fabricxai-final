-- ============================================================================
-- Outbox relay support.
--
-- The relay is infrastructure, not a tenant operation: it drains ONE queue that
-- spans every company. That means it needs to read across tenants, and migration
-- 0004 said `app.memberships_for_user` was the only thing that could. This file
-- adds the second and — barring a new subsystem — last such surface.
--
-- It is kept as narrow as the first one:
--   * only rows with published_at IS NULL are ever visible, so these functions
--     cannot be used to browse a company's event history;
--   * no function returns anything but the queue payload it must hand to BullMQ;
--   * the claim does NOT mark rows published, deliberately (see below).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Lock a batch of undelivered events.
--
-- `FOR UPDATE SKIP LOCKED` is what makes running more than one relay worker safe:
-- each takes a disjoint batch instead of two fighting over the same rows.
--
-- Note what this does NOT do: it does not mark anything published. Marking on
-- claim would mean an event that was claimed and then failed to enqueue is gone
-- forever — at-most-once delivery, silently. The relay instead enqueues first and
-- calls mark_outbox_published() inside the SAME transaction, so a crash anywhere
-- rolls the claim back and the event is retried. A crash after enqueue but before
-- commit redelivers, which is exactly the at-least-once contract handlers already
-- dedupe against via processed_events.
--
-- The lock is held by the CALLER's transaction: a SECURITY DEFINER function runs
-- inside it, so the rows stay locked until the relay commits or rolls back.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.lock_outbox_batch(p_limit int DEFAULT 100)
  RETURNS TABLE (id uuid, company_id uuid, event_name text, payload jsonb, attempts int)
  LANGUAGE sql
  VOLATILE
  SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
    SELECT o.id, o.company_id, o.event_name, o.payload, o.attempts
    FROM public.outbox o
    WHERE o.published_at IS NULL
    ORDER BY o.occurred_at
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  $$;

COMMENT ON FUNCTION app.lock_outbox_batch(int) IS
  'Relay only: locks undelivered outbox rows for the calling transaction. Does not publish them — see 0006 for why.';

-- ----------------------------------------------------------------------------
-- Mark events delivered. Called after a successful enqueue, in the same
-- transaction as the claim.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.mark_outbox_published(p_ids uuid[])
  RETURNS integer
  LANGUAGE sql
  VOLATILE
  SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
    WITH updated AS (
      UPDATE public.outbox
      SET published_at = now()
      WHERE id = ANY(p_ids) AND published_at IS NULL
      RETURNING 1
    )
    SELECT count(*)::int FROM updated
  $$;

-- ----------------------------------------------------------------------------
-- Record a delivery failure so a poison event surfaces in the admin runbook
-- screen instead of being retried forever in silence (architecture §5).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.record_outbox_failure(p_id uuid, p_error text)
  RETURNS void
  LANGUAGE sql
  VOLATILE
  SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
    UPDATE public.outbox
    SET attempts = attempts + 1,
        last_error = left(p_error, 2000)
    WHERE id = p_id
  $$;

REVOKE ALL ON FUNCTION app.lock_outbox_batch(int) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.mark_outbox_published(uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.record_outbox_failure(uuid, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION app.lock_outbox_batch(int) TO fabricxai_app;
GRANT EXECUTE ON FUNCTION app.mark_outbox_published(uuid[]) TO fabricxai_app;
GRANT EXECUTE ON FUNCTION app.record_outbox_failure(uuid, text) TO fabricxai_app;
