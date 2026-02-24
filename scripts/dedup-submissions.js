/**
 * dedup-submissions.js
 *
 * Two-pass cleanup for DailySubmission duplicates:
 *
 * PASS 1 — Exact duplicates
 *   Finds documents sharing { guildId, leetcodeUsername, questionSlug, date }
 *   and deletes all but the earliest _id.
 *
 * PASS 2 — Timezone-offset duplicates
 *   The server previously ran setHours(0,0,0,0) (local time) instead of
 *   setUTCHours(0,0,0,0), so on an IST server "today midnight" was stored as
 *   T18:30:00Z (the previous UTC day). This pass finds any doc whose date has
 *   a non-midnight UTC time component, computes the intended UTC-midnight date
 *   (next UTC day), checks if a correct T00:00:00Z doc exists for the same
 *   { guildId, leetcodeUsername, questionSlug }, and:
 *     - If a correct doc exists → delete the bad-date doc.
 *     - If no correct doc exists → fix the date in-place to UTC midnight.
 *
 * Usage:
 *   node scripts/dedup-submissions.js --dry-run   # preview only, no writes
 *   node scripts/dedup-submissions.js             # actually apply changes
 */

'use strict';

require('dotenv').config();
const mongoose = require('mongoose');
const DailySubmission = require('../modules/models/DailySubmission');

const DRY_RUN = process.argv.includes('--dry-run');

// ─── helpers ────────────────────────────────────────────────────────────────

function utcMidnight(date) {
    const d = new Date(date);
    d.setUTCHours(0, 0, 0, 0);
    return d;
}

function isUtcMidnight(date) {
    return date.getUTCHours() === 0 &&
        date.getUTCMinutes() === 0 &&
        date.getUTCSeconds() === 0 &&
        date.getUTCMilliseconds() === 0;
}

// ─── pass 1: exact duplicates ────────────────────────────────────────────────

async function passExactDuplicates() {
    console.log('── Pass 1: Exact duplicates ─────────────────────────────────\n');

    const groups = await DailySubmission.aggregate([
        { $sort: { _id: 1 } },
        {
            $group: {
                _id: {
                    guildId: '$guildId',
                    leetcodeUsername: '$leetcodeUsername',
                    questionSlug: '$questionSlug',
                    date: '$date'
                },
                keep: { $first: '$_id' },
                allIds: { $push: '$_id' },
                count: { $sum: 1 }
            }
        },
        { $match: { count: { $gt: 1 } } }
    ]);

    if (groups.length === 0) {
        console.log('✅ No exact duplicate groups found.\n');
        return 0;
    }

    console.log(`Found ${groups.length} exact duplicate group(s):\n`);

    let totalToDelete = 0;
    const allIdsToDelete = [];

    for (const group of groups) {
        const { guildId, leetcodeUsername, questionSlug, date } = group._id;
        const dupeIds = group.allIds.filter(id => !id.equals(group.keep));

        totalToDelete += dupeIds.length;
        allIdsToDelete.push(...dupeIds);

        console.log(`  Guild:    ${guildId}`);
        console.log(`  User:     ${leetcodeUsername}`);
        console.log(`  Slug:     ${questionSlug}`);
        console.log(`  Date:     ${new Date(date).toISOString()}`);
        console.log(`  Total:    ${group.count} docs  →  keep 1, delete ${dupeIds.length}`);
        console.log(`  Keep _id: ${group.keep}`);
        console.log(`  Del _ids: ${dupeIds.join(', ')}`);
        console.log('');
    }

    console.log(`─────────────────────────────────────────`);
    console.log(`Pass 1: documents to delete: ${totalToDelete}`);
    console.log(`─────────────────────────────────────────\n`);

    if (!DRY_RUN && totalToDelete > 0) {
        const result = await DailySubmission.deleteMany({ _id: { $in: allIdsToDelete } });
        console.log(`✅ Pass 1: Deleted ${result.deletedCount} exact duplicate(s).\n`);
    }

    return totalToDelete;
}

// ─── pass 2: timezone-offset duplicates ──────────────────────────────────────

async function passTimezoneDuplicates() {
    console.log('── Pass 2: Timezone-offset duplicates ───────────────────────\n');

    // Find all docs where the date is NOT at UTC midnight
    const badDocs = await DailySubmission.find({
        $expr: {
            $ne: [
                '$date',
                {
                    $dateTrunc: { date: '$date', unit: 'day' }
                }
            ]
        }
    }).lean();

    if (badDocs.length === 0) {
        console.log('✅ No timezone-offset documents found.\n');
        return { deleted: 0, fixed: 0 };
    }

    console.log(`Found ${badDocs.length} document(s) with non-midnight UTC dates:\n`);

    let toDelete = 0;
    let toFix = 0;
    const deleteIds = [];
    const fixes = []; // { id, newDate }

    for (const doc of badDocs) {
        // The intended date is the next UTC day (since IST midnight = T18:30Z = next UTC day T00:00Z)
        const storedDate = new Date(doc.date);
        const storedMidnight = utcMidnight(storedDate);

        // Candidate correct dates: same UTC day midnight OR next UTC day midnight
        // For IST (+5:30), local midnight = T18:30Z, so the "intended" UTC midnight is
        // the NEXT UTC day. But to be safe, we check which direction makes sense:
        // if stored time is >= 12:00 UTC, the intended date is +1 day; otherwise -1 day.
        const hoursUTC = storedDate.getUTCHours() + storedDate.getUTCMinutes() / 60;
        const intendedDate = new Date(storedMidnight);
        if (hoursUTC >= 12) {
            intendedDate.setUTCDate(intendedDate.getUTCDate() + 1);
        }
        // (if < 12 UTC, the same-day midnight is the intended date — storedMidnight is already correct)

        console.log(`  _id:      ${doc._id}`);
        console.log(`  Guild:    ${doc.guildId}`);
        console.log(`  User:     ${doc.leetcodeUsername}`);
        console.log(`  Slug:     ${doc.questionSlug}`);
        console.log(`  Bad date: ${storedDate.toISOString()}`);
        console.log(`  Intended: ${intendedDate.toISOString()}`);

        // Check if a correct doc already exists for the intended date
        const correct = await DailySubmission.findOne({
            guildId: doc.guildId,
            leetcodeUsername: doc.leetcodeUsername,
            questionSlug: doc.questionSlug,
            date: intendedDate
        }).lean();

        if (correct) {
            console.log(`  Action:   DELETE (correct doc ${correct._id} already exists)\n`);
            toDelete++;
            deleteIds.push(doc._id);
        } else {
            console.log(`  Action:   FIX date to ${intendedDate.toISOString()}\n`);
            toFix++;
            fixes.push({ id: doc._id, newDate: intendedDate });
        }
    }

    console.log(`─────────────────────────────────────────`);
    console.log(`Pass 2: ${toDelete} to delete, ${toFix} to fix in-place`);
    console.log(`─────────────────────────────────────────\n`);

    if (!DRY_RUN) {
        if (deleteIds.length > 0) {
            const result = await DailySubmission.deleteMany({ _id: { $in: deleteIds } });
            console.log(`✅ Pass 2: Deleted ${result.deletedCount} timezone-offset duplicate(s).`);
        }
        for (const { id, newDate } of fixes) {
            await DailySubmission.updateOne({ _id: id }, { $set: { date: newDate } });
        }
        if (fixes.length > 0) {
            console.log(`✅ Pass 2: Fixed ${fixes.length} document(s) with corrected UTC-midnight dates.`);
        }
        console.log('');
    }

    return { deleted: toDelete, fixed: toFix };
}

// ─── main ────────────────────────────────────────────────────────────────────

async function main() {
    console.log(`\n=== DailySubmission Dedup Script ===`);
    console.log(`Mode: ${DRY_RUN ? '🔍 DRY RUN (no writes)' : '🗑️  LIVE (will delete/update)'}\n`);

    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB.\n');

    const exactDeleted = await passExactDuplicates();
    const { deleted: tzDeleted, fixed: tzFixed } = await passTimezoneDuplicates();

    const totalDeleted = exactDeleted + tzDeleted;
    console.log(`═══════════════════════════════════════════`);
    if (DRY_RUN) {
        console.log(`🔍 Dry run complete.`);
        console.log(`   Would delete: ${totalDeleted} document(s)`);
        console.log(`   Would fix:    ${tzFixed} document(s)`);
        console.log(`   Re-run without --dry-run to apply.\n`);
    } else {
        console.log(`✅ Done. Deleted: ${totalDeleted}, Fixed: ${tzFixed}\n`);
    }

    await mongoose.disconnect();
    console.log('Disconnected from MongoDB.');
}

main().catch(err => {
    console.error('Script failed:', err);
    process.exit(1);
});
