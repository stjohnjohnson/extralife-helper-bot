const DEFAULT_TIMEZONE = 'America/Los_Angeles';
const DEFAULT_BOT_USERS = ['stjohnbot', 'streamelements'];

function assertTimezone(timezone) {
    try {
        new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date(0));
    } catch {
        throw new Error(`Invalid timezone: ${timezone}`);
    }
}

function parseInstant(value, option) {
    const timestamp = new Date(value);
    if (Number.isNaN(timestamp.getTime())) {
        throw new Error(`Invalid ${option} timestamp: ${value}`);
    }
    return timestamp.toISOString();
}

function parseArguments(args) {
    if (!args.length || args[0].startsWith('--')) {
        throw new Error('Usage: npm run analyze -- <log-file> [options]');
    }

    const result = {
        inputPath: args[0],
        outputDir: 'reports',
        timezone: DEFAULT_TIMEZONE,
        botUsers: [...DEFAULT_BOT_USERS],
        start: null,
        end: null
    };

    for (let index = 1; index < args.length; index += 1) {
        const option = args[index];
        const value = args[index + 1];
        if (!['--output-dir', '--timezone', '--bot-user', '--start', '--end'].includes(option)) {
            throw new Error(`Unknown option: ${option}`);
        }
        if (value === undefined || value.startsWith('--')) {
            throw new Error(`Missing value for ${option}`);
        }
        index += 1;

        if (option === '--output-dir') result.outputDir = value;
        if (option === '--timezone') result.timezone = value;
        if (option === '--bot-user') result.botUsers.push(value.toLowerCase());
        if (option === '--start') result.start = parseInstant(value, option);
        if (option === '--end') result.end = parseInstant(value, option);
    }

    assertTimezone(result.timezone);
    result.botUsers = [...new Set(result.botUsers)].sort();

    if (Boolean(result.start) !== Boolean(result.end)) {
        throw new Error('--start and --end must be provided together');
    }
    if (result.start && result.start >= result.end) {
        throw new Error('--start must be before --end');
    }

    return result;
}

module.exports = { DEFAULT_BOT_USERS, parseArguments };
