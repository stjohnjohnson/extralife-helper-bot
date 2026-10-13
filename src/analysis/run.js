const fs = require('fs');
const path = require('path');
const { parseLog } = require('./parser.js');
const { buildSessions } = require('./sessions.js');
const { calculateMetrics } = require('./metrics.js');
const { renderHtml, stableStringify } = require('./report.js');

function writeAtomic(target, content) {
    const temporary = `${target}.tmp`;
    fs.writeFileSync(temporary, content, 'utf8');
    fs.renameSync(temporary, target);
}

function sessionSummary(sessions) {
    const selected = { ...sessions.selected };
    delete selected.samples;
    return { ...sessions, selected };
}

function runAnalysis(options) {
    let text;
    try {
        text = fs.readFileSync(options.inputPath, 'utf8');
    } catch (error) {
        throw new Error(`Unable to read log file "${options.inputPath}": ${error.message}`, { cause: error });
    }

    const parsed = parseLog(text);
    const sessions = buildSessions(parsed.events, { start: options.start, end: options.end });
    const metrics = calculateMetrics(parsed.events, sessions, { botUsers: options.botUsers });
    const report = {
        schemaVersion: 1,
        source: { name: path.basename(options.inputPath), lineCount: parsed.lineCount },
        options: {
            timezone: options.timezone,
            botUsers: options.botUsers,
            start: options.start,
            end: options.end
        },
        events: parsed.events,
        sessions: sessionSummary(sessions),
        metrics,
        diagnostics: parsed.diagnostics
    };

    fs.mkdirSync(options.outputDir, { recursive: true });
    const stem = path.basename(options.inputPath, path.extname(options.inputPath));
    const jsonPath = path.join(options.outputDir, `${stem}.json`);
    const htmlPath = path.join(options.outputDir, `${stem}.html`);
    writeAtomic(jsonPath, stableStringify(report));
    writeAtomic(htmlPath, renderHtml(report, options.timezone));
    return { jsonPath, htmlPath, report };
}

module.exports = { runAnalysis };
