function sortValue(value) {
    if (Array.isArray(value)) return value.map(sortValue);
    if (value && typeof value === 'object') {
        return Object.keys(value).sort().reduce((result, key) => {
            result[key] = sortValue(value[key]);
            return result;
        }, {});
    }
    return value;
}

function stableStringify(value) {
    return `${JSON.stringify(sortValue(value), null, 2)}\n`;
}

function escapeHtml(value) {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll(`'`, '&#39;');
}

function formatMoney(value) {
    return `$${Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(value, timezone) {
    return new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        dateStyle: 'medium',
        timeStyle: 'short',
        hour12: false
    }).format(new Date(value));
}

function cards(overview) {
    const values = [
        ['Duration', `${overview.durationMinutes} min`],
        ['Average viewers', overview.averageViewers],
        ['Peak viewers', overview.peakViewers],
        ['Human chat', overview.humanChatMessages],
        ['Unique chatters', overview.uniqueChatters],
        ['Live donations', overview.donationCount],
        ['Raised live', formatMoney(overview.donationTotal)]
    ];
    return values.map(([label, value]) => `<article class="card"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></article>`).join('');
}

function chatCards(chat) {
    const values = [
        ['Human messages', chat.humanMessages],
        ['Unique chatters', chat.uniqueChatters],
        ['Bot messages', chat.botMessages],
        ['Commands', chat.commandCount || 0],
        ['Links', chat.linkCount || 0],
        ['Emotes', chat.emoteCount || 0],
        ['Cross-game chatters', chat.crossGameChatters || 0]
    ];
    return values.map(([label, value]) => `<article class="card"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></article>`).join('');
}

function gameTable(games) {
    const rows = games.map(game => `<tr>
        <td>${escapeHtml(game.game)}</td><td data-value="${game.durationMinutes}">${game.durationMinutes}</td>
        <td>${game.viewer.samples ?? game.coverage ?? 0}</td><td data-value="${game.viewer.average}">${game.viewer.average}</td><td>${game.viewer.peak}</td>
        <td>${game.viewer.retentionPercent}%</td><td>${game.viewer.trendPerHour ?? 0}</td><td>${game.viewer.volatility ?? 0}</td><td>${game.chat.messagesPerHour}</td>
        <td>${game.chat.uniqueChattersPerHour}</td><td>${formatMoney(game.donations.total)}</td>
        <td>${game.eligibleForRanking ? 'Yes' : 'No'}</td>
    </tr>`).join('');
    return `<label class="filter">Filter games <input id="game-filter" type="search" autocomplete="off"></label>
    <div class="table-wrap"><table id="games"><thead><tr>
        <th>Game</th><th>Minutes</th><th>Coverage samples</th><th>Avg viewers</th><th>Peak</th><th>Retention</th>
        <th>Trend/hour</th><th>Volatility</th><th>Chats/hour</th><th>Unique/hour</th><th>Donations</th><th>Ranked</th>
    </tr></thead><tbody>${rows}</tbody></table></div>`;
}

function niceStep(value) {
    if (!Number.isFinite(value) || value <= 0) return 1;
    const magnitude = 10 ** Math.floor(Math.log10(value));
    const normalized = value / magnitude;
    if (normalized <= 1) return magnitude;
    if (normalized <= 2) return 2 * magnitude;
    if (normalized <= 5) return 5 * magnitude;
    return 10 * magnitude;
}

function xTickHours(durationHours) {
    if (durationHours <= 6) return 1;
    if (durationHours <= 12) return 2;
    if (durationHours <= 30) return 3;
    if (durationHours <= 48) return 6;
    return 12;
}

function formatClock(timestamp, timezone) {
    return new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    }).format(new Date(timestamp));
}

function formatElapsed(milliseconds) {
    const hours = milliseconds / 3_600_000;
    const value = Number.isInteger(hours) ? hours.toFixed(0) : hours.toFixed(1);
    return `+${value}h`;
}

function timelineSvg({ timeline, eventWindow, gameSegments, donations, timezone }) {
    if (!timeline.length) return '<p>No timeline samples.</p>';

    const width = 1000;
    const height = 450;
    const left = 72;
    const right = 24;
    const plotTop = 40;
    const plotBottom = 260;
    const plotWidth = width - left - right;
    const plotHeight = plotBottom - plotTop;
    const gameTop = 306;
    const gameHeight = 32;
    const donationY = 374;
    const start = new Date(eventWindow.start).getTime();
    const end = new Date(eventWindow.end).getTime();
    const duration = Math.max(1, end - start);
    const x = timestamp => left + (Math.min(end, Math.max(start, new Date(timestamp).getTime())) - start) / duration * plotWidth;

    const viewerMax = Math.max(0, ...timeline.map(bin => Number(bin.averageViewers) || 0));
    const yStep = niceStep(Math.max(1, viewerMax) / 5);
    const yMax = yStep * 5;
    const y = value => plotBottom - (Number(value) || 0) / yMax * plotHeight;
    const yTicks = Array.from({ length: 6 }, (_, index) => index * yStep);
    const yMarkup = yTicks.map(value => {
        const position = y(value).toFixed(1);
        return `<g><line x1="${left}" y1="${position}" x2="${width - right}" y2="${position}" class="grid-line"></line><text x="${left - 10}" y="${position}" class="axis-label" text-anchor="end" dominant-baseline="middle">${value}</text></g>`;
    }).join('');

    const tickMilliseconds = xTickHours(duration / 3_600_000) * 3_600_000;
    const xTickValues = [];
    for (let timestamp = start; timestamp <= end; timestamp += tickMilliseconds) xTickValues.push(timestamp);
    if (xTickValues.at(-1) !== end) xTickValues.push(end);
    const xMarkup = xTickValues.map(timestamp => {
        const position = x(timestamp).toFixed(1);
        return `<g><line x1="${position}" y1="${plotBottom}" x2="${position}" y2="${plotBottom + 7}" class="axis"></line><text x="${position}" y="${plotBottom + 22}" class="axis-label" text-anchor="middle">${escapeHtml(formatClock(timestamp, timezone))}</text><text x="${position}" y="${plotBottom + 38}" class="elapsed-label" text-anchor="middle">${formatElapsed(timestamp - start)}</text></g>`;
    }).join('');

    const points = timeline.map(bin => {
        const midpoint = (new Date(bin.start).getTime() + new Date(bin.end).getTime()) / 2;
        return `${x(midpoint).toFixed(1)},${y(bin.averageViewers).toFixed(1)}`;
    }).join(' ');

    const visibleSegments = (gameSegments || []).filter(segment =>
        new Date(segment.end).getTime() > start && new Date(segment.start).getTime() < end
    );
    const gameMarkup = visibleSegments.map((segment, index) => {
        const segmentStart = Math.max(start, new Date(segment.start).getTime());
        const segmentEnd = Math.min(end, new Date(segment.end).getTime());
        const segmentX = x(segmentStart);
        const segmentWidth = Math.max(1, x(segmentEnd) - segmentX);
        const game = escapeHtml(segment.game || 'Unknown');
        const label = segmentWidth >= 34
            ? `<text x="${(segmentX + 6).toFixed(1)}" y="${gameTop + 21}" clip-path="url(#timeline-game-${index})" class="game-label">${game}</text>`
            : '';
        return `<clipPath id="timeline-game-${index}"><rect x="${segmentX.toFixed(1)}" y="${gameTop}" width="${segmentWidth.toFixed(1)}" height="${gameHeight}"></rect></clipPath><rect x="${segmentX.toFixed(1)}" y="${gameTop}" width="${segmentWidth.toFixed(1)}" height="${gameHeight}" class="game-segment" data-band="${index % 2}"><title>Game segment: ${game} — ${escapeHtml(formatClock(segmentStart, timezone))} to ${escapeHtml(formatClock(segmentEnd, timezone))}</title></rect>${label}`;
    }).join('');
    const transitionMarkup = visibleSegments.slice(1).map((segment, index) => {
        const timestamp = new Date(segment.start).getTime();
        const position = x(timestamp).toFixed(1);
        const from = escapeHtml(visibleSegments[index].game || 'Unknown');
        const to = escapeHtml(segment.game || 'Unknown');
        return `<line x1="${position}" y1="${plotTop}" x2="${position}" y2="${gameTop + gameHeight}" class="game-transition"><title>Game transition: ${from} → ${to} at ${escapeHtml(formatClock(timestamp, timezone))}</title></line>`;
    }).join('');

    const visibleDonations = (donations || []).filter(donation => {
        const timestamp = new Date(donation.timestamp).getTime();
        return timestamp >= start && timestamp <= end;
    });
    const donationMarkup = visibleDonations.map((donation, index) => {
        const timestamp = new Date(donation.timestamp).getTime();
        const position = x(timestamp);
        const level = index % 3;
        const markerY = donationY + level * 8;
        const pointsValue = `${position.toFixed(1)},${(markerY - 6).toFixed(1)} ${(position + 6).toFixed(1)},${markerY.toFixed(1)} ${position.toFixed(1)},${(markerY + 6).toFixed(1)} ${(position - 6).toFixed(1)},${markerY.toFixed(1)}`;
        const name = escapeHtml(donation.displayName || 'Anonymous');
        const message = donation.message ? ` — ${escapeHtml(donation.message)}` : '';
        return `<polygon points="${pointsValue}" class="donation-marker"><title>Donation: ${escapeHtml(formatMoney(donation.amount))} — ${name} at ${escapeHtml(formatClock(timestamp, timezone))}${message}</title></polygon>`;
    }).join('');

    return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Average viewers, game transitions, and donations over the event">
        <desc>Viewer averages by 15-minute interval with ${visibleSegments.length} game segments and ${visibleDonations.length} confirmed live donations.</desc>
        <g class="viewer-axis">${yMarkup}<line x1="${left}" y1="${plotTop}" x2="${left}" y2="${plotBottom}" class="axis"></line><text x="18" y="${(plotTop + plotBottom) / 2}" class="axis-title" text-anchor="middle" transform="rotate(-90 18 ${(plotTop + plotBottom) / 2})">Viewers</text></g>
        <g class="time-axis"><line x1="${left}" y1="${plotBottom}" x2="${width - right}" y2="${plotBottom}" class="axis"></line>${xMarkup}</g>
        <polyline points="${points}" class="viewer-line"><title>Viewer average by 15-minute interval</title></polyline>
        ${transitionMarkup}
        <text x="${left - 10}" y="${gameTop + 21}" class="lane-label" text-anchor="end">Games</text>${gameMarkup}
        <line x1="${left}" y1="${donationY}" x2="${width - right}" y2="${donationY}" class="donation-lane"></line>
        <text x="${left - 10}" y="${donationY + 4}" class="lane-label" text-anchor="end">Gifts</text>${donationMarkup}
        <g class="timeline-legend" transform="translate(${left} 428)"><line x1="0" y1="0" x2="24" y2="0" class="viewer-line"></line><text x="32" y="4">Viewer average</text><rect x="170" y="-8" width="22" height="12" class="legend-game-segment"></rect><text x="200" y="4">Game segment</text><line x1="330" y1="-10" x2="330" y2="8" class="legend-game-transition"></line><text x="340" y="4">Game transition</text><polygon points="490,-8 496,-2 490,4 484,-2" class="legend-donation-marker"></polygon><text x="504" y="4">Donation</text></g>
    </svg>`;
}

function topList(items, empty) {
    if (!items?.length) return `<p>${escapeHtml(empty)}</p>`;
    return `<ol>${items.slice(0, 15).map(item => `<li><span>${escapeHtml(item.value)}</span><strong>${item.count}</strong></li>`).join('')}</ol>`;
}

function diagnosticList(report) {
    const parser = report.diagnostics;
    const metrics = report.metrics.diagnostics;
    const values = [
        ['Input lines', report.source.lineCount],
        ['Unknown lines', parser.unknownLines.length],
        ['Malformed lines', parser.malformedLines.length],
        ['Ambiguous timestamps', parser.ambiguousTimestamps.length],
        ['Duplicate events', parser.duplicateEvents.length],
        ['Coverage gaps', metrics.coverageGaps.length],
        ['Excluded sessions', metrics.excludedSessions.length]
    ];
    return `<dl>${values.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${value}</dd></div>`).join('')}</dl>`;
}

function rankingTable(rankings) {
    const labels = {
        averageViewers: 'Average viewers',
        viewerRetention: 'Viewer retention',
        chatRate: 'Chat rate',
        uniqueChatRate: 'Unique chatter rate',
        donationRate: 'Donation rate'
    };
    return `<table><thead><tr><th>Measure</th><th>Ranked games</th></tr></thead><tbody>${Object.entries(labels).map(([key, label]) =>
        `<tr><td>${escapeHtml(label)}</td><td>${escapeHtml((rankings[key] || []).join(' → ') || 'No eligible games')}</td></tr>`
    ).join('')}</tbody></table>`;
}

function transitionTable(transitions) {
    if (!transitions.length) return '<p>No game transitions in the selected event.</p>';
    return `<div class="table-wrap"><table><thead><tr><th>Transition</th><th>Status</th><th>Viewers before → after</th><th>Chat before → after</th></tr></thead><tbody>${transitions.map(transition =>
        `<tr><td>${escapeHtml(transition.from)} → ${escapeHtml(transition.to)}</td><td>${transition.included ? 'Included' : escapeHtml(transition.reason)}</td><td>${transition.before.medianViewers} → ${transition.after.medianViewers}</td><td>${transition.before.chatMessages} → ${transition.after.chatMessages}</td></tr>`
    ).join('')}</tbody></table></div>`;
}

function donationTable(items) {
    if (!items.length) return '<p>No confirmed live donations.</p>';
    return `<div class="table-wrap"><table><thead><tr><th>Time</th><th>Donor</th><th>Amount</th><th>Message</th></tr></thead><tbody>${items.map(item =>
        `<tr><td>${escapeHtml(item.timestamp)}</td><td>${escapeHtml(item.displayName)}</td><td>${formatMoney(item.amount)}</td><td>${escapeHtml(item.message || '')}</td></tr>`
    ).join('')}</tbody></table></div>`;
}

function renderHtml(report, timezone) {
    const metrics = report.metrics;
    const embedded = stableStringify(report).replaceAll('<', '\\u003c').replaceAll('>', '\\u003e');
    return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Extra Life Event Analysis</title><style>
:root{color-scheme:dark;--bg:#101820;--panel:#182530;--ink:#f5f7fa;--muted:#9fb0bd;--accent:#56d6c9;--gold:#ffca5c}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 system-ui,sans-serif}main{max-width:1180px;margin:auto;padding:32px}
h1,h2{line-height:1.15}h2{margin-top:38px}.notice{padding:12px 16px;border-left:4px solid var(--gold);background:#332b1b}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px}.card{background:var(--panel);padding:16px;border-radius:8px}.card span{display:block;color:var(--muted)}.card strong{font-size:1.5rem}
.table-wrap{overflow:auto}table{width:100%;border-collapse:collapse;background:var(--panel)}th,td{padding:9px;border-bottom:1px solid #31404c;text-align:left;white-space:nowrap}th{cursor:pointer;color:var(--accent)}.filter{display:block;margin:0 0 12px}input{margin-left:8px;padding:7px;background:var(--panel);color:var(--ink);border:1px solid #526878}
svg{width:100%;background:var(--panel);border-radius:8px}.axis{stroke:#526878}.grid-line{stroke:#31404c;stroke-width:1}.axis-label,.elapsed-label,.lane-label,.timeline-legend text{fill:var(--muted);font-size:12px}.elapsed-label{font-size:10px}.axis-title{fill:var(--ink);font-size:12px}.viewer-line{fill:none;stroke:var(--accent);stroke-width:3}.game-segment,.legend-game-segment{fill:#3d6680;stroke:#7ea7bc;stroke-width:1}.game-segment[data-band="1"]{fill:#365267}.game-label{fill:var(--ink);font-size:11px;pointer-events:none}.game-transition,.legend-game-transition{stroke:#f29d49;stroke-width:2;stroke-dasharray:5 4}.donation-lane{stroke:#526878}.donation-marker,.legend-donation-marker{fill:var(--gold);stroke:#101820;stroke-width:1}.timeline-legend{font-size:12px}ol{max-width:480px;padding:0;list-style-position:inside}li{display:flex;justify-content:space-between;padding:5px;border-bottom:1px solid #31404c}dl{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:8px}dl div{background:var(--panel);padding:10px}dt{color:var(--muted)}dd{margin:0;font-size:1.25rem}footer{margin-top:40px;color:var(--muted)}
</style></head><body><main>
<h1>Extra Life Event Analysis</h1><p class="notice"><strong>Private local report.</strong> It may contain donor names, chatter names, and message text. Do not publish it without review.</p>
<p>${escapeHtml(formatDate(metrics.eventWindow.start, timezone))} – ${escapeHtml(formatDate(metrics.eventWindow.end, timezone))} (${escapeHtml(timezone)})</p>
<section class="cards">${cards(metrics.overview)}</section>
<h2>Viewer timeline</h2>${timelineSvg({ timeline: metrics.timeline, eventWindow: metrics.eventWindow, gameSegments: report.sessions?.gameSegments || [], donations: metrics.donations.items, timezone })}
<h2>Games and schedule</h2>${gameTable(metrics.games)}
<h2>Game rankings</h2>${rankingTable(metrics.rankings)}
<h2>Transition impact</h2>${transitionTable(metrics.transitions)}
<h2>Chat patterns</h2><div class="cards">${chatCards(metrics.chat)}</div>
<h3>Top chatters</h3>${topList(metrics.chat.topChatters, 'No human chat messages.')}<h3>Top words</h3>${topList(metrics.chat.topWords, 'No lexical data.')}<h3>Top phrases</h3>${topList(metrics.chat.topBigrams, 'No phrase data.')}
<h2>Donation patterns</h2><p><strong>${metrics.donations.count}</strong> live donations totaling <strong>${formatMoney(metrics.donations.total)}</strong>; median ${formatMoney(metrics.donations.median)}, largest ${formatMoney(metrics.donations.largest)}. ${metrics.donations.startupCount} startup and ${metrics.donations.ambiguousCount} ambiguous records were excluded.</p>${donationTable(metrics.donations.items)}
<h2>Data quality</h2>${diagnosticList(report)}
<footer>Generated deterministically from ${escapeHtml(report.source.name)}. Correlations are descriptive, not causal.</footer>
<script type="application/json" id="report-data">${embedded}</script><script>
document.getElementById('game-filter').addEventListener('input',event=>{const q=event.target.value.toLowerCase();document.querySelectorAll('#games tbody tr').forEach(row=>{row.hidden=!row.cells[0].textContent.toLowerCase().includes(q)})});
document.querySelectorAll('#games th').forEach((th,index)=>th.addEventListener('click',()=>{const body=th.closest('table').tBodies[0];const rows=[...body.rows];rows.sort((a,b)=>{const av=Number(a.cells[index].dataset.value??a.cells[index].textContent);const bv=Number(b.cells[index].dataset.value??b.cells[index].textContent);return Number.isNaN(av)||Number.isNaN(bv)?a.cells[index].textContent.localeCompare(b.cells[index].textContent):av-bv});rows.forEach(row=>body.appendChild(row))}));
</script></main></body></html>\n`;
}

module.exports = { renderHtml, stableStringify };
