const { PNG } = require('pngjs');
function decode(bytes) {
    if (bytes.length > 32 * 1024 * 1024 || bytes.length < 33) throw new Error('PNG file size invalid');
    let offset = 8;
    while (offset + 12 <= bytes.length) {
        const length = bytes.readUInt32BE(offset);
        if (offset + length + 12 > bytes.length) throw new Error('Malformed PNG chunk');
        const kind = bytes.toString('ascii', offset + 4, offset + 8);
        if (['acTL', 'fcTL', 'fdAT'].includes(kind)) throw new Error('PNG animation is unsupported; single static frame required');
        offset += length + 12;
        if (kind === 'IEND') break;
    }
    const width = bytes.readUInt32BE(16);
    const height = bytes.readUInt32BE(20);
    if (width * height > 16 * 1024 * 1024 || !width || !height) throw new Error('PNG dimensions exceed decoder limit');
    return PNG.sync.read(bytes, { checkCRC: true });
}
function bounds(png, threshold = 1) {
    let left = png.width;
    let top = png.height;
    let right = -1;
    let bottom = -1;
    let transparent = 0;
    let partial = 0;
    let maxAlpha = 0;
    for (let y = 0; y < png.height; y++) {
        for (let x = 0; x < png.width; x++) {
            const alpha = png.data[(y * png.width + x) * 4 + 3];
            maxAlpha = Math.max(alpha, maxAlpha);
            if (alpha === 0) transparent++;
            else if (alpha < 255) partial++;
            if (alpha < threshold) continue;
            left = Math.min(left, x); top = Math.min(top, y);
            right = Math.max(right, x); bottom = Math.max(bottom, y);
        }
    }
    return { x: left, y: top, width: right < 0 ? 0 : right - left + 1, height: bottom < 0 ? 0 : bottom - top + 1, transparent, partial, maxAlpha };
}
function fit(bytes, brief, alphaThreshold = 1) {
    const source = decode(bytes);
    if (!Number.isInteger(alphaThreshold) || alphaThreshold < 1 || alphaThreshold > 255) throw new Error('Invalid alpha threshold');
    const crop = bounds(source, alphaThreshold);
    const clippingBounds = crop;
    let discardedNonzeroPixels = 0;
    for (let sy = 0; sy < source.height; sy++) {
        for (let sx = 0; sx < source.width; sx++) {
            if ((sx < crop.x || sx >= crop.x + crop.width || sy < crop.y || sy >= crop.y + crop.height) && source.data[(sy * source.width + sx) * 4 + 3]) discardedNonzeroPixels++;
        }
    }
    if (!crop.width || !crop.height || !crop.transparent) throw new Error('Source must contain visible art and true transparent alpha');
    if (!clippingBounds.width || clippingBounds.x === 0 || clippingBounds.y === 0 || clippingBounds.x + clippingBounds.width === source.width || clippingBounds.y + clippingBounds.height === source.height) throw new Error('Source art touches border; review clipping before fit');
    const { width, height, padding } = brief.frame;
    const tile = brief.kind === 'backdrop' && brief.tileAxis === 'x';
    const scale = tile ? width / crop.width : Math.min((width - 2 * padding) / crop.width, (height - 2 * padding) / crop.height, brief.visibleHeightLimit / crop.height);
    const fittedWidth = tile ? width : Math.max(1, Math.floor(crop.width * scale));
    const fittedHeight = Math.max(1, Math.floor(crop.height * scale));
    if (tile && (fittedHeight > brief.visibleHeightLimit || fittedHeight > height - 4)) throw new Error('Backdrop must be wider/shallow enough for full-width uniform fit within height limit');
    const x = Math.floor((width - fittedWidth) / 2);
    const y = height - padding - fittedHeight;
    const output = new PNG({ width, height });
    for (let dy = 0; dy < fittedHeight; dy++) {
        for (let dx = 0; dx < fittedWidth; dx++) {
            const sx = crop.x + Math.floor(dx * crop.width / fittedWidth);
            const sy = crop.y + Math.floor(dy * crop.height / fittedHeight);
            source.data.copy(output.data, ((y + dy) * width + x + dx) * 4, (sy * source.width + sx) * 4, (sy * source.width + sx) * 4 + 4);
        }
    }
    return { bytes: PNG.sync.write(output, { colorType: 6 }), recipe: { method: tile ? 'nearest-neighbor-tile-fit' : 'nearest-neighbor-fit', decoder: 'pngjs@7.0.0', crop, clippingBounds, cropAlphaThreshold: alphaThreshold, discardedNonzeroPixels, scale, fittedWidth, fittedHeight, x, y, canvas: { width, height }, alphaPreserved: true } };
}
function inspect(bytes, brief) {
    const png = decode(bytes);
    const visibleBounds = bounds(png);
    const errors = [];
    const { width, height, padding } = brief.frame;
    if (png.width !== width || png.height !== height) errors.push('PNG dimensions differ from logical canvas');
    if (bytes[25] !== 6) errors.push('PNG must use RGBA alpha color type');
    if (!visibleBounds.transparent) errors.push('No transparent alpha; opaque rectangular backdrop');
    if (!visibleBounds.width) errors.push('No visible art');
    if (visibleBounds.x < padding || visibleBounds.y < padding || visibleBounds.x + visibleBounds.width > png.width - padding || visibleBounds.y + visibleBounds.height > png.height - padding) errors.push('Transparent border padding failed; potential clipping');
    if (visibleBounds.height > brief.visibleHeightLimit) errors.push('Visible bounds exceed stream height limit');
    const warnings = [];
    let tileSeam = null;
    if (brief.kind === 'backdrop' && brief.tileAxis === 'x') {
        let topClear = true;
        for (let y = 0; y < Math.min(4, png.height); y++) for (let x = 0; x < png.width; x++) if (png.data[(y * png.width + x) * 4 + 3]) topClear = false;
        if (!topClear) errors.push('Backdrop top four rows must be transparent');
        const continuousBase = Array.from({ length: png.width }, (_, x) => png.data[((png.height - 1) * png.width + x) * 4 + 3]).every(a => a >= 128);
        if (!continuousBase) errors.push('Backdrop base must span the entire bottom row');
        let differingRows = 0;
        let maxChannelDelta = 0;
        for (let y = 0; y < png.height; y++) {
            const left = (y * png.width) * 4;
            const right = (y * png.width + png.width - 1) * 4;
            const a = png.data[left + 3]; const b = png.data[right + 3];
            const deltas = [Math.abs(a - b), ...[0, 1, 2].map(c => Math.abs(Math.round(png.data[left + c] * a / 255) - Math.round(png.data[right + c] * b / 255)))];
            const delta = Math.max(...deltas);
            if (delta) differingRows++;
            maxChannelDelta = Math.max(maxChannelDelta, delta);
        }
        tileSeam = { differingRows, maxChannelDelta, continuousBase };
        if (differingRows) warnings.push(`Horizontal tile seam differs in ${differingRows} rows (max channel delta ${maxChannelDelta}); inspect literal repeat preview`);
    }
    if (visibleBounds.partial) warnings.push(`Contains partial alpha (${visibleBounds.partial} pixels); inspect antialiasing/haze manually`);
    if (visibleBounds.maxAlpha < 255) warnings.push('No fully opaque pixels; inspect faded/hazy art manually');
    return { errors, warnings, tileSeam, alpha: { transparentPixels: visibleBounds.transparent, partialPixels: visibleBounds.partial, maxAlpha: visibleBounds.maxAlpha }, visibleBounds, frame: { width: png.width, height: png.height, frameCount: 1, fps: 0 } };
}
module.exports = { decode, bounds, fit, inspect };
