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

	// Paeth予測器: JPEG-LS等で使われるより高度な予測
	private static paeth(a: number, b: number, c: number): number {
		const p = a + b - c;
		const pa = Math.abs(p - a);
		const pb = Math.abs(p - b);
		const pc = Math.abs(p - c);
		if (pa <= pb && pa <= pc) return a;
		if (pb <= pc) return b;
		return c;
	}

	private static zigzag(v: number): number {
		return (v << 1) ^ (v >> 31);
	}
	private static unzigzag(v: number): number {
		return (v >>> 1) ^ -(v & 1);
	}

	// --- 算術符号化エンジン (整数実装) ---
	private static readonly TOP_VALUE = 0xffffffff;
	private static readonly FIRST_QUARTER = 0x40000000;
	private static readonly HALF = 0x80000000;
	private static readonly THIRD_QUARTER = 0xc0000000;

	public static async encode(w: number, h: number, planes: Int32Array[]): Promise<Blob> {
		const output = new Uint8Array(w * h * 4); // 十分なバッファ
		let op = 0;
		let low = 0,
			high = this.TOP_VALUE,
			bits_to_follow = 0;

		const writeByte = (b: number) => {
			output[op++] = b;
		};
		const outBit = (bit: number) => {
			currentByte = (currentByte << 1) | bit;
			if (++bitCount === 8) {
				writeByte(currentByte);
				bitCount = 0;
				currentByte = 0;
			}
		};
		const outBitWithFollow = (bit: number) => {
			outBit(bit);
			for (; bits_to_follow > 0; bits_to_follow--) outBit(bit ^ 1);
		};

		let bitCount = 0,
			currentByte = 0;

		// コンテキスト別の頻度表 (3コンテキスト × 512シンボル)
		const freqs = Array.from({ length: 3 }, () => new Uint32Array(513).fill(1));
		const sums = new Uint32Array(3).fill(512);

		for (let p = 0; p < 3; p++) {
			const data = planes[p];
			let lastErr = 0;

			for (let y = 0; y < h; y++) {
				for (let x = 0; x < w; x++) {
					const i = y * w + x;
					const a = x > 0 ? data[i - 1] : y > 0 ? data[i - w] : 0;
					const b = y > 0 ? data[i - w] : a;
					const c = x > 0 && y > 0 ? data[i - w - 1] : b;

					const pred = this.paeth(a, b, c);
					const zz = this.zigzag(data[i] - pred);

					// 直前の誤差の大きさでコンテキストを選択
					const ctx = lastErr < 2 ? 0 : lastErr < 8 ? 1 : 2;
					lastErr = zz;

					const f = freqs[ctx];
					let cum = 0;
					for (let j = 0; j < zz; j++) cum += f[j];

					const range = high - low + 1;
					high = low + Math.floor((range * (cum + f[zz])) / sums[ctx]) - 1;
					low = low + Math.floor((range * cum) / sums[ctx]);

					while (true) {
						if (high < this.HALF) outBitWithFollow(0);
						else if (low >= this.HALF) {
							outBitWithFollow(1);
							low -= this.HALF;
							high -= this.HALF;
						} else if (low >= this.FIRST_QUARTER && high < this.THIRD_QUARTER) {
							bits_to_follow++;
							low -= this.FIRST_QUARTER;
							high -= this.FIRST_QUARTER;
						} else break;
						low = (low << 1) >>> 0;
						high = ((high << 1) | 1) >>> 0;
					}

					// 頻度の更新
					f[zz]++;
					sums[ctx]++;
					if (sums[ctx] > 16384) {
						// 定期的にスケーリングして適応性を維持
						for (let j = 0; j < 513; j++) f[j] = (f[j] >> 1) | 1;
						let s = 0;
						for (let j = 0; j < 512; j++) s += f[j];
						sums[ctx] = s;
					}
				}
			}
		}
		// 終了フラッシュ
		bits_to_follow++;
		if (low < this.FIRST_QUARTER) outBitWithFollow(0);
		else outBitWithFollow(1);
		if (bitCount > 0) writeByte(currentByte << (8 - bitCount));

		const header = new DataView(new ArrayBuffer(12));
		this.MAGIC.forEach((b, i) => header.setUint8(i, b));
		header.setUint32(4, w);
		header.setUint32(8, h);
		return new Blob([header, output.slice(0, op)]);
	}

	public static async decode(blob: Blob): Promise<{ w: number; h: number; planes: Int32Array[] }> {
		const arrayBuf = await blob.arrayBuffer();
		const buf = new Uint8Array(arrayBuf);
		const dv = new DataView(arrayBuf);
		const w = dv.getUint32(4),
			h = dv.getUint32(8);
		const len = w * h;

		let bp = 12,
			bitIdx = 0;
		const readBit = () => {
			const b = (buf[bp] >> (7 - bitIdx)) & 1;
			if (++bitIdx === 8) {
				bitIdx = 0;
				bp++;
			}
			return b;
		};

		let low = 0,
			high = this.TOP_VALUE,
			value = 0;
		for (let i = 0; i < 32; i++) value = ((value << 1) | readBit()) >>> 0;

		const freqs = Array.from({ length: 3 }, () => new Uint32Array(513).fill(1));
		const sums = new Uint32Array(3).fill(512);
		const planes = [new Int32Array(len), new Int32Array(len), new Int32Array(len)];

		for (let p = 0; p < 3; p++) {
			const out = planes[p];
			let lastErr = 0;
			for (let i = 0; i < len; i++) {
				const x = i % w,
					y = Math.floor(i / w);
				const a = x > 0 ? out[i - 1] : y > 0 ? out[i - w] : 0;
				const b = y > 0 ? out[i - w] : a;
				const c = x > 0 && y > 0 ? out[i - w - 1] : b;
				const pred = this.paeth(a, b, c);

				const ctx = lastErr < 2 ? 0 : lastErr < 8 ? 1 : 2;
				const f = freqs[ctx];
				const range = high - low + 1;
				const count = Math.floor(((value - low + 1) * sums[ctx] - 1) / range);

				let zz = 0,
					cum = 0;
				while (cum + f[zz] <= count) cum += f[zz++];

				high = low + Math.floor((range * (cum + f[zz])) / sums[ctx]) - 1;
				low = low + Math.floor((range * cum) / sums[ctx]);

				while (true) {
					if (high < this.HALF) {
					} else if (low >= this.HALF) {
						low -= this.HALF;
						high -= this.HALF;
						value -= this.HALF;
					} else if (low >= this.FIRST_QUARTER && high < this.THIRD_QUARTER) {
						low -= this.FIRST_QUARTER;
						high -= this.FIRST_QUARTER;
						value -= this.FIRST_QUARTER;
					} else break;
					low = (low << 1) >>> 0;
					high = ((high << 1) | 1) >>> 0;
					value = ((value << 1) | readBit()) >>> 0;
				}

				out[i] = pred + this.unzigzag(zz);
				lastErr = zz;
				f[zz]++;
				sums[ctx]++;
				if (sums[ctx] > 16384) {
					for (let j = 0; j < 513; j++) f[j] = (f[j] >> 1) | 1;
					let s = 0;
					for (let j = 0; j < 512; j++) s += f[j];
					sums[ctx] = s;
				}
			}
		}
		return { w, h, planes };
	}
}
