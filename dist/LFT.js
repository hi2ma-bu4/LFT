/*!
 * LFT 1.0.0
 * Copyright 2026 hi2ma-bu4
 * Licensed under the Apache License, Version 2.0
 * http://www.apache.org/licenses/LICENSE-2.0
 */
"use strict";
var LFT_MODULE = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // src/index.ts
  var index_exports = {};
  __export(index_exports, {
    LFT: () => LFT
  });
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
    static gap(x, y, w, data) {
      const i = y * w + x;
      const n = y > 0 ? data[i - w] : 128;
      const w_ = x > 0 ? data[i - 1] : n;
      const ne = y > 0 && x < w - 1 ? data[i - w + 1] : n;
      const nw = y > 0 && x > 0 ? data[i - w - 1] : n;
      const nn = y > 1 ? data[i - 2 * w] : n;
      const ww = x > 1 ? data[i - 2] : w_;
      const dh = Math.abs(w_ - ww) + Math.abs(n - nw) + Math.abs(n - ne);
      const dv = Math.abs(w_ - nw) + Math.abs(n - nn) + Math.abs(ne - (y > 1 && x < w - 1 ? data[i - 2 * w + 1] : ne));
      if (dv - dh > 80) return w_;
      if (dh - dv > 80) return n;
      let pred = (w_ + n) / 2 + (ne - nw) / 4;
      if (dv - dh > 32) return (pred + w_) / 2;
      if (dh - dv > 32) return (pred + n) / 2;
      return pred;
    }
    static zigzag(v) {
      return v << 1 ^ v >> 31;
    }
    static unzigzag(v) {
      return v >>> 1 ^ -(v & 1);
    }
    // 30-bit range coder for stability in JS
    static RANGE_MAX = 1073741823;
    static HALF = 536870912;
    static QUARTER = 268435456;
    static MODEL_SIZE = 1024;
    static async encode(w, h, rgba) {
      const len = w * h;
      const planes = [new Int32Array(len), new Int32Array(len), new Int32Array(len), new Int32Array(len)];
      for (let i = 0; i < len; i++) {
        const [y, co, cg] = this.rgbToYCoCgR(rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]);
        planes[0][i] = y;
        planes[1][i] = co;
        planes[2][i] = cg;
        planes[3][i] = rgba[i * 4 + 3];
      }
      const output = new Uint8Array(len * 5 + 12);
      let op = 0, low = 0, high = this.RANGE_MAX, underflow = 0;
      let currentByte = 0, bitCount = 0;
      const putBit = (bit) => {
        currentByte = currentByte << 1 | bit;
        if (++bitCount === 8) {
          output[op++] = currentByte;
          bitCount = 0;
          currentByte = 0;
        }
      };
      const applyBit = (bit) => {
        putBit(bit);
        for (; underflow > 0; underflow--) putBit(bit ^ 1);
      };
      const models = Array.from({ length: 4 }, () => {
        const f = new Uint32Array(this.MODEL_SIZE + 1).fill(1);
        return { f, sum: this.MODEL_SIZE };
      });
      for (let p = 0; p < 4; p++) {
        const data = planes[p];
        const model = models[p];
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            let zz = this.zigzag(data[y * w + x] - Math.round(this.gap(x, y, w, data)));
            if (zz >= this.MODEL_SIZE) zz = this.MODEL_SIZE - 1;
            const range = high - low + 1;
            let cum = 0;
            for (let j = 0; j < zz; j++) cum += model.f[j];
            const next_low = low + Math.floor(range * cum / model.sum);
            high = low + Math.floor(range * (cum + model.f[zz]) / model.sum) - 1;
            low = next_low;
            while (true) {
              if (high < this.HALF) applyBit(0);
              else if (low >= this.HALF) {
                applyBit(1);
                low -= this.HALF;
                high -= this.HALF;
              } else if (low >= this.QUARTER && high < this.HALF + this.QUARTER) {
                underflow++;
                low -= this.QUARTER;
                high -= this.QUARTER;
              } else break;
              low = low << 1 >>> 0;
              high = (high << 1 | 1) >>> 0;
            }
            model.f[zz] += 8;
            model.sum += 8;
            if (model.sum > 32768) {
              model.sum = 0;
              for (let j = 0; j < this.MODEL_SIZE; j++) {
                model.f[j] = model.f[j] >> 1 | 1;
                model.sum += model.f[j];
              }
            }
          }
        }
      }
      applyBit(low >= this.QUARTER ? 1 : 0);
      if (bitCount > 0) output[op++] = currentByte << 8 - bitCount;
      const head = new DataView(new ArrayBuffer(12));
      this.MAGIC.forEach((b, i) => head.setUint8(i, b));
      head.setUint32(4, w);
      head.setUint32(8, h);
      return new Blob([head, output.subarray(0, op)]);
    }
    static async decode(blob) {
      const ab = await blob.arrayBuffer();
      const dv = new DataView(ab);
      const w = dv.getUint32(4), h = dv.getUint32(8);
      const buf = new Uint8Array(ab);
      const len = w * h;
      let bp = 12, bitIdx = 0;
      const getBit = () => {
        if (bp >= buf.length) return 0;
        const b = buf[bp] >> 7 - bitIdx & 1;
        if (++bitIdx === 8) {
          bitIdx = 0;
          bp++;
        }
        return b;
      };
      let low = 0, high = this.RANGE_MAX, val = 0;
      for (let i = 0; i < 30; i++) val = (val << 1 | getBit()) >>> 0;
      const models = Array.from({ length: 4 }, () => {
        const f = new Uint32Array(this.MODEL_SIZE + 1).fill(1);
        return { f, sum: this.MODEL_SIZE };
      });
      const planes = [new Int32Array(len), new Int32Array(len), new Int32Array(len), new Int32Array(len)];
      for (let p = 0; p < 4; p++) {
        const out = planes[p];
        const model = models[p];
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const range = high - low + 1;
            const count = Math.floor(((val - low + 1) * model.sum - 1) / range);
            let zz = 0, tmpCum = 0;
            while (tmpCum + model.f[zz] <= count) tmpCum += model.f[zz++];
            const next_low = low + Math.floor(range * tmpCum / model.sum);
            high = low + Math.floor(range * (tmpCum + model.f[zz]) / model.sum) - 1;
            low = next_low;
            while (true) {
              if (high < this.HALF) {
              } else if (low >= this.HALF) {
                low -= this.HALF;
                high -= this.HALF;
                val -= this.HALF;
              } else if (low >= this.QUARTER && high < this.HALF + this.QUARTER) {
                low -= this.QUARTER;
                high -= this.QUARTER;
                val -= this.QUARTER;
              } else break;
              low = low << 1 >>> 0;
              high = (high << 1 | 1) >>> 0;
              val = (val << 1 | getBit()) >>> 0;
            }
            out[y * w + x] = this.unzigzag(zz) + Math.round(this.gap(x, y, w, out));
            model.f[zz] += 8;
            model.sum += 8;
            if (model.sum > 32768) {
              model.sum = 0;
              for (let j = 0; j < this.MODEL_SIZE; j++) {
                model.f[j] = model.f[j] >> 1 | 1;
                model.sum += model.f[j];
              }
            }
          }
        }
      }
      const rgba = new Uint8Array(len * 4);
      for (let i = 0; i < len; i++) {
        const [r, g, b] = this.yCoCgRToRgb(planes[0][i], planes[1][i], planes[2][i]);
        rgba[i * 4] = Math.max(0, Math.min(255, r));
        rgba[i * 4 + 1] = Math.max(0, Math.min(255, g));
        rgba[i * 4 + 2] = Math.max(0, Math.min(255, b));
        rgba[i * 4 + 3] = Math.max(0, Math.min(255, planes[3][i]));
      }
      return { w, h, data: rgba };
    }
  };
  return __toCommonJS(index_exports);
})();
window.LFT = LFT_MODULE.LFT;
//# sourceMappingURL=LFT.js.map
