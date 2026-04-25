import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";

import { PNG } from "pngjs";
import { LFT } from "../src/index.ts";

const IMG_DIR = path.resolve("test/node/img");

function formatMiB(bytes) {
	return Number((bytes / (1024 * 1024)).toFixed(2));
}

function sampleMemory() {
	const { heapUsed, heapTotal, rss, external, arrayBuffers } = process.memoryUsage();
	return {
		heapUsed,
		heapTotal,
		rss,
		external,
		arrayBuffers,
	};
}

function bumpPeak(peak, sample) {
	peak.heapUsed = Math.max(peak.heapUsed, sample.heapUsed);
	peak.heapTotal = Math.max(peak.heapTotal, sample.heapTotal);
	peak.rss = Math.max(peak.rss, sample.rss);
	peak.external = Math.max(peak.external, sample.external);
	peak.arrayBuffers = Math.max(peak.arrayBuffers, sample.arrayBuffers);
}

if (global.gc !== undefined) {
	global.gc();
}

const images = fs
	.readdirSync(IMG_DIR)
	.filter((file) => file.endsWith(".png"))
	.sort((a, b) => a.localeCompare(b));

const totals = {
	encodeMs: 0,
	decodeMs: 0,
	compressedBytes: 0,
	rawBytes: 0,
};

const peak = sampleMemory();
const perImage = [];

for (const imageFile of images) {
	if (global.gc !== undefined) {
		global.gc();
	}

	const inputBuffer = fs.readFileSync(path.join(IMG_DIR, imageFile));
	const png = PNG.sync.read(inputBuffer);
	const { width, height, data } = png;

	bumpPeak(peak, sampleMemory());

	const encodeStart = performance.now();
	const blob = await LFT.encode(width, height, data);
	const encodeMs = performance.now() - encodeStart;

	bumpPeak(peak, sampleMemory());

	const decodeStart = performance.now();
	const decoded = await LFT.decode(blob);
	const decodeMs = performance.now() - decodeStart;

	bumpPeak(peak, sampleMemory());

	const size = blob.size;
	const rawBytes = width * height * 4;

	totals.encodeMs += encodeMs;
	totals.decodeMs += decodeMs;
	totals.compressedBytes += size;
	totals.rawBytes += rawBytes;

	perImage.push({
		imageFile,
		width,
		height,
		rawBytes,
		compressedBytes: size,
		ratioPct: Number(((size / rawBytes) * 100).toFixed(3)),
		encodeMs: Number(encodeMs.toFixed(3)),
		decodeMs: Number(decodeMs.toFixed(3)),
		match: Buffer.from(decoded.data.buffer, decoded.data.byteOffset, decoded.data.byteLength).equals(data),
	});
}

const finalMemory = sampleMemory();
bumpPeak(peak, finalMemory);

console.log(
	JSON.stringify(
		{
			images: perImage.length,
			totals: {
				rawBytes: totals.rawBytes,
				compressedBytes: totals.compressedBytes,
				ratioPct: Number(((totals.compressedBytes / totals.rawBytes) * 100).toFixed(3)),
				encodeMs: Number(totals.encodeMs.toFixed(3)),
				decodeMs: Number(totals.decodeMs.toFixed(3)),
				totalMs: Number((totals.encodeMs + totals.decodeMs).toFixed(3)),
			},
			memoryMiB: {
				peak: {
					heapUsed: formatMiB(peak.heapUsed),
					heapTotal: formatMiB(peak.heapTotal),
					rss: formatMiB(peak.rss),
					external: formatMiB(peak.external),
					arrayBuffers: formatMiB(peak.arrayBuffers),
				},
				final: {
					heapUsed: formatMiB(finalMemory.heapUsed),
					heapTotal: formatMiB(finalMemory.heapTotal),
					rss: formatMiB(finalMemory.rss),
					external: formatMiB(finalMemory.external),
					arrayBuffers: formatMiB(finalMemory.arrayBuffers),
				},
			},
			perImage,
		},
		null,
		2
	)
);
