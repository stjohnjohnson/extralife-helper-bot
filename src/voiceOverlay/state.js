function createOverlayState({ client, channel, excludedUserId, releaseDelayMs = 180 }) {
    const members = new Map();
    const timers = new Map();
    const listeners = new Set();
    let active = true;
    let ready = false;
    let revision = 0;
    let previous = '';
    const muted = id => Boolean(channel.guild.voiceStates.cache.get(id)?.mute);
    const getSnapshot = () => ({ ready, revision, members: ready ? [...members.values()].map(member => ({ id: member.id, speaking: member.speaking,
        avatarUrl: member.speaking ? member.animatedAvatarUrl : member.staticAvatarUrl })) : [] });
    function publish() {
        const snapshot = getSnapshot();
        const key = JSON.stringify({ ready: snapshot.ready, members: snapshot.members });
        if (key === previous) return;
        previous = key;
        revision++;
        for (const listener of listeners) listener(getSnapshot());
    }
    function cancel(id) {
        clearTimeout(timers.get(id));
        timers.delete(id);
    }
    function refresh() {
        if (!active) return;
        for (const id of members.keys()) {
            if (!channel.members.has(id)) { cancel(id); members.delete(id); }
        }
        for (const [id, member] of channel.members) {
            if (id === excludedUserId || id === client.user?.id) continue;
            const existing = members.get(id);
            const staticAvatarUrl = member.displayAvatarURL({ extension: 'png', size: 128, forceStatic: true });
            const animatedAvatarUrl = member.displayAvatarURL({ extension: 'png', size: 128 });
            members.set(id, { id, staticAvatarUrl, animatedAvatarUrl, speaking: Boolean(existing?.speaking && !muted(id)) });
            if (muted(id)) cancel(id);
        }
        publish();
    }
    // Seed deterministically; subsequent joins append while existing slots remain stable.
    for (const id of [...channel.members.keys()].sort()) {
        if (id !== excludedUserId && id !== client.user?.id) {
            members.set(id, { id, staticAvatarUrl: '', animatedAvatarUrl: '', speaking: false });
        }
    }
    function setReady(value) {
        if (!active) return;
        ready = value;
        if (!ready) {
            for (const [id, member] of members) { cancel(id); member.speaking = false; }
        }
        refresh();
    }
    function setSpeaking(id, speaking) {
        if (!active || !ready || !members.has(id) || muted(id)) return;
        cancel(id);
        if (speaking) { members.get(id).speaking = true; publish(); }
        else timers.set(id, setTimeout(() => {
            timers.delete(id);
            if (active && members.has(id)) { members.get(id).speaking = false; publish(); }
        }, releaseDelayMs));
    }
    const onVoice = (oldState, newState) => {
        if ((oldState.guild?.id === channel.guild.id || newState.guild?.id === channel.guild.id) &&
            (oldState.channelId === channel.id || newState.channelId === channel.id)) refresh();
    };
    const onMember = (oldMember, newMember) => {
        if (newMember.guild.id === channel.guild.id && channel.members.has(newMember.id)) refresh();
    };
    const onUser = (oldUser, newUser) => { if (channel.members.has(newUser.id)) refresh(); };
    client.on('voiceStateUpdate', onVoice);
    client.on('guildMemberUpdate', onMember);
    client.on('userUpdate', onUser);
    refresh();
    return {
        getSnapshot, setReady, setSpeaking,
        subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
        stop() {
            if (!active) return;
            setReady(false);
            active = false;
            client.removeListener('voiceStateUpdate', onVoice);
            client.removeListener('guildMemberUpdate', onMember);
            client.removeListener('userUpdate', onUser);
            listeners.clear();
        }
    };
}
module.exports = { createOverlayState };
