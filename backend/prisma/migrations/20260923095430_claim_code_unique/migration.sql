-- Codigo de claim unico entre dispositivos activos (Postgres admite varios NULL:
-- los codigos ya quemados no chocan). Sustituye al indice no-unico anterior.
DROP INDEX "devices_claimCodeHash_idx";
CREATE UNIQUE INDEX "devices_claimCodeHash_key" ON "devices"("claimCodeHash");
