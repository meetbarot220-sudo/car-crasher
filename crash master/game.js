/**
 * 90 SECOND SURVIVAL - Full 3D Perspective Arcade Driving Survival Engine
 * Features:
 * - Convincing 3D Road Perspective with vanishing point & distance scaling
 * - 3D Solid Arcade Vehicles: realistic proportions, visible side surfaces, shaded windows,
 *   bumpers, 3D wheels with rims, contact shadows, body highlights, and suspension roll
 * - Approaching traffic smoothly grows as it nears the player
 * - 3D Environment: Raised curbs, sidewalks with visible height, roadside barriers,
 *   layered 3D trees with multi-tiered canopies, polyhedral boulders, and 3D buildings
 * - 3D Lighting & Shadows: directional sunlight, ambient shading, ground contact shadows
 * - Unified Depth Sorting (back-to-front rendering) for correct 3D occlusion
 * - Mathematically exact near-plane line clipping for seamless road corridors
 * - Gameplay Systems (100% PRESERVED):
 *   * 10,000 Score Survival System (Survive 90.0s while protecting score)
 *   * Progressive Pursuit Heat System (5 tiers: LOW to MAXIMUM)
 *   * Intercept Targeting Police Pursuit AI (Predictive trajectory cutoff & obstacle unsticking)
 *   * Chunk-based infinite procedural world underneath
 *   * Automatic smooth player acceleration (0 -> 100 km/h in 3s)
 *   * Surface-based dynamic speeds (Road 100 km/h, Curb 82 km/h, Grass 65 km/h)
 *   * Clean result modal & glassmorphic arcade HUD
 *   * Rock-solid 60 FPS HTML5 Canvas 2D performance
 */

(function () {
    'use strict';

    // =========================================================================
    // SECTION 1: GLOBAL CONFIGURATION, SCORE DAMAGE & 3D CAMERA PARAMETERS
    // =========================================================================
    const CONFIG = {
        CHUNK_SIZE: 640,             // Size of each procedural chunk (640x640px)
        CHUNK_RADIUS: 2,             // Active chunk radius (5x5 grid = 25 chunks in memory)
        ROAD_WIDTH: 110,             // Total 2-lane road width (55px per lane)
        STARTING_SCORE: 10000,       // 10,000 Score budget
        RUN_DURATION: 90.0,          // Exactly 90.0 seconds survival objective
        DAMAGE_DEBOUNCE: 0.20,       // 200ms collision damage cooldown
        DESPAWN_DISTANCE: 1400,      // Max distance before recycling off-screen
        MIN_SPAWN_DIST: 520,         // Spawn buffer
        MAX_SPAWN_DIST: 980          // Max distance from player to spawn
    };

    // 3D Perspective Camera Configuration
    const CAM = {
        FOCAL: 380,                  // Perspective focal length
        D_BACK: 240,                 // Camera distance pulled behind the player
        H_EYE: 180,                  // Camera eye elevation above ground plane
        VP_Y_RATIO: 0.36,            // Vanishing point horizon height ratio on canvas (36% from top)
        MAX_DRAW_DIST: 1400,         // Max forward render distance for perspective
        NEAR_Z: 20                   // Near clipping plane
    };

    // Score Damage Brackets for the 10,000 score system
    const SCORE_DAMAGE_BRACKETS = {
        LIGHT_MIN: 160,
        LIGHT_MAX: 260,
        NORMAL_MIN: 320,
        NORMAL_MAX: 480,
        HEAVY_MIN: 540,
        HEAVY_MAX: 780,
        CRUSH_MIN: 820,
        CRUSH_MAX: 1180
    };

    // Progressive Pursuit Heat Tiers across 90s (Smooth 0-20-40-60-75s progression, +10% difficulty & increased traffic)
    const INTENSITY_TIERS = [
        { time: 0,  maxPolice: 1, maxTraffic: 11, policeSpeed: 330, heatLabel: 'HEATWAVE: LOW',       heatStars: '★☆☆☆☆' },
        { time: 20, maxPolice: 2, maxTraffic: 14, policeSpeed: 350, heatLabel: 'HEATWAVE: MODERATE',  heatStars: '★★☆☆☆' },
        { time: 40, maxPolice: 3, maxTraffic: 15, policeSpeed: 368, heatLabel: 'HEATWAVE: STRONGER',  heatStars: '★★★☆☆' },
        { time: 60, maxPolice: 3, maxTraffic: 16, policeSpeed: 382, heatLabel: 'HEATWAVE: HIGH',      heatStars: '★★★★☆' },
        { time: 75, maxPolice: 4, maxTraffic: 18, policeSpeed: 395, heatLabel: 'HEATWAVE: VERY HIGH', heatStars: '★★★★★' }
    ];

    // Rich Architectural Building Palettes
    const BUILDING_PALETTES = [
        { roof: '#1e293b', front: '#334155', side: '#0f172a', trim: '#475569', accent: '#38bdf8', winColor: '#bae6fd', type: 'commercial' },
        { roof: '#334155', front: '#475569', side: '#1e293b', trim: '#64748b', accent: '#f59e0b', winColor: '#fef08a', type: 'apartments' },
        { roof: '#1f2937', front: '#374151', side: '#111827', trim: '#4b5563', accent: '#10b981', winColor: '#a7f3d0', type: 'office' },
        { roof: '#27272a', front: '#3f3f46', side: '#18181b', trim: '#52525b', accent: '#ec4899', winColor: '#fbcfe8', type: 'shopping' },
        { roof: '#382319', front: '#4e3323', side: '#23150e', trim: '#6e4732', accent: '#ea580c', winColor: '#fed7aa', type: 'brick' }
    ];

    // =========================================================================
    // SECTION 2: AUDIO SYNTHESIZER (WEB AUDIO API)
    // =========================================================================
    class SoundSynthesizer {
        constructor() {
            this.ctx = null;
            this.initialized = false;
            this.engineGain = null;
            this.engineOsc = null;
            this.sirenOsc = null;
            this.sirenGain = null;
            this.muted = false;
            this.activeNodes = new Set();
        }

        init() {
            if (this.initialized) {
                if (this.ctx && this.ctx.state === 'suspended') {
                    this.ctx.resume().catch(() => {});
                }
                return;
            }
            try {
                const AudioCtx = window.AudioContext || window.webkitAudioContext;
                if (!AudioCtx) return;
                this.ctx = new AudioCtx();

                // Engine drone (starts silent at gain 0 until gameplay starts)
                this.engineOsc = this.ctx.createOscillator();
                this.engineGain = this.ctx.createGain();
                this.engineOsc.type = 'sawtooth';
                this.engineOsc.frequency.setValueAtTime(55, this.ctx.currentTime);
                this.engineGain.gain.setValueAtTime(0, this.ctx.currentTime);

                const filter = this.ctx.createBiquadFilter();
                filter.type = 'lowpass';
                filter.frequency.setValueAtTime(160, this.ctx.currentTime);

                this.engineOsc.connect(filter);
                filter.connect(this.engineGain);
                this.engineGain.connect(this.ctx.destination);
                this.engineOsc.start();

                // Police siren synth (starts muted at gain 0)
                this.sirenOsc = this.ctx.createOscillator();
                this.sirenGain = this.ctx.createGain();
                this.sirenOsc.type = 'sine';
                this.sirenOsc.frequency.setValueAtTime(650, this.ctx.currentTime);
                this.sirenGain.gain.setValueAtTime(0, this.ctx.currentTime);
                this.sirenOsc.connect(this.sirenGain);
                this.sirenGain.connect(this.ctx.destination);
                this.sirenOsc.start();

                this.initialized = true;
                if (this.ctx.state === 'suspended') {
                    this.ctx.resume().catch(() => {});
                }
            } catch (e) {
                console.warn('AudioContext init error', e);
            }
        }

        unlock() {
            this.init();
            if (this.ctx && this.ctx.state === 'suspended') {
                this.ctx.resume().catch(() => {});
            }
        }

        startGameplayAudio() {
            if (!this.initialized || this.muted || !this.ctx) return;
            try {
                if (this.ctx.state === 'suspended') {
                    this.ctx.resume().catch(() => {});
                }
                const now = this.ctx.currentTime;
                if (this.engineGain) {
                    this.engineGain.gain.cancelScheduledValues(now);
                    this.engineGain.gain.setValueAtTime(0.035, now);
                }
                if (this.engineOsc) {
                    this.engineOsc.frequency.cancelScheduledValues(now);
                    this.engineOsc.frequency.setValueAtTime(55, now);
                }
                if (this.sirenGain) {
                    this.sirenGain.gain.cancelScheduledValues(now);
                    this.sirenGain.gain.setValueAtTime(0, now);
                }
            } catch (e) {}
        }

        stopAllGameplaySounds() {
            if (!this.initialized || !this.ctx) return;
            try {
                const now = this.ctx.currentTime;
                // Immediately silence engine
                if (this.engineGain) {
                    this.engineGain.gain.cancelScheduledValues(now);
                    this.engineGain.gain.setValueAtTime(0, now);
                }
                // Immediately silence siren / beeps
                if (this.sirenGain) {
                    this.sirenGain.gain.cancelScheduledValues(now);
                    this.sirenGain.gain.setValueAtTime(0, now);
                }
                // Stop & disconnect any temporary active nodes
                for (const node of this.activeNodes) {
                    try {
                        if (node.stop) node.stop();
                        if (node.disconnect) node.disconnect();
                    } catch (e) {}
                }
                this.activeNodes.clear();
            } catch (e) {}
        }

        reset() {
            this.stopAllGameplaySounds();
        }

        playCoinSound() {
            if (!this.initialized || this.muted || gameState !== 'PLAYING' || !this.ctx) return;
            try {
                if (this.ctx && this.ctx.state === 'suspended') {
                    this.ctx.resume().catch(() => {});
                }
                const now = this.ctx.currentTime;
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(987.77, now);
                osc.frequency.setValueAtTime(1318.51, now + 0.08);
                gain.gain.setValueAtTime(0.15, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
                osc.connect(gain);
                gain.connect(this.ctx.destination);
                this.activeNodes.add(osc);
                osc.onended = () => this.activeNodes.delete(osc);
                osc.start(now);
                osc.stop(now + 0.26);
            } catch (e) {}
        }

        updateEngine(speedFraction) {
            if (!this.initialized || this.muted || gameState !== 'PLAYING' || !this.ctx) return;
            const now = this.ctx.currentTime;
            const freq = 45 + Math.min(speedFraction, 1.2) * 90;
            if (this.engineOsc) {
                this.engineOsc.frequency.setTargetAtTime(freq, now, 0.08);
            }
            if (this.engineGain) {
                this.engineGain.gain.setTargetAtTime(0.025 + Math.min(speedFraction, 1.0) * 0.035, now, 0.08);
            }
        }

        updateSiren(closestPoliceDistance) {
            if (!this.initialized || this.muted || gameState !== 'PLAYING' || !this.ctx) return;
            const now = this.ctx.currentTime;
            if (closestPoliceDistance < 600) {
                const vol = Math.max(0, 1 - (closestPoliceDistance / 600)) * 0.07;
                const freq = 600 + Math.sin(now * 7) * 220;
                if (this.sirenOsc) this.sirenOsc.frequency.setValueAtTime(freq, now);
                if (this.sirenGain) this.sirenGain.gain.setTargetAtTime(vol, now, 0.1);
            } else {
                if (this.sirenGain) this.sirenGain.gain.setTargetAtTime(0, now, 0.2);
            }
        }

        playCountdownBeep(isGo) {
            if (!this.initialized || this.muted || gameState !== 'PLAYING' || !this.ctx) return;
            try {
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.type = isGo ? 'triangle' : 'sine';
                osc.frequency.setValueAtTime(isGo ? 880 : 440, this.ctx.currentTime);
                gain.gain.setValueAtTime(0.18, this.ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + (isGo ? 0.45 : 0.22));
                osc.connect(gain);
                gain.connect(this.ctx.destination);
                osc.start();
                osc.stop(this.ctx.currentTime + (isGo ? 0.45 : 0.22));
            } catch (e) {}
        }

        playRampJump() {
            if (!this.initialized || this.muted || gameState !== 'PLAYING' || !this.ctx) return;
            try {
                const now = this.ctx.currentTime;
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(320, now);
                osc.frequency.exponentialRampToValueAtTime(840, now + 0.35);
                gain.gain.setValueAtTime(0.25, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
                osc.connect(gain);
                gain.connect(this.ctx.destination);
                osc.start();
                osc.stop(now + 0.52);
            } catch (e) {}
        }

        playCrashSound(severity) {
            if (!this.initialized || this.muted || gameState !== 'PLAYING' || !this.ctx) return;
            try {
                const now = this.ctx.currentTime;
                const bufferSize = Math.floor(this.ctx.sampleRate * 0.28);
                const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
                const data = buffer.getChannelData(0);
                for (let i = 0; i < bufferSize; i++) {
                    data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.25));
                }
                const noise = this.ctx.createBufferSource();
                noise.buffer = buffer;

                const filter = this.ctx.createBiquadFilter();
                filter.type = 'lowpass';
                filter.frequency.setValueAtTime(280 + severity * 420, now);

                const gain = this.ctx.createGain();
                gain.gain.setValueAtTime(0.25 + severity * 0.3, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

                noise.connect(filter);
                filter.connect(gain);
                gain.connect(this.ctx.destination);
                this.activeNodes.add(noise);
                noise.onended = () => this.activeNodes.delete(noise);
                noise.start();
            } catch (e) {}
        }

        playGameOverBlast() {
            if (!this.initialized || this.muted || !this.ctx) return;
            try {
                if (this.ctx.state === 'suspended') {
                    this.ctx.resume().catch(() => {});
                }
                const now = this.ctx.currentTime;

                // 1. Heavy explosion noise blast (decaying shaped white noise through swept lowpass)
                const blastDuration = 1.1;
                const bufferSize = Math.floor(this.ctx.sampleRate * blastDuration);
                const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
                const data = buffer.getChannelData(0);
                for (let i = 0; i < bufferSize; i++) {
                    data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.22));
                }

                const noise = this.ctx.createBufferSource();
                noise.buffer = buffer;

                const filter = this.ctx.createBiquadFilter();
                filter.type = 'lowpass';
                filter.frequency.setValueAtTime(450, now);
                filter.frequency.exponentialRampToValueAtTime(40, now + blastDuration);

                const noiseGain = this.ctx.createGain();
                noiseGain.gain.setValueAtTime(0.65, now);
                noiseGain.gain.exponentialRampToValueAtTime(0.001, now + blastDuration);

                noise.connect(filter);
                filter.connect(noiseGain);
                noiseGain.connect(this.ctx.destination);

                noise.start(now);
                noise.stop(now + blastDuration);

                // 2. Deep sub-bass punch oscillator (downward 130Hz -> 28Hz sweep)
                const subOsc = this.ctx.createOscillator();
                const subGain = this.ctx.createGain();
                subOsc.type = 'sine';
                subOsc.frequency.setValueAtTime(130, now);
                subOsc.frequency.exponentialRampToValueAtTime(28, now + 0.65);

                subGain.gain.setValueAtTime(0.70, now);
                subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.70);

                subOsc.connect(subGain);
                subGain.connect(this.ctx.destination);

                subOsc.start(now);
                subOsc.stop(now + 0.72);
            } catch (e) {
                console.warn('Game over blast audio error:', e);
            }
        }
    }

    // =========================================================================
    // SECTION 3: INPUT MANAGER (A=Left, D=Right, Strict centralized mapping)
    // =========================================================================
    class InputManager {
        constructor() {
            this.state = {
                forward: false,
                backward: false,
                left: false,
                right: false
            };
            this.touchState = {
                left: false,
                right: false
            };
            this.keyState = {
                forward: false,
                backward: false,
                left: false,
                right: false
            };
            this.locked = false;
            this.initListeners();
        }

        updateEffectiveState() {
            if (this.touchState.left && this.touchState.right) {
                // MOBILE: LEFT + RIGHT pressed simultaneously -> REVERSE!
                this.state.left = false;
                this.state.right = false;
                this.state.backward = true;
                this.state.forward = false;
            } else if (this.touchState.left) {
                // MOBILE: LEFT only -> Steer Left
                this.state.left = true;
                this.state.right = false;
                this.state.backward = false;
                this.state.forward = true;
            } else if (this.touchState.right) {
                // MOBILE: RIGHT only -> Steer Right
                this.state.left = false;
                this.state.right = true;
                this.state.backward = false;
                this.state.forward = true;
            } else {
                // DESKTOP: Keyboard keys A/D/S (normal steering, no drift)
                this.state.left = this.keyState.left;
                this.state.right = this.keyState.right;
                this.state.backward = this.keyState.backward;
                this.state.forward = this.keyState.forward;
            }
        }

        initListeners() {
            // Desktop Keyboard Listeners
            window.addEventListener('keydown', (e) => {
                if (this.locked) return;
                this.handleKey(e.code, true);
                if (sound && !sound.initialized) sound.init();
            });

            window.addEventListener('keyup', (e) => {
                this.handleKey(e.code, false);
            });

            // Mobile Two-Button Touch & Pointer Handling
            const bindMobileButton = (id, isLeft) => {
                const btn = document.getElementById(id);
                if (!btn) return;

                const press = (e) => {
                    if (e && e.cancelable) e.preventDefault();
                    if (this.locked) return;
                    if (isLeft) this.touchState.left = true;
                    else this.touchState.right = true;
                    btn.classList.add('touch-active');
                    this.updateEffectiveState();
                    if (sound && !sound.initialized) sound.init();
                };

                const release = (e) => {
                    if (e && e.cancelable) e.preventDefault();
                    if (isLeft) this.touchState.left = false;
                    else this.touchState.right = false;
                    btn.classList.remove('touch-active');
                    this.updateEffectiveState();
                };

                btn.addEventListener('pointerdown', press);
                btn.addEventListener('pointerup', release);
                btn.addEventListener('pointercancel', release);
                btn.addEventListener('pointerleave', release);

                btn.addEventListener('touchstart', press, { passive: false });
                btn.addEventListener('touchend', release, { passive: false });
                btn.addEventListener('touchcancel', release, { passive: false });
            };

            bindMobileButton('btn-touch-left', true);
            bindMobileButton('btn-touch-right', false);
        }

        handleKey(code, isDown) {
            switch (code) {
                case 'KeyW':
                case 'ArrowUp':
                    this.keyState.forward = isDown;
                    break;
                case 'KeyS':
                case 'ArrowDown':
                    this.keyState.backward = isDown;
                    break;
                case 'KeyA':
                case 'ArrowLeft':
                    this.keyState.left = isDown;
                    break;
                case 'KeyD':
                case 'ArrowRight':
                    this.keyState.right = isDown;
                    break;
            }
            this.updateEffectiveState();
        }
    }

    // =========================================================================
    // SECTION 4: PROCEDURAL CHUNK SYSTEM & CONNECTED ROAD NAVIGATION NETWORK
    // =========================================================================
    class NavSegment {
        constructor(cx, cy, id, type, length, start, end, entrySocket, exitSocket, samples = null) {
            this.cx = cx;
            this.cy = cy;
            this.id = id;
            this.type = type; // 'straight' | 'curve'
            this.length = length;
            this.start = start; // { x, y, heading }
            this.end = end;     // { x, y, heading }
            this.entrySocket = entrySocket; // 'N', 'S', 'W', 'E', or 'DEAD_END'
            this.exitSocket = exitSocket;   // 'N', 'S', 'W', 'E', or 'DEAD_END'
            this.samples = samples;

            if (samples && samples.length > 1) {
                this.cumDists = [0];
                for (let i = 0; i < samples.length - 1; i++) {
                    const d = Math.hypot(samples[i + 1].x - samples[i].x, samples[i + 1].y - samples[i].y);
                    this.cumDists.push(this.cumDists[this.cumDists.length - 1] + d);
                }
                this.length = this.cumDists[this.cumDists.length - 1];
            }
        }

        getPose(dist) {
            dist = Math.max(0, Math.min(this.length, dist));
            if (this.type === 'straight' || !this.samples || this.samples.length < 2) {
                const t = this.length > 0 ? dist / this.length : 0;
                const x = (1 - t) * this.start.x + t * this.end.x;
                const y = (1 - t) * this.start.y + t * this.end.y;
                return { x, y, heading: this.start.heading };
            } else {
                let idx = 0;
                while (idx < this.cumDists.length - 2 && this.cumDists[idx + 1] < dist) {
                    idx++;
                }
                const segLen = this.cumDists[idx + 1] - this.cumDists[idx];
                const frac = segLen > 0 ? (dist - this.cumDists[idx]) / segLen : 0;
                const s0 = this.samples[idx];
                const s1 = this.samples[idx + 1];
                const x = (1 - frac) * s0.x + frac * s1.x;
                const y = (1 - frac) * s0.y + frac * s1.y;

                let diff = s1.heading - s0.heading;
                while (diff < -Math.PI) diff += Math.PI * 2;
                while (diff > Math.PI) diff -= Math.PI * 2;
                const heading = s0.heading + frac * diff;
                return { x, y, heading };
            }
        }
    }



    function hashCoord(x, y, seed = 1337) {
        let h = (seed ^ (x * 374761393) ^ (y * 668265263)) >>> 0;
        h = Math.imul(h ^ (h >>> 13), 1274126177);
        return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
    }

    // 11 Proven Cyclic Topologies for Odd Blocks (Strictly Degree >= 2, ZERO dead ends)
    const ODD_CHUNK_TOPOLOGIES = [
        // 2 sockets (straights & organic 90-degree curves)
        { N: 1, S: 1, W: 0, E: 0 }, // NS straight
        { N: 0, S: 0, W: 1, E: 1 }, // WE straight
        { N: 1, S: 0, W: 0, E: 1 }, // NE curve
        { N: 1, S: 0, W: 1, E: 0 }, // NW curve
        { N: 0, S: 1, W: 0, E: 1 }, // SE curve
        { N: 0, S: 1, W: 1, E: 0 }, // SW curve
        // 3 sockets (T-junctions)
        { N: 1, S: 1, W: 1, E: 0 }, // NSW
        { N: 1, S: 1, W: 0, E: 1 }, // NSE
        { N: 1, S: 0, W: 1, E: 1 }, // NEW
        { N: 0, S: 1, W: 1, E: 1 }, // SEW
        // 4 sockets (Crossroads)
        { N: 1, S: 1, W: 1, E: 1 }  // NSWE
    ];

    function getOddChunkTopology(ox, oy, seed) {
        const h = hashCoord(ox, oy, seed + 9999);
        const idx = Math.floor(h * ODD_CHUNK_TOPOLOGIES.length) % ODD_CHUNK_TOPOLOGIES.length;
        return ODD_CHUNK_TOPOLOGIES[idx];
    }

    function getEdgeH(cx, yEdge, seed) {
        // Even columns (cx = 0, +-2, +-4...) are infinite continuous North-South arterial avenues
        if (Math.abs(cx) % 2 === 0) return 1;
        // cx is odd: exactly one of (yEdge - 1) and yEdge is odd
        const oddCy = (Math.abs(yEdge) % 2 !== 0) ? yEdge : (yEdge - 1);
        const topo = getOddChunkTopology(cx, oddCy, seed);
        return (oddCy === yEdge) ? topo.N : topo.S;
    }

    function getEdgeV(xEdge, cy, seed) {
        // Starting highway at (0, 0): keep immediate lateral sides clear so player begins on uninterrupted straight
        if (cy === 0 && (xEdge === 0 || xEdge === 1)) return 0;
        // Even rows (cy = 0, +-2, +-4...) are infinite continuous East-West arterial avenues
        if (Math.abs(cy) % 2 === 0) return 1;
        // cy is odd: exactly one of (xEdge - 1) and xEdge is odd
        const oddCx = (Math.abs(xEdge) % 2 !== 0) ? xEdge : (xEdge - 1);
        const topo = getOddChunkTopology(oddCx, cy, seed);
        return (oddCx === xEdge) ? topo.W : topo.E;
    }

    class Chunk {
        constructor(cx, cy, seed) {
            this.cx = cx;
            this.cy = cy;
            this.seed = seed;

            const size = CONFIG.CHUNK_SIZE;
            this.midX = cx * size;
            this.midY = cy * size;
            this.minX = this.midX - size / 2;
            this.maxX = this.midX + size / 2;
            this.minY = this.midY - size / 2;
            this.maxY = this.midY + size / 2;

            this.hasNorth = (getEdgeH(this.cx, this.cy, this.seed) === 1);
            this.hasSouth = (getEdgeH(this.cx, this.cy + 1, this.seed) === 1);
            this.hasWest = (getEdgeV(this.cx, this.cy, this.seed) === 1);
            this.hasEast = (getEdgeV(this.cx + 1, this.cy, this.seed) === 1);
            this.socketCount = (this.hasNorth ? 1 : 0) + (this.hasSouth ? 1 : 0) + (this.hasWest ? 1 : 0) + (this.hasEast ? 1 : 0);

            // Fail-safe guarantee: degree MUST be >= 2 everywhere (no dead ends, no empty chunks)
            if (this.socketCount < 2) {
                this.hasNorth = true;
                this.hasSouth = true;
                this.socketCount = (this.hasNorth ? 1 : 0) + (this.hasSouth ? 1 : 0) + (this.hasWest ? 1 : 0) + (this.hasEast ? 1 : 0);
            }

            this.roads = [];
            this.curves = [];
            this.deadEnds = [];
            this.crosswalks = [];
            this.roadArrows = [];
            this.ramps = [];
            this.buildings = [];
            this.trees = [];
            this.bushes = [];
            this.boulders = [];
            this.props = [];

            this.generate();
        }

        sampleBezier(p0, p1, p2, steps = 12) {
            const samples = [];
            for (let i = 0; i <= steps; i++) {
                const t = i / steps;
                const x = (1 - t) * (1 - t) * p0.x + 2 * (1 - t) * t * p1.x + t * t * p2.x;
                const y = (1 - t) * (1 - t) * p0.y + 2 * (1 - t) * t * p1.y + t * t * p2.y;
                const dx = 2 * (1 - t) * (p1.x - p0.x) + 2 * t * (p2.x - p1.x);
                const dy = 2 * (1 - t) * (p1.y - p0.y) + 2 * t * (p2.y - p1.y);
                const len = Math.hypot(dx, dy) || 0.001;
                const tx = dx / len;
                const ty = dy / len;
                samples.push({
                    x, y,
                    tx, ty,
                    nx: -ty, ny: tx,
                    heading: Math.atan2(dy, dx)
                });
            }
            return samples;
        }

        generate() {
            const rw = CONFIG.ROAD_WIDTH; // 110px
            const hrw = rw / 2;           // 55px
            const chunkSize = CONFIG.CHUNK_SIZE;

            // 1. Procedural Road Network Layout based on socket topology (Degree >= 2 guaranteed, ZERO dead ends)
            if (this.socketCount <= 2) {
                // Opposite Sockets -> Straight Roads
                if (this.hasNorth && this.hasSouth) {
                    this.roads.push({ x: this.midX, y: this.minY, width: rw, height: chunkSize, isVertical: true, arm: 'NS' });
                    this.roadArrows.push({ x: this.midX - 28, y: this.minY + 110, heading: -Math.PI / 2 });
                    this.roadArrows.push({ x: this.midX + 28, y: this.maxY - 110, heading: Math.PI / 2 });
                } else if (this.hasWest && this.hasEast) {
                    this.roads.push({ x: this.minX, y: this.midY, width: chunkSize, height: rw, isVertical: false, arm: 'WE' });
                    this.roadArrows.push({ x: this.minX + 110, y: this.midY - 28, heading: Math.PI });
                    this.roadArrows.push({ x: this.maxX - 110, y: this.midY + 28, heading: 0 });
                } else {
                    // Perpendicular Sockets -> 90-Degree Organic Curve
                    let p0, p2, armCode;
                    const p1 = { x: this.midX, y: this.midY };

                    if (this.hasSouth && this.hasEast) {
                        p0 = { x: this.midX, y: this.maxY };
                        p2 = { x: this.maxX, y: this.midY };
                        armCode = 'SE';
                    } else if (this.hasSouth && this.hasWest) {
                        p0 = { x: this.midX, y: this.maxY };
                        p2 = { x: this.minX, y: this.midY };
                        armCode = 'SW';
                    } else if (this.hasNorth && this.hasEast) {
                        p0 = { x: this.midX, y: this.minY };
                        p2 = { x: this.maxX, y: this.midY };
                        armCode = 'NE';
                    } else { // North && West
                        p0 = { x: this.midX, y: this.minY };
                        p2 = { x: this.minX, y: this.midY };
                        armCode = 'NW';
                    }

                    const samples = this.sampleBezier(p0, p1, p2, 12);
                    this.curves.push({ p0, p1, p2, samples, width: rw, arm: armCode });
                }

            } else if (this.socketCount === 3) {
                // --- T-JUNCTION: Continuous main road + 90-degree branch ---
                if (this.hasNorth && this.hasSouth) {
                    this.roads.push({ x: this.midX, y: this.minY, width: rw, height: chunkSize, isVertical: true, arm: 'NS' });
                    if (this.hasWest) {
                        this.roads.push({ x: this.minX, y: this.midY, width: (this.midX - this.minX) + hrw, height: rw, isVertical: false, arm: 'W' });
                        this.crosswalks.push({ x: this.midX - hrw - 14, y: this.midY, width: 16, height: rw - 8, isHoriz: false });
                    } else {
                        this.roads.push({ x: this.midX - hrw, y: this.midY, width: (this.maxX - this.midX) + hrw, height: rw, isVertical: false, arm: 'E' });
                        this.crosswalks.push({ x: this.midX + hrw + 14, y: this.midY, width: 16, height: rw - 8, isHoriz: false });
                    }
                    this.crosswalks.push({ x: this.midX, y: this.midY - hrw - 14, width: rw - 8, height: 16, isHoriz: true });
                    this.crosswalks.push({ x: this.midX, y: this.midY + hrw + 14, width: rw - 8, height: 16, isHoriz: true });
                } else if (this.hasWest && this.hasEast) {
                    this.roads.push({ x: this.minX, y: this.midY, width: chunkSize, height: rw, isVertical: false, arm: 'WE' });
                    if (this.hasNorth) {
                        this.roads.push({ x: this.midX, y: this.minY, width: rw, height: (this.midY - this.minY) + hrw, isVertical: true, arm: 'N' });
                        this.crosswalks.push({ x: this.midX, y: this.midY - hrw - 14, width: rw - 8, height: 16, isHoriz: true });
                    } else {
                        this.roads.push({ x: this.midX, y: this.midY - hrw, width: rw, height: (this.maxY - this.midY) + hrw, isVertical: true, arm: 'S' });
                        this.crosswalks.push({ x: this.midX, y: this.midY + hrw + 14, width: rw - 8, height: 16, isHoriz: true });
                    }
                    this.crosswalks.push({ x: this.midX - hrw - 14, y: this.midY, width: 16, height: rw - 8, isHoriz: false });
                    this.crosswalks.push({ x: this.midX + hrw + 14, y: this.midY, width: 16, height: rw - 8, isHoriz: false });
                }

            } else if (this.socketCount === 4) {
                // --- CROSSROADS / 4-WAY INTERSECTION ---
                this.roads.push({ x: this.midX, y: this.minY, width: rw, height: chunkSize, isVertical: true, arm: 'NS' });
                this.roads.push({ x: this.minX, y: this.midY, width: chunkSize, height: rw, isVertical: false, arm: 'WE' });

                this.crosswalks.push({ x: this.midX, y: this.midY - hrw - 14, width: rw - 8, height: 16, isHoriz: true });
                this.crosswalks.push({ x: this.midX, y: this.midY + hrw + 14, width: rw - 8, height: 16, isHoriz: true });
                this.crosswalks.push({ x: this.midX - hrw - 14, y: this.midY, width: 16, height: rw - 8, isHoriz: false });
                this.crosswalks.push({ x: this.midX + hrw + 14, y: this.midY, width: 16, height: rw - 8, isHoriz: false });
            } else {
                // Fallback straight North-South road if 0 sockets
                this.roads.push({ x: this.midX, y: this.minY, width: rw, height: chunkSize, isVertical: true, arm: 'NS' });
            }

            // 2. Architectural Buildings with Rigorous Road Clearance Check
            const isNearRoadCorridor = (x, y, radius) => {
                for (let r of this.roads) {
                    if (r.isVertical) {
                        if (y >= r.y - radius && y <= r.y + r.height + radius) {
                            if (Math.abs(x - r.x) < hrw + radius) return true;
                        }
                    } else {
                        if (x >= r.x - radius && x <= r.x + r.width + radius) {
                            if (Math.abs(y - r.y) < hrw + radius) return true;
                        }
                    }
                }
                for (let crv of this.curves) {
                    for (let s of crv.samples) {
                        if (Math.hypot(x - s.x, y - s.y) < hrw + radius) return true;
                    }
                }
                for (let de of this.deadEnds) {
                    if (Math.hypot(x - de.x, y - de.y) < hrw * 1.25 + radius) return true;
                }
                return false;
            };

            const roadMargin = hrw + 42; // 97px safety setback
            const quadrants = [
                { id: 'NW', minX: this.minX + 20, maxX: this.midX - roadMargin, minY: this.minY + 20, maxY: this.midY - roadMargin },
                { id: 'NE', minX: this.midX + roadMargin, maxX: this.maxX - 20, minY: this.minY + 20, maxY: this.midY - roadMargin },
                { id: 'SW', minX: this.minX + 20, maxX: this.midX - roadMargin, minY: this.midY + roadMargin, maxY: this.maxY - 20 },
                { id: 'SE', minX: this.midX + roadMargin, maxX: this.maxX - 20, minY: this.midY + roadMargin, maxY: this.maxY - 20 }
            ];

            quadrants.forEach((q, qIndex) => {
                const qRoll = hashCoord(this.cx * 4 + qIndex, this.cy * 4 + qIndex, this.seed);
                const qWidth = q.maxX - q.minX;
                const qHeight = q.maxY - q.minY;
                if (qWidth < 50 || qHeight < 50) return;

                const bx = (q.minX + q.maxX) / 2;
                const by = (q.minY + q.maxY) / 2;
                const bw = Math.min(qWidth * 0.72, 105);
                const bh = Math.min(qHeight * 0.72, 105);

                const clearRadius = Math.max(bw, bh) * 0.55 + 24;

                if (qRoll < 0.62 && !isNearRoadCorridor(bx, by, clearRadius)) {
                    // Determine building archetype with distinct recognizable identities
                    const bTypeRoll = hashCoord(this.cx * 7 + qIndex, this.cy * 7 + qIndex, this.seed + 101);
                    let archetype = 'commercial';
                    let bHeight = 55;

                    if (bTypeRoll < 0.16) {
                        archetype = 'hospital';
                        bHeight = 56 + Math.floor(hashCoord(this.cx + qIndex * 3, this.cy + qIndex * 5, this.seed) * 16);
                    } else if (bTypeRoll < 0.36) {
                        archetype = 'garage';
                        bHeight = 35 + Math.floor(hashCoord(this.cx + qIndex * 3, this.cy + qIndex * 5, this.seed) * 10);
                    } else if (bTypeRoll < 0.64) {
                        archetype = (bTypeRoll < 0.50) ? 'house_small' : 'house_large';
                        bHeight = 30 + Math.floor(hashCoord(this.cx + qIndex * 3, this.cy + qIndex * 5, this.seed) * 10);
                    } else if (bTypeRoll < 0.82) {
                        archetype = 'shop';
                        bHeight = 40 + Math.floor(hashCoord(this.cx + qIndex * 3, this.cy + qIndex * 5, this.seed) * 14);
                    } else {
                        archetype = 'commercial';
                        bHeight = 62 + Math.floor(hashCoord(this.cx + qIndex * 3, this.cy + qIndex * 5, this.seed) * 30);
                    }

                    const palIdx = Math.floor(hashCoord(this.cx + qIndex * 3, this.cy + qIndex * 7, this.seed) * BUILDING_PALETTES.length) % BUILDING_PALETTES.length;
                    const pal = BUILDING_PALETTES[palIdx];

                    this.buildings.push({
                        x: bx,
                        y: by,
                        width: bw,
                        height: bh,
                        h3d: bHeight,
                        archetype: archetype,
                        color: pal.roof,
                        frontColor: pal.front,
                        wallColor: pal.front,
                        sideColor: pal.side,
                        trim: pal.trim,
                        accent: pal.accent,
                        winColor: pal.winColor,
                        type: pal.type
                    });
                } else {
                    // Open park nature when clear of roads
                    if (!isNearRoadCorridor(bx, by, 35)) {
                        this.trees.push({ x: bx - 22, y: by - 20, radius: 18, shade: '#2e7d32' });
                        this.trees.push({ x: bx + 22, y: by + 18, radius: 20, shade: '#388e3c' });
                        this.bushes.push({ x: bx + 16, y: by - 16, radius: 11 });
                        this.bushes.push({ x: bx - 14, y: by + 14, radius: 10 });
                        this.boulders.push({ x: bx - 18, y: by + 20, radius: 13 });
                    }
                }
            });

            // Roadside flora & 3D Street Props along straight sidewalks
            const addRoadsideFlora = (x, y, isTree) => {
                if (isNearRoadCorridor(x, y, 16)) return;
                if (isTree) {
                    this.trees.push({ x, y, radius: 15 + (hashCoord(x, y, this.seed) * 5), shade: '#2e7d32' });
                } else {
                    this.bushes.push({ x, y, radius: 9 + (hashCoord(x, y, this.seed) * 4) });
                }
            };

            if (this.hasNorth && this.hasSouth) {
                addRoadsideFlora(this.midX - 96, this.minY + 65, true);
                addRoadsideFlora(this.midX + 96, this.minY + 65, false);
                addRoadsideFlora(this.midX - 96, this.maxY - 65, false);
                addRoadsideFlora(this.midX + 96, this.maxY - 65, true);

                this.props.push({ type: 'streetlamp', x: this.midX - 68, y: this.minY + 120 });
                this.props.push({ type: 'streetlamp', x: this.midX + 68, y: this.maxY - 120 });
                this.props.push({ type: 'hydrant', x: this.midX - 66, y: this.minY + 180 });
            }
            if (this.hasWest && this.hasEast) {
                addRoadsideFlora(this.minX + 65, this.midY - 96, false);
                addRoadsideFlora(this.minX + 65, this.midY + 96, true);
                addRoadsideFlora(this.maxX - 65, this.midY - 96, true);
                addRoadsideFlora(this.maxX - 65, this.midY + 96, false);

                this.props.push({ type: 'streetlamp', x: this.minX + 120, y: this.midY - 68 });
                this.props.push({ type: 'streetlamp', x: this.maxX - 120, y: this.midY + 68 });
            }

            // 3. Traffic Navigation Road Network Segments
            this.navSegments = [];
            const sockN = { x: this.midX, y: this.minY };
            const sockS = { x: this.midX, y: this.maxY };
            const sockW = { x: this.minX, y: this.midY };
            const sockE = { x: this.maxX, y: this.midY };
            const sockC = { x: this.midX, y: this.midY };

            const addStraight = (id, p0, p1, entryS, exitS) => {
                const len = Math.hypot(p1.x - p0.x, p1.y - p0.y);
                const h = Math.atan2(p1.y - p0.y, p1.x - p0.x);
                this.navSegments.push(new NavSegment(
                    this.cx, this.cy, id, 'straight', len,
                    { x: p0.x, y: p0.y, heading: h },
                    { x: p1.x, y: p1.y, heading: h },
                    entryS, exitS
                ));
            };

            const addCurved = (id, samples, entryS, exitS) => {
                const p0 = samples[0];
                const p1 = samples[samples.length - 1];
                this.navSegments.push(new NavSegment(
                    this.cx, this.cy, id, 'curve', 0,
                    { x: p0.x, y: p0.y, heading: p0.heading },
                    { x: p1.x, y: p1.y, heading: p1.heading },
                    entryS, exitS, samples
                ));
            };

            if (this.socketCount <= 2) {
                if (this.hasNorth && this.hasSouth) {
                    addStraight('str_NS_S', sockN, sockS, 'N', 'S');
                    addStraight('str_NS_N', sockS, sockN, 'S', 'N');
                } else if (this.hasWest && this.hasEast) {
                    addStraight('str_WE_E', sockW, sockE, 'W', 'E');
                    addStraight('str_WE_W', sockE, sockW, 'E', 'W');
                } else if (this.curves && this.curves.length > 0) {
                    const crv = this.curves[0];
                    const entryS = crv.arm[0];
                    const exitS = crv.arm[1];
                    addCurved('crv_fwd_' + crv.arm, crv.samples, entryS, exitS);

                    const revSamples = [];
                    for (let i = crv.samples.length - 1; i >= 0; i--) {
                        const s = crv.samples[i];
                        let rh = s.heading + Math.PI;
                        while (rh > Math.PI) rh -= Math.PI * 2;
                        while (rh < -Math.PI) rh += Math.PI * 2;
                        revSamples.push({ x: s.x, y: s.y, heading: rh });
                    }
                    addCurved('crv_rev_' + crv.arm, revSamples, exitS, entryS);
                }
            } else {
                // T-Junctions (3) or Crossroads (4)
                const sockets = [];
                if (this.hasNorth) sockets.push({ key: 'N', pt: sockN });
                if (this.hasSouth) sockets.push({ key: 'S', pt: sockS });
                if (this.hasWest) sockets.push({ key: 'W', pt: sockW });
                if (this.hasEast) sockets.push({ key: 'E', pt: sockE });

                for (let inS of sockets) {
                    for (let outS of sockets) {
                        if (inS.key === outS.key) continue;
                        const isOpposite = (inS.key === 'N' && outS.key === 'S') ||
                                           (inS.key === 'S' && outS.key === 'N') ||
                                           (inS.key === 'W' && outS.key === 'E') ||
                                           (inS.key === 'E' && outS.key === 'W');
                        if (isOpposite) {
                            addStraight('junc_str_' + inS.key + outS.key, inS.pt, outS.pt, inS.key, outS.key);
                        } else {
                            const turnSamples = this.sampleBezier(inS.pt, sockC, outS.pt, 10);
                            addCurved('junc_turn_' + inS.key + outS.key, turnSamples, inS.key, outS.key);
                        }
                    }
                }
            }
        }
    }

    class ChunkManager {
        constructor(seed = 1337) {
            this.seed = seed;
            this.chunks = new Map();
            this.skidmarks = [];
        }

        getChunkKey(cx, cy) {
            return `${cx},${cy}`;
        }

        getChunk(cx, cy) {
            const key = this.getChunkKey(cx, cy);
            let chunk = this.chunks.get(key);
            if (!chunk) {
                chunk = new Chunk(cx, cy, this.seed);
                this.chunks.set(key, chunk);
            }
            return chunk;
        }

        update(playerX, playerY, heading = 0, speed = 0) {
            const size = CONFIG.CHUNK_SIZE;
            const pcx = Math.round(playerX / size);
            const pcy = Math.round(playerY / size);

            const activeKeys = new Set();
            // 1. Core 5x5 area surrounding the player (guarantees seamless roads in all directions)
            for (let dx = -2; dx <= 2; dx++) {
                for (let dy = -2; dy <= 2; dy++) {
                    const cx = pcx + dx;
                    const cy = pcy + dy;
                    activeKeys.add(this.getChunkKey(cx, cy));
                    this.getChunk(cx, cy);
                }
            }

            // 2. Forward lookahead cone up to 1500px (2 to 3 chunks ahead along velocity/heading)
            const forwardSteps = [640, 1100, 1500];
            for (let dist of forwardSteps) {
                const lookX = playerX + Math.cos(heading) * dist;
                const lookY = playerY + Math.sin(heading) * dist;
                const lcx = Math.round(lookX / size);
                const lcy = Math.round(lookY / size);
                for (let dx = -1; dx <= 1; dx++) {
                    for (let dy = -1; dy <= 1; dy++) {
                        const cx = lcx + dx;
                        const cy = lcy + dy;
                        activeKeys.add(this.getChunkKey(cx, cy));
                        this.getChunk(cx, cy);
                    }
                }
            }

            // 3. Prune chunks farther than 2000 px away
            const pruneDistSq = 2000 * 2000;
            for (let [key, c] of this.chunks.entries()) {
                const distSq = (c.midX - playerX) ** 2 + (c.midY - playerY) ** 2;
                if (distSq > pruneDistSq && !activeKeys.has(key)) {
                    this.chunks.delete(key);
                }
            }
        }

        getNearbyBuildings(x, y, radius = 130) {
            const res = [];
            for (let c of this.chunks.values()) {
                if (x + radius >= c.minX && x - radius <= c.maxX &&
                    y + radius >= c.minY && y - radius <= c.maxY) {
                    for (let b of c.buildings) {
                        if (Math.hypot(b.x - x, b.y - y) <= radius + Math.max(b.width, b.height) * 0.75) {
                            res.push(b);
                        }
                    }
                }
            }
            return res;
        }

        getNearbyNature(x, y, radius = 130) {
            const trees = [];
            const boulders = [];
            for (let c of this.chunks.values()) {
                if (x + radius >= c.minX && x - radius <= c.maxX &&
                    y + radius >= c.minY && y - radius <= c.maxY) {
                    for (let t of c.trees) {
                        if (Math.hypot(t.x - x, t.y - y) <= radius + t.radius) trees.push(t);
                    }
                    for (let b of c.boulders) {
                        if (Math.hypot(b.x - x, b.y - y) <= radius + b.radius) boulders.push(b);
                    }
                }
            }
            return { trees, boulders };
        }

        getSurfaceType(x, y) {
            const size = CONFIG.CHUNK_SIZE;
            const pcx = Math.round(x / size);
            const pcy = Math.round(y / size);

            const hrw = CONFIG.ROAD_WIDTH / 2; // 55px
            const curbLimit = hrw + 18;        // 73px

            let onCurb = false;

            for (let dx = -1; dx <= 1; dx++) {
                for (let dy = -1; dy <= 1; dy++) {
                    const key = `${pcx + dx},${pcy + dy}`;
                    const c = this.chunks.get(key);
                    if (!c) continue;

                    // Straight roads
                    for (let r of c.roads) {
                        if (r.isVertical) {
                            if (y >= r.y - 4 && y <= r.y + r.height + 4) {
                                const distX = Math.abs(x - r.x);
                                if (distX <= hrw) return 'road';
                                if (distX <= curbLimit) onCurb = true;
                            }
                        } else {
                            if (x >= r.x - 4 && x <= r.x + r.width + 4) {
                                const distY = Math.abs(y - r.y);
                                if (distY <= hrw) return 'road';
                                if (distY <= curbLimit) onCurb = true;
                            }
                        }
                    }

                    // Curved roads
                    for (let crv of c.curves) {
                        for (let s of crv.samples) {
                            const d = Math.hypot(x - s.x, y - s.y);
                            if (d <= hrw) return 'road';
                            if (d <= curbLimit) onCurb = true;
                        }
                    }

                    // Dead end cul-de-sacs
                    for (let de of c.deadEnds) {
                        const d = Math.hypot(x - de.x, y - de.y);
                        if (d <= hrw * 1.15) return 'road';
                        if (d <= hrw * 1.15 + 18) onCurb = true;
                    }
                }
            }

            return onCurb ? 'curb' : 'grass';
        }

        getNearbyRamps(x, y, radius = 45) { return []; }

        getNearestRoadPoint(x, y) {
            let bestDist = Infinity;
            let bestX = x;
            let bestY = y;
            let bestHeading = 0;

            const size = CONFIG.CHUNK_SIZE;
            const pcx = Math.round(x / size);
            const pcy = Math.round(y / size);

            for (let dx = -1; dx <= 1; dx++) {
                for (let dy = -1; dy <= 1; dy++) {
                    const c = this.getChunk(pcx + dx, pcy + dy);
                    // Straight roads
                    for (let r of c.roads) {
                        if (r.isVertical) {
                            const clampedY = Math.max(r.y + 20, Math.min(r.y + r.height - 20, y));
                            const laneOffset = x >= r.x ? 28 : -28;
                            const targetX = r.x + laneOffset;
                            const d = Math.hypot(x - targetX, y - clampedY);
                            if (d < bestDist) {
                                bestDist = d;
                                bestX = targetX;
                                bestY = clampedY;
                                bestHeading = laneOffset > 0 ? Math.PI / 2 : -Math.PI / 2;
                            }
                        } else {
                            const clampedX = Math.max(r.x + 20, Math.min(r.x + r.width - 20, x));
                            const laneOffset = y >= r.y ? 28 : -28;
                            const targetY = r.y + laneOffset;
                            const d = Math.hypot(x - clampedX, y - targetY);
                            if (d < bestDist) {
                                bestDist = d;
                                bestX = clampedX;
                                bestY = targetY;
                                bestHeading = laneOffset > 0 ? 0 : Math.PI;
                            }
                        }
                    }

                    // Curved roads
                    for (let crv of c.curves) {
                        for (let s of crv.samples) {
                            const d = Math.hypot(x - s.x, y - s.y);
                            if (d < bestDist) {
                                bestDist = d;
                                bestX = s.x;
                                bestY = s.y;
                                bestHeading = s.heading;
                            }
                        }
                    }
                }
            }
            return { x: bestX, y: bestY, heading: bestHeading, dist: bestDist };
        }

        addSkidmark(x, y, heading) {
            this.skidmarks.push({
                x, y, heading,
                alpha: 0.55,
                age: 0
            });
            if (this.skidmarks.length > 250) {
                this.skidmarks.shift();
            }
        }

        updateSkidmarks(dt) {
            for (let i = this.skidmarks.length - 1; i >= 0; i--) {
                const s = this.skidmarks[i];
                s.age += dt;
                s.alpha -= dt * 0.05;
                if (s.alpha <= 0) {
                    this.skidmarks.splice(i, 1);
                }
            }
        }
    }

    // =========================================================================
    // SECTION 5: 3D WORLD COORDINATE SCALING & CONSTANTS
    // =========================================================================
    const SCALE_3D = 0.10; // 10px in 2D physics = 1.0m in 3D world

    // =========================================================================
    // SECTION 6: 3D VEHICLE CLASSES (PLAYER, POLICE, TRAFFIC)
    // =========================================================================
    class Vehicle {
        constructor(x, y, heading) {
            this.id = 'veh_' + Math.random().toString(36).substring(2, 9);
            this.x = x;
            this.y = y;
            this.heading = heading;
            this.speed = 0;
            this.vx = 0;
            this.vy = 0;
            this.z = 0;

            this.length = 46;
            this.width = 24;
            this.radius = 20;

            this.isAlive = true;
            this.isAirborne = false;
            this.airborneTimer = 0;
            this.bodyRoll = 0;
        }

        updatePhysics(dt) {
            this.vx = Math.cos(this.heading) * this.speed;
            this.vy = Math.sin(this.heading) * this.speed;
            this.x += this.vx * dt;
            this.y += this.vy * dt;
        }

        draw(ctx) {}

    }

    // --- PLAYER VEHICLE (3D VERMILION SPORTS CRUISER) ---
    class PlayerVehicle extends Vehicle {
        constructor(x, y) {
            super(x, y, -Math.PI / 2);
            this.id = 'player';

            this.roadMaxSpeed = 380;     // 100 km/h on Road
            this.curbMaxSpeed = 310;     // ~82 km/h on Curb/Sidewalk
            this.grassMaxSpeed = 247;    // ~65 km/h on Grass
            this.maxSpeed = 380;
            this.maxReverseSpeed = 140;  // ~37 km/h Reverse

            this.accel = 135;
            this.brakeDecel = 460;
            this.turnRate = 3.5;

            this.steerAngle = 0;
            this.score = CONFIG.STARTING_SCORE;
            this.coins = 0;
            this.lastDamageTime = -999;
        }

        launchRamp() {}

        update(dt, input, world) {
            if (this.airborneTimer > 0) {
                this.airborneTimer -= dt;
                this.isAirborne = true;
                const jumpProgress = Math.max(0, this.airborneTimer / 0.85);
                this.z = Math.sin(jumpProgress * Math.PI) * 26;
                if (this.airborneTimer <= 0) {
                    this.isAirborne = false;
                    this.z = 0;
                    if (particles) particles.emitImpactSparks(this.x, this.y, 6);
                }
            } else {
                this.isAirborne = false;
                this.z = 0;
            }

            const surface = world.getSurfaceType(this.x, this.y);
            let surfaceMaxSpeed = this.roadMaxSpeed;
            if (surface === 'grass') {
                surfaceMaxSpeed = this.grassMaxSpeed;
            } else if (surface === 'curb') {
                surfaceMaxSpeed = this.curbMaxSpeed;
            }

            const effectiveMaxSpeed = this.isAirborne ? this.roadMaxSpeed * 1.3 : surfaceMaxSpeed;
            this.maxSpeed = effectiveMaxSpeed;

            const isReversing = this.speed < -5;

            // Acceleration & Braking
            if (input.backward) {
                if (this.speed > 0) {
                    this.speed = Math.max(0, this.speed - this.brakeDecel * dt);
                } else {
                    this.speed = Math.max(-this.maxReverseSpeed, this.speed - this.accel * dt);
                }
            } else {
                if (this.speed < effectiveMaxSpeed) {
                    this.speed = Math.min(effectiveMaxSpeed, this.speed + this.accel * dt);
                } else if (this.speed > effectiveMaxSpeed && !this.isAirborne) {
                    this.speed = Math.max(effectiveMaxSpeed, this.speed - 220 * dt);
                }
            }

            // Steering: A = Turn Left, D = Turn Right (Pure normal steering, no drift)
            let steerDirection = 0;
            if (input.left) steerDirection -= 1;
            if (input.right) steerDirection += 1;

            this.steerAngle = steerDirection * 0.38;
            this.bodyRoll += (steerDirection * 0.10 - this.bodyRoll) * 0.22;

            if (Math.abs(this.speed) > 5 && steerDirection !== 0) {
                const dirMultiplier = isReversing ? -1 : 1;
                this.heading += steerDirection * this.turnRate * dirMultiplier * dt;
            }

            this.updatePhysics(dt);
        }

        draw(ctx) {}
    }

    // --- POLICE PURSUIT CRUISER (3D BLACK & WHITE INTERCEPTOR) ---
    class PoliceVehicle extends Vehicle {
        constructor(x, y, heading) {
            super(x, y, heading);
            this.speed = 140;
            this.accel = 145;
            this.stuckTimer = 0;
            this.isUnsticking = false;
            this.unstickDirection = 1;
            this.unstickDuration = 0;
            this.strobePhase = 0;
        }

        update(dt, player, world, targetMaxSpeed = 340) {
            this.strobePhase += dt * 18;

            // Intercept Lead Targeting
            const leadTime = 0.35;
            const targetX = player.x + Math.cos(player.heading) * player.speed * leadTime;
            const targetY = player.y + Math.sin(player.heading) * player.speed * leadTime;
            const dx = targetX - this.x;
            const dy = targetY - this.y;
            const targetHeading = Math.atan2(dy, dx);

            let avoidanceSteer = 0;
            const lookahead = 78;
            const probeX = this.x + Math.cos(this.heading) * lookahead;
            const probeY = this.y + Math.sin(this.heading) * lookahead;

            let wallNear = false;
            const nearbyBuildings = world.getNearbyBuildings(probeX, probeY, 70);
            for (let b of nearbyBuildings) {
                if (probeX > b.x - b.width / 2 - 20 && probeX < b.x + b.width / 2 + 20 &&
                    probeY > b.y - b.height / 2 - 20 && probeY < b.y + b.height / 2 + 20) {
                    wallNear = true;
                    const bAngle = Math.atan2(this.y - b.y, this.x - b.x);
                    avoidanceSteer = bAngle - this.heading;
                    break;
                }
            }

            if (Math.abs(this.speed) < 22) {
                this.stuckTimer += dt;
                if (this.stuckTimer > 1.1 && !this.isUnsticking) {
                    this.isUnsticking = true;
                    this.unstickDuration = 0.8;
                    this.unstickDirection = Math.random() > 0.5 ? 1 : -1;
                }
            } else {
                this.stuckTimer = 0;
            }

            if (this.isUnsticking) {
                this.unstickDuration -= dt;
                this.speed = -140;
                this.heading += this.unstickDirection * 3.4 * dt;
                if (this.unstickDuration <= 0) {
                    this.isUnsticking = false;
                    this.stuckTimer = 0;
                }
            } else {
                let desiredAngle = targetHeading;
                if (wallNear) {
                    desiredAngle = this.heading + Math.sign(avoidanceSteer) * 1.5;
                }

                let diff = desiredAngle - this.heading;
                while (diff > Math.PI) diff -= Math.PI * 2;
                while (diff < -Math.PI) diff += Math.PI * 2;
                this.heading += Math.max(-3.3 * dt, Math.min(3.3 * dt, diff * 4.5 * dt));

                const surface = world.getSurfaceType(this.x, this.y);
                let targetSpeed;

                if (surface === 'grass') {
                    targetSpeed = 240;
                } else if (surface === 'curb') {
                    targetSpeed = 295;
                } else {
                    if (Math.abs(diff) < 0.28 && !wallNear) {
                        targetSpeed = targetMaxSpeed;
                    } else if (Math.abs(diff) < 0.6) {
                        targetSpeed = targetMaxSpeed * 0.90;
                    } else {
                        targetSpeed = targetMaxSpeed * 0.76;
                    }
                }

                if (wallNear) {
                    targetSpeed = Math.min(targetSpeed, 230);
                }

                if (this.speed < targetSpeed) {
                    this.speed = Math.min(targetSpeed, this.speed + this.accel * dt);
                } else {
                    this.speed = Math.max(targetSpeed, this.speed - 210 * dt);
                }
            }

            this.updatePhysics(dt);
        }

        draw(ctx) {}
    }

    // --- CIVILIAN TRAFFIC VEHICLES (ROAD-NETWORK BOUND 3D VEHICLES) ---
    class TrafficVehicle extends Vehicle {
        constructor(x, y, heading, typeIndex) {
            super(x, y, heading);
            this.typeIndex = typeIndex % 4;
            this.baseSpeed = 210 + Math.random() * 45;
            this.speed = this.baseSpeed;
            this.laneOffset = 22; // Usable right lane offset (well inside 55px road boundary)
            this.currentSegment = null;
            this.distanceAlongSegment = 0;

            switch (this.typeIndex) {
                case 0: // Executive Sedan
                    this.length = 44;
                    this.width = 22;
                    this.color = '#2563eb';
                    this.trim = '#1d4ed8';
                    break;
                case 1: // Urban Hatchback
                    this.length = 36;
                    this.width = 21;
                    this.color = '#eab308';
                    this.trim = '#ca8a04';
                    break;
                case 2: // Rugged SUV
                    this.length = 50;
                    this.width = 26;
                    this.color = '#059669';
                    this.trim = '#047857';
                    break;
                case 3: // Delivery Box Truck (Properly colored & detailed)
                    this.length = 62;
                    this.width = 28;
                    const truckCabColors = ['#ea580c', '#2563eb', '#059669', '#dc2626', '#d97706'];
                    this.cabColor = truckCabColors[Math.floor(Math.random() * truckCabColors.length)];
                    this.color = this.cabColor;
                    this.trim = '#334155';
                    break;
            }
            this.radius = Math.max(this.length, this.width) * 0.45;
        }

        update(dt, world) {
            // Guarantee vehicle is bound to a road segment
            if (!this.currentSegment) {
                const cx = Math.round(this.x / CONFIG.CHUNK_SIZE);
                const cy = Math.round(this.y / CONFIG.CHUNK_SIZE);
                const chunk = world.getChunk(cx, cy);
                if (chunk && chunk.navSegments && chunk.navSegments.length > 0) {
                    this.currentSegment = chunk.navSegments[0];
                    this.distanceAlongSegment = 0;
                } else {
                    return;
                }
            }

            // 1. Move forward strictly along the road segment
            this.distanceAlongSegment += this.speed * dt;

            // 2. Road Transition & Intersection Logic
            if (this.distanceAlongSegment >= this.currentSegment.length) {
                const excess = this.distanceAlongSegment - this.currentSegment.length;

                if (this.currentSegment.exitSocket === 'DEAD_END') {
                    // Turnaround in cul-de-sac onto return segment
                    const curChunk = world.getChunk(this.currentSegment.cx, this.currentSegment.cy);
                    const returnSeg = curChunk ? curChunk.navSegments.find(s => s.entrySocket === 'DEAD_END') : null;
                    if (returnSeg) {
                        this.currentSegment = returnSeg;
                        this.distanceAlongSegment = excess;
                    } else {
                        this.distanceAlongSegment = this.currentSegment.length;
                    }
                } else {
                    // Transition to connected segment in adjacent chunk
                    let nextCx = this.currentSegment.cx;
                    let nextCy = this.currentSegment.cy;
                    let nextEntry = 'N';
                    if (this.currentSegment.exitSocket === 'N') { nextCy -= 1; nextEntry = 'S'; }
                    else if (this.currentSegment.exitSocket === 'S') { nextCy += 1; nextEntry = 'N'; }
                    else if (this.currentSegment.exitSocket === 'W') { nextCx -= 1; nextEntry = 'E'; }
                    else if (this.currentSegment.exitSocket === 'E') { nextCx += 1; nextEntry = 'W'; }

                    const nextChunk = world.getChunk(nextCx, nextCy);
                    const candidates = (nextChunk && nextChunk.navSegments) ?
                        nextChunk.navSegments.filter(s => s.entrySocket === nextEntry) : [];

                    if (candidates.length > 0) {
                        // At an intersection or branch, randomly commit to one of the connected roads
                        this.currentSegment = candidates[Math.floor(Math.random() * candidates.length)];
                        this.distanceAlongSegment = excess;
                    } else {
                        // Edge of world: reverse onto matching reverse segment in current chunk
                        const curChunk = world.getChunk(this.currentSegment.cx, this.currentSegment.cy);
                        const revSeg = curChunk ? curChunk.navSegments.find(s => s.entrySocket === this.currentSegment.exitSocket) : null;
                        if (revSeg) {
                            this.currentSegment = revSeg;
                            this.distanceAlongSegment = excess;
                        } else {
                            this.distanceAlongSegment = this.currentSegment.length;
                        }
                    }
                }
            }

            // 3. Grounded Position from Road Network Centerline + Safe Lane Offset
            const pose = this.currentSegment.getPose(this.distanceAlongSegment);
            const rightNx = -Math.sin(pose.heading);
            const rightNy = Math.cos(pose.heading);

            const targetX = pose.x + rightNx * this.laneOffset;
            const targetY = pose.y + rightNy * this.laneOffset;

            // Smooth position tracking (recovers gracefully if bumped by player)
            this.x += (targetX - this.x) * 0.45;
            this.y += (targetY - this.y) * 0.45;
            this.z = 0;
            this.heading = pose.heading;
            this.vx = Math.cos(pose.heading) * this.speed;
            this.vy = Math.sin(pose.heading) * this.speed;

            // 4. Smooth speed recovery
            if (this.speed < this.baseSpeed) {
                this.speed = Math.min(this.baseSpeed, this.speed + 140 * dt);
            }
        }

        draw(ctx) {}
    }

    // =========================================================================
    // SECTION 7: PARTICLES & FLOATING DAMAGE NUMBERS
    // =========================================================================
    class ParticleSystem {
        constructor() {
            this.particles = [];
        }

        emitImpactSparks(x, y, count = 10) {
            for (let i = 0; i < count; i++) {
                const angle = Math.random() * Math.PI * 2;
                const speed = 60 + Math.random() * 150;
                this.particles.push({
                    x, y,
                    vx: Math.cos(angle) * speed,
                    vy: Math.sin(angle) * speed,
                    life: 0.22 + Math.random() * 0.18,
                    maxLife: 0.4,
                    size: 2 + Math.random() * 3,
                    color: Math.random() > 0.4 ? '#facc15' : '#ef4444'
                });
            }
        }

        emitHoodSmoke(x, y) {
            this.particles.push({
                x: x + (Math.random() - 0.5) * 12,
                y: y + (Math.random() - 0.5) * 12,
                vx: (Math.random() - 0.5) * 20,
                vy: -35 - Math.random() * 25,
                life: 0.55,
                maxLife: 0.55,
                size: 6 + Math.random() * 7,
                color: 'rgba(55, 65, 81, 0.45)'
            });
        }

        update(dt) {
            for (let i = this.particles.length - 1; i >= 0; i--) {
                const p = this.particles[i];
                p.life -= dt;
                if (p.life <= 0) {
                    this.particles.splice(i, 1);
                    continue;
                }
                p.x += p.vx * dt;
                p.y += p.vy * dt;
            }
        }

        draw(ctx) {}
    }

    // =========================================================================
    // SECTION 8: CORE GAME CONTROLLER & COLLISION LOGIC
    // =========================================================================
    let canvas, ctx;
    let threeRenderer;
    let sound, input, world, particles;
    let player;
    let policeCruisers = [];
    let trafficCars = [];

    let gameState = 'COUNTDOWN';
    let runTimer = CONFIG.RUN_DURATION;
    let displayedScore = CONFIG.STARTING_SCORE;
    let totalDamageTaken = 0;
    let totalCollisions = 0;
    // countdown replaced by TAP TO PLAY
    let cameraShake = 0;
    let currentTier = INTENSITY_TIERS[0];

    function inCameraView(x, y, margin = 160) {
        if (!canvas || !player) return false;
        const dist = Math.hypot(x - player.x, y - player.y);
        return dist < CONFIG.DESPAWN_DISTANCE + margin;
    }

    function isAreaClear(x, y, radius = 30) {
        const nearbyBuildings = world.getNearbyBuildings(x, y, radius + 20);
        for (let b of nearbyBuildings) {
            if (x > b.x - b.width / 2 - radius && x < b.x + b.width / 2 + radius &&
                y > b.y - b.height / 2 - radius && y < b.y + b.height / 2 + radius) {
                return false;
            }
        }
        for (let p of policeCruisers) {
            if (Math.hypot(x - p.x, y - p.y) < radius + p.radius + 20) return false;
        }
        for (let t of trafficCars) {
            if (Math.hypot(x - t.x, y - t.y) < radius + t.radius + 20) return false;
        }
        return true;
    }

    function spawnVehicleOffScreen(isPolice) {
        const candChunks = [];
        for (let c of world.chunks.values()) {
            const dist = Math.hypot(c.midX - player.x, c.midY - player.y);
            if (dist >= CONFIG.MIN_SPAWN_DIST - 80 && dist <= CONFIG.MAX_SPAWN_DIST + 80) {
                if (c.navSegments && c.navSegments.length > 0) candChunks.push(c);
            }
        }

        if (candChunks.length === 0) return false;

        for (let attempt = 0; attempt < 30; attempt++) {
            const chunk = candChunks[Math.floor(Math.random() * candChunks.length)];
            const segment = chunk.navSegments[Math.floor(Math.random() * chunk.navSegments.length)];
            const distOnSeg = Math.random() * segment.length;
            const pose = segment.getPose(distOnSeg);

            const laneOffset = 22;
            const candX = pose.x + (-Math.sin(pose.heading)) * laneOffset;
            const candY = pose.y + (Math.cos(pose.heading)) * laneOffset;
            const heading = pose.heading;

            const dist = Math.hypot(candX - player.x, candY - player.y);
            if (dist < CONFIG.MIN_SPAWN_DIST || dist > CONFIG.MAX_SPAWN_DIST) continue;

            if (!isAreaClear(candX, candY, 32)) continue;

            if (isPolice) {
                const p = new PoliceVehicle(candX, candY, heading);
                policeCruisers.push(p);
            } else {
                const t = new TrafficVehicle(candX, candY, heading, Math.floor(Math.random() * 4));
                t.currentSegment = segment;
                t.distanceAlongSegment = distOnSeg;
                t.laneOffset = laneOffset;
                trafficCars.push(t);
            }
            return true;
        }
        return false;
    }

    function showFloatingDamage(x, y, amount, severityClass) {
        const container = document.getElementById('damage-numbers-layer');
        if (!container || !threeRenderer) return;

        const p = threeRenderer.projectToScreen(x, y, 1.2);
        if (!p) return;

        const el = document.createElement('div');
        el.className = `floating-dmg ${severityClass}`;
        el.textContent = `-${Math.round(amount)}`;
        el.style.left = `${p.x}px`;
        el.style.top = `${p.y}px`;
        container.appendChild(el);

        setTimeout(() => {
            if (el.parentNode) el.parentNode.removeChild(el);
        }, 850);
    }

    function damagePlayer(rawDamage, collisionX, collisionY) {
        if (gameState !== 'PLAYING') return;

        const now = performance.now() / 1000;
        if (now - player.lastDamageTime < CONFIG.DAMAGE_DEBOUNCE) return;
        player.lastDamageTime = now;

        const actualDamage = Math.max(SCORE_DAMAGE_BRACKETS.LIGHT_MIN, Math.min(SCORE_DAMAGE_BRACKETS.CRUSH_MAX, rawDamage));
        player.score = Math.max(0, player.score - actualDamage);
        totalDamageTaken += actualDamage;
        totalCollisions++;

        let severityClass = 'severity-normal';
        let severityFraction = 0.45;
        if (actualDamage <= SCORE_DAMAGE_BRACKETS.LIGHT_MAX) {
            severityClass = 'severity-light';
            severityFraction = 0.25;
            cameraShake = 3.0;
        } else if (actualDamage <= SCORE_DAMAGE_BRACKETS.NORMAL_MAX) {
            severityClass = 'severity-normal';
            severityFraction = 0.55;
            cameraShake = 5.0;
        } else if (actualDamage <= SCORE_DAMAGE_BRACKETS.HEAVY_MAX) {
            severityClass = 'severity-strong';
            severityFraction = 0.78;
            cameraShake = 7.0;
        } else {
            severityClass = 'severity-heavy';
            severityFraction = 1.0;
            cameraShake = 9.0;
        }

        const scoreCapsule = document.getElementById('hud-score-capsule');
        if (scoreCapsule) {
            scoreCapsule.classList.remove('score-damaged');
            void scoreCapsule.offsetWidth;
            scoreCapsule.classList.add('score-damaged');
            setTimeout(() => {
                if (scoreCapsule) scoreCapsule.classList.remove('score-damaged');
            }, 350);
        }

        showFloatingDamage(collisionX, collisionY, actualDamage, severityClass);
        particles.emitImpactSparks(collisionX, collisionY, Math.round(actualDamage * 0.025));
        if (sound) sound.playCrashSound(severityFraction);

        updateHUD();

        if (player.score <= 0) {
            player.score = 0;
            endGame('DESTROYED');
        }
    }

    function updateHUD() {
        if (Math.abs(displayedScore - player.score) > 2) {
            displayedScore += (player.score - displayedScore) * 0.22;
        } else {
            displayedScore = player.score;
        }

        const scoreText = document.getElementById('hud-score-text');
        const scoreFill = document.getElementById('hud-score-fill');
        if (scoreText) {
            scoreText.textContent = Math.round(displayedScore).toLocaleString();
        }
        if (scoreFill) {
            const pct = Math.max(0, Math.min(100, (player.score / CONFIG.STARTING_SCORE) * 100));
            scoreFill.style.width = `${pct}%`;

            scoreFill.classList.remove('healthy', 'warning', 'critical');
            if (pct > 55) {
                scoreFill.classList.add('healthy');
            } else if (pct > 25) {
                scoreFill.classList.add('warning');
            } else {
                scoreFill.classList.add('critical');
            }
        }

        const timerEl = document.getElementById('hud-timer');
        if (timerEl) {
            timerEl.textContent = `${Math.max(0, runTimer).toFixed(1)}s`;
            if (runTimer <= 10.0) {
                timerEl.classList.add('timer-ending');
            } else {
                timerEl.classList.remove('timer-ending');
            }
        }

        const heatLabel = document.getElementById('hud-heat-label');
        const heatStars = document.getElementById('hud-heat-stars');
        if (heatLabel && currentTier) {
            heatLabel.textContent = currentTier.heatLabel;
        }
        if (heatStars && currentTier) {
            heatStars.textContent = currentTier.heatStars;
        }
    }

    let gameOverSoundPlayed = false;

    function endGame(outcome) {
        if (gameState !== 'PLAYING') return;
        gameState = outcome;
        input.locked = true;

        // 1. Immediately stop ALL currently playing looping gameplay sounds
        if (sound) {
            sound.stopAllGameplaySounds();
        }

        // 2. Play exactly ONE single blast/explosion-style game-over sound
        if (outcome === 'DESTROYED') {
            if (!gameOverSoundPlayed) {
                gameOverSoundPlayed = true;
                if (sound) {
                    sound.playGameOverBlast();
                }
            }
        }

        const resultScreen = document.getElementById('result-screen');
        const header = document.getElementById('result-header');
        const resTime = document.getElementById('res-time');
        const resScore = document.getElementById('res-score');
        const resDmg = document.getElementById('res-damage');
        const resCol = document.getElementById('res-collisions');

        if (!resultScreen) return;

        const survivedSecs = (CONFIG.RUN_DURATION - runTimer).toFixed(1);

        if (outcome === 'SURVIVED') {
            header.textContent = 'SURVIVED!';
            header.className = 'result-title survived';
            if (resTime) resTime.textContent = '90.0s';
            if (resScore) resScore.textContent = Math.round(player.score).toLocaleString();
        } else {
            header.textContent = 'VEHICLE DESTROYED';
            header.className = 'result-title destroyed';
            if (resTime) resTime.textContent = `${survivedSecs}s`;
            if (resScore) resScore.textContent = '0';
        }

        if (resDmg) resDmg.textContent = Math.round(totalDamageTaken).toLocaleString();
        if (resCol) resCol.textContent = totalCollisions.toString();

        resultScreen.classList.remove('hidden');
    }

    function checkCollisions(dt) {
        if (gameState !== 'PLAYING') return;

        // 1. Player vs Buildings
        const nearbyBuildings = world.getNearbyBuildings(player.x, player.y, 160);
        for (let b of nearbyBuildings) {
            const hbw = b.width / 2;
            const hbh = b.height / 2;
            const nearestX = Math.max(b.x - hbw, Math.min(player.x, b.x + hbw));
            const nearestY = Math.max(b.y - hbh, Math.min(player.y, b.y + hbh));
            const distX = player.x - nearestX;
            const distY = player.y - nearestY;
            const distSq = distX * distX + distY * distY;

            if (distSq < player.radius * player.radius) {
                const dist = Math.sqrt(distSq) || 0.001;
                const overlap = player.radius - dist;
                const nx = distX / dist;
                const ny = distY / dist;

                player.x += nx * overlap;
                player.y += ny * overlap;

                const impactSpeed = Math.abs(player.speed);
                player.speed = -player.speed * 0.35;
                damagePlayer(360 + impactSpeed * 1.15, nearestX, nearestY);
            }
        }

        // 2. Player vs Nature
        const nearbyNature = world.getNearbyNature(player.x, player.y, 140);
        for (let t of nearbyNature.trees) {
            const dx = player.x - t.x;
            const dy = player.y - t.y;
            const minDist = player.radius + t.radius * 0.65;
            if (dx * dx + dy * dy < minDist * minDist) {
                const dist = Math.hypot(dx, dy) || 0.001;
                const overlap = minDist - dist;
                player.x += (dx / dist) * overlap;
                player.y += (dy / dist) * overlap;
                const impactSpeed = Math.abs(player.speed);
                player.speed = -player.speed * 0.4;
                damagePlayer(220 + impactSpeed * 0.85, t.x, t.y);
            }
        }

        for (let b of nearbyNature.boulders) {
            const dx = player.x - b.x;
            const dy = player.y - b.y;
            const minDist = player.radius + b.radius;
            if (dx * dx + dy * dy < minDist * minDist) {
                const dist = Math.hypot(dx, dy) || 0.001;
                const overlap = minDist - dist;
                player.x += (dx / dist) * overlap;
                player.y += (dy / dist) * overlap;
                const impactSpeed = Math.abs(player.speed);
                player.speed = -player.speed * 0.4;
                damagePlayer(380 + impactSpeed * 1.2, b.x, b.y);
            }
        }

        // 3. Player vs Police
        for (let p of policeCruisers) {
            const dx = player.x - p.x;
            const dy = player.y - p.y;
            const minDist = player.radius + p.radius;
            if (dx * dx + dy * dy < minDist * minDist) {
                const dist = Math.hypot(dx, dy) || 0.001;
                const overlap = minDist - dist;
                const nx = dx / dist;
                const ny = dy / dist;

                player.x += nx * overlap * 0.5;
                player.y += ny * overlap * 0.5;
                p.x -= nx * overlap * 0.5;
                p.y -= ny * overlap * 0.5;

                const relSpeed = Math.hypot(player.vx - p.vx, player.vy - p.vy);
                // Police collision damage reduced by exactly 50%
                damagePlayer((340 + relSpeed * 0.95) * 0.5, (player.x + p.x) / 2, (player.y + p.y) / 2);
            }
        }

        // 4. Player vs Traffic
        if (!player.isAirborne) {
            for (let t of trafficCars) {
                const dx = player.x - t.x;
                const dy = player.y - t.y;
                const minDist = player.radius + t.radius;
                if (dx * dx + dy * dy < minDist * minDist) {
                    const dist = Math.hypot(dx, dy) || 0.001;
                    const overlap = minDist - dist;
                    const nx = dx / dist;
                    const ny = dy / dist;

                    player.x += nx * overlap * 0.6;
                    player.y += ny * overlap * 0.6;
                    t.x -= nx * overlap * 0.4;
                    t.y -= ny * overlap * 0.4;

                    const relSpeed = Math.hypot(player.vx - t.vx, player.vy - t.vy);
                    damagePlayer(260 + relSpeed * 0.8, (player.x + t.x) / 2, (player.y + t.y) / 2);
                }
            }
        }

        // 5. Police vs Buildings
        for (let p of policeCruisers) {
            const pBuildings = world.getNearbyBuildings(p.x, p.y, p.radius + 30);
            for (let b of pBuildings) {
                const hbw = b.width / 2;
                const hbh = b.height / 2;
                const nx = Math.max(b.x - hbw, Math.min(p.x, b.x + hbw));
                const ny = Math.max(b.y - hbh, Math.min(p.y, b.y + hbh));
                const distX = p.x - nx;
                const distY = p.y - ny;
                const distSq = distX * distX + distY * distY;
                if (distSq < p.radius * p.radius) {
                    const dist = Math.sqrt(distSq) || 0.001;
                    p.x += (distX / dist) * (p.radius - dist);
                    p.y += (distY / dist) * (p.radius - dist);
                    p.speed *= -0.3;
                }
            }
        }

        // 6. Traffic vs Buildings
        for (let t of trafficCars) {
            const tBuildings = world.getNearbyBuildings(t.x, t.y, t.radius + 30);
            for (let b of tBuildings) {
                const hbw = b.width / 2;
                const hbh = b.height / 2;
                const nx = Math.max(b.x - hbw, Math.min(t.x, b.x + hbw));
                const ny = Math.max(b.y - hbh, Math.min(t.y, b.y + hbh));
                const distX = t.x - nx;
                const distY = t.y - ny;
                const distSq = distX * distX + distY * distY;
                if (distSq < t.radius * t.radius) {
                    const dist = Math.sqrt(distSq) || 0.001;
                    t.x += (distX / dist) * (t.radius - dist);
                    t.y += (distY / dist) * (t.radius - dist);
                    const rep = world.getNearestRoadPoint(t.x, t.y);
                    t.heading = rep.heading;
                }
            }
        }
    }

    // =========================================================================
    // SECTION 9: WEBGL / THREE.JS 3D ARCADE RENDERING ENGINE
    // =========================================================================
    class ThreeRenderer {
        constructor(canvas) {
            this.canvas = canvas;
            this.SCALE = SCALE_3D;

            // 1. High-Performance WebGL Renderer
            this.renderer = new THREE.WebGLRenderer({
                canvas: canvas,
                antialias: true,
                powerPreference: 'high-performance',
                alpha: false
            });
            this.renderer.setSize(window.innerWidth, window.innerHeight);
            this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
            this.renderer.shadowMap.enabled = true;
            this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

            // 2. Scene with Horizon Dusk Sky & Smooth Fog
            this.scene = new THREE.Scene();
            this.scene.background = new THREE.Color(0x111625);
            this.scene.fog = new THREE.FogExp2(0x111625, 0.0055);

            // 3. Low Grounded Third-Person Driving Camera (Mobile ~80% wider arcade view, desktop unchanged)
            const isMobile = this.isMobileDevice();
            const fov = isMobile ? 70 : 58;
            this.camera = new THREE.PerspectiveCamera(fov, window.innerWidth / window.innerHeight, 0.2, 500);

            const camDist = isMobile ? 11.2 : 8.0;
            const camHeight = isMobile ? 3.65 : 2.65;
            const lookAheadDist = isMobile ? 24.0 : 19.0;
            const lookAtY = isMobile ? 1.15 : 0.95;

            this.camLookAt = new THREE.Vector3(0, lookAtY, -lookAheadDist);
            this.camPos = new THREE.Vector3(0, camHeight, camDist);
            this.camera.position.copy(this.camPos);
            this.camera.lookAt(this.camLookAt);
            this.camInitialized = false;

            // 4. Lights: Ambient, Directional Sunlight with Shadows, Hemisphere Sky/Ground
            this.ambientLight = new THREE.AmbientLight(0xdde5f5, 0.85);
            this.scene.add(this.ambientLight);

            this.hemiLight = new THREE.HemisphereLight(0x8cb6f7, 0x224218, 0.55);
            this.scene.add(this.hemiLight);

            this.sunLight = new THREE.DirectionalLight(0xfffaed, 1.25);
            this.sunLight.position.set(30, 60, 25);
            this.sunLight.castShadow = true;
            this.sunLight.shadow.mapSize.width = 1024;
            this.sunLight.shadow.mapSize.height = 1024;
            this.sunLight.shadow.camera.near = 10;
            this.sunLight.shadow.camera.far = 160;
            const d = 45;
            this.sunLight.shadow.camera.left = -d;
            this.sunLight.shadow.camera.right = d;
            this.sunLight.shadow.camera.top = d;
            this.sunLight.shadow.camera.bottom = -d;
            this.sunLight.shadow.bias = -0.0005;
            this.scene.add(this.sunLight);
            this.scene.add(this.sunLight.target);

            // 5. Shared Geometries & Materials
            this.initSharedResources();

            // 6. Base Grass Ground Plane
            this.initGround();

            // 7. Dynamic Object Tracking
            this.chunkGroups = new Map();
            this.chunkBuildQueue = [];
            this.buildQueueKeys = new Set();
            this.vehicleMeshes = new Map();
            this.particleMeshes = [];
        }

        initSharedResources() {
            // Geometries
            this.geoWheel = new THREE.CylinderGeometry(0.38, 0.38, 0.24, 14);
            this.geoWheel.rotateZ(Math.PI / 2);

            this.geoRim = new THREE.CylinderGeometry(0.24, 0.24, 0.25, 8);
            this.geoRim.rotateZ(Math.PI / 2);

            this.geoShadow = new THREE.PlaneGeometry(1, 1);
            this.geoShadow.rotateX(-Math.PI / 2);

            this.geoSpark = new THREE.BoxGeometry(0.25, 0.25, 0.25);

            // Shared Unit Geometries for Instantaneous Zero-Allocation Chunk Rendering
            this.sharedBoxGeo = new THREE.BoxGeometry(1, 1, 1);
            this.sharedBoxGeo.userData = { isShared: true };

            this.sharedPlaneGeo = new THREE.PlaneGeometry(1, 1);
            this.sharedPlaneGeo.rotateX(-Math.PI / 2);
            this.sharedPlaneGeo.userData = { isShared: true };

            this.sharedCylinderGeo = new THREE.CylinderGeometry(0.5, 0.5, 1, 12);
            this.sharedCylinderGeo.userData = { isShared: true };

            // Barricade Hazard Materials
            this.matHazardYellow = new THREE.MeshLambertMaterial({ color: 0xfacc15 });
            this.matHazardBlack = new THREE.MeshLambertMaterial({ color: 0x18181b });
            this.matHazardRed = new THREE.MeshLambertMaterial({ color: 0xef4444 });
            this.matConcrete = new THREE.MeshLambertMaterial({ color: 0x94a3b8 });

            // Materials
            this.matTire = new THREE.MeshLambertMaterial({ color: 0x18181b });
            this.matRim = new THREE.MeshStandardMaterial({ color: 0xd4d4d8, metalness: 0.8, roughness: 0.3 });
            this.matShadow = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.45, depthWrite: false });
            this.matHeadlight = new THREE.MeshBasicMaterial({ color: 0xfef08a });
            this.matTaillight = new THREE.MeshBasicMaterial({ color: 0xef4444 });
            this.matBrakeLight = new THREE.MeshBasicMaterial({ color: 0xff1111 });
            this.matGlass = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.1, metalness: 0.85 });
            this.matChrome = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.9, roughness: 0.15 });

            // Road & Markings Materials
            this.matAsphalt = new THREE.MeshLambertMaterial({ color: 0x1d222a });
            this.matCurb = new THREE.MeshLambertMaterial({ color: 0x64748b });
            this.matSidewalk = new THREE.MeshLambertMaterial({ color: 0x475569 });
            this.matYellowLine = new THREE.MeshBasicMaterial({ color: 0xf59e0b });
            this.matWhiteLine = new THREE.MeshBasicMaterial({ color: 0xf8fafc });
            this.matCrosswalk = new THREE.MeshBasicMaterial({ color: 0xe2e8f0 });

            // Scenery Materials
            this.matTrunk = new THREE.MeshLambertMaterial({ color: 0x5c3d2e });
            this.matFoliage1 = new THREE.MeshLambertMaterial({ color: 0x15803d });
            this.matFoliage2 = new THREE.MeshLambertMaterial({ color: 0x166534 });
            this.matBoulder = new THREE.MeshLambertMaterial({ color: 0x6b7280 });
            this.matStreetlight = new THREE.MeshLambertMaterial({ color: 0x334155 });
            this.matLampGlow = new THREE.MeshBasicMaterial({ color: 0xfef3c7 });
        }

        initGround() {
            const groundGeo = new THREE.PlaneGeometry(1600, 1600);
            groundGeo.rotateX(-Math.PI / 2);
            const groundMat = new THREE.MeshLambertMaterial({ color: 0x1a3814 });
            this.groundMesh = new THREE.Mesh(groundGeo, groundMat);
            this.groundMesh.position.y = -0.05;
            this.groundMesh.receiveShadow = true;
            this.scene.add(this.groundMesh);
        }

        createWheel(isFront = false) {
            const group = new THREE.Group();
            const tire = new THREE.Mesh(this.geoWheel, this.matTire);
            tire.castShadow = true;
            group.add(tire);
            const rim = new THREE.Mesh(this.geoRim, this.matRim);
            group.add(rim);
            return group;
        }

        createContactShadow(width, length) {
            const shadow = new THREE.Mesh(this.geoShadow, this.matShadow);
            shadow.scale.set(width * 1.15, 1, length * 1.05);
            shadow.position.y = 0.006;
            return shadow;
        }

        // --- 3D VEHICLE BUILDERS ---
        buildPlayerMesh() {
            const car = new THREE.Group();
            const bodyColor = 0xe63946; // Vermilion Red

            // 1. Tight Ground Contact Shadow
            const shadow = this.createContactShadow(2.4, 4.6);
            car.add(shadow);

            // 2. Chassis Lower Skirt & Diffuser
            const skirtGeo = new THREE.BoxGeometry(2.35, 0.25, 4.5);
            const skirtMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.5 });
            const skirt = new THREE.Mesh(skirtGeo, skirtMat);
            skirt.position.y = 0.28;
            skirt.castShadow = true;
            car.add(skirt);

            // Dual Chrome Exhaust Tips at rear
            [-0.5, 0.5].forEach(xOff => {
                const exhGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.25, 8);
                exhGeo.rotateX(Math.PI / 2);
                const exh = new THREE.Mesh(exhGeo, this.matChrome);
                exh.position.set(xOff, 0.24, 2.28);
                car.add(exh);
            });

            // 3. Main Sports Body
            const bodyGeo = new THREE.BoxGeometry(2.28, 0.38, 4.3);
            const bodyMat = new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.35, metalness: 0.25 });
            const body = new THREE.Mesh(bodyGeo, bodyMat);
            body.position.y = 0.52;
            body.castShadow = true;
            car.add(body);

            // Front Bumper Splitter
            const splitterGeo = new THREE.BoxGeometry(2.32, 0.08, 0.4);
            const splitter = new THREE.Mesh(splitterGeo, skirtMat);
            splitter.position.set(0, 0.22, -2.18);
            car.add(splitter);

            // 4. Cabin & Tinted Windows
            const cabinGeo = new THREE.BoxGeometry(1.82, 0.44, 2.2);
            const cabin = new THREE.Mesh(cabinGeo, this.matGlass);
            cabin.position.set(0, 0.88, 0.15);
            cabin.castShadow = true;
            car.add(cabin);

            // Roof Panel
            const roofGeo = new THREE.BoxGeometry(1.72, 0.06, 1.8);
            const roof = new THREE.Mesh(roofGeo, bodyMat);
            roof.position.set(0, 1.11, 0.2);
            car.add(roof);

            // Dual White Racing Stripes down Hood, Roof and Trunk
            const stripeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
            [-0.2, 0.2].forEach(xOff => {
                const stripeGeo = new THREE.BoxGeometry(0.12, 0.02, 4.32);
                const stripe = new THREE.Mesh(stripeGeo, stripeMat);
                stripe.position.set(xOff, 0.72, 0);
                car.add(stripe);

                const roofStripeGeo = new THREE.BoxGeometry(0.12, 0.02, 1.82);
                const roofStripe = new THREE.Mesh(roofStripeGeo, stripeMat);
                roofStripe.position.set(xOff, 1.15, 0.2);
                car.add(roofStripe);
            });

            // 5. Raised Racing Rear Spoiler
            [-0.75, 0.75].forEach(xOff => {
                const strutGeo = new THREE.BoxGeometry(0.08, 0.32, 0.12);
                const strut = new THREE.Mesh(strutGeo, skirtMat);
                strut.position.set(xOff, 0.86, 2.0);
                car.add(strut);
            });
            const wingGeo = new THREE.BoxGeometry(2.35, 0.06, 0.42);
            const wing = new THREE.Mesh(wingGeo, bodyMat);
            wing.position.set(0, 1.03, 2.0);
            car.add(wing);

            // 6. Xenon Headlights
            [-0.8, 0.8].forEach(xOff => {
                const hlGeo = new THREE.BoxGeometry(0.35, 0.14, 0.08);
                const hl = new THREE.Mesh(hlGeo, this.matHeadlight);
                hl.position.set(xOff, 0.52, -2.16);
                car.add(hl);
            });

            // 7. LED Taillights
            const tlGeo = new THREE.BoxGeometry(2.1, 0.12, 0.08);
            const tl = new THREE.Mesh(tlGeo, this.matTaillight);
            tl.position.set(0, 0.54, 2.16);
            car.add(tl);
            car.userData.taillight = tl;

            // 8. 4 Wheels Touching Ground (R = 0.38, Center Y = 0.38 => Bottom at Y = 0.00)
            const frontWheels = [];
            const fl = this.createWheel(true); fl.position.set(-1.12, 0.38, -1.35); car.add(fl); frontWheels.push(fl);
            const fr = this.createWheel(true); fr.position.set(1.12, 0.38, -1.35); car.add(fr); frontWheels.push(fr);
            const rl = this.createWheel(false); rl.position.set(-1.12, 0.38, 1.35); car.add(rl);
            const rr = this.createWheel(false); rr.position.set(1.12, 0.38, 1.35); car.add(rr);
            car.userData.frontWheels = frontWheels;

            return car;
        }

        buildPoliceMesh() {
            const car = new THREE.Group();

            // 1. Contact Shadow
            const shadow = this.createContactShadow(2.4, 4.8);
            car.add(shadow);

            // 2. High-Contrast Black & White Body
            const matBlack = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.35 });
            const matWhite = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.35 });

            // Lower Chassis
            const baseGeo = new THREE.BoxGeometry(2.32, 0.42, 4.6);
            const base = new THREE.Mesh(baseGeo, matBlack);
            base.position.y = 0.48;
            base.castShadow = true;
            car.add(base);

            // White Door Panels
            [-1.17, 1.17].forEach(xOff => {
                const doorGeo = new THREE.BoxGeometry(0.04, 0.38, 1.8);
                const door = new THREE.Mesh(doorGeo, matWhite);
                door.position.set(xOff, 0.48, 0.1);
                car.add(door);
            });

            // Heavy Front Pushbar / Bullbar
            const pushbarGeo = new THREE.BoxGeometry(1.9, 0.38, 0.16);
            const pushbar = new THREE.Mesh(pushbarGeo, new THREE.MeshStandardMaterial({ color: 0x09090b, roughness: 0.7 }));
            pushbar.position.set(0, 0.45, -2.38);
            car.add(pushbar);

            // 3. Cabin & White Roof
            const cabinGeo = new THREE.BoxGeometry(1.84, 0.46, 2.2);
            const cabin = new THREE.Mesh(cabinGeo, this.matGlass);
            cabin.position.set(0, 0.88, 0.15);
            car.add(cabin);

            const roofGeo = new THREE.BoxGeometry(1.74, 0.06, 1.8);
            const roof = new THREE.Mesh(roofGeo, matWhite);
            roof.position.set(0, 1.12, 0.2);
            car.add(roof);

            // 4. Roof Emergency Dual Strobe Lightbar
            const barBaseGeo = new THREE.BoxGeometry(1.1, 0.08, 0.26);
            const barBase = new THREE.Mesh(barBaseGeo, matBlack);
            barBase.position.set(0, 1.18, 0.15);
            car.add(barBase);

            const redStrobeMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, emissive: 0xdc2626, emissiveIntensity: 1.0 });
            const redStrobeGeo = new THREE.BoxGeometry(0.44, 0.12, 0.22);
            const redStrobe = new THREE.Mesh(redStrobeGeo, redStrobeMat);
            redStrobe.position.set(-0.35, 1.25, 0.15);
            car.add(redStrobe);

            const blueStrobeMat = new THREE.MeshStandardMaterial({ color: 0x2563eb, emissive: 0x2563eb, emissiveIntensity: 1.0 });
            const blueStrobeGeo = new THREE.BoxGeometry(0.44, 0.12, 0.22);
            const blueStrobe = new THREE.Mesh(blueStrobeGeo, blueStrobeMat);
            blueStrobe.position.set(0.35, 1.25, 0.15);
            car.add(blueStrobe);

            car.userData.redStrobe = redStrobe;
            car.userData.blueStrobe = blueStrobe;

            // 5. Headlights & Taillights
            [-0.8, 0.8].forEach(xOff => {
                const hlGeo = new THREE.BoxGeometry(0.32, 0.12, 0.06);
                const hl = new THREE.Mesh(hlGeo, this.matHeadlight);
                hl.position.set(xOff, 0.5, -2.31);
                car.add(hl);
            });
            const tlGeo = new THREE.BoxGeometry(2.1, 0.12, 0.06);
            const tl = new THREE.Mesh(tlGeo, this.matTaillight);
            tl.position.set(0, 0.52, 2.31);
            car.add(tl);

            // 6. 4 Wheels Touching Ground
            const fl = this.createWheel(true); fl.position.set(-1.12, 0.38, -1.4); car.add(fl);
            const fr = this.createWheel(true); fr.position.set(1.12, 0.38, -1.4); car.add(fr);
            const rl = this.createWheel(false); rl.position.set(-1.12, 0.38, 1.4); car.add(rl);
            const rr = this.createWheel(false); rr.position.set(1.12, 0.38, 1.4); car.add(rr);

            return car;
        }

        buildTrafficMesh(t) {
            const car = new THREE.Group();
            const colorHex = parseInt((t.color || '#2563eb').replace('#', '0x'), 16);
            const matPaint = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.38 });

            const length = (t.length || 44) * this.SCALE;
            const width = (t.width || 22) * this.SCALE;

            // 1. Shadow
            const shadow = this.createContactShadow(width, length);
            car.add(shadow);

            const halfL = length / 2;
            const halfW = width / 2;

            if (t.typeIndex === 3) {
                // Delivery Box Truck (Proper colored body, distinct cargo container, bumpers, windows, wheels & lights)
                const cabColorHex = parseInt((t.cabColor || t.color || '#ea580c').replace('#', '0x'), 16);
                const matCab = new THREE.MeshStandardMaterial({ color: cabColorHex, roughness: 0.35, metalness: 0.2 });
                // Dark slate / steel cargo container with proper 3D shading
                const matCargoBox = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.45, metalness: 0.3 });
                const matBoxStripe = new THREE.MeshStandardMaterial({ color: cabColorHex, roughness: 0.35 });
                const matBumper = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.7 });
                const matRollDoor = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.5 });

                const cabLength = length * 0.36;
                const boxLength = length * 0.62;

                // 1. Heavy Front & Rear Bumpers
                const fBumper = new THREE.Mesh(new THREE.BoxGeometry(width * 1.02, 0.28, 0.16), matBumper);
                fBumper.position.set(0, 0.32, -halfL + 0.08);
                car.add(fBumper);

                const rBumper = new THREE.Mesh(new THREE.BoxGeometry(width * 1.02, 0.24, 0.14), matBumper);
                rBumper.position.set(0, 0.28, halfL - 0.06);
                car.add(rBumper);

                // 2. Cab Body
                const cabZ = -halfL + cabLength / 2 + 0.12;
                const cab = new THREE.Mesh(new THREE.BoxGeometry(width * 0.96, 1.15, cabLength), matCab);
                cab.position.set(0, 0.88, cabZ);
                cab.castShadow = true;
                car.add(cab);

                // Front Radiator Grille
                const grille = new THREE.Mesh(new THREE.BoxGeometry(width * 0.7, 0.45, 0.04), matBumper);
                grille.position.set(0, 0.62, cabZ - cabLength / 2 - 0.02);
                car.add(grille);

                // Tinted Windshield
                const windshield = new THREE.Mesh(new THREE.BoxGeometry(width * 0.88, 0.44, 0.04), this.matGlass);
                windshield.position.set(0, 1.12, cabZ - cabLength / 2 - 0.02);
                car.add(windshield);

                // Side Windows
                [-width * 0.48, width * 0.48].forEach(xOff => {
                    const sideWin = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.4, cabLength * 0.45), this.matGlass);
                    sideWin.position.set(xOff, 1.12, cabZ - cabLength * 0.1);
                    car.add(sideWin);
                });

                // Cab Roof Aerodynamic Wind Fairing
                const fairing = new THREE.Mesh(new THREE.BoxGeometry(width * 0.9, 0.38, cabLength * 0.55), matCab);
                fairing.position.set(0, 1.58, cabZ + cabLength * 0.2);
                fairing.rotation.x = -0.25;
                car.add(fairing);

                // Amber Cab Clearance Lights
                [-0.5, 0, 0.5].forEach(xOff => {
                    const cLight = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.06, 0.06), this.matYellowLine);
                    cLight.position.set(xOff, 1.52, cabZ - cabLength / 2);
                    car.add(cLight);
                });

                // 3. Cargo Container Box
                const boxZ = halfL - boxLength / 2;
                const box = new THREE.Mesh(new THREE.BoxGeometry(width * 1.04, 1.85, boxLength), matCargoBox);
                box.position.set(0, 1.35, boxZ);
                box.castShadow = true;
                car.add(box);

                // Colored Corporate Livery Stripe along cargo box
                [-width * 0.525, width * 0.525].forEach(xOff => {
                    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.35, boxLength * 0.92), matBoxStripe);
                    stripe.position.set(xOff, 1.35, boxZ);
                    car.add(stripe);
                });

                // Rear Roll-up Door Frame & Panel
                const rollDoor = new THREE.Mesh(new THREE.BoxGeometry(width * 0.88, 1.55, 0.04), matRollDoor);
                rollDoor.position.set(0, 1.32, halfL + 0.01);
                car.add(rollDoor);

                // 4. Undercarriage Chassis Rail & Side Fuel Tank
                const rail = new THREE.Mesh(new THREE.BoxGeometry(width * 0.75, 0.22, length * 0.9), matBumper);
                rail.position.set(0, 0.32, 0);
                car.add(rail);

                const fuelTank = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 1.1, 8), this.matRim);
                fuelTank.rotateZ(Math.PI / 2);
                fuelTank.position.set(-width * 0.44, 0.36, -0.2);
                car.add(fuelTank);

                // 5. Headlights & Taillights
                [-width * 0.38, width * 0.38].forEach(xOff => {
                    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.14, 0.06), this.matHeadlight);
                    hl.position.set(xOff, 0.52, -halfL + 0.05);
                    car.add(hl);
                });

                [-width * 0.42, width * 0.42].forEach(xOff => {
                    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.14, 0.06), this.matTaillight);
                    tl.position.set(xOff, 0.45, halfL + 0.02);
                    car.add(tl);
                });

                // 6. 6 Heavy-Duty Wheels Touching Ground (R = 0.38, Center Y = 0.38 => Bottom Y = 0.00)
                const axleX = halfW * 0.95;
                const fl = this.createWheel(); fl.position.set(-axleX, 0.38, -halfL + 0.9); car.add(fl);
                const fr = this.createWheel(); fr.position.set(axleX, 0.38, -halfL + 0.9); car.add(fr);
                const rl1 = this.createWheel(); rl1.position.set(-axleX, 0.38, halfL - 1.6); car.add(rl1);
                const rr1 = this.createWheel(); rr1.position.set(axleX, 0.38, halfL - 1.6); car.add(rr1);
                const rl2 = this.createWheel(); rl2.position.set(-axleX, 0.38, halfL - 0.7); car.add(rl2);
                const rr2 = this.createWheel(); rr2.position.set(axleX, 0.38, halfL - 0.7); car.add(rr2);
            } else if (t.typeIndex === 2) {
                // Rugged SUV
                const bodyGeo = new THREE.BoxGeometry(width, 0.5, length);
                const body = new THREE.Mesh(bodyGeo, matPaint);
                body.position.y = 0.55;
                body.castShadow = true;
                car.add(body);

                const cabinGeo = new THREE.BoxGeometry(width * 0.85, 0.65, length * 0.65);
                const cabin = new THREE.Mesh(cabinGeo, this.matGlass);
                cabin.position.set(0, 1.05, length * 0.08);
                cabin.castShadow = true;
                car.add(cabin);

                // Roof Rails
                [-width * 0.4, width * 0.4].forEach(xOff => {
                    const railGeo = new THREE.BoxGeometry(0.06, 0.06, length * 0.6);
                    const rail = new THREE.Mesh(railGeo, this.matTire);
                    rail.position.set(xOff, 1.4, length * 0.08);
                    car.add(rail);
                });
            } else if (t.typeIndex === 1) {
                // Urban Hatchback
                const bodyGeo = new THREE.BoxGeometry(width, 0.42, length);
                const body = new THREE.Mesh(bodyGeo, matPaint);
                body.position.y = 0.48;
                body.castShadow = true;
                car.add(body);

                const cabinGeo = new THREE.BoxGeometry(width * 0.82, 0.46, length * 0.58);
                const cabin = new THREE.Mesh(cabinGeo, this.matGlass);
                cabin.position.set(0, 0.86, length * 0.1);
                car.add(cabin);
            } else {
                // Executive Sedan
                const bodyGeo = new THREE.BoxGeometry(width, 0.38, length);
                const body = new THREE.Mesh(bodyGeo, matPaint);
                body.position.y = 0.46;
                body.castShadow = true;
                car.add(body);

                const cabinGeo = new THREE.BoxGeometry(width * 0.8, 0.42, length * 0.52);
                const cabin = new THREE.Mesh(cabinGeo, this.matGlass);
                cabin.position.set(0, 0.82, 0);
                car.add(cabin);
            }

            // Headlights & Taillights
            [-halfW * 0.65, halfW * 0.65].forEach(xOff => {
                const hlGeo = new THREE.BoxGeometry(0.3, 0.12, 0.06);
                const hl = new THREE.Mesh(hlGeo, this.matHeadlight);
                hl.position.set(xOff, 0.48, -halfL);
                car.add(hl);
            });
            const tlGeo = new THREE.BoxGeometry(width * 0.85, 0.12, 0.06);
            const tl = new THREE.Mesh(tlGeo, this.matTaillight);
            tl.position.set(0, 0.5, halfL);
            car.add(tl);

            // 4 Wheels Touching Ground (R = 0.38, Center Y = 0.38)
            const axleZ = halfL * 0.6;
            const axleX = halfW * 0.95;
            const fl = this.createWheel(); fl.position.set(-axleX, 0.38, -axleZ); car.add(fl);
            const fr = this.createWheel(); fr.position.set(axleX, 0.38, -axleZ); car.add(fr);
            const rl = this.createWheel(); rl.position.set(-axleX, 0.38, axleZ); car.add(rl);
            const rr = this.createWheel(); rr.position.set(axleX, 0.38, axleZ); car.add(rr);

            return car;
        }

        // --- CURVED ROAD RIBBON GENERATION ---
        buildCurveMesh(crv, chunk, group) {
            const samples = crv.samples;
            const N = samples.length;
            if (N < 2) return;

            const rw = crv.width * this.SCALE; // 11.0m
            const hrw = rw / 2;                // 5.5m
            const curbW = 0.35;
            const swW = 1.8;

            const localPts = [];
            for (let i = 0; i < N; i++) {
                const s = samples[i];
                localPts.push({
                    x: (s.x - chunk.midX) * this.SCALE,
                    z: (s.y - chunk.midY) * this.SCALE,
                    nx: s.nx,
                    nz: s.ny
                });
            }

            const createRibbonGeo = (off1, off2, yElevation) => {
                const positions = new Float32Array(N * 2 * 3);
                const normals = new Float32Array(N * 2 * 3);
                const indices = [];

                for (let i = 0; i < N; i++) {
                    const p = localPts[i];
                    const xA = p.x + p.nx * off1;
                    const zA = p.z + p.nz * off1;
                    const xB = p.x + p.nx * off2;
                    const zB = p.z + p.nz * off2;

                    const iA = i * 2;
                    const iB = i * 2 + 1;

                    positions[iA * 3]     = xA;
                    positions[iA * 3 + 1] = yElevation;
                    positions[iA * 3 + 2] = zA;

                    positions[iB * 3]     = xB;
                    positions[iB * 3 + 1] = yElevation;
                    positions[iB * 3 + 2] = zB;

                    normals[iA * 3]     = 0;
                    normals[iA * 3 + 1] = 1;
                    normals[iA * 3 + 2] = 0;

                    normals[iB * 3]     = 0;
                    normals[iB * 3 + 1] = 1;
                    normals[iB * 3 + 2] = 0;

                    if (i < N - 1) {
                        const p0 = i * 2;
                        const p1 = i * 2 + 1;
                        const p2 = (i + 1) * 2;
                        const p3 = (i + 1) * 2 + 1;
                        indices.push(p0, p1, p2, p1, p3, p2);
                    }
                }

                const geo = new THREE.BufferGeometry();
                geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
                geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
                geo.setIndex(indices);
                return geo;
            };

            // 1. Asphalt Road Surface Ribbon
            const roadGeo = createRibbonGeo(hrw, -hrw, 0.008);
            const roadMesh = new THREE.Mesh(roadGeo, this.matAsphalt);
            roadMesh.receiveShadow = true;
            group.add(roadMesh);

            // 2. Curbs
            const lCurbGeo = createRibbonGeo(hrw + curbW, hrw, 0.04);
            group.add(new THREE.Mesh(lCurbGeo, this.matCurb));
            const rCurbGeo = createRibbonGeo(-hrw, -hrw - curbW, 0.04);
            group.add(new THREE.Mesh(rCurbGeo, this.matCurb));

            // 3. Sidewalks
            const lSwGeo = createRibbonGeo(hrw + curbW + swW, hrw + curbW, 0.03);
            const lSw = new THREE.Mesh(lSwGeo, this.matSidewalk);
            lSw.receiveShadow = true;
            group.add(lSw);

            const rSwGeo = createRibbonGeo(-hrw - curbW, -hrw - curbW - swW, 0.03);
            const rSw = new THREE.Mesh(rSwGeo, this.matSidewalk);
            rSw.receiveShadow = true;
            group.add(rSw);

            // 4. White Solid Edge Lines
            const lLineGeo = createRibbonGeo(hrw - 0.25, hrw - 0.45, 0.016);
            group.add(new THREE.Mesh(lLineGeo, this.matWhiteLine));

            const rLineGeo = createRibbonGeo(-hrw + 0.45, -hrw + 0.25, 0.016);
            group.add(new THREE.Mesh(rLineGeo, this.matWhiteLine));

            // 5. Yellow Dashed Centerline
            for (let i = 0; i < N - 1; i += 2) {
                const subPts = localPts.slice(i, i + 2);
                if (subPts.length < 2) continue;
                const dW = 0.11;
                const p0 = subPts[0];
                const p1 = subPts[1];
                const dPositions = new Float32Array(4 * 3);
                const dNormals = new Float32Array([0,1,0, 0,1,0, 0,1,0, 0,1,0]);

                dPositions[0] = p0.x + p0.nx * dW; dPositions[1] = 0.016; dPositions[2] = p0.z + p0.nz * dW;
                dPositions[3] = p0.x - p0.nx * dW; dPositions[4] = 0.016; dPositions[5] = p0.z - p0.nz * dW;
                dPositions[6] = p1.x + p1.nx * dW; dPositions[7] = 0.016; dPositions[8] = p1.z + p1.nz * dW;
                dPositions[9] = p1.x - p1.nx * dW; dPositions[10] = 0.016; dPositions[11] = p1.z - p1.nz * dW;

                const dGeo = new THREE.BufferGeometry();
                dGeo.setAttribute('position', new THREE.BufferAttribute(dPositions, 3));
                dGeo.setAttribute('normal', new THREE.BufferAttribute(dNormals, 3));
                dGeo.setIndex([0, 1, 2, 1, 3, 2]);
                group.add(new THREE.Mesh(dGeo, this.matYellowLine));
            }
        }

        // --- PROCEDURAL CHUNKS WITH ZERO-ALLOCATION UNIT GEOMETRIES ---
        buildChunkGroup(chunk) {
            const group = new THREE.Group();
            group.position.set(chunk.midX * this.SCALE, 0, chunk.midY * this.SCALE);

            const rw = CONFIG.ROAD_WIDTH * this.SCALE; // 11.0m
            const hrw = rw / 2;                        // 5.5m
            const swW = 1.8;                           // Sidewalk width 1.8m
            const curbW = 0.35;                        // Curb width 0.35m

            // 1. Straight Roads, Curbs, Sidewalks, Centerlines, Edge Lines
            const hasHoriz = (chunk.hasWest || chunk.hasEast);
            const hasVert = (chunk.hasNorth || chunk.hasSouth);

            chunk.roads.forEach(r => {
                // AUTHORITATIVE ROAD WIDTH: Exact 1:1 mapping with 2D world dimensions (no double-scaling)
                const rDepth = r.isVertical ? (r.height * this.SCALE) : rw;
                const rWidth = r.isVertical ? rw : (r.width * this.SCALE);
                const rx = (r.x + (r.isVertical ? 0 : r.width / 2) - chunk.midX) * this.SCALE;
                const rz = (r.y + (r.isVertical ? r.height / 2 : 0) - chunk.midY) * this.SCALE;

                // Asphalt road surface using shared unit plane
                const road = new THREE.Mesh(this.sharedPlaneGeo, this.matAsphalt);
                road.scale.set(rWidth, 1, rDepth);
                road.position.set(rx, 0.008, rz);
                road.receiveShadow = true;
                group.add(road);

                if (r.isVertical) {
                    const topZ = rz - rDepth / 2;
                    const botZ = rz + rDepth / 2;
                    const openIntervals = [];
                    if (topZ < -hrw) openIntervals.push({ zCenter: (topZ - hrw) / 2, len: (-hrw - topZ) });
                    if (botZ > hrw) openIntervals.push({ zCenter: (hrw + botZ) / 2, len: (botZ - hrw) });
                    const fullIntervals = [{ zCenter: rz, len: rDepth }];

                    const hasLeftGap = (chunk.socketCount >= 3 && chunk.hasWest);
                    const hasRightGap = (chunk.socketCount >= 3 && chunk.hasEast);

                    const sides = [
                        { xOff: -hrw - curbW / 2, swOff: -hrw - curbW - swW / 2, lineOff: -hrw + 0.4, intervals: hasLeftGap ? openIntervals : fullIntervals },
                        { xOff: hrw + curbW / 2,  swOff: hrw + curbW + swW / 2,  lineOff: hrw - 0.4,  intervals: hasRightGap ? openIntervals : fullIntervals }
                    ];

                    sides.forEach(s => {
                        s.intervals.forEach(iv => {
                            if (iv.len <= 0.1) return;
                            const curb = new THREE.Mesh(this.sharedBoxGeo, this.matCurb);
                            curb.scale.set(curbW, 0.08, iv.len);
                            curb.position.set(rx + s.xOff, 0.04, iv.zCenter);
                            group.add(curb);

                            const sw = new THREE.Mesh(this.sharedBoxGeo, this.matSidewalk);
                            sw.scale.set(swW, 0.06, iv.len);
                            sw.position.set(rx + s.swOff, 0.03, iv.zCenter);
                            sw.receiveShadow = true;
                            group.add(sw);

                            const line = new THREE.Mesh(this.sharedPlaneGeo, this.matWhiteLine);
                            line.scale.set(0.18, 1, iv.len);
                            line.position.set(rx + s.lineOff, 0.016, iv.zCenter);
                            group.add(line);
                        });
                    });

                    // Yellow Dashed Centerline (omit inside intersection box)
                    const halfD = rDepth / 2;
                    for (let zSeg = -halfD + 1.1; zSeg < halfD; zSeg += 4.4) {
                        const curZ = rz + zSeg;
                        if (hasHoriz && chunk.socketCount >= 3 && Math.abs(curZ) < hrw) continue;
                        const dash = new THREE.Mesh(this.sharedPlaneGeo, this.matYellowLine);
                        dash.scale.set(0.22, 1, 2.2);
                        dash.position.set(rx, 0.016, curZ);
                        group.add(dash);
                    }
                } else {
                    const leftX = rx - rWidth / 2;
                    const rightX = rx + rWidth / 2;
                    const openIntervals = [];
                    if (leftX < -hrw) openIntervals.push({ xCenter: (leftX - hrw) / 2, len: (-hrw - leftX) });
                    if (rightX > hrw) openIntervals.push({ xCenter: (hrw + rightX) / 2, len: (rightX - hrw) });
                    const fullIntervals = [{ xCenter: rx, len: rWidth }];

                    const hasTopGap = (chunk.socketCount >= 3 && chunk.hasNorth);
                    const hasBottomGap = (chunk.socketCount >= 3 && chunk.hasSouth);

                    const sides = [
                        { zOff: -hrw - curbW / 2, swOff: -hrw - curbW - swW / 2, lineOff: -hrw + 0.4, intervals: hasTopGap ? openIntervals : fullIntervals },
                        { zOff: hrw + curbW / 2,  swOff: hrw + curbW + swW / 2,  lineOff: hrw - 0.4,  intervals: hasBottomGap ? openIntervals : fullIntervals }
                    ];

                    sides.forEach(s => {
                        s.intervals.forEach(iv => {
                            if (iv.len <= 0.1) return;
                            const curb = new THREE.Mesh(this.sharedBoxGeo, this.matCurb);
                            curb.scale.set(iv.len, 0.08, curbW);
                            curb.position.set(iv.xCenter, 0.04, rz + s.zOff);
                            group.add(curb);

                            const sw = new THREE.Mesh(this.sharedBoxGeo, this.matSidewalk);
                            sw.scale.set(iv.len, 0.06, swW);
                            sw.position.set(iv.xCenter, 0.03, rz + s.swOff);
                            sw.receiveShadow = true;
                            group.add(sw);

                            const line = new THREE.Mesh(this.sharedPlaneGeo, this.matWhiteLine);
                            line.scale.set(iv.len, 1, 0.18);
                            line.position.set(iv.xCenter, 0.016, rz + s.lineOff);
                            group.add(line);
                        });
                    });

                    // Yellow Dashed Centerline (omit inside intersection box)
                    const halfW = rWidth / 2;
                    for (let xSeg = -halfW + 1.1; xSeg < halfW; xSeg += 4.4) {
                        const curX = rx + xSeg;
                        if (hasVert && chunk.socketCount >= 3 && Math.abs(curX) < hrw) continue;
                        const dash = new THREE.Mesh(this.sharedPlaneGeo, this.matYellowLine);
                        dash.scale.set(2.2, 1, 0.22);
                        dash.position.set(curX, 0.016, rz);
                        group.add(dash);
                    }
                }
            });

            // 2. Curved Road Network Ribbons
            if (chunk.curves && chunk.curves.length > 0) {
                chunk.curves.forEach(crv => {
                    this.buildCurveMesh(crv, chunk, group);
                });
            }

            // 3. Dead-End Cul-de-Sacs
            if (chunk.deadEnds && chunk.deadEnds.length > 0) {
                chunk.deadEnds.forEach(de => {
                    const dx = (de.x - chunk.midX) * this.SCALE;
                    const dz = (de.y - chunk.midY) * this.SCALE;
                    const turnRadius = hrw * 1.15;

                    const circleGeo = new THREE.CircleGeometry(turnRadius, 24);
                    circleGeo.rotateX(-Math.PI / 2);
                    const pad = new THREE.Mesh(circleGeo, this.matAsphalt);
                    pad.position.set(dx, 0.009, dz);
                    pad.receiveShadow = true;
                    group.add(pad);

                    const curbRingGeo = new THREE.RingGeometry(turnRadius, turnRadius + curbW, 24);
                    curbRingGeo.rotateX(-Math.PI / 2);
                    const curbRing = new THREE.Mesh(curbRingGeo, this.matCurb);
                    curbRing.position.set(dx, 0.02, dz);
                    group.add(curbRing);
                });
            }

            // 4. Crosswalks (Zebra stripes at intersections)
            chunk.crosswalks.forEach(cw => {
                const cx = (cw.x - chunk.midX) * this.SCALE;
                const cz = (cw.y - chunk.midY) * this.SCALE;
                const cwW = cw.width * this.SCALE;
                const cwH = cw.height * this.SCALE;

                if (cw.isHoriz) {
                    const stripes = 7;
                    const sW = cwW / (stripes * 2);
                    for (let i = 0; i < stripes; i++) {
                        const sx = cx - cwW / 2 + sW * (i * 2 + 1);
                        const stripe = new THREE.Mesh(this.sharedPlaneGeo, this.matCrosswalk);
                        stripe.scale.set(sW * 1.1, 1, cwH);
                        stripe.position.set(sx, 0.018, cz);
                        group.add(stripe);
                    }
                } else {
                    const stripes = 7;
                    const sH = cwH / (stripes * 2);
                    for (let i = 0; i < stripes; i++) {
                        const sz = cz - cwH / 2 + sH * (i * 2 + 1);
                        const stripe = new THREE.Mesh(this.sharedPlaneGeo, this.matCrosswalk);
                        stripe.scale.set(cwW, 1, sH * 1.1);
                        stripe.position.set(cx, 0.018, sz);
                        group.add(stripe);
                    }
                }
            });

            // 5. Architectural Buildings & Dead-End Barricades grounded at Y = 0
            chunk.buildings.forEach(b => {
                const bx = (b.x - chunk.midX) * this.SCALE;
                const bz = (b.y - chunk.midY) * this.SCALE;
                const bw = b.width * this.SCALE;
                const bh = b.height * this.SCALE;
                const bHeight = (b.h3d || 55) * this.SCALE;
                const archetype = b.archetype || 'commercial';

                const bGroup = new THREE.Group();
                bGroup.position.set(bx, bHeight / 2, bz);

                if (archetype === 'barricade') {
                    // --- DEAD END HAZARD BARRICADE ---
                    const base = new THREE.Mesh(this.sharedBoxGeo, this.matConcrete);
                    base.scale.set(bw, bHeight * 0.45, bh);
                    base.position.set(0, -bHeight * 0.25, 0);
                    base.castShadow = true; base.receiveShadow = true;
                    bGroup.add(base);

                    const beamW = bw;
                    const beamH = bHeight * 0.55;
                    const beamD = bh * 0.85;
                    const numStripes = 6;
                    const segW = beamW / numStripes;
                    for (let s = 0; s < numStripes; s++) {
                        const stripeMat = (s % 2 === 0) ? this.matHazardYellow : this.matHazardBlack;
                        const stripe = new THREE.Mesh(this.sharedBoxGeo, stripeMat);
                        stripe.scale.set(segW * 0.98, beamH, beamD);
                        stripe.position.set(-beamW / 2 + segW * (s + 0.5), bHeight * 0.25, 0);
                        stripe.castShadow = true;
                        bGroup.add(stripe);
                    }

                    // Warning Beacon Posts with red flashers
                    [-bw * 0.38, bw * 0.38].forEach(xOff => {
                        const post = new THREE.Mesh(this.sharedBoxGeo, this.matHazardBlack);
                        post.scale.set(0.18, 0.4, 0.18);
                        post.position.set(xOff, bHeight / 2 + 0.2, 0);
                        bGroup.add(post);

                        const light = new THREE.Mesh(this.sharedBoxGeo, this.matHazardRed);
                        light.scale.set(0.32, 0.32, 0.32);
                        light.position.set(xOff, bHeight / 2 + 0.48, 0);
                        bGroup.add(light);
                    });

                } else if (archetype === 'hospital') {
                    // --- HOSPITAL ---
                    const matHospWall = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.6 });
                    const mainBody = new THREE.Mesh(this.sharedBoxGeo, matHospWall);
                    mainBody.scale.set(bw, bHeight, bh);
                    mainBody.castShadow = true; mainBody.receiveShadow = true;
                    bGroup.add(mainBody);

                    const matCross = new THREE.MeshBasicMaterial({ color: 0xdc2626 });
                    const crossV = new THREE.Mesh(this.sharedBoxGeo, matCross);
                    crossV.scale.set(0.35, 1.4, 0.08);
                    crossV.position.set(0, 0.5, bh / 2 + 0.05);
                    bGroup.add(crossV);

                    const crossH = new THREE.Mesh(this.sharedBoxGeo, matCross);
                    crossH.scale.set(1.4, 0.35, 0.08);
                    crossH.position.set(0, 0.5, bh / 2 + 0.05);
                    bGroup.add(crossH);

                    const matDoor = new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.2 });
                    const doors = new THREE.Mesh(this.sharedBoxGeo, matDoor);
                    doors.scale.set(1.6, 1.2, 0.06);
                    doors.position.set(0, -bHeight / 2 + 0.6, bh / 2 + 0.04);
                    bGroup.add(doors);

                    const awning = new THREE.Mesh(this.sharedBoxGeo, new THREE.MeshStandardMaterial({ color: 0x0284c7 }));
                    awning.scale.set(2.4, 0.15, 1.1);
                    awning.position.set(0, -bHeight / 2 + 1.35, bh / 2 + 0.55);
                    bGroup.add(awning);

                    const roofTrim = new THREE.Mesh(this.sharedBoxGeo, new THREE.MeshLambertMaterial({ color: 0xcbd5e1 }));
                    roofTrim.scale.set(bw * 1.02, 0.3, bh * 1.02);
                    roofTrim.position.y = bHeight / 2 + 0.15;
                    bGroup.add(roofTrim);

                } else if (archetype === 'garage') {
                    // --- GARAGE ---
                    const matGarageWall = new THREE.MeshStandardMaterial({ color: 0x78716c, roughness: 0.75 });
                    const mainBody = new THREE.Mesh(this.sharedBoxGeo, matGarageWall);
                    mainBody.scale.set(bw, bHeight, bh);
                    mainBody.castShadow = true; mainBody.receiveShadow = true;
                    bGroup.add(mainBody);

                    const matBayDoor = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.4 });
                    const bayWidth = Math.min(bw * 0.38, 2.8);
                    const bayHeight = Math.min(bHeight * 0.65, 2.4);
                    [-bw * 0.24, bw * 0.24].forEach(xOff => {
                        const bayDoor = new THREE.Mesh(this.sharedBoxGeo, matBayDoor);
                        bayDoor.scale.set(bayWidth, bayHeight, 0.08);
                        bayDoor.position.set(xOff, -bHeight / 2 + bayHeight / 2, bh / 2 + 0.05);
                        bGroup.add(bayDoor);
                    });

                    const matSign = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.3 });
                    const signBoard = new THREE.Mesh(this.sharedBoxGeo, matSign);
                    signBoard.scale.set(bw * 0.85, 0.45, 0.1);
                    signBoard.position.set(0, bHeight * 0.25, bh / 2 + 0.06);
                    bGroup.add(signBoard);

                } else if (archetype === 'house_small' || archetype === 'house_large') {
                    // --- HOMES ---
                    const houseColors = [0xd97706, 0xb45309, 0xf59e0b, 0xa16207, 0x84cc16, 0x78716c];
                    const hCol = houseColors[Math.abs(Math.floor(bx * 7 + bz)) % houseColors.length];
                    const matHouseWall = new THREE.MeshStandardMaterial({ color: hCol, roughness: 0.65 });
                    const wallMesh = new THREE.Mesh(this.sharedBoxGeo, matHouseWall);
                    wallMesh.scale.set(bw, bHeight * 0.65, bh);
                    wallMesh.position.y = -bHeight * 0.175;
                    wallMesh.castShadow = true; wallMesh.receiveShadow = true;
                    bGroup.add(wallMesh);

                    const roofMat = new THREE.MeshStandardMaterial({ color: 0x854d0e, roughness: 0.6 });
                    const roof = new THREE.Mesh(this.sharedBoxGeo, roofMat);
                    roof.scale.set(bw * 1.08, bHeight * 0.35, bh * 1.08);
                    roof.position.y = bHeight * 0.325;
                    roof.castShadow = true;
                    bGroup.add(roof);

                } else if (archetype === 'shop') {
                    // --- SHOPS ---
                    const shopBody = new THREE.Mesh(this.sharedBoxGeo, new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.6 }));
                    shopBody.scale.set(bw, bHeight, bh);
                    shopBody.castShadow = true; shopBody.receiveShadow = true;
                    bGroup.add(shopBody);

                    const awning = new THREE.Mesh(this.sharedBoxGeo, new THREE.MeshStandardMaterial({ color: 0xec4899 }));
                    awning.scale.set(bw * 0.9, 0.14, 1.2);
                    awning.position.set(0, -bHeight * 0.05, bh / 2 + 0.6);
                    bGroup.add(awning);

                } else {
                    // --- COMMERCIAL ---
                    const matWall = new THREE.MeshStandardMaterial({ color: parseInt((b.frontColor || '#334155').replace('#', '0x')), roughness: 0.55 });
                    const mainBody = new THREE.Mesh(this.sharedBoxGeo, matWall);
                    mainBody.scale.set(bw, bHeight, bh);
                    mainBody.castShadow = true; mainBody.receiveShadow = true;
                    bGroup.add(mainBody);

                    const roofTrim = new THREE.Mesh(this.sharedBoxGeo, new THREE.MeshLambertMaterial({ color: 0x64748b }));
                    roofTrim.scale.set(bw * 1.03, 0.35, bh * 1.03);
                    roofTrim.position.y = bHeight / 2 + 0.175;
                    bGroup.add(roofTrim);
                }

                group.add(bGroup);
            });

            // 6. Natural Flora
            chunk.trees.forEach(t => {
                const tx = (t.x - chunk.midX) * this.SCALE;
                const tz = (t.y - chunk.midY) * this.SCALE;
                const tr = t.radius * this.SCALE;

                const treeGroup = new THREE.Group();
                treeGroup.position.set(tx, 0, tz);

                const trunk = new THREE.Mesh(this.sharedCylinderGeo, this.matTrunk);
                trunk.scale.set(tr * 0.36, 1.6, tr * 0.36);
                trunk.position.y = 0.8;
                trunk.castShadow = true;
                treeGroup.add(trunk);

                const fol1 = new THREE.Mesh(this.sharedCylinderGeo, this.matFoliage1);
                fol1.scale.set(tr * 1.8, 1.8, tr * 1.8);
                fol1.position.y = 2.2;
                fol1.castShadow = true;
                treeGroup.add(fol1);

                group.add(treeGroup);
            });

            chunk.bushes.forEach(b => {
                const bx = (b.x - chunk.midX) * this.SCALE;
                const bz = (b.y - chunk.midY) * this.SCALE;
                const br = b.radius * this.SCALE;

                const bush = new THREE.Mesh(this.sharedBoxGeo, this.matFoliage2);
                bush.scale.set(br * 1.8, br * 1.2, br * 1.8);
                bush.position.set(bx, br * 0.6, bz);
                bush.castShadow = true;
                group.add(bush);
            });

            chunk.boulders.forEach(b => {
                const bx = (b.x - chunk.midX) * this.SCALE;
                const bz = (b.y - chunk.midY) * this.SCALE;
                const br = b.radius * this.SCALE;

                const boulder = new THREE.Mesh(this.sharedBoxGeo, this.matBoulder);
                boulder.scale.set(br * 1.8, br * 1.3, br * 1.8);
                boulder.position.set(bx, br * 0.65, bz);
                boulder.castShadow = true;
                group.add(boulder);
            });

            // 7. Street Lamps
            chunk.props.forEach(p => {
                if (p.type === 'streetlamp') {
                    const px = (p.x - chunk.midX) * this.SCALE;
                    const pz = (p.y - chunk.midY) * this.SCALE;

                    const poleGroup = new THREE.Group();
                    poleGroup.position.set(px, 0, pz);

                    const pole = new THREE.Mesh(this.sharedCylinderGeo, this.matStreetlight);
                    pole.scale.set(0.12, 4.8, 0.12);
                    pole.position.y = 2.4;
                    poleGroup.add(pole);

                    const lamp = new THREE.Mesh(this.sharedBoxGeo, this.matLampGlow);
                    lamp.scale.set(0.3, 0.1, 0.4);
                    lamp.position.set(0, 4.8, 0);
                    poleGroup.add(lamp);

                    group.add(poleGroup);
                }
            });

            return group;
        }

        disposeChunkGroup(group) {
            group.traverse(child => {
                if (child.isMesh && child.geometry) {
                    if (!child.geometry.userData || !child.geometry.userData.isShared) {
                        child.geometry.dispose();
                    }
                }
            });
        }

        syncChunks(world, player) {
            const activeKeys = new Set();
            for (let chunk of world.chunks.values()) {
                const key = `${chunk.cx}_${chunk.cy}`;
                activeKeys.add(key);

                if (!this.chunkGroups.has(key) && !this.buildQueueKeys.has(key)) {
                    this.chunkBuildQueue.push(chunk);
                    this.buildQueueKeys.add(key);
                }
            }

            // Remove despawned chunk groups and clean up GPU vertex buffers
            for (let [key, group] of this.chunkGroups.entries()) {
                if (!activeKeys.has(key)) {
                    this.scene.remove(group);
                    this.disposeChunkGroup(group);
                    this.chunkGroups.delete(key);
                }
            }

            // Prune unneeded chunks from build queue
            for (let i = this.chunkBuildQueue.length - 1; i >= 0; i--) {
                const c = this.chunkBuildQueue[i];
                const key = `${c.cx}_${c.cy}`;
                if (!activeKeys.has(key)) {
                    this.chunkBuildQueue.splice(i, 1);
                    this.buildQueueKeys.delete(key);
                }
            }

            // Time-Sliced Chunk Assembly: Build up to 2 chunks per frame to keep ahead of player
            const maxBuildsThisFrame = Math.min(2, this.chunkBuildQueue.length);
            for (let b = 0; b < maxBuildsThisFrame; b++) {
                if (player) {
                    this.chunkBuildQueue.sort((a, b) => {
                        const distA = Math.hypot(a.midX - player.x, a.midY - player.y);
                        const distB = Math.hypot(b.midX - player.x, b.midY - player.y);
                        return distA - distB;
                    });
                }
                const chunkToBuild = this.chunkBuildQueue.shift();
                if (!chunkToBuild) break;
                const key = `${chunkToBuild.cx}_${chunkToBuild.cy}`;
                this.buildQueueKeys.delete(key);

                if (!this.chunkGroups.has(key)) {
                    const group = this.buildChunkGroup(chunkToBuild);
                    this.scene.add(group);
                    this.chunkGroups.set(key, group);
                }
            }
        }

        syncVehicles(player, policeCruisers, trafficCars) {
            const activeIds = new Set(['player']);

            // 1. Sync Player Sports Car
            if (!this.vehicleMeshes.has('player')) {
                const mesh = this.buildPlayerMesh();
                this.scene.add(mesh);
                this.vehicleMeshes.set('player', mesh);
            }
            const pMesh = this.vehicleMeshes.get('player');
            const px = player.x * this.SCALE;
            const pz = player.y * this.SCALE;
            const py = (player.z || 0) * this.SCALE;
            pMesh.position.set(px, py, pz);
            pMesh.rotation.y = -player.heading - Math.PI / 2;
            pMesh.rotation.z = (player.bodyRoll || 0);
            pMesh.rotation.x = player.isAirborne ? -0.15 : 0;

            // Animate Front Steering Wheels
            if (pMesh.userData.frontWheels) {
                pMesh.userData.frontWheels.forEach(w => {
                    w.rotation.y = player.steerAngle || 0;
                });
            }

            // Taillights Flare when braking or reversing
            if (pMesh.userData.taillight) {
                pMesh.userData.taillight.material = (player.speed < -2) ? this.matBrakeLight : this.matTaillight;
            }

            // 2. Sync Police Cruisers
            for (let p of policeCruisers) {
                activeIds.add(p.id);
                if (!this.vehicleMeshes.has(p.id)) {
                    const mesh = this.buildPoliceMesh();
                    this.scene.add(mesh);
                    this.vehicleMeshes.set(p.id, mesh);
                }
                const mesh = this.vehicleMeshes.get(p.id);
                mesh.position.set(p.x * this.SCALE, 0, p.y * this.SCALE);
                mesh.rotation.y = -p.heading - Math.PI / 2;

                // Alternate Dual Emergency Strobes
                const flashRed = Math.sin(p.strobePhase || 0) > 0;
                if (mesh.userData.redStrobe) {
                    mesh.userData.redStrobe.material.emissiveIntensity = flashRed ? 1.5 : 0.05;
                }
                if (mesh.userData.blueStrobe) {
                    mesh.userData.blueStrobe.material.emissiveIntensity = !flashRed ? 1.5 : 0.05;
                }
            }

            // 3. Sync Traffic Cars
            for (let t of trafficCars) {
                activeIds.add(t.id);
                if (!this.vehicleMeshes.has(t.id)) {
                    const mesh = this.buildTrafficMesh(t);
                    this.scene.add(mesh);
                    this.vehicleMeshes.set(t.id, mesh);
                }
                const mesh = this.vehicleMeshes.get(t.id);
                mesh.position.set(t.x * this.SCALE, 0, t.y * this.SCALE);
                mesh.rotation.y = -t.heading - Math.PI / 2;
            }

            // Remove Despawned Vehicles
            for (let [id, mesh] of this.vehicleMeshes.entries()) {
                if (!activeIds.has(id)) {
                    this.scene.remove(mesh);
                    this.vehicleMeshes.delete(id);
                }
            }
        }

        syncParticles(particles) {
            while (this.particleMeshes.length < particles.particles.length) {
                const mesh = new THREE.Mesh(this.geoSpark, new THREE.MeshBasicMaterial({ color: 0xfacc15 }));
                this.scene.add(mesh);
                this.particleMeshes.push(mesh);
            }

            for (let i = 0; i < this.particleMeshes.length; i++) {
                const mesh = this.particleMeshes[i];
                if (i < particles.particles.length) {
                    const p = particles.particles[i];
                    mesh.visible = true;
                    mesh.position.set(p.x * this.SCALE, 0.4 + (p.maxLife - p.life) * 1.5, p.y * this.SCALE);
                    const alpha = Math.max(0, p.life / p.maxLife);
                    mesh.scale.set(alpha, alpha, alpha);
                } else {
                    mesh.visible = false;
                }
            }
        }

        updateCamera(player, dt, cameraShake) {
            const px = player.x * this.SCALE;
            const pz = player.y * this.SCALE;
            const py = (player.z || 0) * this.SCALE;

            const fx = Math.cos(player.heading);
            const fz = Math.sin(player.heading);

            // True Grounded Third-Person Driving Camera
            // Desktop: 8.0m distance, 2.65m height, 19.0m lookahead (~18.3° pitch)
            // Mobile: 11.2m distance, 3.65m height, 24.0m lookahead (~18.0° pitch) + 70° FOV gives ~80% wider view
            const isMobile = this.isMobileDevice();
            const camDist = isMobile ? 11.2 : 8.0;
            const camHeight = isMobile ? 3.65 : 2.65;
            const lookAheadDist = isMobile ? 24.0 : 19.0;
            const lookAtY = isMobile ? 1.15 : 0.95;

            const targetCamX = px - fx * camDist;
            const targetCamY = py + camHeight;
            const targetCamZ = pz - fz * camDist;

            const targetLookX = px + fx * lookAheadDist;
            const targetLookY = py + lookAtY;
            const targetLookZ = pz + fz * lookAheadDist;

            if (!this.camInitialized) {
                this.camPos.set(targetCamX, targetCamY, targetCamZ);
                this.camLookAt.set(targetLookX, targetLookY, targetLookZ);
                this.camera.position.copy(this.camPos);
                this.camera.lookAt(this.camLookAt);
                this.camInitialized = true;
            } else {
                const camLerp = Math.min(1.0, dt * 9.0);
                this.camPos.x += (targetCamX - this.camPos.x) * camLerp;
                this.camPos.y += (targetCamY - this.camPos.y) * camLerp;
                this.camPos.z += (targetCamZ - this.camPos.z) * camLerp;

                this.camLookAt.x += (targetLookX - this.camLookAt.x) * camLerp;
                this.camLookAt.y += (targetLookY - this.camLookAt.y) * camLerp;
                this.camLookAt.z += (targetLookZ - this.camLookAt.z) * camLerp;

                this.camera.position.copy(this.camPos);

                if (cameraShake > 0) {
                    this.camera.position.x += (Math.random() - 0.5) * cameraShake * 0.04;
                    this.camera.position.y += (Math.random() - 0.5) * cameraShake * 0.04;
                }

                this.camera.lookAt(this.camLookAt);
            }

            // Sunlight follows player
            this.sunLight.position.set(px + 30, py + 55, pz + 25);
            this.sunLight.target.position.set(px, py, pz);

            // Ground follows player
            this.groundMesh.position.x = px;
            this.groundMesh.position.z = pz;
        }

        render(dt, player, policeCruisers, trafficCars, world, particles, cameraShake) {
            this.syncChunks(world, player);
            this.syncVehicles(player, policeCruisers, trafficCars);
            this.syncParticles(particles);
            this.updateCamera(player, dt, cameraShake);

            this.renderer.render(this.scene, this.camera);
        }

        onResize(width, height) {
            this.renderer.setSize(width, height);
            this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
            const isMobile = this.isMobileDevice();
            this.camera.fov = isMobile ? 70 : 58;
            this.camera.aspect = width / height;
            this.camera.updateProjectionMatrix();
        }

        projectToScreen(x, y, z3d = 0.5) {
            const v = new THREE.Vector3(x * this.SCALE, z3d, y * this.SCALE);
            v.project(this.camera);
            if (v.z > 1.0) return null;
            return {
                x: (v.x * 0.5 + 0.5) * window.innerWidth,
                y: (-v.y * 0.5 + 0.5) * window.innerHeight
            };
        }

        isMobileDevice() {
            if (typeof navigator === 'undefined') return false;
            const ua = (navigator.userAgent || navigator.vendor || window.opera || '').toLowerCase();
            const isMobileUA = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(ua);
            const hasTouch = (typeof window !== 'undefined') && (('ontouchstart' in window) || (navigator.maxTouchPoints > 0));
            const isCoarse = (typeof window !== 'undefined' && window.matchMedia) ? window.matchMedia('(pointer: coarse)').matches : false;
            const isNarrow = (typeof window !== 'undefined') && (window.innerWidth <= 900);
            return isMobileUA || (hasTouch && (isNarrow || isCoarse));
        }
    }

    // =========================================================================
    // SECTION 10: MAIN GAME LOOP & INITIALIZATION
    // =========================================================================
    let lastFrameTime = performance.now();

    function gameLoop(timestamp) {
        const dt = Math.min((timestamp - lastFrameTime) / 1000, 0.1);
        lastFrameTime = timestamp;

        // --- 1. READY STATE (WAIT FOR TAP TO PLAY) ---
        if (gameState === 'READY') {
            updateHUD();
        }

        // --- 2. PLAYING STATE ---
        if (gameState === 'PLAYING') {
            runTimer -= dt;

            world.update(player.x, player.y, player.heading, player.speed);

            const elapsed = CONFIG.RUN_DURATION - runTimer;
            for (let tier of INTENSITY_TIERS) {
                if (elapsed >= tier.time) {
                    currentTier = tier;
                }
            }

            while (policeCruisers.length < currentTier.maxPolice) {
                if (!spawnVehicleOffScreen(true)) break;
            }

            while (trafficCars.length < currentTier.maxTraffic) {
                if (!spawnVehicleOffScreen(false)) break;
            }

            player.update(dt, input.state, world);

            let closestPoliceDist = 9999;
            for (let i = policeCruisers.length - 1; i >= 0; i--) {
                const p = policeCruisers[i];
                p.update(dt, player, world, currentTier.policeSpeed);

                const dist = Math.hypot(p.x - player.x, p.y - player.y);
                if (dist < closestPoliceDist) closestPoliceDist = dist;

                if (dist > CONFIG.DESPAWN_DISTANCE) {
                    policeCruisers.splice(i, 1);
                }
            }

            for (let i = trafficCars.length - 1; i >= 0; i--) {
                const t = trafficCars[i];
                t.update(dt, world);
                const dist = Math.hypot(t.x - player.x, t.y - player.y);
                if (dist > CONFIG.DESPAWN_DISTANCE) {
                    trafficCars.splice(i, 1);
                }
            }

            checkCollisions(dt);

            if (runTimer <= 0) {
                runTimer = 0;
                endGame('SURVIVED');
            }

            if (sound && gameState === 'PLAYING') {
                sound.updateEngine(Math.abs(player.speed) / player.maxSpeed);
                sound.updateSiren(closestPoliceDist);
            }

            if (player.score < 2500 && Math.random() < 0.4) {
                particles.emitHoodSmoke(player.x, player.y);
            }

            updateHUD();
        }

        particles.update(dt);
        world.updateSkidmarks(dt);

        if (cameraShake > 0) {
            cameraShake = Math.max(0, cameraShake - dt * 18);
        }

        if (threeRenderer) {
            threeRenderer.render(dt, player, policeCruisers, trafficCars, world, particles, cameraShake);
        }

        requestAnimationFrame(gameLoop);
    }

    function resizeCanvas() {
        if (!canvas || !threeRenderer) return;
        threeRenderer.onResize(window.innerWidth, window.innerHeight);
    }

    function init() {
        canvas = document.getElementById('game-canvas');
        if (!canvas) return;

        threeRenderer = new ThreeRenderer(canvas);
        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);

        const runSeed = Math.floor(Math.random() * 1000000);
        sound = new SoundSynthesizer();
        input = new InputManager();
        world = new ChunkManager(runSeed);
        particles = new ParticleSystem();

        player = new PlayerVehicle(22, 0); // Grounded in right-hand driving lane

        world.update(player.x, player.y, player.heading, player.speed);

        for (let i = 0; i < 11; i++) {
            spawnVehicleOffScreen(false);
        }
        spawnVehicleOffScreen(true);

        gameState = 'READY';
        runTimer = CONFIG.RUN_DURATION;
        input.locked = true;

        const startOverlay = document.getElementById('start-screen');
        if (startOverlay) {
            const handleStart = (e) => {
                if (e && e.cancelable && e.type !== 'click') e.preventDefault();
                startGame();
            };
            startOverlay.addEventListener('pointerdown', handleStart);
            startOverlay.addEventListener('touchstart', handleStart, { passive: false });
            startOverlay.addEventListener('click', handleStart);
        }

        const resultOverlay = document.getElementById('result-screen');
        if (resultOverlay) {
            const handleRestart = (e) => {
                if (e && e.cancelable && e.type !== 'click') e.preventDefault();
                restartGame();
            };
            resultOverlay.addEventListener('pointerdown', handleRestart);
            resultOverlay.addEventListener('touchstart', handleRestart, { passive: false });
            resultOverlay.addEventListener('click', handleRestart);
        }

        window.addEventListener('keydown', (e) => {
            if (gameState === 'READY') {
                startGame();
            } else if (gameState === 'DESTROYED' || gameState === 'SURVIVED') {
                if (e.code === 'Space' || e.code === 'Enter') {
                    restartGame();
                }
            }
        });

        updateHUD();

        requestAnimationFrame(gameLoop);
    }

    function startGame() {
        if (gameState === 'PLAYING') return;

        const startScreen = document.getElementById('start-screen');
        if (startScreen) {
            startScreen.classList.add('hidden');
        }

        // Reset game-over sound guard for this run
        gameOverSoundPlayed = false;

        if (sound) {
            sound.unlock();
            sound.startGameplayAudio();
        }

        gameState = 'PLAYING';
        runTimer = CONFIG.RUN_DURATION;
        input.locked = false;

        updateHUD();
    }

    function restartGame() {
        const resultScreen = document.getElementById('result-screen');
        if (resultScreen) {
            resultScreen.classList.add('hidden');
        }

        const startScreen = document.getElementById('start-screen');
        if (startScreen) {
            startScreen.classList.remove('hidden');
        }

        // Reset audio state cleanly
        gameOverSoundPlayed = false;
        if (sound) {
            sound.reset();
        }

        totalDamageTaken = 0;
        totalCollisions = 0;
        cameraShake = 0;
        currentTier = INTENSITY_TIERS[0];
        runTimer = CONFIG.RUN_DURATION;

        player = new PlayerVehicle(22, 0);
        displayedScore = player.score;

        const runSeed = Math.floor(Math.random() * 1000000);
        world = new ChunkManager(runSeed);
        world.update(player.x, player.y, player.heading, player.speed);

        policeCruisers.length = 0;
        trafficCars.length = 0;
        for (let i = 0; i < 11; i++) {
            spawnVehicleOffScreen(false);
        }
        spawnVehicleOffScreen(true);

        if (threeRenderer) {
            threeRenderer.camInitialized = false;
        }

        gameState = 'READY';
        input.locked = true;

        updateHUD();
    }

    if (document.readyState === 'loading') {
        window.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    window.__game = {
        getWorld: () => world,
        getPlayer: () => player,
        getInput: () => input,
        getPolice: () => policeCruisers,
        getTraffic: () => trafficCars,
        getGameState: () => gameState,
        getTimer: () => runTimer,
        getScore: () => player ? player.score : 0,
        getCoins: () => player ? (player.coins || 0) : 0,
        getTier: () => currentTier,
        getRenderer: () => threeRenderer,
        getMinimap: () => null,
        getSound: () => sound,
        startGame: () => startGame(),
        startPlaying: () => {
            startGame();
        },
        restartGame: () => restartGame(),
        getGameOverSoundPlayed: () => gameOverSoundPlayed,
        endGame: (outcome) => endGame(outcome),
        CONFIG
    };

})();
