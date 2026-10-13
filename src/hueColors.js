const { default: colorNames } = require('color-name');

/** Parse the supported chat syntax into RGB bytes, without bridge I/O. */
function parseHueColor(input, random = Math.random) {
    if (typeof input !== 'string') return null;
    const name = input.trim().toLowerCase();
    if (name === 'random') {
        return { red: Math.floor(random() * 256), green: Math.floor(random() * 256), blue: Math.floor(random() * 256) };
    }
    if (/^#[0-9a-f]{6}$/.test(name)) {
        return {
            red: parseInt(name.slice(1, 3), 16),
            green: parseInt(name.slice(3, 5), 16),
            blue: parseInt(name.slice(5, 7), 16)
        };
    }
    if (!Object.hasOwn(colorNames, name)) return null;
    const [red, green, blue] = colorNames[name];
    return { red, green, blue };
}

/** GroupLightState accepts Hue's hue units and percentage saturation/brightness. */
function rgbToHue({ red, green, blue }) {
    const max = Math.max(red, green, blue);
    const min = Math.min(red, green, blue);
    const delta = max - min;
    let degrees = 0;
    if (delta) {
        if (max === red) degrees = 60 * (((green - blue) / delta) % 6);
        else if (max === green) degrees = 60 * ((blue - red) / delta + 2);
        else degrees = 60 * ((red - green) / delta + 4);
    }
    if (degrees < 0) degrees += 360;
    return {
        hue: Math.round(degrees / 360 * 65535),
        saturation: max ? Math.round(delta / max * 100) : 0,
        brightness: Math.round(max / 255 * 100)
    };
}

module.exports = { parseHueColor, rgbToHue };
