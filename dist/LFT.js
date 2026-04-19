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
  // --- [1] 可逆色空間変換 (YCoCg-R) ---
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
  // --- [2] 予測器 (MED: Median Edge Detector) ---
  // JPEG-LS や LOCO-I で採用される、エッジを検知して適応的に予測を切り替える強力なアルゴリズム
  static med(a, b, c) {
    const max = a > b ? a : b;
    const min = a < b ? a : b;
    if (c >= max) return min;
    if (c <= min) return max;
    return a + b - c;
  }
  // --- [3] ZigZag エンコーディング ---
  // 符号付き整数(例: -2, 1) を、符号なしの正の整数(例: 3, 2) にマッピングする
  static zigzag(v) {
    return v << 1 ^ v >> 31;
  }
  static unzigzag(v) {
    return v >>> 1 ^ -(v & 1);
  }
  // --- [4] エンコード・メイン ---
  static async encode(w, h, planes) {
    const len = w * h;
    const resY = new Int32Array(len);
    const resCo = new Int32Array(len);
    const resCg = new Int32Array(len);
    const yPlane = planes[0];
    const coPlane = planes[1];
    const cgPlane = planes[2];
    for (let y = 0; y < h; y++) {
      const rowOffset = y * w;
      for (let x = 0; x < w; x++) {
        const i = rowOffset + x;
        const leftY = x > 0 ? yPlane[i - 1] : y > 0 ? yPlane[i - w] : 0;
        const topY = y > 0 ? yPlane[i - w] : leftY;
        const topLeftY = x > 0 && y > 0 ? yPlane[i - w - 1] : topY;
        resY[i] = yPlane[i] - this.med(leftY, topY, topLeftY);
        const leftCo = x > 0 ? coPlane[i - 1] : y > 0 ? coPlane[i - w] : 0;
        const topCo = y > 0 ? coPlane[i - w] : leftCo;
        const topLeftCo = x > 0 && y > 0 ? coPlane[i - w - 1] : topCo;
        resCo[i] = coPlane[i] - this.med(leftCo, topCo, topLeftCo);
        const leftCg = x > 0 ? cgPlane[i - 1] : y > 0 ? cgPlane[i - w] : 0;
        const topCg = y > 0 ? cgPlane[i - w] : leftCg;
        const topLeftCg = x > 0 && y > 0 ? cgPlane[i - w - 1] : topCg;
        resCg[i] = cgPlane[i] - this.med(leftCg, topCg, topLeftCg);
      }
    }
    let sY2 = 0, sYCo = 0, sYCg = 0;
    for (let i = 0; i < len; i++) {
      sY2 += resY[i] * resY[i];
      sYCo += resY[i] * resCo[i];
      sYCg += resY[i] * resCg[i];
    }
    const alphaCo = sY2 === 0 ? 0 : Math.max(-128, Math.min(127, Math.round(sYCo / sY2 * 32)));
    const alphaCg = sY2 === 0 ? 0 : Math.max(-128, Math.min(127, Math.round(sYCg / sY2 * 32)));
    if (alphaCo !== 0 || alphaCg !== 0) {
      for (let i = 0; i < len; i++) {
        resCo[i] -= resY[i] * alphaCo >> 5;
        resCg[i] -= resY[i] * alphaCg >> 5;
      }
    }
    const lowY = new Uint8Array(len);
    const lowCo = new Uint8Array(len);
    const lowCg = new Uint8Array(len);
    const highY = [];
    const highCo = [];
    const highCg = [];
    const flagBytes = Math.ceil(len / 8);
    const highFlagY = new Uint8Array(flagBytes);
    const highFlagCo = new Uint8Array(flagBytes);
    const highFlagCg = new Uint8Array(flagBytes);
    for (let i = 0; i < len; i++) {
      const zy = this.zigzag(resY[i]);
      lowY[i] = zy & 255;
      if (zy > 255) {
        highFlagY[i >> 3] |= 1 << (i & 7);
        highY.push(zy >> 8);
      }
      const zco = this.zigzag(resCo[i]);
      lowCo[i] = zco & 255;
      if (zco > 255) {
        highFlagCo[i >> 3] |= 1 << (i & 7);
        highCo.push(zco >> 8);
      }
      const zcg = this.zigzag(resCg[i]);
      lowCg[i] = zcg & 255;
      if (zcg > 255) {
        highFlagCg[i >> 3] |= 1 << (i & 7);
        highCg.push(zcg >> 8);
      }
    }
    const payloadSize = flagBytes * 3 + highY.length + highCo.length + highCg.length + len * 3;
    const combined = new Uint8Array(payloadSize);
    let offset = 0;
    combined.set(highFlagY, offset);
    offset += flagBytes;
    combined.set(highFlagCo, offset);
    offset += flagBytes;
    combined.set(highFlagCg, offset);
    offset += flagBytes;
    combined.set(new Uint8Array(highY), offset);
    offset += highY.length;
    combined.set(new Uint8Array(highCo), offset);
    offset += highCo.length;
    combined.set(new Uint8Array(highCg), offset);
    offset += highCg.length;
    combined.set(lowY, offset);
    offset += len;
    combined.set(lowCo, offset);
    offset += len;
    combined.set(lowCg, offset);
    offset += len;
    const header = new DataView(new ArrayBuffer(28));
    this.MAGIC.forEach((b, i) => header.setUint8(i, b));
    header.setUint32(4, w);
    header.setUint32(8, h);
    header.setInt8(12, alphaCo);
    header.setInt8(13, alphaCg);
    header.setUint32(16, highY.length);
    header.setUint32(20, highCo.length);
    header.setUint32(24, highCg.length);
    const compressed = await new Response(new Blob([combined]).stream().pipeThrough(new CompressionStream("gzip"))).blob();
    return new Blob([header, compressed]);
  }
  // --- [5] デコード・メイン ---
  static async decode(blob) {
    const headerBuf = await blob.slice(0, 28).arrayBuffer();
    const header = new DataView(headerBuf);
    if (!this.MAGIC.every((v, i) => v === header.getUint8(i))) throw new Error("Invalid LFT Extreme file");
    const w = header.getUint32(4);
    const h = header.getUint32(8);
    const alphaCo = header.getInt8(12);
    const alphaCg = header.getInt8(13);
    const lenY = header.getUint32(16);
    const lenCo = header.getUint32(20);
    const lenCg = header.getUint32(24);
    const stream = blob.slice(28).stream().pipeThrough(new DecompressionStream("gzip"));
    const buf = await new Response(stream).arrayBuffer();
    const data = new Uint8Array(buf);
    const len = w * h;
    const flagBytes = Math.ceil(len / 8);
    let offset = 0;
    const highFlagY = data.subarray(offset, offset + flagBytes);
    offset += flagBytes;
    const highFlagCo = data.subarray(offset, offset + flagBytes);
    offset += flagBytes;
    const highFlagCg = data.subarray(offset, offset + flagBytes);
    offset += flagBytes;
    const highY = data.subarray(offset, offset + lenY);
    offset += lenY;
    const highCo = data.subarray(offset, offset + lenCo);
    offset += lenCo;
    const highCg = data.subarray(offset, offset + lenCg);
    offset += lenCg;
    const lowY = data.subarray(offset, offset + len);
    offset += len;
    const lowCo = data.subarray(offset, offset + len);
    offset += len;
    const lowCg = data.subarray(offset, offset + len);
    offset += len;
    const resY = new Int32Array(len);
    const resCo = new Int32Array(len);
    const resCg = new Int32Array(len);
    let idxY = 0, idxCo = 0, idxCg = 0;
    for (let i = 0; i < len; i++) {
      let zy = lowY[i];
      if ((highFlagY[i >> 3] & 1 << (i & 7)) !== 0) zy |= highY[idxY++] << 8;
      resY[i] = this.unzigzag(zy);
      let zco = lowCo[i];
      if ((highFlagCo[i >> 3] & 1 << (i & 7)) !== 0) zco |= highCo[idxCo++] << 8;
      resCo[i] = this.unzigzag(zco);
      let zcg = lowCg[i];
      if ((highFlagCg[i >> 3] & 1 << (i & 7)) !== 0) zcg |= highCg[idxCg++] << 8;
      resCg[i] = this.unzigzag(zcg);
    }
    if (alphaCo !== 0 || alphaCg !== 0) {
      for (let i = 0; i < len; i++) {
        resCo[i] += resY[i] * alphaCo >> 5;
        resCg[i] += resY[i] * alphaCg >> 5;
      }
    }
    const planes = [new Int32Array(len), new Int32Array(len), new Int32Array(len)];
    const yPlane = planes[0];
    const coPlane = planes[1];
    const cgPlane = planes[2];
    for (let y = 0; y < h; y++) {
      const rowOffset = y * w;
      for (let x = 0; x < w; x++) {
        const i = rowOffset + x;
        const leftY = x > 0 ? yPlane[i - 1] : y > 0 ? yPlane[i - w] : 0;
        const topY = y > 0 ? yPlane[i - w] : leftY;
        const topLeftY = x > 0 && y > 0 ? yPlane[i - w - 1] : topY;
        yPlane[i] = resY[i] + this.med(leftY, topY, topLeftY);
        const leftCo = x > 0 ? coPlane[i - 1] : y > 0 ? coPlane[i - w] : 0;
        const topCo = y > 0 ? coPlane[i - w] : leftCo;
        const topLeftCo = x > 0 && y > 0 ? coPlane[i - w - 1] : topCo;
        coPlane[i] = resCo[i] + this.med(leftCo, topCo, topLeftCo);
        const leftCg = x > 0 ? cgPlane[i - 1] : y > 0 ? cgPlane[i - w] : 0;
        const topCg = y > 0 ? cgPlane[i - w] : leftCg;
        const topLeftCg = x > 0 && y > 0 ? cgPlane[i - w - 1] : topCg;
        cgPlane[i] = resCg[i] + this.med(leftCg, topCg, topLeftCg);
      }
    }
    return { w, h, planes };
  }
};
//# sourceMappingURL=LFT.js.map
