# Módulo `sales` — TPV y ventas

Núcleo transaccional del punto de venta. Es dueño de **dos** cosas: las **cuentas abiertas**
(`order`, mutables, con sus líneas) y las **ventas** (`sale`, inmutables) que nacen al cobrar.
Decide el dinero —totales de línea, descuentos, IVA, cambio, numeración— y emite `sale.completed`,
el evento canónico de cierre de venta del producto.

> **Module id:** `sales`. **Depende de:** `inventory`, `taxes` (instalar sales los auto-instala).
> Módulo híbrido: SQL + handler WASM (`complete_sale`, `open_order`, `fire_order`).

## Documentación de usuario — [`docs/`](docs/)

Viaja **dentro** del módulo y se versiona con él: el asistente del hub (ADR-0282) la indexa por
versión instalada y cita la de TU versión, no la de la última publicada. En inglés (idioma fuente).

| Fichero | Para qué |
| ------- | -------- |
| [`docs/overview.md`](docs/overview.md) | Qué hace y qué NO hace; qué módulos componen el TPV por slots |
| [`docs/screens.md`](docs/screens.md) | «Vender» y «Sales» paso a paso: cobrar, aparcar, disparar a cocina, dividir, cobro parcial |
| [`docs/concepts.md`](docs/concepts.md) | `order` mutable vs `sale` INMUTABLE, anular vs rectificar, autoridad del servidor sobre el precio, idempotencia del cobro |
| [`docs/limits.md`](docs/limits.md) | Los 13 errores de dominio reales, permisos por acción y qué se rompe sin cada módulo |

## Qué expone hoy

| Tipo | Nombre | Permiso |
| ---- | ------ | ------- |
| query | `sales.list` / `.get` / `.lines` | `sales.view_sale` |
| query | `sales.orders.list` / `sales.order.get` / `sales.order.lines` | `sales.view_sale` |
| query | `sales.stats` / `.today` / `.last_7_days` / `.by_staff` | `sales.view_reports` |
| query | `sales.payment_methods` | `sales.view_paymentmethod` |
| command | `sales.complete_sale` (WASM) | `sales.take_payment` |
| command | `sales.order.open` / `.fire` (WASM) | `sales.add_sale` |
| command | `sales.order.add_line` / `.update_line` / `.remove_line` / `.split` / `.merge` / `.set_label` | `sales.add_sale` |
| command | `sales.void` / `sales.order.void` | `sales.void_sale` |
| emite | `sale.completed`, `sale.voided`, `order.fired`, `sales.sale.created_from_appointment` | — |
| escucha | — (sales no reacciona a otros módulos) | — |

Navegación: `erp-pos` (pantalla completa) y `erp-sales-list`; ajustes declarativos (ADR-0082).

## Layout

```text
module.json                   # manifest (contrato técnico)
migrations/postgres/          # esquema §2.5 (hub_id + soft-delete + auditoría)
queries/*.sql                 # lecturas declarativas (:hub_id inyectado)
commands/*.sql                # escrituras declarativas (las `_` son intenciones del WASM)
schemas/*.json                # JSON Schemas de input (draft 2020-12)
handler/                      # WASM Tier 2 → dist/handler.wasm
ui/                           # Web Components (Lit/Ionic/OutfitKit)
docs/                         # documentación de usuario + corpus del asistente
```

## Estado y trabajo abierto

El estado vive en las **Issues de este repo**, no aquí.

Doc de arquitectura: `architecture/modules/sales.md` (cargarlo antes de tocar el módulo).
