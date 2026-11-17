// Solmar — the city itself: a sun-soaked coastal grid with a beach, a park,
// a pier and the docks, all generated procedurally at load time.
// Layout: 9x9 blocks, pitch 58, road width 14. South edge is sand + ocean.

const CITY = {
  PITCH: 58, BLOCK: 44, ROAD: 14, N: 9,
  HALF: 261, // 9 * 58 / 2
  ROAD_LINES: [-232, -174, -116, -58, 0, 58, 116, 174, 232],
  // Block centres sit BETWEEN the roads, never on them.
  BLOCK_CENTERS: [-203, -145, -87, -29, 29, 87, 145, 203],
};

function buildCity(scene) {
  const U = SolmarUtil;
  const colliders = [];
  const landmarks = {};
  const group = new THREE.Group();
  group.name = 'city';
  scene.add(group);

  // ---- ground: one big canvas texture draws roads, sidewalks, park, sand
  const WORLD_W = 640, WORLD_D = 660; // x -320..320, z -300..360
  const ground = U.makeCanvas(2048, 2112);
  const g = ground.ctx;
  const px = WORLD_W / 2048; // world units per canvas pixel (x)
  const toX = (wx) => (wx + 320) / px;
  const toZ = (wz) => (wz + 300) / px;
  const w2px = (w) => w / px;

  g.fillStyle = '#8d8578'; g.fillRect(0, 0, 2048, 2112); // sidewalk base
  // Roads: asphalt strips along every road line.
  g.fillStyle = '#34383f';
  for (const line of CITY.ROAD_LINES) {
    g.fillRect(toX(line - 7), 0, w2px(14), 2112);
    g.fillRect(0, toZ(line - 7), 2048, w2px(14));
  }
  // Lane dashes: yellow centre line, white edge lines.
  g.fillStyle = '#e8d44d';
  for (const line of CITY.ROAD_LINES) {
    for (let z = -290; z < 350; z += 12) g.fillRect(toX(line - 0.35), toZ(z), w2px(0.7), w2px(5));
    for (let x = -310; x < 320; x += 12) g.fillRect(toX(x), toZ(line - 0.35), w2px(5), w2px(0.7));
  }
  g.fillStyle = 'rgba(240,240,240,0.85)';
  for (const line of CITY.ROAD_LINES) {
    g.fillRect(toX(line - 6.4), 0, w2px(0.5), 2112);
    g.fillRect(toX(line + 5.9), 0, w2px(0.5), 2112);
    g.fillRect(0, toZ(line - 6.4), 2048, w2px(0.5));
    g.fillRect(0, toZ(line + 5.9), 2048, w2px(0.5));
  }
  // Crosswalks at every intersection.
  g.fillStyle = 'rgba(245,245,245,0.9)';
  for (const rx of CITY.ROAD_LINES) for (const rz of CITY.ROAD_LINES) {
    for (let k = -2; k <= 2; k++) {
      g.fillRect(toX(rx + k * 2.2 - 0.8), toZ(rz - 6.6), w2px(1.6), w2px(2.6));
      g.fillRect(toX(rx + k * 2.2 - 0.8), toZ(rz + 4.0), w2px(1.6), w2px(2.6));
    }
  }
  // Palm Park on the block centred at (29, 29): lawn, paths, pond.
  g.fillStyle = '#5d9b4a';
  g.fillRect(toX(7), toZ(7), w2px(44), w2px(44));
  g.fillStyle = '#b09b7a';
  g.fillRect(toX(27), toZ(7), w2px(4), w2px(44));
  g.fillRect(toX(7), toZ(27), w2px(44), w2px(4));
  g.fillStyle = '#3f8fbf';
  g.beginPath(); g.arc(toX(40), toZ(40), w2px(8), 0, Math.PI * 2); g.fill();
  // Sand strip along the south edge, then the ground ends at the water.
  g.fillStyle = '#e3c98f';
  g.fillRect(0, toZ(268), 2048, toZ(330) - toZ(268));
  // Docks: concrete apron on the east edge.
  g.fillStyle = '#7a7d84';
  g.fillRect(toX(268), toZ(-30), w2px(52), w2px(160));

  const groundTex = U.canvasTexture(ground.canvas);
  const groundMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD_W, WORLD_D),
    new THREE.MeshLambertMaterial({ map: groundTex })
  );
  groundMesh.rotation.x = -Math.PI / 2;
  groundMesh.position.set(0, 0, 30);
  groundMesh.receiveShadow = true;
  group.add(groundMesh);

  // Ocean: a big animated plane south of the sand.
  const oceanGeo = new THREE.PlaneGeometry(700, 260, 24, 8);
  const oceanMat = new THREE.MeshPhongMaterial({ color: 0x1f7fa8, shininess: 120, specular: 0x99ddff, transparent: true, opacity: 0.94 });
  const ocean = new THREE.Mesh(oceanGeo, oceanMat);
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.set(0, 0.4, 460);
  ocean.userData.isOcean = true;
  group.add(ocean);

  // ---- buildings: window-lit boxes, taller near the centre
  const winTexCache = {};
  function windowTexture(base, litRatio) {
    const key = base + '|' + litRatio;
    if (winTexCache[key]) return winTexCache[key];
    const c = U.makeCanvas(128, 256);
    const x = c.ctx;
    x.fillStyle = base; x.fillRect(0, 0, 128, 256);
    for (let row = 0; row < 12; row++) for (let col = 0; col < 6; col++) {
      const lit = Math.random() < litRatio;
      x.fillStyle = lit ? '#ffd98a' : '#24384e';
      x.fillRect(8 + col * 20, 10 + row * 20, 12, 12);
    }
    const tex = U.canvasTexture(c.canvas);
    winTexCache[key] = tex;
    return tex;
  }
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x5a5a5e });
  const acMat = new THREE.MeshLambertMaterial({ color: 0x8a8f96 });

  function addBuilding(cx, cz, w, d, h, faceColor) {
    const mat = new THREE.MeshLambertMaterial({ map: windowTexture(faceColor, 0.45) });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(cx, h / 2, cz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.4, 0.5, d + 0.4), roofMat);
    roof.position.set(cx, h + 0.25, cz);
    group.add(roof);
    if (Math.random() < 0.6) {
      const ac = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.1, 2.2), acMat);
      ac.position.set(cx + U.rand(-w / 4, w / 4), h + 1, cz + U.rand(-d / 4, d / 4));
      group.add(ac);
    }
    colliders.push({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2 });
    return mesh;
  }

  // One or two towers per block; the centre blocks grow taller.
  for (const cx of CITY.BLOCK_CENTERS) for (const cz of CITY.BLOCK_CENTERS) {
    if (cx === 29 && cz === 29) continue; // Palm Park stays open
    if (cx === -87 && cz === 87) continue; // safehouse plot
    if (cx === -29 && cz === -87) continue; // paint shop plot
    if (cx === 29 && cz === -87) continue; // bank plot
    const distC = Math.abs(cx) + Math.abs(cz);
    const hBase = U.rand(9, 16) + Math.max(0, (290 - distC) / 58) * U.rand(2.5, 4.5);
    const face = U.pick(U.PALETTE.buildingFaces);
    if (Math.random() < 0.55) {
      addBuilding(cx + U.rand(-6, 6), cz + U.rand(-6, 6), U.rand(20, 30), U.rand(20, 30), hBase, face);
    } else {
      addBuilding(cx - 9, cz - 8, U.rand(15, 20), U.rand(15, 20), hBase * U.rand(0.6, 0.9), face);
      addBuilding(cx + 10, cz + 9, U.rand(15, 20), U.rand(15, 20), hBase * U.rand(0.9, 1.35), U.pick(U.PALETTE.buildingFaces));
    }
  }

  // ---- landmark buildings (named, so missions can point at them)
  function landmarkBuilding(cx, cz, w, d, h, color, name) {
    const mesh = addBuilding(cx, cz, w, d, h, color);
    mesh.name = name;
    return mesh;
  }
  // Solmar National Bank — the big score, on the block (29, -87).
  landmarkBuilding(29, -87, 34, 26, 22, '#c9a37e', 'bank');
  landmarks.bank = { x: 29, z: -66, name: 'Solmar National Bank' };
  // Spray & Shine paint shop — low, wide, neon sign, on (-29, -87).
  landmarkBuilding(-29, -87, 30, 18, 9, '#7e9b8a', 'paintshop');
  landmarks.paintShop = { x: -29, z: -64, name: 'Spray & Shine' };
  // Leo's safehouse — a small two-storey house with a garage, on (-87, 87).
  const houseMat = new THREE.MeshLambertMaterial({ color: 0xe8c98f });
  const house = new THREE.Mesh(new THREE.BoxGeometry(14, 7, 11), houseMat);
  house.position.set(-87, 3.5, 87);
  house.castShadow = true;
  group.add(house);
  const roof2 = new THREE.Mesh(new THREE.ConeGeometry(10.5, 4, 4), new THREE.MeshLambertMaterial({ color: 0x8a4a3a }));
  roof2.position.set(-87, 9, 87);
  roof2.rotation.y = Math.PI / 4;
  group.add(roof2);
  colliders.push({ minX: -94, maxX: -80, minZ: 81.5, maxZ: 92.5 });
  landmarks.safehouse = { x: -87, z: 110, name: "Leo's Place" };
  // Docks — crates and a warehouse on the east apron.
  const crateMat = new THREE.MeshLambertMaterial({ color: 0x9a7a4a });
  const crateMat2 = new THREE.MeshLambertMaterial({ color: 0x6a7a8a });
  for (let i = 0; i < 10; i++) {
    const s = U.rand(2, 3.4);
    const crate = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), i % 2 ? crateMat : crateMat2);
    crate.position.set(U.rand(272, 308), s / 2, U.rand(-20, 140));
    crate.rotation.y = U.rand(0, Math.PI);
    crate.castShadow = true;
    group.add(crate);
    colliders.push({ minX: crate.position.x - s / 2, maxX: crate.position.x + s / 2, minZ: crate.position.z - s / 2, maxZ: crate.position.z + s / 2 });
  }
  landmarkBuilding(292, 60, 26, 40, 12, '#8fa3b8', 'warehouse');
  landmarks.docks = { x: 272, z: 20, name: 'Solmar Docks' };
  // Pier — wooden boards out over the water, south edge.
  const pierMat = new THREE.MeshLambertMaterial({ color: 0x8a6a44 });
  for (let z = 330; z <= 372; z += 3) {
    const plank = new THREE.Mesh(new THREE.BoxGeometry(16, 0.5, 2.6), pierMat);
    plank.position.set(0, 1.2, z);
    group.add(plank);
  }
  landmarks.pier = { x: 0, z: 372, name: 'Sunset Pier' };
  landmarks.park = { x: 29, z: 29, name: 'Palm Park' };
  landmarks.beach = { x: -60, z: 292, name: 'Solmar Beach' };

  // ---- street props: palms, lamps, park trees
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x7a5a38 });
  const palmMat = new THREE.MeshLambertMaterial({ color: 0x3f8f4f });
  function palm(x, z, s) {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25 * s, 0.4 * s, 6 * s, 6), trunkMat);
    trunk.position.set(x, 3 * s, z);
    trunk.castShadow = true;
    group.add(trunk);
    const top = new THREE.Mesh(new THREE.ConeGeometry(2.6 * s, 3.2 * s, 7), palmMat);
    top.position.set(x, 7 * s, z);
    group.add(top);
  }
  for (let x = -280; x <= 280; x += 28) { palm(x + U.rand(-4, 4), 282 + U.rand(-3, 3), U.rand(0.9, 1.3)); }
  for (let i = 0; i < 12; i++) palm(U.rand(9, 49), U.rand(9, 49), U.rand(0.9, 1.4));
  for (let i = 0; i < 10; i++) palm(U.rand(-280, 280), U.rand(-250, -240), 1);

  const lampPoleMat = new THREE.MeshLambertMaterial({ color: 0x2a2d33 });
  const lampGlowMat = new THREE.MeshBasicMaterial({ color: 0xffd98a });
  for (const rx of CITY.ROAD_LINES) for (const rz of CITY.ROAD_LINES) {
    if ((rx + rz) % 116 !== 0) continue;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 7, 6), lampPoleMat);
    pole.position.set(rx + 8.2, 3.5, rz + 8.2);
    group.add(pole);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.45, 8, 6), lampGlowMat);
    lamp.position.set(rx + 8.2, 7.1, rz + 8.2);
    group.add(lamp);
  }

  // Neon signs on the landmark fronts (emissive boxes, sunset glow).
  function neonSign(x, y, z, w, color) {
    const sign = new THREE.Mesh(new THREE.BoxGeometry(w, 1.6, 0.5), new THREE.MeshBasicMaterial({ color }));
    sign.position.set(x, y, z);
    group.add(sign);
  }
  neonSign(29, 23.5, -73.5, 22, 0xff2e88);
  neonSign(-29, 10.5, -77.5, 18, 0x00e5ff);
  neonSign(-87, 8.5, 92.8, 10, 0xffd319);

  return { group, colliders, landmarks, ocean };
}
