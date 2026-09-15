-- One row per import source: how far it got, and when it last ran.
--
-- Step 3 of the data-strategy plan. Nothing reads this yet — no import here
-- is incremental, so there is nothing to resume from a bookmark — but every
-- incremental import below this step is impossible without somewhere to
-- record where the last run stopped, and this is also what turns "the
-- nightly job silently stopped running" from invisible into a query: compare
-- `last_run_at` against how often the job is supposed to run.
--
-- `watermark` is deliberately `text`, not a timestamp or an integer. The
-- sources this will eventually cover disagree on what "how far we got"
-- means: Open Beauty Facts exposes `last_modified_t`, a Unix epoch on every
-- product; the Korean MFDS register publishes dated file releases with
-- nothing to page through; DailyMed offers daily/weekly update packages.
-- Picking one column type now would fit the first source and fight the
-- other two. Each importer writes and parses its own format; this table
-- only promises to keep whatever string it was given.
--
-- One row per source rather than a run-by-run log, matching how the plan
-- itself describes this: "the watermark reached last time", singular. A
-- history of every run is a different table for a different question.

create table sync_bookmarks (
  source      text primary key,
  watermark   text,
  last_run_at timestamptz not null default now()
);

-- Service-role only. This is operator infrastructure — which import last ran
-- and how far it got — not catalogue data, and has no reason to be reachable
-- by anon or authenticated at all: unlike every table before it, there is no
-- "catalogue is publicly readable" policy here on purpose.
alter table sync_bookmarks enable row level security;

revoke all on sync_bookmarks from public, anon, authenticated;
grant all on sync_bookmarks to service_role;
