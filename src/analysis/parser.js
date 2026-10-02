const STRUCTURED_TYPES = new Set([
    'donation',
    'chat_message',
    'game_change',
    'viewer_sample',
    'command',
    'service_error'
]);

function stripDockerPrefix(line) {
    const separator = line.indexOf(' | ');
    return separator === -1 ? line : line.slice(separator + 3);
}

function splitMetadata(content) {
    const start = content.lastIndexOf(' {');
    if (start === -1) return { message: content, metadata: null, malformed: false };

    const candidate = content.slice(start + 1);
    try {
        return {
            message: content.slice(0, start),
            metadata: JSON.parse(candidate),
            malformed: false
        };
    } catch {
        return {
            message: content,
            metadata: null,
            malformed: candidate.includes('"eventVersion"')
        };
    }
}

function inferChatTimestamp(clock, anchor) {
    if (!anchor) return null;
    const [hours, minutes] = clock.split(':').map(Number);
    const base = new Date(anchor);
    let candidate = new Date(Date.UTC(
        base.getUTCFullYear(),
        base.getUTCMonth(),
        base.getUTCDate(),
        hours,
        minutes
    ));
    if (candidate.getTime() < base.getTime() - 60_000) {
        candidate = new Date(candidate.getTime() + 86_400_000);
    }
    return candidate.toISOString();
}

function parseStructuredEvent(timestamp, metadata, line, seenKeys, diagnostics) {
    if (metadata.eventVersion !== 1 || !STRUCTURED_TYPES.has(metadata.eventType)) return null;

    const data = { ...metadata };
    delete data.eventVersion;
    delete data.eventType;
    if (metadata.eventType === 'donation') {
        data.classification = data.silent ? 'startup' : 'live';
        if (data.donationId) {
            const key = `donation:${data.donationId}`;
            if (seenKeys.has(key)) {
                diagnostics.duplicateEvents.push({ line, key });
                return null;
            }
            seenKeys.add(key);
        }
    }

    return {
        type: metadata.eventType,
        timestamp,
        line,
        confidence: 'exact',
        data
    };
}

function confirmLegacyDonations(events, statusLines) {
    const chats = events.filter(event => event.type === 'chat_message');
    for (const donation of events.filter(event => event.type === 'donation' && event.data.classification !== 'live')) {
        const amount = `$${donation.data.amount.toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        })}`;
        const matchingChat = chats.find(event =>
            event.line > donation.line &&
            event.line <= donation.line + 10 &&
            event.data.text.includes('ExtraLife ExtraLife') &&
            event.data.text.includes(donation.data.displayName) &&
            event.data.text.includes(amount)
        );
        const matchingStatus = matchingChat && statusLines.find(line =>
            line > matchingChat.line && line <= matchingChat.line + 10
        );
        if (matchingStatus) donation.data.classification = 'live';
    }
}

function parseLog(text) {
    const lines = text.split(/\r?\n/);
    if (lines.at(-1) === '') lines.pop();

    const events = [];
    const diagnostics = {
        unknownLines: [],
        malformedLines: [],
        ambiguousTimestamps: [],
        duplicateEvents: []
    };
    const seenKeys = new Set();
    const statusLines = [];
    let anchor = null;
    let startupAt = null;

    lines.forEach((rawLine, index) => {
        const lineNumber = index + 1;
        const line = stripDockerPrefix(rawLine);
        if (!line.trim()) return;

        const winston = line.match(/^(\d{4}-\d{2}-\d{2}T[^ ]+Z) \[([^\]]+)] ([A-Z]+): (.*)$/);
        if (winston) {
            const [, timestamp, moduleName, level, content] = winston;
            anchor = timestamp;
            const { message, metadata, malformed } = splitMetadata(content);
            if (malformed) {
                diagnostics.malformedLines.push({ line: lineNumber, reason: 'invalid JSON metadata' });
                return;
            }

            if (metadata) {
                const structured = parseStructuredEvent(timestamp, metadata, lineNumber, seenKeys, diagnostics);
                if (structured) {
                    events.push(structured);
                    return;
                }
            }

            if (message.startsWith('ExtraLife Helper Bot starting')) {
                startupAt = timestamp;
                return;
            }
            if (message === 'Discord Bot Online') return;
            if (message.startsWith('Updating Discord status:')) {
                statusLines.push(lineNumber);
                return;
            }
            if (message === 'Stream viewer count' && metadata) {
                events.push({
                    type: 'viewer_sample', timestamp, line: lineNumber, confidence: 'exact', data: metadata
                });
                return;
            }
            if (message === 'Game change detected' && metadata) {
                events.push({
                    type: 'game_change', timestamp, line: lineNumber, confidence: 'exact', data: metadata
                });
                return;
            }
            if (message.startsWith('Donation: ')) {
                const donation = message.match(/^Donation: (.*?) \/ \$([\d,]+\.\d{2})(?: with the message "(.*)")?$/);
                if (donation) {
                    const isStartup = startupAt && new Date(timestamp) - new Date(startupAt) <= 300_000;
                    events.push({
                        type: 'donation',
                        timestamp,
                        line: lineNumber,
                        confidence: 'exact',
                        data: {
                            displayName: donation[1],
                            amount: Number(donation[2].replaceAll(',', '')),
                            message: donation[3] || '',
                            classification: isStartup ? 'startup' : 'ambiguous'
                        }
                    });
                    return;
                }
            }
            if (message.endsWith('command executed') || message === 'Custom command executed') {
                events.push({
                    type: 'command', timestamp, line: lineNumber, confidence: 'exact', data: metadata || { message }
                });
                return;
            }
            if (level === 'ERROR' || level === 'WARN') {
                events.push({
                    type: 'service_error',
                    timestamp,
                    line: lineNumber,
                    confidence: 'exact',
                    data: { module: moduleName, level: level.toLowerCase(), message, ...(metadata || {}) }
                });
                return;
            }

            diagnostics.unknownLines.push({ line: lineNumber, text: line });
            return;
        }

        const chat = line.match(/^\[(\d{2}:\d{2})] info: \[#([^\]]+)] <([^>]+)>: (.*)$/i);
        if (chat) {
            const timestamp = inferChatTimestamp(chat[1], anchor);
            events.push({
                type: 'chat_message',
                timestamp,
                line: lineNumber,
                confidence: timestamp ? 'inferred' : 'ambiguous',
                data: { channel: chat[2], username: chat[3], text: chat[4] }
            });
            if (!timestamp) diagnostics.ambiguousTimestamps.push(lineNumber);
            return;
        }

        diagnostics.unknownLines.push({ line: lineNumber, text: line });
    });

    confirmLegacyDonations(events, statusLines);
    events.sort((left, right) => left.line - right.line);

    return { lineCount: lines.length, events, diagnostics };
}

module.exports = { parseLog };
