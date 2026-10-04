#!/usr/bin/env python3
"""Anular una venta YA DEVUELTA en parte (sales#247), contra un Postgres 18 REAL.

Por qué una batería SQL además de los tests del handler. El handler decide la POLÍTICA —lee las
devoluciones de la venta y rechaza con `sales.sale_already_refunded`—, y eso ya está pinchado en
`handler/src/lib.rs`. Pero entre esa decisión y el UPDATE hay una ventana: el handler mira, y el
SQL escribe después. Si una devolución aterriza EN MEDIO (el cajero devuelve desde otra tablet
mientras el encargado anula), la decisión ya se tomó sobre un estado que dejó de ser verdad y la
venta se anularía igual — con dinero ya devuelto por detrás. Esa carrera solo la puede cerrar el
propio `WHERE`, que es atómico, y un `WHERE` solo se prueba contra un motor de verdad.

O sea: son dos guardias del mismo portón y ninguno sustituye al otro.

  * el HANDLER da el rechazo TRADUCIDO que el cajero lee (`sales.sale_already_refunded`);
  * el `WHERE` de `sales._void_sale` es el cinturón que no puede perder la carrera.

Lo que está bajo prueba:

  1. LA CADENA DE LA ISSUE. Venta de 100 € → devolución de 30 € → `sales._void_sale` NO anula: la
     venta sigue `completed`, con sus importes intactos y sin marca de anulación. Y devolver el
     resto (70 €) sí funciona, que es la salida que el mercado deja abierta (Square, Lightspeed,
     Dynamics 365 BC: la puerta que queda es el refund, no el void).

  2. EL CONTROL POSITIVO. La MISMA llamada sobre una venta sin devoluciones SÍ anula. Sin este
     punto, un `WHERE` que no casara nunca —un `NOT EXISTS` mal escrito, una tabla mal nombrada—
     saldría verde por el lado equivocado: «no se anuló» es exactamente lo que el punto 1 pide.

  3. TENANCY. La devolución del hub VECINO, sobre una venta con el MISMO id, no puede cerrarle la
     puerta a este hub. Un `NOT EXISTS` sin `hub_id` bloquearía anulaciones legítimas del vecino
     de al lado, y eso no se ve sin sembrar al vecino VIVO.

Contrato de dinero: ADR-0123 (céntimos enteros). Nada se divide aquí.

Uso: tests/void_after_refund.postgres.test.py
  Usa el contenedor `erplora-test-pg-5433` por defecto (override: SALES_TEST_PG_CONTAINER; el
  toolkit lo fija por job de CI). Crea una base de datos de usar y tirar y la BORRA al final, pase
  o falle. NUNCA se salta a sí mismo: sin Postgres muere ruidosamente.
"""

import os
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))

import pg_harness
from pg_harness import Session, sale_header_params

HUB = "hub-test"
OTHER_HUB = "hub-neighbour"
USER = "u-manager"
NOW = "2026-09-02T11:00:00+00:00"

SALE = "sale-100"
CLEAN_SALE = "sale-clean"
CHARGED = 10_000  # 100,00 €, cobrados en efectivo de una sola pata
FIRST_REFUND = 3_000  # 30,00 € que ya volvieron
REST = CHARGED - FIRST_REFUND  # 70,00 € — «devolver el resto»


# ── Siembra, siempre por la puerta del manifest ──────────────────────────────────────────
#
# Nada se inserta con SQL a mano: si un comando dejara de bindear un parámetro, sembrar por debajo
# lo escondería justo en el sitio donde nadie va a mirar.


def seed_cash_method(s: Session, hub: str = None) -> None:
    # El id del método lleva el hub: el catálogo es por hub y `sales_payment_method.id` es la PK
    # de toda la tabla, así que sembrar el vecino con el mismo id chocaría contra la clave y no
    # contra ninguna regla de negocio.
    s.command_ok(
        f"el catálogo tiene el efectivo ({hub or s.hub})",
        "sales.create_payment_method",
        {
            "new_id": cash_method(hub or s.hub),
            "name": "Efectivo",
            "type": "cash",
            "sort_order": 0,
        },
        hub=hub,
    )


def cash_method(hub: str) -> str:
    return f"pm-cash-{hub}"


def seed_charged_sale(s: Session, sale_id: str, hub: str = None) -> None:
    """Una venta cerrada de 100 €, cobrada entera en efectivo por UNA pata."""
    # El número fiscal sale del contador del día: sin esta puerta `sale_number` nace NULL y la
    # cabecera ni siquiera entra. Es la misma secuencia que corre el handler en producción.
    s.command_ok(
        f"el contador del día ({sale_id})",
        "sales._bump_counter",
        {"day": "20260902", "new_id": f"cnt-{hub or s.hub}-20260902"},
        hub=hub,
    )
    s.command_ok(
        f"venta {sale_id} cobrada",
        "sales._insert_sale",
        sale_header_params(
            sale_id=sale_id,
            day="20260902",
            subtotal=CHARGED,
            total=CHARGED,
            amount_tendered=CHARGED,
            payment_method_id=cash_method(hub or s.hub),
            payment_method_name="Efectivo",
            idempotency_key=f"idem-{hub or s.hub}-{sale_id}",
        ),
        hub=hub,
    )
    s.command_ok(
        f"su pata de cobro ({sale_id})",
        "sales._insert_payment",
        {
            "payment_id": f"pay-{sale_id}",
            "sale_id": sale_id,
            "sort_order": 0,
            "payment_method_id": cash_method(hub or s.hub),
            "payment_method_name": "Efectivo",
            "payment_method_type": "cash",
            "amount": CHARGED,
            "amount_tendered": CHARGED,
            "change_due": 0,
            "reference": "",
        },
        hub=hub,
    )


def refund(
    s: Session, refund_id: str, sale_id: str, amount: int, hub: str = None
) -> None:
    """El documento de devolución y su pata — las dos puertas que emite `sales.refund`."""
    s.command_ok(
        f"devolución {refund_id} de {amount} céntimos",
        "sales._insert_refund",
        {
            "refund_id": refund_id,
            "sale_id": sale_id,
            "total": amount,
            "reason": "el cliente devuelve una parte",
            "note": "",
            "idempotency_key": refund_id,
        },
        hub=hub,
    )
    s.command_ok(
        f"su pata ({refund_id})",
        "sales._insert_refund_payment",
        {
            "refund_payment_id": f"{refund_id}-leg",
            "refund_id": refund_id,
            "sale_id": sale_id,
            "payment_id": f"pay-{sale_id}",
            "payment_method_id": cash_method(hub or s.hub),
            "payment_method_name": "Efectivo",
            "payment_method_type": "cash",
            "amount": amount,
            "sort_order": 0,
        },
        hub=hub,
    )


def void(s: Session, sale_id: str, hub: str = None) -> None:
    """`sales._void_sale` tal cual lo emite el handler. Se le pide SIEMPRE, aunque no deba pasar:
    lo que se mide es si la fila cambió, no si el comando dio error."""
    s.command_ok(
        f"se pide anular {sale_id}",
        "sales._void_sale",
        {
            "sale_id": sale_id,
            "void_reason": "el encargado se equivoca de venta",
            "voided_by": USER,
        },
        hub=hub,
    )


def status_of(s: Session, sale_id: str, hub: str = HUB) -> str:
    return s.q(
        f"SELECT status FROM sales_sale WHERE id = '{sale_id}' AND hub_id = '{hub}'"
    )


# ── 1 · la cadena de la issue ────────────────────────────────────────────────────────────


def step_1_a_partially_refunded_sale_does_not_void(s: Session) -> None:
    print("\n1 · venta 100 € → devolución 30 € → anular NO anula")
    seed_cash_method(s)
    seed_charged_sale(s, SALE)
    s.check("la venta nace cerrada", status_of(s, SALE), "completed")

    refund(s, "ref-1", SALE, FIRST_REFUND)
    # 🔴 La venta sigue `completed` a propósito: `_mark_refunded` solo marca cuando vuelve el
    # ÚLTIMO céntimo. Ese es justo el hueco por el que se colaba el void (sales#247).
    s.check("una devolución PARCIAL la deja cerrada", status_of(s, SALE), "completed")

    void(s, SALE)
    s.check("y aun así NO se anula", status_of(s, SALE), "completed")
    s.check(
        "no se escribe rastro de anulación",
        s.q(
            f"SELECT COALESCE(voided_at, '') FROM sales_sale WHERE id = '{SALE}' AND hub_id = '{HUB}'"
        ),
        "",
    )
    s.check(
        "ni el motivo",
        s.q(
            f"SELECT COALESCE(void_reason, '') FROM sales_sale WHERE id = '{SALE}' AND hub_id = '{HUB}'"
        ),
        "",
    )
    s.check(
        "el importe de la venta queda intacto",
        s.qi(f"SELECT total FROM sales_sale WHERE id = '{SALE}' AND hub_id = '{HUB}'"),
        CHARGED,
    )

    # Y el historial lo CUENTA: `refunded_total` es lo que la fila necesita para apagar su botón
    # de anular. Si esta columna dejara de salir, la pantalla volvería a ofrecer la anulación y
    # solo el handler pararía el golpe — con el cajero descubriéndolo tras pulsar.
    listed = {row["id"]: row for row in s.query("sales.list", {})}
    s.check("la venta sale en el historial", SALE in listed, True)
    s.check(
        "y lleva lo ya devuelto",
        listed.get(SALE, {}).get("refunded_total"),
        FIRST_REFUND,
    )
    s.check(
        "sin duplicar la fila por tener devoluciones",
        len([r for r in s.query("sales.list", {}) if r["id"] == SALE]),
        1,
    )


def step_2_returning_the_rest_is_the_door_that_stays_open(s: Session) -> None:
    print(
        "\n2 · «devolver el resto» (70 €) sí funciona — es la salida que deja el mercado"
    )
    options = s.query("sales.refund_options", {"sale_id": SALE})
    s.check("queda una pata", len(options), 1)
    s.check("con 70,00 € vivos", s.field(options, "remaining"), REST)
    s.check("y devolvible por su propia puerta", s.field(options, "refundable"), 1)

    refund(s, "ref-2", SALE, REST)
    s.command_ok(
        "y con el último céntimo la venta se marca devuelta",
        "sales._mark_refunded",
        {"sale_id": SALE},
    )
    s.check("estado final", status_of(s, SALE), "refunded")
    # Con DOS documentos contra la misma venta, el historial sigue dando UNA fila y la suma de las
    # dos: es lo que separa una subconsulta agrupada de un JOIN directo, que aquí multiplicaría.
    rows = [r for r in s.query("sales.list", {}) if r["id"] == SALE]
    s.check("dos devoluciones, una sola fila en el historial", len(rows), 1)
    s.check("con las dos sumadas", rows[0]["refunded_total"] if rows else None, CHARGED)
    s.check(
        "ya no queda nada que devolver",
        s.field(s.query("sales.refund_options", {"sale_id": SALE}), "remaining"),
        0,
    )


# ── 2 · el control positivo ──────────────────────────────────────────────────────────────


def step_3_a_clean_sale_still_voids(s: Session) -> None:
    print(
        "\n3 · CONTROL POSITIVO — la misma llamada sobre una venta sin devoluciones SÍ anula"
    )
    # Sin este punto la batería entera saldría verde con un `WHERE` que no case nunca: «no se
    # anuló» es lo que pide el punto 1, así que hay que probar que la puerta sigue abriéndose.
    seed_charged_sale(s, CLEAN_SALE)
    s.check("nace cerrada", status_of(s, CLEAN_SALE), "completed")
    void(s, CLEAN_SALE)
    s.check("y se anula sin estorbo", status_of(s, CLEAN_SALE), "voided")
    s.check(
        "con su auditoría",
        s.q(
            f"SELECT void_reason FROM sales_sale WHERE id = '{CLEAN_SALE}' AND hub_id = '{HUB}'"
        ),
        "el encargado se equivoca de venta",
    )


# ── 3 · tenancy ──────────────────────────────────────────────────────────────────────────


def step_4_the_neighbours_refund_does_not_close_my_door(s: Session) -> None:
    print(
        "\n4 · TENANCY — una devolución del hub VECINO no cierra la puerta de este hub"
    )
    # Cómo se monta el positivo, que es lo que da valor al punto. `sales_sale.id` es PK de toda la
    # tabla, así que dos hubs no pueden compartir el id de una venta y «la misma venta en dos
    # hubs» no es un escenario alcanzable. Lo que SÍ lo es —y es el agujero de verdad— es una
    # FILA HIJA del hub de al lado apuntando a MI venta: `sales_sale_refund` referencia
    # `sales_sale(id)` a secas, sin el `hub_id` en la FK, de modo que el vecino puede escribir un
    # documento de devolución sobre un id que no es suyo.
    #
    # Si el `NOT EXISTS` de `_void_sale` se olvidara del `hub_id`, esa fila ajena bloquearía mi
    # anulación — y este punto se pondría rojo. Con el `hub_id` puesto, ni la ve.
    mine = "sale-mine"
    seed_cash_method(s, hub=OTHER_HUB)
    seed_charged_sale(s, mine)
    s.check("mi venta nace cerrada y SIN devoluciones", status_of(s, mine), "completed")
    s.check(
        "yo no veo ninguna devolución suya",
        len(s.query("sales.refunds", {"sale_id": mine})),
        0,
    )

    # sales#506: the refund door itself no longer writes that row — its head only lands on a sale
    # of ITS hub that is still `completed` — so the adversarial row is planted by hand, and the
    # door's refusal is asserted first.
    s.command(
        "sales._insert_refund",
        {
            "refund_id": "ref-vecino-door",
            "sale_id": mine,
            "total": FIRST_REFUND,
            "reason": "neighbour",
            "note": "",
            "idempotency_key": "ref-vecino-door",
        },
        hub=OTHER_HUB,
    )
    s.check(
        "the neighbour's refund door writes nothing on a sale of this hub",
        s.qi(f"SELECT count(*) FROM sales_sale_refund WHERE id = 'ref-vecino-door'"),
        0,
    )
    s.psql(
        [
            "-c",
            "INSERT INTO sales_sale_refund (id, hub_id, sale_id, total, reason, note,"
            " idempotency_key, is_deleted, created_at, updated_at) VALUES"
            f" ('ref-vecino', '{OTHER_HUB}', '{mine}', {FIRST_REFUND}, 'neighbour', '',"
            f" 'ref-vecino', 0, '{NOW}', '{NOW}')",
        ]
    )
    s.check(
        "el vecino SÍ ha escrito una devolución contra ese id",
        s.qi(
            f"SELECT count(*) FROM sales_sale_refund WHERE sale_id = '{mine}' AND hub_id = '{OTHER_HUB}'"
        ),
        1,
    )
    s.check(
        "y sigue sin asomar por mi puerta",
        len(s.query("sales.refunds", {"sale_id": mine})),
        0,
    )

    void(s, mine)
    s.check("mi anulación entra igual", status_of(s, mine), "voided")


# ── Runner ───────────────────────────────────────────────────────────────────────────────


def main() -> int:
    print(
        f"→ sales#247 · anular una venta ya devuelta en parte ({pg_harness.CONTAINER})"
    )
    s = Session(
        f"sales_void_after_refund_test_{os.getpid()}", hub=HUB, user=USER, now=NOW
    )
    try:
        s.create()
    except RuntimeError as exc:
        print(f"✗ cannot reach Postgres: {exc}")
        return 1
    try:
        step_1_a_partially_refunded_sale_does_not_void(s)
        step_2_returning_the_rest_is_the_door_that_stays_open(s)
        step_3_a_clean_sale_still_voids(s)
        step_4_the_neighbours_refund_does_not_close_my_door(s)
    finally:
        s.drop()

    return s.report(
        "con dinero ya devuelto la anulación no entra, devolver el resto sí, una venta limpia se "
        "sigue anulando y la devolución del vecino no cierra la puerta de nadie (sales#247)"
    )


if __name__ == "__main__":
    sys.exit(main())
