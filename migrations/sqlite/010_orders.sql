-- 010_orders.sql — ADR-0141: entidad `order` MUTABLE (ticket abierto) → al cobrar produce 1..N
-- `sales_sale` INMUTABLES (split-bill). El `order` es la entidad canónica del pedido; sus líneas se
-- materializan TEMPRANO (filas reales, no un blob). `sales` es AGNÓSTICO de la mesa: la asociación
-- mesa↔pedido NO vive aquí — la OWNea `tables` en su junction `table_session.order_id`. Los importes
-- son PROVISIONALES (display en el TPV); la cuota fiscal HALF_UP + el desglose por tipo (ADR-0123/0085)
-- se congelan al COBRAR (complete_sale), no al abrir. hub_id lo auto-inyecta el runtime (contrato §2.5).
-- Tampoco lleva `customer_id`: el pedido NO sabe de clientes (una tienda de alimentación vende sin
-- cliente). Esa asociación la OWNea `customers` en su junction `customers_customer_order`.
CREATE TABLE IF NOT EXISTS sales_order (
    id                TEXT PRIMARY KEY,
    hub_id            TEXT NOT NULL,
    status            TEXT NOT NULL DEFAULT 'open',   -- open | completed | voided (ciclo de vida, ADR-0141)
    provisional_total INTEGER NOT NULL DEFAULT 0,     -- céntimos, recalculable (NO fiscal; shim → BIGINT en Postgres)
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
    gift_reason  TEXT NOT NULL DEFAULT '',
    line_total   INTEGER NOT NULL DEFAULT 0,       -- céntimos, provisional (display)
    -- Datos que el COBRO necesita y que no se pueden re-derivar tras recargar: la categoría fiscal
    -- es la AUTORIDAD del IVA en el servidor (ADR-0085) y el coste alimenta el arqueo de
    -- invitaciones. Sin esto, un pedido reanudado facturaría con el IVA equivocado.
    tax_category_key TEXT NOT NULL DEFAULT '',
    cost         INTEGER NOT NULL DEFAULT 0,       -- céntimos (coste unitario, para gift_total)
    is_deleted INTEGER NOT NULL DEFAULT 0, deleted_at TEXT,
    created_by TEXT, updated_by TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_order_item_order ON sales_order_item (hub_id, order_id);
