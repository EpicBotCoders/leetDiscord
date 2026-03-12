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

    // ── Summary list ────────────────────────────────────────────────
    const listRows = slice.map((log, i) => {
        const globalIdx = globalOffset + i + 1;
        const ts = Math.floor(new Date(log.sentAt).getTime() / 1000);
        const dateStr = `<t:${ts}:f>`;
        const type = (log.type || '?').toUpperCase();
        return `**#${globalIdx} [${type}]** • ${dateStr}\n└ ✅ ${log.successCount} | ❌ ${log.failCount} | 👤 ${log.senderUsername}`;
    });

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

    const description = listRows.join('\n\n') + (failBlocks.length ? '\n\n' + failBlocks.join('\n\n') : '');

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
