const { resolve } = require('node:path');
const { loadThemePack } = require('./themeRelease');
const localPreviewPack = resolve(__dirname, '../../reports/stream-avatars-artwork/scenery-preview-pack');
function resolveIntegrationPack({ candidatePackDir, themePackDir, environmentPackDir, required = false, defaultPackDir = localPreviewPack } = {}) {
    if (candidatePackDir !== undefined && themePackDir !== undefined) throw new Error('Choose one theme pack: --candidate-pack or --theme-pack');
    let previewOnly = candidatePackDir !== undefined;
    let directory = previewOnly ? candidatePackDir : themePackDir;
    if (directory === undefined && environmentPackDir !== undefined) directory = environmentPackDir;
    if (directory === undefined) {
        if (!required) return {};
        directory = defaultPackDir; previewOnly = true;
    }
    try {
        const { packRevision } = loadThemePack({ directory, previewOnly });
        return { candidatePackDir: previewOnly ? directory : undefined, themePackDir: previewOnly ? undefined : directory, packRevision };
    } catch (error) {
        throw new Error('Invalid or missing integration theme pack: ' + error.message + '. Build and import the matching ZIP, then use --candidate-pack <directory> for preview or --theme-pack <approved-directory>.', { cause: error });
    }
}
module.exports = { resolveIntegrationPack };
