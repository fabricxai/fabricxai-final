# S0 working files — shell and drawers

The canvas at `../fabricx-role-shell-and-drawers.html` is *seeded* from these files. To change
anything, edit the artboard here and re-seed — never edit the seeded page.

```
node _build.mjs                       # regenerates every *.dc.html + canvas.json
SK=<claude design skill dir>
node "$SK/seed-canvas.mjs" --template "$SK/payload.template.html" \
  --out ../fabricx-role-shell-and-drawers.html \
  --title "FabricX Role — Shell and Drawers" \
  $(for f in $(cat .made | tr ' ' '\n' | grep '\.dc\.html$'); do printf -- "--artboard %s " "$f"; done) \
  --canvas canvas.json \
  --image <repo>/public/brand/marbim-logo-ink.png  … (see .made / the seed line in git log)
```

- `_kit.mjs` — tokens lifted from `src/app/theme.css` and the fx primitives (Button, Badge,
  Selvage, StatusLabel, FigureTile, ConfidenceTicks…). Values are copied, never rounded.
- `_shell.mjs` — `NAV`, the per-role rails, the nav glyphs from `nav-icons.tsx`, the top bar
  and the page header. The rails were computed by running the real `visibleNav()`, not eyeballed.
- `_drawer.mjs` — the §2.2 six-part drawer frame, the gate chip, the read-only note.
- `_build.mjs` — the 31 artboards and `canvas.json`.

S1–S15 should import `_kit.mjs` / `_shell.mjs` / `_drawer.mjs` rather than redrawing the chrome.
