-- Etiqueta OPACA de la cuenta abierta («Mesa 4», «Ana — terraza», «15:07»). Es lo que hace
-- RECONOCIBLE un tiquet aparcado en la lista de cuentas abiertas: sin ella salían anónimos
-- (solo total+hora) y «desaparecían» a la vista. `sales` no la interpreta (ADR-0144): la
-- escribe quien la conoce (el POS con la mesa del slot, o el nombre que teclea el cajero).
ALTER TABLE sales_order ADD COLUMN label TEXT NOT NULL DEFAULT '';
