const { parseDuration, parseMemory } = require('./apiUtils');

function sortSubmissionsByPerformance(submissionsData) {
    return submissionsData.sort((a, b) => {
        const runtimeA = parseDuration(a.submission.runtime);
        const runtimeB = parseDuration(b.submission.runtime);

        if (runtimeA !== runtimeB) {
            return runtimeA - runtimeB;
        }

        const memoryA = parseMemory(a.submission.memory);
        const memoryB = parseMemory(b.submission.memory);
        return memoryA - memoryB;
    });
}

function buildRankedFields(rows, formatValue) {
    const medals = ['🥇', '🥈', '🥉'];

    return rows.map((row, index) => {
        const medal = index < 3 ? medals[index] : '';
        const mention = row.discordId ? `<@${row.discordId}>` : row.username;
        const valueLines = [];

        if (row.submission) {
            const submissionUrl = `https://leetcode.com${row.submission.url}`;
            valueLines.push(
                `👤 ${mention}`,
                `🔗 [View Submission](${submissionUrl})`,
                `💻 ${row.submission.langName}`,
                `⚡ Runtime: ${row.submission.runtime}`,
                `🧠 Memory: ${row.submission.memory}`
            );
        } else if (typeof formatValue === 'function') {
            valueLines.push(`👤 ${mention}`, formatValue(row));
        } else if (typeof row.value !== 'undefined') {
            valueLines.push(`👤 ${mention}`, `${row.value}`);
        } else {
            valueLines.push(`👤 ${mention}`);
        }

        return {
            name: `**${index + 1}. ${row.username}** ${medal}`,
            value: valueLines.join('\n'),
            inline: true
        };
    });
}

module.exports = {
    sortSubmissionsByPerformance,
    buildRankedFields
};


