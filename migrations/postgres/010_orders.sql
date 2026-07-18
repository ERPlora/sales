-- 010_orders.sql — ADR-0141: entidad `order` MUTABLE (ticket abierto) → al cobrar produce 1..N
-- `sales_sale` INMUTABLES (split-bill). El `order` es la entidad canónica del pedido; sus líneas se
-- materializan TEMPRANO (filas reales, no un blob). `sales` es AGNÓSTICO de la mesa: la asociación
-- mesa↔pedido NO vive aquí — la OWNea `tables` en su junction `table_session.order_id`. Los importes
-- son PROVISIONALES (display en el TPV); la cuota fiscal HALF_UP + el desglose por tipo (ADR-0123/0085)
-- se congelan al COBRAR (complete_sale), no al abrir. hub_id lo auto-inyecta el runtime (contrato §2.5).
-- INTEGER (céntimos) → BIGINT en Postgres vía el shim de portabilidad (ADR-0007), como en sales_sale.
CREATE TABLE IF NOT EXISTS sales_order (
    id                TEXT PRIMARY KEY,
    hub_id            TEXT NOT NULL,
    status            TEXT NOT NULL DEFAULT 'open',   -- open | completed | voided (ciclo de vida, ADR-0141)
    provisional_total INTEGER NOT NULL DEFAULT 0,     -- céntimos, recalculable (NO fiscal)
    customer_id       TEXT,                            -- asociación cliente (el snapshot fiscal se congela en la venta)
    notes             TEXT NOT NULL DEFAULT '',
    source_module     TEXT NOT NULL DEFAULT 'pos',
    is_deleted INTEGER NOT NULL DEFAULT 0, deleted_at TEXT,
    created_by TEXT, updated_by TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_order_hub_status  ON sales_order (hub_id, status);
CREATE INDEX IF NOT EXISTS ix_order_hub_created ON sales_order (hub_id, created_at);

-- Línea del pedido (hija de sales_order). Materialización temprana: una fila real por artículo.
CREATE TABLE IF NOT EXISTS sales_order_item (
    id           TEXT PRIMARY KEY,
    hub_id       TEXT NOT NULL,
    order_id     TEXT NOT NULL,
    product_id   TEXT,
    product_name TEXT NOT NULL DEFAULT '',
    product_sku  TEXT NOT NULL DEFAULT '',
    quantity     REAL NOT NULL DEFAULT 1,          -- cantidad fraccionable
    unit_price   INTEGER NOT NULL DEFAULT 0,       -- céntimos (bruto/display)
    is_gift      INTEGER NOT NULL DEFAULT 0,
    line_total   INTEGER NOT NULL DEFAULT 0,       -- céntimos, provisional (display)
    is_deleted INTEGER NOT NULL DEFAULT 0, deleted_at TEXT,
    created_by TEXT, updated_by TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_order_item_order ON sales_order_item (hub_id, order_id);
