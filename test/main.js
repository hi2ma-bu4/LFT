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
	originalData = ctx.getImageData(0, 0, w, h).data; // RGBA Uint8ClampedArray

	const t0 = performance.now();
	// LFT.encode expects w, h, and a Uint8Array (Uint8ClampedArray is also fine as they share the same memory structure)
	lastBlob = await LFT.encode(w, h, originalData);
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
	const { w, h, data } = await LFT.decode(file);
	const t1 = performance.now();

	let diffs = 0;
	if (originalData && originalData.length === data.length) {
		for (let i = 0; i < data.length; i++) {
			if (originalData[i] !== data[i]) diffs++;
		}
	} else {
		diffs = -1;
	}

	const canvas = document.getElementById("canvas-recon");
	canvas.width = w;
	canvas.height = h;
	// data is Uint8Array, ImageData expects Uint8ClampedArray
	const clampedData = new Uint8ClampedArray(data.buffer);
	canvas.getContext("2d").putImageData(new ImageData(clampedData, w, h), 0, 0);

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
