class LFT {
	private static readonly MAGIC = new Uint8Array([76, 70, 84, 33]);

	public static rgbToYCoCgR(r: number, g: number, b: number): [number, number, number] {
		const co = r - b;
		const tmp = b + (co >> 1);
		const cg = g - tmp;
		const y = tmp + (cg >> 1);
		return [y, co, cg];
	}

	public static yCoCgRToRgb(y: number, co: number, cg: number): [number, number, number] {
		const tmp = y - (cg >> 1);
		const g = cg + tmp;
		const b = tmp - (co >> 1);
		const r = b + co;
		return [r, g, b];
	}

	// Gradient Adaptive Predictor (GAP) - CALIC等で採用される高精度予測
	private static gap(x: number, y: number, w: number, data: Int32Array): number {
		const i = y * w + x;
		const n = y > 0 ? data[i - w] : 0;
		const w_ = x > 0 ? data[i - 1] : n;
		const ne = y > 0 && x < w - 1 ? data[i - w + 1] : n;
		const nw = y > 0 && x > 0 ? data[i - w - 1] : n;
		const nn = y > 1 ? data[i - 2 * w] : n;
		const ww = x > 1 ? data[i - 2] : w_;

		const dh = Math.abs(w_ - ww) + Math.abs(n - nw) + Math.abs(n - ne);
		const dv = Math.abs(w_ - nw) + Math.abs(n - nn) + Math.abs(ne - (y > 1 && x < w - 1 ? data[i - 2 * w + 1] : ne));

		if (dv - dh > 80) return w_; // 強い水平エッジ
		if (dh - dv > 80) return n; // 強い垂直エッジ

		let pred = (w_ + n) / 2 + (ne - nw) / 4;
		if (dv - dh > 32) return (pred + w_) / 2; // 弱い水平エッジ
		if (dh - dv > 32) return (pred + n) / 2; // 弱い垂直エッジ
		return pred;
	}

	private static zigzag(v: number): number {
		return (v << 1) ^ (v >> 31);
	}
	private static unzigzag(v: number): number {
		return (v >>> 1) ^ -(v & 1);
	}

	// --- 算術符号化定数 ---
	private static readonly RANGE_MAX = 0xffffffff;
	private static readonly HALF = 0x80000000;
	private static readonly QUARTER = 0x40000000;

	public static async encode(w: number, h: number, planes: Int32Array[]): Promise<Blob> {
		const output = new Uint8Array(w * h * 4);
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

		// コンテキストモデル: 0-511の各値に対する累積頻度
		// WebP2の性能に近づけるため、コンテキストを細分化（輝度Yと色差Co/Cgで分離）
		const models = Array.from({ length: 3 }, () => {
			const f = new Uint32Array(513).fill(1);
			return { f, sum: 512 };
		});

		for (let p = 0; p < 3; p++) {
			const data = planes[p];
			const model = models[p];

			for (let y = 0; y < h; y++) {
				for (let x = 0; x < w; x++) {
					const zz = this.zigzag(data[y * w + x] - Math.round(this.gap(x, y, w, data)));

					const range = high - low + 1;
					let cum = 0;
					for (let j = 0; j < zz; j++) cum += model.f[j];

					high = low + Math.floor((range * (cum + model.f[zz])) / model.sum) - 1;
					low = low + Math.floor((range * cum) / model.sum);

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

					model.f[zz] += 8; // 頻度を強めに更新
					model.sum += 8;
					if (model.sum > 32768) {
						model.sum = 0;
						for (let j = 0; j < 513; j++) {
							model.f[j] = (model.f[j] >> 1) | 1;
							model.sum += model.f[j];
						}
					}
				}
			}
		}
		applyBit(1); // 終了
		if (bitCount > 0) output[op++] = currentByte << (8 - bitCount);

		const head = new DataView(new ArrayBuffer(12));
		this.MAGIC.forEach((b, i) => head.setUint8(i, b));
		head.setUint32(4, w);
		head.setUint32(8, h);
		return new Blob([head, output.slice(0, op)]);
	}

	public static async decode(blob: Blob): Promise<{ w: number; h: number; planes: Int32Array[] }> {
		const ab = await blob.arrayBuffer();
		const buf = new Uint8Array(ab);
		const w = new DataView(ab).getUint32(4),
			h = new DataView(ab).getUint32(8);
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
		for (let i = 0; i < 32; i++) val = ((val << 1) | getBit()) >>> 0;

		const models = Array.from({ length: 3 }, () => {
			const f = new Uint32Array(513).fill(1);
			return { f, sum: 512 };
		});

		const planes = [new Int32Array(len), new Int32Array(len), new Int32Array(len)];
		for (let p = 0; p < 3; p++) {
			const out = planes[p];
			const model = models[p];
			for (let y = 0; y < h; y++) {
				for (let x = 0; x < w; x++) {
					const range = high - low + 1;
					const count = Math.floor(((val - low + 1) * model.sum - 1) / range);

					let zz = 0,
						tmpCum = 0;
					while (tmpCum + model.f[zz] <= count) tmpCum += model.f[zz++];

					high = low + Math.floor((range * (tmpCum + model.f[zz])) / model.sum) - 1;
					low = low + Math.floor((range * tmpCum) / model.sum);

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

					out[y * w + x] = this.unzigzag(zz) + Math.round(this.gap(x, y, w, out));
					model.f[zz] += 8;
					model.sum += 8;
					if (model.sum > 32768) {
						model.sum = 0;
						for (let j = 0; j < 513; j++) {
							model.f[j] = (model.f[j] >> 1) | 1;
							model.sum += model.f[j];
						}
					}
				}
			}
		}
		return { w, h, planes };
	}
}
