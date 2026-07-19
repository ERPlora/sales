-- 014 — ADR-0147: la cantidad es un valor decimal EXACTO en una unidad de medida, persistido como
-- punto fijo entero con escala GLOBAL de 10⁶ (0,5 kg = 500000). El entero es REPRESENTACIÓN, no
-- significado.
--
-- De dónde viene: `sale.completed` emitía `quantity` como f64 (`3.0`); `inventory` lee un entero
-- → 0 → `qty <= 0 → continue` → una venta NO descontaba stock, en silencio.
--
-- EL DINERO NO SE TOCA: `unit_price`, `net_amount`, `tax_amount`, `line_total` siguen siendo
-- céntimos enteros (ADR-0123). La precisión sub-céntimo va por la CANTIDAD DE PRECIO (KPEIN,
-- §2.3): «0,37 € por 100 ud», no decimales en el importe. La frontera fiscal no se roza.
--
-- Además la línea CONGELA su contexto de unidades (§2.4, opción A): el cálculo histórico nunca
-- relee el maestro. Si mañana las gambas pasan de `kg` a `ud`, una línea de ayer sigue siendo
-- 0,5 kg y se puede reimprimir, recalcular o anular. El factor va como fracción EXACTA num/den
-- (1 min = 1/60 h no tiene decimal finito). PROHIBIDO duplicar la cantidad en la misma entidad
-- (§2.5): nada de `quantity` + `quantity_base` — Business Central lo hace y necesitó un guardia
-- en runtime porque derivan.
--
-- ⚠️ En SQLite la afinidad REAL FUERZA a coma flotante cualquier entero que se le meta: un UPDATE
-- saldría como `500000.0` y quien pida un entero leería NULL. Como no hay `ALTER COLUMN ... TYPE`,
-- la única forma de cambiar la afinidad es RECONSTRUIR la tabla (RENAME → CREATE → INSERT SELECT →
-- DROP → índices). Mismo patrón que inventory/006_quantity_fixed_point.sql.

-- ── sales_sale_item: rebuild (quantity REAL → INTEGER 10⁶) + contexto congelado ─────────────
ALTER TABLE sales_sale_item RENAME TO sales_sale_item_old;

CREATE TABLE sales_sale_item (
    id               TEXT PRIMARY KEY,
    hub_id           TEXT NOT NULL,
    sale_id          TEXT NOT NULL,
    product_id       TEXT,
    product_name     TEXT NOT NULL,
    product_sku      TEXT NOT NULL DEFAULT '',
    is_service       INTEGER NOT NULL DEFAULT 0,
    quantity         INTEGER NOT NULL DEFAULT 1000000, -- punto fijo, escala 10⁶ (ADR-0147)
    unit_price       INTEGER NOT NULL DEFAULT 0,       -- céntimos; con KPEIN: por price_quantity_value
    discount_percent REAL NOT NULL DEFAULT 0,          -- tasa % (no es dinero ni cantidad)
    tax_rate         REAL NOT NULL DEFAULT 0,          -- tasa % (no es dinero ni cantidad)
    tax_class_name   TEXT NOT NULL DEFAULT '',
    net_amount       INTEGER NOT NULL DEFAULT 0,       -- céntimos
    tax_amount       INTEGER NOT NULL DEFAULT 0,       -- céntimos
    line_total       INTEGER NOT NULL DEFAULT 0,       -- céntimos
    modifiers        TEXT NOT NULL DEFAULT '{}',
    notes            TEXT NOT NULL DEFAULT '',
    created_at       TEXT,
    -- snapshot fiscal (006/ADR-0085)
    tax_category_key TEXT,
    tax_country_code TEXT,
    tax_region_code  TEXT,
    tax_rule_id      TEXT,
    -- invitación/regalo (007)
    is_gift          INTEGER NOT NULL DEFAULT 0,
    gift_reason      TEXT,
    -- ── contexto de unidades CONGELADO (ADR-0147 §2.4, opción A) ──
    unit_code            TEXT    NOT NULL DEFAULT 'ud',
    unit_name            TEXT    NOT NULL DEFAULT '',
    factor_num           INTEGER NOT NULL DEFAULT 1,        -- fracción EXACTA hacia la unidad base
    factor_den           INTEGER NOT NULL DEFAULT 1,
    increment_value      INTEGER NOT NULL DEFAULT 1000000,  -- escalón permitido, escala 10⁶
    price_quantity_value INTEGER NOT NULL DEFAULT 1000000,  -- KPEIN: unit_price es POR esta cantidad
    pricing_unit_code    TEXT    NOT NULL DEFAULT 'ud',
    pricing_unit_name    TEXT    NOT NULL DEFAULT '',
    pricing_factor_num   INTEGER NOT NULL DEFAULT 1,        -- unidad de línea → unidad de precio
    pricing_factor_den   INTEGER NOT NULL DEFAULT 1,
    FOREIGN KEY (sale_id) REFERENCES sales_sale (id) ON DELETE CASCADE
);

-- ROUND(q × 10⁶), no ROUND(q) × 10⁶: las líneas históricas pueden traer 0,5 del arreglo parcial
-- previo (as_qty sobre f64) y ese medio kilo vendido es un hecho fiscal que hay que conservar.
INSERT INTO sales_sale_item
    (id, hub_id, sale_id, product_id, product_name, product_sku, is_service, quantity,
     unit_price, discount_percent, tax_rate, tax_class_name, net_amount, tax_amount, line_total,
     modifiers, notes, created_at, tax_category_key, tax_country_code, tax_region_code,
     tax_rule_id, is_gift, gift_reason)
SELECT id, hub_id, sale_id, product_id, product_name, product_sku, is_service,
       CAST(ROUND(quantity * 1000000) AS INTEGER),
       unit_price, discount_percent, tax_rate, tax_class_name, net_amount, tax_amount, line_total,
       modifiers, notes, created_at, tax_category_key, tax_country_code, tax_region_code,
       tax_rule_id, is_gift, gift_reason
FROM sales_sale_item_old;

DROP TABLE sales_sale_item_old;
CREATE INDEX IF NOT EXISTS ix_sale_item_sale ON sales_sale_item (hub_id, sale_id);

-- ── sales_order_item: mismo rebuild ─────────────────────────────────────────────────────────
ALTER TABLE sales_order_item RENAME TO sales_order_item_old;

CREATE TABLE sales_order_item (
    id           TEXT PRIMARY KEY,
    hub_id       TEXT NOT NULL,
    order_id     TEXT NOT NULL,
    product_id   TEXT,
    product_name TEXT NOT NULL DEFAULT '',
    product_sku  TEXT NOT NULL DEFAULT '',
    quantity     INTEGER NOT NULL DEFAULT 1000000,  -- punto fijo, escala 10⁶ (ADR-0147)
    unit_price   INTEGER NOT NULL DEFAULT 0,        -- céntimos (bruto/display)
    is_gift      INTEGER NOT NULL DEFAULT 0,
    gift_reason  TEXT NOT NULL DEFAULT '',
    line_total   INTEGER NOT NULL DEFAULT 0,        -- céntimos, provisional (display)
    tax_category_key TEXT NOT NULL DEFAULT '',
    cost         INTEGER NOT NULL DEFAULT 0,        -- céntimos (coste unitario, para gift_total)
    is_deleted INTEGER NOT NULL DEFAULT 0, deleted_at TEXT,
    created_by TEXT, updated_by TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
    -- línea cobrada por QUÉ venta (012, split-bill)
    sale_id      TEXT,
    -- ── contexto de unidades CONGELADO (ADR-0147 §2.4, opción A) ──
    unit_code            TEXT    NOT NULL DEFAULT 'ud',
    unit_name            TEXT    NOT NULL DEFAULT '',
    factor_num           INTEGER NOT NULL DEFAULT 1,
    factor_den           INTEGER NOT NULL DEFAULT 1,
    increment_value      INTEGER NOT NULL DEFAULT 1000000,
    price_quantity_value INTEGER NOT NULL DEFAULT 1000000,
    pricing_unit_code    TEXT    NOT NULL DEFAULT 'ud',
    pricing_unit_name    TEXT    NOT NULL DEFAULT '',
    pricing_factor_num   INTEGER NOT NULL DEFAULT 1,
    pricing_factor_den   INTEGER NOT NULL DEFAULT 1
);

INSERT INTO sales_order_item
    (id, hub_id, order_id, product_id, product_name, product_sku, quantity, unit_price,
     is_gift, gift_reason, line_total, tax_category_key, cost,
     is_deleted, deleted_at, created_by, updated_by, created_at, updated_at, sale_id)
SELECT id, hub_id, order_id, product_id, product_name, product_sku,
       CAST(ROUND(quantity * 1000000) AS INTEGER),
       unit_price, is_gift, gift_reason, line_total, tax_category_key, cost,
       is_deleted, deleted_at, created_by, updated_by, created_at, updated_at, sale_id
FROM sales_order_item_old;

DROP TABLE sales_order_item_old;
CREATE INDEX IF NOT EXISTS ix_order_item_order ON sales_order_item (hub_id, order_id);
CREATE INDEX IF NOT EXISTS ix_order_item_sale  ON sales_order_item (hub_id, sale_id);
