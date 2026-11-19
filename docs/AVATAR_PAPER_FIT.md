# Avatar photo: measured PDF paper layout

Updated 2026-11-19. The website creates a one-photo-per-page PDF locally from the **original uploaded image**, not from its 512px 3D preview thumbnail. The original is center-cropped to a square, then sampled at up to 1200px for print quality. No upload to a server is required.

## Paper sizes (actual MediaBox)

| Selector | PDF page size (mm) | Typical print-driver name |
| --- | ---: | --- |
| A4 | 210 × 297 | A4 |
| 4R (4×6 in) | 101.6 × 152.4 | 4×6 / 102×152 |
| 6 in regional | 100 × 150 | 100×150 mm (not equal to 4R) |
| 3R (3.5×5 in) | 88.9 × 127 | 3.5×5 / 89×127 |
| 5R (5×7 in) | 127 × 177.8 | 5×7 / 127×178 |

**Changing the paper size never changes the photo cutout diameter.** PDF positions use exactly `72 / 25.4` points per millimeter, and the displayed avatar dimensions come from the same `styles.catalog.json` layout and XY percent as the 3D geometry. Z thickness scaling does not change photo dimensions.

| XY percent | Classic diameter | Native nominal full-circle diameter |
| --- | ---: | ---: |
| 50% | 23.8 mm | 16 mm |
| 100% | **47.6 mm** | **32 mm** |
| 150% | 71.4 mm | 48 mm |

The exact-length example 100.01 mm has nominal photo diameters about 35.52594 mm (Classic) and 26.66933 mm (Native); the UI rounds them to 35.53/26.67 mm. **Classic's 52mm outer white rim is not the photo size.**

## Shape and cutting

Classic prints a circular photo. Its photo top and white rim are nominally flush at Z=2.6mm; attach paper using thin adhesive. There is no paper slot.

Native's status dot overlaps the lower right of the circle. At 100%, the dot center relative to photo center is `(13, -10) mm`, radius `4.4 mm`; its inward intersection is about 4mm. The PDF cuts out exactly the circle-minus-dot contour in vector form and draws a dashed cut guide. The notch is not merely a visual annotation. Default Native photo surface Z=3.3mm, rim top Z=3.65mm: **0.35mm** nominal clearance, or 0.175/0.35/0.525mm at 50/100/150% Z.

## Paper material and actual printing

For better photographic reproduction than plain copy paper, use **inkjet-compatible glossy, semi-gloss or luster photo paper** that is supported by your printer. A first trial of **180–230 g/m²** is reasonable, but grammage is **not** a calibrated measurement of thickness, and toner/inkjet compatibility matters. Native may protrude if paper plus adhesive exceeds the rim gap. Confirm physical fit before distributing.

1. Upload a PNG, JPEG, or WebP avatar. The original file is retained locally for PDF export; 3D/GLB preview continues to use a separate 512px crop.
2. Set the final nameplate XY scale and choose the **actual physical paper dimensions printed on the package**.
3. Download the one-photo PDF. It contains a **20mm vector calibration bar** and nominal diameter label, plus Native's notch as applicable.
4. In the print dialog choose the matching page size, **Actual Size / 100%**, disable **Fit to Page** and **borderless auto-expansion**, and avoid printer-driver photo enlargement. A border is safer for accurate sizing.
5. Measure the printed 20mm bar. If it is not exactly 20mm, do not cut the avatar yet; fix printer scaling and reprint. Even a mathematically exact PDF cannot control physical printer stretch or image-print services.
6. Cut a plain-paper proof first, then photo paper. Trim only by real-world fitting; the PDF does not add an untested 0.2–0.4mm undersize tolerance. If you later rescale the model in a slicer, update the photo XY scale identically on the website.

## Validation

The PDF module was exercised independently with a real JPEG source across **5 paper sizes × 2 styles × 3 XY scales = 30 PDFs**. PyMuPDF inspected the actual files: each MediaBox was within 0.0001mm of its requested physical paper size; each vector photo outline was within 0.015mm of nominal diameter; every calibration bar was exactly 20mm; one image and the required printable labels were present. A 3R 150%-Classic worst-case page and a 4R Native page were rendered visually with the project's PDF renderer. The initial label-layer and overlap bugs found during rendering were fixed and rechecked. The GitHub source is `web/src/photo-pdf.ts`; a Node structural test is in `web/tests/photo-pdf.test.ts`.

**Limits:** no physical paper has been printed or glued in this release. The site's PDF maintains design dimensions, but individual printers, paper coatings, adhesives, and cutting methods remain unverified. 3MF still does not embed the photo (3D-printing colors are separate).

Reference for photo paper sizes: Epson's printer paper support documentation, which lists 4×6 at 102×152mm, 3.5×5 at 89×127mm, 5×7 at 127×178mm, and A4 at 210×297mm. Exact PDF dimensions use the underlying inch-to-mm conversion, not rounded driver labels.
