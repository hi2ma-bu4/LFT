/*!
 * LFT 1.0.1
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
      if (activity > 4) actLevel = 2;
      if (activity > 10) actLevel = 3;
      if (activity > 22) actLevel = 4;
      if (activity > 45) actLevel = 5;
      if (activity > 90) actLevel = 6;
      if (activity > 180) actLevel = 7;
      return { pred: Math.floor(pred), ctxIdx: actLevel };
    }
    static med(x, y, w, data) {
      const i = y * w + x;
      const n = y > 0 ? data[i - w] : 128;
      const w_ = x > 0 ? data[i - 1] : n;
      const nw = y > 0 && x > 0 ? data[i - w - 1] : n;
      let pred;
      if (nw >= Math.max(w_, n)) pred = Math.min(w_, n);
      else if (nw <= Math.min(w_, n)) pred = Math.max(w_, n);
      else pred = w_ + n - nw;
      const dh = Math.abs(w_ - nw);
      const dv = Math.abs(n - nw);
      const activity = dh + dv;
      let actLevel = 0;
      if (activity > 1) actLevel = 1;
      if (activity > 4) actLevel = 2;
      if (activity > 10) actLevel = 3;
      if (activity > 22) actLevel = 4;
      if (activity > 45) actLevel = 5;
      if (activity > 90) actLevel = 6;
      if (activity > 180) actLevel = 7;
      return { pred: Math.floor(pred), ctxIdx: actLevel };
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
    static MODEL_SIZE = 1025;
    static CONTEXTS = 8;
    static async encode(w, h, rgba) {
      const len = w * h;
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
      const predictorTypes = new Uint8Array(4);
      const allResiduals = Array.from({ length: 4 }, () => new Int32Array(len));
      const ccpFactors = new Int8Array(4);
      const ccpTrials = [-16, -12, -8, -6, -4, -3, -2, -1, 0, 1, 2, 3, 4, 6, 8, 12];
      for (let p = 0; p < (constantAlpha ? 3 : 4); p++) {
        let errGap = 0, errMed = 0;
        const data = planes[p];
        for (let i = 0; i < len; i++) {
          const x = i % w, y = Math.floor(i / w);
          errGap += Math.abs(data[i] - this.gap(x, y, w, data).pred);
          errMed += Math.abs(data[i] - this.med(x, y, w, data).pred);
        }
        predictorTypes[p] = errMed < errGap ? 1 : 0;
        const isMed = predictorTypes[p] === 1;
        for (let i = 0; i < len; i++) {
          const x = i % w, y = Math.floor(i / w);
          const { pred } = isMed ? this.med(x, y, w, data) : this.gap(x, y, w, data);
          allResiduals[p][i] = data[i] - pred;
        }
        if (p === 1 || p === 2) {
          let bestF = 0, minErr = Infinity;
          for (const f of ccpTrials) {
            let err = 0;
            for (let i = 0; i < len; i++) {
              err += Math.abs(allResiduals[p][i] - (allResiduals[0][i] * f >> 3));
            }
            if (err < minErr) {
              minErr = err;
              bestF = f;
            }
          }
          ccpFactors[p] = bestF;
        }
      }
      const output = new Uint8Array(len * 5 + 1024);
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
      encodeBitRaw(constantAlpha ? 1 : 0);
      if (constantAlpha) {
        for (let i = 7; i >= 0; i--) encodeBitRaw(alpha0 >> i & 1);
      }
      for (let p = 0; p < 4; p++) encodeBitRaw(predictorTypes[p]);
      for (let p = 1; p <= 2; p++) {
        let fIdx = ccpTrials.indexOf(ccpFactors[p]);
        if (fIdx === -1) fIdx = 8;
        for (let i = 3; i >= 0; i--) encodeBitRaw(fIdx >> i & 1);
      }
      const models = Array.from({ length: 4 * this.CONTEXTS * 3 }, () => {
        const f = new Uint32Array(this.MODEL_SIZE).fill(1);
        return { f, sum: this.MODEL_SIZE };
      });
      const biasModels = Array.from({ length: 4 * this.CONTEXTS * 3 }, () => ({ sum: 0, count: 0 }));
      for (let p = 0; p < (constantAlpha ? 3 : 4); p++) {
        const data = planes[p];
        const isMed = predictorTypes[p] === 1;
        const residualsUsed = new Int32Array(len);
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const i = y * w + x;
            const { pred, ctxIdx } = isMed ? this.med(x, y, w, data) : this.gap(x, y, w, data);
            const signY = p === 1 || p === 2 ? allResiduals[0][i] < 0 ? 1 : allResiduals[0][i] > 0 ? 2 : 0 : 0;
            const fullCtxIdx = p * this.CONTEXTS * 3 + ctxIdx * 3 + signY;
            const bias = biasModels[fullCtxIdx].count > 0 ? Math.trunc(biasModels[fullCtxIdx].sum / biasModels[fullCtxIdx].count) : 0;
            const ccp = p === 1 || p === 2 ? allResiduals[0][i] * ccpFactors[p] >> 3 : 0;
            const diff = data[i] - pred - ccp - bias;
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
              for (let b = 31; b >= 0; b--) encodeBitRaw(zz >> b & 1);
            }
            residualsUsed[i] = diff;
            biasModels[fullCtxIdx].sum += data[i] - pred - ccp;
            biasModels[fullCtxIdx].count++;
            if (biasModels[fullCtxIdx].count === 128) {
              biasModels[fullCtxIdx].sum >>= 1;
              biasModels[fullCtxIdx].count >>= 1;
            }
            model.f[zz_c] += 8;
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
      underflow++;
      if (low < this.QUARTER) applyBit(0);
      else applyBit(1);
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
      const decodeBitRaw = () => {
        const range = high - low + 1;
        const mid = low + Math.floor(range / 2);
        let bit;
        if (val < mid) {
          bit = 0;
          high = mid - 1;
        } else {
          bit = 1;
          low = mid;
        }
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
      const constantAlpha = decodeBitRaw() === 1;
      let alpha0 = 255;
      if (constantAlpha) {
        alpha0 = 0;
        for (let i = 0; i < 8; i++) alpha0 = alpha0 << 1 | decodeBitRaw();
      }
      const predictorTypes = new Uint8Array(4);
      for (let p = 0; p < 4; p++) predictorTypes[p] = decodeBitRaw();
      const ccpFactors = new Int8Array(4);
      const ccpTrials = [-16, -12, -8, -6, -4, -3, -2, -1, 0, 1, 2, 3, 4, 6, 8, 12];
      for (let p = 1; p <= 2; p++) {
        let fIdx = 0;
        for (let i = 0; i < 4; i++) fIdx = fIdx << 1 | decodeBitRaw();
        ccpFactors[p] = ccpTrials[fIdx] ?? 0;
      }
      const models = Array.from({ length: 4 * this.CONTEXTS * 3 }, () => {
        const f = new Uint32Array(this.MODEL_SIZE).fill(1);
        return { f, sum: this.MODEL_SIZE };
      });
      const biasModels = Array.from({ length: 4 * this.CONTEXTS * 3 }, () => ({ sum: 0, count: 0 }));
      const planes = [new Int32Array(len), new Int32Array(len), new Int32Array(len), new Int32Array(len)];
      const allResidualsY = new Int32Array(len);
      if (constantAlpha) planes[3].fill(alpha0);
      for (let p = 0; p < (constantAlpha ? 3 : 4); p++) {
        const out = planes[p];
        const isMed = predictorTypes[p] === 1;
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const i = y * w + x;
            const { pred, ctxIdx } = isMed ? this.med(x, y, w, out) : this.gap(x, y, w, out);
            const signY = p === 1 || p === 2 ? allResidualsY[i] < 0 ? 1 : allResidualsY[i] > 0 ? 2 : 0 : 0;
            const fullCtxIdx = p * this.CONTEXTS * 3 + ctxIdx * 3 + signY;
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
            let zz = zz_c;
            if (zz_c === this.MODEL_SIZE - 1) {
              zz = 0;
              for (let b = 0; b < 32; b++) zz = zz << 1 | decodeBitRaw();
            }
            let diff = this.unzigzag(zz);
            let unbiased = diff + bias;
            if (p === 0) allResidualsY[i] = unbiased;
            const ccp = p === 1 || p === 2 ? allResidualsY[i] * ccpFactors[p] >> 3 : 0;
            out[i] = unbiased + pred + ccp;
            biasModels[fullCtxIdx].sum += unbiased;
            biasModels[fullCtxIdx].count++;
            if (biasModels[fullCtxIdx].count === 128) {
              biasModels[fullCtxIdx].sum >>= 1;
              biasModels[fullCtxIdx].count >>= 1;
            }
            model.f[zz_c] += 8;
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
