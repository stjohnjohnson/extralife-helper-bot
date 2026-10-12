module.exports = {
    'branches': ['main'],
    'plugins': [
        '@semantic-release/commit-analyzer',
        [
            '@semantic-release/release-notes-generator',
            { 'writerOpts': require('./scripts/release-notes')() }
        ],
        '@semantic-release/changelog',
        [
            '@semantic-release/npm',
            {
                'npmPublish': false
            }
        ],
        '@semantic-release/github',
        [
            '@semantic-release/git',
            {
                'assets': ['package.json', 'package-lock.json', 'CHANGELOG.md'],
                'message': 'chore(release): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}'
            }
        ]
    ]
};
