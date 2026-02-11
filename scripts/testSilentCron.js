require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const { connectDB } = require('../modules/models/db');
const { getBestDailySubmission, parseDuration, parseMemory } = require('../modules/apiUtils');
const { PermissionsBitField } = require('discord.js');
const logger = require('../modules/logger');
const mongoose = require('mongoose');
const Guild = require('../modules/models/Guild');
const axios = require('axios');

async function testSilentCronWithSlug(problemSlug) {
    console.log(`🚀 Starting Silent Cron Test for problem: ${problemSlug}`);

    // 1. Connect to Database
    try {
        await connectDB();
        console.log('✅ Connected to MongoDB');
    } catch (error) {
        console.error('❌ Database connection failed:', error);
        process.exit(1);
    }

    // 2. Initialize Discord Client
    const client = new Client({
        intents: [
            GatewayIntentBits.Guilds,
            GatewayIntentBits.GuildMessages,
            GatewayIntentBits.GuildMembers,
            GatewayIntentBits.MessageContent
        ]
    });

    // 3. Login and Run Check
    try {
        await client.login(process.env.DISCORD_TOKEN);

        await new Promise(resolve => client.once('ready', resolve));
        console.log(`✅ Logged in and ready as ${client.user.tag}`);

        // Fetch problem details
        console.log(`⏳ Fetching problem details for: ${problemSlug}`);
        const problemDetails = await axios.get(`https://leetcode-api-pied.vercel.app/problem/${problemSlug}`);
        const problem = problemDetails.data;
        console.log(`✅ Problem: ${problem.title}`);

        // Get all guilds
        const guilds = await Guild.find({});
        console.log(`📋 Found ${guilds.length} guild(s)`);

        for (const guild of guilds) {
            const users = Object.fromEntries(guild.users);
            if (Object.keys(users).length === 0) {
                console.log(`⏩ Skipping guild ${guild.guildId} (no users)`);
                continue;
            }

            console.log(`\n🔍 Checking guild: ${guild.guildId}`);
            console.log(`   Users to check: ${Object.keys(users).length}`);

            // Collect submissions for this guild
            const submissionsData = [];

            for (const [username, discordId] of Object.entries(users)) {
                try {
                    console.log(`   • Checking ${username}...`);
                    const bestSubmission = await getBestDailySubmission(username, problemSlug);

                    if (bestSubmission) {
                        submissionsData.push({
                            username,
                            discordId,
                            submission: bestSubmission
                        });
                        console.log(`     ✅ Found submission: ${bestSubmission.runtime}`);
                    } else {
                        console.log(`     ⏭️  No accepted submission`);
                    }
                } catch (error) {
                    console.error(`     ❌ Error checking ${username}:`, error.message);
                }
            }

            // Post submission report if there are any submissions
            if (submissionsData.length > 0) {
                console.log(`\n📊 ${submissionsData.length} submission(s) found. Posting report...`);
                try {
                    await postSubmissionReport(client, guild, problem, submissionsData);
                    console.log('✅ Report posted successfully!');
                } catch (reportError) {
                    console.error('❌ Error posting report:', reportError.message);
                }
            } else {
                console.log(`⏩ No submissions to report for this guild`);
            }
        }

    } catch (error) {
        console.error('❌ Error during test execution:', error);
    } finally {
        // 4. Cleanup
        console.log('\n👋 Cleaning up...');
        client.destroy();
        await mongoose.connection.close();
        console.log('✅ Test completed');
        process.exit(0);
    }
}

// Helper function to format and post submission report (copied from scheduledTasks.js)
async function postSubmissionReport(client, guild, problem, submissionsData) {
    const channel = await client.channels.fetch(guild.channelId);
    if (!channel) {
        throw new Error(`Channel ${guild.channelId} not found`);
    }

    // Check permissions
    const botMember = await channel.guild.members.fetchMe();
    const permissions = channel.permissionsFor(botMember);
    if (!permissions?.has(PermissionsBitField.Flags.SendMessages)) {
        throw new Error(`No permission to send messages in channel ${channel.id}`);
    }

    // Sort submissions by runtime, then memory
    const sortedSubmissions = submissionsData.sort((a, b) => {
        const runtimeA = parseDuration(a.submission.runtime);
        const runtimeB = parseDuration(b.submission.runtime);

        if (runtimeA !== runtimeB) {
            return runtimeA - runtimeB;
        }

        const memoryA = parseMemory(a.submission.memory);
        const memoryB = parseMemory(b.submission.memory);
        return memoryA - memoryB;
    });

    // Build embed fields
    const medals = ['🥇', '🥈', '🥉'];
    const fields = sortedSubmissions.map((data, index) => {
        const medal = index < 3 ? medals[index] : '';
        const mention = data.discordId ? `<@${data.discordId}>` : data.username;
        const submissionUrl = `https://leetcode.com${data.submission.url}`;

        return {
            name: `**${index + 1}. ${data.username}** ${medal}`,
            value: `👤 ${mention}\n` +
                `🔗 [View Submission](${submissionUrl})\n` +
                `💻 ${data.submission.langName}\n` +
                `⚡ Runtime: ${data.submission.runtime}\n` +
                `🧠 Memory: ${data.submission.memory}`,
            inline: true
        };
    });

    const embed = {
        color: 0x00d9ff,
        title: `🏆 Daily Challenge Submissions (TEST)`,
        description: `**${problem.title}**\n\n**Ranked by Runtime**`,
        fields: fields,
        footer: {
            text: `${submissionsData.length} user${submissionsData.length > 1 ? 's' : ''} completed this challenge • TEST MODE`
        },
        timestamp: new Date()
    };

    await channel.send({ embeds: [embed] });
}

// Get problem slug from command line or use default
const problemSlug = process.argv[2];

if (!problemSlug) {
    console.error('❌ Please provide a problem slug as an argument');
    console.log('\nUsage: node scripts/testSilentCron.js <problem-slug>');
    console.log('Example: node scripts/testSilentCron.js longest-balanced-subarray-i');
    console.log('\nTo find yesterday\'s problem slug:');
    console.log('1. Visit https://leetcode.com/problemset/');
    console.log('2. Look for yesterday\'s daily challenge');
    console.log('3. Copy the slug from the URL (e.g., "two-sum" from /problems/two-sum/)');
    process.exit(1);
}

testSilentCronWithSlug(problemSlug);
