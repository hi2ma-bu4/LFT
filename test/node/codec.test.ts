import fs from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";
import { LFT } from "../../src/index";

const IMG_DIR = path.resolve("test/node/img");

describe("LFT Codec Verification", () => {
	const images = fs.readdirSync(IMG_DIR).filter((file) => file.endsWith(".png"));

	images.forEach((imageFile) => {
		it(`should compress and decompress ${imageFile} losslessly`, async () => {
			const filePath = path.join(IMG_DIR, imageFile);
			const buffer = fs.readFileSync(filePath);
			const png = PNG.sync.read(buffer);

			const { width, height, data } = png;

			// Encode
			const blob = await LFT.encode(width, height, data);
			const compressedBuffer = Buffer.from(await blob.arrayBuffer());
			const compressedSize = compressedBuffer.length;
			const originalRawSize = width * height * 4; // RGBA
			const compressionRatio = (compressedSize / originalRawSize) * 100;

			console.log(`${imageFile}:`);
			console.log(`  Original RAW size (RGBA): ${originalRawSize} bytes`);
			console.log(`  Compressed size:          ${compressedSize} bytes`);
			console.log(`  Compression ratio:        ${compressionRatio.toFixed(2)}%`);

			// Decode
			const decoded = await LFT.decode(blob);
			expect(decoded.w).toBe(width);
			expect(decoded.h).toBe(height);
			expect(decoded.data.length).toBe(data.length);

			// Verify bit-perfect reconstruction
			for (let i = 0; i < data.length; i++) {
				if (decoded.data[i] !== data[i]) {
					throw new Error(`Mismatch at index ${i}: expected ${data[i]}, got ${decoded.data[i]}`);
				}
			}
			// Faster check
			expect(Buffer.from(decoded.data).equals(data)).toBe(true);
		}, 600000); // 10 minutes timeout
	});
});
