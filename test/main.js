// --- UI Logic ---
let originalData = null;
let lastBlob = null;

document.getElementById("upload")?.addEventListener("change", async (e) => {
	const file = e.target.files?.[0];
	if (!file) return;

	// 元ファイルのサイズを表示
	document.getElementById("stat-file-size").innerText = `${(file.size / 1024).toFixed(1)} KB`;

	const img = await createImageBitmap(file);
	const w = img.width,
		h = img.height;
	const canvas = document.getElementById("canvas-orig");
	const ctx = canvas.getContext("2d");
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

	document.getElementById("stat-orig-size").innerText = `${(originalData.length / 1024).toFixed(1)} KB`;
	document.getElementById("stat-comp-size").innerText = `${(lastBlob.size / 1024).toFixed(1)} KB`;
	document.getElementById("stat-ratio").innerText = `${((lastBlob.size / originalData.length) * 100).toFixed(1)} %`;
	document.getElementById("status-log").innerText = `圧縮完了 (${(t1 - t0).toFixed(1)}ms)`;
	document.getElementById("btn-download").disabled = false;
});

document.getElementById("upload-lft")?.addEventListener("change", async (e) => {
	const file = e.target.files?.[0];
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

	let diffs = 0;
	if (originalData && originalData.length === out.length) {
		for (let i = 0; i < out.length; i++) {
			if (originalData[i] !== out[i]) diffs++;
		}
	} else {
		diffs = -1;
	}

	const canvas = document.getElementById("canvas-recon");
	canvas.width = w;
	canvas.height = h;
	canvas.getContext("2d").putImageData(new ImageData(out, w, h), 0, 0);

	const log = document.getElementById("status-log");
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
