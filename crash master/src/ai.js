// Lightweight, High-Performance Pursuit AI & Ambient Traffic System

class AIManager {
    constructor(scene, physics, particles) {
        this.scene = scene;
        this.physics = physics;
        this.particles = particles;
        this.pursuitVehicles = [];
        this.trafficVehicles = [];
        this.maxPursuers = 5;
        this.maxTraffic = 6;
        this.sirenTimer = 0;
        this.sirenState = false;

        // Shared materials
        this.sirenRedMat = new THREE.MeshBasicMaterial({ color: 0xff0022 });
        this.sirenBlueMat = new THREE.MeshBasicMaterial({ color: 0x0055ff });
        this.sirenDimMat = new THREE.MeshBasicMaterial({ color: 0x222222 });
    }

    createPursuitMesh() {
        const group = new THREE.Group();
        const width = 1.5;
        const length = 3.2;
        const height = 0.7;

        // Interceptor body (Sleek black & white pursuit cruiser)
        const bodyGeo = new THREE.BoxGeometry(width, height, length);
        const bodyMat = new THREE.MeshLambertMaterial({ color: 0x111625 });
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        body.position.y = height * 0.5 + 0.35;
        group.add(body);

        // White doors / roof section
        const cabinGeo = new THREE.BoxGeometry(width * 0.84, 0.65, length * 0.5);
        const cabinMat = new THREE.MeshLambertMaterial({ color: 0xeeeeee });
        const cabin = new THREE.Mesh(cabinGeo, cabinMat);
        cabin.position.set(0, body.position.y + height * 0.5 + 0.3, -0.15);
        group.add(cabin);

        // Windows
        const winMat = new THREE.MeshBasicMaterial({ color: 0x1a2b3c });
        const winGeo = new THREE.PlaneGeometry(width * 0.8, 0.45);
        const fWin = new THREE.Mesh(winGeo, winMat);
        fWin.position.set(0, cabin.position.y, cabin.position.z + length * 0.25 + 0.01);
        group.add(fWin);

        // Lightbar (Red & Blue flashing sirens)
        const barBaseGeo = new THREE.BoxGeometry(width * 0.65, 0.12, 0.25);
        const barBaseMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
        const barBase = new THREE.Mesh(barBaseGeo, barBaseMat);
        barBase.position.set(0, cabin.position.y + 0.38, cabin.position.z);
        group.add(barBase);

        const sirenGeo = new THREE.BoxGeometry(0.3, 0.15, 0.2);
        const leftSiren = new THREE.Mesh(sirenGeo, this.sirenRedMat);
        leftSiren.position.set(-0.3, cabin.position.y + 0.45, cabin.position.z);
        group.add(leftSiren);

        const rightSiren = new THREE.Mesh(sirenGeo, this.sirenBlueMat);
        rightSiren.position.set(0.3, cabin.position.y + 0.45, cabin.position.z);
        group.add(rightSiren);

        // Wheels
        const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.28, 10);
        wheelGeo.rotateZ(Math.PI / 2);
        const wheelMat = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
        const wheelOffsets = [
            [-width * 0.52, 0.38, length * 0.32],
            [width * 0.52, 0.38, length * 0.32],
            [-width * 0.52, 0.38, -length * 0.32],
            [width * 0.52, 0.38, -length * 0.32]
        ];
        for (const pos of wheelOffsets) {
            const w = new THREE.Mesh(wheelGeo, wheelMat);
            w.position.set(pos[0], pos[1], pos[2]);
            group.add(w);
        }

        return {
            mesh: group,
            leftSiren: leftSiren,
            rightSiren: rightSiren
        };
    }

    createTrafficMesh(colorHex) {
        const group = new THREE.Group();
        const width = 1.45;
        const length = 2.9;
        const height = 0.65;

        const bodyGeo = new THREE.BoxGeometry(width, height, length);
        const bodyMat = new THREE.MeshLambertMaterial({ color: colorHex });
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        body.position.y = height * 0.5 + 0.35;
        group.add(body);

        const cabinGeo = new THREE.BoxGeometry(width * 0.82, 0.6, length * 0.45);
        const cabinMat = new THREE.MeshLambertMaterial({ color: 0x222222 });
        const cabin = new THREE.Mesh(cabinGeo, cabinMat);
        cabin.position.set(0, body.position.y + height * 0.5 + 0.28, -0.1);
        group.add(cabin);

        // Wheels
        const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.26, 10);
        wheelGeo.rotateZ(Math.PI / 2);
        const wheelMat = new THREE.MeshLambertMaterial({ color: 0x252525 });
        const offsets = [
            [-width * 0.52, 0.36, length * 0.3],
            [width * 0.52, 0.36, length * 0.3],
            [-width * 0.52, 0.36, -length * 0.3],
            [width * 0.52, 0.36, -length * 0.3]
        ];
        for (const pos of offsets) {
            const w = new THREE.Mesh(wheelGeo, wheelMat);
            w.position.set(pos[0], pos[1], pos[2]);
            group.add(w);
        }

        return group;
    }

    spawnPursuitVehicle(playerX, playerZ, playerHeading) {
        // Spawn pursuer 45 to 70 meters away from player
        const angle = Math.random() * Math.PI * 2;
        const dist = 45 + Math.random() * 25;
        const spawnX = Math.max(-110, Math.min(110, playerX + Math.sin(angle) * dist));
        const spawnZ = Math.max(-110, Math.min(110, playerZ + Math.cos(angle) * dist));

        const vehData = this.createPursuitMesh();
        vehData.mesh.position.set(spawnX, 0, spawnZ);
        this.scene.add(vehData.mesh);

        const pursuer = {
            mesh: vehData.mesh,
            leftSiren: vehData.leftSiren,
            rightSiren: vehData.rightSiren,
            x: spawnX,
            z: spawnZ,
            vx: 0,
            vz: 0,
            speed: 8 + Math.random() * 4,
            maxSpeed: 21.0, // balanced chase speed (player is ~23-28)
            heading: Math.atan2(playerX - spawnX, playerZ - spawnZ),
            radius: 1.35,
            stuckTimer: 0,
            isReversing: false,
            reverseTimer: 0,
            lastHitTime: 0
        };

        this.pursuitVehicles.push(pursuer);
    }

    spawnTrafficVehicle(playerX, playerZ) {
        const trafficColors = [0xf1c40f, 0xe67e22, 0x95a5a6, 0x3498db, 0xffffff, 0x1abc9c];
        const color = trafficColors[Math.floor(Math.random() * trafficColors.length)];
        const mesh = this.createTrafficMesh(color);

        // Spawn along road network
        const spawnDistance = 50 + Math.random() * 30;
        const angle = Math.random() * Math.PI * 2;
        const spawnX = Math.max(-110, Math.min(110, playerX + Math.sin(angle) * spawnDistance));
        const spawnZ = Math.max(-110, Math.min(110, playerZ + Math.cos(angle) * spawnDistance));

        mesh.position.set(spawnX, 0, spawnZ);
        this.scene.add(mesh);

        // Travel along axis (0, pi/2, pi, 3pi/2)
        const directions = [0, Math.PI * 0.5, Math.PI, Math.PI * 1.5];
        const heading = directions[Math.floor(Math.random() * directions.length)];

        this.trafficVehicles.push({
            mesh: mesh,
            x: spawnX,
            z: spawnZ,
            vx: 0,
            vz: 0,
            speed: 11 + Math.random() * 4,
            maxSpeed: 14,
            heading: heading,
            radius: 1.3,
            lastHitTime: 0
        });
    }

    update(dt, player, remainingTime, onAICollision) {
        // Escalate pressure based on elapsed time:
        // 0-15s: 1-2 pursuers
        // 15-30s: 3 pursuers + traffic
        // 30-45s: 4 pursuers + traffic
        // 45-60s: 5 pursuers (maximum pressure)
        const elapsed = 60.0 - remainingTime;
        let targetPursuers = 2;
        if (elapsed > 45) targetPursuers = 5;
        else if (elapsed > 30) targetPursuers = 4;
        else if (elapsed > 15) targetPursuers = 3;

        // Maintain pursuit vehicle population
        if (this.pursuitVehicles.length < targetPursuers && Math.random() < 0.03) {
            this.spawnPursuitVehicle(player.x, player.z, player.heading);
        }

        // Maintain civilian traffic population
        if (this.trafficVehicles.length < this.maxTraffic && Math.random() < 0.02) {
            this.spawnTrafficVehicle(player.x, player.z);
        }

        // Siren flash animation
        this.sirenTimer += dt * 8;
        this.sirenState = Math.floor(this.sirenTimer) % 2 === 0;

        // 1. Update Pursuers
        for (let i = this.pursuitVehicles.length - 1; i >= 0; i--) {
            const p = this.pursuitVehicles[i];

            // Toggle siren light color
            if (p.leftSiren && p.rightSiren) {
                p.leftSiren.material = this.sirenState ? this.sirenRedMat : this.sirenDimMat;
                p.rightSiren.material = this.sirenState ? this.sirenDimMat : this.sirenBlueMat;
            }

            const dx = player.x - p.x;
            const dz = player.z - p.z;
            const dist = Math.hypot(dx, dz);

            // Despawn if too far away (> 130m)
            if (dist > 130) {
                this.scene.remove(p.mesh);
                this.pursuitVehicles.splice(i, 1);
                continue;
            }

            // Unstuck behavior
            if (Math.abs(p.speed) < 1.5) {
                p.stuckTimer += dt;
                if (p.stuckTimer > 1.2) {
                    p.isReversing = true;
                    p.reverseTimer = 1.0;
                    p.stuckTimer = 0;
                }
            } else {
                p.stuckTimer = Math.max(0, p.stuckTimer - dt);
            }

            if (p.isReversing) {
                p.reverseTimer -= dt;
                p.speed = -8.0;
                p.heading += 2.0 * dt; // turn while backing up
                if (p.reverseTimer <= 0) {
                    p.isReversing = false;
                    p.speed = 4.0;
                }
            } else {
                // Intercept steering logic: steer towards player + slight lead
                const leadX = player.x + Math.sin(player.heading) * Math.min(dist * 0.4, 15);
                const leadZ = player.z + Math.cos(player.heading) * Math.min(dist * 0.4, 15);
                const targetAngle = Math.atan2(leadX - p.x, leadZ - p.z);

                // Smooth angle wrap
                let angleDiff = targetAngle - p.heading;
                while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
                while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

                const steerTurn = 2.8 * dt;
                if (angleDiff > 0.05) p.heading += Math.min(angleDiff, steerTurn);
                else if (angleDiff < -0.05) p.heading -= Math.min(-angleDiff, steerTurn);

                // Accelerate towards player
                p.speed = Math.min(p.maxSpeed, p.speed + 16 * dt);
            }

            // Kinematic movement
            p.vx = Math.sin(p.heading) * p.speed;
            p.vz = Math.cos(p.heading) * p.speed;
            p.x += p.vx * dt;
            p.z += p.vz * dt;

            p.mesh.position.set(p.x, 0, p.z);
            p.mesh.rotation.y = p.heading;

            // Check collision with Player
            this.checkVehicleCollision(p, player, onAICollision, true);
        }

        // 2. Update Traffic
        for (let i = this.trafficVehicles.length - 1; i >= 0; i--) {
            const t = this.trafficVehicles[i];
            const dist = Math.hypot(player.x - t.x, player.z - t.z);

            if (dist > 130) {
                this.scene.remove(t.mesh);
                this.trafficVehicles.splice(i, 1);
                continue;
            }

            // Traffic moves steadily forward
            t.vx = Math.sin(t.heading) * t.speed;
            t.vz = Math.cos(t.heading) * t.speed;
            t.x += t.vx * dt;
            t.z += t.vz * dt;

            // Turn around or wrap if reaching map borders
            if (Math.abs(t.x) > 115 || Math.abs(t.z) > 115) {
                t.heading += Math.PI;
            }

            t.mesh.position.set(t.x, 0, t.z);
            t.mesh.rotation.y = t.heading;

            // Check collision with Player
            this.checkVehicleCollision(t, player, onAICollision, false);
        }
    }

    checkVehicleCollision(aiVeh, player, onAICollision, isPursuit) {
        const dx = player.x - aiVeh.x;
        const dz = player.z - aiVeh.z;
        const dist = Math.hypot(dx, dz);
        const minDist = player.stats.radius + aiVeh.radius;

        if (dist < minDist) {
            const now = performance.now() / 1000;
            if (now - aiVeh.lastHitTime < 0.35) return; // Cooldown
            aiVeh.lastHitTime = now;

            // Normal vector pointing from AI to Player
            const nx = dist > 0.001 ? dx / dist : 1;
            const nz = dist > 0.001 ? dz / dist : 0;

            // Relative impact speed
            const relVx = player.vx - aiVeh.vx;
            const relVz = player.vz - aiVeh.vz;
            const impactSpeed = Math.hypot(relVx, relVz);

            // Separate vehicles
            const overlap = (minDist - dist) * 0.5;
            player.x += nx * overlap;
            player.z += nz * overlap;
            aiVeh.x -= nx * overlap;
            aiVeh.z -= nz * overlap;

            // Elastic bounce impulse
            player.vx += nx * 6.5;
            player.vz += nz * 6.5;
            aiVeh.vx -= nx * 8.0;
            aiVeh.vz -= nz * 8.0;
            aiVeh.speed *= 0.3; // Stun AI car momentarily

            // Trigger damage callback on player
            onAICollision({
                hitX: (player.x + aiVeh.x) * 0.5,
                hitZ: (player.z + aiVeh.z) * 0.5,
                normalX: nx,
                normalZ: nz,
                impactSpeed: impactSpeed,
                isPursuit: isPursuit
            });
        }
    }

    clear() {
        for (const p of this.pursuitVehicles) {
            this.scene.remove(p.mesh);
        }
        for (const t of this.trafficVehicles) {
            this.scene.remove(t.mesh);
        }
        this.pursuitVehicles = [];
        this.trafficVehicles = [];
    }
}

window.AIManager = AIManager;
