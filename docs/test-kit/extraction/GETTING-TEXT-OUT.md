# Getting the actual text out of PDFs, scans and spreadsheets

FabricXAI's intake reads pasted text (see `HOW-EXTRACTION-WORKS.md`). This guide is the
step before: turning whatever a buyer or customs office sent — digital PDF, phone photo,
scan, spreadsheet — into faithful text. Every command below was run against this kit's own
documents on a stock Linux box.

## Decision table

| Input | Method | Command |
|---|---|---|
| Digital PDF (text layer) | Poppler `pdftotext` | `pdftotext -layout doc.pdf -` |
| Scanned PDF (no text layer) | rasterize → OCR | `pdftoppm` + `tesseract` (below) |
| Photo / JPG / PNG scan | OCR | `tesseract scan.jpg -` |
| CSV | already text | open it — or upload it, CSV auto-fills the paste box |
| XLSX | convert to CSV | `libreoffice --headless --convert-to csv` or `xlsx2csv` |
| DOCX | convert to text | `libreoffice --headless --convert-to txt` or `pandoc -t plain` |
| Email (.eml) | body is text | open and copy the body |

## 1 · Digital PDFs — `pdftotext`, always with `-layout`

```bash
pdftotext -layout documents/buyer-po/PO-88410-HM.pdf -          # to stdout
pdftotext -layout doc.pdf out.txt                               # to file
pdftotext -layout -f 4 -l 4 techpack.pdf bom-page.txt           # just page 4
```

**`-layout` is not optional for this pipeline.** It preserves table columns and line
breaks. Without it (or when copy-pasting from a PDF viewer), tables come out *flattened*
into run-on lines — and a flattened measurement chart has made the extractor pair every
size with the wrong column **at high confidence**. Faithful layout in, faithful fields out.

Check whether a PDF has a text layer at all:

```bash
pdftotext doc.pdf - | head        # gibberish or empty → it's a scan, go to §2
pdffonts doc.pdf                  # no fonts listed → image-only PDF
```

## 2 · Scans and photos — `tesseract` OCR

The kit ships `documents/ud-scan/UD-131.scan.jpg` — an image-only scan with **zero text
layer** — precisely to practice this path. Ground truth is `UD-131.paste.txt` next to it.

```bash
# Straight OCR to stdout
tesseract documents/ud-scan/UD-131.scan.jpg -

# Better accuracy: force page-segmentation for a uniform block, English model
tesseract UD-131.scan.jpg - --psm 6 -l eng

# Bangla or mixed documents (needs the language pack: apt install tesseract-ocr-ben)
tesseract challan.jpg - -l ben+eng
```

For a scanned **PDF** (multi-page image PDF), rasterize first:

```bash
pdftoppm -r 300 scanned.pdf page -png        # page-1.png, page-2.png … at 300 dpi
for p in page-*.png; do tesseract "$p" "${p%.png}" --psm 6; done
cat page-*.txt > full.txt
```

**Always proofread OCR output against the image before pasting.** OCR confuses `0/O`,
`1/l`, `5/S`; a wrong digit in a quantity will be extracted faithfully — the extractor
transcribes what it reads, and per-field confidence measures *the model's* certainty about
the text you gave it, not the OCR's. The number that guards you is the human in the
approve inbox comparing against the attached original — attach the scan as provenance so
they can.

Improving bad scans before OCR:

```bash
# ImageMagick: grayscale, boost contrast, upscale — big OCR accuracy gains on photos
convert photo.jpg -colorspace Gray -normalize -resize 200% clean.png
tesseract clean.png -
```

## 3 · Spreadsheets and Word documents

```bash
# XLSX → CSV (first sheet)
libreoffice --headless --convert-to csv breakdown.xlsx
xlsx2csv breakdown.xlsx                        # alternative, python-based

# DOCX → plain text
libreoffice --headless --convert-to txt:Text report.docx
pandoc report.docx -t plain -o report.txt      # alternative
```

CSV is the friendliest format for this pipeline: it is line-oriented, uploads as valid
provenance (mime `text/csv` is allowed), and auto-fills the paste box when picked.

## 4 · Rules for the pasted text (whatever the source)

- **Keep the layout.** Newlines between rows, aligned or delimited columns. Never join a
  table into one line.
- **Labelled lines extract best**: `PO Number : PO-88410` beats prose. All kit `.paste.txt`
  files follow this.
- **Dates as `YYYY-MM-DD`** — the extractor transcribes and never reformats, so give it
  the format the schema wants.
- **Plain decimals**: `1250.00`, `5.60`, `41500.000`. Strip thousands separators from
  quantities/wages where you can.
- **≤200,000 characters.** For a 12-page tech pack, paste the BOM page, not the whole pack
  (`pdftotext -f/-l` above); note the page number — extractors record `sourcePage`.
- **No UUIDs.** Buyer and audit identities come from the pickers, never from the text.

## 5 · Verifying an extraction against this kit

```bash
# What you pasted:
cat documents/buyer-po/PO-88410-HM.paste.txt
# What must come out (ignore keys starting with "_"):
cat documents/buyer-po/expected.json
```

Open the approve inbox as `owner@` and diff the draft against `expected.json` field by
field, then approve. §"What to check" in `HOW-EXTRACTION-WORKS.md` lists the pass criteria.
