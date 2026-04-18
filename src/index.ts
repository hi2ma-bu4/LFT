class LFT {
	private static readonly MAGIC = new Uint8Array([76, 70, 84, 33]); // "LFT!"
	private static readonly TILE_SIZE = 64; // タイリングのサイズ

	// --- [1] 色空間・予測ロジック ---
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

	// --- [2] 改善: Byte-Shuffling (転置) ---
	// 32bit整数の配列をバイト毎に分解し、上位バイトを固めることでGzipの効率を最大化する
	private static shuffle(data: Int32Array): Uint8Array {
		const out = new Uint8Array(data.length * 4);
		const n = data.length;
		for (let i = 0; i < n; i++) {
			const v = (data[i] << 1) ^ (data[i] >> 31); // ZigZag内包
			out[i] = v & 0xff; // LSB
			out[i + n] = (v >> 8) & 0xff;
			out[i + 2 * n] = (v >> 16) & 0xff;
			out[i + 3 * n] = (v >> 24) & 0xff; // MSB (ここが0の連続になりやすい)
		}
		return out;
	}

	private static unshuffle(bytes: Uint8Array): Int32Array {
		const n = bytes.length / 4;
		const out = new Int32Array(n);
		for (let i = 0; i < n; i++) {
			const v = bytes[i] | (bytes[i + n] << 8) | (bytes[i + 2 * n] << 16) | (bytes[i + 3 * n] << 24);
			out[i] = (v >>> 1) ^ -(v & 1); // ZigZag復元
		}
		return out;
	}

	// --- [3] IWT 変換 (タイル単位で動作) ---
	public static processIWT(ch: Int32Array, w: number, h: number, levels: number, decode = false) {
		const s = w;
		if (!decode) {
			for (let i = 0; i < levels; i++) this.iwt2D(ch, w >> i, h >> i, s, false);
			this.applyPaeth(ch, w >> levels, h >> levels, s, false);
		} else {
			this.applyPaeth(ch, w >> levels, h >> levels, s, true);
			for (let i = levels - 1; i >= 0; i--) this.iwt2D(ch, w >> i, h >> i, s, true);
		}
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

	private static iwt2D(ch: Int32Array, w: number, h: number, s: number, decode: boolean) {
		const hw = w >> 1,
			hh = h >> 1;
		if (!decode) {
			const tmp = new Int32Array(w * h);
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
			const tmp = new Int32Array(w * h);
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

	// --- [4] タイリングと最適化 ---
	public static async encode(w: number, h: number, planes: Int32Array[]): Promise<Blob> {
		const cols = Math.ceil(w / this.TILE_SIZE);
		const rows = Math.ceil(h / this.TILE_SIZE);
		const tileMetas = new Uint8Array(cols * rows); // 各タイルのレベルを記録

		// タイルごとに処理
		for (let r = 0; r < rows; r++) {
			for (let c = 0; c < cols; c++) {
				const tx = c * this.TILE_SIZE,
					ty = r * this.TILE_SIZE;
				const tw = Math.min(this.TILE_SIZE, w - tx),
					th = Math.min(this.TILE_SIZE, h - ty);

				// 簡易エントロピー判定で最適なレベル(0-4)を選択
				let bestL = 0,
					minE = Infinity;
				for (let l = 0; l <= 3; l++) {
					if (tw >> l < 2 || th >> l < 2) break;
					const score = planes.reduce((acc, p) => acc + this.testTile(p, tx, ty, tw, th, w, l), 0);
					if (score < minE) {
						minE = score;
						bestL = l;
					}
				}
				tileMetas[r * cols + c] = bestL;
				planes.forEach((p) => this.processTile(p, tx, ty, tw, th, w, bestL, false));
			}
		}

		// シリアライズ (Header + TileLevels + ShuffledData)
		const header = new DataView(new ArrayBuffer(12));
		this.MAGIC.forEach((b, i) => header.setUint8(i, b));
		header.setUint32(4, w);
		header.setUint32(8, h);

		const shuffled = this.shuffle(this.flatten(planes)) as Uint8Array<ArrayBuffer>;
		const payload = new Blob([header, tileMetas, shuffled]);

		const stream = payload.stream().pipeThrough(new CompressionStream("gzip"));
		return new Response(stream).blob();
	}

	public static async decode(blob: Blob): Promise<{ w: number; h: number; planes: Int32Array[] }> {
		const stream = blob.stream().pipeThrough(new DecompressionStream("gzip"));
		const buf = await new Response(stream).arrayBuffer();
		const view = new DataView(buf);

		const w = view.getUint32(4),
			h = view.getUint32(8);
		const cols = Math.ceil(w / this.TILE_SIZE),
			rows = Math.ceil(h / this.TILE_SIZE);
		const tileMetas = new Uint8Array(buf, 12, cols * rows);
		const rawData = new Uint8Array(buf, 12 + cols * rows);

		const combined = this.unshuffle(rawData);
		const size = w * h;
		const planes = [combined.slice(0, size), combined.slice(size, size * 2), combined.slice(size * 2, size * 3)];

		for (let r = 0; r < rows; r++) {
			for (let c = 0; c < cols; c++) {
				const tx = c * this.TILE_SIZE,
					ty = r * this.TILE_SIZE;
				const tw = Math.min(this.TILE_SIZE, w - tx),
					th = Math.min(this.TILE_SIZE, h - ty);
				const l = tileMetas[r * cols + c];
				planes.forEach((p) => this.processTile(p, tx, ty, tw, th, w, l, true));
			}
		}
		return { w, h, planes };
	}

	private static processTile(p: Int32Array, tx: number, ty: number, tw: number, th: number, stride: number, l: number, decode: boolean) {
		const tile = new Int32Array(tw * th);
		for (let y = 0; y < th; y++) {
			for (let x = 0; x < tw; x++) tile[y * tw + x] = p[(ty + y) * stride + (tx + x)];
		}
		this.processIWT(tile, tw, th, l, decode);
		for (let y = 0; y < th; y++) {
			for (let x = 0; x < tw; x++) p[(ty + y) * stride + (tx + x)] = tile[y * tw + x];
		}
	}

	private static testTile(p: Int32Array, tx: number, ty: number, tw: number, th: number, stride: number, l: number): number {
		const tile = new Int32Array(tw * th);
		for (let y = 0; y < th; y++) {
			for (let x = 0; x < tw; x++) tile[y * tw + x] = p[(ty + y) * stride + (tx + x)];
		}
		this.processIWT(tile, tw, th, l, false);
		let e = 0;
		for (let v of tile) e += Math.abs(v); // L1ノルムで代用（高速）
		return e;
	}

	private static flatten(planes: Int32Array[]): Int32Array {
		const out = new Int32Array(planes[0].length * 3);
		out.set(planes[0], 0);
		out.set(planes[1], planes[0].length);
		out.set(planes[2], planes[0].length * 2);
		return out;
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
