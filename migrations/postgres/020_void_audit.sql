-- sales#26: anular es AUDITABLE. Quién, cuándo y por qué se anuló una venta pasan a ser campos
-- ESTRUCTURADOS de la cabecera, no una línea «[VOIDED] …» concatenada a `notes` (que era lo único
-- que quedaba, y que ni se podía filtrar ni se distinguía de una nota real del cajero).
--
-- El original NO se toca más allá de estos tres campos y del `status`: importes, líneas, desglose
-- y documento quedan inmutables (nadie en el mercado borra una venta pagada; se añade el reverso —
-- tabla de 8 referencias en la issue). El reverso de caja/stock lo escriben `cash_register` e
-- `inventory` al oír `sale.voided`, que desde sales#26 se emite UNA sola vez.
--
-- Aditiva y NULL por defecto: las ventas anuladas antes de esta migración conservan su rastro en
-- `notes` y no se reescriben.
ALTER TABLE sales_sale ADD COLUMN voided_at TEXT;
ALTER TABLE sales_sale ADD COLUMN voided_by TEXT;
ALTER TABLE sales_sale ADD COLUMN void_reason TEXT;
