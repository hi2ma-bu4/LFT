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
      let pred;
      if (dv - dh > 80) pred = w_;
      else if (dh - dv > 80) pred = n;
      else {
        pred = (w_ + n) / 2 + (ne - nw) / 4;
        if (dv - dh > 32) pred = (pred + w_) / 2;
        else if (dh - dv > 32) pred = (pred + n) / 2;
      }
      const activity = dh + dv;
      return { pred: Math.floor(pred), ctxIdx: this.getActivityLevel(activity) };
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
      return { pred: Math.floor(pred), ctxIdx: this.getActivityLevel(activity) };
    }
    static getActivityLevel(activity) {
      if (activity <= 2) return 0;
      if (activity <= 6) return 1;
      if (activity <= 14) return 2;
      if (activity <= 30) return 3;
      if (activity <= 62) return 4;
      if (activity <= 126) return 5;
      if (activity <= 254) return 6;
      return 7;
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
        const biasModelsTemp = Array.from({ length: this.CONTEXTS }, () => ({ sum: 0, count: 0 }));
        const biasModelsMedTemp = Array.from({ length: this.CONTEXTS }, () => ({ sum: 0, count: 0 }));
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const idx = y * w + x;
            const resGap = this.gap(x, y, w, data);
            const resMed = this.med(x, y, w, data);
            const biasGap = biasModelsTemp[resGap.ctxIdx].count > 0 ? Math.round(biasModelsTemp[resGap.ctxIdx].sum / biasModelsTemp[resGap.ctxIdx].count) : 0;
            const biasMed = biasModelsMedTemp[resMed.ctxIdx].count > 0 ? Math.round(biasModelsMedTemp[resMed.ctxIdx].sum / biasModelsMedTemp[resMed.ctxIdx].count) : 0;
            const diffGap = data[idx] - (resGap.pred + biasGap);
            const diffMed = data[idx] - (resMed.pred + biasMed);
            errGap += Math.abs(diffGap);
            errMed += Math.abs(diffMed);
            biasModelsTemp[resGap.ctxIdx].sum += diffGap;
            biasModelsTemp[resGap.ctxIdx].count++;
            if (biasModelsTemp[resGap.ctxIdx].count === 256) {
              biasModelsTemp[resGap.ctxIdx].sum >>= 1;
              biasModelsTemp[resGap.ctxIdx].count >>= 1;
            }
            biasModelsMedTemp[resMed.ctxIdx].sum += diffMed;
            biasModelsMedTemp[resMed.ctxIdx].count++;
            if (biasModelsMedTemp[resMed.ctxIdx].count === 256) {
              biasModelsMedTemp[resMed.ctxIdx].sum >>= 1;
              biasModelsMedTemp[resMed.ctxIdx].count >>= 1;
            }
          }
        }
        predictorTypes[p] = errMed < errGap ? 1 : 0;
        const isMed = predictorTypes[p] === 1;
        for (let i = 0; i < len; i++) {
          const x = i % w, y = Math.floor(i / w);
          const { pred } = isMed ? this.med(x, y, w, data) : this.gap(x, y, w, data);
          allResiduals[p][i] = data[i] - pred;
        }
        if (p === 1 || p === 2) {
          let bestF = 0;
          let minErr = Infinity;
          for (const f of ccpTrials) {
            let err = 0;
            const isMed2 = predictorTypes[p] === 1;
            const biasModelsCcp = Array.from({ length: this.CONTEXTS }, () => ({ sum: 0, count: 0 }));
            const data2 = planes[p];
            for (let y = 0; y < h; y++) {
              for (let x = 0; x < w; x++) {
                const idx = y * w + x;
                const { pred, ctxIdx } = isMed2 ? this.med(x, y, w, data2) : this.gap(x, y, w, data2);
                const bias = biasModelsCcp[ctxIdx].count > 0 ? Math.round(biasModelsCcp[ctxIdx].sum / biasModelsCcp[ctxIdx].count) : 0;
                const diff = data2[idx] - (pred + bias) - (allResiduals[0][idx] * f >> 3);
                err += Math.abs(diff);
                const actualRes = data2[idx] - (pred + bias);
                biasModelsCcp[ctxIdx].sum += actualRes;
                biasModelsCcp[ctxIdx].count++;
                if (biasModelsCcp[ctxIdx].count === 256) {
                  biasModelsCcp[ctxIdx].sum >>= 1;
                  biasModelsCcp[ctxIdx].count >>= 1;
                }
              }
            }
            if (err < minErr) {
              minErr = err;
              bestF = f;
            }
          }
          ccpFactors[p] = bestF;
        }
      }
      const output = new Uint8Array(len * 8 + 1024);
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
      const head = new DataView(new ArrayBuffer(12));
      this.MAGIC.forEach((b, i) => head.setUint8(i, b));
      head.setUint32(4, w);
      head.setUint32(8, h);
      encodeBitRaw(constantAlpha ? 1 : 0);
      if (constantAlpha) {
        for (let i = 7; i >= 0; i--) encodeBitRaw(alpha0 >> i & 1);
      }
      for (let p = 0; p < 4; p++) encodeBitRaw(predictorTypes[p]);
      for (let p = 0; p < 4; p++) {
        let fIdx = ccpTrials.indexOf(ccpFactors[p]);
        if (fIdx === -1) fIdx = 8;
        for (let i = 3; i >= 0; i--) encodeBitRaw(fIdx >> i & 1);
      }
      const models = Array.from({ length: 4 * this.CONTEXTS * 27 }, () => {
        const f = new Uint32Array(this.MODEL_SIZE).fill(1);
        return { f, sum: this.MODEL_SIZE };
      });
      const biasModels = Array.from({ length: 4 * this.CONTEXTS * 27 }, () => ({ sum: 0, count: 0 }));
      for (let p = 0; p < (constantAlpha ? 3 : 4); p++) {
        const data = planes[p];
        const isMed = predictorTypes[p] === 1;
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const i = y * w + x;
            const { pred, ctxIdx } = isMed ? this.med(x, y, w, data) : this.gap(x, y, w, data);
            const leftRes = x > 0 ? allResiduals[p][i - 1] : 0;
            const upRes = y > 0 ? allResiduals[p][i - w] : 0;
            const leftSign = leftRes < 0 ? 1 : leftRes > 0 ? 2 : 0;
            const upSign = upRes < 0 ? 1 : upRes > 0 ? 2 : 0;
            const nwRes = x > 0 && y > 0 ? allResiduals[p][i - w - 1] : 0;
            const nwSign = nwRes < 0 ? 1 : nwRes > 0 ? 2 : 0;
            const finalCtxIdx = ctxIdx * 27 + leftSign * 9 + upSign * 3 + nwSign;
            const biasIdx = p * (this.CONTEXTS * 27) + finalCtxIdx;
            const bias = biasModels[biasIdx].count > 0 ? Math.round(biasModels[biasIdx].sum / biasModels[biasIdx].count) : 0;
            let diff = data[i] - (pred + bias);
            if (p === 1 || p === 2) {
              diff -= allResiduals[0][i] * ccpFactors[p] >> 3;
            }
            const zzFull = this.zigzag(diff);
            let zz = zzFull >>> 0;
            let model = models[biasIdx];
            if (zz >= this.MODEL_SIZE - 1) zz = this.MODEL_SIZE - 1;
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
            if (zz === this.MODEL_SIZE - 1) {
              for (let i2 = 31; i2 >= 0; i2--) encodeBitRaw(zzFull >>> i2 & 1);
            }
            const actualResidual = diff + (p === 1 || p === 2 ? allResiduals[0][i] * ccpFactors[p] >> 3 : 0);
            allResiduals[p][i] = actualResidual;
            biasModels[biasIdx].sum += actualResidual;
            biasModels[biasIdx].count++;
            if (biasModels[biasIdx].count === 256) {
              biasModels[biasIdx].sum >>= 1;
              biasModels[biasIdx].count >>= 1;
            }
            const inc = 8 + (ctxIdx < 2 ? 8 : 0);
            model.f[zz] += inc;
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
      }
      underflow++;
      if (low < this.QUARTER) applyBit(0);
      else applyBit(1);
      if (bitCount > 0) output[op++] = currentByte << 8 - bitCount;
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
      for (let p = 0; p < 4; p++) {
        let fIdx = 0;
        for (let i = 0; i < 4; i++) fIdx = fIdx << 1 | decodeBitRaw();
        ccpFactors[p] = ccpTrials[fIdx] ?? 0;
      }
      const models = Array.from({ length: 4 * this.CONTEXTS * 27 }, () => {
        const f = new Uint32Array(this.MODEL_SIZE).fill(1);
        return { f, sum: this.MODEL_SIZE };
      });
      const biasModels = Array.from({ length: 4 * this.CONTEXTS * 27 }, () => ({ sum: 0, count: 0 }));
      const planes = [new Int32Array(len), new Int32Array(len), new Int32Array(len), new Int32Array(len)];
      const allResiduals = Array.from({ length: 4 }, () => new Int32Array(len));
      if (constantAlpha) planes[3].fill(alpha0);
      for (let p = 0; p < (constantAlpha ? 3 : 4); p++) {
        const out = planes[p];
        const isMed = predictorTypes[p] === 1;
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const i = y * w + x;
            const { pred, ctxIdx } = isMed ? this.med(x, y, w, out) : this.gap(x, y, w, out);
            const leftRes = x > 0 ? allResiduals[p][i - 1] : 0;
            const upRes = y > 0 ? allResiduals[p][i - w] : 0;
            const leftSign = leftRes < 0 ? 1 : leftRes > 0 ? 2 : 0;
            const upSign = upRes < 0 ? 1 : upRes > 0 ? 2 : 0;
            const nwRes = x > 0 && y > 0 ? allResiduals[p][i - w - 1] : 0;
            const nwSign = nwRes < 0 ? 1 : nwRes > 0 ? 2 : 0;
            const finalCtxIdx = ctxIdx * 27 + leftSign * 9 + upSign * 3 + nwSign;
            const biasIdx = p * (this.CONTEXTS * 27) + finalCtxIdx;
            const bias = biasModels[biasIdx].count > 0 ? Math.round(biasModels[biasIdx].sum / biasModels[biasIdx].count) : 0;
            const model = models[biasIdx];
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
            let valZZ = zz;
            if (zz === this.MODEL_SIZE - 1) {
              valZZ = 0;
              for (let i2 = 0; i2 < 32; i2++) valZZ = valZZ << 1 | decodeBitRaw();
            }
            let diff = this.unzigzag(valZZ);
            const actualResidual = diff + (p === 1 || p === 2 ? allResiduals[0][i] * ccpFactors[p] >> 3 : 0);
            if (p === 1 || p === 2) {
              allResiduals[p][i] = actualResidual;
            } else {
              allResiduals[p][i] = diff;
            }
            out[i] = allResiduals[p][i] + pred + bias;
            biasModels[biasIdx].sum += actualResidual;
            biasModels[biasIdx].count++;
            if (biasModels[biasIdx].count === 256) {
              biasModels[biasIdx].sum >>= 1;
              biasModels[biasIdx].count >>= 1;
            }
            const inc = 8 + (ctxIdx < 2 ? 8 : 0);
            model.f[zz] += inc;
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
