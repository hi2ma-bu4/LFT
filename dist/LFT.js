/*!
 * LFT 1.0.0
 * Copyright 2026 hi2ma-bu4
 * Licensed under the Apache License, Version 2.0
 * http://www.apache.org/licenses/LICENSE-2.0
 */

// src/index.ts
var LFT = class {
  static LEVELS = 1;
  // ここでレベルを調整
  // --- [1] 可逆色空間 (変更なし) ---
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
  // --- [2] Paeth予測 (変更なし) ---
  static paethPredictor(a, b, c) {
    const p = a + b - c;
    const pa = Math.abs(p - a);
    const pb = Math.abs(p - b);
    const pc = Math.abs(p - c);
    if (pa <= pb && pa <= pc) return a;
    if (pb <= pc) return b;
    return c;
  }
  static applyPaeth(ch, w, h, stride, decode = false) {
    if (!decode) {
      for (let y = h - 1; y >= 0; y--) {
        for (let x = w - 1; x >= 0; x--) {
          const a = x > 0 ? ch[y * stride + (x - 1)] : 0;
          const b = y > 0 ? ch[(y - 1) * stride + x] : 0;
          const c = x > 0 && y > 0 ? ch[(y - 1) * stride + (x - 1)] : 0;
          ch[y * stride + x] -= this.paethPredictor(a, b, c);
        }
      }
    } else {
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const a = x > 0 ? ch[y * stride + (x - 1)] : 0;
          const b = y > 0 ? ch[(y - 1) * stride + x] : 0;
          const c = x > 0 && y > 0 ? ch[(y - 1) * stride + (x - 1)] : 0;
          ch[y * stride + x] += this.paethPredictor(a, b, c);
        }
      }
    }
  }
  // --- [3] 多段IWT (変更なし) ---
  static applyMultiLevelIWT(ch, w, h, levels, decode = false) {
    if (!decode) {
      for (let i = 0; i < levels; i++) {
        const curW = w >> i;
        const curH = h >> i;
        if (curW < 2 || curH < 2) break;
        this.iwtStep2D(ch, curW, curH, w);
      }
      this.applyPaeth(ch, w >> levels, h >> levels, w, false);
    } else {
      this.applyPaeth(ch, w >> levels, h >> levels, w, true);
      for (let i = levels - 1; i >= 0; i--) {
        const curW = w >> i;
        const curH = h >> i;
        if (curW < 2 || curH < 2) break;
        this.inverseIwtStep2D(ch, curW, curH, w);
      }
    }
  }
  static iwtStep2D(ch, w, h, s) {
    const tmp = new Int32Array(w * h);
    const hw = w >> 1;
    const hh = h >> 1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < hw; x++) {
        const a = ch[y * s + x * 2], b = ch[y * s + x * 2 + 1];
        tmp[y * w + x] = a + b >> 1;
        tmp[y * w + x + hw] = a - b;
      }
    }
    for (let x = 0; x < w; x++) {
      for (let y = 0; y < hh; y++) {
        const a = tmp[y * 2 * w + x], b = tmp[(y * 2 + 1) * w + x];
        ch[y * s + x] = a + b >> 1;
        ch[(y + hh) * s + x] = a - b;
      }
    }
  }
  static inverseIwtStep2D(ch, w, h, s) {
    const tmp = new Int32Array(w * h);
    const hw = w >> 1;
    const hh = h >> 1;
    for (let x = 0; x < w; x++) {
      for (let y = 0; y < hh; y++) {
        const sl = ch[y * s + x], d = ch[(y + hh) * s + x];
        tmp[y * 2 * w + x] = sl + (d + 1 >> 1);
        tmp[(y * 2 + 1) * w + x] = sl - (d >> 1);
      }
    }
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < hw; x++) {
        const sl = tmp[y * w + x], d = tmp[y * w + x + hw];
        ch[y * s + x * 2] = sl + (d + 1 >> 1);
        ch[y * s + x * 2 + 1] = sl - (d >> 1);
      }
    }
  }
  // --- [4] 改善：サブバンド独立エントロピー推定 ---
  static totalEstimatedSize(ch, w, h, levels) {
    let totalBits = 0;
    const getEntropy = (data) => {
      if (data.length === 0) return 0;
      const counts = /* @__PURE__ */ new Map();
      data.forEach((v) => counts.set(v, (counts.get(v) || 0) + 1));
      let e = 0;
      counts.forEach((c) => {
        const p = c / data.length;
        e -= p * Math.log2(p);
      });
      return e * data.length;
    };
    for (let i = 0; i < levels; i++) {
      const cw = w >> i;
      const ch_ = h >> i;
      const hw = cw >> 1;
      const hh = ch_ >> 1;
      totalBits += getEntropy(this.extractSubband(ch, w, hw, 0, hw, hh));
      totalBits += getEntropy(this.extractSubband(ch, w, 0, hh, hw, hh));
      totalBits += getEntropy(this.extractSubband(ch, w, hw, hh, hw, hh));
    }
    const lw = w >> levels;
    const lh = h >> levels;
    totalBits += getEntropy(this.extractSubband(ch, w, 0, 0, lw, lh));
    return totalBits / 8;
  }
  static extractSubband(ch, stride, ox, oy, w, h) {
    const out = new Int32Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        out[y * w + x] = ch[(oy + y) * stride + (ox + x)];
      }
    }
    return out;
  }
};
var upload = document.getElementById("upload");
upload.addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  const levels = LFT.LEVELS;
  const img = await createImageBitmap(file);
  const mask = (1 << levels) - 1;
  const w = img.width & ~mask;
  const h = img.height & ~mask;
  const canvasOrig = document.getElementById("canvas-orig");
  const ctx = canvasOrig.getContext("2d");
  canvasOrig.width = w;
  canvasOrig.height = h;
  ctx.drawImage(img, 0, 0, w, h);
  const srcData = ctx.getImageData(0, 0, w, h).data;
  const size = w * h;
  const planes = [new Int32Array(size), new Int32Array(size), new Int32Array(size)];
  for (let i = 0; i < size; i++) {
    const [y, co, cg] = LFT.rgbToYCoCgR(srcData[i * 4], srcData[i * 4 + 1], srcData[i * 4 + 2]);
    planes[0][i] = y;
    planes[1][i] = co;
    planes[2][i] = cg;
  }
  const t0 = performance.now();
  planes.forEach((p) => LFT.applyMultiLevelIWT(p, w, h, levels, false));
  const t1 = performance.now();
  const planesCopy = planes.map((p) => new Int32Array(p));
  const t2 = performance.now();
  planesCopy.forEach((p) => LFT.applyMultiLevelIWT(p, w, h, levels, true));
  const decoded = new Uint8ClampedArray(srcData.length);
  for (let i = 0; i < size; i++) {
    const [r, g, b] = LFT.yCoCgRToRgb(planesCopy[0][i], planesCopy[1][i], planesCopy[2][i]);
    decoded[i * 4] = r;
    decoded[i * 4 + 1] = g;
    decoded[i * 4 + 2] = b;
    decoded[i * 4 + 3] = srcData[i * 4 + 3];
  }
  const t3 = performance.now();
  let diffs = 0;
  for (let i = 0; i < srcData.length; i++) if (srcData[i] !== decoded[i]) diffs++;
  const estSize = planes.reduce((acc, p) => acc + LFT.totalEstimatedSize(p, w, h, levels), 0);
  const origSize = srcData.length;
  document.getElementById("stat-orig-size").innerText = `${(origSize / 1024).toFixed(1)} KB`;
  document.getElementById("stat-comp-size").innerText = `${(estSize / 1024).toFixed(1)} KB`;
  document.getElementById("stat-ratio").innerText = `${(estSize / origSize * 100).toFixed(1)} %`;
  document.getElementById("stat-speed").innerText = `${(t1 - t0).toFixed(1)}ms / ${(t3 - t2).toFixed(1)}ms`;
  const statusLog = document.getElementById("status-log");
  statusLog.className = diffs === 0 ? "status success" : "status error";
  statusLog.innerText = diffs === 0 ? `\u2705 \u691C\u8A3C\u6210\u529F: \u5B8C\u5168\u4E00\u81F4 (v4.1)` : `\u274C \u691C\u8A3C\u5931\u6557: ${diffs}\u7B87\u6240\u306E\u5DEE\u7570`;
  const canvasFreq = document.getElementById("canvas-freq");
  canvasFreq.width = w;
  canvasFreq.height = h;
  const freqView = new Uint8ClampedArray(srcData.length);
  for (let i = 0; i < size; i++) {
    freqView[i * 4] = Math.abs(planes[0][i]) * 4;
    freqView[i * 4 + 1] = Math.abs(planes[1][i]) * 4;
    freqView[i * 4 + 2] = Math.abs(planes[2][i]) * 4;
    freqView[i * 4 + 3] = 255;
  }
  canvasFreq.getContext("2d").putImageData(new ImageData(freqView, w, h), 0, 0);
  const canvasRecon = document.getElementById("canvas-recon");
  canvasRecon.width = w;
  canvasRecon.height = h;
  canvasRecon.getContext("2d").putImageData(new ImageData(decoded, w, h), 0, 0);
});
//# sourceMappingURL=LFT.js.map
