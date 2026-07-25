-- ADR-0146 — fuera las dos entidades que duplicaban «cuenta sin cobrar».
--
-- Había TRES formas de decir lo mismo: el pedido (`sales_order`), el ticket aparcado y el carrito
-- activo. Son la misma cosa, y mantener tres obligaba a sincronizarlas:
--
--   · `sales_parked_ticket` — aparcar ya no copia nada: el pedido se queda abierto y la mesa la
--     suelta su dueño (`tables.sessions.park`). La lista de «aparcados» es la de cuentas abiertas.
--   · `sales_active_cart`  — un blob JSON con debounce de 400 ms; un corte de luz se llevaba el
--     último artículo. Lo reemplazan las filas reales de `sales_order_item`, escritas al instante.
--     Lo único que guardaba y no estaba en el pedido —«qué cuenta miraba este terminal»— es estado
--     del DISPOSITIVO y vive ahí, no en la BD.
--
-- ⚠ DESTRUCTIVA. Se acepta porque el producto está PRE-LANZAMIENTO, sin clientes: es la única
-- ventana en la que corregir el modelo sale gratis.
DROP TABLE IF EXISTS sales_parked_ticket;
DROP TABLE IF EXISTS sales_active_cart;

-- Y el ajuste que elegía entre dos pantallas de venta: se retiró la de escritorio (se había quedado
-- sin pedidos, sin cocina y sin split, y era lo único atado al carrito-blob), así que ya no hay
-- nada que elegir.
ALTER TABLE sales_settings DROP COLUMN IF EXISTS pos_layout;
