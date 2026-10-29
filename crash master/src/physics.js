// Arcade 2D/3D Kinematic Collision & Vehicle Dynamics System

class PhysicsEngine {
    constructor() {
        this.colliders = []; // Static colliders { x, z, width, depth, type, health, destructible, isStatic }
    }

    registerCollider(collider) {
        this.colliders.push(collider);
    }

    clearColliders() {
        this.colliders = [];
    }

    // Vehicle state update
    updateVehicle(vehicle, controls, dt) {
        // controls: { forward: bool, backward: bool, left: bool, right: bool, drift: bool }
        const accel = vehicle.stats.accel;
        const maxSpeed = vehicle.stats.maxSpeed;
        const turnSpeed = vehicle.stats.turnSpeed;
        const brakeForce = vehicle.stats.brakeForce || 28;
        const drag = 3.5;

        // Acceleration & Reverse
        if (controls.forward) {
            vehicle.speed += accel * dt;
            if (vehicle.speed > maxSpeed) vehicle.speed = maxSpeed;
        } else if (controls.backward) {
            if (vehicle.speed > 2) {
                vehicle.speed -= brakeForce * dt; // Active braking
            } else {
                vehicle.speed -= (accel * 0.55) * dt; // Reversing
                if (vehicle.speed < -maxSpeed * 0.4) vehicle.speed = -maxSpeed * 0.4;
            }
        } else {
            // Natural rolling resistance
            if (vehicle.speed > 0) {
                vehicle.speed = Math.max(0, vehicle.speed - drag * dt);
            } else if (vehicle.speed < 0) {
                vehicle.speed = Math.min(0, vehicle.speed + drag * dt);
            }
        }

        // Steering logic: turning requires motion and scales with speed
        const speedRatio = Math.min(1.0, Math.abs(vehicle.speed) / 10);
        let turnMultiplier = speedRatio;
        if (vehicle.speed < 0) turnMultiplier = -turnMultiplier; // invert steering when backing up

        if (controls.drift && Math.abs(vehicle.speed) > 6) {
            vehicle.isDrifting = true;
            turnMultiplier *= 1.45; // sharper turn while drifting
        } else {
            vehicle.isDrifting = false;
        }

        if (controls.left) {
            vehicle.heading -= turnSpeed * turnMultiplier * dt;
        }
        if (controls.right) {
            vehicle.heading += turnSpeed * turnMultiplier * dt;
        }

        // Forward velocity vector based on heading
        const forwardX = Math.sin(vehicle.heading);
        const forwardZ = Math.cos(vehicle.heading);

        // Drift / slide lateral lerp
        const targetVx = forwardX * vehicle.speed;
        const targetVz = forwardZ * vehicle.speed;

        const lateralGrip = vehicle.isDrifting ? 4.5 : 12.0;
        vehicle.vx += (targetVx - vehicle.vx) * Math.min(1.0, lateralGrip * dt);
        vehicle.vz += (targetVz - vehicle.vz) * Math.min(1.0, lateralGrip * dt);

        // Update position tentative
        vehicle.x += vehicle.vx * dt;
        vehicle.z += vehicle.vz * dt;

        // Keep vehicle upright and aligned
        if (vehicle.mesh) {
            vehicle.mesh.position.x = vehicle.x;
            vehicle.mesh.position.z = vehicle.z;
            vehicle.mesh.rotation.y = vehicle.heading;
        }
    }

    // Check collision between a vehicle (oriented or radius) and static/world colliders
    checkCollisions(vehicle, nowTime) {
        const hits = [];
        const vehRadius = vehicle.stats.radius || 1.35;
        const vX = vehicle.x;
        const vZ = vehicle.z;

        for (let i = 0; i < this.colliders.length; i++) {
            const col = this.colliders[i];
            
            // Check broadphase distance
            const dx = vX - col.x;
            const dz = vZ - col.z;
            const halfW = col.width * 0.5;
            const halfD = col.depth * 0.5;
            const maxDim = Math.max(halfW, halfD) + vehRadius + 1.0;
            if (Math.abs(dx) > maxDim || Math.abs(dz) > maxDim) continue;

            // Closest point on box to circle center
            const clampX = Math.max(col.x - halfW, Math.min(col.x + halfW, vX));
            const clampZ = Math.max(col.z - halfD, Math.min(col.z + halfD, vZ));

            const distX = vX - clampX;
            const distZ = vZ - clampZ;
            const distSq = distX * distX + distZ * distZ;

            if (distSq < vehRadius * vehRadius) {
                const dist = Math.sqrt(distSq);
                let normalX = 0;
                let normalZ = 0;

                if (dist > 0.0001) {
                    normalX = distX / dist;
                    normalZ = distZ / dist;
                } else {
                    // Deep penetration fallback
                    normalX = dx > 0 ? 1 : -1;
                    normalZ = 0;
                }

                const penetration = vehRadius - dist;

                // Push vehicle back outside
                vehicle.x += normalX * penetration;
                vehicle.z += normalZ * penetration;

                // Relative velocity along impact normal
                const dotVel = vehicle.vx * normalX + vehicle.vz * normalZ;

                // Check hit cooldown for this object (prevent multi-frame repeat damage from single contact)
                const lastHit = col.lastHitTime || 0;
                const canTakeDamage = (nowTime - lastHit) > 0.28;

                if (dotVel < -1.2 && canTakeDamage) {
                    col.lastHitTime = nowTime;
                    const impactSpeed = Math.abs(dotVel);

                    // Bounce response
                    const restitution = 0.38;
                    vehicle.vx -= (1 + restitution) * dotVel * normalX;
                    vehicle.vz -= (1 + restitution) * dotVel * normalZ;

                    // Dampen forward speed
                    vehicle.speed = (vehicle.vx * Math.sin(vehicle.heading) + vehicle.vz * Math.cos(vehicle.heading)) * 0.6;

                    hits.push({
                        collider: col,
                        impactSpeed: impactSpeed,
                        normalX: normalX,
                        normalZ: normalZ,
                        hitX: clampX,
                        hitZ: clampZ
                    });
                }
            }
        }

        return hits;
    }
}

window.PhysicsEngine = PhysicsEngine;
