const { repositoryIdentity, loadReleasePrs } = require('./github');
const { renderReleaseNotes } = require('./render');

async function verifyConditions(_config, context) {
    repositoryIdentity(context.options.repositoryUrl);
    if (!context.env.GITHUB_TOKEN && !context.env.GH_TOKEN) {
        throw new Error('Set GITHUB_TOKEN or GH_TOKEN to read release PR metadata.');
    }
}

async function generateNotes(config, context) {
    const identity = repositoryIdentity(context.options.repositoryUrl);
    const prs = await loadReleasePrs({ ...identity, commits: context.commits,
        token: context.env.GITHUB_TOKEN || context.env.GH_TOKEN, fetchImpl: config.fetchImpl });
    return renderReleaseNotes({ ...identity, prs, commits: context.commits, lastRelease: context.lastRelease, nextRelease: context.nextRelease });
}

module.exports = { verifyConditions, generateNotes };
