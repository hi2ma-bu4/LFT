export class LFT {
	private static readonly MAGIC = new Uint8Array([76, 70, 84, 33]);

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

	private static gap(x: number, y: number, w: number, data: Int32Array): { pred: number; ctxIdx: number } {
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

	private static med(x: number, y: number, w: number, data: Int32Array): { pred: number; ctxIdx: number } {
		const i = y * w + x;
		const n = y > 0 ? data[i - w] : 128;
		const w_ = x > 0 ? data[i - 1] : n;
		const nw = y > 0 && x > 0 ? data[i - w - 1] : n;

		let pred: number;
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

	private static zigzag(v: number): number {
		return (v << 1) ^ (v >> 31);
	}
	private static unzigzag(v: number): number {
		return (v >>> 1) ^ -(v & 1);
	}

	private static readonly RANGE_MAX = 0x3fffffff;
	private static readonly HALF = 0x20000000;
	private static readonly QUARTER = 0x10000000;
	private static readonly MODEL_SIZE = 1025;
	private static readonly CONTEXTS = 8;

	public static async encode(w: number, h: number, rgba: Uint8Array): Promise<Blob> {
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

		// Pre-pass to choose best predictor per plane
		const predictorTypes = new Uint8Array(4); // 0: GAP, 1: MED
		for (let p = 0; p < (constantAlpha ? 3 : 4); p++) {
			let errGap = 0,
				errMed = 0;
			for (let y = 0; y < h; y++) {
				for (let x = 0; x < w; x++) {
					errGap += Math.abs(planes[p][y * w + x] - this.gap(x, y, w, planes[p]).pred);
					errMed += Math.abs(planes[p][y * w + x] - this.med(x, y, w, planes[p]).pred);
				}
			}
			predictorTypes[p] = errMed < errGap ? 1 : 0;
		}

		const output = new Uint8Array(len * 5 + 128);
		let op = 0,
			low = 0,
			high = this.RANGE_MAX,
			underflow = 0;
		let currentByte = 0,
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
			for (; underflow > 0; underflow--) putBit(bit ^ 1);
		};

		const encodeBitRaw = (bit: number) => {
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
				low = (low << 1) >>> 0;
				high = ((high << 1) | 1) >>> 0;
			}
		};

		// Header bits
		encodeBitRaw(constantAlpha ? 1 : 0);
		if (constantAlpha) {
			for (let i = 7; i >= 0; i--) encodeBitRaw((alpha0 >> i) & 1);
		}
		for (let p = 0; p < 4; p++) encodeBitRaw(predictorTypes[p]);

		const models = Array.from({ length: 4 * this.CONTEXTS }, () => {
			const f = new Uint32Array(this.MODEL_SIZE).fill(1);
			return { f, sum: this.MODEL_SIZE };
		});

		for (let p = 0; p < (constantAlpha ? 3 : 4); p++) {
			const data = planes[p];
			const isMed = predictorTypes[p] === 1;
			for (let y = 0; y < h; y++) {
				for (let x = 0; x < w; x++) {
					const { pred, ctxIdx } = isMed ? this.med(x, y, w, data) : this.gap(x, y, w, data);
					const diff = data[y * w + x] - pred;
					const zzFull = this.zigzag(diff);
					let zz = zzFull >>> 0;

					const model = models[p * this.CONTEXTS + ctxIdx];
					if (zz >= this.MODEL_SIZE - 1) zz = this.MODEL_SIZE - 1;

					const range = high - low + 1;
					let cum = 0;
					for (let j = 0; j < zz; j++) cum += model.f[j];

					const next_low = low + Math.floor((range * cum) / model.sum);
					high = low + Math.floor((range * (cum + model.f[zz])) / model.sum) - 1;
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
						low = (low << 1) >>> 0;
						high = ((high << 1) | 1) >>> 0;
					}

					if (zz === this.MODEL_SIZE - 1) {
						for (let i = 31; i >= 0; i--) encodeBitRaw((zzFull >>> i) & 1);
					}

					model.f[zz] += 8;
					model.sum += 8;
					if (model.sum > 32768) {
						model.sum = 0;
						for (let j = 0; j < this.MODEL_SIZE; j++) {
							model.f[j] = (model.f[j] >> 1) | 1;
							model.sum += model.f[j];
						}
					}
				}
			}
		}

		underflow++;
		if (low < this.QUARTER) applyBit(0);
		else applyBit(1);
		if (bitCount > 0) output[op++] = currentByte << (8 - bitCount);

		const head = new DataView(new ArrayBuffer(12));
		this.MAGIC.forEach((b, i) => head.setUint8(i, b));
		head.setUint32(4, w);
		head.setUint32(8, h);
		return new Blob([head, output.subarray(0, op)]);
	}

	public static async decode(blob: Blob): Promise<{ w: number; h: number; data: Uint8Array }> {
		const ab = await blob.arrayBuffer();
		const dv = new DataView(ab);
		const w = dv.getUint32(4),
			h = dv.getUint32(8);
		const buf = new Uint8Array(ab);
		const len = w * h;

		let bp = 12,
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
			const range = high - low + 1;
			const mid = low + Math.floor(range / 2);
			let bit: number;
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
				low = (low << 1) >>> 0;
				high = ((high << 1) | 1) >>> 0;
				val = ((val << 1) | getBit()) >>> 0;
			}
			return bit;
		};

		const constantAlpha = decodeBitRaw() === 1;
		let alpha0 = 255;
		if (constantAlpha) {
			alpha0 = 0;
			for (let i = 0; i < 8; i++) alpha0 = (alpha0 << 1) | decodeBitRaw();
		}
		const predictorTypes = new Uint8Array(4);
		for (let p = 0; p < 4; p++) predictorTypes[p] = decodeBitRaw();

		const models = Array.from({ length: 4 * this.CONTEXTS }, () => {
			const f = new Uint32Array(this.MODEL_SIZE).fill(1);
			return { f, sum: this.MODEL_SIZE };
		});

		const planes = [new Int32Array(len), new Int32Array(len), new Int32Array(len), new Int32Array(len)];
		if (constantAlpha) planes[3].fill(alpha0);

		for (let p = 0; p < (constantAlpha ? 3 : 4); p++) {
			const out = planes[p];
			const isMed = predictorTypes[p] === 1;
			for (let y = 0; y < h; y++) {
				for (let x = 0; x < w; x++) {
					const { pred, ctxIdx } = isMed ? this.med(x, y, w, out) : this.gap(x, y, w, out);
					const model = models[p * this.CONTEXTS + ctxIdx];
					const range = high - low + 1;
					const count = Math.floor(((val - low + 1) * model.sum - 1) / range);

					let zz = 0,
						tmpCum = 0;
					while (tmpCum + model.f[zz] <= count) tmpCum += model.f[zz++];

					const next_low = low + Math.floor((range * tmpCum) / model.sum);
					high = low + Math.floor((range * (tmpCum + model.f[zz])) / model.sum) - 1;
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
						low = (low << 1) >>> 0;
						high = ((high << 1) | 1) >>> 0;
						val = ((val << 1) | getBit()) >>> 0;
					}

					let valZZ = zz;
					if (zz === this.MODEL_SIZE - 1) {
						valZZ = 0;
						for (let i = 0; i < 32; i++) valZZ = (valZZ << 1) | decodeBitRaw();
					}

					out[y * w + x] = this.unzigzag(valZZ) + pred;

					model.f[zz] += 8;
					model.sum += 8;
					if (model.sum > 32768) {
						model.sum = 0;
						for (let j = 0; j < this.MODEL_SIZE; j++) {
							model.f[j] = (model.f[j] >> 1) | 1;
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
}
