const fs = require('node:fs');
const path = require('node:path');
const { crc32, inflateSync } = require('node:zlib');
const { zipSync } = require('fflate');
const { PNG } = require('pngjs');

const SCRIPT_NAME = 'sa_helper_bridge';
const DEFAULT_INTEGRATION_DIR = path.resolve(__dirname, '../../integrations/stream-avatars');
const ZIP_DATE = new Date(2000, 0, 1);
const MAX_FILE_BYTES = 32 * 1024 * 1024;
const MAX_PACKAGE_BYTES = 128 * 1024 * 1024;
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

function readFile(filename, limit = MAX_FILE_BYTES) {
    const stat = fs.lstatSync(filename);
    if (!stat.isFile()) throw new Error(`${path.basename(filename)} must be a regular file`);
    if (stat.size > limit) throw new Error(`${path.basename(filename)} exceeds the file size limit`);
    return fs.readFileSync(filename);
}

function readJson(filename) {
    const contents = readFile(filename, 64 * 1024);
    try { return JSON.parse(contents.toString('utf8')); }
    catch { throw new Error(`${path.basename(filename)} contains invalid JSON`); }
}

function validateManifest(manifest, filename) {
    const invalid = field => { throw new Error(`${filename}: invalid ${field}`); };
    if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) invalid('manifest');
    if (typeof manifest.name !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(manifest.name) || WINDOWS_RESERVED.test(manifest.name)) invalid('name');
    if (typeof manifest.file !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]*\.png$/i.test(manifest.file) || WINDOWS_RESERVED.test(manifest.file.slice(0, -4).split('.')[0])) invalid('file');
    for (const field of ['frameWidth', 'frameHeight', 'frames', 'rows']) {
        if (!Number.isInteger(manifest[field]) || manifest[field] < 1 || manifest[field] > 4096) invalid(field);
    }
    if (manifest.frames % manifest.rows !== 0) invalid('rows');
    if (typeof manifest.framesPerSecond !== 'number' || !Number.isFinite(manifest.framesPerSecond) || manifest.framesPerSecond <= 0 || manifest.framesPerSecond > 240) invalid('framesPerSecond');
    for (const field of ['loop', 'transparent']) if (typeof manifest[field] !== 'boolean') invalid(field);
}

function pngDimensions(bytes, filename) {
    const invalid = () => { throw new Error(`${filename}: invalid PNG`); };
    if (bytes.length < 33 || !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) || bytes.readUInt32BE(8) !== 13 || bytes.toString('ascii', 12, 16) !== 'IHDR') invalid();
    let offset = 8, hasEnd = false;
    const imageData = [];
    while (offset + 12 <= bytes.length) {
        const length = bytes.readUInt32BE(offset), end = offset + length + 12;
        if (end > bytes.length) invalid();
        if (crc32(bytes.subarray(offset + 4, end - 4)) !== bytes.readUInt32BE(end - 4)) invalid();
        const type = bytes.toString('ascii', offset + 4, offset + 8);
        if (type === 'IHDR' && offset !== 8) invalid();
        if (type === 'IDAT') imageData.push(bytes.subarray(offset + 8, end - 4));
        offset = end;
        if (type === 'IEND') {
            if (length !== 0 || offset !== bytes.length) invalid();
            hasEnd = true;
            break;
        }
    }
    const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
    if (!imageData.length || !hasEnd || width < 1 || height < 1 || width * height > 16 * 1024 * 1024) invalid();
    const depths = { 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] };
    if (!depths[bytes[25]]?.includes(bytes[24])) invalid();
    // Bound allocation before decoding, then verify format, compression and scanlines.
    try {
        // pngjs' legacy synchronous inflater can miss zlib errors on newer Node.
        // Validate through the public Node API and bound interlaced inflation too.
        inflateSync(Buffer.concat(imageData), { maxOutputLength: width * height * 8 + height * 2 + 14 });
        PNG.sync.read(bytes, { checkCRC: true });
    }
    catch { invalid(); }
    return { width, height };
}

function animationSettings(manifest) {
    return {
        imageName: `${manifest.name}.png`, width: manifest.frameWidth, height: manifest.frameHeight,
        originX: 0.5, originY: 0.5, scale: 1, spriteColor: { r: 1, g: 1, b: 1, a: 1 },
        details: {
            fps: manifest.framesPerSecond, fpsPerFrame: Array(manifest.frames).fill(manifest.framesPerSecond),
            // Stream Avatars' infinity button saves 61; values >= 60 loop indefinitely.
            loopTotal: manifest.loop ? 61 : 1, actionFrame: -1, usesColor: true
        }
    };
}

function buildPackage({ integrationDir = DEFAULT_INTEGRATION_DIR } = {}) {
    const assetsDir = path.join(integrationDir, 'assets');
    if (!fs.lstatSync(assetsDir).isDirectory()) throw new Error('assets must be a regular directory');
    const manifests = fs.readdirSync(assetsDir).filter(name => name.toLowerCase().endsWith('.json')).sort();
    if (!manifests.length) throw new Error('The image catalog needs at least one manifest');
    const entries = Object.create(null), scriptImages = Object.create(null), names = new Set();
    let totalBytes = 0;
    const add = (name, contents) => {
        totalBytes += contents.length;
        if (totalBytes > MAX_PACKAGE_BYTES) throw new Error('Package exceeds the 128 MiB size limit');
        entries[name] = [contents, { mtime: ZIP_DATE }];
    };
    const scriptPath = `scripts/${SCRIPT_NAME}/`;
    const source = readFile(path.join(integrationDir, 'companion.lua'), 1024 * 1024).toString('utf8');
    add(`${scriptPath}${SCRIPT_NAME}_settings.json`, Buffer.from(JSON.stringify({
        address: 'BOT_LAN_IP', token: 'REPLACE_WITH_PRIVATE_TOKEN'
    }, null, 2) + '\n'));
    for (const filename of manifests) {
        const manifest = readJson(path.join(assetsDir, filename));
        validateManifest(manifest, filename);
        const key = manifest.name.toLowerCase();
        if (names.has(key)) throw new Error(`${filename}: duplicate image name ${manifest.name}`);
        names.add(key);
        const image = readFile(path.join(assetsDir, manifest.file));
        const dimensions = pngDimensions(image, manifest.file);
        if (dimensions.width !== manifest.frameWidth * manifest.frames / manifest.rows || dimensions.height !== manifest.frameHeight * manifest.rows) throw new Error(`${filename}: PNG dimensions do not match frame geometry`);
        scriptImages[manifest.name] = animationSettings(manifest);
        add(`${scriptPath}${manifest.name}.png`, image);
    }
    if (!Object.hasOwn(scriptImages, 'sa_heart')) throw new Error('The companion requires an image named sa_heart');
    const marker = 'local HEART_WIDTH, HEART_HEIGHT = 32, 32';
    if (!source.includes(marker)) throw new Error('Companion image-dimension marker is missing');
    const heart = scriptImages.sa_heart;
    add(`${scriptPath}${SCRIPT_NAME}.lua`, Buffer.from(source.replace(marker, `local HEART_WIDTH, HEART_HEIGHT = ${heart.width}, ${heart.height}`)));

    const command = {
        name: SCRIPT_NAME, scriptName: SCRIPT_NAME, enabled: true, showInEditor: true,
        restriction: { type: '' }, restrictionType: 0, advancedSettings: true, runMode: 1,
        aliases: [], runCommands: [], messages: [], scriptImages
    };
    // data.txt and scripts/<command>/ match Stream Avatars' private-content export.
    add('data.txt', Buffer.from(JSON.stringify({
        avatar: {}, gear: {}, backgrounds: {}, backgroundObj: {}, boss: {}, playerClass: {}, nametags: {},
        commands: { [SCRIPT_NAME]: command }, languages: {}
    }, null, 2) + '\n'));
    return { archive: zipSync(entries, { level: 6 }), imageCount: manifests.length };
}

module.exports = { buildPackage };
