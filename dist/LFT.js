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
      let actLevel = 0;
      if (activity > 1) actLevel = 1;
      if (activity > 3) actLevel = 2;
      if (activity > 7) actLevel = 3;
      if (activity > 14) actLevel = 4;
      if (activity > 30) actLevel = 5;
      if (activity > 60) actLevel = 6;
      if (activity > 120) actLevel = 7;
      if (activity > 250) actLevel = 8;
      if (activity > 450) actLevel = 9;
      if (activity > 750) actLevel = 10;
      const gradCtx = (w_ > nw ? 1 : 0) | (n > nw ? 2 : 0) | (n > ne ? 4 : 0);
      return { pred: Math.floor(pred), ctxIdx: actLevel << 3 | gradCtx };
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
      const dh = Math.abs(w_ - nw);
      const dv = Math.abs(n - nw);
      const activity = (dh + dv) * 2;
      let actLevel = 0;
      if (activity > 1) actLevel = 1;
      if (activity > 3) actLevel = 2;
      if (activity > 7) actLevel = 3;
      if (activity > 14) actLevel = 4;
      if (activity > 30) actLevel = 5;
      if (activity > 60) actLevel = 6;
      if (activity > 120) actLevel = 7;
      if (activity > 250) actLevel = 8;
      if (activity > 450) actLevel = 9;
      if (activity > 750) actLevel = 10;
      const gradCtx = (w_ > nw ? 1 : 0) | (n > nw ? 2 : 0) | (n > ne ? 4 : 0);
      return { pred: Math.floor(pred), ctxIdx: actLevel << 3 | gradCtx };
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
    static MODEL_SIZE = 257;
    static CONTEXTS = 880;
    static async encode(w, h, rgba) {
      const len = w * h;
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
        const c = colors.values().next().value;
        head2.setUint32(13, c >>> 0);
        return new Blob([head2]);
      }
      if (colors.size <= 256) {
        const palette = Array.from(colors).sort();
        const colorToIndex = /* @__PURE__ */ new Map();
        palette.forEach((c, i) => colorToIndex.set(c, i));
        const indices = new Int32Array(len);
        for (let i = 0; i < len; i++) {
          const c = rgba[i * 4] << 24 | rgba[i * 4 + 1] << 16 | rgba[i * 4 + 2] << 8 | rgba[i * 4 + 3];
          indices[i] = colorToIndex.get(c);
        }
        const { output: encodedIndices } = await this.encodePlane(w, h, indices, null);
        const useRawIndices = encodedIndices.length > len;
        const head2 = new DataView(new ArrayBuffer(13 + 1 + colors.size * 4));
        this.MAGIC.forEach((b, i) => head2.setUint8(i, b));
        head2.setUint32(4, w);
        head2.setUint32(8, h);
        head2.setUint8(12, useRawIndices ? 4 : 1);
        head2.setUint8(13, colors.size - 1);
        palette.forEach((c, i) => head2.setUint32(14 + i * 4, c >>> 0));
        if (useRawIndices) {
          const rawIndices = new Uint8Array(len);
          for (let i = 0; i < len; i++) rawIndices[i] = indices[i];
          return new Blob([head2, rawIndices]);
        }
        return new Blob([head2, encodedIndices]);
      }
      const planes = [new Int32Array(len), new Int32Array(len), new Int32Array(len), new Int32Array(len)];
      let constantAlpha = true;
      const alpha0 = rgba[3];
      for (let i = 0; i < len; i++) {
        const [y, co, cg] = this.rgbToYCoCgR(rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]);
        planes[0][i] = y;
        planes[1][i] = co;
        planes[2][i] = cg;
        planes[3][i] = rgba[i * 4 + 3];
        if (planes[3][i] !== alpha0) constantAlpha = false;
      }
      const head = new DataView(new ArrayBuffer(15));
      this.MAGIC.forEach((b, i) => head.setUint8(i, b));
      head.setUint32(4, w);
      head.setUint32(8, h);
      head.setUint8(12, 2);
      head.setUint8(13, constantAlpha ? 1 : 0);
      head.setUint8(14, constantAlpha ? alpha0 : 0);
      const encodedPlanes = [];
      let totalPredictiveSize = 0;
      let yResiduals = null;
      let bestEncodedPlanes = [];
      let bestTotalSize = Infinity;
      let bestBlockSize = 16;
      for (const bs of [16, 32]) {
        const currentEncodedPlanes = [];
        let currentTotalSize = 0;
        let currentYResiduals = null;
        for (let p = 0; p < (constantAlpha ? 3 : 4); p++) {
          const { output: res, residuals } = await this.encodePlane(w, h, planes[p], p === 0 ? null : currentYResiduals, bs);
          currentEncodedPlanes.push(res);
          currentTotalSize += res.length;
          if (p === 0) currentYResiduals = residuals;
        }
        if (currentTotalSize < bestTotalSize) {
          bestTotalSize = currentTotalSize;
          bestEncodedPlanes = currentEncodedPlanes;
          bestBlockSize = bs;
        }
      }
      const finalHead = new DataView(new ArrayBuffer(16));
      this.MAGIC.forEach((b, i) => finalHead.setUint8(i, b));
      finalHead.setUint32(4, w);
      finalHead.setUint32(8, h);
      finalHead.setUint8(12, 2);
      finalHead.setUint8(13, constantAlpha ? 1 : 0);
      finalHead.setUint8(14, constantAlpha ? alpha0 : 0);
      finalHead.setUint8(15, bestBlockSize);
      if (bestTotalSize > len * (constantAlpha ? 3 : 4)) {
        const rawHead = new DataView(new ArrayBuffer(15));
        this.MAGIC.forEach((b, i) => rawHead.setUint8(i, b));
        rawHead.setUint32(4, w);
        rawHead.setUint32(8, h);
        rawHead.setUint8(12, 3);
        rawHead.setUint8(13, constantAlpha ? 1 : 0);
        rawHead.setUint8(14, constantAlpha ? alpha0 : 0);
        const stride = constantAlpha ? 3 : 4;
        const rawData = new Uint8Array(len * stride);
        for (let i = 0; i < len; i++) {
          rawData[i * stride] = rgba[i * 4];
          rawData[i * stride + 1] = rgba[i * 4 + 1];
          rawData[i * stride + 2] = rgba[i * 4 + 2];
          if (!constantAlpha) rawData[i * stride + 3] = rgba[i * 4 + 3];
        }
        return new Blob([rawHead, rawData]);
      }
      return new Blob([finalHead, ...bestEncodedPlanes]);
    }
    static async encodePlane(w, h, data, yResiduals, blockSize = 16) {
      const len = w * h;
      const bw = Math.ceil(w / blockSize);
      const bh = Math.ceil(h / blockSize);
      const ccpTrials = [-16, -12, -8, -6, -4, -3, -2, -1, 0, 1, 2, 3, 4, 6, 8, 12];
      const blockParams = new Uint8Array(bw * bh);
      const planeResiduals = new Int32Array(len);
      for (let by = 0; by < bh; by++) {
        const yStart = by * blockSize;
        const yEnd = Math.min(yStart + blockSize, h);
        for (let bx = 0; bx < bw; bx++) {
          const xStart = bx * blockSize;
          const xEnd = Math.min(xStart + blockSize, w);
          let bestParam = 0, minErr = Infinity;
          for (let isMed = 0; isMed <= 1; isMed++) {
            const fRange = yResiduals === null ? [0] : Array.from({ length: 16 }, (_, i) => i);
            for (const fIdx of fRange) {
              const f = ccpTrials[fIdx];
              let err = 0;
              for (let y = yStart; y < yEnd; y++) {
                const rowOff = y * w;
                for (let x = xStart; x < xEnd; x++) {
                  const i = rowOff + x;
                  const { pred } = isMed ? this.med(x, y, w, data) : this.gap(x, y, w, data);
                  const ccp = yResiduals === null ? 0 : yResiduals[i] * f >> 3;
                  err += Math.abs(data[i] - pred - ccp);
                }
              }
              if (err < minErr) {
                minErr = err;
                bestParam = isMed | fIdx << 1;
              }
            }
          }
          blockParams[by * bw + bx] = bestParam;
          const finalIsMed = (bestParam & 1) === 1;
          const finalF = ccpTrials[bestParam >> 1];
          for (let y = yStart; y < yEnd; y++) {
            const rowOff = y * w;
            for (let x = xStart; x < xEnd; x++) {
              const i = rowOff + x;
              const { pred } = finalIsMed ? this.med(x, y, w, data) : this.gap(x, y, w, data);
              planeResiduals[i] = data[i] - pred - (yResiduals === null ? 0 : yResiduals[i] * finalF >> 3);
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
        for (; underflow > 0; underflow--) putBit(bit ^ 1);
      };
      const encodeBitRaw = (bit) => {
        const range = high - low + 1;
        const mid = low + Math.floor(range / 2);
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
      for (let i = 0; i < bw * bh; i++) {
        const param = blockParams[i];
        encodeBitRaw(param & 1);
        if (yResiduals !== null) {
          for (let b = 3; b >= 0; b--) encodeBitRaw(param >> b + 1 & 1);
        }
      }
      const models = Array.from({ length: this.CONTEXTS * 12 }, () => {
        const f = new Uint32Array(this.MODEL_SIZE).fill(1);
        return { f, sum: this.MODEL_SIZE };
      });
      const biasModels = Array.from({ length: this.CONTEXTS * 12 }, () => ({ sum: 0, count: 0 }));
      for (let y = 0; y < h; y++) {
        const rowOff = y * w;
        const by = Math.floor(y / blockSize);
        for (let x = 0; x < w; x++) {
          const i = rowOff + x;
          const bx = Math.floor(x / blockSize);
          const param = blockParams[by * bw + bx];
          const isMed = (param & 1) === 1;
          const { ctxIdx } = isMed ? this.med(x, y, w, data) : this.gap(x, y, w, data);
          let crossState = 0;
          if (yResiduals === null) {
            const rL = x > 0 ? planeResiduals[i - 1] : 0;
            const rU = y > 0 ? planeResiduals[i - w] : 0;
            const a = Math.abs(rL) + Math.abs(rU);
            const s = rL + rU < 0 ? 1 : rL + rU > 0 ? 2 : 0;
            if (s === 0) crossState = 0;
            else if (a <= 4) crossState = s;
            else if (a <= 16) crossState = s + 2;
            else crossState = s + 4;
          } else {
            const ry = yResiduals[i];
            const a = Math.abs(ry);
            const s = ry < 0 ? 1 : ry > 0 ? 2 : 0;
            const rL = x > 0 ? planeResiduals[i - 1] : 0;
            const sL = rL < 0 ? 1 : rL > 0 ? 2 : 0;
            const rU = y > 0 ? planeResiduals[i - w] : 0;
            const sU = rU < 0 ? 1 : rU > 0 ? 2 : 0;
            if (s === 0) crossState = sL + sU;
            else if (a <= 2) crossState = s + 4;
            else if (a <= 10) crossState = s + 6;
            else crossState = s + 8;
          }
          const fullCtxIdx = ctxIdx * 12 + (crossState > 11 ? 11 : crossState);
          const bias = biasModels[fullCtxIdx].count > 0 ? Math.trunc(biasModels[fullCtxIdx].sum / biasModels[fullCtxIdx].count) : 0;
          const residual = planeResiduals[i];
          const diff = residual - bias;
          const zz = this.zigzag(diff) >>> 0;
          const zz_c = zz >= this.MODEL_SIZE - 1 ? this.MODEL_SIZE - 1 : zz;
          const model = models[fullCtxIdx];
          const range = high - low + 1;
          let cum = 0;
          for (let j = 0; j < zz_c; j++) cum += model.f[j];
          const next_low = low + Math.floor(range * cum / model.sum);
          high = low + Math.floor(range * (cum + model.f[zz_c]) / model.sum) - 1;
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
          if (zz_c === this.MODEL_SIZE - 1) {
            const sign = diff < 0 ? 1 : 0;
            const absVal = Math.abs(diff);
            encodeBitRaw(sign);
            let k = 0;
            while (absVal >= 1 << k + 8) {
              encodeBitRaw(1);
              k++;
            }
            encodeBitRaw(0);
            for (let b = k + 7; b >= 0; b--) encodeBitRaw(absVal >> b & 1);
          }
          biasModels[fullCtxIdx].sum += residual;
          biasModels[fullCtxIdx].count++;
          if (biasModels[fullCtxIdx].count === 128) {
            biasModels[fullCtxIdx].sum >>= 1;
            biasModels[fullCtxIdx].count >>= 1;
          }
          const inc = model.sum < 1024 ? 32 : model.sum < 4096 ? 16 : 8;
          model.f[zz_c] += inc;
          model.sum += inc;
          if (model.sum > 32768) {
            model.sum = 0;
            for (let j = 0; j < this.MODEL_SIZE; j++) {
              model.f[j] = model.f[j] >> 1 | 1;
              model.sum += model.f[j];
            }
          }
        }
      }
      underflow++;
      if (low < this.QUARTER) applyBit(0);
      else applyBit(1);
      if (bitCount > 0) output[op++] = currentByte << 8 - bitCount;
      const sizeHead = new DataView(new ArrayBuffer(4));
      sizeHead.setUint32(0, op);
      return { output: new Uint8Array([...new Uint8Array(sizeHead.buffer), ...output.subarray(0, op)]), residuals: planeResiduals };
    }
    static async decode(blob) {
      const ab = await blob.arrayBuffer();
      const dv = new DataView(ab);
      const w = dv.getUint32(4), h = dv.getUint32(8);
      const mode = dv.getUint8(12);
      if (mode === 0) {
        const c = dv.getUint32(13);
        const data = new Uint8Array(w * h * 4);
        const r = c >> 24 & 255, g = c >> 16 & 255, b = c >> 8 & 255, a = c & 255;
        for (let i = 0; i < w * h; i++) {
          data[i * 4] = r;
          data[i * 4 + 1] = g;
          data[i * 4 + 2] = b;
          data[i * 4 + 3] = a;
        }
        return { w, h, data };
      }
      if (mode === 1 || mode === 4) {
        const paletteSize = dv.getUint8(13) + 1;
        const palette = new Uint32Array(paletteSize);
        for (let i = 0; i < paletteSize; i++) palette[i] = dv.getUint32(14 + i * 4);
        let indices;
        if (mode === 4) {
          indices = new Uint8Array(ab.slice(14 + paletteSize * 4));
        } else {
          const indicesBlob = new Blob([ab.slice(14 + paletteSize * 4)]);
          const { data: decodedIndices } = await this.decodePlane(w, h, indicesBlob, null);
          indices = decodedIndices;
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
      const constantAlpha = dv.getUint8(13) === 1;
      const alpha0 = dv.getUint8(14);
      if (mode === 3) {
        const rgba2 = new Uint8Array(w * h * 4);
        const rawData = new Uint8Array(ab.slice(15));
        const stride = constantAlpha ? 3 : 4;
        for (let i = 0; i < w * h; i++) {
          rgba2[i * 4] = rawData[i * stride];
          rgba2[i * 4 + 1] = rawData[i * stride + 1];
          rgba2[i * 4 + 2] = rawData[i * stride + 2];
          rgba2[i * 4 + 3] = constantAlpha ? alpha0 : rawData[i * stride + 3];
        }
        return { w, h, data: rgba2 };
      }
      let offset = 16;
      const blockSize = dv.getUint8(15);
      const planes = [];
      let yResiduals = null;
      for (let p = 0; p < (constantAlpha ? 3 : 4); p++) {
        const planeSize = dv.getUint32(offset);
        const planeBlob = new Blob([ab.slice(offset)]);
        const { data: decodedPlane, residuals } = await this.decodePlane(w, h, planeBlob, p === 0 ? null : yResiduals, blockSize);
        planes.push(decodedPlane);
        if (p === 0) yResiduals = residuals;
        offset += 4 + planeSize;
      }
      const rgba = new Uint8Array(w * h * 4);
      for (let i = 0; i < w * h; i++) {
        const [r, g, b] = this.yCoCgRToRgb(planes[0][i], planes[1][i], planes[2][i]);
        rgba[i * 4] = Math.max(0, Math.min(255, r));
        rgba[i * 4 + 1] = Math.max(0, Math.min(255, g));
        rgba[i * 4 + 2] = Math.max(0, Math.min(255, b));
        rgba[i * 4 + 3] = constantAlpha ? alpha0 : Math.max(0, Math.min(255, planes[3][i]));
      }
      return { w, h, data: rgba };
    }
    static async decodePlane(w, h, blob, yResiduals, blockSize = 16) {
      const ab = await blob.arrayBuffer();
      const dv = new DataView(ab);
      const buf = new Uint8Array(ab.slice(4));
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
        const range = high - low + 1;
        const mid = low + Math.floor(range / 2);
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
      const bw = Math.ceil(w / blockSize);
      const bh = Math.ceil(h / blockSize);
      const blockParams = new Int32Array(bw * bh);
      const ccpTrials = [-16, -12, -8, -6, -4, -3, -2, -1, 0, 1, 2, 3, 4, 6, 8, 12];
      for (let i = 0; i < bw * bh; i++) {
        let prm = decodeBitRaw();
        if (yResiduals !== null) {
          let fIdx = 0;
          for (let b = 0; b < 4; b++) fIdx = fIdx << 1 | decodeBitRaw();
          prm |= fIdx << 1;
        }
        blockParams[i] = prm;
      }
      const models = Array.from({ length: this.CONTEXTS * 12 }, () => {
        const f = new Uint32Array(this.MODEL_SIZE).fill(1);
        return { f, sum: this.MODEL_SIZE };
      });
      const biasModels = Array.from({ length: this.CONTEXTS * 12 }, () => ({ sum: 0, count: 0 }));
      const out = new Int32Array(w * h);
      const planeResiduals = new Int32Array(w * h);
      for (let y = 0; y < h; y++) {
        const rowOff = y * w;
        const by = Math.floor(y / blockSize);
        for (let x = 0; x < w; x++) {
          const i = rowOff + x;
          const bx = Math.floor(x / blockSize);
          const param = blockParams[by * bw + bx];
          const isMed = (param & 1) === 1;
          const f = ccpTrials[param >> 1];
          const { pred, ctxIdx } = isMed ? this.med(x, y, w, out) : this.gap(x, y, w, out);
          let crossState = 0;
          if (yResiduals === null) {
            const rL = x > 0 ? planeResiduals[i - 1] : 0;
            const rU = y > 0 ? planeResiduals[i - w] : 0;
            const a = Math.abs(rL) + Math.abs(rU);
            const s = rL + rU < 0 ? 1 : rL + rU > 0 ? 2 : 0;
            if (s === 0) crossState = 0;
            else if (a <= 4) crossState = s;
            else if (a <= 16) crossState = s + 2;
            else crossState = s + 4;
          } else {
            const ry = yResiduals[i];
            const a = Math.abs(ry);
            const s = ry < 0 ? 1 : ry > 0 ? 2 : 0;
            const rL = x > 0 ? planeResiduals[i - 1] : 0;
            const sL = rL < 0 ? 1 : rL > 0 ? 2 : 0;
            const rU = y > 0 ? planeResiduals[i - w] : 0;
            const sU = rU < 0 ? 1 : rU > 0 ? 2 : 0;
            if (s === 0) crossState = sL + sU;
            else if (a <= 2) crossState = s + 4;
            else if (a <= 10) crossState = s + 6;
            else crossState = s + 8;
          }
          const fullCtxIdx = ctxIdx * 12 + (crossState > 11 ? 11 : crossState);
          const bias = biasModels[fullCtxIdx].count > 0 ? Math.trunc(biasModels[fullCtxIdx].sum / biasModels[fullCtxIdx].count) : 0;
          const model = models[fullCtxIdx];
          const range = high - low + 1;
          const count = Math.floor(((val - low + 1) * model.sum - 1) / range);
          let zz_c = 0, tmpCum = 0;
          while (tmpCum + model.f[zz_c] <= count) tmpCum += model.f[zz_c++];
          const next_low = low + Math.floor(range * tmpCum / model.sum);
          high = low + Math.floor(range * (tmpCum + model.f[zz_c]) / model.sum) - 1;
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
          let diff = 0;
          if (zz_c === this.MODEL_SIZE - 1) {
            const sign = decodeBitRaw();
            let k = 0;
            while (decodeBitRaw() === 1) k++;
            let absVal = 0;
            for (let b = 0; b < k + 8; b++) absVal = absVal << 1 | decodeBitRaw();
            diff = sign === 1 ? -absVal : absVal;
          } else {
            diff = this.unzigzag(zz_c);
          }
          const residual = diff + bias;
          planeResiduals[i] = residual;
          const ccp = yResiduals === null ? 0 : yResiduals[i] * f >> 3;
          out[i] = residual + pred + ccp;
          biasModels[fullCtxIdx].sum += residual;
          biasModels[fullCtxIdx].count++;
          if (biasModels[fullCtxIdx].count === 128) {
            biasModels[fullCtxIdx].sum >>= 1;
            biasModels[fullCtxIdx].count >>= 1;
          }
          const inc = model.sum < 1024 ? 32 : model.sum < 4096 ? 16 : 8;
          model.f[zz_c] += inc;
          model.sum += inc;
          if (model.sum > 32768) {
            model.sum = 0;
            for (let j = 0; j < this.MODEL_SIZE; j++) {
              model.f[j] = model.f[j] >> 1 | 1;
              model.sum += model.f[j];
            }
          }
        }
      }
      return { data: out, residuals: planeResiduals };
    }
  };
  return __toCommonJS(index_exports);
})();
window.LFT = LFT_MODULE.LFT;
//# sourceMappingURL=LFT.js.map
