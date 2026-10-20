const PARTICIPANTS = 'https://dd.extra-life.org/api/participants/';

function participantEndpoint(participantId) {
    return PARTICIPANTS + encodeURIComponent(String(participantId));
}

async function getUserInfo(participantId) {
    const response = await fetch(participantEndpoint(participantId) + '?version=1.4', {
        signal: AbortSignal.timeout(10000)
    });
    if (response.status !== 200) throw new Error('Extra Life API status ' + response.status);
    const data = await response.json();
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid Extra Life participant response');
    return data;
}

module.exports = { participantEndpoint, getUserInfo };
