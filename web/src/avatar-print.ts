// SPDX-License-Identifier: MIT
// Copyright (c) 2026 RICHARDwuxiaofei
import { getStyle } from './styles';
import { scaleRatio } from './size-scale';
import type { Config } from './model';

export const papers = { A4: [210, 297], A5: [148, 210], A6: [105, 148], B5JIS: [182, 257], B5ISO: [176, 250], Letter: [215.9, 279.4], Photo4x6: [101.6, 152.4], Photo5x7: [127, 177.8], Photo3R: [89, 127] } as const;
export type Paper = keyof typeof papers;
export function avatarDiameter(config: Config): number {
  return getStyle(config.styleId).layout.avatar.radius * 2 * scaleRatio(config.planarScale);
}
export function pageLayout(paper: Paper, diameter: number) {
  const [width, height] = papers[paper], margin = 10, gap = 4;
  const columns = Math.floor((width - 2 * margin + gap) / (diameter + gap));
  const rows = Math.floor((height - 2 * margin - 10 + gap) / (diameter + gap));
  if (!Number.isFinite(diameter) || diameter <= 0 || columns < 1 || rows < 1) throw Error('头像太大，放不进所选纸张。');
  return { width, height, columns, rows, gap, x: (width - (columns * diameter + (columns - 1) * gap)) / 2, y: 10 };
}
export async function avatarPrintPdf(avatar: string, config: Config, paper: Paper): Promise<Uint8Array> {
  const diameter = avatarDiameter(config), layout = pageLayout(paper, diameter);
  const image = new Image(); image.src = avatar; await image.decode();
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 512;
  const ctx = canvas.getContext('2d'); if (!ctx) throw Error('无法创建头像打印页。');
  ctx.fillStyle = 'white'; ctx.fillRect(0, 0, 512, 512);
  ctx.save(); ctx.beginPath(); ctx.arc(256, 256, 255, 0, Math.PI * 2); ctx.clip();
  ctx.drawImage(image, 0, 0, 512, 512); ctx.restore();
  const jpeg = await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(Error('无法生成头像图片。')), 'image/jpeg', 0.95));
  const bytes = new Uint8Array(await jpeg.arrayBuffer());
  const enc = new TextEncoder(), chunks: Uint8Array[] = [], offsets: number[] = [0]; let length = 0;
  const add = (s: string | Uint8Array) => { const b = typeof s === 'string' ? enc.encode(s) : s; chunks.push(b); length += b.length; };
  const obj = (id: number, content: string) => { offsets[id] = length; add(`${id} 0 obj\n${content}\nendobj\n`); };
  const pt = (mm: number) => (mm * 72 / 25.4).toFixed(4);
  add('%PDF-1.4\n% printable avatar\n');
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  obj(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pt(layout.width)} ${pt(layout.height)}] /Resources << /XObject << /Im0 4 0 R >> /Font << /F1 6 0 R >> >> /Contents 5 0 R >>`);
  offsets[4] = length; add(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width 512 /Height 512 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${bytes.length} >>\nstream\n`); add(bytes); add('\nendstream\nendobj\n');
  let stream = '';
  for (let row = 0; row < layout.rows; row++) for (let col = 0; col < layout.columns; col++) {
    const x = layout.x + col * (diameter + layout.gap), y = layout.height - layout.y - diameter - row * (diameter + layout.gap);
    stream += `q ${pt(diameter)} 0 0 ${pt(diameter)} ${pt(x)} ${pt(y)} cm /Im0 Do Q\n`;
    // A subtle circle marks the cut boundary, including on white images.
    const r = diameter / 2, k = r * 0.55228475, cx = x + r, cy = y + r;
    stream += `0.65 G 0.35 w ${pt(cx+r)} ${pt(cy)} m ${pt(cx+r)} ${pt(cy+k)} ${pt(cx+k)} ${pt(cy+r)} ${pt(cx)} ${pt(cy+r)} c ${pt(cx-k)} ${pt(cy+r)} ${pt(cx-r)} ${pt(cy+k)} ${pt(cx-r)} ${pt(cy)} c ${pt(cx-r)} ${pt(cy-k)} ${pt(cx-k)} ${pt(cy-r)} ${pt(cx)} ${pt(cy-r)} c ${pt(cx+k)} ${pt(cy-r)} ${pt(cx+r)} ${pt(cy-k)} ${pt(cx+r)} ${pt(cy)} c S\n`;
  }
  stream += `0 g BT /F1 9 Tf ${pt(10)} ${pt(5)} Td (Diameter ${diameter.toFixed(2)} mm - print at actual size / 100%) Tj ET\n`;
  obj(5, `<< /Length ${enc.encode(stream).length} >>\nstream\n${stream}endstream`);
  obj(6, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const start = length; add('xref\n0 7\n0000000000 65535 f \n'); for (let i=1;i<=6;i++) add(`${String(offsets[i]).padStart(10,'0')} 00000 n \n`);
  add(`trailer\n<< /Size 7 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`);
  const result = new Uint8Array(length); let pos = 0; for (const c of chunks) { result.set(c, pos); pos += c.length; } return result;
}
