const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { runAnalysis } = require('../../src/analysis/run.js');

describe('analyzer integration', () => {
    let directory;

    beforeEach(() => {
        directory = fs.mkdtempSync(path.join(os.tmpdir(), 'log-analyzer-'));
    });

    afterEach(() => {
        fs.rmSync(directory, { recursive: true, force: true });
    });

    test('writes deterministic JSON and HTML artifacts', () => {
        const inputPath = path.join(directory, 'sample.log');
        const outputDir = path.join(directory, 'reports');
        fs.writeFileSync(inputPath, [
            '2025-11-01T10:00:00.000Z [twitch] INFO: Stream viewer count {"channel":"example","viewerCount":10,"game":"PEAK","title":"Marathon","startedAt":"2025-11-01T10:00:00Z"}',
            '2025-11-01T10:05:00.000Z [twitch] INFO: Stream viewer count {"channel":"example","viewerCount":12,"game":"PEAK","title":"Marathon","startedAt":"2025-11-01T10:00:00Z"}'
        ].join('\n'));

        const options = { inputPath, outputDir, timezone: 'America/Los_Angeles', botUsers: [], start: null, end: null };
        const first = runAnalysis(options);
        const json = fs.readFileSync(first.jsonPath, 'utf8');
        const html = fs.readFileSync(first.htmlPath, 'utf8');
        const second = runAnalysis(options);

        expect(path.basename(first.jsonPath)).toBe('sample.json');
        expect(path.basename(first.htmlPath)).toBe('sample.html');
        expect(fs.readFileSync(second.jsonPath, 'utf8')).toBe(json);
        expect(fs.readFileSync(second.htmlPath, 'utf8')).toBe(html);
        expect(JSON.parse(json)).toMatchObject({
            schemaVersion: 1,
            source: { name: 'sample.log', lineCount: 2 },
            metrics: { overview: { viewerSamples: 2, peakViewers: 12 } }
        });
    });

    test('CLI returns nonzero for unreadable input', () => {
        const script = path.resolve(__dirname, '../../scripts/analyze.js');
        const result = spawnSync(process.execPath, [script, path.join(directory, 'missing.log')], { encoding: 'utf8' });

        expect(result.status).toBe(1);
        expect(result.stderr).toContain('Unable to read log file');
    });
});
