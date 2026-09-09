-- Sales · el profesional se atribuye POR LÍNEA, no solo por ticket (sales#273).
--
-- La 005 puso `staff_id` en la CABECERA, que es suficiente en un bar y falso en una peluquería:
-- Ana corta, Marta tiñe y la clienta paga UNA vez, así que el ticket entero caía sobre una de las
-- dos y el cierre por profesional no podía cuadrar.
--
-- Columna ADITIVA y NULLable a propósito: cada línea escrita antes de esta migración se queda con
-- NULL y `sales.by_staff` la atribuye a la cabecera (`COALESCE`), de modo que el cierre de ayer
-- sigue diciendo lo que decía ayer. Referencia OPACA a `staff.*` (TEXT, sin FK cross-módulo,
-- ADR-0007): `sales` nunca hace JOIN contra `staff_member`.
ALTER TABLE sales_sale_item ADD COLUMN staff_id TEXT;

CREATE INDEX IF NOT EXISTS ix_sale_item_hub_staff ON sales_sale_item (hub_id, staff_id);
