const fs = require('fs');

const file = process.argv[2];
const animationName = process.argv[3];
const data = fs.readFileSync(file);
const jsonLength = data.readUInt32LE(12);
const json = JSON.parse(data.subarray(20, 20 + jsonLength).toString());
const binStart = 20 + jsonLength + 8;

function values(accessorIndex) {
  const accessor = json.accessors[accessorIndex];
  const view = json.bufferViews[accessor.bufferView];
  const count = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[accessor.type];
  const size = accessor.componentType === 5126 ? 4 : 2;
  const read = accessor.componentType === 5126 ? 'readFloatLE' : 'readUInt16LE';
  const stride = view.byteStride || count * size;
  const start = binStart + (view.byteOffset || 0) + (accessor.byteOffset || 0);
  return Array.from({ length: accessor.count }, (_, row) =>
    Array.from({ length: count }, (_, column) => data[read](start + row * stride + column * size))
  );
}

const animation = json.animations.find(item => item.name === animationName);
const motions = [];
for (const channel of animation.channels) {
  if (channel.target.path !== 'translation' && channel.target.path !== 'scale') continue;
  const sampler = animation.samplers[channel.sampler];
  const samples = values(sampler.output);
  const ranges = [0, 1, 2].map(axis => {
    const axisValues = samples.map(sample => sample[axis]);
    return Math.max(...axisValues) - Math.min(...axisValues);
  });
  motions.push({ name: json.nodes[channel.target.node].name, path: channel.target.path, ranges, first: samples[0], maximum: Math.max(...ranges) });
}
console.log(motions.sort((a, b) => b.maximum - a.maximum).slice(0, 25));
