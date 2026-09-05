#!/usr/bin/env python3
"""The free-text search box only searches columns you can READ on screen (ERPlora/sales#263).

Its sibling `filter_boxes_match_the_manifest.contract.test.py` guards the per-column filters.
This one guards the OTHER control of the same table — the «search anything» box — which lies in
a way no error message can reach.

WHY THIS EXISTS. The list engine composes the box as one OR of `LIKE '%q%'` over the columns the
manifest lists in `list.search`, and it compares the STORED value
(`hub/crates/runtime/src/queries.rs`):

    (CAST(sub.<col> AS TEXT) LIKE '%' || CAST(:search AS TEXT) || '%' OR …)

A cell, meanwhile, may not print the stored value. When it prints it through the module's i18n
catalogue, the two diverge by a whole language: the sales history stores the canonical seed name
`Cash` (ADR-0055, sales#108) and paints «Efectivo». Typing what is on screen then matches nothing
and the table comes back EMPTY, with no error — the runtime cannot help here, because nothing went
wrong: a LIKE that matches no row is a valid answer. The user reads that empty table as «there
were no cash sales today».

It is the third time this exact shape has been closed in this module, each time in a different
control: the picker (sales#181), its text fallback (sales#260), and the search box (sales#263).
That is what makes it a pattern worth a gate instead of a third patch.

THE RULE, and why each half.

  1. A searched column must be PAINTED by that table. The box is the only control with no label
     of its own: the user infers what it searches from the columns in front of them. A column
     that is searched but never shown makes hits appear for a word that is nowhere on the row.

  2. A searched column must NOT render through the catalogue. If the cell is `t(...)`-translated,
     the word on screen is by construction not the word in the database, so the ONLY term that
     makes that branch answer is one the user cannot see. Half-answering is worse than not
     offering the dimension: it turns «no results» into a statement the user believes.

  Reformatting (a date, an amount) is deliberately NOT forbidden here. It is a weaker problem —
  `created_at` and `total` are not searched, and widening this gate to every `format:` would fail
  `customer_name`, whose format only supplies an em dash for the empty case.

  What to do when it fires: take the column OUT of `list.search` and leave it to its picker — that
  is where Square, Shopify, WooCommerce, Odoo, Toast, Lightspeed, Business Central and Clover all
  put an enumerated dimension, and none of the eight offers it as free text (research in
  sales#263). The column keeps its filter and its sort; only the promise it could not keep goes.

SELF-CHECK. A gate that decides «nothing is translated here» by failing to recognise a translation
would pass this module in silence, which is the exact failure mode that let sales#263 live behind a
green suite. So the detector is proved on the way past: `TRANSLATED_TODAY` names the columns this
module really does paint through the catalogue, and if the detector stops seeing them, this file
fails instead of congratulating itself.

Usage: tests/search_box_finds_what_the_screen_shows.contract.test.py   (exit 0 = green)
  No Postgres, no Docker: it reads the manifest and the Web Components.
"""

import json
import pathlib
import re
import sys

MODULE_DIR = pathlib.Path(__file__).resolve().parent.parent
MANIFEST = json.loads((MODULE_DIR / "module.json").read_text(encoding="utf-8"))

#: How many list tables this module paints today (the sales history, the till's quick notes). The
#: floor is the check on the check: if the discovery stops finding them, a broken sweep would pass
#: by knowing nothing. Same number, same reason, as the filter-box gate next door.
TABLES_TODAY = 2

#: `(query, column)` for every column this module really DOES paint through the i18n catalogue.
#: This is the positive control: the detector below must still recognise each one. Both live in
#: the sales history — `status` («completed» → «Completada», hub#923) and `payment_method_name`
#: («Cash» → «Efectivo», sales#108). NEITHER may be searched; they are listed here so that
#: deleting the detector, or narrowing it until it sees nothing, turns this file RED instead of
#: green. Measured on the sibling gates (sales#261, tables#81, schedules#40): a guard whose
#: recogniser can be removed without a test dying is a guard that proves nothing.
TRANSLATED_TODAY = {("sales.list", "status"), ("sales.list", "payment_method_name")}

failures: list[str] = []


def fail(msg: str) -> None:
    failures.append(msg)


def balanced_slice(src: str, open_at: int) -> str:
    """The text from the brace at `open_at` to the one that closes it, brace-counted.

    Cutting on the next `key: '` (what a naive scan does) hands the LAST column of an array
    everything down to the end of the file — methods, templates and docstrings included (taxes#54).
    """
    depth = 0
    for i in range(open_at, len(src)):
        if src[i] == "{":
            depth += 1
        elif src[i] == "}":
            depth -= 1
            if depth == 0:
                return src[open_at : i + 1]
    return src[open_at:]


def column_getters(src: str) -> dict[str, str]:
    """`getter name -> its body`, for every `private get <name>(): DataTableColumn[]`."""
    return {
        m.group(1): balanced_slice(src, m.start(2))
        for m in re.finditer(
            r"get\s+(\w+)\s*\(\s*\)\s*:\s*DataTableColumn\[\]\s*(\{)", src
        )
    }


def tables(src: str) -> list[tuple[str, str]]:
    """`(query, columns getter)` for every `ok-data-table` the component paints.

    Both halves come from the element itself: `.rows=${this.<field>?.rows}` names the controller,
    and the controller was built with its query. One file with two tables therefore pairs each set
    of columns with ITS query.
    """
    controllers = dict(
        re.findall(
            r"this\.(\w+)\s*=\s*createListController[^(]*\(\s*erplora\(\)\s*,\s*'([^']+)'",
            src,
        )
    )
    found = []
    # Cut on the tag, not on `>`: the attributes carry arrow functions and generics
    # (`Record<string, unknown>) =>`), so `[^>]*` stops inside the first one and finds nothing.
    for element in re.split(r"<ok-data-table\b", src)[1:]:
        element = element.split("</ok-data-table>")[0]
        getter = re.search(r"\.columns=\$\{this\.(\w+)\}", element)
        field = re.search(r"\.rows=\$\{this\.(\w+)\??\.rows", element)
        if not getter or not field:
            continue
        query = controllers.get(field.group(1))
        if query is None:
            # A client-side table (no controller) sends no `search`: nothing to promise.
            continue
        found.append((query, getter.group(1)))
    return found


#: The catalogue translator as the components hold it: `const t = (k) => erplora().t(CATALOG, k)`.
#: A format that TRANSLATES either calls it (`t(KEY)`, the `status` column) or hands it to a helper
#: that will (`payMethodDisplayName({…}, t)`, the payment column) — so the token is what is looked
#: for, not the call. Anchored on word boundaries that exclude `.` and `$` so that `format`,
#: `.t(` on some other object, or a `t` inside an identifier are not mistaken for it. The one `.t(`
#: that IS a translation is the SDK's own, called directly (`erplora().t(CATALOG, key)`): a cell
#: may skip the local alias and reach the catalogue that way, so it is matched by name.
TRANSLATOR = re.compile(r"(?<![\w$.])t(?![\w$])|erplora\(\)\s*\.t(?![\w$])")


def painted_columns(body: str) -> dict[str, str]:
    """`column key -> the source of its column object`, for every column the getter returns."""
    out: dict[str, str] = {}
    for m in re.finditer(r"key: '([^']+)'", body):
        # The column object is the innermost `{` that is still open at this `key:`.
        start = body.rfind("{", 0, m.start())
        out[m.group(1)] = (
            balanced_slice(body, start) if start != -1 else body[m.start() :]
        )
    return out


def renders_through_catalogue(chunk: str) -> bool:
    """Does this column's `format:` put the row's value through the i18n catalogue?

    Only the `format:` part is read. A column can mention the translator for its own HEADER
    (`header: t('ui.colPayment')`) or for the LABELS of a picker without the CELL being
    translated, and a gate that read the whole object would call every column a translation and
    then have nothing left to say.
    """
    at = chunk.find("format:")
    return at != -1 and bool(TRANSLATOR.search(chunk[at:]))


#: What each rule says when it bites, in a word the self-test below can look for.
UNPAINTED = "never paints"
TRANSLATED = "through the i18n catalogue but"


def check(
    screen: pathlib.Path, query: str, columns: dict[str, str], spec=None, sink=None
) -> set[tuple[str, str]]:
    """Check one table's search box. Returns the `(query, column)` pairs found translated.

    `spec` and `sink` exist for `gate_bites()`: they let the two rules run against a table that is
    not in this module and report somewhere that is not the real failure list. Everything else
    passes neither and gets the manifest and the module-wide `failures`.
    """
    say = fail if sink is None else sink.append
    if spec is None:
        spec = (MANIFEST.get("queries") or {}).get(query)
    if spec is None:
        say(f"{screen} drives `{query}`, which the manifest does not declare")
        return set()
    block = spec.get("list") or {}
    if not block:
        say(f"`{query}` has no `list` block, but {screen} paginates it")
        return set()

    translated = {
        (query, col)
        for col, chunk in columns.items()
        if renders_through_catalogue(chunk)
    }

    for column in block.get("search") or []:
        if column not in columns:
            say(
                f"`{query}` searches `{column}`, which {screen} {UNPAINTED}: the search box is the "
                f"one control with no label of its own — the user reads what it searches off the "
                f"columns in front of them, so a hit on a column that is not there cannot be "
                f"explained. Paint it, or take it out of `list.search`"
            )
        elif (query, column) in translated:
            say(
                f"{screen} paints `{column}` {TRANSLATED} `{query}` searches it: "
                f"the engine compares the STORED value, so the only word that answers is the one "
                f"NOT on screen, and typing what is on screen empties the table without a word "
                f"(sales#263). Take `{column}` out of `list.search` and leave the dimension to its "
                f"picker, which is where every market reference puts it"
            )
    return translated


def gate_bites() -> list[str]:
    """Run both rules against a table built to break BOTH, and hand back what they said.

    `TRANSLATED_TODAY` proves the translation rule on this module's real code. The other rule — a
    searched column has to be PAINTED — has no positive here: every column `list.search` names is
    on screen, so deleting that branch leaves the gate green and nothing says a word. Measured
    while writing this file: with the branch replaced by `if False`, the suite stayed green.

    So the branch is exercised on a table that exists only for that purpose. `ghost` is searched
    and never painted; `shown` is painted through the catalogue and searched. Both must be caught,
    or the gate is not doing what its docstring claims.
    """
    sink: list[str] = []
    check(
        pathlib.Path("<self-test>"),
        "<self-test>",
        {
            "shown": "{ key: 'shown', header: t('ui.x'), format: (r) => t(String(r.shown)) }",
            "direct": "{ key: 'direct', header: t('ui.y'), "
            "format: (r) => erplora().t(CATALOG, String(r.direct)) }",
        },
        spec={"list": {"search": ["ghost", "shown", "direct"]}},
        sink=sink,
    )
    return sink


def main() -> int:
    # The check on the check, half one: both rules have to BITE on a table built to break them,
    # before this file is allowed to say anything about the real ones.
    bites = gate_bites()
    for rule, mark in (
        ("a searched column is not painted", UNPAINTED),
        ("a searched column is translated", TRANSLATED),
    ):
        if not any(mark in b for b in bites):
            print(
                f"FAIL: the rule «{rule}» did not fire on the self-test table, which breaks it on "
                f"purpose. The rule is gone or unreachable, and a gate that cannot say no would "
                f"pass every table below in silence."
            )
            return 1

    # Half two: the translation rule has to see BOTH ways a cell reaches the catalogue — the local
    # `t(...)` and the SDK's own `erplora().t(...)` called directly. Measured while reviewing
    # sales#264: with only the first, a column painted through `erplora().t(CATALOG, …)` and
    # searched passed this gate in silence.
    for column in ("shown", "direct"):
        if not any(TRANSLATED in b and f"`{column}`" in b for b in bites):
            print(
                f"FAIL: the rule «a searched column is translated» did not fire on `{column}` of the "
                f"self-test table, which is painted through the catalogue on purpose. The detector "
                f"no longer sees that way of translating a cell, so a real table using it would "
                f"pass in silence."
            )
            return 1

    seen: list[tuple[pathlib.Path, str, str]] = []
    translated: set[tuple[str, str]] = set()
    searched_columns = 0

    for path in sorted((MODULE_DIR / "ui/components").rglob("*.ts")):
        if path.name.endswith(".test.ts"):
            continue
        src = path.read_text(encoding="utf-8")
        getters = column_getters(src)
        for query, getter in tables(src):
            body = getters.get(getter)
            if body is None:
                fail(
                    f"{path.relative_to(MODULE_DIR)} paints `{query}` with `this.{getter}`, which is "
                    f"not a `DataTableColumn[]` getter of this component: the gate cannot read that "
                    f"table's columns"
                )
                continue
            rel = path.relative_to(MODULE_DIR)
            seen.append((rel, query, getter))
            searched_columns += len(
                ((MANIFEST.get("queries") or {}).get(query) or {})
                .get("list", {})
                .get("search")
                or []
            )
            translated |= check(rel, query, painted_columns(body))

    if len(seen) < TABLES_TODAY:
        print(
            f"FAIL: only {len(seen)} list table(s) discovered; this module paints at least "
            f"{TABLES_TODAY} (the sales history, the till's quick notes). The discovery is broken, "
            "and a broken sweep passes."
        )
        return 1

    if not searched_columns:
        print(
            "FAIL: no `list.search` column was read at all. Every table this module paints offers "
            "the search box, so reading zero means the manifest lookup is broken, not that the "
            "boxes are honest."
        )
        return 1

    # The check on the check: the detector must still recognise the translations this module is
    # KNOWN to paint. Without this, deleting `renders_through_catalogue` leaves the gate green.
    missed = TRANSLATED_TODAY - translated
    if missed:
        print(
            f"FAIL: the translation detector no longer recognises "
            f"{', '.join(f'`{q}`.`{c}`' for q, c in sorted(missed))}, which this module does paint "
            f"through the catalogue. A gate that cannot see a translation would pass a search box "
            f"built on one — fix the detector, or, if the cell really stopped being translated, "
            f"update `TRANSLATED_TODAY` in the same change that stopped it."
        )
        return 1
    for stale in sorted(translated - TRANSLATED_TODAY):
        # Not a failure: a NEW translated column is fine, and it is already forbidden from
        # `list.search` above. It is reported so the positive control keeps up with the module.
        print(f"note: `{stale[0]}`.`{stale[1]}` now renders through the catalogue too")

    if failures:
        print(f"FAIL ({len(failures)}):")
        for f in failures:
            print(f"  - {f}")
        return 1

    covered = ", ".join(sorted({q for _, q, _ in seen}))
    print(
        f"OK: every column the search box of {len(seen)} table(s) searches is painted, and painted "
        f"verbatim ({covered}); {len(translated)} translated column(s) correctly stay out of it"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
