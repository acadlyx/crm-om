export type AllowedImage = { extension: "png" | "jpg" | "webp" | "ico"; mime: string };

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  return signature.every((value, index) => bytes[index] === value);
}

export function detectAllowedImage(bytes: Uint8Array, kind: "logo" | "favicon"): AllowedImage | null {
  const pngHeaderIsPlausible = bytes.length >= 33 && startsWith(bytes, PNG) &&
    bytes[8] === 0 && bytes[9] === 0 && bytes[10] === 0 && bytes[11] === 13 &&
    bytes[12] === 0x49 && bytes[13] === 0x48 && bytes[14] === 0x44 && bytes[15] === 0x52;
  if (pngHeaderIsPlausible) {
    const width = ((bytes[16] << 24) | (bytes[17] << 16) | (bytes[18] << 8) | bytes[19]) >>> 0;
    const height = ((bytes[20] << 24) | (bytes[21] << 16) | (bytes[22] << 8) | bytes[23]) >>> 0;
    if (width > 0 && height > 0 && width <= 10000 && height <= 10000) return { extension: "png", mime: "image/png" };
  }
  if (kind === "logo" && bytes.length >= 4 && startsWith(bytes, [0xff, 0xd8, 0xff]) &&
      bytes[bytes.length - 2] === 0xff && bytes[bytes.length - 1] === 0xd9) {
    return { extension: "jpg", mime: "image/jpeg" };
  }
  if (bytes.length >= 30 && startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
      bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
    const riffSize = (bytes[4] | (bytes[5] << 8) | (bytes[6] << 16) | (bytes[7] << 24)) >>> 0;
    if (riffSize === bytes.length - 8 && riffSize >= 22) return { extension: "webp", mime: "image/webp" };
  }
  if (kind === "favicon" && bytes.length >= 22 && startsWith(bytes, [0x00, 0x00, 0x01, 0x00])) {
    const imageCount = bytes[4] | (bytes[5] << 8);
    const imageBytes = (bytes[14] | (bytes[15] << 8) | (bytes[16] << 16) | (bytes[17] << 24)) >>> 0;
    const imageOffset = (bytes[18] | (bytes[19] << 8) | (bytes[20] << 16) | (bytes[21] << 24)) >>> 0;
    if (imageCount > 0 && imageBytes > 0 && imageOffset >= 22 && imageOffset + imageBytes <= bytes.length) return { extension: "ico", mime: "image/x-icon" };
  }
  return null; // SVG and unknown formats are intentionally rejected.
}

export function validateBrandingImage(file: Pick<File, "size" | "type" | "name">, bytes: Uint8Array, kind: "logo" | "favicon") {
  const maxBytes = kind === "logo" ? 2 * 1024 * 1024 : 512 * 1024;
  if (file.size < 1 || file.size > maxBytes || bytes.length !== file.size) {
    return { ok: false as const, error: "File must be at most " + (kind === "logo" ? "2 MiB" : "512 KiB") + "." };
  }
  const detected = detectAllowedImage(bytes, kind);
  if (!detected) return { ok: false as const, error: "Unsupported image content. Use PNG or WebP; logos may also use JPEG and favicons may use ICO." };
  if (file.type && file.type !== detected.mime && !(detected.extension === "ico" && file.type === "image/vnd.microsoft.icon")) {
    return { ok: false as const, error: "The file extension, content, and MIME type do not match." };
  }
  const expected = detected.extension === "jpg" ? ["jpg", "jpeg"] : [detected.extension];
  const actual = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!expected.includes(actual)) return { ok: false as const, error: "The file extension does not match its actual image format." };
  return { ok: true as const, image: detected };
}
