// SPDX-License-Identifier: MIT
import { test } from "node:test";
import assert from "node:assert/strict";
import { PHOTO_PAPERS, buildPhotoPdf, photoDiameterMm, toPdfPoints } from "../src/photo-pdf.ts";

const decoder = new TextDecoder();
const jpegHeader = Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]); // structural tests only; render QA used a real JPEG
const layouts = {
  classic: { radiusMm: 23.8, dotOffsetXmm: 33, dotOffsetYmm: -8.4, dotRadiusMm: 3 },
  native: { radiusMm: 16, dotOffsetXmm: 13, dotOffsetYmm: -10, dotRadiusMm: 4.4 },
};
for (const paper of PHOTO_PAPERS) {
  for (const [style, layout] of Object.entries(layouts)) {
    for (const scale of [50, 100, 150]) {
      test(`photo PDF ${paper.id} ${style} ${scale}%: true-size MediaBox, contour and xref`, () => {
        const bytes = buildPhotoPdf({
          paperId: paper.id, styleName: style, planarPercent: scale,
          layout, imageJpeg: jpegHeader, imageWidth: 1, imageHeight: 1,
        });
        const text = decoder.decode(bytes);
        const media = text.match(/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/);
        assert(media);
        assert(Math.abs(Number(media[1]) / toPdfPoints(1) - paper.widthMm) < 0.0001);
        assert(Math.abs(Number(media[2]) / toPdfPoints(1) - paper.heightMm) < 0.0001);
        assert(text.includes("20 mm calibration bar"));
        assert(text.includes("No borderless enlargement"));
        assert(text.includes(`${photoDiameterMm(layout, scale)} mm`));
        const xref = text.match(/startxref\n(\d+)\n%%EOF/);
        assert(xref);
        const offset = Number(xref[1]);
        assert.equal(decoder.decode(bytes.slice(offset, offset+4)), "xref");
        assert(text.includes("/Filter /DCTDecode"));
      });
    }
  }
}
test("invalid model dimensions are rejected", () => {
  assert.throws(() => buildPhotoPdf({paperId:"a4",styleName:"Classic",planarPercent:151,
    layout:layouts.classic,imageJpeg:jpegHeader,imageWidth:1,imageHeight:1}));
});
