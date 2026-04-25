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
    static UNIFORM_FREQS = (() => {
      const freqs = new Uint32Array(_Model.SIZE);
      freqs.fill(1);
      return freqs;
    })();
    static UNIFORM_FENWICK = (() => {
      const fenwick = new Uint32Array(_Model.SIZE + 1);
      for (let i = 1; i <= _Model.SIZE; i++) {
        fenwick[i] += 1;
        const parent = i + (i & -i);
        if (parent <= _Model.SIZE) fenwick[parent] += fenwick[i];
      }
      return fenwick;
    })();
    f = new Uint32Array(_Model.SIZE + 1);
    freqs = new Uint32Array(_Model.SIZE);
    sum = 0;
    constructor() {
      this.reset();
    }
    reset() {
      this.freqs.set(_Model.UNIFORM_FREQS);
      this.f.set(_Model.UNIFORM_FENWICK);
      this.sum = _Model.SIZE;
    }
    rebuildFenwick() {
      this.f.fill(0);
      for (let i = 1; i <= _Model.SIZE; i++) {
        this.f[i] += this.freqs[i - 1];
        const parent = i + (i & -i);
        if (parent <= _Model.SIZE) this.f[parent] += this.f[i];
      }
    }
    update(val, delta) {
      if (delta === 0) return;
      this.sum += delta;
      this.freqs[val] += delta;
      for (let i = val + 1; i <= _Model.SIZE; i += i & -i) this.f[i] += delta;
    }
    getCum(val) {
      let s = 0;
      for (let i = val; i > 0; i -= i & -i) s += this.f[i];
      return s;
    }
    getFreq(val) {
      return this.freqs[val];
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
      this.sum = 0;
      for (let i = 0; i < _Model.SIZE; i++) {
        const freq = this.freqs[i] >> 1 | 1;
        this.freqs[i] = freq;
        this.sum += freq;
      }
      this.rebuildFenwick();
    }
  };
  var LFT = class {
    static MAGIC = new Uint8Array([76, 70, 84, 33]);
    static COMPRESSED_RAW_FORMATS = [
      { code: 0, format: "deflate" },
      { code: 1, format: "brotli" }
    ];
    static CCP_TRIALS = new Int8Array([-16, -12, -8, -6, -4, -3, -2, -1, 0, 1, 2, 3, 4, 6, 8, 12]);
    static MODEL_COUNT = 1100;
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
    static gapInto(x, y, w, data, out) {
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
        pred = (w_ + n << 1) + ne - nw >> 2;
        if (dv - dh > 32) pred = pred + w_ >> 1;
        else if (dh - dv > 32) pred = pred + n >> 1;
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
      out[0] = pred;
      out[1] = aL << 3 | ((w_ > nw ? 1 : 0) | (n > nw ? 2 : 0) | (n > ne ? 4 : 0));
    }
    static medInto(x, y, w, data, out) {
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
      out[0] = pred;
      out[1] = aL << 3 | ((w_ > nw ? 1 : 0) | (n > nw ? 2 : 0) | (n > ne ? 4 : 0));
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
    static createBlockLayout(w, h, bs) {
      const bw = Math.ceil(w / bs), bh = Math.ceil(h / bs);
      const blockXByPixel = new Uint16Array(w), blockRowOffsetByPixel = new Int32Array(h);
      let blockX = 0, nextBlockX = bs;
      for (let x = 0; x < w; x++) {
        if (x === nextBlockX) {
          blockX++;
          nextBlockX += bs;
        }
        blockXByPixel[x] = blockX;
      }
      let blockY = 0, nextBlockY = bs;
      for (let y = 0; y < h; y++) {
        if (y === nextBlockY) {
          blockY++;
          nextBlockY += bs;
        }
        blockRowOffsetByPixel[y] = blockY * bw;
      }
      return { bs, bw, bh, blockXByPixel, blockRowOffsetByPixel };
    }
    static createModelWorkspace() {
      return {
        models: Array.from({ length: this.MODEL_COUNT }, () => new Model()),
        biasSums: new Int32Array(this.MODEL_COUNT),
        biasCounts: new Int32Array(this.MODEL_COUNT)
      };
    }
    static resetModelWorkspace(workspace) {
      workspace.biasSums.fill(0);
      workspace.biasCounts.fill(0);
      for (const model of workspace.models) model.reset();
    }
    static createRawData(w, h, rgba, isG, cA) {
      const len = w * h, rawStride = (isG ? 1 : 3) + (cA ? 0 : 1), rawD = new Uint8Array(len * rawStride);
      for (let i = 0; i < len; i++) {
        if (isG) rawD[i * rawStride] = rgba[i * 4];
        else {
          rawD[i * rawStride] = rgba[i * 4];
          rawD[i * rawStride + 1] = rgba[i * 4 + 1];
          rawD[i * rawStride + 2] = rgba[i * 4 + 2];
        }
        if (!cA) rawD[i * rawStride + rawStride - 1] = rgba[i * 4 + 3];
      }
      return rawD;
    }
    static createRawCandidate(w, h, isG, cA, a0, rawD) {
      const head = new DataView(new ArrayBuffer(15));
      this.MAGIC.forEach((b, i) => head.setUint8(i, b));
      head.setUint32(4, w);
      head.setUint32(8, h);
      head.setUint8(12, 3);
      head.setUint8(13, (cA ? 1 : 0) | (isG ? 2 : 0));
      head.setUint8(14, cA ? a0 : 0);
      return { size: 15 + rawD.length, parts: [head, rawD] };
    }
    static async runCompression(data, format) {
      try {
        const stream = new Blob([data]).stream().pipeThrough(new CompressionStream(format));
        return new Uint8Array(await new Response(stream).arrayBuffer());
      } catch {
        return null;
      }
    }
    static async runDecompression(data, format) {
      const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream(format));
      return new Uint8Array(await new Response(stream).arrayBuffer());
    }
    static async createCompressedRawCandidate(w, h, isG, cA, a0, rawD, maxSize) {
      const deflateFormat = this.COMPRESSED_RAW_FORMATS[0];
      const deflateBytes = await this.runCompression(rawD, deflateFormat.format);
      if (deflateBytes === null || 16 + deflateBytes.length >= maxSize) return null;
      let best = { bytes: deflateBytes, code: deflateFormat.code };
      const brotliFormat = this.COMPRESSED_RAW_FORMATS[1];
      const brotliBytes = await this.runCompression(rawD, brotliFormat.format);
      if (brotliBytes !== null && brotliBytes.length < best.bytes.length) {
        best = { bytes: brotliBytes, code: brotliFormat.code };
      }
      const head = new DataView(new ArrayBuffer(16));
      this.MAGIC.forEach((b, i) => head.setUint8(i, b));
      head.setUint32(4, w);
      head.setUint32(8, h);
      head.setUint8(12, 5);
      head.setUint8(13, (cA ? 1 : 0) | (isG ? 2 : 0));
      head.setUint8(14, cA ? a0 : 0);
      head.setUint8(15, best.code);
      return { size: 16 + best.bytes.length, parts: [head, best.bytes] };
    }
    static decodeRawData(w, h, raw, isG, cA, a0) {
      const rgba = new Uint8Array(w * h * 4), stride = (isG ? 1 : 3) + (cA ? 0 : 1);
      for (let i = 0; i < w * h; i++) {
        if (isG) {
          const v = raw[i * stride];
          rgba[i * 4] = v;
          rgba[i * 4 + 1] = v;
          rgba[i * 4 + 2] = v;
        } else {
          rgba[i * 4] = raw[i * stride];
          rgba[i * 4 + 1] = raw[i * stride + 1];
          rgba[i * 4 + 2] = raw[i * stride + 2];
        }
        rgba[i * 4 + 3] = cA ? a0 : raw[i * stride + stride - 1];
      }
      return rgba;
    }
    static getCompressedRawFormat(code) {
      const format = this.COMPRESSED_RAW_FORMATS.find((candidate) => candidate.code === code);
      if (format === void 0) throw new Error(`Unsupported compressed raw format: ${code}`);
      return format.format;
    }
    static pushVarint(target, value) {
      while (value >= 128) {
        target.push(value & 127 | 128);
        value >>>= 7;
      }
      target.push(value);
    }
    static readVarint(data, offset) {
      let value = 0, shift = 0;
      while (offset < data.length) {
        const byte = data[offset++];
        value |= (byte & 127) << shift;
        if ((byte & 128) === 0) return { value, offset };
        shift += 7;
      }
      throw new Error("Unexpected end of dominant overlay stream");
    }
    static pushZigZagVarint(target, value) {
      this.pushVarint(target, this.zigzag(value));
    }
    static readZigZagVarint(data, offset) {
      const decoded = this.readVarint(data, offset);
      return { value: this.unzigzag(decoded.value), offset: decoded.offset };
    }
    static async createCompressedPayloadCandidate(w, h, mode, extraHeader, payload, maxSize) {
      const deflateFormat = this.COMPRESSED_RAW_FORMATS[0];
      const deflateBytes = await this.runCompression(payload, deflateFormat.format);
      if (deflateBytes === null || 14 + extraHeader.length + deflateBytes.length >= maxSize) return null;
      let best = { bytes: deflateBytes, code: deflateFormat.code };
      const brotliFormat = this.COMPRESSED_RAW_FORMATS[1];
      const brotliBytes = await this.runCompression(payload, brotliFormat.format);
      if (brotliBytes !== null && brotliBytes.length < best.bytes.length) best = { bytes: brotliBytes, code: brotliFormat.code };
      const head = new Uint8Array(14 + extraHeader.length);
      const view = new DataView(head.buffer);
      this.MAGIC.forEach((b, i) => view.setUint8(i, b));
      view.setUint32(4, w);
      view.setUint32(8, h);
      view.setUint8(12, mode);
      view.setUint8(13, best.code);
      head.set(extraHeader, 14);
      return { size: head.length + best.bytes.length, parts: [head, best.bytes] };
    }
    static getRgbDistance(a, b) {
      const dr = (a >>> 24 & 255) - (b >>> 24 & 255), dg = (a >>> 16 & 255) - (b >>> 16 & 255), db = (a >>> 8 & 255) - (b >>> 8 & 255);
      return dr * dr + dg * dg + db * db;
    }
    static getDominantOverlayFamily(color, dominantColors) {
      let best = 0, bestDistance = Infinity;
      for (let i = 0; i < dominantColors.length; i++) {
        const distance = this.getRgbDistance(color, dominantColors[i]);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = i;
        }
      }
      return best;
    }
    static createDominantOverlayTopKCandidates(sortedPaletteIndices) {
      if (sortedPaletteIndices.length <= 2) return [];
      const maxTopK = Math.min(sortedPaletteIndices.length - 1, Math.max(2, Math.ceil(Math.sqrt(sortedPaletteIndices.length))));
      const candidates = [];
      for (let topK = 2; topK <= maxTopK; topK++) candidates.push(topK);
      return candidates;
    }
    static async createDominantOverlayCandidate(w, h, palette, indices, maxSize) {
      if (palette.length <= 2) return null;
      const len = w * h, freqs = new Uint32Array(palette.length);
      for (let i = 0; i < len; i++) freqs[indices[i]]++;
      const sortedPaletteIndices = Array.from({ length: palette.length }, (_, i) => i).sort((a, b) => freqs[b] - freqs[a] || (palette[a] >>> 0) - (palette[b] >>> 0)), candidateTopKs = this.createDominantOverlayTopKCandidates(sortedPaletteIndices);
      let bestCandidate = null;
      for (const topK of candidateTopKs) {
        const dominantIndices = sortedPaletteIndices.slice(0, topK), dominantColors = dominantIndices.map((idx) => palette[idx] >>> 0), familyOfPalette = new Int16Array(palette.length).fill(-1), isDominantPalette = new Uint8Array(palette.length);
        dominantIndices.forEach((paletteIdx, family) => familyOfPalette[paletteIdx] = family);
        dominantIndices.forEach((paletteIdx) => isDominantPalette[paletteIdx] = 1);
        for (let i = 0; i < palette.length; i++) {
          if (familyOfPalette[i] !== -1) continue;
          familyOfPalette[i] = this.getDominantOverlayFamily(palette[i] >>> 0, dominantColors);
        }
        const labels = new Uint8Array(len), overlayMask = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          const paletteIdx = indices[i];
          labels[i] = familyOfPalette[paletteIdx];
          if (isDominantPalette[paletteIdx] === 0) overlayMask[i] = 1;
        }
        const visited = new Uint8Array(len), queue = new Uint32Array(len), components = [];
        let componentSpan = 1;
        for (let start = 0; start < len; start++) {
          if (overlayMask[start] === 0 || visited[start] === 1) continue;
          let head = 0, tail = 0, minX = w, minY = h, maxX = -1, maxY = -1;
          const pixels = [], familyVotes = new Uint16Array(topK);
          visited[start] = 1;
          queue[tail++] = start;
          while (head < tail) {
            const pixel = queue[head++], x = pixel % w, y = Math.floor(pixel / w), family2 = labels[pixel];
            pixels.push(pixel);
            familyVotes[family2]++;
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
            if (x > 0) {
              const next = pixel - 1;
              if (overlayMask[next] === 1 && visited[next] === 0) {
                visited[next] = 1;
                queue[tail++] = next;
              }
            }
            if (x + 1 < w) {
              const next = pixel + 1;
              if (overlayMask[next] === 1 && visited[next] === 0) {
                visited[next] = 1;
                queue[tail++] = next;
              }
            }
            if (y > 0) {
              const next = pixel - w;
              if (overlayMask[next] === 1 && visited[next] === 0) {
                visited[next] = 1;
                queue[tail++] = next;
              }
            }
            if (y + 1 < h) {
              const next = pixel + w;
              if (overlayMask[next] === 1 && visited[next] === 0) {
                visited[next] = 1;
                queue[tail++] = next;
              }
            }
          }
          const spanW = maxX - minX + 1, spanH = maxY - minY + 1, maxSpan = Math.max(spanW, spanH);
          if (maxSpan > 255) {
            componentSpan = 256;
            break;
          }
          if (maxSpan > componentSpan) componentSpan = maxSpan;
          let family = 0;
          for (let i = 1; i < topK; i++) if (familyVotes[i] > familyVotes[family]) family = i;
          for (const pixel of pixels) labels[pixel] = family;
          components.push({ x: minX, y: minY, family, pixels });
        }
        if (componentSpan > 255) continue;
        const familyColorFreqs = Array.from({ length: topK }, () => /* @__PURE__ */ new Map());
        for (const component of components) {
          for (const pixel of component.pixels) {
            const color = palette[indices[pixel]] >>> 0, freq = familyColorFreqs[component.family].get(color) ?? 0;
            familyColorFreqs[component.family].set(color, freq + 1);
          }
        }
        const familyColorMaps = familyColorFreqs.map((freqMap) => {
          const entries = [...freqMap.entries()].sort((a, b) => b[1] - a[1] || (a[0] >>> 0) - (b[0] >>> 0)), colorMap = /* @__PURE__ */ new Map();
          entries.forEach(([color], index) => colorMap.set(color, index));
          return colorMap;
        });
        if (familyColorMaps.some((colorMap) => colorMap.size >= 255)) continue;
        const overlayBytes = [];
        for (const color of dominantColors) {
          overlayBytes.push(color >>> 24 & 255, color >>> 16 & 255, color >>> 8 & 255, color & 255);
        }
        for (let family = 0; family < topK; family++) {
          const entries = [...familyColorMaps[family].entries()].sort((a, b) => a[1] - b[1]);
          overlayBytes.push(entries.length);
          const base = dominantColors[family], baseR = base >>> 24 & 255, baseG = base >>> 16 & 255, baseB = base >>> 8 & 255;
          for (const [color] of entries) {
            overlayBytes.push((color >>> 24 & 255) - baseR + 256 & 255, (color >>> 16 & 255) - baseG + 256 & 255, (color >>> 8 & 255) - baseB + 256 & 255);
          }
        }
        components.sort((a, b) => a.family - b.family || a.y - b.y || a.x - b.x);
        this.pushVarint(overlayBytes, components.length);
        const familyCounts = new Uint32Array(topK);
        for (const component of components) familyCounts[component.family]++;
        for (let family = 0; family < topK; family++) this.pushVarint(overlayBytes, familyCounts[family]);
        let prevPos = 0;
        for (const component of components) {
          const pos = component.y * w + component.x;
          this.pushZigZagVarint(overlayBytes, pos - prevPos);
          prevPos = pos;
        }
        const componentGrids = components.map((component) => {
          const grid = new Uint8Array(componentSpan * componentSpan);
          grid.fill(255);
          for (const pixel of component.pixels) {
            const x = pixel % w, y = Math.floor(pixel / w), local = (y - component.y) * componentSpan + (x - component.x);
            grid[local] = familyColorMaps[component.family].get(palette[indices[pixel]] >>> 0) ?? 255;
          }
          return grid;
        });
        for (let cell = 0; cell < componentSpan * componentSpan; cell++) {
          for (const grid of componentGrids) overlayBytes.push(grid[cell]);
        }
        const payload = new Uint8Array(len + overlayBytes.length);
        payload.set(labels, 0);
        payload.set(overlayBytes, len);
        const candidate = await this.createCompressedPayloadCandidate(w, h, 6, [topK, componentSpan], payload, bestCandidate?.size ?? maxSize);
        if (candidate !== null && (bestCandidate === null || candidate.size < bestCandidate.size)) bestCandidate = candidate;
      }
      return bestCandidate;
    }
    static async encode(w, h, rgba) {
      const len = w * h;
      let cA = true, a0 = rgba[3], isG = true;
      for (let i = 0; i < len; i++) {
        if (rgba[i * 4] !== rgba[i * 4 + 1] || rgba[i * 4] !== rgba[i * 4 + 2]) isG = false;
        if (rgba[i * 4 + 3] !== a0) cA = false;
        if (!isG && !cA) break;
      }
      const rawStride = (isG ? 1 : 3) + (cA ? 0 : 1), rawModeSize = 15 + len * rawStride;
      const rawD = this.createRawData(w, h, rgba, isG, cA);
      let bestCandidate = this.createRawCandidate(w, h, isG, cA, a0, rawD);
      const applyCandidate = (candidate) => {
        if (candidate !== null && candidate.size < bestCandidate.size) bestCandidate = candidate;
      };
      const colors = /* @__PURE__ */ new Set();
      for (let i = 0; i < len; i++) {
        colors.add(rgba[i * 4] << 24 | rgba[i * 4 + 1] << 16 | rgba[i * 4 + 2] << 8 | rgba[i * 4 + 3]);
        if (colors.size > 256) break;
      }
      if (colors.size === 1) {
        const head = new DataView(new ArrayBuffer(17));
        this.MAGIC.forEach((b, i) => head.setUint8(i, b));
        head.setUint32(4, w);
        head.setUint32(8, h);
        head.setUint8(12, 0);
        head.setUint32(13, colors.values().next().value);
        return new Blob([head]);
      }
      const modelWorkspace = this.createModelWorkspace();
      const blockLayout16 = this.createBlockLayout(w, h, 16);
      if (colors.size <= 256) {
        const palette = Array.from(colors).sort((a, b) => (a >>> 0) - (b >>> 0));
        const colorToIndex = /* @__PURE__ */ new Map();
        palette.forEach((c, i) => colorToIndex.set(c, i));
        const indices = new Int32Array(len);
        for (let i = 0; i < len; i++) indices[i] = colorToIndex.get(rgba[i * 4] << 24 | rgba[i * 4 + 1] << 16 | rgba[i * 4 + 2] << 8 | rgba[i * 4 + 3]);
        const { output: encI } = this.encodePlane(w, h, indices, null, blockLayout16, modelWorkspace);
        const useRawI = encI.length > len, pModeSize = 14 + colors.size * 4 + (useRawI ? len : encI.length);
        if (cA && a0 === 255) applyCandidate(await this.createDominantOverlayCandidate(w, h, palette, indices, bestCandidate.size));
        if (pModeSize <= rawModeSize) {
          const head = new DataView(new ArrayBuffer(14 + colors.size * 4));
          this.MAGIC.forEach((b, i) => head.setUint8(i, b));
          head.setUint32(4, w);
          head.setUint32(8, h);
          head.setUint8(12, useRawI ? 4 : 1);
          head.setUint8(13, colors.size - 1);
          palette.forEach((c, i) => head.setUint32(14 + i * 4, c >>> 0));
          const rawIArr = new Uint8Array(len);
          if (useRawI) {
            for (let i = 0; i < len; i++) rawIArr[i] = indices[i];
          }
          applyCandidate({ size: pModeSize, parts: [head, useRawI ? rawIArr : encI] });
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
      for (const layout of [blockLayout16, this.createBlockLayout(w, h, 32)]) {
        let currentP = [], currentS = 0, yRes = null;
        for (let p = 0; p < planes.length; p++) {
          const { output: res, residuals } = this.encodePlane(w, h, planes[p], !isG && (p === 1 || p === 2) ? yRes : null, layout, modelWorkspace);
          currentP.push(res);
          currentS += res.length;
          if (p === 0) yRes = residuals;
        }
        if (currentS < bestTSize) {
          bestTSize = currentS;
          bestPlanes = currentP;
          bestBS = layout.bs;
        }
      }
      if (16 + bestTSize < rawModeSize) {
        const bsHead = new Uint8Array(16);
        const bsView = new DataView(bsHead.buffer);
        this.MAGIC.forEach((b, i) => bsView.setUint8(i, b));
        bsView.setUint32(4, w);
        bsView.setUint32(8, h);
        bsView.setUint8(12, 2);
        bsView.setUint8(13, (cA ? 1 : 0) | (isG ? 2 : 0));
        bsView.setUint8(14, cA ? a0 : 0);
        bsView.setUint8(15, bestBS);
        applyCandidate({ size: 16 + bestTSize, parts: [bsHead, ...bestPlanes] });
      }
      applyCandidate(await this.createCompressedRawCandidate(w, h, isG, cA, a0, rawD, bestCandidate.size));
      return new Blob(bestCandidate.parts);
    }
    static encodePlane(w, h, data, yRes, layout, modelWorkspace) {
      const { bs, bw, bh, blockXByPixel, blockRowOffsetByPixel } = layout, len = w * h;
      const ccpTrials = this.CCP_TRIALS;
      const blockParams = new Int32Array(bw * bh), planeResiduals = new Int32Array(len), planeCtxIdx = new Uint8Array(len);
      const blockCapacity = bs * bs, blockValues = new Int32Array(blockCapacity), gapPreds = new Int32Array(blockCapacity), gapCtxIdxs = new Uint8Array(blockCapacity), medPreds = new Int32Array(blockCapacity), medCtxIdxs = new Uint8Array(blockCapacity), avgPreds = new Int32Array(blockCapacity), yBlock = yRes === null ? null : new Int32Array(blockCapacity), gapInfo = new Int32Array(2), medInfo = new Int32Array(2);
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
          const blockArea = (yE - yS) * (xE - xS);
          let pos = 0;
          for (let y = yS; y < yE; y++) {
            for (let x = xS; x < xE; x++) {
              const i = y * w + x;
              blockValues[pos] = data[i];
              this.gapInto(x, y, w, data, gapInfo);
              this.medInto(x, y, w, data, medInfo);
              gapPreds[pos] = gapInfo[0];
              gapCtxIdxs[pos] = gapInfo[1];
              medPreds[pos] = medInfo[0];
              medCtxIdxs[pos] = medInfo[1];
              avgPreds[pos] = x > 0 && y > 0 ? data[i - 1] + data[i - w] >> 1 : y > 0 ? data[i - w] : x > 0 ? data[i - 1] : 128;
              if (yBlock !== null) yBlock[pos] = yRes[i];
              pos++;
            }
          }
          let bestM = 0, bestFIdx = 8, minE = Infinity;
          for (let m = 0; m < 3; m++) {
            const preds = m === 0 ? gapPreds : m === 1 ? medPreds : avgPreds;
            const fStart = yBlock === null ? 8 : 0, fEnd = yBlock === null ? 9 : 16;
            for (let fIdx = fStart; fIdx < fEnd; fIdx++) {
              const f2 = ccpTrials[fIdx];
              let err = 0, p = 0;
              for (; p < blockArea; p++) {
                err += Math.abs(blockValues[p] - preds[p] - (yBlock === null ? 0 : yBlock[p] * f2 >> 3));
              }
              if (err < minE) {
                minE = err;
                bestM = m;
                bestFIdx = fIdx;
              }
            }
          }
          blockParams[by * bw + bx] = bestM | bestFIdx << 2;
          const f = ccpTrials[bestFIdx], bestPreds = bestM === 0 ? gapPreds : bestM === 1 ? medPreds : avgPreds;
          pos = 0;
          for (let y = yS; y < yE; y++) {
            for (let x = xS; x < xE; x++) {
              const i = y * w + x;
              planeResiduals[i] = blockValues[pos] - bestPreds[pos] - (yBlock === null ? 0 : yBlock[pos] * f >> 3);
              planeCtxIdx[i] = bestM === 1 ? medCtxIdxs[pos] : gapCtxIdxs[pos];
              pos++;
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
      this.resetModelWorkspace(modelWorkspace);
      const { models, biasSums, biasCounts } = modelWorkspace;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = y * w + x, bp = blockParams[blockRowOffsetByPixel[y] + blockXByPixel[x]];
          if ((bp & 3) === 3) continue;
          const ctxIdx = planeCtxIdx[i];
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
          const biasCount = biasCounts[fIdx], bias = biasCount > 0 ? Math.trunc(biasSums[fIdx] / biasCount) : 0;
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
          biasSums[fIdx] += res;
          biasCounts[fIdx]++;
          if (biasCounts[fIdx] === 128) {
            biasSums[fIdx] >>= 1;
            biasCounts[fIdx] >>= 1;
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
      const encoded = new Uint8Array(4 + op);
      encoded.set(new Uint8Array(sH.buffer), 0);
      encoded.set(output.subarray(0, op), 4);
      return { output: encoded, residuals: planeResiduals };
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
          const raw = new Uint8Array(ab, 14 + pS * 4);
          indices = new Int32Array(raw.length);
          for (let i = 0; i < raw.length; i++) indices[i] = raw[i];
        } else {
          const modelWorkspace2 = this.createModelWorkspace();
          indices = this.decodePlane(w, h, new Uint8Array(ab, 14 + pS * 4), null, this.createBlockLayout(w, h, 16), modelWorkspace2).data;
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
        return { w, h, data: this.decodeRawData(w, h, new Uint8Array(ab, 15), isG, cA, a0) };
      }
      if (mode === 5) {
        const formatCode = dv.getUint8(15), raw = await this.runDecompression(new Uint8Array(ab, 16), this.getCompressedRawFormat(formatCode));
        return { w, h, data: this.decodeRawData(w, h, raw, isG, cA, a0) };
      }
      if (mode === 6) {
        const topK = dv.getUint8(14), componentSpan = dv.getUint8(15), payload = await this.runDecompression(new Uint8Array(ab, 16), this.getCompressedRawFormat(dv.getUint8(13))), len = w * h;
        let offset2 = 0;
        const labels = payload.subarray(offset2, offset2 + len);
        offset2 += len;
        const dominantColors = new Uint32Array(topK);
        for (let i = 0; i < topK; i++) {
          dominantColors[i] = payload[offset2] << 24 | payload[offset2 + 1] << 16 | payload[offset2 + 2] << 8 | payload[offset2 + 3];
          offset2 += 4;
        }
        const familyPalettes = Array.from({ length: topK }, () => []);
        for (let family = 0; family < topK; family++) {
          const count = payload[offset2++], base = dominantColors[family], baseR = base >>> 24 & 255, baseG = base >>> 16 & 255, baseB = base >>> 8 & 255;
          for (let i = 0; i < count; i++) {
            const color = ((baseR + payload[offset2++] & 255) << 24 | (baseG + payload[offset2++] & 255) << 16 | (baseB + payload[offset2++] & 255) << 8 | 255) >>> 0;
            familyPalettes[family].push(color);
          }
        }
        const rgba2 = new Uint8Array(len * 4);
        for (let i = 0; i < len; i++) {
          const color = dominantColors[labels[i]];
          rgba2[i * 4] = color >>> 24 & 255;
          rgba2[i * 4 + 1] = color >>> 16 & 255;
          rgba2[i * 4 + 2] = color >>> 8 & 255;
          rgba2[i * 4 + 3] = color & 255;
        }
        const componentCountInfo = this.readVarint(payload, offset2);
        offset2 = componentCountInfo.offset;
        const families = new Uint8Array(componentCountInfo.value);
        let familyOffset = 0;
        for (let family = 0; family < topK; family++) {
          const familyCountInfo = this.readVarint(payload, offset2);
          offset2 = familyCountInfo.offset;
          families.fill(family, familyOffset, familyOffset + familyCountInfo.value);
          familyOffset += familyCountInfo.value;
        }
        const positions = new Uint32Array(componentCountInfo.value);
        let prevPos = 0;
        for (let c = 0; c < componentCountInfo.value; c++) {
          const posInfo = this.readZigZagVarint(payload, offset2);
          offset2 = posInfo.offset;
          prevPos += posInfo.value;
          positions[c] = prevPos;
        }
        for (let cell = 0; cell < componentSpan * componentSpan; cell++) {
          const gx = cell % componentSpan, gy = Math.floor(cell / componentSpan);
          for (let c = 0; c < componentCountInfo.value; c++) {
            const colorIdx = payload[offset2++];
            if (colorIdx === 255) continue;
            const x = positions[c] % w, y = Math.floor(positions[c] / w);
            if (x + gx >= w || y + gy >= h) continue;
            const color = familyPalettes[families[c]][colorIdx], pixel = ((y + gy) * w + (x + gx)) * 4;
            rgba2[pixel] = color >>> 24 & 255;
            rgba2[pixel + 1] = color >>> 16 & 255;
            rgba2[pixel + 2] = color >>> 8 & 255;
            rgba2[pixel + 3] = color & 255;
          }
        }
        return { w, h, data: rgba2 };
      }
      let offset = 16;
      const bs = dv.getUint8(15), planes = [];
      const blockLayout = this.createBlockLayout(w, h, bs), modelWorkspace = this.createModelWorkspace();
      let yRes = null;
      const numPlanes = (isG ? 1 : 3) + (cA ? 0 : 1);
      for (let p = 0; p < numPlanes; p++) {
        const size = dv.getUint32(offset), useY = !isG && (p === 1 || p === 2);
        const { data: dP, residuals: res } = this.decodePlane(w, h, new Uint8Array(ab, offset, 4 + size), useY ? yRes : null, blockLayout, modelWorkspace);
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
    static decodePlane(w, h, planeBytes, yRes, layout, modelWorkspace) {
      const buf = planeBytes.subarray(4);
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
      const { bw, bh, blockXByPixel, blockRowOffsetByPixel } = layout, blockParams = new Int32Array(bw * bh);
      const ccpTrials = this.CCP_TRIALS;
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
      this.resetModelWorkspace(modelWorkspace);
      const { models, biasSums, biasCounts } = modelWorkspace;
      const out = new Int32Array(w * h), planeRes = new Int32Array(w * h), info = new Int32Array(2);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = y * w + x, bp2 = blockParams[blockRowOffsetByPixel[y] + blockXByPixel[x]];
          if ((bp2 & 3) === 3) {
            out[i] = this.unzigzag(bp2 >> 2);
            continue;
          }
          const m = bp2 & 3, f = ccpTrials[bp2 >> 2 & 15];
          let pr, ctxIdx;
          if (m === 0) {
            this.gapInto(x, y, w, out, info);
            pr = info[0];
            ctxIdx = info[1];
          } else if (m === 1) {
            this.medInto(x, y, w, out, info);
            pr = info[0];
            ctxIdx = info[1];
          } else {
            pr = x > 0 && y > 0 ? out[i - 1] + out[i - w] >> 1 : y > 0 ? out[i - w] : x > 0 ? out[i - 1] : 128;
            this.gapInto(x, y, w, out, info);
            ctxIdx = info[1];
          }
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
          const cum = model.getCum(zz_c), freq = model.getFreq(zz_c);
          const nL = low + Math.floor(range * cum / model.sum);
          high = low + Math.floor(range * (cum + freq) / model.sum) - 1;
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
          const diff = zz_c === 256 ? decodeEscaped() : this.unzigzag(zz_c);
          const biasCount = biasCounts[fIdx], bias = biasCount > 0 ? Math.trunc(biasSums[fIdx] / biasCount) : 0;
          const res = diff + bias;
          planeRes[i] = res;
          out[i] = res + pr + (yRes === null ? 0 : yRes[i] * f >> 3);
          biasSums[fIdx] += res;
          biasCounts[fIdx]++;
          if (biasCounts[fIdx] === 128) {
            biasSums[fIdx] >>= 1;
            biasCounts[fIdx] >>= 1;
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
