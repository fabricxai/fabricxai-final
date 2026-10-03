# S8 working files — merchandiser (orders, sampling, memory)

Seeded into `../fabricx-role-merchandiser.html`. Edit these, re-run `node _build.mjs`, re-seed.

```
node _build.mjs
SK=<claude design skill dir>; P=<repo>/public/brand
node "$SK/seed-canvas.mjs" --template "$SK/payload.template.html" \
  --out ../fabricx-role-merchandiser.html --title "FabricX Role — Merchandiser" \
  $(for f in $(cat .made | tr ' ' '\n' | grep '\.dc\.html$'); do printf -- "--artboard %s " "$f"; done) \
  --canvas canvas.json --image "$P/fabricxai-logo-light.png" --image "$P/marbim-logo-ink.png" \
  $(for i in 1 2 3 4 5 6 7 8; do printf -- "--image %s/mark/i-%s.png " "$P" "$i"; done)
```

Imports `../shell-and-drawers/_kit.mjs` (tokens, primitives), `_shell.mjs` (rail, top bar,
page header), `_drawer.mjs` (the six-part frame) and `../owner-and-admin/_page.mjs` (page body,
card, row, figure tile, flow step). Nothing is redrawn — S8 adds only what is its own: the order
book row with its LC chip, the milestone timeline, the ripple preview, the breakdown grid with
the revision overlay, the sampling board, and the inputs matrix.
