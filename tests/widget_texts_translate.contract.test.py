#!/usr/bin/env python3
"""Every text a home-screen panel of this module shows speaks the language of the UI (sales#473).

With the hub in English, the «Sales, last 7 days» panel drew the legend of its chart as «Ventas»,
and the panel picker grouped the four sales panels under «Ventas»: the manifest declared
`"category": "Ventas"` and `"options": { "seriesName": "Ventas" }` as Spanish literals, while the
title and the caption were canonical English translated through `locales/es.json`.

The dashboard shell (`hub/apps/web/src/lib/dashboard-widgets.ts`) translates a panel from the
module's locale file for the active language: `widgets.<id>.title`, `.label` (`options.label`),
`.seriesName` (`options.seriesName`, the chart legend) and `.category` (the picker group). What is
not in the locale file stays as the manifest wrote it, so the manifest has to be the English source.

What this file pins, for every widget of `module.json`:
  1. `title`, `category`, `options.label` and `options.seriesName`, whenever declared, have their
     Spanish entry in `locales/es.json` under `widgets.<id>`;
  2. the manifest does not carry the Spanish text itself: where the Spanish entry differs from
     English at all, the manifest must not equal it (a Spanish literal in the source leaks into
     every other language);
  3. and positive controls: a run that checked no category or no chart legend FAILS — a guard
     that compared nothing would pass for the wrong reason.

Usage: tests/widget_texts_translate.contract.test.py   (exit 0 = green)
"""

import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
widgets = (
    json.loads((ROOT / "module.json").read_text(encoding="utf-8")).get("widgets") or {}
)
es = (
    json.loads((ROOT / "locales" / "es.json").read_text(encoding="utf-8")).get(
        "widgets"
    )
    or {}
)

errors = []
checked = {"title": 0, "category": 0, "label": 0, "seriesName": 0}
for wid, w in sorted(widgets.items()):
    opts = w.get("options") or {}
    source = {
        "title": w.get("title"),
        "category": w.get("category"),
        "label": opts.get("label"),
        "seriesName": opts.get("seriesName"),
    }
    tr = es.get(wid) or {}
    for key, text in source.items():
        if text is None:
            continue
        checked[key] += 1
        spanish = tr.get(key)
        if not spanish:
            errors.append(
                f"{wid}: {key} {text!r} has no Spanish entry in locales/es.json widgets"
            )
            continue
        # Same word in both languages («Tickets») is fine; otherwise the source must be English.
        if spanish == text and key in ("category", "seriesName"):
            errors.append(
                f"{wid}: {key} {text!r} in module.json is the Spanish text; the manifest is the "
                "English source and locales/es.json carries the translation"
            )

if not checked["category"]:
    errors.append("no widget declares a category — nothing was checked")
if not checked["seriesName"]:
    errors.append(
        "no widget declares a chart legend (options.seriesName) — nothing was checked"
    )

for e in errors:
    print("FAIL:", e)
print(
    "widget texts (" + ", ".join(f"{n} {k}" for k, n in checked.items()) + "):",
    "OK" if not errors else f"{len(errors)} error(s)",
)
sys.exit(1 if errors else 0)
