// World & City Generator for 60-Second Survival

class CityWorld {
    constructor(scene, physics) {
        this.scene = scene;
        this.physics = physics;
        this.mapSize = 260; // 260x260 meters
        this.blockSize = 40; // Block grid unit
        this.roadWidth = 14;
        this.decorations = [];
    }

    generate() {
        this.createGround();
        this.createRoadGrid();
        this.createCityBlocks();
        this.createWorldBoundaries();
    }

    createGround() {
        // Base grass/ground terrain
        const groundGeo = new THREE.PlaneGeometry(this.mapSize + 40, this.mapSize + 40);
        groundGeo.rotateX(-Math.PI / 2);
        const groundMat = new THREE.MeshLambertMaterial({ color: 0x2e6b34 }); // stylized park grass green
        const ground = new THREE.Mesh(groundGeo, groundMat);
        ground.position.y = -0.05;
        ground.receiveShadow = true;
        this.scene.add(ground);
    }

    createRoadGrid() {
        // Asphalt material
        const roadMat = new THREE.MeshLambertMaterial({ color: 0x24282f });
        const lineMat = new THREE.MeshBasicMaterial({ color: 0xf5f5f5 });
        const yellowLineMat = new THREE.MeshBasicMaterial({ color: 0xffd200 });

        const halfMap = this.mapSize / 2;
        const step = this.blockSize + this.roadWidth;

        // Create horizontal and vertical road strips
        for (let coord = -halfMap + 25; coord <= halfMap - 25; coord += step) {
            // Horizontal Road
            const hRoadGeo = new THREE.PlaneGeometry(this.mapSize, this.roadWidth);
            hRoadGeo.rotateX(-Math.PI / 2);
            const hRoad = new THREE.Mesh(hRoadGeo, roadMat);
            hRoad.position.set(0, 0, coord);
            hRoad.receiveShadow = true;
            this.scene.add(hRoad);

            // Double Yellow Centerline
            const hYellowGeo = new THREE.PlaneGeometry(this.mapSize, 0.35);
            hYellowGeo.rotateX(-Math.PI / 2);
            const hYellow = new THREE.Mesh(hYellowGeo, yellowLineMat);
            hYellow.position.set(0, 0.02, coord);
            this.scene.add(hYellow);

            // Vertical Road
            const vRoadGeo = new THREE.PlaneGeometry(this.roadWidth, this.mapSize);
            vRoadGeo.rotateX(-Math.PI / 2);
            const vRoad = new THREE.Mesh(vRoadGeo, roadMat);
            vRoad.position.set(coord, 0.01, 0);
            vRoad.receiveShadow = true;
            this.scene.add(vRoad);

            // Double Yellow Centerline Vertical
            const vYellowGeo = new THREE.PlaneGeometry(0.35, this.mapSize);
            vYellowGeo.rotateX(-Math.PI / 2);
            const vYellow = new THREE.Mesh(vYellowGeo, yellowLineMat);
            vYellow.position.set(coord, 0.03, 0);
            this.scene.add(vYellow);
        }

        // Add crosswalk dashed lines at intersections
        const dashGeo = new THREE.PlaneGeometry(1.2, 0.35);
        dashGeo.rotateX(-Math.PI / 2);
        for (let x = -halfMap + 25; x <= halfMap - 25; x += step) {
            for (let z = -halfMap + 25; z <= halfMap - 25; z += step) {
                // Crosswalk accents around intersection
                this.addIntersectionAccents(x, z, lineMat);
            }
        }
    }

    addIntersectionAccents(cx, cz, lineMat) {
        const offset = this.roadWidth * 0.5 + 1.2;
        // 4 crosswalk markings
        const crosswalkGeo = new THREE.PlaneGeometry(this.roadWidth * 0.85, 0.8);
        crosswalkGeo.rotateX(-Math.PI / 2);

        const nMark = new THREE.Mesh(crosswalkGeo, lineMat);
        nMark.position.set(cx, 0.04, cz + offset);
        this.scene.add(nMark);

        const sMark = new THREE.Mesh(crosswalkGeo, lineMat);
        sMark.position.set(cx, 0.04, cz - offset);
        this.scene.add(sMark);

        const ewGeo = new THREE.PlaneGeometry(0.8, this.roadWidth * 0.85);
        ewGeo.rotateX(-Math.PI / 2);

        const eMark = new THREE.Mesh(ewGeo, lineMat);
        eMark.position.set(cx + offset, 0.04, cz);
        this.scene.add(eMark);

        const wMark = new THREE.Mesh(ewGeo, lineMat);
        wMark.position.set(cx - offset, 0.04, cz);
        this.scene.add(wMark);
    }

    createCityBlocks() {
        const halfMap = this.mapSize / 2;
        const step = this.blockSize + this.roadWidth;
        const blockCenters = [];

        for (let x = -halfMap + 25 + step * 0.5; x < halfMap - 25; x += step) {
            for (let z = -halfMap + 25 + step * 0.5; z < halfMap - 25; z += step) {
                blockCenters.push({ x, z });
            }
        }

        const bldgColors = [
            0x2c3e50, 0x34495e, 0x7f8c8d, 0x95a5a6, 0xbdc3c7,
            0x4a69bd, 0x1e3799, 0x0c2461, 0x60a3bc, 0x3c6382
        ];

        let blockIndex = 0;
        for (const center of blockCenters) {
            blockIndex++;
            // Concrete sidewalk base for block
            const sidewalkGeo = new THREE.BoxGeometry(this.blockSize, 0.35, this.blockSize);
            const sidewalkMat = new THREE.MeshLambertMaterial({ color: 0x9ca3af });
            const sidewalk = new THREE.Mesh(sidewalkGeo, sidewalkMat);
            sidewalk.position.set(center.x, 0.175, center.z);
            this.scene.add(sidewalk);

            // Block types:
            // Block 1, 5, 8: Open Urban Park / Plaza with trees, benches, fountain/plaza
            // Block 3, 7: Industrial parking lot with barriers and small warehouse
            // Others: High-density Commercial / Skyscraper clusters
            const blockType = (blockIndex % 4);

            if (blockType === 1) {
                // URBAN PARK / ESCAPE ZONE
                this.buildParkBlock(center);
            } else if (blockType === 2) {
                // PARKING LOT / WAREHOUSE
                this.buildParkingLotBlock(center);
            } else {
                // COMMERCIAL BUILDING CLUSTER
                this.buildCommercialBlock(center, bldgColors);
            }
        }
    }

    buildCommercialBlock(center, bldgColors) {
        // Divide block into 2 to 4 distinct buildings
        const offsets = [
            { x: -10, z: -10, w: 16, d: 16 },
            { x: 10, z: -10, w: 16, d: 16 },
            { x: -10, z: 10, w: 16, d: 16 },
            { x: 10, z: 10, w: 16, d: 16 }
        ];

        // Shared window materials
        const winLitMat = new THREE.MeshBasicMaterial({ color: 0xfffae0 }); // warm lit window
        const winDimMat = new THREE.MeshBasicMaterial({ color: 0x1a2634 }); // dark window

        for (const off of offsets) {
            const bx = center.x + off.x;
            const bz = center.z + off.z;
            const bw = off.w - 1.5;
            const bd = off.d - 1.5;
            const height = 12 + Math.random() * 22;

            const color = bldgColors[Math.floor(Math.random() * bldgColors.length)];
            const bldgMat = new THREE.MeshLambertMaterial({ color: color });
            const bldgGeo = new THREE.BoxGeometry(bw, height, bd);
            const bldg = new THREE.Mesh(bldgGeo, bldgMat);
            bldg.position.set(bx, height * 0.5 + 0.35, bz);
            bldg.castShadow = true;
            this.scene.add(bldg);

            // Add arcade-style glowing windows along the facade
            const floors = Math.floor(height / 3.2);
            for (let f = 1; f < floors; f++) {
                const wy = f * 3.2;
                // South face windows
                const wGeo = new THREE.PlaneGeometry(1.6, 1.2);
                for (let wx = -bw * 0.35; wx <= bw * 0.35; wx += 2.8) {
                    const isLit = Math.random() > 0.45;
                    const winMesh = new THREE.Mesh(wGeo, isLit ? winLitMat : winDimMat);
                    winMesh.position.set(bx + wx, wy, bz + bd * 0.5 + 0.02);
                    this.scene.add(winMesh);
                }
            }

            // Decorative rooftop structure (AC unit or antenna)
            const acGeo = new THREE.BoxGeometry(bw * 0.38, 1.4, bd * 0.38);
            const acMat = new THREE.MeshLambertMaterial({ color: 0x222222 });
            const ac = new THREE.Mesh(acGeo, acMat);
            ac.position.set(bx + 1, height + 1.05, bz);
            this.scene.add(ac);

            // Register physics collider for the solid building
            this.physics.registerCollider({
                x: bx,
                z: bz,
                width: bw,
                depth: bd,
                type: 'building',
                isStatic: true
            });
        }

        // Add streetlights on corners of commercial blocks
        this.createStreetLamp(center.x - 18, center.z - 18);
        this.createStreetLamp(center.x + 18, center.z + 18);

        // Add fire hydrants
        this.createFireHydrant(center.x - 18, center.z);
    }

    createStreetLamp(x, z) {
        const poleGeo = new THREE.CylinderGeometry(0.12, 0.16, 5.0, 8);
        const poleMat = new THREE.MeshLambertMaterial({ color: 0x333333 });
        const pole = new THREE.Mesh(poleGeo, poleMat);
        pole.position.set(x, 2.5, z);
        this.scene.add(pole);

        const bulbGeo = new THREE.BoxGeometry(0.6, 0.25, 0.6);
        const bulbMat = new THREE.MeshBasicMaterial({ color: 0xfffae0 });
        const bulb = new THREE.Mesh(bulbGeo, bulbMat);
        bulb.position.set(x, 5.0, z);
        this.scene.add(bulb);

        this.physics.registerCollider({
            x: x,
            z: z,
            width: 0.8,
            depth: 0.8,
            type: 'lamp',
            isStatic: true
        });
    }

    createFireHydrant(x, z) {
        const hydrantGeo = new THREE.CylinderGeometry(0.3, 0.35, 0.9, 8);
        const hydrantMat = new THREE.MeshLambertMaterial({ color: 0xd63031 });
        const hydrant = new THREE.Mesh(hydrantGeo, hydrantMat);
        hydrant.position.set(x, 0.45, z);
        this.scene.add(hydrant);

        this.physics.registerCollider({
            x: x,
            z: z,
            width: 0.7,
            depth: 0.7,
            type: 'hydrant',
            isStatic: true
        });
    }

    buildParkBlock(center) {
        // Lush green interior
        const parkMat = new THREE.MeshLambertMaterial({ color: 0x3d8b40 });
        const parkGeo = new THREE.BoxGeometry(this.blockSize - 2, 0.4, this.blockSize - 2);
        const park = new THREE.Mesh(parkGeo, parkMat);
        park.position.set(center.x, 0.22, center.z);
        this.scene.add(park);

        // Center fountain/monument
        const fountainGeo = new THREE.CylinderGeometry(3.5, 3.8, 1.2, 12);
        const fountainMat = new THREE.MeshLambertMaterial({ color: 0x0088cc });
        const fountain = new THREE.Mesh(fountainGeo, fountainMat);
        fountain.position.set(center.x, 0.8, center.z);
        this.scene.add(fountain);

        this.physics.registerCollider({
            x: center.x,
            z: center.z,
            width: 7.2,
            depth: 7.2,
            type: 'fountain',
            isStatic: true
        });

        // Add scattered trees around the park
        const treePositions = [
            [-12, -12], [12, -12], [-12, 12], [12, 12],
            [-12, 0], [12, 0], [0, -12], [0, 12]
        ];

        for (const [tx, tz] of treePositions) {
            this.createTree(center.x + tx, center.z + tz);
        }
    }

    buildParkingLotBlock(center) {
        // Warehouse building in one half
        const whW = 18;
        const whD = 32;
        const whH = 7.5;
        const whMat = new THREE.MeshLambertMaterial({ color: 0x5a6268 });
        const whGeo = new THREE.BoxGeometry(whW, whH, whD);
        const warehouse = new THREE.Mesh(whGeo, whMat);
        warehouse.position.set(center.x - 8, whH * 0.5 + 0.35, center.z);
        this.scene.add(warehouse);

        this.physics.registerCollider({
            x: center.x - 8,
            z: center.z,
            width: whW,
            depth: whD,
            type: 'warehouse',
            isStatic: true
        });

        // Asphalt parking area in the other half
        const parkAreaGeo = new THREE.PlaneGeometry(16, 32);
        parkAreaGeo.rotateX(-Math.PI / 2);
        const parkMat = new THREE.MeshLambertMaterial({ color: 0x333338 });
        const parkMesh = new THREE.Mesh(parkAreaGeo, parkMat);
        parkMesh.position.set(center.x + 10, 0.38, center.z);
        this.scene.add(parkMesh);

        // Concrete barriers lining parking perimeter
        this.createBarrier(center.x + 17, center.z - 8, 1.2, 8, 0);
        this.createBarrier(center.x + 17, center.z + 8, 1.2, 8, 0);
    }

    createTree(x, z) {
        const trunkGeo = new THREE.CylinderGeometry(0.45, 0.55, 2.2, 8);
        const trunkMat = new THREE.MeshLambertMaterial({ color: 0x5c4033 });
        const trunk = new THREE.Mesh(trunkGeo, trunkMat);
        trunk.position.set(x, 1.3, z);
        this.scene.add(trunk);

        const foliageGeo = new THREE.DodecahedronGeometry(1.8, 1);
        const foliageMat = new THREE.MeshLambertMaterial({ color: 0x228b22, flatShading: true });
        const foliage = new THREE.Mesh(foliageGeo, foliageMat);
        foliage.position.set(x, 3.2, z);
        this.scene.add(foliage);

        // Register collider for tree trunk
        this.physics.registerCollider({
            x: x,
            z: z,
            width: 1.2,
            depth: 1.2,
            type: 'tree',
            isStatic: true
        });
    }

    createBarrier(x, z, width, depth, rotation = 0) {
        const barGeo = new THREE.BoxGeometry(width, 1.0, depth);
        const barMat = new THREE.MeshLambertMaterial({ color: 0xdd5500 }); // safety orange barrier
        const bar = new THREE.Mesh(barGeo, barMat);
        bar.position.set(x, 0.7, z);
        bar.rotation.y = rotation;
        this.scene.add(bar);

        this.physics.registerCollider({
            x: x,
            z: z,
            width: width,
            depth: depth,
            type: 'barrier',
            isStatic: true
        });
    }

    createWorldBoundaries() {
        const half = this.mapSize / 2;
        const wallThickness = 4.0;
        const wallHeight = 4.5;
        const wallMat = new THREE.MeshLambertMaterial({ color: 0x1f242d });

        const walls = [
            { x: 0, z: -half, w: this.mapSize, d: wallThickness },
            { x: 0, z: half, w: this.mapSize, d: wallThickness },
            { x: -half, z: 0, w: wallThickness, d: this.mapSize },
            { x: half, z: 0, w: wallThickness, d: this.mapSize }
        ];

        // Yellow warning stripe material on inner perimeter
        const stripeMat = new THREE.MeshBasicMaterial({ color: 0xffcc00 });

        for (const w of walls) {
            const geo = new THREE.BoxGeometry(w.w, wallHeight, w.d);
            const mesh = new THREE.Mesh(geo, wallMat);
            mesh.position.set(w.x, wallHeight * 0.5, w.z);
            this.scene.add(mesh);

            this.physics.registerCollider({
                x: w.x,
                z: w.z,
                width: w.w,
                depth: w.d,
                type: 'boundary',
                isStatic: true
            });
        }
    }
}

window.CityWorld = CityWorld;
