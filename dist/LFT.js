/*!
 * LFT 1.0.0
 * Copyright 2026 hi2ma-bu4
 * Licensed under the Apache License, Version 2.0
 * http://www.apache.org/licenses/LICENSE-2.0
 */

// src/index.ts
var LFT = class {
  static MAGIC = new Uint8Array([76, 70, 84, 33]);
  // "LFT!"
  static TILE_SIZE = 64;
  // --- [1] ユーティリティ ---
  static rgbToYCoCgR(r, g, b) {
    const co = r - b;
    const tmp = b + (co >> 1);
    const cg = g - tmp;
    const y = tmp + (cg >> 1);
    return [y, co, cg];
  }
  static yCoCgRToRgb(y, co, cg) {
    const tmp = y - (cg >> 1);
    const g = cg + tmp;
    const b = tmp - (co >> 1);
    const r = b + co;
    return [r, g, b];
  }
  static paeth(a, b, c) {
    const p = a + b - c;
    const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
    if (pa <= pb && pa <= pc) return a;
    if (pb <= pc) return b;
    return c;
  }
  // --- [2] 評価と予測 ---
  static calcEntropy(data) {
    if (data.length === 0) return 0;
    const counts = /* @__PURE__ */ new Map();
    for (const v of data) counts.set(v, (counts.get(v) || 0) + 1);
    let entropy = 0;
    for (const count of counts.values()) {
      const p = count / data.length;
      entropy -= p * Math.log2(p);
    }
    return entropy;
  }
  // 【改善案 4】コンテキストに基づく Paeth の改良（適応型予測）
  static applyPaeth(ch, w, h, s, decode) {
    for (let y = decode ? 0 : h - 1; decode ? y < h : y >= 0; decode ? y++ : y--) {
      for (let x = decode ? 0 : w - 1; decode ? x < w : x >= 0; decode ? x++ : x--) {
        const a = x > 0 ? ch[y * s + (x - 1)] : 0;
        const b = y > 0 ? ch[(y - 1) * s + x] : 0;
        const c = x > 0 && y > 0 ? ch[(y - 1) * s + (x - 1)] : 0;
        const energy = Math.abs(a - b) + Math.abs(a - c) + Math.abs(b - c);
        const p = energy > 15 ? this.paeth(a, b, c) : 0;
        ch[y * s + x] += decode ? p : -p;
      }
    }
  }
  static applyAlpha(Y, C, alpha, decode) {
    if (alpha === 0) return;
    for (let i = 1; i < Y.length; i++) {
      const pred = Y[i] * alpha >> 5;
      C[i] += decode ? pred : -pred;
    }
  }
  // --- [3] 変換コア (5/3 整数ウェーブレット) ---
  // 【改善案 3】IWT基底のアップグレード ($5/3$ 変換への接近)
  // 1D リフティング (順変換)
  static iwt1D_53(src, srcOffset, stride, len, tmp) {
    const half = len + 1 >> 1;
    for (let i = 0; i < len; i++) tmp[i] = src[srcOffset + i * stride];
    for (let i = 1; i < len; i += 2) {
      const left = tmp[i - 1];
      const right = i + 1 < len ? tmp[i + 1] : left;
      tmp[i] -= left + right >> 1;
    }
    for (let i = 0; i < len; i += 2) {
      const left = i - 1 >= 0 ? tmp[i - 1] : i + 1 < len ? tmp[i + 1] : 0;
      const right = i + 1 < len ? tmp[i + 1] : left;
      tmp[i] += left + right + 2 >> 2;
    }
    for (let i = 0; i < half; i++) src[srcOffset + i * stride] = tmp[i * 2];
    for (let i = 0; i < len >> 1; i++) src[srcOffset + (half + i) * stride] = tmp[i * 2 + 1];
  }
  // 1D リフティング (逆変換)
  static iiwt1D_53(src, srcOffset, stride, len, tmp) {
    const half = len + 1 >> 1;
    for (let i = 0; i < half; i++) tmp[i * 2] = src[srcOffset + i * stride];
    for (let i = 0; i < len >> 1; i++) tmp[i * 2 + 1] = src[srcOffset + (half + i) * stride];
    for (let i = 0; i < len; i += 2) {
      const left = i - 1 >= 0 ? tmp[i - 1] : i + 1 < len ? tmp[i + 1] : 0;
      const right = i + 1 < len ? tmp[i + 1] : left;
      tmp[i] -= left + right + 2 >> 2;
    }
    for (let i = 1; i < len; i += 2) {
      const left = tmp[i - 1];
      const right = i + 1 < len ? tmp[i + 1] : left;
      tmp[i] += left + right >> 1;
    }
    for (let i = 0; i < len; i++) src[srcOffset + i * stride] = tmp[i];
  }
  static iwt2D(ch, w, h, s, decode) {
    const tmp = new Int32Array(Math.max(w, h));
    if (!decode) {
      for (let y = 0; y < h; y++) this.iwt1D_53(ch, y * s, 1, w, tmp);
      for (let x = 0; x < w; x++) this.iwt1D_53(ch, x, s, h, tmp);
    } else {
      for (let x = 0; x < w; x++) this.iiwt1D_53(ch, x, s, h, tmp);
      for (let y = 0; y < h; y++) this.iiwt1D_53(ch, y * s, 1, w, tmp);
    }
  }
  // --- [4] サブバンド並べ替えと最適化シャッフル ---
  // 【改善案 1】サブバンド・スキャン・オーダー（データの並び順）
  static collectSubbands(tile, w, h, levels) {
    if (levels === 0) return tile.slice();
    const result = new Int32Array(tile.length);
    const mask = new Uint8Array(tile.length);
    let offset = 0;
    const llW = w >> levels, llH = h >> levels;
    for (let y = 0; y < llH; y++) {
      for (let x = 0; x < llW; x++) {
        result[offset++] = tile[y * w + x];
        mask[y * w + x] = 1;
      }
    }
    for (let l = levels; l >= 1; l--) {
      const curW = w >> l - 1, curH = h >> l - 1;
      for (let y = 0; y < curH; y++) {
        for (let x = 0; x < curW; x++) {
          if (!mask[y * w + x]) {
            result[offset++] = tile[y * w + x];
            mask[y * w + x] = 1;
          }
        }
      }
    }
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (!mask[y * w + x]) result[offset++] = tile[y * w + x];
      }
    }
    return result;
  }
  static restoreSubbands(packed, w, h, levels) {
    if (levels === 0) return packed.slice();
    const result = new Int32Array(packed.length);
    const mask = new Uint8Array(packed.length);
    let offset = 0;
    const llW = w >> levels, llH = h >> levels;
    for (let y = 0; y < llH; y++) {
      for (let x = 0; x < llW; x++) {
        result[y * w + x] = packed[offset++];
        mask[y * w + x] = 1;
      }
    }
    for (let l = levels; l >= 1; l--) {
      const curW = w >> l - 1, curH = h >> l - 1;
      for (let y = 0; y < curH; y++) {
        for (let x = 0; x < curW; x++) {
          if (!mask[y * w + x]) {
            result[y * w + x] = packed[offset++];
            mask[y * w + x] = 1;
          }
        }
      }
    }
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (!mask[y * w + x]) result[y * w + x] = packed[offset++];
      }
    }
    return result;
  }
  static shuffle(data) {
    const n = data.length;
    const out = new Uint8Array(n * 4);
    for (let i = 0; i < n; i++) {
      const v = data[i] << 1 ^ data[i] >> 31;
      out[i] = v & 255;
      out[i + n] = v >> 8 & 255;
      out[i + 2 * n] = v >> 16 & 255;
      out[i + 3 * n] = v >> 24 & 255;
    }
    return out;
  }
  static unshuffle(bytes) {
    const n = bytes.length / 4;
    const out = new Int32Array(n);
    for (let i = 0; i < n; i++) {
      const v = bytes[i] | bytes[i + n] << 8 | bytes[i + 2 * n] << 16 | bytes[i + 3 * n] << 24;
      out[i] = v >>> 1 ^ -(v & 1);
    }
    return out;
  }
  // --- [5] メイン API ---
  static async encode(w, h, planes) {
    const cols = Math.ceil(w / this.TILE_SIZE), rows = Math.ceil(h / this.TILE_SIZE);
    const metaList = [];
    const packedDataList = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const tx = c * this.TILE_SIZE, ty = r * this.TILE_SIZE;
        const tw = Math.min(this.TILE_SIZE, w - tx), th = Math.min(this.TILE_SIZE, h - ty);
        const tileLen = tw * th;
        const tY = new Int32Array(tileLen), tCo = new Int32Array(tileLen), tCg = new Int32Array(tileLen);
        for (let y = 0; y < th; y++) {
          for (let x = 0; x < tw; x++) {
            const idx = (ty + y) * w + (tx + x), tidx = y * tw + x;
            tY[tidx] = planes[0][idx];
            tCo[tidx] = planes[1][idx];
            tCg[tidx] = planes[2][idx];
          }
        }
        let bestScore = Infinity, bestL = 0, bestP = false;
        for (let l = 0; l <= 3; l++) {
          if (tw >> l < 2 || th >> l < 2) break;
          for (const p of [true, false]) {
            const test = new Int32Array(tY);
            for (let i = 0; i < l; i++) this.iwt2D(test, tw >> i, th >> i, tw, false);
            if (p) this.applyPaeth(test, tw >> l, th >> l, tw, false);
            const score = this.calcEntropy(test);
            if (score < bestScore) {
              bestScore = score;
              bestL = l;
              bestP = p;
            }
          }
        }
        for (let i = 0; i < bestL; i++) {
          this.iwt2D(tY, tw >> i, th >> i, tw, false);
          this.iwt2D(tCo, tw >> i, th >> i, tw, false);
          this.iwt2D(tCg, tw >> i, th >> i, tw, false);
        }
        if (bestP) {
          this.applyPaeth(tY, tw >> bestL, th >> bestL, tw, false);
          this.applyPaeth(tCo, tw >> bestL, th >> bestL, tw, false);
          this.applyPaeth(tCg, tw >> bestL, th >> bestL, tw, false);
        }
        const aCo = this.calcAlpha(tY, tCo), aCg = this.calcAlpha(tY, tCg);
        this.applyAlpha(tY, tCo, aCo, false);
        this.applyAlpha(tY, tCg, aCg, false);
        const isEmpty = [tY, tCo, tCg].every((a) => a.every((v) => v === 0));
        let flags = bestL | (bestP ? 64 : 0) | (isEmpty ? 128 : 0);
        if (!isEmpty && aCo !== 0) flags |= 16;
        if (!isEmpty && aCg !== 0) flags |= 32;
        metaList.push(flags);
        if (!isEmpty) {
          if (aCo !== 0) metaList.push(aCo & 255);
          if (aCg !== 0) metaList.push(aCg & 255);
          packedDataList.push(this.collectSubbands(tY, tw, th, bestL));
          packedDataList.push(this.collectSubbands(tCo, tw, th, bestL));
          packedDataList.push(this.collectSubbands(tCg, tw, th, bestL));
        }
      }
    }
    const totalDataLen = packedDataList.reduce((acc, a) => acc + a.length, 0);
    const combinedData = new Int32Array(totalDataLen);
    let offset = 0;
    for (const arr of packedDataList) {
      combinedData.set(arr, offset);
      offset += arr.length;
    }
    const header = new DataView(new ArrayBuffer(16));
    this.MAGIC.forEach((b, i) => header.setUint8(i, b));
    header.setUint32(4, w);
    header.setUint32(8, h);
    header.setUint32(12, metaList.length);
    const tileMetas = new Uint8Array(metaList);
    const shuffled = this.shuffle(combinedData);
    const compressed = await new Response(new Blob([tileMetas, shuffled]).stream().pipeThrough(new CompressionStream("gzip"))).blob();
    return new Blob([header, compressed]);
  }
  static calcAlpha(Y, C) {
    let sY2 = 0, sYC = 0;
    for (let i = 1; i < Y.length; i++) {
      sY2 += Y[i] * Y[i];
      sYC += Y[i] * C[i];
    }
    return sY2 === 0 ? 0 : Math.max(-128, Math.min(127, Math.round(sYC / sY2 * 32)));
  }
  static async decode(blob) {
    const headerBuf = await blob.slice(0, 16).arrayBuffer();
    const header = new DataView(headerBuf);
    if (!this.MAGIC.every((v, i) => v === header.getUint8(i))) throw new Error("Invalid LFT file");
    const w = header.getUint32(4), h = header.getUint32(8), metaSize = header.getUint32(12);
    const stream = blob.slice(16).stream().pipeThrough(new DecompressionStream("gzip"));
    const buf = await new Response(stream).arrayBuffer();
    const tileMetas = new Uint8Array(buf, 0, metaSize);
    const unshuffled = this.unshuffle(new Uint8Array(buf, metaSize));
    const cols = Math.ceil(w / this.TILE_SIZE), rows = Math.ceil(h / this.TILE_SIZE);
    const planes = [new Int32Array(w * h), new Int32Array(w * h), new Int32Array(w * h)];
    let cursor = 0;
    let metaCursor = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const tx = c * this.TILE_SIZE, ty = r * this.TILE_SIZE;
        const tw = Math.min(this.TILE_SIZE, w - tx), th = Math.min(this.TILE_SIZE, h - ty);
        const tileLen = tw * th;
        const flags = tileMetas[metaCursor++];
        const l = flags & 15;
        const hasACo = (flags & 16) !== 0;
        const hasACg = (flags & 32) !== 0;
        const p = (flags & 64) !== 0;
        const empty = (flags & 128) !== 0;
        let aCo = 0, aCg = 0;
        const tY = new Int32Array(tileLen), tCo = new Int32Array(tileLen), tCg = new Int32Array(tileLen);
        if (!empty) {
          if (hasACo) aCo = tileMetas[metaCursor++] << 24 >> 24;
          if (hasACg) aCg = tileMetas[metaCursor++] << 24 >> 24;
          const tmpY = unshuffled.subarray(cursor, cursor + tileLen);
          cursor += tileLen;
          const tmpCo = unshuffled.subarray(cursor, cursor + tileLen);
          cursor += tileLen;
          const tmpCg = unshuffled.subarray(cursor, cursor + tileLen);
          cursor += tileLen;
          tY.set(this.restoreSubbands(tmpY, tw, th, l));
          tCo.set(this.restoreSubbands(tmpCo, tw, th, l));
          tCg.set(this.restoreSubbands(tmpCg, tw, th, l));
        }
        this.applyAlpha(tY, tCo, aCo, true);
        this.applyAlpha(tY, tCg, aCg, true);
        if (p) {
          this.applyPaeth(tY, tw >> l, th >> l, tw, true);
          this.applyPaeth(tCo, tw >> l, th >> l, tw, true);
          this.applyPaeth(tCg, tw >> l, th >> l, tw, true);
        }
        for (let i = l - 1; i >= 0; i--) {
          this.iwt2D(tY, tw >> i, th >> i, tw, true);
          this.iwt2D(tCo, tw >> i, th >> i, tw, true);
          this.iwt2D(tCg, tw >> i, th >> i, tw, true);
        }
        for (let y = 0; y < th; y++) {
          for (let x = 0; x < tw; x++) {
            const idx = (ty + y) * w + (tx + x), tidx = y * tw + x;
            planes[0][idx] = tY[tidx];
            planes[1][idx] = tCo[tidx];
            planes[2][idx] = tCg[tidx];
          }
        }
      }
    }
    return { w, h, planes };
  }
};
var originalData = null;
var lastBlob = null;
document.getElementById("upload")?.addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  const img = await createImageBitmap(file);
  const w = img.width, h = img.height;
  const canvas = document.getElementById("canvas-orig");
  const ctx = canvas.getContext("2d");
  canvas.width = w;
  canvas.height = h;
  ctx.drawImage(img, 0, 0);
  originalData = ctx.getImageData(0, 0, w, h).data;
  const planes = [new Int32Array(w * h), new Int32Array(w * h), new Int32Array(w * h)];
  for (let i = 0; i < w * h; i++) {
    const [y, co, cg] = LFT.rgbToYCoCgR(originalData[i * 4], originalData[i * 4 + 1], originalData[i * 4 + 2]);
    planes[0][i] = y;
    planes[1][i] = co;
    planes[2][i] = cg;
  }
  const t0 = performance.now();
  lastBlob = await LFT.encode(w, h, planes);
  const t1 = performance.now();
  document.getElementById("stat-orig-size").innerText = `${(originalData.length / 1024).toFixed(1)} KB`;
  document.getElementById("stat-comp-size").innerText = `${(lastBlob.size / 1024).toFixed(1)} KB`;
  document.getElementById("stat-ratio").innerText = `${(lastBlob.size / originalData.length * 100).toFixed(1)} %`;
  document.getElementById("status-log").innerText = `\u5727\u7E2E\u5B8C\u4E86 (${(t1 - t0).toFixed(1)}ms)`;
  document.getElementById("btn-download").disabled = false;
});
document.getElementById("upload-lft")?.addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  const t0 = performance.now();
  const { w, h, planes } = await LFT.decode(file);
  const out = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const [r, g, b] = LFT.yCoCgRToRgb(planes[0][i], planes[1][i], planes[2][i]);
    out[i * 4] = r;
    out[i * 4 + 1] = g;
    out[i * 4 + 2] = b;
    out[i * 4 + 3] = 255;
  }
  const t1 = performance.now();
  let diffs = 0;
  if (originalData && originalData.length === out.length) {
    for (let i = 0; i < out.length; i++) {
      if (originalData[i] !== out[i]) diffs++;
    }
  } else {
    diffs = -1;
  }
  const canvas = document.getElementById("canvas-recon");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d").putImageData(new ImageData(out, w, h), 0, 0);
  const log = document.getElementById("status-log");
  log.innerText = diffs === 0 ? `\u2705 \u691C\u8A3C\u6210\u529F: \u5B8C\u5168\u4E00\u81F4 (${(t1 - t0).toFixed(1)}ms)` : `\u274C \u691C\u8A3C\u5931\u6557: ${diffs}\u4EF6\u306E\u5DEE\u7570`;
  log.style.color = diffs === 0 ? "green" : "red";
});
document.getElementById("btn-download")?.addEventListener("click", () => {
  if (!lastBlob) return;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(lastBlob);
  a.download = "image.lft";
  a.click();
});
//# sourceMappingURL=LFT.js.map
