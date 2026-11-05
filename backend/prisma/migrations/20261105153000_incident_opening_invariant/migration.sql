-- Absence opens signal_lost; every other incident must point at the event that
-- opened it. listPositions relies on this discriminator to choose its clock.
ALTER TABLE "incidents"
ADD CONSTRAINT "incidents_opening_source_matches_kind"
CHECK (
  (
    "kind" = 'signal_lost'
    AND "openedByEventSeq" IS NULL
  )
  OR (
    "kind" <> 'signal_lost'
    AND "openedByEventSeq" IS NOT NULL
  )
);
