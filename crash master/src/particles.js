// Lightweight Particle System & Floating Damage Numbers & Screen Shake

class ParticleSystem {
    constructor(scene, camera) {
        this.scene = scene;
        this.camera = camera;
        this.particles = [];
        this.damageTextContainer = document.getElementById('damage-numbers-layer');

        // Spark geometry & materials pool
        this.sparkGeo = new THREE.BoxGeometry(0.18, 0.18, 0.18);
        this.sparkMat = new THREE.MeshBasicMaterial({ color: 0xffaa00 });
        this.smokeMat = new THREE.MeshBasicMaterial({ color: 0x999999, transparent: true, opacity: 0.5 });
        this.fireMat = new THREE.MeshBasicMaterial({ color: 0xff4400, transparent: true, opacity: 0.7 });

        // Screen shake
        this.shakeIntensity = 0;
        this.shakeDecay = 6.0;
        this.shakeOffset = { x: 0, y: 0 };
    }

    triggerShake(intensity = 0.4) {
        // Controlled, safe camera shake capped to prevent motion sickness
        this.shakeIntensity = Math.min(0.85, Math.max(this.shakeIntensity, intensity));
    }

    updateShake(dt) {
        if (this.shakeIntensity > 0.005) {
            this.shakeOffset.x = (Math.random() * 2 - 1) * this.shakeIntensity * 0.4;
            this.shakeOffset.y = (Math.random() * 2 - 1) * this.shakeIntensity * 0.4;
            this.shakeIntensity = Math.max(0, this.shakeIntensity - this.shakeDecay * dt);
        } else {
            this.shakeOffset.x = 0;
            this.shakeOffset.y = 0;
            this.shakeIntensity = 0;
        }
        return this.shakeOffset;
    }

    spawnImpactSparks(x, y, z, normalX, normalZ, count = 8) {
        for (let i = 0; i < count; i++) {
            const mesh = new THREE.Mesh(this.sparkGeo, this.sparkMat);
            mesh.position.set(x + (Math.random() - 0.5) * 0.4, y + 0.3 + Math.random() * 0.5, z + (Math.random() - 0.5) * 0.4);
            this.scene.add(mesh);

            const spread = (Math.random() - 0.5) * 1.5;
            const vx = normalX * (4 + Math.random() * 5) + (Math.random() - 0.5) * 4;
            const vy = 3 + Math.random() * 4;
            const vz = normalZ * (4 + Math.random() * 5) + (Math.random() - 0.5) * 4;

            this.particles.push({
                mesh: mesh,
                vx: vx,
                vy: vy,
                vz: vz,
                gravity: 14,
                life: 0.35 + Math.random() * 0.2,
                maxLife: 0.55,
                type: 'spark'
            });
        }
    }

    spawnTireSmoke(x, z) {
        if (Math.random() > 0.4) return; // rate limit for smooth performance
        const mesh = new THREE.Mesh(this.sparkGeo, this.smokeMat);
        mesh.scale.set(1.5, 0.8, 1.5);
        mesh.position.set(x + (Math.random() - 0.5) * 0.3, 0.2, z + (Math.random() - 0.5) * 0.3);
        this.scene.add(mesh);

        this.particles.push({
            mesh: mesh,
            vx: (Math.random() - 0.5) * 0.8,
            vy: 0.6 + Math.random() * 0.4,
            vz: (Math.random() - 0.5) * 0.8,
            gravity: -0.2, // rises slightly
            life: 0.4,
            maxLife: 0.4,
            type: 'smoke'
        });
    }

    spawnHoodSmoke(x, y, z, isCritical = false) {
        if (Math.random() > 0.5) return;
        const mat = isCritical && Math.random() > 0.4 ? this.fireMat : this.smokeMat;
        const mesh = new THREE.Mesh(this.sparkGeo, mat);
        mesh.scale.set(1.6, 1.6, 1.6);
        mesh.position.set(x + (Math.random() - 0.5) * 0.4, y + 0.4, z + (Math.random() - 0.5) * 0.4);
        this.scene.add(mesh);

        this.particles.push({
            mesh: mesh,
            vx: (Math.random() - 0.5) * 0.6,
            vy: 1.8 + Math.random() * 1.2,
            vz: (Math.random() - 0.5) * 0.6,
            gravity: -0.5,
            life: 0.5,
            maxLife: 0.5,
            type: 'hoodSmoke'
        });
    }

    showDamageNumber(damage, worldX, worldY, worldZ, severity = 'normal') {
        if (!this.damageTextContainer) return;
        const elem = document.createElement('div');
        elem.className = `floating-dmg severity-${severity}`;
        if (severity === 'nearmiss') {
            elem.innerText = `+${Math.round(damage)} NEAR MISS!`;
        } else {
            elem.innerText = `-${Math.round(damage)}`;
        }

        // Project world coordinates to screen
        const pos = new THREE.Vector3(worldX, worldY + 1.2, worldZ);
        pos.project(this.camera);

        const hw = window.innerWidth / 2;
        const hh = window.innerHeight / 2;
        const screenX = (pos.x * hw) + hw;
        const screenY = -(pos.y * hh) + hh;

        elem.style.left = `${screenX}px`;
        elem.style.top = `${screenY}px`;
        this.damageTextContainer.appendChild(elem);

        setTimeout(() => {
            if (elem.parentNode) elem.parentNode.removeChild(elem);
        }, 850);
    }

    update(dt) {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.life -= dt;

            if (p.life <= 0) {
                this.scene.remove(p.mesh);
                this.particles.splice(i, 1);
                continue;
            }

            p.vy -= p.gravity * dt;
            p.mesh.position.x += p.vx * dt;
            p.mesh.position.y += p.vy * dt;
            p.mesh.position.z += p.vz * dt;

            // Fade or scale
            const progress = p.life / p.maxLife;
            if (p.type === 'spark') {
                p.mesh.scale.setScalar(progress);
            } else if (p.type === 'smoke' || p.type === 'hoodSmoke') {
                const s = 1.0 + (1.0 - progress) * 1.5;
                p.mesh.scale.set(s, s, s);
            }
        }
    }

    clear() {
        for (const p of this.particles) {
            this.scene.remove(p.mesh);
        }
        this.particles = [];
        if (this.damageTextContainer) {
            this.damageTextContainer.innerHTML = '';
        }
    }
}

window.ParticleSystem = ParticleSystem;
