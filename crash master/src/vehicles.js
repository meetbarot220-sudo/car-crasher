// Procedural 3D Arcade Vehicle Mesh Generator & Vehicle Profiles

const VEHICLE_CONFIGS = {
    cruiser: {
        id: 'cruiser',
        name: 'Apex Cruiser',
        type: 'Balanced',
        description: 'Dependable street runner with balanced acceleration, responsive turning, and standard chassis resistance.',
        hp: 1000,
        damageResistance: 1.0, // standard damage multiplier
        maxSpeed: 23,
        accel: 24,
        turnSpeed: 3.2,
        radius: 1.35,
        color: 0x00d2ff, // Bright Neon Cyan
        accentColor: 0x111122,
        brakeForce: 30
    },
    speedster: {
        id: 'speedster',
        name: 'Thunderbolt RS',
        type: 'Speed',
        description: 'Hyper-responsive racer with blistering acceleration, but fragile panels take 25% higher crash damage.',
        hp: 1000,
        damageResistance: 1.25, // takes more damage
        maxSpeed: 28,
        accel: 30,
        turnSpeed: 3.6,
        radius: 1.25,
        color: 0xff3b30, // Racing Crimson
        accentColor: 0xffffff,
        brakeForce: 34
    },
    heavy: {
        id: 'heavy',
        name: 'Titan Enforcer',
        type: 'Heavy',
        description: 'Armored heavy-duty rig with reinforced steel bumper. Absorbs 30% crash impact, but heavier handling.',
        hp: 1000,
        damageResistance: 0.70, // takes 30% less damage
        maxSpeed: 19,
        accel: 19,
        turnSpeed: 2.6,
        radius: 1.55,
        color: 0xffa500, // Safety Industrial Amber
        accentColor: 0x222222,
        brakeForce: 26
    }
};

class VehicleFactory {
    static createVehicleMesh(config) {
        const group = new THREE.Group();

        // 1. Main Lower Chassis
        const isHeavy = config.id === 'heavy';
        const isSpeed = config.id === 'speedster';

        const bodyWidth = isHeavy ? 1.7 : (isSpeed ? 1.4 : 1.5);
        const bodyLength = isHeavy ? 3.4 : (isSpeed ? 3.0 : 3.1);
        const bodyHeight = isHeavy ? 0.9 : 0.65;

        const bodyGeo = new THREE.BoxGeometry(bodyWidth, bodyHeight, bodyLength);
        const bodyMat = new THREE.MeshLambertMaterial({
            color: config.color,
            flatShading: true
        });
        const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
        bodyMesh.position.y = bodyHeight * 0.5 + 0.35;
        bodyMesh.castShadow = true;
        group.add(bodyMesh);

        // 2. Cabin / Roof
        const cabinWidth = bodyWidth * 0.82;
        const cabinLength = bodyLength * (isHeavy ? 0.65 : 0.48);
        const cabinHeight = isHeavy ? 0.85 : 0.6;
        const cabinGeo = new THREE.BoxGeometry(cabinWidth, cabinHeight, cabinLength);
        const cabinMat = new THREE.MeshLambertMaterial({
            color: 0x181a20,
            flatShading: true
        });
        const cabinMesh = new THREE.Mesh(cabinGeo, cabinMat);
        cabinMesh.position.set(0, bodyMesh.position.y + bodyHeight * 0.5 + cabinHeight * 0.5 - 0.05, isHeavy ? 0.1 : -0.2);
        group.add(cabinMesh);

        // 3. Windshield & Windows
        const glassMat = new THREE.MeshBasicMaterial({ color: 0x88ccff });
        // Front Windshield
        const frontGlassGeo = new THREE.PlaneGeometry(cabinWidth * 0.85, cabinHeight * 0.75);
        const frontGlass = new THREE.Mesh(frontGlassGeo, glassMat);
        frontGlass.position.set(0, cabinMesh.position.y, cabinMesh.position.z + cabinLength * 0.5 + 0.01);
        group.add(frontGlass);

        // Rear Glass
        const rearGlass = new THREE.Mesh(frontGlassGeo, glassMat);
        rearGlass.position.set(0, cabinMesh.position.y, cabinMesh.position.z - cabinLength * 0.5 - 0.01);
        rearGlass.rotation.y = Math.PI;
        group.add(rearGlass);

        // 4. Bumpers
        const bumperMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
        const fvBumperGeo = new THREE.BoxGeometry(bodyWidth + 0.1, 0.25, 0.25);
        const frontBumper = new THREE.Mesh(fvBumperGeo, bumperMat);
        frontBumper.position.set(0, 0.45, bodyLength * 0.5 + 0.1);
        group.add(frontBumper);

        const rearBumper = new THREE.Mesh(fvBumperGeo, bumperMat);
        rearBumper.position.set(0, 0.45, -bodyLength * 0.5 - 0.1);
        group.add(rearBumper);

        // 5. Headlights (Bright Yellow/White)
        const lightGeo = new THREE.BoxGeometry(0.25, 0.15, 0.08);
        const lightMat = new THREE.MeshBasicMaterial({ color: 0xffffea });
        const leftLight = new THREE.Mesh(lightGeo, lightMat);
        leftLight.position.set(-bodyWidth * 0.35, 0.58, bodyLength * 0.5 + 0.05);
        group.add(leftLight);

        const rightLight = new THREE.Mesh(lightGeo, lightMat);
        rightLight.position.set(bodyWidth * 0.35, 0.58, bodyLength * 0.5 + 0.05);
        group.add(rightLight);

        // 6. Taillights (Red)
        const tailLightMat = new THREE.MeshBasicMaterial({ color: 0xff1500 });
        const leftTail = new THREE.Mesh(lightGeo, tailLightMat);
        leftTail.position.set(-bodyWidth * 0.35, 0.58, -bodyLength * 0.5 - 0.05);
        group.add(leftTail);

        const rightTail = new THREE.Mesh(lightGeo, tailLightMat);
        rightTail.position.set(bodyWidth * 0.35, 0.58, -bodyLength * 0.5 - 0.05);
        group.add(rightTail);

        // 7. Wheels
        const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.28, 12);
        wheelGeo.rotateZ(Math.PI / 2);
        const wheelMat = new THREE.MeshLambertMaterial({ color: 0x1e1e1e });

        const wheelOffsets = [
            [-bodyWidth * 0.52, 0.38, bodyLength * 0.32],
            [bodyWidth * 0.52, 0.38, bodyLength * 0.32],
            [-bodyWidth * 0.52, 0.38, -bodyLength * 0.32],
            [bodyWidth * 0.52, 0.38, -bodyLength * 0.32]
        ];

        const wheels = [];
        for (const pos of wheelOffsets) {
            const wheel = new THREE.Mesh(wheelGeo, wheelMat);
            wheel.position.set(pos[0], pos[1], pos[2]);
            group.add(wheel);
            wheels.push(wheel);
        }

        // Custom details: Spoiler for Speedster, Roofrack / Bullbar for Heavy
        if (isSpeed) {
            const spoilerGeo = new THREE.BoxGeometry(bodyWidth * 0.9, 0.1, 0.3);
            const spoilerMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
            const spoiler = new THREE.Mesh(spoilerGeo, spoilerMat);
            spoiler.position.set(0, bodyMesh.position.y + bodyHeight * 0.5 + 0.35, -bodyLength * 0.42);
            group.add(spoiler);
        }

        return {
            mesh: group,
            wheels: wheels,
            config: config
        };
    }
}

window.VEHICLE_CONFIGS = VEHICLE_CONFIGS;
window.VehicleFactory = VehicleFactory;
