const fs = require('fs');

function parseGlb(file) {
  const data = fs.readFileSync(file);
  const jsonLength = data.readUInt32LE(12);
  const json = JSON.parse(data.subarray(20, 20 + jsonLength).toString());
  const binHeader = 20 + jsonLength;
  const binLength = data.readUInt32LE(binHeader);
  const bin = data.subarray(binHeader + 8, binHeader + 8 + binLength);
  return { json, bin };
}

function accessorValues(glb, accessorIndex) {
  const accessor = glb.json.accessors[accessorIndex];
  const view = glb.json.bufferViews[accessor.bufferView];
  const components = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[accessor.type];
  const sizes = { 5121: 1, 5123: 2, 5125: 4, 5126: 4 };
  const readers = { 5121: 'readUInt8', 5123: 'readUInt16LE', 5125: 'readUInt32LE', 5126: 'readFloatLE' };
  const size = sizes[accessor.componentType];
  const stride = view.byteStride || components * size;
  const base = (view.byteOffset || 0) + (accessor.byteOffset || 0);
  return Array.from({ length: accessor.count }, (_, index) =>
    Array.from({ length: components }, (_unused, component) =>
      glb.bin[readers[accessor.componentType]](base + index * stride + component * size)
    )
  );
}

const analyses = [];
for (let model = 1; model <= 3; model += 1) {
  const glb = parseGlb(`assets/gewen-${model}.glb`);
  const primitive = glb.json.meshes[0].primitives.find(item =>
    glb.json.materials[item.material].name.startsWith('Eye_')
  );
  const indices = accessorValues(glb, primitive.indices).flat();
  const positions = accessorValues(glb, primitive.attributes.POSITION);
  const uvs = accessorValues(glb, primitive.attributes.TEXCOORD_0);
  const used = [...new Set(indices)];
  const zBands = new Map();
  for (const index of used) {
    const key = positions[index][2].toFixed(5);
    zBands.set(key, (zBands.get(key) || 0) + 1);
  }
  const zs = used.map(index => positions[index][2]);
  const us = used.map(index => uvs[index][0]);
  const vs = used.map(index => uvs[index][1]);
  console.log({
    model,
    material: glb.json.materials[primitive.material].name,
    triangles: indices.length / 3,
    vertices: used.length,
    zRange: [Math.min(...zs), Math.max(...zs)],
    uvRange: [Math.min(...us), Math.max(...us), Math.min(...vs), Math.max(...vs)],
    largestZBands: [...zBands].sort((a, b) => b[1] - a[1]).slice(0, 12)
  });
  analyses.push({ model, positions, uvs });
}

for (const name of ['positions', 'uvs']) {
  const left = analyses[0][name];
  const right = analyses[1][name];
  let changed = 0;
  let maxDelta = 0;
  for (let index = 0; index < left.length; index += 1) {
    for (let component = 0; component < left[index].length; component += 1) {
      const delta = Math.abs(left[index][component] - right[index][component]);
      if (delta > 1e-7) changed += 1;
      maxDelta = Math.max(maxDelta, delta);
    }
  }
  console.log(`model 1 vs 2 ${name}`, { changed, maxDelta });
}
