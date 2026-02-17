const { sortSubmissionsByPerformance, buildRankedFields } = require('../leaderboardUtils');

jest.mock('../apiUtils', () => ({
    parseDuration: jest.fn((str) => {
        if (!str) return Infinity;
        const m = str.match(/(\\d+(?:\\.\\d+)?)\\s*ms/);
        return m ? parseFloat(m[1]) : Infinity;
    }),
    parseMemory: jest.fn((str) => {
        if (!str) return Infinity;
        const m = str.match(/(\\d+(?:\\.\\d+)?)\\s*MB/);
        return m ? parseFloat(m[1]) : Infinity;
    })
}));

describe('leaderboardUtils', () => {
    describe('sortSubmissionsByPerformance', () => {
        it('sorts by runtime then memory ascending', () => {
            const submissions = [
                {
                    username: 'userB',
                    submission: { runtime: '200 ms', memory: '20.0 MB' }
                },
                {
                    username: 'userA',
                    submission: { runtime: '100 ms', memory: '25.0 MB' }
                },
                {
                    username: 'userC',
                    submission: { runtime: '100 ms', memory: '15.0 MB' }
                }
            ];

            const sorted = sortSubmissionsByPerformance(submissions.slice());
            expect(sorted.map(s => s.username)).toEqual(['userC', 'userA', 'userB']);
        });
    });

    describe('buildRankedFields', () => {
        it('adds medals and formats submission-based rows', () => {
            const rows = [
                {
                    username: 'topUser',
                    discordId: '123',
                    submission: {
                        url: '/submissions/detail/1/',
                        langName: 'JavaScript',
                        runtime: '100 ms',
                        memory: '20.0 MB'
                    }
                },
                {
                    username: 'secondUser',
                    discordId: null,
                    submission: {
                        url: '/submissions/detail/2/',
                        langName: 'Python',
                        runtime: '110 ms',
                        memory: '21.0 MB'
                    }
                },
                {
                    username: 'thirdUser',
                    discordId: '456',
                    submission: {
                        url: '/submissions/detail/3/',
                        langName: 'C++',
                        runtime: '120 ms',
                        memory: '22.0 MB'
                    }
                },
                {
                    username: 'fourthUser',
                    discordId: null,
                    submission: {
                        url: '/submissions/detail/4/',
                        langName: 'Go',
                        runtime: '130 ms',
                        memory: '23.0 MB'
                    }
                }
            ];

            const fields = buildRankedFields(rows);

            expect(fields).toHaveLength(4);
            expect(fields[0].name).toContain('🥇');
            expect(fields[1].name).toContain('🥈');
            expect(fields[2].name).toContain('🥉');
            expect(fields[3].name).not.toContain('🥇');
            expect(fields[3].name).not.toContain('🥈');
            expect(fields[3].name).not.toContain('🥉');

            expect(fields[0].value).toContain('<@123>');
            expect(fields[1].value).toContain('secondUser');
            expect(fields[0].value).toContain('[View Submission]');
        });

        it('formats generic value rows when no submission is present', () => {
            const rows = [
                { username: 'user1', discordId: '123', value: 10 },
                { username: 'user2', discordId: null, value: 5 }
            ];

            const fields = buildRankedFields(rows, (row) => `Value: ${row.value}`);
            expect(fields[0].value).toContain('<@123>');
            expect(fields[0].value).toContain('Value: 10');
            expect(fields[1].value).toContain('user2');
            expect(fields[1].value).toContain('Value: 5');
        });
    });
});


