const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const PAGE_SIZE = 5;

/**
 * Build the embed + button components for a given page of broadcast logs.
 * @param {Array} allLogs  - All log documents (sorted newest-first)
 * @param {number} page    - 1-indexed current page
 * @returns {{ embed, components }}
 */
function buildBroadcastLogsPage(allLogs, page) {
    const totalPages = Math.max(1, Math.ceil(allLogs.length / PAGE_SIZE));
    page = Math.min(Math.max(1, page), totalPages);

    const slice = allLogs.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
    const globalOffset = (page - 1) * PAGE_SIZE;

    // Helpers
    const rpad = (val, len) => String(val).padStart(len);
    const lpad = (val, len) => String(val).padEnd(len);
    const fmtDate = d => {
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return `${String(d.getUTCDate()).padStart(2, '0')} ${months[d.getUTCMonth()]} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
    };

    // ── Summary table ────────────────────────────────────────────────
    const COL = { num: 2, type: 5, date: 13, succ: 4, fail: 4 };
    const H = ` # │ ${'Type'.padEnd(COL.type)} │ ${'Date UTC'.padEnd(COL.date)} │ Succ │ Fail │ Sender`;
    const DIV = '─'.repeat(H.length);

    const tableRows = slice.map((log, i) => {
        const globalIdx = globalOffset + i + 1;
        const dateStr = fmtDate(new Date(log.sentAt));
        return [
            rpad(globalIdx, COL.num),
            lpad((log.type || '?').toUpperCase(), COL.type),
            lpad(dateStr, COL.date),
            rpad(log.successCount, COL.succ),
            rpad(log.failCount, COL.fail),
            log.senderUsername
        ].join(' │ ');
    });

    const table = `\`\`\`\n${H}\n${DIV}\n${tableRows.join('\n')}\n\`\`\``;

    // ── Failed guild details for this page (only if any exist) ───────
    const failBlocks = [];
    slice.forEach((log, i) => {
        if (!log.failedGuilds || log.failedGuilds.length === 0) return;
        const globalIdx = globalOffset + i + 1;
        const shown = log.failedGuilds.slice(0, 5);
        const lines = shown.map(f => `\`${f.guildId}\` — ${f.reason}`).join('\n');
        const extra = log.failedGuilds.length > 5 ? `\n*…and ${log.failedGuilds.length - 5} more*` : '';
        failBlocks.push(`**#${globalIdx} failures:**\n${lines}${extra}`);
    });

    const description = table + (failBlocks.length ? '\n\n' + failBlocks.join('\n\n') : '');

    const embed = {
        color: 0x5865F2,
        title: `📋 Broadcast Logs`,
        description,
        footer: { text: `Page ${page} / ${totalPages}  •  ${allLogs.length} total  •  times in UTC` },
        timestamp: new Date()
    };

    // ── Pagination buttons ────────────────────────────────────────────
    const components = [];
    if (totalPages > 1) {
        const row = new ActionRowBuilder();
        row.addComponents(
            new ButtonBuilder()
                .setCustomId(`blpg:${page - 1}`)
                .setLabel('◀ Previous')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(page === 1),
            new ButtonBuilder()
                .setCustomId(`blpg:${page + 1}`)
                .setLabel('Next ▶')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(page === totalPages)
        );
        components.push(row);
    }

    return { embed, components };
}

module.exports = {
    buildBroadcastLogsPage
};
