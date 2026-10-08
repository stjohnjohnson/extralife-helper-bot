const { v3 } = require('node-hue-api');
const { parseHueColor, rgbToHue } = require('./hueColors.js');

// Celebration colors in CIE xy coordinates
const CELEBRATION_COLORS = [
    { x: 0.2011, y: 0.4433 },  // ExtraLife blue #1AC1DD (in CIE xy coordinates)
    { x: 0.542, y: 0.303 },    // Red
    { x: 0.313, y: 0.330 }     // White
];

// Animation settings
const ANIMATION_DURATION = 5000; // 5 seconds total
const FLASH_INTERVAL = 300;      // Flash every 300ms for quick flashing
const RESTORE_DELAY = 100;       // Small delay between light restorations
const COLOR_COOLDOWN = 1000;
const PARTY_COOLDOWN = 60000;
const PARTY_DURATION = 15000;
const PARTY_INTERVAL = 1000;

/**
 * Hue Bridge Controller
 */
class HueController {
    constructor(config, logger) {
        this.config = config;
        this.logger = logger;
        this.api = null;
        this.group = null;
        this.connected = false;
        this.isCelebrating = false;
        this.activeEffect = null;
        this.colorWrite = null;
        this.nextColorAt = 0;
        this.nextPartyAt = 0;
        this.stopped = false;
        this.initialization = null;
        this.stopPromise = null;
    }

    /**
     * Initialize connection to Hue Bridge
     */
    initialize() {
        if (this.stopped) return Promise.resolve(false);
        if (!this.initialization) this.initialization = this.connect();
        return this.initialization;
    }

    async connect() {
        try {
            this.api = await v3.api.createLocal(this.config.hue.ipAddress)
                .connect(this.config.hue.username);
            if (this.stopped) return false;
            this.logger.info(`Connected to Hue Bridge at ${this.config.hue.ipAddress}`);

            // Verify the group exists
            const groups = await this.api.groups.getAll();
            if (this.stopped) return false;
            const targetGroup = groups.find(group => group.id === parseInt(this.config.hue.groupId));
            if (!targetGroup) {
                throw new Error(`Group ${this.config.hue.groupId} not found on Hue Bridge`);
            }

            this.group = targetGroup;
            this.connected = true;
            this.logger.info(`Found Hue Group: "${targetGroup.name}" (${targetGroup.lights.length} lights)`);
            return true;
        } catch (error) {
            this.logger.error('Failed to initialize Hue Bridge connection', { error: error.message });
            this.connected = false;
            return false;
        }
    }

    /**
     * Get all lights in the configured group
     */
    async getGroupLights() {
        if (!this.connected || !this.api || !this.group) {
            throw new Error('Hue Bridge not connected');
        }

        // The bridge applies group writes to its current membership, not our startup cache.
        this.group = await this.api.groups.getGroup(parseInt(this.config.hue.groupId));
        // Get detailed light information
        const lights = [];
        for (const lightId of this.group.lights) {
            try {
                const light = await this.api.lights.getLight(lightId);
                lights.push(light);
            } catch (error) {
                this.logger.warn(`Failed to get light ${lightId}`, { error: error.message });
            }
        }

        return lights;
    }

    /**
     * Save the current state of all lights
     */
    async saveLightStates(lights) {
        const states = new Map();

        for (const light of lights) {
            states.set(light.id, {
                on: light.state.on,
                bri: light.state.bri,
                colormode: light.state.colormode,
                xy: light.state.xy ? [...light.state.xy] : null,
                hue: light.state.hue,
                sat: light.state.sat,
                ct: light.state.ct
            });
        }

        return states;
    }

    /**
     * Restore lights to their saved states
     */
    async restoreLightStates(savedStates) {
        for (const [lightId, state] of savedStates) {
            try {
                const lightState = new v3.lightStates.LightState()
                    .on(state.on)
                    .bri(state.bri);

                // Restore color based on the original color mode
                if (state.colormode === 'xy' && state.xy) {
                    lightState.xy(state.xy[0], state.xy[1]);
                } else if (state.colormode === 'hs' && state.hue !== undefined && state.sat !== undefined) {
                    lightState.hue(state.hue).sat(state.sat);
                } else if (state.colormode === 'ct' && state.ct) {
                    lightState.ct(state.ct);
                }

                await this.api.lights.setLightState(lightId, lightState);

                // Small delay to prevent overwhelming the bridge
                await this.sleep(RESTORE_DELAY);
            } catch (error) {
                this.logger.warn(`Failed to restore light ${lightId}`, { error: error.message });
            }
        }
    }

    /**
     * Perform celebration light show
     */
    async celebrateDonation({ signal } = {}) {
        if (signal?.aborted) return;
        if (this.stopped || !this.connected) {
            this.logger.warn('Hue Bridge not connected, skipping celebration');
            return;
        }

        if (this.isCelebrating && (signal || this.activeEffect?.kind !== 'rehearsal')) {
            this.logger.info('Hue celebration already in progress, skipping');
            return;
        }

        const previous = this.activeEffect;
        this.isCelebrating = true;
        this.logger.info('Starting Hue celebration light show');
        const effect = this.createEffect(signal ? 'rehearsal' : 'donation');
        if (signal) {
            const cancel = () => { effect.abort.abort(); effect.resolveReady({ status: 'busy' }); };
            signal.addEventListener('abort', cancel, { once: true });
            effect.detachOwner = () => signal.removeEventListener('abort', cancel);
        }
        if (previous) {
            previous.restore = false;
            previous.abort.abort();
        }
        effect.done = this.runEffect(effect, previous);
        await effect.ready;
    }

    /** Admit viewer requests through the same controller on both platforms. */
    async requestColor(input) {
        if (!this.config.hue.chatControlEnabled) return { status: 'disabled' };
        if (this.stopped || !this.connected || !this.group) return { status: 'unavailable' };
        if (this.activeEffect || this.colorWrite) return { status: 'busy' };
        const party = typeof input === 'string' && input.trim().toLowerCase() === 'party';
        const color = party ? null : parseHueColor(input);
        if (!party && !color) return { status: 'invalid' };
        const now = Date.now();
        const retryAfterMs = (party ? this.nextPartyAt : this.nextColorAt) - now;
        if (retryAfterMs > 0) return { status: 'cooldown', retryAfterMs };

        if (party) {
            const effect = this.createEffect('party');
            effect.admittedAt = now;
            effect.done = this.runEffect(effect);
            return effect.ready;
        }

        this.nextColorAt = now + COLOR_COOLDOWN;
        // Deferring the I/O lets us reserve ownership before the first bridge call.
        const write = Promise.resolve().then(() => this.setGroupColor(color));
        this.colorWrite = write;
        try {
            await write;
            return { status: 'applied' };
        } catch (error) {
            this.logger.warn('Failed to set Hue color', { error: error.message });
            return { status: 'unavailable' };
        } finally {
            this.colorWrite = null;
        }
    }

    createEffect(kind) {
        const effect = { kind, abort: new AbortController(), restore: true, savedStates: null, lights: null };
        effect.ready = new Promise(resolve => { effect.resolveReady = resolve; });
        this.activeEffect = effect;
        return effect;
    }

    /** Drain earlier writes and transfer the original snapshot on donation takeover. */
    async runEffect(effect, previous = null) {
        let started = false;
        try {
            if (previous) await previous.done;
            if (this.colorWrite) await this.colorWrite.catch(() => {});
            if (effect.abort.signal.aborted && !previous?.savedStates) return;
            if (previous?.savedStates) {
                effect.lights = previous.lights;
                effect.savedStates = previous.savedStates;
            } else {
                effect.lights = await this.getGroupLights();
                if (effect.abort.signal.aborted) return;
                if (!effect.lights.length) {
                    this.logger.warn('No lights found in group, skipping celebration');
                    return;
                }
                // A group party would also change unreadable lights, which we could not restore.
                if (effect.kind === 'party' && effect.lights.length !== this.group.lights.length) return;
                effect.savedStates = await this.saveLightStates(effect.lights);
            }
            if (effect.abort.signal.aborted) return;
            started = true;
            if (effect.kind === 'party') {
                await this.runPartyAnimation(effect);
            } else {
                effect.resolveReady({ status: 'applied' });
                await this.runCelebrationAnimation(effect.lights, effect.abort.signal);
            }
        } catch (error) {
            const message = effect.kind === 'party' ? 'Hue party failed'
                : started ? 'Celebration animation failed' : 'Failed to start Hue celebration';
            this.logger.error(message, { error: error.message });
        } finally {
            effect.detachOwner?.();
            effect.resolveReady({ status: effect.abort.signal.aborted ? 'busy' : 'unavailable' });
            if (effect.restore && effect.savedStates) {
                try {
                    await this.restoreLightStates(effect.savedStates);
                    this.logger.info(`Hue ${effect.kind === 'party' ? 'party' : 'celebration'} completed, lights restored`);
                } catch (error) {
                    this.logger.error('Failed to restore light states after celebration', { error: error.message });
                }
            }
            // A canceled party must never release the donation's newer ownership.
            if (this.activeEffect === effect) {
                this.activeEffect = null;
                this.isCelebrating = false;
            }
        }
    }

    async setGroupColor(color) {
        const { hue, saturation, brightness } = rgbToHue(color);
        const state = new v3.lightStates.GroupLightState().hue(hue).saturation(saturation).brightness(brightness);
        await this.api.groups.setGroupState(this.config.hue.groupId, state);
    }

    async runPartyAnimation(effect) {
        const endTime = Date.now() + PARTY_DURATION;
        let firstFrame = true;
        while (!effect.abort.signal.aborted && Date.now() < endTime) {
            await this.setGroupColor(parseHueColor('random'));
            if (effect.abort.signal.aborted) return;
            if (firstFrame) {
                this.nextPartyAt = effect.admittedAt + PARTY_COOLDOWN;
                effect.resolveReady({ status: 'party' });
                firstFrame = false;
            }
            await this.sleep(Math.min(PARTY_INTERVAL, Math.max(0, endTime - Date.now())), effect.abort.signal);
        }
    }

    /** Stop accepting effects, drain I/O, then let the owning effect restore its snapshot. */
    stop() {
        if (this.stopPromise) return this.stopPromise;
        this.stopped = true;
        const effect = this.activeEffect;
        effect?.abort.abort();
        this.stopPromise = (async () => {
            await this.initialization;
            if (this.colorWrite) await this.colorWrite.catch(() => {});
            await effect?.done;
            this.connected = false;
        })();
        return this.stopPromise;
    }

    /**
     * Run the celebration animation
     */
    async runCelebrationAnimation(lights, signal) {
        const endTime = Date.now() + ANIMATION_DURATION;

        while (!signal?.aborted && Date.now() < endTime) {
            // Flash all lights with random colors
            await this.flashLightsWithRandomColors(lights);

            // Wait before next flash
            if (signal) await this.sleep(FLASH_INTERVAL, signal);
            else await this.sleep(FLASH_INTERVAL);
        }
    }

    /**
     * Flash all lights with random colors
     */
    async flashLightsWithRandomColors(lights) {
        const promises = lights.map(async (light) => {
            try {
                // Pick a random color for each light
                const color = CELEBRATION_COLORS[Math.floor(Math.random() * CELEBRATION_COLORS.length)];

                const lightState = new v3.lightStates.LightState()
                    .on(true)
                    .brightness(100) // Maximum brightness
                    .xy(color.x, color.y);

                await this.api.lights.setLightState(light.id, lightState);
            } catch (error) {
                this.logger.warn(`Failed to flash light ${light.id}`, { error: error.message });
            }
        });

        await Promise.all(promises);
    }

    /**
     * Utility: Sleep for specified milliseconds
     */
    sleep(ms, signal) {
        if (signal?.aborted) return Promise.resolve();
        return new Promise(resolve => {
            const finish = () => {
                clearTimeout(timer);
                signal?.removeEventListener('abort', finish);
                resolve();
            };
            const timer = setTimeout(finish, ms);
            signal?.addEventListener('abort', finish, { once: true });
        });
    }
}

module.exports = { HueController };
