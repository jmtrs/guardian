-- Trazabilidad del cierre: que evento cerro el incidente (simetrico a
-- openedByEventSeq). Lo usa el cierre por recuperacion observada de energia
-- (power_lost ACKNOWLEDGED + evento posterior con source='vehicle').
ALTER TABLE "incidents" ADD COLUMN "closedByEventSeq" INTEGER;
