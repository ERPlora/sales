-- Sales · 007 — INVITACIÓN/REGALO (comp): una línea puede marcarse como cortesía (is_gift), que NO
-- se cobra (net/tax/total = 0) pero descuenta stock; `gift_reason` da el motivo. La cabecera suma
-- `gift_total` (coste de las invitaciones) para el arqueo (decisión humano: a coste, aparte). Aditiva.
ALTER TABLE sales_sale_item ADD COLUMN is_gift     INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sales_sale_item ADD COLUMN gift_reason TEXT;
ALTER TABLE sales_sale ADD COLUMN gift_total INTEGER NOT NULL DEFAULT 0;
