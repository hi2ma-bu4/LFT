class Model {
	public static readonly SIZE = 257;
	private readonly f = new Uint32Array(Model.SIZE + 1);
	private readonly freqs = new Uint32Array(Model.SIZE);
	public sum = 0;

	constructor() {
		this.resetUniform();
	}

	private resetUniform(): void {
		this.freqs.fill(1);
		this.sum = Model.SIZE;
		this.rebuildFenwick();
	}

	private rebuildFenwick(): void {
		this.f.fill(0);
		for (let i = 1; i <= Model.SIZE; i++) {
			this.f[i] += this.freqs[i - 1];
			const parent = i + (i & -i);
			if (parent <= Model.SIZE) this.f[parent] += this.f[i];
		}
	}

	public update(val: number, delta: number): void {
		this.sum += delta;
		this.freqs[val] += delta;
		for (let i = val + 1; i <= Model.SIZE; i += i & -i) this.f[i] += delta;
	}

	public getCum(val: number): number {
		let s = 0;
		for (let i = val; i > 0; i -= i & -i) s += this.f[i];
		return s;
	}

	public getFreq(val: number): number {
		return this.freqs[val];
	}

	public find(count: number): number {
		let idx = 0;
		for (let i = 256; i > 0; i >>= 1) {
			const next = idx + i;
			if (next <= Model.SIZE && this.f[next] <= count) {
				idx = next;
				count -= this.f[idx];
			}
		}
		return idx;
	}

	public resort(): void {
		this.sum = 0;
		for (let i = 0; i < Model.SIZE; i++) {
			const freq = (this.freqs[i] >> 1) | 1;
			this.freqs[i] = freq;
			this.sum += freq;
		}
		this.rebuildFenwick();
	}
}

type EncodedCandidate = {
	size: number;
	parts: BlobPart[];
};

type DominantOverlayComponent = {
	x: number;
	y: number;
	family: number;
	pixels: number[];
};

export class LFT {
	private static readonly MAGIC = new Uint8Array([76, 70, 84, 33]);
	private static readonly COMPRESSED_RAW_FORMATS = [
		{ code: 0, format: "deflate" },
		{ code: 1, format: "brotli" },
	] as const;

	private static rgbToYCoCgR(r: number, g: number, b: number): [number, number, number] {
		const co = r - b;
		const tmp = b + (co >> 1);
		const cg = g - tmp;
		const y = tmp + (cg >> 1);
		return [y, co, cg];
	}

	private static yCoCgRToRgb(y: number, co: number, cg: number): [number, number, number] {
		const tmp = y - (cg >> 1);
		const g = cg + tmp;
		const b = tmp - (co >> 1);
		const r = b + co;
		return [r, g, b];
	}

	private static gapInto(x: number, y: number, w: number, data: Int32Array, out: Int32Array): void {
		const i = y * w + x;
		const n = y > 0 ? data[i - w] : 128;
		const w_ = x > 0 ? data[i - 1] : n;
		const ne = y > 0 && x < w - 1 ? data[i - w + 1] : n;
		const nw = y > 0 && x > 0 ? data[i - w - 1] : n;
		const nn = y > 1 ? data[i - 2 * w] : n;
		const ww = x > 1 ? data[i - 2] : w_;
		const dh = Math.abs(w_ - ww) + Math.abs(n - nw) + Math.abs(n - ne);
		const dv = Math.abs(w_ - nw) + Math.abs(n - nn) + Math.abs(ne - (y > 1 && x < w - 1 ? data[i - 2 * w + 1] : ne));
		let pred: number;
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
		out[0] = Math.floor(pred);
		out[1] = (aL << 3) | ((w_ > nw ? 1 : 0) | (n > nw ? 2 : 0) | (n > ne ? 4 : 0));
	}

	private static medInto(x: number, y: number, w: number, data: Int32Array, out: Int32Array): void {
		const i = y * w + x;
		const n = y > 0 ? data[i - w] : 128;
		const w_ = x > 0 ? data[i - 1] : n;
		const nw = y > 0 && x > 0 ? data[i - w - 1] : n;
		const ne = y > 0 && x < w - 1 ? data[i - w + 1] : n;
		let pred: number;
		if (nw >= Math.max(w_, n)) pred = Math.min(w_, n);
		else if (nw <= Math.min(w_, n)) pred = Math.max(w_, n);
		else pred = w_ + n - nw;
		const dh = Math.abs(w_ - nw),
			dv = Math.abs(n - nw),
			activity = (dh + dv) * 2;
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
		out[0] = Math.floor(pred);
		out[1] = (aL << 3) | ((w_ > nw ? 1 : 0) | (n > nw ? 2 : 0) | (n > ne ? 4 : 0));
	}

	private static zigzag(v: number): number {
		return (v << 1) ^ (v >> 31);
	}
	private static unzigzag(v: number): number {
		return (v >>> 1) ^ -(v & 1);
	}

	private static readonly RANGE_MAX = 0x3fffffff;
	private static readonly HALF = 0x20000000;
	private static readonly QUARTER = 0x10000000;

	private static createRawData(w: number, h: number, rgba: Uint8Array<ArrayBuffer>, isG: boolean, cA: boolean): Uint8Array<ArrayBuffer> {
		const len = w * h,
			rawStride = (isG ? 1 : 3) + (cA ? 0 : 1),
			rawD = new Uint8Array(len * rawStride);
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

	private static createRawCandidate(w: number, h: number, isG: boolean, cA: boolean, a0: number, rawD: Uint8Array<ArrayBuffer>): EncodedCandidate {
		const head = new DataView(new ArrayBuffer(15));
		this.MAGIC.forEach((b, i) => head.setUint8(i, b));
		head.setUint32(4, w);
		head.setUint32(8, h);
		head.setUint8(12, 3);
		head.setUint8(13, (cA ? 1 : 0) | (isG ? 2 : 0));
		head.setUint8(14, cA ? a0 : 0);
		return { size: 15 + rawD.length, parts: [head, rawD] };
	}

	private static async runCompression(data: Uint8Array<ArrayBuffer>, format: string): Promise<Uint8Array<ArrayBuffer> | null> {
		try {
			const stream = new Blob([data]).stream().pipeThrough(new CompressionStream(format as any));
			return new Uint8Array(await new Response(stream).arrayBuffer());
		} catch {
			return null;
		}
	}

	private static async runDecompression(data: Uint8Array<ArrayBuffer>, format: string): Promise<Uint8Array<ArrayBuffer>> {
		const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream(format as any));
		return new Uint8Array(await new Response(stream).arrayBuffer());
	}

	private static async createCompressedRawCandidate(w: number, h: number, isG: boolean, cA: boolean, a0: number, rawD: Uint8Array<ArrayBuffer>, maxSize: number): Promise<EncodedCandidate | null> {
		const deflateFormat = this.COMPRESSED_RAW_FORMATS[0];
		const deflateBytes = await this.runCompression(rawD, deflateFormat.format);
		if (deflateBytes === null || 16 + deflateBytes.length >= maxSize) return null;
		let best: { bytes: Uint8Array<ArrayBuffer>; code: number } = { bytes: deflateBytes, code: deflateFormat.code };
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

	private static decodeRawData(w: number, h: number, raw: Uint8Array<ArrayBuffer>, isG: boolean, cA: boolean, a0: number): Uint8Array<ArrayBuffer> {
		const rgba = new Uint8Array(w * h * 4),
			stride = (isG ? 1 : 3) + (cA ? 0 : 1);
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

	private static getCompressedRawFormat(code: number): string {
		const format = this.COMPRESSED_RAW_FORMATS.find((candidate) => candidate.code === code);
		if (format === undefined) throw new Error(`Unsupported compressed raw format: ${code}`);
		return format.format;
	}

	private static pushVarint(target: number[], value: number): void {
		while (value >= 0x80) {
			target.push((value & 0x7f) | 0x80);
			value >>>= 7;
		}
		target.push(value);
	}

	private static readVarint(data: Uint8Array<ArrayBuffer>, offset: number): { value: number; offset: number } {
		let value = 0,
			shift = 0;
		while (offset < data.length) {
			const byte = data[offset++];
			value |= (byte & 0x7f) << shift;
			if ((byte & 0x80) === 0) return { value, offset };
			shift += 7;
		}
		throw new Error("Unexpected end of dominant overlay stream");
	}

	private static pushZigZagVarint(target: number[], value: number): void {
		this.pushVarint(target, this.zigzag(value));
	}

	private static readZigZagVarint(data: Uint8Array<ArrayBuffer>, offset: number): { value: number; offset: number } {
		const decoded = this.readVarint(data, offset);
		return { value: this.unzigzag(decoded.value), offset: decoded.offset };
	}

	private static async createCompressedPayloadCandidate(w: number, h: number, mode: number, extraHeader: number[], payload: Uint8Array<ArrayBuffer>, maxSize: number): Promise<EncodedCandidate | null> {
		const deflateFormat = this.COMPRESSED_RAW_FORMATS[0];
		const deflateBytes = await this.runCompression(payload, deflateFormat.format);
		if (deflateBytes === null || 14 + extraHeader.length + deflateBytes.length >= maxSize) return null;
		let best: { bytes: Uint8Array<ArrayBuffer>; code: number } = { bytes: deflateBytes, code: deflateFormat.code };
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

	private static getRgbDistance(a: number, b: number): number {
		const dr = ((a >>> 24) & 0xff) - ((b >>> 24) & 0xff),
			dg = ((a >>> 16) & 0xff) - ((b >>> 16) & 0xff),
			db = ((a >>> 8) & 0xff) - ((b >>> 8) & 0xff);
		return dr * dr + dg * dg + db * db;
	}

	private static getDominantOverlayFamily(color: number, dominantColors: readonly number[]): number {
		let best = 0,
			bestDistance = Infinity;
		for (let i = 0; i < dominantColors.length; i++) {
			const distance = this.getRgbDistance(color, dominantColors[i]);
			if (distance < bestDistance) {
				bestDistance = distance;
				best = i;
			}
		}
		return best;
	}

	private static createDominantOverlayTopKCandidates(sortedPaletteIndices: number[]): number[] {
		if (sortedPaletteIndices.length <= 2) return [];
		const maxTopK = Math.min(sortedPaletteIndices.length - 1, Math.max(2, Math.ceil(Math.sqrt(sortedPaletteIndices.length))));
		const candidates: number[] = [];
		for (let topK = 2; topK <= maxTopK; topK++) candidates.push(topK);
		return candidates;
	}

	private static async createDominantOverlayCandidate(
		w: number,
		h: number,
		palette: number[],
		indices: Int32Array,
		maxSize: number
	): Promise<EncodedCandidate | null> {
		if (palette.length <= 2) return null;
		const len = w * h,
			freqs = new Uint32Array(palette.length);
		for (let i = 0; i < len; i++) freqs[indices[i]]++;
		const sortedPaletteIndices = Array.from({ length: palette.length }, (_, i) => i).sort((a, b) => freqs[b] - freqs[a] || ((palette[a] >>> 0) - (palette[b] >>> 0))),
			candidateTopKs = this.createDominantOverlayTopKCandidates(sortedPaletteIndices);
		let bestCandidate: EncodedCandidate | null = null;
		for (const topK of candidateTopKs) {
			const dominantIndices = sortedPaletteIndices.slice(0, topK),
				dominantColors = dominantIndices.map((idx) => palette[idx] >>> 0),
				familyOfPalette = new Int16Array(palette.length).fill(-1),
				isDominantPalette = new Uint8Array(palette.length);
			dominantIndices.forEach((paletteIdx, family) => (familyOfPalette[paletteIdx] = family));
			dominantIndices.forEach((paletteIdx) => (isDominantPalette[paletteIdx] = 1));
			for (let i = 0; i < palette.length; i++) {
				if (familyOfPalette[i] !== -1) continue;
				familyOfPalette[i] = this.getDominantOverlayFamily(palette[i] >>> 0, dominantColors);
			}
			const labels = new Uint8Array(len),
				overlayMask = new Uint8Array(len);
			for (let i = 0; i < len; i++) {
				const paletteIdx = indices[i];
				labels[i] = familyOfPalette[paletteIdx];
				if (isDominantPalette[paletteIdx] === 0) overlayMask[i] = 1;
			}
			const visited = new Uint8Array(len),
				queue = new Uint32Array(len),
				components: DominantOverlayComponent[] = [];
			let componentSpan = 1;
			for (let start = 0; start < len; start++) {
				if (overlayMask[start] === 0 || visited[start] === 1) continue;
				let head = 0,
					tail = 0,
					minX = w,
					minY = h,
					maxX = -1,
					maxY = -1;
				const pixels: number[] = [],
					familyVotes = new Uint16Array(topK);
				visited[start] = 1;
				queue[tail++] = start;
				while (head < tail) {
					const pixel = queue[head++],
						x = pixel % w,
						y = Math.floor(pixel / w),
						family = labels[pixel];
					pixels.push(pixel);
					familyVotes[family]++;
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
				const spanW = maxX - minX + 1,
					spanH = maxY - minY + 1,
					maxSpan = Math.max(spanW, spanH);
				if (maxSpan > 0xff) {
					componentSpan = 0x100;
					break;
				}
				if (maxSpan > componentSpan) componentSpan = maxSpan;
				let family = 0;
				for (let i = 1; i < topK; i++) if (familyVotes[i] > familyVotes[family]) family = i;
				for (const pixel of pixels) labels[pixel] = family;
				components.push({ x: minX, y: minY, family, pixels });
			}
			if (componentSpan > 0xff) continue;
			const familyColorFreqs = Array.from({ length: topK }, () => new Map<number, number>());
			for (const component of components) {
				for (const pixel of component.pixels) {
					const color = palette[indices[pixel]] >>> 0,
						freq = familyColorFreqs[component.family].get(color) ?? 0;
					familyColorFreqs[component.family].set(color, freq + 1);
				}
			}
			const familyColorMaps = familyColorFreqs.map((freqMap) => {
				const entries = [...freqMap.entries()].sort((a, b) => b[1] - a[1] || ((a[0] >>> 0) - (b[0] >>> 0))),
					colorMap = new Map<number, number>();
				entries.forEach(([color], index) => colorMap.set(color, index));
				return colorMap;
			});
			if (familyColorMaps.some((colorMap) => colorMap.size >= 0xff)) continue;
			const overlayBytes: number[] = [];
			for (const color of dominantColors) {
				overlayBytes.push((color >>> 24) & 0xff, (color >>> 16) & 0xff, (color >>> 8) & 0xff, color & 0xff);
			}
			for (let family = 0; family < topK; family++) {
				const entries = [...familyColorMaps[family].entries()].sort((a, b) => a[1] - b[1]);
				overlayBytes.push(entries.length);
				const base = dominantColors[family],
					baseR = (base >>> 24) & 0xff,
					baseG = (base >>> 16) & 0xff,
					baseB = (base >>> 8) & 0xff;
				for (const [color] of entries) {
					overlayBytes.push((((color >>> 24) & 0xff) - baseR + 256) & 0xff, (((color >>> 16) & 0xff) - baseG + 256) & 0xff, (((color >>> 8) & 0xff) - baseB + 256) & 0xff);
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
				grid.fill(0xff);
				for (const pixel of component.pixels) {
					const x = pixel % w,
						y = Math.floor(pixel / w),
						local = (y - component.y) * componentSpan + (x - component.x);
					grid[local] = familyColorMaps[component.family].get(palette[indices[pixel]] >>> 0) ?? 0xff;
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

	public static async encode(w: number, h: number, rgba: Uint8Array<ArrayBuffer>): Promise<Blob> {
		const len = w * h;
		let cA = true,
			a0 = rgba[3],
			isG = true;
		for (let i = 0; i < len; i++) {
			if (rgba[i * 4] !== rgba[i * 4 + 1] || rgba[i * 4] !== rgba[i * 4 + 2]) isG = false;
			if (rgba[i * 4 + 3] !== a0) cA = false;
			if (!isG && !cA) break;
		}
		const rawStride = (isG ? 1 : 3) + (cA ? 0 : 1),
			rawModeSize = 15 + len * rawStride;
		const rawD = this.createRawData(w, h, rgba, isG, cA);
		let bestCandidate = this.createRawCandidate(w, h, isG, cA, a0, rawD);
		const applyCandidate = (candidate: EncodedCandidate | null) => {
			if (candidate !== null && candidate.size < bestCandidate.size) bestCandidate = candidate;
		};
		const colors = new Set<number>();
		for (let i = 0; i < len; i++) {
			colors.add((rgba[i * 4] << 24) | (rgba[i * 4 + 1] << 16) | (rgba[i * 4 + 2] << 8) | rgba[i * 4 + 3]);
			if (colors.size > 256) break;
		}
		if (colors.size === 1) {
			const head = new DataView(new ArrayBuffer(17));
			this.MAGIC.forEach((b, i) => head.setUint8(i, b));
			head.setUint32(4, w);
			head.setUint32(8, h);
			head.setUint8(12, 0);
			head.setUint32(13, colors.values().next().value as number);
			return new Blob([head]);
		}
		if (colors.size <= 256) {
			const palette = Array.from(colors).sort((a, b) => (a >>> 0) - (b >>> 0));
			const colorToIndex = new Map<number, number>();
			palette.forEach((c, i) => colorToIndex.set(c, i));
			const indices = new Int32Array(len);
			for (let i = 0; i < len; i++) indices[i] = colorToIndex.get((rgba[i * 4] << 24) | (rgba[i * 4 + 1] << 16) | (rgba[i * 4 + 2] << 8) | rgba[i * 4 + 3])!;
			const { output: encI } = await this.encodePlane(w, h, indices, null, 16);
			const useRawI = encI.length > len,
				pModeSize = 14 + colors.size * 4 + (useRawI ? len : encI.length);
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
		const planes: Int32Array[] = [];
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
		let bestTSize = Infinity,
			bestBS = 16,
			bestPlanes: Uint8Array<ArrayBuffer>[] = [];
		for (const bs of [16, 32]) {
			let currentP: Uint8Array<ArrayBuffer>[] = [],
				currentS = 0,
				yRes: Int32Array | null = null;
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

	private static async encodePlane(w: number, h: number, data: Int32Array, yRes: Int32Array | null, bs: number): Promise<{ output: Uint8Array<ArrayBuffer>; residuals: Int32Array }> {
		const bw = Math.ceil(w / bs),
			bh = Math.ceil(h / bs),
			len = w * h;
		const ccpTrials = [-16, -12, -8, -6, -4, -3, -2, -1, 0, 1, 2, 3, 4, 6, 8, 12];
		const blockParams = new Int32Array(bw * bh),
			planeResiduals = new Int32Array(len),
			planeCtxIdx = new Uint8Array(len);
		const blockXByPixel = new Uint16Array(w),
			blockRowOffsetByPixel = new Int32Array(h);
		for (let x = 0; x < w; x++) blockXByPixel[x] = Math.floor(x / bs);
		for (let y = 0; y < h; y++) blockRowOffsetByPixel[y] = Math.floor(y / bs) * bw;
		const blockCapacity = bs * bs,
			blockValues = new Int32Array(blockCapacity),
			gapPreds = new Int32Array(blockCapacity),
			gapCtxIdxs = new Uint8Array(blockCapacity),
			medPreds = new Int32Array(blockCapacity),
			medCtxIdxs = new Uint8Array(blockCapacity),
			avgPreds = new Int32Array(blockCapacity),
			yBlock = yRes === null ? null : new Int32Array(blockCapacity),
			gapInfo = new Int32Array(2),
			medInfo = new Int32Array(2);
		for (let by = 0; by < bh; by++) {
			for (let bx = 0; bx < bw; bx++) {
				const yS = by * bs,
					yE = Math.min(yS + bs, h),
					xS = bx * bs,
					xE = Math.min(xS + bs, w);
				let isC = true,
					v0 = data[yS * w + xS];
				for (let y = yS; y < yE; y++) {
					for (let x = xS; x < xE; x++)
						if (data[y * w + x] !== v0) {
							isC = false;
							break;
						}
					if (!isC) break;
				}
				if (isC) {
					blockParams[by * bw + bx] = 3 | (this.zigzag(v0) << 2);
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
						avgPreds[pos] = x > 0 && y > 0 ? (data[i - 1] + data[i - w]) >> 1 : y > 0 ? data[i - w] : x > 0 ? data[i - 1] : 128;
						if (yBlock !== null) yBlock[pos] = yRes![i];
						pos++;
					}
				}
				let bestM = 0,
					bestFIdx = 8,
					minE = Infinity;
				for (let m = 0; m < 3; m++) {
					const preds = m === 0 ? gapPreds : m === 1 ? medPreds : avgPreds;
					const fStart = yBlock === null ? 8 : 0,
						fEnd = yBlock === null ? 9 : 16;
					for (let fIdx = fStart; fIdx < fEnd; fIdx++) {
						const f = ccpTrials[fIdx];
						let err = 0,
							p = 0;
						for (; p < blockArea; p++) {
							err += Math.abs(blockValues[p] - preds[p] - (yBlock === null ? 0 : (yBlock[p] * f) >> 3));
						}
						if (err < minE) {
							minE = err;
							bestM = m;
							bestFIdx = fIdx;
						}
					}
				}
				blockParams[by * bw + bx] = bestM | (bestFIdx << 2);
				const f = ccpTrials[bestFIdx],
					bestPreds = bestM === 0 ? gapPreds : bestM === 1 ? medPreds : avgPreds;
				pos = 0;
				for (let y = yS; y < yE; y++) {
					for (let x = xS; x < xE; x++) {
						const i = y * w + x;
						planeResiduals[i] = blockValues[pos] - bestPreds[pos] - (yBlock === null ? 0 : (yBlock[pos] * f) >> 3);
						planeCtxIdx[i] = bestM === 1 ? medCtxIdxs[pos] : gapCtxIdxs[pos];
						pos++;
					}
				}
			}
		}
		const output = new Uint8Array(len * 6 + 65536);
		let op = 0,
			low = 0,
			high = this.RANGE_MAX,
			underflow = 0,
			currentByte = 0,
			bitCount = 0;
		const putBit = (bit: number) => {
			currentByte = (currentByte << 1) | bit;
			if (++bitCount === 8) {
				output[op++] = currentByte;
				bitCount = 0;
				currentByte = 0;
			}
		};
		const applyBit = (bit: number) => {
			putBit(bit);
			for (; underflow > 0; underflow--) {
				currentByte = (currentByte << 1) | (bit ^ 1);
				if (++bitCount === 8) {
					output[op++] = currentByte;
					bitCount = 0;
					currentByte = 0;
				}
			}
		};
		const encodeBitRaw = (bit: number) => {
			const range = high - low + 1,
				mid = low + Math.floor(range / 2);
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
				low = (low << 1) >>> 0;
				high = ((high << 1) | 1) >>> 0;
			}
		};
		const encodeEscaped = (v: number) => {
			const sign = v < 0 ? 1 : 0,
				abs = Math.abs(v);
			encodeBitRaw(sign);
			let k = 0;
			while (abs >= 1 << (k + 8)) {
				encodeBitRaw(1);
				k++;
			}
			encodeBitRaw(0);
			for (let b = k + 7; b >= 0; b--) encodeBitRaw((abs >> b) & 1);
		};
		for (let i = 0; i < bw * bh; i++) {
			const p = blockParams[i],
				m = p & 3;
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
					const fI = (p >> 2) & 15;
					for (let b = 3; b >= 0; b--) encodeBitRaw((fI >> b) & 1);
				}
			} else encodeEscaped(this.unzigzag(p >> 2));
		}
		const models = Array.from({ length: 1100 }, () => new Model());
		const biasSums = new Int32Array(1100),
			biasCounts = new Int32Array(1100);
		for (let y = 0; y < h; y++) {
			for (let x = 0; x < w; x++) {
				const i = y * w + x,
					bp = blockParams[blockRowOffsetByPixel[y] + blockXByPixel[x]];
				if ((bp & 3) === 3) continue;
				const ctxIdx = planeCtxIdx[i];
				let cS = 0;
				if (yRes === null) {
					const rL = x > 0 ? planeResiduals[i - 1] : 0,
						rU = y > 0 ? planeResiduals[i - w] : 0;
					const a = Math.abs(rL) + Math.abs(rU),
						s = rL + rU < 0 ? 1 : rL + rU > 0 ? 2 : 0;
					cS = s === 0 ? 0 : a <= 4 ? s : a <= 16 ? s + 2 : s + 4;
				} else {
					const ry = yRes[i],
						a = Math.abs(ry),
						s = ry < 0 ? 1 : ry > 0 ? 2 : 0;
					const rL = x > 0 ? planeResiduals[i - 1] : 0,
						rU = y > 0 ? planeResiduals[i - w] : 0;
					const sC = (rL < 0 ? 1 : rL > 0 ? 2 : 0) + (rU < 0 ? 1 : rU > 0 ? 2 : 0);
					cS = s === 0 ? (sC > 3 ? 3 : sC) : a <= 2 ? s + 4 : a <= 10 ? s + 6 : s + 8;
				}
				const fIdx = ctxIdx * 12 + cS,
					model = models[fIdx],
					res = planeResiduals[i];
				const biasCount = biasCounts[fIdx],
					bias = biasCount > 0 ? Math.trunc(biasSums[fIdx] / biasCount) : 0;
				const diff = res - bias,
					zz = this.zigzag(diff) >>> 0,
					zz_c = zz >= 256 ? 256 : zz;
				const range = high - low + 1,
					cum = model.getCum(zz_c),
					freq = model.getFreq(zz_c);
				const nL = low + Math.floor((range * cum) / model.sum);
				high = low + Math.floor((range * (cum + freq)) / model.sum) - 1;
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
					low = (low << 1) >>> 0;
					high = ((high << 1) | 1) >>> 0;
				}
				if (zz_c === 256) encodeEscaped(diff);
				biasSums[fIdx] += res;
				biasCounts[fIdx]++;
				if (biasCounts[fIdx] === 128) {
					biasSums[fIdx] >>= 1;
					biasCounts[fIdx] >>= 1;
				}
				model.update(zz_c, model.sum < 32768 ? (model.sum < 1024 ? 32 : model.sum < 4096 ? 16 : 8) : 0);
				if (model.sum >= 32768) model.resort();
			}
		}
		underflow++;
		if (low < this.QUARTER) applyBit(0);
		else applyBit(1);
		if (bitCount > 0) output[op++] = currentByte << (8 - bitCount);
		const sH = new DataView(new ArrayBuffer(4));
		sH.setUint32(0, op);
		const encoded = new Uint8Array(4 + op);
		encoded.set(new Uint8Array(sH.buffer), 0);
		encoded.set(output.subarray(0, op), 4);
		return { output: encoded, residuals: planeResiduals };
	}

	public static async decode(blob: Blob): Promise<{ w: number; h: number; data: Uint8Array<ArrayBuffer> }> {
		const ab = await blob.arrayBuffer(),
			dv = new DataView(ab);
		const w = dv.getUint32(4),
			h = dv.getUint32(8),
			mode = dv.getUint8(12);
		if (mode === 0) {
			const c = dv.getUint32(13),
				data = new Uint8Array(w * h * 4),
				r = (c >> 24) & 0xff,
				g = (c >> 16) & 0xff,
				b = (c >> 8) & 0xff,
				a = c & 0xff;
			for (let i = 0; i < w * h; i++) {
				data[i * 4] = r;
				data[i * 4 + 1] = g;
				data[i * 4 + 2] = b;
				data[i * 4 + 3] = a;
			}
			return { w, h, data };
		}
		if (mode === 1 || mode === 4) {
			const pS = dv.getUint8(13) + 1,
				palette = new Uint32Array(pS);
			for (let i = 0; i < pS; i++) palette[i] = dv.getUint32(14 + i * 4);
			let indices: Int32Array;
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
				data[i * 4] = (c >> 24) & 0xff;
				data[i * 4 + 1] = (c >> 16) & 0xff;
				data[i * 4 + 2] = (c >> 8) & 0xff;
				data[i * 4 + 3] = c & 0xff;
			}
			return { w, h, data };
		}
		const flags = dv.getUint8(13),
			cA = (flags & 1) === 1,
			isG = (flags & 2) === 2,
			a0 = dv.getUint8(14);
		if (mode === 3) {
			return { w, h, data: this.decodeRawData(w, h, new Uint8Array(ab.slice(15)), isG, cA, a0) };
		}
		if (mode === 5) {
			const formatCode = dv.getUint8(15),
				raw = await this.runDecompression(new Uint8Array(ab.slice(16)), this.getCompressedRawFormat(formatCode));
			return { w, h, data: this.decodeRawData(w, h, raw, isG, cA, a0) };
		}
		if (mode === 6) {
			const topK = dv.getUint8(14),
				componentSpan = dv.getUint8(15),
				payload = await this.runDecompression(new Uint8Array(ab.slice(16)), this.getCompressedRawFormat(dv.getUint8(13))),
				len = w * h;
			let offset = 0;
			const labels = payload.subarray(offset, offset + len);
			offset += len;
			const dominantColors = new Uint32Array(topK);
			for (let i = 0; i < topK; i++) {
				dominantColors[i] =
					(payload[offset] << 24) | (payload[offset + 1] << 16) | (payload[offset + 2] << 8) | payload[offset + 3];
				offset += 4;
			}
			const familyPalettes: number[][] = Array.from({ length: topK }, () => []);
			for (let family = 0; family < topK; family++) {
				const count = payload[offset++],
					base = dominantColors[family],
					baseR = (base >>> 24) & 0xff,
					baseG = (base >>> 16) & 0xff,
					baseB = (base >>> 8) & 0xff;
				for (let i = 0; i < count; i++) {
					const color =
						((((baseR + payload[offset++]) & 0xff) << 24) | (((baseG + payload[offset++]) & 0xff) << 16) | (((baseB + payload[offset++]) & 0xff) << 8) | 0xff) >>> 0;
					familyPalettes[family].push(color);
				}
			}
			const rgba = new Uint8Array(len * 4);
			for (let i = 0; i < len; i++) {
				const color = dominantColors[labels[i]];
				rgba[i * 4] = (color >>> 24) & 0xff;
				rgba[i * 4 + 1] = (color >>> 16) & 0xff;
				rgba[i * 4 + 2] = (color >>> 8) & 0xff;
				rgba[i * 4 + 3] = color & 0xff;
			}
			const componentCountInfo = this.readVarint(payload, offset);
			offset = componentCountInfo.offset;
			const families = new Uint8Array(componentCountInfo.value);
			let familyOffset = 0;
			for (let family = 0; family < topK; family++) {
				const familyCountInfo = this.readVarint(payload, offset);
				offset = familyCountInfo.offset;
				families.fill(family, familyOffset, familyOffset + familyCountInfo.value);
				familyOffset += familyCountInfo.value;
			}
			const positions = new Uint32Array(componentCountInfo.value);
			let prevPos = 0;
			for (let c = 0; c < componentCountInfo.value; c++) {
				const posInfo = this.readZigZagVarint(payload, offset);
				offset = posInfo.offset;
				prevPos += posInfo.value;
				positions[c] = prevPos;
			}
			for (let cell = 0; cell < componentSpan * componentSpan; cell++) {
				const gx = cell % componentSpan,
					gy = Math.floor(cell / componentSpan);
				for (let c = 0; c < componentCountInfo.value; c++) {
					const colorIdx = payload[offset++];
					if (colorIdx === 0xff) continue;
					const x = positions[c] % w,
						y = Math.floor(positions[c] / w);
					if (x + gx >= w || y + gy >= h) continue;
					const color = familyPalettes[families[c]][colorIdx],
						pixel = ((y + gy) * w + (x + gx)) * 4;
					rgba[pixel] = (color >>> 24) & 0xff;
					rgba[pixel + 1] = (color >>> 16) & 0xff;
					rgba[pixel + 2] = (color >>> 8) & 0xff;
					rgba[pixel + 3] = color & 0xff;
				}
			}
			return { w, h, data: rgba };
		}
		let offset = 16;
		const bs = dv.getUint8(15),
			planes: Int32Array[] = [];
		let yRes: Int32Array | null = null;
		const numPlanes = (isG ? 1 : 3) + (cA ? 0 : 1);
		for (let p = 0; p < numPlanes; p++) {
			const size = dv.getUint32(offset),
				blob = new Blob([ab.slice(offset)]),
				useY = !isG && (p === 1 || p === 2);
			const { data: dP, residuals: res } = await this.decodePlane(w, h, blob, useY ? yRes : null, bs);
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

	private static async decodePlane(w: number, h: number, blob: Blob, yRes: Int32Array | null, bs: number): Promise<{ data: Int32Array; residuals: Int32Array }> {
		const ab = await blob.arrayBuffer(),
			buf = new Uint8Array(ab.slice(4));
		let bp = 0,
			bitIdx = 0;
		const getBit = () => {
			if (bp >= buf.length) return 0;
			const b = (buf[bp] >> (7 - bitIdx)) & 1;
			if (++bitIdx === 8) {
				bitIdx = 0;
				bp++;
			}
			return b;
		};
		let low = 0,
			high = this.RANGE_MAX,
			val = 0;
		for (let i = 0; i < 30; i++) val = ((val << 1) | getBit()) >>> 0;
		const decodeBitRaw = () => {
			const range = high - low + 1,
				mid = low + Math.floor(range / 2);
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
				low = (low << 1) >>> 0;
				high = ((high << 1) | 1) >>> 0;
				val = ((val << 1) | getBit()) >>> 0;
			}
			return bit;
		};
		const decodeEscaped = () => {
			const sign = decodeBitRaw();
			let k = 0;
			while (decodeBitRaw() === 1) k++;
			let abs = 0;
			for (let b = 0; b < k + 8; b++) abs = (abs << 1) | decodeBitRaw();
			return sign === 1 ? -abs : abs;
		};
		const bw = Math.ceil(w / bs),
			bh = Math.ceil(h / bs),
			blockParams = new Int32Array(bw * bh);
		const blockXByPixel = new Uint16Array(w),
			blockRowOffsetByPixel = new Int32Array(h);
		for (let x = 0; x < w; x++) blockXByPixel[x] = Math.floor(x / bs);
		for (let y = 0; y < h; y++) blockRowOffsetByPixel[y] = Math.floor(y / bs) * bw;
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
					for (let b = 0; b < 4; b++) fIdx = (fIdx << 1) | decodeBitRaw();
				}
				blockParams[i] = m | (fIdx << 2);
			} else blockParams[i] = m | (this.zigzag(decodeEscaped()) << 2);
		}
		const models = Array.from({ length: 1100 }, () => new Model());
		const biasSums = new Int32Array(1100),
			biasCounts = new Int32Array(1100);
		const out = new Int32Array(w * h),
			planeRes = new Int32Array(w * h),
			info = new Int32Array(2);
		for (let y = 0; y < h; y++) {
			for (let x = 0; x < w; x++) {
				const i = y * w + x,
					bp = blockParams[blockRowOffsetByPixel[y] + blockXByPixel[x]];
				if ((bp & 3) === 3) {
					out[i] = this.unzigzag(bp >> 2);
					continue;
				}
				const m = bp & 3,
					f = ccpTrials[(bp >> 2) & 15];
				let pr: number, ctxIdx: number;
				if (m === 0) {
					this.gapInto(x, y, w, out, info);
					pr = info[0];
					ctxIdx = info[1];
				} else if (m === 1) {
					this.medInto(x, y, w, out, info);
					pr = info[0];
					ctxIdx = info[1];
				} else {
					pr = x > 0 && y > 0 ? (out[i - 1] + out[i - w]) >> 1 : y > 0 ? out[i - w] : x > 0 ? out[i - 1] : 128;
					this.gapInto(x, y, w, out, info);
					ctxIdx = info[1];
				}
				let cS = 0;
				if (yRes === null) {
					const rL = x > 0 ? planeRes[i - 1] : 0,
						rU = y > 0 ? planeRes[i - w] : 0;
					const a = Math.abs(rL) + Math.abs(rU),
						s = rL + rU < 0 ? 1 : rL + rU > 0 ? 2 : 0;
					cS = s === 0 ? 0 : a <= 4 ? s : a <= 16 ? s + 2 : s + 4;
				} else {
					const ry = yRes[i],
						a = Math.abs(ry),
						s = ry < 0 ? 1 : ry > 0 ? 2 : 0;
					const rL = x > 0 ? planeRes[i - 1] : 0,
						rU = y > 0 ? planeRes[i - w] : 0;
					const sC = (rL < 0 ? 1 : rL > 0 ? 2 : 0) + (rU < 0 ? 1 : rU > 0 ? 2 : 0);
					cS = s === 0 ? (sC > 3 ? 3 : sC) : a <= 2 ? s + 4 : a <= 10 ? s + 6 : s + 8;
				}
				const fIdx = ctxIdx * 12 + cS,
					model = models[fIdx],
					range = high - low + 1,
					count = Math.floor(((val - low + 1) * model.sum - 1) / range);
				const zz_c = model.find(count);
				const cum = model.getCum(zz_c),
					freq = model.getFreq(zz_c);
				const nL = low + Math.floor((range * cum) / model.sum);
				high = low + Math.floor((range * (cum + freq)) / model.sum) - 1;
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
					low = (low << 1) >>> 0;
					high = ((high << 1) | 1) >>> 0;
					val = ((val << 1) | getBit()) >>> 0;
				}
				const diff = zz_c === 256 ? decodeEscaped() : this.unzigzag(zz_c);
				const biasCount = biasCounts[fIdx],
					bias = biasCount > 0 ? Math.trunc(biasSums[fIdx] / biasCount) : 0;
				const res = diff + bias;
				planeRes[i] = res;
				out[i] = res + pr + (yRes === null ? 0 : (yRes[i] * f) >> 3);
				biasSums[fIdx] += res;
				biasCounts[fIdx]++;
				if (biasCounts[fIdx] === 128) {
					biasSums[fIdx] >>= 1;
					biasCounts[fIdx] >>= 1;
				}
				model.update(zz_c, model.sum < 32768 ? (model.sum < 1024 ? 32 : model.sum < 4096 ? 16 : 8) : 0);
				if (model.sum >= 32768) model.resort();
			}
		}
		return { data: out, residuals: planeRes };
	}
}
