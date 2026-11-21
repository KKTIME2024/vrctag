// SPDX-License-Identifier: MIT
// Print one or a tightly packed sheet of avatars at nominal model dimensions.
// All page positions are in PDF points: 1 inch = 72pt = 25.4mm.

export type PhotoPaperId = "a4" | "4r" | "4r100" | "3r" | "5r";
export type PhotoPrintMode = "single" | "multiple";
export interface PhotoPaper {
  id: PhotoPaperId;
  widthMm: number;
  heightMm: number;
  label: string;
}
export const PHOTO_PAPERS: readonly PhotoPaper[] = [
  { id: "4r", widthMm: 101.6, heightMm: 152.4, label: "6寸相纸（4R）" },
  { id: "4r100", widthMm: 100, heightMm: 150, label: "6寸相纸（100×150）" },
  { id: "3r", widthMm: 88.9, heightMm: 127, label: "5寸相纸（3R）" },
  { id: "5r", widthMm: 127, heightMm: 177.8, label: "7寸相纸（5R）" },
  { id: "a4", widthMm: 210, heightMm: 297, label: "A4" },
];

export interface AvatarPhotoLayout {
  radiusMm: number;
  // Dot position relative to avatar center, in the original model's XY plane.
  dotOffsetXmm: number;
  dotOffsetYmm: number;
  dotRadiusMm: number;
}

export interface PhotoPdfData {
  paperId: PhotoPaperId;
  styleName: string;
  planarPercent: number;
  mode?: PhotoPrintMode;
  layout: AvatarPhotoLayout;
  imageJpeg: Uint8Array;
  imageWidth: number;
  imageHeight: number;
  images?: Array<{ imageJpeg: Uint8Array; imageWidth: number; imageHeight: number }>;
}

export const toPdfPoints = (millimeters: number): number => millimeters * 72 / 25.4;
export const photoDiameterMm = (layout: AvatarPhotoLayout, planarPercent: number): number =>
  layout.radiusMm * 2 * planarPercent / 100;

export interface PhotoPdfPlan {
  columns: number;
  rows: number;
  diameterMm: number;
  positions: ReadonlyArray<{ xMm: number; yMm: number }>;
  calibrationYmm: number | null;
}

/**
 * Keep each photo at true physical size. Multiple mode is a maximum-count
 * centered grid: 1.5 mm minimum border and 0.5 mm cutting gap.
 * A photo lab/printer with a wider nonprintable edge may clip outer circles.
 */
export function planPhotoPdf(
  paperId: PhotoPaperId,
  layout: AvatarPhotoLayout,
  planarPercent: number,
  mode: PhotoPrintMode = "single",
): PhotoPdfPlan {
  const paper = PHOTO_PAPERS.find((p) => p.id === paperId);
  if (!paper) throw Error("Unsupported paper format");
  if (!Number.isFinite(planarPercent) || planarPercent < 50 || planarPercent > 150)
    throw Error("Invalid XY scale");
  if (!Number.isFinite(layout.radiusMm) || layout.radiusMm <= 0)
    throw Error("Invalid avatar radius");
  if (mode !== "single" && mode !== "multiple") throw Error("Invalid photo print mode");
  const d = photoDiameterMm(layout, planarPercent);
  if (mode === "single") {
    if (d + 12 > paper.widthMm || d + 35 > paper.heightMm)
      throw Error("Photo exceeds paper with safe print margins");
    const centerY = paper.heightMm / 2;
    return {
      columns: 1, rows: 1, diameterMm: d,
      positions: [{ xMm: paper.widthMm / 2, yMm: centerY }],
      calibrationYmm: centerY - d / 2 - 11,
    };
  }
  const margin = 1.5;  // compact photo-lab layout, not guaranteed printable
  const gap = 0.5;     // small nonoverlapping dotted cut guides
  const columns = Math.floor((paper.widthMm - 2 * margin + gap + 1e-8) / (d + gap));
  const rows = Math.floor((paper.heightMm - 2 * margin + gap + 1e-8) / (d + gap));
  if (columns < 1 || rows < 1) throw Error("Photo is too large for the selected paper");
  const gridW = columns * d + (columns - 1) * gap;
  const gridH = rows * d + (rows - 1) * gap;
  const startX = (paper.widthMm - gridW + d) / 2;
  const startY = (paper.heightMm - gridH + d) / 2;
  const positions = Array.from({ length: columns * rows }, (_, index) => ({
    xMm: startX + (index % columns) * (d + gap),
    yMm: startY + (rows - 1 - Math.floor(index / columns)) * (d + gap),
  }));
  const freeBelowMm = (paper.heightMm - gridH) / 2;
  // No calibration line is drawn on an already full sheet where it could
  // overlap the printed photos. Use single mode for initial calibration.
  return {
    columns, rows, diameterMm: d, positions,
    calibrationYmm: freeBelowMm >= 11 ? freeBelowMm - 3 : null,
  };
}

/** One upload repeats in packed mode; multiple uploads print once each, across pages. */
export function planPhotoPages(paperId: PhotoPaperId, layout: AvatarPhotoLayout, scale: number, mode: PhotoPrintMode, imageCount: number) {
  const base = planPhotoPdf(paperId, layout, scale, mode);
  if (!Number.isInteger(imageCount) || imageCount < 1) return [];
  if (imageCount === 1) return [{ ...base, imageIndices: base.positions.map(() => 0) }];
  const paper = PHOTO_PAPERS.find(p => p.id === paperId)!;
  const capacity = base.positions.length;
  const pages = [];
  for (let offset = 0; offset < imageCount; offset += capacity) {
    const count = Math.min(capacity, imageCount - offset);
    if (mode === "single" || count === capacity) {
      pages.push({ ...base, imageIndices: Array.from({length: count}, (_, i) => offset + i) });
      continue;
    }
    const columns = Math.min(base.columns, count), rows = Math.ceil(count / columns);
    const step = base.diameterMm + 0.5;
    const positions = Array.from({length: count}, (_, i) => {
      const row = Math.floor(i / columns), inRow = Math.min(columns, count - row * columns);
      return { xMm: paper.widthMm / 2 + (i % columns - (inRow - 1) / 2) * step,
        yMm: paper.heightMm / 2 + ((rows - 1) / 2 - row) * step };
    });
    pages.push({ ...base, columns, rows, positions, imageIndices: positions.map((_, i) => offset + i), calibrationYmm: null });
  }
  return pages;
}

const fmt = (n: number): string => Number(n.toFixed(6)).toString();

export function photoOutline(layout: AvatarPhotoLayout, ratio: number): [number, number][] {
  const R = layout.radiusMm * ratio;
  const dx = layout.dotOffsetXmm * ratio;
  const dy = layout.dotOffsetYmm * ratio;
  const r = layout.dotRadiusMm * ratio;
  const d = Math.hypot(dx, dy);
  const points: [number, number][] = [];
  if (r <= 0 || d >= R + r || d <= Math.abs(R - r)) {
    for (let i = 0; i < 256; i++) {
      const a = i * Math.PI * 2 / 256;
      points.push([R * Math.cos(a), R * Math.sin(a)]);
    }
    return points;
  }
  // Two intersecting circles: the printable photo is the avatar disk minus
  // the status-dot disk. Trace the large, exposed outer arc followed by the
  // inner part of the dot arc; use the same contour for clipping AND cut line.
  const direction = Math.atan2(dy, dx);
  const alpha = Math.acos(Math.max(-1, Math.min(1, (R * R + d * d - r * r) / (2 * R * d))));
  const outerStart = direction + alpha;
  const outerEnd = direction - alpha + Math.PI * 2;
  for (let i = 0; i <= 240; i++) {
    const a = outerStart + (outerEnd - outerStart) * i / 240;
    points.push([R * Math.cos(a), R * Math.sin(a)]);
  }
  const p1 = points[0], p2 = points[points.length - 1];
  const phi1 = Math.atan2(p1[1] - dy, p1[0] - dx);
  const phi2 = Math.atan2(p2[1] - dy, p2[0] - dx);
  // Select the dot arc that lies inside the avatar circle.
  const ccw = ((phi1 - phi2) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
  const mid = phi2 + ccw / 2;
  const ccwInside = Math.hypot(dx + r * Math.cos(mid), dy + r * Math.sin(mid)) < R;
  const sweep = ccwInside ? ccw : ccw - 2 * Math.PI;
  for (let i = 1; i < 100; i++) {
    const a = phi2 + sweep * i / 100;
    points.push([dx + r * Math.cos(a), dy + r * Math.sin(a)]);
  }
  return points;
}

function pdfPath(points: [number, number][], cx: number, cy: number): string {
  return points.map(([x, y], i) => `${fmt(cx + toPdfPoints(x))} ${fmt(cy + toPdfPoints(y))} ${i ? "l" : "m"}`).join("\n") + "\nh\n";
}
function pdfText(value: string): string { return value.replace(/[\\()]/g, (x) => `\\${x}`); }

export function buildPhotoPdf(data: PhotoPdfData): Uint8Array {
  const paper = PHOTO_PAPERS.find((p) => p.id === data.paperId);
  if (!paper) throw Error("Unsupported paper format");
  if (!Number.isFinite(data.planarPercent) || data.planarPercent < 50 || data.planarPercent > 150)
    throw Error("Invalid XY scale");
  if (!Number.isFinite(data.layout.radiusMm) || data.layout.radiusMm <= 0)
    throw Error("Invalid avatar radius");
  if (!Number.isInteger(data.imageWidth) || !Number.isInteger(data.imageHeight) ||
      data.imageWidth <= 0 || data.imageHeight <= 0 || data.imageWidth !== data.imageHeight)
    throw Error("Avatar JPEG must be square");
  if (data.imageJpeg.length < 4 || data.imageJpeg[0] !== 0xff || data.imageJpeg[1] !== 0xd8)
    throw Error("Expected a JPEG image");

  const mode = data.mode ?? "single";
  const images = data.images?.length ? data.images : [{imageJpeg: data.imageJpeg, imageWidth: data.imageWidth, imageHeight: data.imageHeight}];
  for (const image of images) {
    if (!Number.isInteger(image.imageWidth) || image.imageWidth <= 0 || image.imageWidth !== image.imageHeight || image.imageJpeg[0] !== 0xff || image.imageJpeg[1] !== 0xd8) throw Error("Invalid JPEG image");
  }
  const plans = planPhotoPages(data.paperId, data.layout, data.planarPercent, mode, images.length);
  const plan = plans[0];
  const width = toPdfPoints(paper.widthMm), height = toPdfPoints(paper.heightMm);
  const ratio = data.planarPercent / 100;
  const diameter = plan.diameterMm;
  const circlePt = toPdfPoints(diameter);
  const radiusPt = circlePt / 2;
  const outline = photoOutline(data.layout, ratio);
  const contents = plans.map((plan) => {
  const contentParts: string[] = [
    "q", "1 1 1 rg", `${fmt(0)} ${fmt(0)} ${fmt(width)} ${fmt(height)} re f`, "Q",
  ];
  for (const [index, position] of plan.positions.entries()) {
    const centerX = toPdfPoints(position.xMm), centerY = toPdfPoints(position.yMm);
    const path = pdfPath(outline, centerX, centerY);
    contentParts.push(
      "q", path, "W n",
      `${fmt(circlePt)} 0 0 ${fmt(circlePt)} ${fmt(centerX - radiusPt)} ${fmt(centerY - radiusPt)} cm`,
      `/Im${plan.imageIndices[index] + 1} Do`, "Q",
      "q", "0.25 0.25 0.25 RG", "0.35 w", "[2 2] 0 d", path, "S", "Q",
    );
  }
  const calibrationPt = toPdfPoints(20);
  if (plan.calibrationYmm !== null) {
    const calX = width / 2 - calibrationPt / 2;
    const calY = toPdfPoints(plan.calibrationYmm);
    contentParts.push(
      "q", "0.1 0.1 0.1 RG", "0.45 w",
      `${fmt(calX)} ${fmt(calY)} m ${fmt(calX + calibrationPt)} ${fmt(calY)} l S`,
      `${fmt(calX)} ${fmt(calY - toPdfPoints(1))} m ${fmt(calX)} ${fmt(calY + toPdfPoints(1))} l S`,
      `${fmt(calX + calibrationPt)} ${fmt(calY - toPdfPoints(1))} m ${fmt(calX + calibrationPt)} ${fmt(calY + toPdfPoints(1))} l S`, "Q",
      "q", "0.25 0.25 0.25 rg", "BT", "/F1 8 Tf",
      `${fmt(width / 2 - toPdfPoints(18))} ${fmt(calY - toPdfPoints(mode === "single" ? 5 : 3))} Td`,
      "(20 mm calibration bar) Tj", "ET", "Q",
    );
  }
  if (mode === "single") {
    contentParts.push(
      "q", "0.12 0.18 0.2 rg", "BT", "/F1 10 Tf",
      `${fmt(toPdfPoints(9))} ${fmt(height - toPdfPoints(12))} Td`,
      `(${pdfText(`VRC TAG PHOTO | ${data.styleName} | ${fmt(diameter)} mm`)}) Tj`, "ET", "Q",
      "q", "0.3 0.3 0.3 rg", "BT", "/F1 7 Tf",
      `${fmt(toPdfPoints(9))} ${fmt(toPdfPoints(7))} Td`,
      "(Actual size 100% | No Fit to Page | No borderless enlargement) Tj", "ET", "Q",
    );
  }
  return contentParts.join("\n") + "\n";
  });

  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [0];
  let pos = 0;
  const append = (data: string | Uint8Array) => {
    const bytes = typeof data === "string" ? encoder.encode(data) : data;
    chunks.push(bytes);
    pos += bytes.byteLength;
  };
  const object = (n: number, body: string | Uint8Array, dictionary?: string) => {
    offsets[n] = pos;
    append(`${n} 0 obj\n`);
    if (dictionary !== undefined) { append(`<< ${dictionary} /Length ${typeof body === "string" ? encoder.encode(body).length : body.length} >>\nstream\n`); append(body); append("\nendstream\n"); }
    else append(body);
    append("\nendobj\n");
  };
  append("%PDF-1.4\n%VRCPhoto\n");
  const imageStart = 4, fontId = imageStart + images.length, pageStart = fontId + 1;
  object(1, "<< /Type /Catalog /Pages 2 0 R >>");
  object(2, `<< /Type /Pages /Kids [${plans.map((_, i) => `${pageStart + 2*i} 0 R`).join(" ")}] /Count ${plans.length} >>`);
  object(3, "<< >>");
  images.forEach((image, i) => object(imageStart + i, image.imageJpeg, `/Type /XObject /Subtype /Image /Width ${image.imageWidth} /Height ${image.imageHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode`));
  object(fontId, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  plans.forEach((_, i) => {
    const pageId = pageStart + i*2;
    const xobjects = images.map((_, j) => `/Im${j+1} ${imageStart+j} 0 R`).join(" ");
    object(pageId, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${fmt(width)} ${fmt(height)}] /Resources << /XObject << ${xobjects} >> /Font << /F1 ${fontId} 0 R >> >> /Contents ${pageId+1} 0 R >>`);
    object(pageId+1, contents[i], "");
  });
  const xref = pos, count = pageStart + plans.length * 2;
  append(`xref\n0 ${count}\n0000000000 65535 f \n`);
  for (let i = 1; i < count; i++) append(`${String(offsets[i]).padStart(10, "0")} 00000 n \n`);
  append(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  const result = new Uint8Array(pos);
  let cursor = 0;
  for (const chunk of chunks) { result.set(chunk, cursor); cursor += chunk.byteLength; }
  return result;
}

export async function generatePhotoPdf(
  file: File,
  paperId: PhotoPaperId,
  styleName: string,
  planarPercent: number,
  layout: AvatarPhotoLayout,
  mode: PhotoPrintMode = "single",
): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  try {
    const side = Math.min(bitmap.width, bitmap.height);
    const outputSide = Math.min(1200, side);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = outputSide;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw Error("Photo canvas is unavailable");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, outputSide, outputSide);
    ctx.drawImage(bitmap, (bitmap.width-side)/2, (bitmap.height-side)/2, side, side, 0, 0, outputSide, outputSide);
    const imageBlob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(Error("Failed to encode photo")), "image/jpeg", 0.96),
    );
    const jpg = new Uint8Array(await imageBlob.arrayBuffer());
    const pdf = buildPhotoPdf({
      paperId, styleName, planarPercent, layout, mode,
      imageJpeg: jpg, imageWidth: outputSide, imageHeight: outputSide,
    });
    return new Blob([pdf.buffer as ArrayBuffer], { type: "application/pdf" });
  } finally {
    bitmap.close();
  }
}

export async function generatePhotoBatchPdf(sources: string[], paperId: PhotoPaperId, styleName: string, planarPercent: number, layout: AvatarPhotoLayout, mode: PhotoPrintMode): Promise<Blob> {
  const images = [];
  for (const source of sources) {
    const bitmap = await createImageBitmap(await (await fetch(source)).blob());
    try {
      const canvas = document.createElement("canvas"); canvas.width = canvas.height = Math.min(1200, bitmap.width, bitmap.height);
      const ctx = canvas.getContext("2d"); if (!ctx) throw Error("Photo canvas is unavailable");
      ctx.fillStyle = "white"; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(v => v ? resolve(v) : reject(Error("JPEG encoding failed")), "image/jpeg", .96));
      images.push({imageJpeg: new Uint8Array(await blob.arrayBuffer()), imageWidth: canvas.width, imageHeight: canvas.height});
    } finally { bitmap.close(); }
  }
  if (!images.length) throw Error("No images");
  const pdf = buildPhotoPdf({paperId, styleName, planarPercent, layout, mode, ...images[0], images});
  return new Blob([pdf.buffer as ArrayBuffer], {type: "application/pdf"});
}
