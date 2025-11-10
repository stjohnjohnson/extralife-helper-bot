const { v3 } = require('node-hue-api');

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
    }

    /**
     * Initialize connection to Hue Bridge
     */
    async initialize() {
        try {
            this.api = await v3.api.createLocal(this.config.hue.ipAddress)
                .connect(this.config.hue.username);
            this.connected = true;
            this.logger.info(`Connected to Hue Bridge at ${this.config.hue.ipAddress}`);

            // Verify the group exists
            const groups = await this.api.groups.getAll();
            const targetGroup = groups.find(group => group.id === parseInt(this.config.hue.groupId));
            if (!targetGroup) {
                throw new Error(`Group ${this.config.hue.groupId} not found on Hue Bridge`);
            }

            this.group = targetGroup;
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
    async celebrateDonation() {
        if (!this.connected) {
            this.logger.warn('Hue Bridge not connected, skipping celebration');
            return;
        }

        if (this.isCelebrating) {
            this.logger.info('Hue celebration already in progress, skipping');
            return;
        }

        try {
            this.isCelebrating = true;
            this.logger.info('Starting Hue celebration light show');

            // Get all lights in the group
            const lights = await this.getGroupLights();
            if (lights.length === 0) {
                this.logger.warn('No lights found in group, skipping celebration');
                this.isCelebrating = false;
                return;
            }

            // Save current states
            const savedStates = await this.saveLightStates(lights);

            // Start the celebration animation
            const animationPromise = this.runCelebrationAnimation(lights);

            // Set a timeout to restore states after animation duration
            setTimeout(async () => {
                try {
                    await this.restoreLightStates(savedStates);
                    this.logger.info('Hue celebration completed, lights restored');
                } catch (error) {
                    this.logger.error('Failed to restore light states after celebration', { error: error.message });
                } finally {
                    this.isCelebrating = false;
                }
            }, ANIMATION_DURATION);

            // Don't await the animation to avoid blocking donation processing
            animationPromise.catch(error => {
                this.logger.error('Celebration animation failed', { error: error.message });
            });

        } catch (error) {
            this.logger.error('Failed to start Hue celebration', { error: error.message });
            this.isCelebrating = false;
        }
    }

    /**
     * Run the celebration animation
     */
    async runCelebrationAnimation(lights) {
        const endTime = Date.now() + ANIMATION_DURATION;

        while (Date.now() < endTime) {
            // Flash all lights with random colors
            await this.flashLightsWithRandomColors(lights);

            // Wait before next flash
            await this.sleep(FLASH_INTERVAL);
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
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = { HueController };