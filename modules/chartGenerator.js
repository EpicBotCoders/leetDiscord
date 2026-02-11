const { ChartJSNodeCanvas } = require('chartjs-node-canvas');
const { AttachmentBuilder } = require('discord.js');
const logger = require('./logger');

// Chart configuration
const width = 800;
const height = 500;
const chartJSNodeCanvas = new ChartJSNodeCanvas({
    width,
    height,
    backgroundColour: '#1e1e2e' // Dark background
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

module.exports = { generateSubmissionChart };
