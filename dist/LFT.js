/*!
 * LFT 1.0.0
 * Copyright 2026 hi2ma-bu4
 * Licensed under the Apache License, Version 2.0
 * http://www.apache.org/licenses/LICENSE-2.0
 */

// src/index.ts
var LFT = class {
  static MAGIC = new Uint8Array([76, 70, 84, 33]);
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
  // --- 高度なビットストリーム・ライター ---
  static bitBuffer = new Uint8Array(0);
  static bytePos = 0;
  static bitPos = 0;
  static initWrite(size) {
    this.bitBuffer = new Uint8Array(size);
    this.bytePos = 0;
    this.bitPos = 0;
  }
  static writeBit(bit) {
    if (bit) this.bitBuffer[this.bytePos] |= 1 << 7 - this.bitPos;
    if (++this.bitPos === 8) {
      this.bitPos = 0;
      this.bytePos++;
    }
  }
  static writeBits(val, len) {
    for (let i = len - 1; i >= 0; i--) this.writeBit(val >> i & 1);
  }
  static writeRice(val, k) {
    const q = val >> k;
    for (let i = 0; i < q; i++) this.writeBit(1);
    this.writeBit(0);
    this.writeBits(val & (1 << k) - 1, k);
  }
  // --- 高度な予測と符号化エンジン ---
  static async encode(w, h, planes) {
    this.initWrite(w * h * 4);
    const len = w * h;
    for (let p = 0; p < 3; p++) {
      const data = planes[p];
      let sumError = 128;
      let count = 1;
      for (let y = 0; y < h; y++) {
        const off = y * w;
        for (let x = 0; x < w; x++) {
          const i = off + x;
          const a = x > 0 ? data[i - 1] : y > 0 ? data[i - w] : 0;
          const b = y > 0 ? data[i - w] : a;
          const c = x > 0 && y > 0 ? data[i - w - 1] : b;
          let pred = 0;
          if (c >= Math.max(a, b)) pred = Math.min(a, b);
          else if (c <= Math.min(a, b)) pred = Math.max(a, b);
          else pred = a + b - c;
          const diff = data[i] - pred;
          const zz = diff << 1 ^ diff >> 31;
          let k = 0;
          while (count << k < sumError) k++;
          this.writeRice(zz, k);
          sumError += zz;
          count++;
          if (count > 64) {
            sumError >>= 1;
            count >>= 1;
          }
        }
      }
    }
    const header = new DataView(new ArrayBuffer(12));
    this.MAGIC.forEach((b, i) => header.setUint8(i, b));
    header.setUint32(4, w);
    header.setUint32(8, h);
    return new Blob([header, this.bitBuffer.slice(0, this.bytePos + 1)]);
  }
  static async decode(blob) {
    const buf = new Uint8Array(await blob.arrayBuffer());
    const dv = new DataView(buf.buffer);
    const w = dv.getUint32(4), h = dv.getUint32(8);
    const len = w * h;
    let bytePos = 12, bitPos = 0;
    const readBit = () => {
      const bit = buf[bytePos] >> 7 - bitPos & 1;
      if (++bitPos === 8) {
        bitPos = 0;
        bytePos++;
      }
      return bit;
    };
    const readBits = (len2) => {
      let val = 0;
      for (let i = 0; i < len2; i++) val = val << 1 | readBit();
      return val;
    };
    const readRice = (k) => {
      let q = 0;
      while (readBit() === 1) q++;
      return q << k | readBits(k);
    };
    const planes = [new Int32Array(len), new Int32Array(len), new Int32Array(len)];
    for (let p = 0; p < 3; p++) {
      const out = planes[p];
      let sumError = 128, count = 1;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = y * w + x;
          const a = x > 0 ? out[i - 1] : y > 0 ? out[i - w] : 0;
          const b = y > 0 ? out[i - w] : a;
          const c = x > 0 && y > 0 ? out[i - w - 1] : b;
          let pred = 0;
          if (c >= Math.max(a, b)) pred = Math.min(a, b);
          else if (c <= Math.min(a, b)) pred = Math.max(a, b);
          else pred = a + b - c;
          let k = 0;
          while (count << k < sumError) k++;
          const zz = readRice(k);
          const diff = zz >>> 1 ^ -(zz & 1);
          out[i] = pred + diff;
          sumError += zz;
          count++;
          if (count > 64) {
            sumError >>= 1;
            count >>= 1;
          }
        }
      }
    }
    return { w, h, planes };
  }
};
//# sourceMappingURL=LFT.js.map
