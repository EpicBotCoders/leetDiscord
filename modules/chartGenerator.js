const path = require('path');
const { registerFont } = require('canvas');
const { ChartJSNodeCanvas } = require('chartjs-node-canvas');
const { AttachmentBuilder } = require('discord.js');
const logger = require('./logger');

// Register font BEFORE creating canvas
registerFont(
    path.join(__dirname, '..', 'fonts', 'NotoSans-Regular.ttf'),
    { family: 'Noto Sans' }
);

const fs = require('fs');
console.log(
    'Font exists:',
    fs.existsSync(path.join(__dirname, '..', 'fonts', 'NotoSans-Regular.ttf'))
);

const { Chart } = require('chart.js');
Chart.defaults.font.family = 'Noto Sans';

// Chart configuration
const width = 800;
const height = 500;
const chartJSNodeCanvas = new ChartJSNodeCanvas({
    width,
    height,
    backgroundColour: '#161b22', // GitHub dark background
    plugins: {
        modern: ['chartjs-chart-matrix']
    }
});

/**
 * Generate a bar chart comparing runtime and memory for submissions
 * @param {Array} submissionsData - Array of submission data with username and metrics
 * @returns {Promise<AttachmentBuilder>} Discord attachment with chart image
 */
async function generateSubmissionChart(submissionsData) {
    try {
        // Extract data for chart
        const usernames = submissionsData.map(data => data.username);
        const runtimes = submissionsData.map(data => {
            const runtime = data.submission.runtime;
            const match = runtime.match(/(\d+(?:\.\d+)?)\s*ms/i);
            return match ? parseFloat(match[1]) : 0;
        });
        const memories = submissionsData.map(data => {
            const memory = data.submission.memory;
            const match = memory.match(/(\d+(?:\.\d+)?)\s*MB/i);
            return match ? parseFloat(match[1]) : 0;
        });

        const configuration = {
            type: 'bar',
            data: {
                labels: usernames,
                datasets: [
                    {
                        label: 'Runtime (ms)',
                        data: runtimes,
                        backgroundColor: 'rgba(59, 130, 246, 0.8)', // Blue
                        borderColor: 'rgba(59, 130, 246, 1)',
                        borderWidth: 2,
                        yAxisID: 'y'
                    },
                    {
                        label: 'Memory (MB)',
                        data: memories,
                        backgroundColor: 'rgba(168, 85, 247, 0.8)', // Purple
                        borderColor: 'rgba(168, 85, 247, 1)',
                        borderWidth: 2,
                        yAxisID: 'y1'
                    }
                ]
            },
            options: {
                font: {
                    family: 'Noto Sans'
                },
                responsive: true,
                interaction: {
                    mode: 'index',
                    intersect: false,
                },
                plugins: {
                    title: {
                        display: true,
                        text: 'Performance Comparison',
                        color: '#ffffff',
                        font: {
                            size: 20,
                            weight: 'bold'
                        }
                    },
                    legend: {
                        labels: {
                            color: '#ffffff',
                            font: {
                                size: 14
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        ticks: {
                            color: '#ffffff',
                            font: {
                                size: 12
                            }
                        },
                        grid: {
                            color: 'rgba(255, 255, 255, 0.1)'
                        }
                    },
                    y: {
                        type: 'linear',
                        display: true,
                        position: 'left',
                        title: {
                            display: true,
                            text: 'Runtime (ms)',
                            color: 'rgba(59, 130, 246, 1)',
                            font: {
                                size: 14,
                                weight: 'bold'
                            }
                        },
                        ticks: {
                            color: '#ffffff'
                        },
                        grid: {
                            color: 'rgba(255, 255, 255, 0.1)'
                        }
                    },
                    y1: {
                        type: 'linear',
                        display: true,
                        position: 'right',
                        title: {
                            display: true,
                            text: 'Memory (MB)',
                            color: 'rgba(168, 85, 247, 1)',
                            font: {
                                size: 14,
                                weight: 'bold'
                            }
                        },
                        ticks: {
                            color: '#ffffff'
                        },
                        grid: {
                            drawOnChartArea: false,
                            color: 'rgba(255, 255, 255, 0.1)'
                        }
                    }
                }
            }
        };

        // Generate chart image
        const imageBuffer = await chartJSNodeCanvas.renderToBuffer(configuration);

        // Create Discord attachment
        const attachment = new AttachmentBuilder(imageBuffer, {
            name: 'submission-chart.png'
        });

        return attachment;
    } catch (error) {
        logger.error('Error generating submission chart:', error);
        return null;
    }
}

/**
 * Map a submission count to a GitHub-style green color.
 * @param {number} count
 * @param {number} maxCount
 * @returns {string} CSS color string
 */
function activityColor(count, maxCount) {
    if (count === 0) return '#161b22';     // empty cell — matches bg
    const ratio = Math.min(count / Math.max(maxCount, 1), 1);
    if (ratio < 0.25) return '#0e4429';
    if (ratio < 0.50) return '#006d32';
    if (ratio < 0.75) return '#26a641';
    return '#39d353';
}

/**
 * Generate a GitHub-style heatmap chart for LeetCode activity.
 *
 * Layout: columns = weeks (oldest → newest), rows = days of week (Mon top → Sun bottom).
 *
 * @param {string}  username     - LeetCode username
 * @param {Object}  calendarData - Calendar payload from the LeetCode API
 * @param {number}  rangeDays    - Number of days to show (7 / 30 / 90)
 * @returns {Promise<AttachmentBuilder|null>}
 */
async function generateCalendarChart(username, calendarData, rangeDays) {
    try {
        const submissionCalendar = calendarData?.submissionCalendar || calendarData?.calendar;
        if (!submissionCalendar || typeof submissionCalendar !== 'object') {
            return null;
        }

        // ── 1. Build activityMap: ISO date → submission count ────────────────
        const activityMap = new Map();
        for (const [key, count] of Object.entries(submissionCalendar)) {
            const ts = parseInt(key, 10);
            if (Number.isNaN(ts)) continue;
            const iso = new Date(ts * 1000).toISOString().slice(0, 10);
            activityMap.set(iso, count);
        }

        // ── 2. Generate the day list (oldest → today) ────────────────────────
        const today = new Date();
        today.setUTCHours(0, 0, 0, 0);

        const days = [];
        for (let i = rangeDays - 1; i >= 0; i--) {
            const d = new Date(today);
            d.setDate(today.getDate() - i);
            const iso = d.toISOString().slice(0, 10);
            days.push({ date: d, iso, count: activityMap.get(iso) || 0 });
        }

        const maxCount = Math.max(...days.map(d => d.count), 1);

        // ── 3. Build matrix data points ──────────────────────────────────────
        const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
        const firstDow = (days[0].date.getUTCDay() + 6) % 7;

        const matrixData = days.map((day, idx) => {
            const dow = (day.date.getUTCDay() + 6) % 7; // 0=Mon … 6=Sun
            const weekIndex = Math.floor((firstDow + idx) / 7);
            return { x: weekIndex, y: dow, v: day.count, iso: day.iso };
        });

        // ── 4. Calculate totalWeeks FIRST, then derive cell size ─────────────
        // This ensures small ranges (7 days = 1-2 weeks) get large readable cells
        // instead of a tiny canvas.
        const totalWeeks = Math.max(...matrixData.map(d => d.x)) + 1;

        const padLeft    = 56;   // room for day labels
        const padRight   = 24;
        const padTop     = 60;   // room for title + month labels
        const padBottom  = 30;
        const cellGap    = 4;
        const MIN_CANVAS_WIDTH = 500;
        const MAX_CELL_SIZE    = 40;
        const MIN_CELL_SIZE    = 14;

        // Fill at least MIN_CANVAS_WIDTH: scale cell size up for few weeks,
        // scale down gracefully for many weeks (90-day / 365-day ranges).
        const availableForCells = MIN_CANVAS_WIDTH - padLeft - padRight;
        const cellSize = Math.min(
            MAX_CELL_SIZE,
            Math.max(
                MIN_CELL_SIZE,
                Math.floor((availableForCells - (totalWeeks - 1) * cellGap) / totalWeeks)
            )
        );
        const step = cellSize + cellGap;

        // Canvas is at least MIN_CANVAS_WIDTH wide; grows for large day ranges.
        const canvasWidth  = Math.max(MIN_CANVAS_WIDTH, padLeft + totalWeeks * step + padRight);
        const canvasHeight = padTop + 7 * step + padBottom;

        const heatmapCanvas = new ChartJSNodeCanvas({
            width: canvasWidth,
            height: canvasHeight,
            backgroundColour: '#0d1117',
            plugins: { modern: ['chartjs-chart-matrix'] }
        });

        // ── 5. Build month boundary labels ───────────────────────────────────
        const monthLabels = {}; // weekIndex → abbreviated month name
        for (const pt of matrixData) {
            const d = new Date(pt.iso);
            if (d.getUTCDate() <= 7) {
                const abbr = d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
                if (!Object.values(monthLabels).includes(abbr) || !monthLabels[pt.x]) {
                    monthLabels[pt.x] = abbr;
                }
            }
        }

        // ── 6. Chart configuration ───────────────────────────────────────────
        const configuration = {
            type: 'matrix',
            data: {
                datasets: [{
                    label: 'Submissions',
                    data: matrixData,
                    backgroundColor(ctx) {
                        const raw = ctx.dataset.data[ctx.dataIndex];
                        return raw ? activityColor(raw.v, maxCount) : '#161b22';
                    },
                    borderColor: '#0d1117',
                    borderWidth: 2,
                    borderRadius: 3,
                    width:  () => cellSize,
                    height: () => cellSize,
                }]
            },
            options: {
                responsive: false,
                animation: false,
                layout: {
                    padding: { left: padLeft, right: padRight, top: padTop, bottom: padBottom }
                },
                plugins: {
                    legend: { display: false },
                    title: {
                        display: true,
                        text: `${username}  ·  Last ${rangeDays} days`,
                        color: '#e6edf3',
                        font: { family: 'Noto Sans', size: 15, weight: 'bold' },
                        padding: { bottom: 6 }
                    },
                    tooltip: { enabled: false }
                },
                scales: {
                    x: {
                        type: 'linear',
                        min: -0.5,
                        max: totalWeeks - 0.5,
                        offset: false,
                        grid: { display: false },
                        border: { display: false },
                        ticks: {
                            color: '#8b949e',
                            font: { size: 11 },
                            maxRotation: 0,
                            callback(val) {
                                return monthLabels[val] || '';
                            },
                            stepSize: 1
                        }
                    },
                    y: {
                        type: 'linear',
                        min: -0.5,
                        max: 6.5,
                        reverse: false,
                        offset: false,
                        grid: { display: false },
                        border: { display: false },
                        ticks: {
                            color: '#8b949e',
                            font: { size: 11 },
                            stepSize: 1,
                            callback(val) {
                                // Only show Mon / Wed / Fri to avoid clutter
                                return [0, 2, 4].includes(val) ? DAY_LABELS[val] : '';
                            }
                        }
                    }
                }
            }
        };

        const imageBuffer = await heatmapCanvas.renderToBuffer(configuration);
        return new AttachmentBuilder(imageBuffer, { name: 'calendar-chart.png' });
    } catch (error) {
        logger.error('Error generating calendar chart:', error);
        return null;
    }
}

module.exports = { generateSubmissionChart, generateCalendarChart };