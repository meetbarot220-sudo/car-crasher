// 60-Second Survival - Main Game Controller (Stage 1 Core Loop)

class Game {
    constructor() {
        this.canvas = document.getElementById('webgl-canvas');
        this.gameState = 'MENU'; // 'MENU', 'COUNTDOWN', 'PLAYING', 'VICTORY', 'GAMEOVER'

        // Core survival rules
        this.maxHp = 1000;
        this.currentHp = 1000;
        this.maxTime = 60.0;
        this.remainingTime = 60.0;
        this.score = 0;
        this.totalDamageTaken = 0;
        this.collisionCount = 0;
        this.distanceTravelled = 0;
        this.lastX = 0;
        this.lastZ = 0;

        // Vehicle selection
        this.selectedVehicleId = 'cruiser';

        // Input state
        this.keys = {
            forward: false,
            backward: false,
            left: false,
            right: false,
            drift: false
        };

        // UI references
        this.uiHpText = document.getElementById('hud-hp-text');
        this.uiHpFill = document.getElementById('hud-hp-fill');
        this.uiTimer = document.getElementById('hud-timer');
        this.uiScore = document.getElementById('hud-score');
        this.uiCountdownScreen = document.getElementById('countdown-screen');
        this.uiCountdownVal = document.getElementById('countdown-val');
        this.mainMenu = document.getElementById('main-menu');
        this.resultScreen = document.getElementById('result-screen');
        this.garageMenu = document.getElementById('garage-menu');
        this.howtoMenu = document.getElementById('howto-menu');

        this.initThree();
        this.initPhysicsAndWorld();
        this.initInput();
        this.initUI();
        this.initGarageUI();

        // Loop timing
        this.lastFrameTime = performance.now();
        requestAnimationFrame((t) => this.tick(t));
    }

    initThree() {
        const width = window.innerWidth;
        const height = window.innerHeight;

        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            antialias: true,
            powerPreference: 'high-performance'
        });
        this.renderer.setSize(width, height);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
        this.renderer.shadowMap.enabled = false; // lightweight performance

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x7da4c7); // Daylight sky tint
        this.scene.fog = new THREE.FogExp2(0x7da4c7, 0.009);

        // Third-person / Top-down isometric chase camera
        this.camera = new THREE.PerspectiveCamera(50, width / height, 0.5, 600);
        this.cameraPos = new THREE.Vector3(0, 20, -22);
        this.cameraLookAt = new THREE.Vector3(0, 0, 0);

        // Lighting (Simple directional + ambient for high FPS)
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.65);
        this.scene.add(ambientLight);

        const dirLight = new THREE.DirectionalLight(0xfff8e7, 0.85);
        dirLight.position.set(60, 100, 40);
        this.scene.add(dirLight);

        this.particles = new ParticleSystem(this.scene, this.camera);
        this.ai = new AIManager(this.scene, this.physics, this.particles);
        this.nearMissCooldown = 0;

        window.addEventListener('resize', () => {
            const w = window.innerWidth;
            const h = window.innerHeight;
            this.renderer.setSize(w, h);
            this.camera.aspect = w / h;
            this.camera.updateProjectionMatrix();
        });
    }

    initPhysicsAndWorld() {
        this.physics = new PhysicsEngine();
        this.world = new CityWorld(this.scene, this.physics);
        this.world.generate();

        // Spawn initial vehicle
        this.spawnPlayerVehicle();
    }

    spawnPlayerVehicle() {
        if (this.player && this.player.mesh) {
            this.scene.remove(this.player.mesh);
        }

        const config = VEHICLE_CONFIGS[this.selectedVehicleId] || VEHICLE_CONFIGS.cruiser;
        const vehData = VehicleFactory.createVehicleMesh(config);

        this.player = {
            mesh: vehData.mesh,
            wheels: vehData.wheels,
            stats: config,
            x: 0,
            z: 0,
            vx: 0,
            vz: 0,
            speed: 0,
            heading: 0,
            isDrifting: false
        };

        this.player.mesh.position.set(0, 0, 0);
        this.scene.add(this.player.mesh);
        this.lastX = 0;
        this.lastZ = 0;
    }

    initInput() {
        window.addEventListener('keydown', (e) => {
            if (e.code === 'KeyW' || e.code === 'ArrowUp') this.keys.forward = true;
            if (e.code === 'KeyS' || e.code === 'ArrowDown') this.keys.backward = true;
            if (e.code === 'KeyA' || e.code === 'ArrowLeft') this.keys.left = true;
            if (e.code === 'KeyD' || e.code === 'ArrowRight') this.keys.right = true;
            if (e.code === 'Space' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.keys.drift = true;

            // Initialize sound on user interaction
            if (window.soundManager && !window.soundManager.initialized) {
                window.soundManager.init();
            }
        });

        window.addEventListener('keyup', (e) => {
            if (e.code === 'KeyW' || e.code === 'ArrowUp') this.keys.forward = false;
            if (e.code === 'KeyS' || e.code === 'ArrowDown') this.keys.backward = false;
            if (e.code === 'KeyA' || e.code === 'ArrowLeft') this.keys.left = false;
            if (e.code === 'KeyD' || e.code === 'ArrowRight') this.keys.right = false;
            if (e.code === 'Space' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.keys.drift = false;
        });
    }

    initUI() {
        // Main Menu buttons
        document.getElementById('btn-play').addEventListener('click', () => {
            if (window.soundManager) window.soundManager.init();
            this.startCountdown();
        });

        document.getElementById('btn-garage').addEventListener('click', () => {
            this.mainMenu.classList.add('hidden');
            this.garageMenu.classList.remove('hidden');
        });

        document.getElementById('btn-garage-back').addEventListener('click', () => {
            this.garageMenu.classList.add('hidden');
            this.mainMenu.classList.remove('hidden');
        });

        document.getElementById('btn-garage-select').addEventListener('click', () => {
            this.spawnPlayerVehicle();
            this.garageMenu.classList.add('hidden');
            this.mainMenu.classList.remove('hidden');
        });

        document.getElementById('btn-howto').addEventListener('click', () => {
            this.mainMenu.classList.add('hidden');
            this.howtoMenu.classList.remove('hidden');
        });

        document.getElementById('btn-howto-back').addEventListener('click', () => {
            this.howtoMenu.classList.add('hidden');
            this.mainMenu.classList.remove('hidden');
        });

        document.getElementById('btn-toggle-sound').addEventListener('click', (e) => {
            if (window.soundManager) {
                window.soundManager.init();
                window.soundManager.isMuted = !window.soundManager.isMuted;
                e.target.innerText = window.soundManager.isMuted ? 'SOUND: OFF' : 'SOUND: ON';
            }
        });

        // Results buttons
        document.getElementById('btn-result-retry').addEventListener('click', () => {
            this.resultScreen.classList.add('hidden');
            this.startCountdown();
        });

        document.getElementById('btn-result-menu').addEventListener('click', () => {
            this.resultScreen.classList.add('hidden');
            this.mainMenu.classList.remove('hidden');
            this.gameState = 'MENU';
        });
    }

    initGarageUI() {
        const container = document.getElementById('garage-list');
        container.innerHTML = '';
        for (const key in VEHICLE_CONFIGS) {
            const v = VEHICLE_CONFIGS[key];
            const card = document.createElement('div');
            card.className = `vehicle-card ${key === this.selectedVehicleId ? 'selected' : ''}`;
            card.dataset.id = key;

            // Stat percentages
            const speedPct = Math.round((v.maxSpeed / 28) * 100);
            const armorPct = Math.round(((1.35 - v.damageResistance) / 0.7) * 100);
            const turnPct = Math.round((v.turnSpeed / 3.8) * 100);

            card.innerHTML = `
                <div class="v-card-name">${v.name}</div>
                <div class="v-card-type">${v.type} ARCHETYPE</div>
                <div class="v-card-desc">${v.description}</div>
                <div class="stat-mini-row">
                    <span>TOP SPEED</span>
                    <div class="stat-mini-bar"><div class="fill" style="width: ${speedPct}%"></div></div>
                </div>
                <div class="stat-mini-row">
                    <span>ARMOR / RESIST</span>
                    <div class="stat-mini-bar"><div class="fill" style="width: ${armorPct}%; background: #00e676;"></div></div>
                </div>
                <div class="stat-mini-row">
                    <span>HANDLING</span>
                    <div class="stat-mini-bar"><div class="fill" style="width: ${turnPct}%; background: #ffb300;"></div></div>
                </div>
            `;
            card.addEventListener('click', () => {
                document.querySelectorAll('.vehicle-card').forEach(c => c.classList.remove('selected'));
                card.classList.add('selected');
                this.selectedVehicleId = key;
            });
            container.appendChild(card);
        }
    }

    startCountdown() {
        this.gameState = 'COUNTDOWN';
        this.mainMenu.classList.add('hidden');
        this.resultScreen.classList.add('hidden');
        this.resetGameValues();

        this.uiCountdownScreen.classList.remove('hidden');
        let count = 3;
        this.uiCountdownVal.innerText = '3';
        if (window.soundManager) window.soundManager.playCountdown(false);

        const countInterval = setInterval(() => {
            count--;
            if (count > 0) {
                this.uiCountdownVal.innerText = `${count}`;
                if (window.soundManager) window.soundManager.playCountdown(false);
            } else if (count === 0) {
                this.uiCountdownVal.innerText = 'GO!';
                if (window.soundManager) window.soundManager.playCountdown(true);
            } else {
                clearInterval(countInterval);
                this.uiCountdownScreen.classList.add('hidden');
                this.gameState = 'PLAYING';
            }
        }, 800);
    }

    resetGameValues() {
        this.currentHp = this.maxHp;
        this.remainingTime = this.maxTime;
        this.score = 0;
        this.totalDamageTaken = 0;
        this.collisionCount = 0;
        this.distanceTravelled = 0;
        this.nearMissCooldown = 0;

        if (this.ai) this.ai.clear();
        this.spawnPlayerVehicle();
        this.particles.clear();
        this.updateHUD();
    }

    applyDamage(rawDamage, hit) {
        // Vehicle damage resistance
        const resistance = this.player.stats.damageResistance || 1.0;
        const finalDamage = Math.max(15, Math.round(rawDamage * resistance));

        this.currentHp = Math.max(0, this.currentHp - finalDamage);
        this.totalDamageTaken += finalDamage;
        this.collisionCount++;

        // Determine severity label
        let severity = 'normal';
        if (finalDamage < 45) severity = 'light';
        else if (finalDamage > 130) severity = 'heavy';
        else if (finalDamage > 70) severity = 'strong';

        // Floating damage number
        this.particles.showDamageNumber(finalDamage, hit.hitX, 1.0, hit.hitZ, severity);

        // Sparks & screen shake
        this.particles.spawnImpactSparks(hit.hitX, 0.8, hit.hitZ, hit.normalX, hit.normalZ, severity === 'heavy' ? 14 : 7);
        const shakePower = severity === 'heavy' ? 0.65 : (severity === 'strong' ? 0.45 : 0.25);
        this.particles.triggerShake(shakePower);

        // Hit sound
        if (window.soundManager) {
            window.soundManager.playHit(severity);
        }

        this.updateHUD();

        // Check destruction
        if (this.currentHp <= 0) {
            this.triggerGameOver();
        }
    }

    updateHUD() {
        // HP Display
        this.uiHpText.innerText = `${this.currentHp} / ${this.maxHp}`;
        const hpPercent = (this.currentHp / this.maxHp) * 100;
        this.uiHpFill.style.width = `${Math.max(0, hpPercent)}%`;

        // HP Visual states: 100%-60% Healthy, 60%-30% Warning, 30%-1% Critical, 0% Destroyed
        this.uiHpFill.classList.remove('healthy', 'warning', 'critical');
        if (hpPercent >= 60) {
            this.uiHpFill.classList.add('healthy');
        } else if (hpPercent >= 30) {
            this.uiHpFill.classList.add('warning');
        } else {
            this.uiHpFill.classList.add('critical');
            if (this.gameState === 'PLAYING' && Math.random() < 0.05) {
                if (window.soundManager) window.soundManager.playLowHealthAlarm();
            }
        }

        // Timer Display
        const secondsLeft = Math.ceil(this.remainingTime);
        this.uiTimer.innerText = `${secondsLeft}s`;
        if (secondsLeft <= 10) {
            this.uiTimer.classList.add('timer-ending');
        } else {
            this.uiTimer.classList.remove('timer-ending');
        }

        // Score Display
        this.uiScore.innerText = `${Math.floor(this.score)}`;
    }

    triggerGameOver() {
        this.gameState = 'GAMEOVER';
        if (window.soundManager) window.soundManager.playGameOver();

        // Show Game Over Result Screen
        setTimeout(() => {
            const header = document.getElementById('result-header');
            header.innerText = 'VEHICLE DESTROYED';
            header.className = 'result-title destroyed';

            const survivedTime = (this.maxTime - this.remainingTime).toFixed(1);
            document.getElementById('res-time').innerText = `${survivedTime}s`;
            document.getElementById('res-hp').innerText = `0 / ${this.maxHp}`;
            document.getElementById('res-damage').innerText = `${this.totalDamageTaken}`;
            document.getElementById('res-collisions').innerText = `${this.collisionCount}`;
            document.getElementById('res-score').innerText = `${Math.floor(this.score)}`;

            document.getElementById('btn-result-retry').innerText = 'TRY AGAIN';
            this.resultScreen.classList.remove('hidden');
        }, 600);
    }

    triggerVictory() {
        this.gameState = 'VICTORY';
        if (window.soundManager) window.soundManager.playVictory();

        // Bonus score for remaining health
        this.score += this.currentHp * 5;

        setTimeout(() => {
            const header = document.getElementById('result-header');
            header.innerText = '60 SECONDS SURVIVED!';
            header.className = 'result-title survived';

            document.getElementById('res-time').innerText = `60.0s`;
            document.getElementById('res-hp').innerText = `${this.currentHp} / ${this.maxHp}`;
            document.getElementById('res-damage').innerText = `${this.totalDamageTaken}`;
            document.getElementById('res-collisions').innerText = `${this.collisionCount}`;
            document.getElementById('res-score').innerText = `${Math.floor(this.score)}`;

            document.getElementById('btn-result-retry').innerText = 'PLAY AGAIN';
            this.resultScreen.classList.remove('hidden');
        }, 600);
    }

    tick(time) {
        const dt = Math.min(0.08, (time - this.lastFrameTime) / 1000);
        this.lastFrameTime = time;

        if (this.gameState === 'PLAYING') {
            // Update 60s survival timer
            this.remainingTime -= dt;
            if (this.remainingTime <= 0) {
                this.remainingTime = 0;
                this.updateHUD();
                this.triggerVictory();
                return;
            }

            // Update Vehicle Physics
            this.physics.updateVehicle(this.player, this.keys, dt);

            // Distance & Score calculation
            const dx = this.player.x - this.lastX;
            const dz = this.player.z - this.lastZ;
            const dist = Math.hypot(dx, dz);
            this.distanceTravelled += dist;
            this.score += dist * 1.5 + dt * 25; // 25 score/s + distance
            this.lastX = this.player.x;
            this.lastZ = this.player.z;

            // Audio & visual drift feedback
            const speedRatio = Math.abs(this.player.speed) / this.player.stats.maxSpeed;
            if (window.soundManager) {
                window.soundManager.updateEngine(speedRatio, this.keys.forward);
                if (this.player.isDrifting) {
                    window.soundManager.playScreech();
                    this.particles.spawnTireSmoke(this.player.x, this.player.z);
                }
            }

            // Low health smoking vehicle effect
            if (this.currentHp < 300) {
                const isCritical = this.currentHp < 150;
                this.particles.spawnHoodSmoke(this.player.x, 0.7, this.player.z, isCritical);
            }

            // Animate rolling wheels
            if (this.player.wheels) {
                const rollAngle = (this.player.speed * dt) / 0.38;
                for (const w of this.player.wheels) {
                    w.rotation.x += rollAngle;
                }
            }

            // Update AI Pursuers & Traffic
            this.ai.update(dt, this.player, this.remainingTime, (aiHit) => {
                const v = aiHit.impactSpeed;
                let baseDmg = 50;
                if (aiHit.isPursuit) {
                    baseDmg = 55 + Math.min(65, v * 3.5);
                } else {
                    baseDmg = 40 + Math.min(45, v * 2.5);
                }
                this.applyDamage(baseDmg, aiHit);
            });

            // Near Miss Bonus Check
            if (this.nearMissCooldown > 0) {
                this.nearMissCooldown -= dt;
            } else if (Math.abs(this.player.speed) > 12) {
                let nearMissFound = false;
                const checkVehicles = [...this.ai.pursuitVehicles, ...this.ai.trafficVehicles];
                for (const v of checkVehicles) {
                    const d = Math.hypot(this.player.x - v.x, this.player.z - v.z);
                    if (d > 2.2 && d < 4.2) {
                        nearMissFound = true;
                        break;
                    }
                }
                if (nearMissFound) {
                    this.score += 150;
                    this.particles.showDamageNumber(150, this.player.x, 1.2, this.player.z, 'nearmiss');
                    this.nearMissCooldown = 0.9;
                }
            }

            // Check Obstacle Collisions
            const hits = this.physics.checkCollisions(this.player, time / 1000);
            for (const hit of hits) {
                // Calculate damage based on impact speed
                // Light bump: 30–50 HP
                // Normal collision: ~50 HP
                // Strong collision: 75–120 HP
                // Heavy crash: 150–250 HP
                const v = hit.impactSpeed;
                let dmg = 50;
                if (v < 4.0) {
                    dmg = 30 + (v / 4.0) * 20; // 30 - 50
                } else if (v < 8.0) {
                    dmg = 45 + ((v - 4.0) / 4.0) * 15; // 45 - 60 (centered around 50)
                } else if (v < 15.0) {
                    dmg = 65 + ((v - 8.0) / 7.0) * 55; // 65 - 120
                } else {
                    dmg = 125 + Math.min(125, ((v - 15.0) / 10.0) * 125); // 125 - 250
                }

                this.applyDamage(dmg, hit);
            }

            this.updateHUD();
        }

        // Camera Follow & Damping
        this.updateCamera(dt);

        // Particles update
        this.particles.update(dt);

        // Render scene
        this.renderer.render(this.scene, this.camera);
        requestAnimationFrame((t) => this.tick(t));
    }

    updateCamera(dt) {
        if (!this.player) return;

        // Smooth target position behind the vehicle
        const forwardX = Math.sin(this.player.heading);
        const forwardZ = Math.cos(this.player.heading);

        // Isometric offset from vehicle
        const targetCamX = this.player.x - forwardX * 14.5;
        const targetCamY = 17.5;
        const targetCamZ = this.player.z - forwardZ * 14.5;

        // Smooth camera lerp (eliminates any jitter)
        const lerpFactor = Math.min(1.0, 8.5 * dt);
        this.cameraPos.x += (targetCamX - this.cameraPos.x) * lerpFactor;
        this.cameraPos.y += (targetCamY - this.cameraPos.y) * lerpFactor;
        this.cameraPos.z += (targetCamZ - this.cameraPos.z) * lerpFactor;

        // Apply controlled screen shake
        const shake = this.particles.updateShake(dt);
        this.camera.position.set(this.cameraPos.x + shake.x, this.cameraPos.y + shake.y, this.cameraPos.z);

        // Look at slightly ahead of the car for clear forward road visibility
        const lookTargetX = this.player.x + forwardX * 5.5;
        const lookTargetZ = this.player.z + forwardZ * 5.5;
        this.cameraLookAt.x += (lookTargetX - this.cameraLookAt.x) * lerpFactor;
        this.cameraLookAt.y = 0.8;
        this.cameraLookAt.z += (lookTargetZ - this.cameraLookAt.z) * lerpFactor;

        this.camera.lookAt(this.cameraLookAt.x, this.cameraLookAt.y, this.cameraLookAt.z);
    }
}

// Start game instance on load
window.addEventListener('DOMContentLoaded', () => {
    window.game = new Game();
});
