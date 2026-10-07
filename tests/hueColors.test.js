const { parseHueColor, rgbToHue } = require('../src/hueColors.js');

describe('Hue chat colors', () => {
    test.each([
        ['lightblue', { red: 173, green: 216, blue: 230 }],
        ['  LIGHTBLUE  ', { red: 173, green: 216, blue: 230 }],
        ['#112233', { red: 17, green: 34, blue: 51 }],
        ['#AaBBcc', { red: 170, green: 187, blue: 204 }],
        ['rebeccapurple', { red: 102, green: 51, blue: 153 }],
        ['gray', { red: 128, green: 128, blue: 128 }],
        ['grey', { red: 128, green: 128, blue: 128 }],
        ['black', { red: 0, green: 0, blue: 0 }],
        ['white', { red: 255, green: 255, blue: 255 }]
    ])('parses %s into its RGB values', (input, expected) => {
        expect(parseHueColor(input)).toEqual(expected);
    });

    test.each([undefined, null, 123, '', ' ', 'party', 'unknown', '#abc', '#11223344',
        '#gg2233', '112233', 'red blue', 'red\nblue', 'transparent', 'currentcolor',
        'constructor', '__proto__', 'toString'])('rejects unsupported color %s', input => {
        expect(parseHueColor(input)).toBeNull();
    });

    test('generates random RGB values without exceeding the byte range', () => {
        const random = jest.fn().mockReturnValueOnce(0).mockReturnValueOnce(0.5).mockReturnValueOnce(0.999999);
        expect(parseHueColor('random', random)).toEqual({ red: 0, green: 128, blue: 255 });
    });

    test.each([
        [{ red: 255, green: 0, blue: 0 }, { hue: 0, saturation: 100, brightness: 100 }],
        [{ red: 0, green: 255, blue: 0 }, { hue: 21845, saturation: 100, brightness: 100 }],
        [{ red: 0, green: 0, blue: 255 }, { hue: 43690, saturation: 100, brightness: 100 }],
        [{ red: 255, green: 255, blue: 255 }, { hue: 0, saturation: 0, brightness: 100 }],
        [{ red: 0, green: 0, blue: 0 }, { hue: 0, saturation: 0, brightness: 0 }],
        [{ red: 128, green: 128, blue: 128 }, { hue: 0, saturation: 0, brightness: 50 }],
        [{ red: 255, green: 0, blue: 255 }, { hue: 54613, saturation: 100, brightness: 100 }],
        [{ red: 0, green: 255, blue: 255 }, { hue: 32768, saturation: 100, brightness: 100 }]
    ])('converts %j into Hue HSV units', (color, expected) => {
        expect(rgbToHue(color)).toEqual(expected);
    });
});
