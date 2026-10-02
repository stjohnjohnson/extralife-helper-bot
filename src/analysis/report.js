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
        <td data-value="${game.viewer.average}">${game.viewer.average}</td><td>${game.viewer.peak}</td>
        <td>${game.viewer.retentionPercent}%</td><td>${game.chat.messagesPerHour}</td>
        <td>${game.chat.uniqueChattersPerHour}</td><td>${formatMoney(game.donations.total)}</td>
        <td>${game.eligibleForRanking ? 'Yes' : 'No'}</td>
    </tr>`).join('');
    return `<label class="filter">Filter games <input id="game-filter" type="search" autocomplete="off"></label>
    <div class="table-wrap"><table id="games"><thead><tr>
        <th>Game</th><th>Minutes</th><th>Avg viewers</th><th>Peak</th><th>Retention</th>
        <th>Chats/hour</th><th>Unique/hour</th><th>Donations</th><th>Ranked</th>
    </tr></thead><tbody>${rows}</tbody></table></div>`;
}

function timelineSvg(timeline) {
    if (!timeline.length) return '<p>No timeline samples.</p>';
    const width = 900;
    const height = 220;
    const max = Math.max(1, ...timeline.map(bin => bin.averageViewers));
    const points = timeline.map((bin, index) => {
        const x = timeline.length === 1 ? width / 2 : index / (timeline.length - 1) * width;
        const y = height - bin.averageViewers / max * (height - 30);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
    return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Average viewers by 15-minute interval">
        <line x1="0" y1="${height}" x2="${width}" y2="${height}" class="axis"></line>
        <polyline points="${points}" class="viewer-line"></polyline>
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
svg{width:100%;background:var(--panel);border-radius:8px}.axis{stroke:#526878}.viewer-line{fill:none;stroke:var(--accent);stroke-width:3}ol{max-width:480px;padding:0;list-style-position:inside}li{display:flex;justify-content:space-between;padding:5px;border-bottom:1px solid #31404c}dl{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:8px}dl div{background:var(--panel);padding:10px}dt{color:var(--muted)}dd{margin:0;font-size:1.25rem}footer{margin-top:40px;color:var(--muted)}
</style></head><body><main>
<h1>Extra Life Event Analysis</h1><p class="notice"><strong>Private local report.</strong> It may contain donor names, chatter names, and message text. Do not publish it without review.</p>
<p>${escapeHtml(formatDate(metrics.eventWindow.start, timezone))} – ${escapeHtml(formatDate(metrics.eventWindow.end, timezone))} (${escapeHtml(timezone)})</p>
<section class="cards">${cards(metrics.overview)}</section>
<h2>Viewer timeline</h2>${timelineSvg(metrics.timeline)}
<h2>Games and schedule</h2>${gameTable(metrics.games)}
<h2>Chat patterns</h2><div class="cards">${chatCards(metrics.chat)}</div>
<h3>Top chatters</h3>${topList(metrics.chat.topChatters, 'No human chat messages.')}<h3>Top words</h3>${topList(metrics.chat.topWords, 'No lexical data.')}<h3>Top phrases</h3>${topList(metrics.chat.topBigrams, 'No phrase data.')}
<h2>Donation patterns</h2><p><strong>${metrics.donations.count}</strong> live donations totaling <strong>${formatMoney(metrics.donations.total)}</strong>; median ${formatMoney(metrics.donations.median)}, largest ${formatMoney(metrics.donations.largest)}. ${metrics.donations.startupCount} startup and ${metrics.donations.ambiguousCount} ambiguous records were excluded.</p>
<h2>Data quality</h2>${diagnosticList(report)}
<footer>Generated deterministically from ${escapeHtml(report.source.name)}. Correlations are descriptive, not causal.</footer>
<script type="application/json" id="report-data">${embedded}</script><script>
document.getElementById('game-filter').addEventListener('input',event=>{const q=event.target.value.toLowerCase();document.querySelectorAll('#games tbody tr').forEach(row=>{row.hidden=!row.cells[0].textContent.toLowerCase().includes(q)})});
document.querySelectorAll('#games th').forEach((th,index)=>th.addEventListener('click',()=>{const body=th.closest('table').tBodies[0];const rows=[...body.rows];rows.sort((a,b)=>{const av=Number(a.cells[index].dataset.value??a.cells[index].textContent);const bv=Number(b.cells[index].dataset.value??b.cells[index].textContent);return Number.isNaN(av)||Number.isNaN(bv)?a.cells[index].textContent.localeCompare(b.cells[index].textContent):av-bv});rows.forEach(row=>body.appendChild(row))}));
</script></main></body></html>\n`;
}

module.exports = { renderHtml, stableStringify };
