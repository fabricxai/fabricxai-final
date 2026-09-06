# S1 working files — owner and admin

Seeded into `../fabricx-role-owner-and-admin.html`. Edit these, re-run `node _build.mjs`,
then re-seed — never edit the seeded page.

```
node _build.mjs
SK=<claude design skill dir>; P=<repo>/public/brand
node "$SK/seed-canvas.mjs" --template "$SK/payload.template.html" \
  --out ../fabricx-role-owner-and-admin.html --title "FabricX Role — Owner and Admin" \
  $(for f in $(cat .made | tr ' ' '\n' | grep '\.dc\.html$'); do printf -- "--artboard %s " "$f"; done) \
  --canvas canvas.json --image "$P/fabricxai-logo-light.png" --image "$P/marbim-logo-ink.png" \
  $(for i in 1 2 3 4 5 6 7 8; do printf -- "--image %s/mark/i-%s.png " "$P" "$i"; done)
```

`_page.mjs` is the layer above S0's kit — page body, card, list row, figure tile, flow step,
desk card. It belongs in `../shell-and-drawers/_kit.mjs` eventually; it lives here so S1 did
not have to edit a committed S0 file to reach it. S2–S14 should import BOTH
(`../shell-and-drawers/_kit.mjs` and `./_page.mjs`) rather than redrawing either.
