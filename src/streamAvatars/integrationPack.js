const { loadThemePack, BUNDLED_THEME_PACK_DIR } = require('./themeRelease');
function resolveIntegrationPack({ candidatePackDir, themePackDir, required = false, defaultPackDir = BUNDLED_THEME_PACK_DIR } = {}) {
    if (candidatePackDir !== undefined && themePackDir !== undefined) throw new Error('Choose one theme pack: --candidate-pack or --theme-pack');
    let previewOnly = candidatePackDir !== undefined;
    let directory = previewOnly ? candidatePackDir : themePackDir;
    if (directory === undefined) {
        if (!required) return {};
        directory = defaultPackDir;
    }
    try {
        const { packRevision } = loadThemePack({ directory, previewOnly });
        return { candidatePackDir: previewOnly ? directory : undefined, themePackDir: previewOnly ? undefined : directory, packRevision };
    } catch (error) {
        throw new Error('Invalid or missing integration theme pack: ' + error.message + '. Build and import the matching ZIP, then use --candidate-pack <directory> for preview or --theme-pack <approved-directory>.', { cause: error });
    }
}
module.exports = { resolveIntegrationPack };
