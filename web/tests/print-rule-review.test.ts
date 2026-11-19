// SPDX-License-Identifier: MIT
// Copyright (c) 2026 RICHARDwuxiaofei
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import opentype from "opentype.js";
import { strFromU8, unzipSync } from "fflate";
import { buildDesign, defaults, type Base, type Config, type Design } from "../src/model.ts";
import { styles } from "../src/styles.ts";
import { materialPlan } from "../src/materials.ts";
import { export3mf } from "../src/export.ts";
import { exportBlender } from "../src/blender-export.ts";

const raw = readFileSync(new URL("../public/assets/NotoSansCJKsc-Bold.otf", import.meta.url));
const font = opentype.parse(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength));
const near = (a: number, b: number) => assert(Math.abs(a - b) < 1e-6, `${a} != ${b}`);
const longNames = {
  Latin: "M".repeat(30),
  Chinese: "测试".repeat(15),
  Japanese: "カタカナ".repeat(7),
  Korean: "한글".repeat(15),
};

function checkScaledPreview(actual: Design, original: Design, xy: number, z: number) {
  original.size!.forEach((value, axis) => near(actual.size![axis], value * (axis === 2 ? z : xy)));
  assert.deepEqual(actual.parts.map(part => part.name), original.parts.map(part => part.name));
  for (let i = 0; i < original.parts.length; i++) {
    original.parts[i].vertices.forEach((vertex, j) => vertex.forEach((value, axis) =>
      near(actual.parts[i].vertices[j][axis], value * (axis === 2 ? z : xy))));
  }
  original.previewAvatar?.vertices.forEach((vertex, i) => vertex.forEach((value, axis) =>
    near(actual.previewAvatar!.vertices[i][axis], value * (axis === 2 ? z : xy))));
}

for (const style of styles) {
  const base = JSON.parse(readFileSync(new URL("../public/assets/" + style.baseFile, import.meta.url), "utf8")) as Base;
  const make = (patch: Partial<Config> = {}) => buildDesign({ ...defaults, styleId: style.id, ...patch }, base, font);

  for (const [script, displayName] of Object.entries(longNames)) {
    test(`${style.id}: ${script} text below the 100% limit becomes exportable at 150%`, () => {
      const config = { ...defaults, styleId: style.id, displayName, planarScale: 150 };
      const original = make({ displayName });
      assert(original.textHeights.Name < base.layout.textRules.minimumHeight);
      assert(original.errors.some(message => message.startsWith("Name 缩放后仅 ")));
      assert.throws(() => export3mf(original, { ...config, planarScale: 100 }));
      const enlarged = buildDesign(config, base, font);
      assert.deepEqual(enlarged.errors, []);
      near(enlarged.textHeights.Name, original.textHeights.Name * 1.5);
      assert(enlarged.textHeights.Name >= base.layout.textRules.minimumHeight);
      checkScaledPreview(enlarged, original, 1.5, 1);
      assert(enlarged.warnings.some(message => message.startsWith(`Name 高 ${enlarged.textHeights.Name.toFixed(1)} mm`)));
      assert(export3mf(enlarged, config, "core").length);
      if (script === "Latin") assert(export3mf(enlarged, config, "bambu").length);
    });
  }

  test(`${style.id}: 50% keeps existing export permission and reports actual warning heights`, () => {
    const config = { ...defaults, styleId: style.id, displayName: "M".repeat(20), hideStatus: false, planarScale: 50 };
    const original = make({ displayName: config.displayName, hideStatus: false });
    const reduced = buildDesign(config, base, font);
    assert.deepEqual(original.errors, []);
    assert.deepEqual(reduced.errors, []);
    assert(reduced.textHeights.Name < base.layout.textRules.minimumHeight);
    near(reduced.textHeights.Name, original.textHeights.Name * 0.5);
    assert(reduced.warnings.some(message => message.startsWith(`Name 高 ${reduced.textHeights.Name.toFixed(1)} mm`)));
    assert(reduced.warnings.includes("缩小后小字可能无法打印，请在切片软件检查细节。"));
    assert(export3mf(reduced, config, "core").length);
    assert(export3mf(reduced, config, "bambu").length);
  });

  test(`${style.id}: invalid previews use the selected XY and independent Z scales`, () => {
    for (const displayName of ["M".repeat(80), "Nagi🙂", ""]) {
      const original = make({ displayName });
      const scaled = make({ displayName, planarScale: 150, thicknessScale: 75 });
      assert(original.errors.length);
      assert(scaled.errors.length);
      checkScaledPreview(scaled, original, 1.5, 0.75);
      if (displayName.startsWith("M")) {
        assert(scaled.errors.includes(`Name 缩放后仅 ${scaled.textHeights.Name.toFixed(1)} mm 高，请缩短文字。`));
      }
      assert.throws(() => export3mf(scaled, { ...defaults, styleId: style.id, displayName, planarScale: 150, thicknessScale: 75 }));
    }
  });

  test(`${style.id}: explicit CFS colors and slots match preview and unchanged 3MF packages`, () => {
    const customizations: Partial<Config>[] = [
      { filamentColors: ["#112233", "#ff0000", "#ffd45d", "auto"] },
      { materialSlots: { Name: 0, Status_Dot: 1, Avatar_Back: 2 } },
      { filamentColors: ["#001122", "#FF0000", "#00FF00", "#0000FF"], materialSlots: { Name: 2, Status_Dot: 0 } },
    ];
    for (const customization of customizations) {
      const config = { ...defaults, styleId: style.id, friend: true, dotColor: "#123456", ...customization };
      const originalAppearance = make({ friend: true, dotColor: "#123456" });
      const updated = buildDesign(config, base, font);
      const plan = materialPlan(config, updated.parts);
      assert.deepEqual(updated.parts.map(part => part.color), plan.parts.map(part => part.color));
      assert.deepEqual(updated.errors, []);
      for (const target of ["core", "bambu"] as const) {
        // Before this change, preview geometry retained original colors while
        // export still honored config. All entries must remain identical.
        const previous = unzipSync(export3mf(originalAppearance, config, target));
        const current = unzipSync(export3mf(updated, config, target));
        assert.deepEqual(Object.keys(current).sort(), Object.keys(previous).sort());
        for (const path of Object.keys(previous)) assert.deepEqual(current[path], previous[path], `${target}: ${path}`);
        const printing = JSON.parse(strFromU8(current["Metadata/printing.json"]));
        assert.deepEqual(printing.parts.map((part: { color: string }) => part.color), updated.parts.map(part => part.color));
      }
    }
  });

  test(`${style.id}: visual mode ignores CFS customization and default colors retain their original spelling`, () => {
    const original = make();
    const visual = make({ printMode: "visual", filamentColors: ["#112233", "#FF0000", "#00FF00", "auto"], materialSlots: { Name: 2 } });
    assert.deepEqual(visual.parts.map(part => part.color), original.parts.map(part => part.color));
    assert.equal(original.parts.find(part => part.name === "Name")!.color, style.colors.Name);
    assert.equal(original.parts.find(part => part.name === "Plate_Body")!.color, style.colors.Plate_Body);
    assert.equal(make({ friend: true }).parts.find(part => part.name === "Name")!.color, style.colors.Friend_Name);
  });

  test(`${style.id}: actual GLB materials include restored red name, blue body and green status`, async () => {
    // GLTFExporter's binary packing uses only this FileReader operation when
    // there is no image. Exercise the actual exporter, not a source-text proxy.
    const previous = Object.getOwnPropertyDescriptor(globalThis, "FileReader");
    class ArrayBufferReader {
      result: ArrayBuffer | null = null;
      onloadend?: () => void;
      readAsArrayBuffer(blob: Blob) {
        void blob.arrayBuffer().then(result => { this.result = result; this.onloadend?.(); });
      }
    }
    Object.defineProperty(globalThis, "FileReader", { configurable: true, value: ArrayBufferReader });
    try {
      const design = make({ filamentColors: ["#0000FF", "#FF0000", "#FFFF00", "#00FF00"] });
      const binary = await exportBlender(design, "");
      const view = new DataView(binary);
      assert.equal(view.getUint32(0, true), 0x46546c67);
      const gltf = JSON.parse(new TextDecoder().decode(new Uint8Array(binary, 20, view.getUint32(12, true))));
      for (const [name, expected] of Object.entries({ Name: [1, 0, 0, 1], Plate_Body: [0, 0, 1, 1], Status_Dot: [0, 1, 0, 1] })) {
        const node = gltf.nodes.find((entry: { name?: string }) => entry.name === name);
        const mesh = gltf.meshes[node.mesh];
        const color = gltf.materials[mesh.primitives[0].material].pbrMetallicRoughness.baseColorFactor;
        assert.deepEqual(color, expected, name);
      }
    } finally {
      if (previous) Object.defineProperty(globalThis, "FileReader", previous);
      else Reflect.deleteProperty(globalThis, "FileReader");
    }
  });
}
