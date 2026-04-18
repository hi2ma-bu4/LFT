class LFT {
	private static readonly MAGIC = new Uint8Array([76, 70, 84, 33]); // "LFT!"
	private static readonly TILE_SIZE = 64;

	// --- [1] ユーティリティ ---
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

	private static paeth(a: number, b: number, c: number): number {
		const p = a + b - c;
		const pa = Math.abs(p - a),
			pb = Math.abs(p - b),
			pc = Math.abs(p - c);
		if (pa <= pb && pa <= pc) return a;
		if (pb <= pc) return b;
		return c;
	}

	// --- [2] 評価と予測 ---
	private static calcEntropy(data: Int32Array): number {
		if (data.length === 0) return 0;
		const counts = new Map<number, number>();
		for (const v of data) counts.set(v, (counts.get(v) || 0) + 1);
		let entropy = 0;
		for (const count of counts.values()) {
			const p = count / data.length;
			entropy -= p * Math.log2(p);
		}
		return entropy;
	}

	private static applyPaeth(ch: Int32Array, w: number, h: number, s: number, decode: boolean) {
		for (let y = decode ? 0 : h - 1; decode ? y < h : y >= 0; decode ? y++ : y--) {
			for (let x = decode ? 0 : w - 1; decode ? x < w : x >= 0; decode ? x++ : x--) {
				const a = x > 0 ? ch[y * s + (x - 1)] : 0;
				const b = y > 0 ? ch[(y - 1) * s + x] : 0;
				const c = x > 0 && y > 0 ? ch[(y - 1) * s + (x - 1)] : 0;
				const p = this.paeth(a, b, c);
				ch[y * s + x] += decode ? p : -p;
			}
		}
	}

	private static applyAlpha(Y: Int32Array, C: Int32Array, alpha: number, decode: boolean) {
		if (alpha === 0) return;
		for (let i = 1; i < Y.length; i++) {
			const pred = (Y[i] * alpha) >> 5;
			C[i] += decode ? pred : -pred;
		}
	}

	// --- [3] 変換コア ---
	private static iwt2D(ch: Int32Array, w: number, h: number, s: number, decode: boolean) {
		const hw = w >> 1,
			hh = h >> 1;
		const tmp = new Int32Array(w * h);
		if (!decode) {
			for (let y = 0; y < h; y++) {
				for (let x = 0; x < hw; x++) {
					const a = ch[y * s + x * 2],
						b = ch[y * s + x * 2 + 1];
					tmp[y * w + x] = (a + b) >> 1;
					tmp[y * w + x + hw] = a - b;
				}
			}
			for (let x = 0; x < w; x++) {
				for (let y = 0; y < hh; y++) {
					const a = tmp[y * 2 * w + x],
						b = tmp[(y * 2 + 1) * w + x];
					ch[y * s + x] = (a + b) >> 1;
					ch[(y + hh) * s + x] = a - b;
				}
			}
		} else {
			for (let x = 0; x < w; x++) {
				for (let y = 0; y < hh; y++) {
					const l = ch[y * s + x],
						d = ch[(y + hh) * s + x];
					tmp[y * 2 * w + x] = l + ((d + 1) >> 1);
					tmp[(y * 2 + 1) * w + x] = l - (d >> 1);
				}
			}
			for (let y = 0; y < h; y++) {
				for (let x = 0; x < hw; x++) {
					const l = tmp[y * w + x],
						d = tmp[y * w + x + hw];
					ch[y * s + x * 2] = l + ((d + 1) >> 1);
					ch[y * s + x * 2 + 1] = l - (d >> 1);
				}
			}
		}
	}

	// --- [4] 最適化シャッフル ---
	private static shuffle(data: Int32Array): Uint8Array {
		const n = data.length;
		const out = new Uint8Array(n * 4);
		for (let i = 0; i < n; i++) {
			const v = (data[i] << 1) ^ (data[i] >> 31); // ZigZag
			out[i] = v & 0xff;
			out[i + n] = (v >> 8) & 0xff;
			out[i + 2 * n] = (v >> 16) & 0xff;
			out[i + 3 * n] = (v >> 24) & 0xff;
		}
		return out;
	}

	private static unshuffle(bytes: Uint8Array): Int32Array {
		const n = bytes.length / 4;
		const out = new Int32Array(n);
		for (let i = 0; i < n; i++) {
			const v = bytes[i] | (bytes[i + n] << 8) | (bytes[i + 2 * n] << 16) | (bytes[i + 3 * n] << 24);
			out[i] = (v >>> 1) ^ -(v & 1);
		}
		return out;
	}

	// --- [5] メイン API ---
	public static async encode(w: number, h: number, planes: Int32Array[]): Promise<Blob> {
		const cols = Math.ceil(w / this.TILE_SIZE),
			rows = Math.ceil(h / this.TILE_SIZE);
		const tileMetas = new Uint8Array(cols * rows * 4);
		const packedDataList: Int32Array[] = [];

		for (let r = 0; r < rows; r++) {
			for (let c = 0; c < cols; c++) {
				const tx = c * this.TILE_SIZE,
					ty = r * this.TILE_SIZE;
				const tw = Math.min(this.TILE_SIZE, w - tx),
					th = Math.min(this.TILE_SIZE, h - ty);
				const tileLen = tw * th;
				const tY = new Int32Array(tileLen),
					tCo = new Int32Array(tileLen),
					tCg = new Int32Array(tileLen);

				for (let y = 0; y < th; y++) {
					for (let x = 0; x < tw; x++) {
						const idx = (ty + y) * w + (tx + x),
							tidx = y * tw + x;
						tY[tidx] = planes[0][idx];
						tCo[tidx] = planes[1][idx];
						tCg[tidx] = planes[2][idx];
					}
				}

				// 最適な構成を探索 (Level & Paeth)
				let bestScore = Infinity,
					bestL = 0,
					bestP = false;
				for (let l = 0; l <= 3; l++) {
					if (tw >> l < 2 || th >> l < 2) break;
					for (const p of [true, false]) {
						const test = new Int32Array(tY);
						for (let i = 0; i < l; i++) this.iwt2D(test, tw >> i, th >> i, tw, false);
						if (p) this.applyPaeth(test, tw >> l, th >> l, tw, false);
						const score = this.calcEntropy(test);
						if (score < bestScore) {
							bestScore = score;
							bestL = l;
							bestP = p;
						}
					}
				}

				// 実際の変換
				for (let i = 0; i < bestL; i++) {
					this.iwt2D(tY, tw >> i, th >> i, tw, false);
					this.iwt2D(tCo, tw >> i, th >> i, tw, false);
					this.iwt2D(tCg, tw >> i, th >> i, tw, false);
				}
				if (bestP) {
					this.applyPaeth(tY, tw >> bestL, th >> bestL, tw, false);
					this.applyPaeth(tCo, tw >> bestL, th >> bestL, tw, false);
					this.applyPaeth(tCg, tw >> bestL, th >> bestL, tw, false);
				}

				// CfL 予測
				const aCo = this.calcAlpha(tY, tCo),
					aCg = this.calcAlpha(tY, tCg);
				this.applyAlpha(tY, tCo, aCo, false);
				this.applyAlpha(tY, tCg, aCg, false);

				// パッキング
				const isEmpty = [tY, tCo, tCg].every((a) => a.every((v) => v === 0));
				const mIdx = (r * cols + c) * 4;
				tileMetas[mIdx] = bestL | (bestP ? 0x40 : 0) | (isEmpty ? 0x80 : 0);
				tileMetas[mIdx + 1] = aCo & 0xff;
				tileMetas[mIdx + 2] = aCg & 0xff;

				if (!isEmpty) {
					packedDataList.push(tY, tCo, tCg); // インターリーブ配置
				}
			}
		}

		// シリアライズ
		const totalDataLen = packedDataList.reduce((acc, a) => acc + a.length, 0);
		const combinedData = new Int32Array(totalDataLen);
		let offset = 0;
		for (const arr of packedDataList) {
			combinedData.set(arr, offset);
			offset += arr.length;
		}

		const header = new DataView(new ArrayBuffer(12));
		this.MAGIC.forEach((b, i) => header.setUint8(i, b));
		header.setUint32(4, w);
		header.setUint32(8, h);

		const shuffled = this.shuffle(combinedData) as Uint8Array<ArrayBuffer>;
		const compressed = await new Response(new Blob([tileMetas, shuffled]).stream().pipeThrough(new CompressionStream("gzip"))).blob();
		return new Blob([header, compressed]);
	}

	private static calcAlpha(Y: Int32Array, C: Int32Array): number {
		let sY2 = 0,
			sYC = 0;
		for (let i = 1; i < Y.length; i++) {
			sY2 += Y[i] * Y[i];
			sYC += Y[i] * C[i];
		}
		return sY2 === 0 ? 0 : Math.max(-128, Math.min(127, Math.round((sYC / sY2) * 32)));
	}

	public static async decode(blob: Blob): Promise<{ w: number; h: number; planes: Int32Array[] }> {
		const headerBuf = await blob.slice(0, 12).arrayBuffer();
		const header = new DataView(headerBuf);
		if (!this.MAGIC.every((v, i) => v === header.getUint8(i))) throw new Error("Invalid LFT file");

		const w = header.getUint32(4),
			h = header.getUint32(8);
		const stream = blob.slice(12).stream().pipeThrough(new DecompressionStream("gzip"));
		const buf = await new Response(stream).arrayBuffer();

		const cols = Math.ceil(w / this.TILE_SIZE),
			rows = Math.ceil(h / this.TILE_SIZE);
		const metaSize = cols * rows * 4;
		const tileMetas = new Uint8Array(buf, 0, metaSize);
		const unshuffled = this.unshuffle(new Uint8Array(buf, metaSize));

		const planes = [new Int32Array(w * h), new Int32Array(w * h), new Int32Array(w * h)];
		let cursor = 0;

		for (let r = 0; r < rows; r++) {
			for (let c = 0; c < cols; c++) {
				const tx = c * this.TILE_SIZE,
					ty = r * this.TILE_SIZE;
				const tw = Math.min(this.TILE_SIZE, w - tx),
					th = Math.min(this.TILE_SIZE, h - ty);
				const tileLen = tw * th;
				const mIdx = (r * cols + c) * 4;
				const flags = tileMetas[mIdx],
					aCo = (tileMetas[mIdx + 1] << 24) >> 24,
					aCg = (tileMetas[mIdx + 2] << 24) >> 24;
				const l = flags & 0x3f,
					p = (flags & 0x40) !== 0,
					empty = (flags & 0x80) !== 0;

				const tY = new Int32Array(tileLen),
					tCo = new Int32Array(tileLen),
					tCg = new Int32Array(tileLen);
				if (!empty) {
					tY.set(unshuffled.subarray(cursor, cursor + tileLen));
					cursor += tileLen;
					tCo.set(unshuffled.subarray(cursor, cursor + tileLen));
					cursor += tileLen;
					tCg.set(unshuffled.subarray(cursor, cursor + tileLen));
					cursor += tileLen;
				}

				this.applyAlpha(tY, tCo, aCo, true);
				this.applyAlpha(tY, tCg, aCg, true);
				if (p) {
					this.applyPaeth(tY, tw >> l, th >> l, tw, true);
					this.applyPaeth(tCo, tw >> l, th >> l, tw, true);
					this.applyPaeth(tCg, tw >> l, th >> l, tw, true);
				}
				for (let i = l - 1; i >= 0; i--) {
					this.iwt2D(tY, tw >> i, th >> i, tw, true);
					this.iwt2D(tCo, tw >> i, th >> i, tw, true);
					this.iwt2D(tCg, tw >> i, th >> i, tw, true);
				}

				for (let y = 0; y < th; y++) {
					for (let x = 0; x < tw; x++) {
						const idx = (ty + y) * w + (tx + x),
							tidx = y * tw + x;
						planes[0][idx] = tY[tidx];
						planes[1][idx] = tCo[tidx];
						planes[2][idx] = tCg[tidx];
					}
				}
			}
		}
		return { w, h, planes };
	}
}

// --- UI Logic ---
let originalData: Uint8ClampedArray | null = null;
let lastBlob: Blob | null = null;

document.getElementById("upload")?.addEventListener("change", async (e) => {
	const file = (e.target as HTMLInputElement).files?.[0];
	if (!file) return;

	const img = await createImageBitmap(file);
	const w = img.width,
		h = img.height;
	const canvas = document.getElementById("canvas-orig") as HTMLCanvasElement;
	const ctx = canvas.getContext("2d")!;
	canvas.width = w;
	canvas.height = h;
	ctx.drawImage(img, 0, 0);
	originalData = ctx.getImageData(0, 0, w, h).data;

	const planes = [new Int32Array(w * h), new Int32Array(w * h), new Int32Array(w * h)];
	for (let i = 0; i < w * h; i++) {
		const [y, co, cg] = LFT.rgbToYCoCgR(originalData[i * 4], originalData[i * 4 + 1], originalData[i * 4 + 2]);
		planes[0][i] = y;
		planes[1][i] = co;
		planes[2][i] = cg;
	}

	const t0 = performance.now();
	lastBlob = await LFT.encode(w, h, planes);
	const t1 = performance.now();

	document.getElementById("stat-orig-size")!.innerText = `${(originalData.length / 1024).toFixed(1)} KB`;
	document.getElementById("stat-comp-size")!.innerText = `${(lastBlob.size / 1024).toFixed(1)} KB`;
	document.getElementById("stat-ratio")!.innerText = `${((lastBlob.size / originalData.length) * 100).toFixed(1)} %`;
	document.getElementById("status-log")!.innerText = `圧縮完了 (${(t1 - t0).toFixed(1)}ms)`;
	(document.getElementById("btn-download") as HTMLButtonElement).disabled = false;
});

document.getElementById("upload-lft")?.addEventListener("change", async (e) => {
	const file = (e.target as HTMLInputElement).files?.[0];
	if (!file) return;

	const t0 = performance.now();
	const { w, h, planes } = await LFT.decode(file);

	const out = new Uint8ClampedArray(w * h * 4);
	for (let i = 0; i < w * h; i++) {
		const [r, g, b] = LFT.yCoCgRToRgb(planes[0][i], planes[1][i], planes[2][i]);
		out[i * 4] = r;
		out[i * 4 + 1] = g;
		out[i * 4 + 2] = b;
		out[i * 4 + 3] = 255;
	}
	const t1 = performance.now();

	// --- 1ビットの誤りもないか検証 ---
	let diffs = 0;
	if (originalData && originalData.length === out.length) {
		for (let i = 0; i < out.length; i++) {
			if (originalData[i] !== out[i]) diffs++;
		}
	} else {
		diffs = -1; // サイズ不一致
	}

	const canvas = document.getElementById("canvas-recon") as HTMLCanvasElement;
	canvas.width = w;
	canvas.height = h;
	canvas.getContext("2d")!.putImageData(new ImageData(out, w, h), 0, 0);

	const log = document.getElementById("status-log")!;
	log.innerText = diffs === 0 ? `✅ 検証成功: 完全一致 (${(t1 - t0).toFixed(1)}ms)` : `❌ 検証失敗: ${diffs}件の差異`;
	log.style.color = diffs === 0 ? "green" : "red";
});

document.getElementById("btn-download")?.addEventListener("click", () => {
	if (!lastBlob) return;
	const a = document.createElement("a");
	a.href = URL.createObjectURL(lastBlob);
	a.download = "image.lft";
	a.click();
});
