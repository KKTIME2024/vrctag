// SPDX-License-Identifier: MIT
import { useEffect, useState } from "react";
import { photoOutline, type AvatarPhotoLayout, type PhotoPaper, type PhotoPdfPlan } from "./photo-pdf";

export interface PhotoItem { name: string; source: string; cropped: string; sourceSize: number; crop: { zoom: number; x: number; y: number } }
export async function cropPhoto(source: string, zoom = 1, x = 50, y = 50): Promise<string> {
  const image = new Image(); image.src = source; await image.decode();
  const size = Math.min(image.width, image.height) / zoom;
  const canvas = document.createElement("canvas"); canvas.width = canvas.height = Math.max(1, Math.min(1200, Math.round(size)));
  const ctx = canvas.getContext("2d"); if (!ctx) throw Error("Canvas unavailable");
  ctx.fillStyle = "white"; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, (image.width - size) * x / 100, (image.height - size) * y / 100, size, size, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", .95);
}
export async function readPhoto(file: File): Promise<PhotoItem> {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) throw Error("请选择 PNG、JPEG 或 WebP 图片。");
  if (file.size > 15 * 1024 * 1024) throw Error("图片过大，请选择 15 MB 以内的图片。");
  const bitmap = await createImageBitmap(file);
  try {
    if (bitmap.width * bitmap.height > 40000000) throw Error("图片像素过大，请缩小至 4000 万像素以内。");
    const canvas = document.createElement("canvas"); const scale = Math.min(1, 2048 / Math.max(bitmap.width, bitmap.height));
    canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d"); if (!ctx) throw Error("Canvas unavailable"); ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const source = canvas.toDataURL("image/png");
    return { name: file.name, source, cropped: await cropPhoto(source), sourceSize: Math.min(canvas.width, canvas.height), crop: {zoom: 1, x: 50, y: 50} };
  } finally { bitmap.close(); }
}
export function PhotoCropEditor({ photos, initialIndex, onSave, onClose, t }: { photos: PhotoItem[]; initialIndex: number; onSave: (index: number, cropped: string, crop: PhotoItem["crop"]) => void; onClose: () => void; t: (s:string)=>string }) {
  const [index, setIndex] = useState(initialIndex), [zoom, setZoom] = useState(photos[initialIndex].crop.zoom), [x, setX] = useState(photos[initialIndex].crop.x), [y, setY] = useState(photos[initialIndex].crop.y), [preview, setPreview] = useState(photos[initialIndex].cropped), [saving, setSaving] = useState(false);
  useEffect(() => { let active = true; cropPhoto(photos[index].source, zoom, x, y).then(v => { if (active) setPreview(v); }); return () => { active = false; }; }, [photos, index, zoom, x, y]);
  const next = async () => {
    setSaving(true); try { onSave(index, await cropPhoto(photos[index].source, zoom, x, y), {zoom, x, y});
      if (index + 1 >= photos.length) onClose(); else { setIndex(index + 1); setZoom(photos[index + 1].crop.zoom); setX(photos[index + 1].crop.x); setY(photos[index + 1].crop.y); setPreview(photos[index + 1].cropped); }
    } finally { setSaving(false); }
  };
  return <div className="photo-editor-backdrop" role="presentation"><div className="photo-editor" role="dialog" aria-modal="true" aria-label={t("逐张裁切头像")}>
    <header><div><strong>{t("逐张裁切头像")}</strong><p>{index + 1} / {photos.length} · {photos[index].name}</p></div><button type="button" className="photo-editor-skip" onClick={onClose}>{t("跳过剩余")}</button></header>
    <img className="photo-editor-preview" src={preview} alt={t("裁切预览")} />
    <label>{t("缩放")} {zoom.toFixed(2)}×<input type="range" min="1" max="3" step="0.05" value={zoom} onChange={e => setZoom(Number(e.target.value))} /></label>
    <label>{t("左右位置")}<input type="range" min="0" max="100" value={x} onChange={e => setX(Number(e.target.value))} /></label>
    <label>{t("上下位置")}<input type="range" min="0" max="100" value={y} onChange={e => setY(Number(e.target.value))} /></label>
    <p className="field-note">{t("跳过后，未处理的图片使用默认居中裁切。")}</p>
    <button type="button" className="photo-pdf-button" disabled={saving} onClick={() => void next()}>{t(index + 1 === photos.length ? "完成" : "下一张")}</button>
  </div></div>;
}
export function PhotoSheetPreview({ paper, plan, images, layout, scale, mode, styleName, t }: { paper: PhotoPaper; plan: PhotoPdfPlan & {imageIndices:number[]}; images: PhotoItem[]; layout: AvatarPhotoLayout; scale: number; mode: string; styleName: string; t:(s:string)=>string }) {
  const outline = photoOutline(layout, scale / 100);
  const d = plan.diameterMm;
  const path = outline.map(([x,y], i) => `${i ? "L" : "M"} ${x} ${-y}`).join(" ") + " Z";
  return <svg className="photo-sheet-preview" viewBox={`0 0 ${paper.widthMm} ${paper.heightMm}`} role="img" aria-label={t("打印排版预览")}>
    <rect width={paper.widthMm} height={paper.heightMm} fill="white" />
    {plan.positions.map((p,i) => <g key={i} transform={`translate(${p.xMm} ${paper.heightMm-p.yMm})`}>
      <clipPath id={`photo-preview-clip-${i}`}><path d={path}/></clipPath>
      {images[plan.imageIndices[i]] && <image href={images[plan.imageIndices[i]].cropped} x={-d/2} y={-d/2} width={d} height={d} preserveAspectRatio="none" clipPath={`url(#photo-preview-clip-${i})`} />}
      <path d={path} fill="none" stroke="#444" strokeWidth={0.12} strokeDasharray=".7 .7" />
    </g>)}
    {plan.calibrationYmm !== null && <g transform={`translate(${paper.widthMm/2} ${paper.heightMm-plan.calibrationYmm})`} stroke="#222" strokeWidth=".16"><path d="M -10 0 H 10 M -10 -1 V 1 M 10 -1 V 1"/><text x="-18" y={mode === "single" ? 5 : 3} fontSize="2.8" fill="#444" stroke="none">20 mm calibration bar</text></g>}
    {mode === "single" && <><text x="9" y="12" fontSize="3.5" fill="#1f2e33">VRC TAG PHOTO | {styleName} | {Number(d.toFixed(6))} mm</text><text x="9" y={paper.heightMm-7} fontSize="2.4" fill="#444">Actual size 100% | No Fit to Page | No borderless enlargement</text></>}
  </svg>;
}
