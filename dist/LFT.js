/*!
 * LFT 1.1.0
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
  var Model = class _Model {
    static SIZE = 257;
    f = new Uint32Array(_Model.SIZE + 1);
    sum = 0;
    constructor() {
      for (let i = 1; i <= _Model.SIZE; i++) this.update(i - 1, 1);
    }
    update(val, delta) {
      this.sum += delta;
      for (let i = val + 1; i <= _Model.SIZE; i += i & -i) this.f[i] += delta;
    }
    getCum(val) {
      let s = 0;
      for (let i = val; i > 0; i -= i & -i) s += this.f[i];
      return s;
    }
    getFreq(val) {
      return this.getCum(val + 1) - this.getCum(val);
    }
    find(count) {
      let idx = 0;
      for (let i = 256; i > 0; i >>= 1) {
        const next = idx + i;
        if (next <= _Model.SIZE && this.f[next] <= count) {
          idx = next;
          count -= this.f[idx];
        }
      }
      return idx;
    }
    resort() {
      const freqs = new Uint32Array(_Model.SIZE);
      for (let i = 0; i < _Model.SIZE; i++) freqs[i] = this.getFreq(i);
      this.f.fill(0);
      this.sum = 0;
      for (let i = 0; i < _Model.SIZE; i++) this.update(i, freqs[i] >> 1 | 1);
    }
  };
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
      let pred;
      if (dv - dh > 80) pred = w_;
      else if (dh - dv > 80) pred = n;
      else {
        pred = (w_ + n) / 2 + (ne - nw) / 4;
        if (dv - dh > 32) pred = (pred + w_) / 2;
        else if (dh - dv > 32) pred = (pred + n) / 2;
      }
      const activity = dh + dv;
      let aL = 0;
      if (activity > 1) aL = 1;
      if (activity > 3) aL = 2;
      if (activity > 7) aL = 3;
      if (activity > 14) aL = 4;
      if (activity > 30) aL = 5;
      if (activity > 60) aL = 6;
      if (activity > 120) aL = 7;
      if (activity > 250) aL = 8;
      if (activity > 450) aL = 9;
      if (activity > 750) aL = 10;
      return { pred: Math.floor(pred), ctxIdx: aL << 3 | ((w_ > nw ? 1 : 0) | (n > nw ? 2 : 0) | (n > ne ? 4 : 0)) };
    }
    static med(x, y, w, data) {
      const i = y * w + x;
      const n = y > 0 ? data[i - w] : 128;
      const w_ = x > 0 ? data[i - 1] : n;
      const nw = y > 0 && x > 0 ? data[i - w - 1] : n;
      const ne = y > 0 && x < w - 1 ? data[i - w + 1] : n;
      let pred;
      if (nw >= Math.max(w_, n)) pred = Math.min(w_, n);
      else if (nw <= Math.min(w_, n)) pred = Math.max(w_, n);
      else pred = w_ + n - nw;
      const dh = Math.abs(w_ - nw), dv = Math.abs(n - nw), activity = (dh + dv) * 2;
      let aL = 0;
      if (activity > 1) aL = 1;
      if (activity > 3) aL = 2;
      if (activity > 7) aL = 3;
      if (activity > 14) aL = 4;
      if (activity > 30) aL = 5;
      if (activity > 60) aL = 6;
      if (activity > 120) aL = 7;
      if (activity > 250) aL = 8;
      if (activity > 450) aL = 9;
      if (activity > 750) aL = 10;
      return { pred: Math.floor(pred), ctxIdx: aL << 3 | ((w_ > nw ? 1 : 0) | (n > nw ? 2 : 0) | (n > ne ? 4 : 0)) };
    }
    static zigzag(v) {
      return v << 1 ^ v >> 31;
    }
    static unzigzag(v) {
      return v >>> 1 ^ -(v & 1);
    }
    static RANGE_MAX = 1073741823;
    static HALF = 536870912;
    static QUARTER = 268435456;
    static async encode(w, h, rgba) {
      const len = w * h;
      let cA = true, a0 = rgba[3], isG = true;
      for (let i = 0; i < len; i++) {
        if (rgba[i * 4] !== rgba[i * 4 + 1] || rgba[i * 4] !== rgba[i * 4 + 2]) isG = false;
        if (rgba[i * 4 + 3] !== a0) cA = false;
        if (!isG && !cA) break;
      }
      const rawStride = (isG ? 1 : 3) + (cA ? 0 : 1), rawModeSize = 15 + len * rawStride;
      const colors = /* @__PURE__ */ new Set();
      for (let i = 0; i < len; i++) {
        colors.add(rgba[i * 4] << 24 | rgba[i * 4 + 1] << 16 | rgba[i * 4 + 2] << 8 | rgba[i * 4 + 3]);
        if (colors.size > 256) break;
      }
      if (colors.size === 1) {
        const head2 = new DataView(new ArrayBuffer(17));
        this.MAGIC.forEach((b, i) => head2.setUint8(i, b));
        head2.setUint32(4, w);
        head2.setUint32(8, h);
        head2.setUint8(12, 0);
        head2.setUint32(13, colors.values().next().value);
        return new Blob([head2]);
      }
      if (colors.size <= 256) {
        const palette = Array.from(colors).sort((a, b) => (a >>> 0) - (b >>> 0));
        const colorToIndex = /* @__PURE__ */ new Map();
        palette.forEach((c, i) => colorToIndex.set(c, i));
        const indices = new Int32Array(len);
        for (let i = 0; i < len; i++) indices[i] = colorToIndex.get(rgba[i * 4] << 24 | rgba[i * 4 + 1] << 16 | rgba[i * 4 + 2] << 8 | rgba[i * 4 + 3]);
        const { output: encI } = await this.encodePlane(w, h, indices, null, 16);
        const useRawI = encI.length > len, pModeSize = 14 + colors.size * 4 + (useRawI ? len : encI.length);
        if (pModeSize <= rawModeSize) {
          const head2 = new DataView(new ArrayBuffer(14 + colors.size * 4));
          this.MAGIC.forEach((b, i) => head2.setUint8(i, b));
          head2.setUint32(4, w);
          head2.setUint32(8, h);
          head2.setUint8(12, useRawI ? 4 : 1);
          head2.setUint8(13, colors.size - 1);
          palette.forEach((c, i) => head2.setUint32(14 + i * 4, c >>> 0));
          const rawIArr = new Uint8Array(len);
          if (useRawI) {
            for (let i = 0; i < len; i++) rawIArr[i] = indices[i];
          }
          return new Blob([head2, useRawI ? rawIArr : encI]);
        }
      }
      const planes = [];
      if (isG) {
        planes.push(new Int32Array(len));
        for (let i = 0; i < len; i++) planes[0][i] = rgba[i * 4];
        if (!cA) {
          planes.push(new Int32Array(len));
          for (let i = 0; i < len; i++) planes[1][i] = rgba[i * 4 + 3];
        }
      } else {
        planes.push(new Int32Array(len), new Int32Array(len), new Int32Array(len));
        for (let i = 0; i < len; i++) {
          const [y, co, cg] = this.rgbToYCoCgR(rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]);
          planes[0][i] = y;
          planes[1][i] = co;
          planes[2][i] = cg;
        }
        if (!cA) {
          planes.push(new Int32Array(len));
          for (let i = 0; i < len; i++) planes[3][i] = rgba[i * 4 + 3];
        }
      }
      let bestTSize = Infinity, bestBS = 16, bestPlanes = [];
      for (const bs of [16, 32]) {
        let currentP = [], currentS = 0, yRes = null;
        for (let p = 0; p < planes.length; p++) {
          const { output: res, residuals } = await this.encodePlane(w, h, planes[p], !isG && (p === 1 || p === 2) ? yRes : null, bs);
          currentP.push(res);
          currentS += res.length;
          if (p === 0) yRes = residuals;
        }
        if (currentS < bestTSize) {
          bestTSize = currentS;
          bestPlanes = currentP;
          bestBS = bs;
        }
      }
      if (16 + bestTSize >= rawModeSize) {
        const rawD = new Uint8Array(len * rawStride);
        for (let i = 0; i < len; i++) {
          if (isG) rawD[i * rawStride] = rgba[i * 4];
          else {
            rawD[i * rawStride] = rgba[i * 4];
            rawD[i * rawStride + 1] = rgba[i * 4 + 1];
            rawD[i * rawStride + 2] = rgba[i * 4 + 2];
          }
          if (!cA) rawD[i * rawStride + rawStride - 1] = rgba[i * 4 + 3];
        }
        const head2 = new DataView(new ArrayBuffer(15));
        this.MAGIC.forEach((b, i) => head2.setUint8(i, b));
        head2.setUint32(4, w);
        head2.setUint32(8, h);
        head2.setUint8(12, 3);
        head2.setUint8(13, (cA ? 1 : 0) | (isG ? 2 : 0));
        head2.setUint8(14, cA ? a0 : 0);
        return new Blob([head2, rawD]);
      }
      const head = new DataView(new ArrayBuffer(16));
      this.MAGIC.forEach((b, i) => head.setUint8(i, b));
      head.setUint32(4, w);
      head.setUint32(8, h);
      head.setUint8(12, 2);
      head.setUint8(13, (cA ? 1 : 0) | (isG ? 2 : 0));
      head.setUint8(14, cA ? a0 : 0);
      head.setUint8(15, bestBS);
      return new Blob([head, ...bestPlanes]);
    }
    static async encodePlane(w, h, data, yRes, bs) {
      const bw = Math.ceil(w / bs), bh = Math.ceil(h / bs), len = w * h;
      const ccpTrials = [-16, -12, -8, -6, -4, -3, -2, -1, 0, 1, 2, 3, 4, 6, 8, 12];
      const blockParams = new Int32Array(bw * bh), planeResiduals = new Int32Array(len);
      for (let by = 0; by < bh; by++) {
        for (let bx = 0; bx < bw; bx++) {
          const yS = by * bs, yE = Math.min(yS + bs, h), xS = bx * bs, xE = Math.min(xS + bs, w);
          let isC = true, v0 = data[yS * w + xS];
          for (let y = yS; y < yE; y++) {
            for (let x = xS; x < xE; x++)
              if (data[y * w + x] !== v0) {
                isC = false;
                break;
              }
            if (!isC) break;
          }
          if (isC) {
            blockParams[by * bw + bx] = 3 | this.zigzag(v0) << 2;
            for (let y = yS; y < yE; y++) for (let x = xS; x < xE; x++) planeResiduals[y * w + x] = 0;
            continue;
          }
          let bestM = 0, bestFIdx = 8, minE = Infinity;
          for (let m = 0; m < 3; m++) {
            const fR = yRes === null ? [8] : Array.from({ length: 16 }, (_, i) => i);
            for (const fIdx of fR) {
              const f2 = ccpTrials[fIdx];
              let err = 0;
              for (let y = yS; y < yE; y++) {
                for (let x = xS; x < xE; x++) {
                  const i = y * w + x;
                  let pr;
                  if (m === 0) pr = this.gap(x, y, w, data).pred;
                  else if (m === 1) pr = this.med(x, y, w, data).pred;
                  else pr = x > 0 && y > 0 ? data[i - 1] + data[i - w] >> 1 : y > 0 ? data[i - w] : x > 0 ? data[i - 1] : 128;
                  err += Math.abs(data[i] - pr - (yRes === null ? 0 : yRes[i] * f2 >> 3));
                }
              }
              if (err < minE) {
                minE = err;
                bestM = m;
                bestFIdx = fIdx;
              }
            }
          }
          blockParams[by * bw + bx] = bestM | bestFIdx << 2;
          const f = ccpTrials[bestFIdx];
          for (let y = yS; y < yE; y++) {
            for (let x = xS; x < xE; x++) {
              const i = y * w + x;
              let pr;
              if (bestM === 0) pr = this.gap(x, y, w, data).pred;
              else if (bestM === 1) pr = this.med(x, y, w, data).pred;
              else pr = x > 0 && y > 0 ? data[i - 1] + data[i - w] >> 1 : y > 0 ? data[i - w] : x > 0 ? data[i - 1] : 128;
              planeResiduals[i] = data[i] - pr - (yRes === null ? 0 : yRes[i] * f >> 3);
            }
          }
        }
      }
      const output = new Uint8Array(len * 6 + 65536);
      let op = 0, low = 0, high = this.RANGE_MAX, underflow = 0, currentByte = 0, bitCount = 0;
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
        for (; underflow > 0; underflow--) {
          currentByte = currentByte << 1 | bit ^ 1;
          if (++bitCount === 8) {
            output[op++] = currentByte;
            bitCount = 0;
            currentByte = 0;
          }
        }
      };
      const encodeBitRaw = (bit) => {
        const range = high - low + 1, mid = low + Math.floor(range / 2);
        if (bit === 0) high = mid - 1;
        else low = mid;
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
      };
      const encodeEscaped = (v) => {
        const sign = v < 0 ? 1 : 0, abs = Math.abs(v);
        encodeBitRaw(sign);
        let k = 0;
        while (abs >= 1 << k + 8) {
          encodeBitRaw(1);
          k++;
        }
        encodeBitRaw(0);
        for (let b = k + 7; b >= 0; b--) encodeBitRaw(abs >> b & 1);
      };
      for (let i = 0; i < bw * bh; i++) {
        const p = blockParams[i], m = p & 3;
        if (m === 0) {
          encodeBitRaw(0);
        } else if (m === 1) {
          encodeBitRaw(1);
          encodeBitRaw(0);
        } else if (m === 2) {
          encodeBitRaw(1);
          encodeBitRaw(1);
          encodeBitRaw(0);
        } else {
          encodeBitRaw(1);
          encodeBitRaw(1);
          encodeBitRaw(1);
        }
        if (m < 3) {
          if (yRes !== null) {
            const fI = p >> 2 & 15;
            for (let b = 3; b >= 0; b--) encodeBitRaw(fI >> b & 1);
          }
        } else encodeEscaped(this.unzigzag(p >> 2));
      }
      const models = Array.from({ length: 1100 }, () => new Model());
      const biasModels = Array.from({ length: 1100 }, () => ({ sum: 0, count: 0 }));
      for (let y = 0; y < h; y++) {
        const by = Math.floor(y / bs);
        for (let x = 0; x < w; x++) {
          const i = y * w + x, bp = blockParams[by * bw + Math.floor(x / bs)];
          if ((bp & 3) === 3) continue;
          const isMed = (bp & 3) === 1, { ctxIdx } = isMed ? this.med(x, y, w, data) : this.gap(x, y, w, data);
          let cS = 0;
          if (yRes === null) {
            const rL = x > 0 ? planeResiduals[i - 1] : 0, rU = y > 0 ? planeResiduals[i - w] : 0;
            const a = Math.abs(rL) + Math.abs(rU), s = rL + rU < 0 ? 1 : rL + rU > 0 ? 2 : 0;
            cS = s === 0 ? 0 : a <= 4 ? s : a <= 16 ? s + 2 : s + 4;
          } else {
            const ry = yRes[i], a = Math.abs(ry), s = ry < 0 ? 1 : ry > 0 ? 2 : 0;
            const rL = x > 0 ? planeResiduals[i - 1] : 0, rU = y > 0 ? planeResiduals[i - w] : 0;
            const sC = (rL < 0 ? 1 : rL > 0 ? 2 : 0) + (rU < 0 ? 1 : rU > 0 ? 2 : 0);
            cS = s === 0 ? sC > 3 ? 3 : sC : a <= 2 ? s + 4 : a <= 10 ? s + 6 : s + 8;
          }
          const fIdx = ctxIdx * 12 + cS, model = models[fIdx], res = planeResiduals[i];
          const bias = biasModels[fIdx].count > 0 ? Math.trunc(biasModels[fIdx].sum / biasModels[fIdx].count) : 0;
          const diff = res - bias, zz = this.zigzag(diff) >>> 0, zz_c = zz >= 256 ? 256 : zz;
          const range = high - low + 1, cum = model.getCum(zz_c), freq = model.getFreq(zz_c);
          const nL = low + Math.floor(range * cum / model.sum);
          high = low + Math.floor(range * (cum + freq) / model.sum) - 1;
          low = nL;
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
          if (zz_c === 256) encodeEscaped(diff);
          biasModels[fIdx].sum += res;
          biasModels[fIdx].count++;
          if (biasModels[fIdx].count === 128) {
            biasModels[fIdx].sum >>= 1;
            biasModels[fIdx].count >>= 1;
          }
          model.update(zz_c, model.sum < 32768 ? model.sum < 1024 ? 32 : model.sum < 4096 ? 16 : 8 : 0);
          if (model.sum >= 32768) model.resort();
        }
      }
      underflow++;
      if (low < this.QUARTER) applyBit(0);
      else applyBit(1);
      if (bitCount > 0) output[op++] = currentByte << 8 - bitCount;
      const sH = new DataView(new ArrayBuffer(4));
      sH.setUint32(0, op);
      return { output: new Uint8Array([...new Uint8Array(sH.buffer), ...output.subarray(0, op)]), residuals: planeResiduals };
    }
    static async decode(blob) {
      const ab = await blob.arrayBuffer(), dv = new DataView(ab);
      const w = dv.getUint32(4), h = dv.getUint32(8), mode = dv.getUint8(12);
      if (mode === 0) {
        const c = dv.getUint32(13), data = new Uint8Array(w * h * 4), r = c >> 24 & 255, g = c >> 16 & 255, b = c >> 8 & 255, a = c & 255;
        for (let i = 0; i < w * h; i++) {
          data[i * 4] = r;
          data[i * 4 + 1] = g;
          data[i * 4 + 2] = b;
          data[i * 4 + 3] = a;
        }
        return { w, h, data };
      }
      if (mode === 1 || mode === 4) {
        const pS = dv.getUint8(13) + 1, palette = new Uint32Array(pS);
        for (let i = 0; i < pS; i++) palette[i] = dv.getUint32(14 + i * 4);
        let indices;
        if (mode === 4) {
          const raw = new Uint8Array(ab.slice(14 + pS * 4));
          indices = new Int32Array(raw.length);
          for (let i = 0; i < raw.length; i++) indices[i] = raw[i];
        } else {
          const b = new Blob([ab.slice(14 + pS * 4)]);
          indices = (await this.decodePlane(w, h, b, null, 16)).data;
        }
        const data = new Uint8Array(w * h * 4);
        for (let i = 0; i < w * h; i++) {
          const c = palette[indices[i]];
          data[i * 4] = c >> 24 & 255;
          data[i * 4 + 1] = c >> 16 & 255;
          data[i * 4 + 2] = c >> 8 & 255;
          data[i * 4 + 3] = c & 255;
        }
        return { w, h, data };
      }
      const flags = dv.getUint8(13), cA = (flags & 1) === 1, isG = (flags & 2) === 2, a0 = dv.getUint8(14);
      if (mode === 3) {
        const rgba2 = new Uint8Array(w * h * 4), raw = new Uint8Array(ab.slice(15)), stride = (isG ? 1 : 3) + (cA ? 0 : 1);
        for (let i = 0; i < w * h; i++) {
          if (isG) {
            const v = raw[i * stride];
            rgba2[i * 4] = v;
            rgba2[i * 4 + 1] = v;
            rgba2[i * 4 + 2] = v;
          } else {
            rgba2[i * 4] = raw[i * stride];
            rgba2[i * 4 + 1] = raw[i * stride + 1];
            rgba2[i * 4 + 2] = raw[i * stride + 2];
          }
          rgba2[i * 4 + 3] = cA ? a0 : raw[i * stride + stride - 1];
        }
        return { w, h, data: rgba2 };
      }
      let offset = 16;
      const bs = dv.getUint8(15), planes = [];
      let yRes = null;
      const numPlanes = (isG ? 1 : 3) + (cA ? 0 : 1);
      for (let p = 0; p < numPlanes; p++) {
        const size = dv.getUint32(offset), blob2 = new Blob([ab.slice(offset)]), useY = !isG && (p === 1 || p === 2);
        const { data: dP, residuals: res } = await this.decodePlane(w, h, blob2, useY ? yRes : null, bs);
        planes.push(dP);
        if (p === 0) yRes = res;
        offset += 4 + size;
      }
      const rgba = new Uint8Array(w * h * 4);
      for (let i = 0; i < w * h; i++) {
        if (isG) {
          const v = Math.max(0, Math.min(255, planes[0][i]));
          rgba[i * 4] = v;
          rgba[i * 4 + 1] = v;
          rgba[i * 4 + 2] = v;
          rgba[i * 4 + 3] = cA ? a0 : Math.max(0, Math.min(255, planes[1][i]));
        } else {
          const [r, g, b] = this.yCoCgRToRgb(planes[0][i], planes[1][i], planes[2][i]);
          rgba[i * 4] = Math.max(0, Math.min(255, r));
          rgba[i * 4 + 1] = Math.max(0, Math.min(255, g));
          rgba[i * 4 + 2] = Math.max(0, Math.min(255, b));
          rgba[i * 4 + 3] = cA ? a0 : Math.max(0, Math.min(255, planes[3][i]));
        }
      }
      return { w, h, data: rgba };
    }
    static async decodePlane(w, h, blob, yRes, bs) {
      const ab = await blob.arrayBuffer(), buf = new Uint8Array(ab.slice(4));
      let bp = 0, bitIdx = 0;
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
      const decodeBitRaw = () => {
        const range = high - low + 1, mid = low + Math.floor(range / 2);
        let bit = val < mid ? 0 : 1;
        if (bit === 0) high = mid - 1;
        else low = mid;
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
        return bit;
      };
      const decodeEscaped = () => {
        const sign = decodeBitRaw();
        let k = 0;
        while (decodeBitRaw() === 1) k++;
        let abs = 0;
        for (let b = 0; b < k + 8; b++) abs = abs << 1 | decodeBitRaw();
        return sign === 1 ? -abs : abs;
      };
      const bw = Math.ceil(w / bs), bh = Math.ceil(h / bs), blockParams = new Int32Array(bw * bh);
      const ccpTrials = [-16, -12, -8, -6, -4, -3, -2, -1, 0, 1, 2, 3, 4, 6, 8, 12];
      for (let i = 0; i < bw * bh; i++) {
        let m = 0;
        if (decodeBitRaw() === 0) {
          m = 0;
        } else if (decodeBitRaw() === 0) {
          m = 1;
        } else if (decodeBitRaw() === 0) {
          m = 2;
        } else {
          m = 3;
        }
        if (m < 3) {
          let fIdx = 8;
          if (yRes !== null) {
            fIdx = 0;
            for (let b = 0; b < 4; b++) fIdx = fIdx << 1 | decodeBitRaw();
          }
          blockParams[i] = m | fIdx << 2;
        } else blockParams[i] = m | this.zigzag(decodeEscaped()) << 2;
      }
      const models = Array.from({ length: 1100 }, () => new Model());
      const biasModels = Array.from({ length: 1100 }, () => ({ sum: 0, count: 0 }));
      const out = new Int32Array(w * h), planeRes = new Int32Array(w * h);
      for (let y = 0; y < h; y++) {
        const by = Math.floor(y / bs);
        for (let x = 0; x < w; x++) {
          const i = y * w + x, bx = Math.floor(x / bs), bp2 = blockParams[by * bw + bx];
          if ((bp2 & 3) === 3) {
            out[i] = this.unzigzag(bp2 >> 2);
            continue;
          }
          const m = bp2 & 3, f = ccpTrials[bp2 >> 2 & 15];
          let pr;
          if (m === 0) pr = this.gap(x, y, w, out).pred;
          else if (m === 1) pr = this.med(x, y, w, out).pred;
          else pr = x > 0 && y > 0 ? out[i - 1] + out[i - w] >> 1 : y > 0 ? out[i - w] : x > 0 ? out[i - 1] : 128;
          const isMed = m === 1, { ctxIdx } = isMed ? this.med(x, y, w, out) : this.gap(x, y, w, out);
          let cS = 0;
          if (yRes === null) {
            const rL = x > 0 ? planeRes[i - 1] : 0, rU = y > 0 ? planeRes[i - w] : 0;
            const a = Math.abs(rL) + Math.abs(rU), s = rL + rU < 0 ? 1 : rL + rU > 0 ? 2 : 0;
            cS = s === 0 ? 0 : a <= 4 ? s : a <= 16 ? s + 2 : s + 4;
          } else {
            const ry = yRes[i], a = Math.abs(ry), s = ry < 0 ? 1 : ry > 0 ? 2 : 0;
            const rL = x > 0 ? planeRes[i - 1] : 0, rU = y > 0 ? planeRes[i - w] : 0;
            const sC = (rL < 0 ? 1 : rL > 0 ? 2 : 0) + (rU < 0 ? 1 : rU > 0 ? 2 : 0);
            cS = s === 0 ? sC > 3 ? 3 : sC : a <= 2 ? s + 4 : a <= 10 ? s + 6 : s + 8;
          }
          const fIdx = ctxIdx * 12 + cS, model = models[fIdx], range = high - low + 1, count = Math.floor(((val - low + 1) * model.sum - 1) / range);
          const zz_c = model.find(count);
          const nL = low + Math.floor(range * model.getCum(zz_c) / model.sum);
          high = low + Math.floor(range * model.getCum(zz_c + 1) / model.sum) - 1;
          low = nL;
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
          let diff = zz_c === 256 ? decodeEscaped() : this.unzigzag(zz_c);
          const bias = biasModels[fIdx].count > 0 ? Math.trunc(biasModels[fIdx].sum / biasModels[fIdx].count) : 0;
          const res = diff + bias;
          planeRes[i] = res;
          out[i] = res + pr + (yRes === null ? 0 : yRes[i] * f >> 3);
          biasModels[fIdx].sum += res;
          biasModels[fIdx].count++;
          if (biasModels[fIdx].count === 128) {
            biasModels[fIdx].sum >>= 1;
            biasModels[fIdx].count >>= 1;
          }
          model.update(zz_c, model.sum < 32768 ? model.sum < 1024 ? 32 : model.sum < 4096 ? 16 : 8 : 0);
          if (model.sum >= 32768) model.resort();
        }
      }
      return { data: out, residuals: planeRes };
    }
  };
  return __toCommonJS(index_exports);
})();
window.LFT = LFT_MODULE.LFT;
//# sourceMappingURL=LFT.js.map
