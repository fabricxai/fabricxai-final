-- ANSI/ASQ Z1.4 single-sampling plans, normal inspection, GENERAL INSPECTION LEVEL II.
-- Reference data, not tenant data — see the comment on `aql_tables` and migration 0034.
--
-- Two things the next reader needs to know about these rows:
--
-- 1. **Arrows are resolved to the LARGER plan.** Z1.4 marks some cells with an arrow
--    meaning "use the first sampling plan below/above". Where the arrow-resolved sample
--    size differed between AQL 2.5 and 4.0 (lots of 2–25, where 4.0 resolves to a smaller
--    sample), both levels are seeded at the LARGER sample size. You cannot draw two
--    different samples from one carton, and drawing the smaller one would apply an
--    acceptance number to a sample it was not computed for.
--
-- 2. **Only AQL 2.5 and 4.0 are seeded.** That is the pair essentially every garment
--    buyer specifies ("2.5 major / 4.0 minor"). Rows for 1.0, 1.5 and 6.5 are NOT here
--    because they must be transcribed from the published standard rather than recalled —
--    an acceptance number that is one out decides whether shipments ship. Until they are
--    entered, `resolveAqlPlan` refuses that AQL level with a clear error instead of
--    substituting a neighbouring one. See docs/STUBS.md.
INSERT INTO "aql_tables"
  ("standard", "inspection_level", "aql_level", "lot_from", "lot_to", "sample_size", "accept", "reject")
VALUES
  -- lot range          n     AQL 2.5        AQL 4.0
  ('ansi-z1.4', 'II', '2.5',       2,        8,    5,   0,  1),
  ('ansi-z1.4', 'II', '4.0',       2,        8,    5,   0,  1),
  ('ansi-z1.4', 'II', '2.5',       9,       15,    5,   0,  1),
  ('ansi-z1.4', 'II', '4.0',       9,       15,    5,   0,  1),
  ('ansi-z1.4', 'II', '2.5',      16,       25,    5,   0,  1),
  ('ansi-z1.4', 'II', '4.0',      16,       25,    5,   0,  1),
  ('ansi-z1.4', 'II', '2.5',      26,       50,    8,   0,  1),
  ('ansi-z1.4', 'II', '4.0',      26,       50,    8,   1,  2),
  ('ansi-z1.4', 'II', '2.5',      51,       90,   13,   1,  2),
  ('ansi-z1.4', 'II', '4.0',      51,       90,   13,   1,  2),
  ('ansi-z1.4', 'II', '2.5',      91,      150,   20,   1,  2),
  ('ansi-z1.4', 'II', '4.0',      91,      150,   20,   2,  3),
  ('ansi-z1.4', 'II', '2.5',     151,      280,   32,   2,  3),
  ('ansi-z1.4', 'II', '4.0',     151,      280,   32,   3,  4),
  ('ansi-z1.4', 'II', '2.5',     281,      500,   50,   3,  4),
  ('ansi-z1.4', 'II', '4.0',     281,      500,   50,   5,  6),
  ('ansi-z1.4', 'II', '2.5',     501,     1200,   80,   5,  6),
  ('ansi-z1.4', 'II', '4.0',     501,     1200,   80,   7,  8),
  ('ansi-z1.4', 'II', '2.5',    1201,     3200,  125,   7,  8),
  ('ansi-z1.4', 'II', '4.0',    1201,     3200,  125,  10, 11),
  ('ansi-z1.4', 'II', '2.5',    3201,    10000,  200,  10, 11),
  ('ansi-z1.4', 'II', '4.0',    3201,    10000,  200,  14, 15),
  ('ansi-z1.4', 'II', '2.5',   10001,    35000,  315,  14, 15),
  ('ansi-z1.4', 'II', '4.0',   10001,    35000,  315,  21, 22),
  ('ansi-z1.4', 'II', '2.5',   35001,   150000,  500,  21, 22),
  ('ansi-z1.4', 'II', '4.0',   35001,   150000,  500,  21, 22),
  ('ansi-z1.4', 'II', '2.5',  150001,   500000,  800,  21, 22),
  ('ansi-z1.4', 'II', '4.0',  150001,   500000,  800,  21, 22),
  ('ansi-z1.4', 'II', '2.5',  500001, 99999999, 1250,  21, 22),
  ('ansi-z1.4', 'II', '4.0',  500001, 99999999, 1250,  21, 22)
ON CONFLICT ("standard", "inspection_level", "aql_level", "lot_from") DO NOTHING;
