import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const modelFiles = ['gewen-1.glb', 'gewen-2.glb', 'gewen-3.glb', 'gewen-4.glb'];
const actions = [
  ['Greeting', '惊讶动作', 'Ctrl+Alt+1'],
  ['Interact', '互动', 'Ctrl+Alt+2'], ['DollAction', '洋娃娃', 'Ctrl+Alt+3'],
  ['Celebrate', '庆祝', 'Ctrl+Alt+4'],
  ['WandCelebrate', '魔法棒庆祝', 'Ctrl+Alt+5'],
  ['Run', '奔跑', 'Ctrl+Alt+6'],
  ['DanceIn', '舞蹈动作', 'Ctrl+Alt+7'],
  ['Idle_Base', '恢复待机', 'Ctrl+Alt+0']
];

const canvas = document.getElementById('stage');
const appElement = document.getElementById('app');
const loading = document.getElementById('loading');
const speech = document.getElementById('speech');
const actionPanel = document.getElementById('actionPanel');
const modelsButton = document.getElementById('modelsButton');
const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, premultipliedAlpha: true });
// Supersample the detailed transparent face cards before the canvas is scaled
// to desktop-pet size. This preserves Eye_Base detail without altering its
// original texture, alpha, color, or geometry.
renderer.setPixelRatio(Math.min(devicePixelRatio * 2, 4));
renderer.setClearColor(0x000000, 0);
renderer.outputColorSpace = THREE.SRGBColorSpace;
// Allocate the final backing store once. Actions no longer resize the native
// window or rebuild the supersampled WebGL buffers.
renderer.setSize(620, 700, false);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(28, 1, 0.01, 100);
camera.position.set(0, 0.2, 6);
const clock = new THREE.Clock();
const loader = new GLTFLoader();
let model;
let mixer;
let clips = new Map();
let currentAction;
let selectedModel = 0;
let loadToken = 0;
let headBone;
let leftEye;
let rightEye;
let gaze = { x: 0, y: 0 };
let smoothGazeX = 0;
let modelFacingY = 0;
let orbitYaw = 0;
let orbitPitch = 0;
let orbitDrag;
let speechTimer;
let activeAnimationName = 'Idle_Base';
let playfulFaceScene;
let faceState;
let surpriseFaceScene;
let surpriseFaceState;
let dollActionScene;
let dollAccessoryState;
let dollReturnScene;
let dollReturnEffectState;
let characterParts = [];
let characterFaceParts = [];
let dollVisibilityPhase = '';
let wandCelebrateScene;
let wandAccessoryState;
let action17Scene;
let action17AccessoryState;
let action17SurpriseFaceScene;
let action17SurpriseFaceState;
let action17FacePhase = '';

function showSpeech(text) {
  speech.textContent = text;
  speech.classList.add('show');
  clearTimeout(speechTimer);
  speechTimer = setTimeout(() => speech.classList.remove('show'), 1800);
}

function fitCamera(object) {
  object.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  // Preserve the former on-screen character size inside the larger canvas.
  const distance = Math.max(size.x, size.y) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) * 2.18;
  const elevation = 0;
  camera.position.set(
    center.x,
    center.y + Math.sin(elevation) * distance,
    center.z + Math.cos(elevation) * distance
  );
  camera.near = Math.max(0.001, distance / 100);
  camera.far = distance * 10;
  camera.lookAt(center.x, center.y, center.z);
  camera.updateProjectionMatrix();
}

function findBone(name) {
  let found;
  model?.traverse(node => { if (!found && node.name === name) found = node; });
  return found;
}

function prepareFaceSwitch(targetScene, donorScene, partNames) {
  const targets = [];
  const donors = [];
  targetScene.traverse(node => { if (node.isSkinnedMesh) targets.push(node); });
  donorScene.traverse(node => { if (node.isSkinnedMesh) donors.push(node); });
  const skeletonSource = targets.find(node => node.skeleton);
  if (!skeletonSource) return undefined;
  const materialName = node => {
    const material = Array.isArray(node.material) ? node.material[0] : node.material;
    return material?.name || '';
  };
  const replacesEyes = partNames.some(name => name.startsWith('Eye_'));
  const replacesMouth = partNames.some(name => name.startsWith('Mouth_'));
  const baseParts = targets.filter(node => {
    const name = materialName(node);
    return (replacesEyes && name.startsWith('Eye_')) || (replacesMouth && name.startsWith('Mouth_'));
  });
  const playfulParts = donors.filter(node => {
    const name = materialName(node);
    return partNames.includes(name);
  });
  for (const part of playfulParts) {
    part.removeFromParent();
    part.bind(skeletonSource.skeleton, skeletonSource.bindMatrix);
    part.visible = false;
    skeletonSource.parent.add(part);
  }
  return { baseParts, playfulParts, active: false };
}

function prepareDollAccessory(targetScene, donorScene) {
  const targets = [];
  const donors = [];
  targetScene.traverse(node => { if (node.isSkinnedMesh) targets.push(node); });
  donorScene.traverse(node => { if (node.isSkinnedMesh) donors.push(node); });
  const skeletonSource = targets.find(node => node.skeleton);
  if (!skeletonSource) return undefined;
  const parts = [];
  for (const part of donors) {
    part.removeFromParent();
    const sourceMaterials = Array.isArray(part.material) ? part.material : [part.material];
    const materials = sourceMaterials.map(material => {
      const copy = material.clone();
      if (copy.name === 'Scissors') {
        copy.transparent = true;
        copy.opacity = 0;
        copy.colorWrite = false;
        copy.depthWrite = false;
      }
      return copy;
    });
    part.material = Array.isArray(part.material) ? materials : materials[0];
    part.bind(skeletonSource.skeleton, skeletonSource.bindMatrix);
    part.visible = false;
    skeletonSource.parent.add(part);
    parts.push(part);
  }
  return { parts };
}

function setDollAccessoryVisible(visible) {
  for (const part of dollAccessoryState?.parts || []) part.visible = visible;
}

function prepareFilteredAccessory(targetScene, donorScene, visibleMaterials) {
  const targets = [];
  const donors = [];
  targetScene.traverse(node => { if (node.isSkinnedMesh) targets.push(node); });
  donorScene.traverse(node => { if (node.isSkinnedMesh) donors.push(node); });
  const skeletonSource = targets.find(node => node.skeleton);
  if (!skeletonSource) return undefined;
  const parts = [];
  for (const part of donors) {
    part.removeFromParent();
    const sourceMaterials = Array.isArray(part.material) ? part.material : [part.material];
    const materials = sourceMaterials.map(material => {
      const copy = material.clone();
      if (!visibleMaterials.includes(copy.name)) {
        copy.transparent = true;
        copy.opacity = 0;
        copy.colorWrite = false;
        copy.depthWrite = false;
      }
      return copy;
    });
    part.material = Array.isArray(part.material) ? materials : materials[0];
    part.bind(skeletonSource.skeleton, skeletonSource.bindMatrix);
    part.visible = false;
    skeletonSource.parent.add(part);
    parts.push(part);
  }
  return { parts };
}

function setDollReturnEffectVisible(visible) {
  for (const part of dollReturnEffectState?.parts || []) part.visible = visible;
}

function setCharacterVisible(visible) {
  for (const part of characterParts) part.visible = visible;
}

function setCharacterFaceVisible(visible) {
  for (const part of characterFaceParts) part.visible = visible;
}

function materialNames(node) {
  const materials = Array.isArray(node.material) ? node.material : [node.material];
  return materials.map(material => material?.name || '');
}

function prepareWandAccessory(targetScene, donorScene) {
  const accessory = prepareFilteredAccessory(targetScene, donorScene, ['Arms', 'Mouth_Smile']);
  if (!accessory) return undefined;
  const hiddenBaseParts = characterParts.filter(part =>
    materialNames(part).some(name => name === 'Scissors' || name.startsWith('Mouth_'))
  );
  return { ...accessory, hiddenBaseParts };
}

function prepareAction17Accessory(targetScene, donorScene) {
  const accessory = prepareFilteredAccessory(targetScene, donorScene, ['Arms', 'Eye_Tongue', 'Mouth_Smile']);
  if (!accessory) return undefined;
  const hiddenBaseParts = characterParts.filter(part =>
    materialNames(part).some(name => name === 'Scissors' || name.startsWith('Eye_') || name.startsWith('Mouth_'))
  );
  return { ...accessory, hiddenBaseParts };
}

function setSpecialAccessoryState(name) {
  const wandVisible = name === 'WandCelebrate';
  const action17Visible = name === 'DanceIn';
  for (const part of wandAccessoryState?.parts || []) part.visible = wandVisible;
  for (const part of action17AccessoryState?.parts || []) part.visible = action17Visible;
  for (const part of action17SurpriseFaceState?.parts || []) part.visible = false;
  const allHiddenBaseParts = new Set([
    ...(wandAccessoryState?.hiddenBaseParts || []),
    ...(action17AccessoryState?.hiddenBaseParts || [])
  ]);
  for (const part of allHiddenBaseParts) part.visible = true;
  const activeHiddenParts = wandVisible
    ? wandAccessoryState?.hiddenBaseParts
    : action17Visible ? action17AccessoryState?.hiddenBaseParts : [];
  for (const part of activeHiddenParts || []) part.visible = false;
  action17FacePhase = action17Visible ? 'tongue-smile' : '';
}

function setFaceExpression(expression) {
  const states = [faceState, surpriseFaceState].filter(Boolean);
  const allBaseParts = new Set(states.flatMap(state => state.baseParts || []));
  for (const part of allBaseParts) part.visible = true;
  for (const state of states) {
    state.active = false;
    for (const part of state.playfulParts) part.visible = false;
  }
  const active = expression === 'playful' ? faceState : expression === 'surprise' ? surpriseFaceState : undefined;
  if (active) {
    active.active = true;
    for (const part of active.baseParts || []) part.visible = false;
    for (const part of active.playfulParts) part.visible = true;
  }
}

function tuneHairMaterials(object) {
  object.traverse(node => {
    if (!node.isMesh) return;
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    for (const material of materials) {
      if (material?.name !== 'Hair') continue;
      material.side = THREE.DoubleSide;
      material.depthWrite = true;
      material.alphaTest = 0.12;
      material.needsUpdate = true;
    }
  });
}

async function loadModel(index) {
  const token = ++loadToken;
  selectedModel = index;
  modelsButton.textContent = `外观 ${index + 1}`;
  loading.hidden = false;
  loading.textContent = `正在加载 Gewen 外观 ${index + 1}…`;
  try {
    const [gltf, playfulGltf, surpriseGltf, dollGltf, dollReturnGltf, wandGltf, action17Gltf, action17SurpriseGltf] = await Promise.all([
      loader.loadAsync(`../assets/${modelFiles[index]}`),
      loader.loadAsync('../assets/gewen-expression-playful.glb'),
      loader.loadAsync('../assets/gewen-expression-surprise.glb'),
      loader.loadAsync('../assets/gewen-doll-action.glb'),
      loader.loadAsync('../assets/gewen-doll-return.glb'),
      loader.loadAsync('../assets/gewen-wand-celebrate.glb'),
      loader.loadAsync('../assets/gewen-action-17.glb'),
      loader.loadAsync('../assets/gewen-action-17-surprise-face.glb')
    ]);
    if (token !== loadToken) return;
    if (model) scene.remove(model);
    model = gltf.scene;
    characterParts = [];
    model.traverse(node => { if (node.isMesh) characterParts.push(node); });
    characterFaceParts = characterParts.filter(part =>
      materialNames(part).some(name => name.startsWith('Eye_') || name.startsWith('Mouth_'))
    );
    playfulFaceScene = playfulGltf.scene;
    surpriseFaceScene = surpriseGltf.scene;
    dollActionScene = dollGltf.scene;
    dollReturnScene = dollReturnGltf.scene;
    wandCelebrateScene = wandGltf.scene;
    action17Scene = action17Gltf.scene;
    action17SurpriseFaceScene = action17SurpriseGltf.scene;
    faceState = prepareFaceSwitch(model, playfulFaceScene, ['Eye_Playful', 'Mouth_Playful']);
    surpriseFaceState = prepareFaceSwitch(model, surpriseFaceScene, ['Eye_Surprise']);
    dollAccessoryState = prepareDollAccessory(model, dollActionScene);
    dollReturnEffectState = prepareFilteredAccessory(model, dollReturnScene, ['Smears']);
    wandAccessoryState = prepareWandAccessory(model, wandCelebrateScene);
    action17AccessoryState = prepareAction17Accessory(model, action17Scene);
    action17SurpriseFaceState = prepareFilteredAccessory(
      model,
      action17SurpriseFaceScene,
      ['Eye_Scallion', 'Mouth_Surprise']
    );
    tuneHairMaterials(model);
    modelFacingY = model.rotation.y;
    scene.add(model);
    mixer = new THREE.AnimationMixer(model);
    clips = new Map(gltf.animations.map(clip => [clip.name, clip]));
    if (surpriseGltf.animations[0]) clips.set('Greeting', surpriseGltf.animations[0]);
    if (dollGltf.animations[0]) clips.set('DollAction', dollGltf.animations[0]);
    if (dollReturnGltf.animations[0]) clips.set('DollReturn', dollReturnGltf.animations[0]);
    if (wandGltf.animations[0]) clips.set('WandCelebrate', wandGltf.animations[0]);
    if (action17Gltf.animations[0]) clips.set('DanceIn', action17Gltf.animations[0]);
    headBone = findBone('Head');
    leftEye = findBone('L_Eye');
    rightEye = findBone('R_Eye');
    fitCamera(model);
    playAnimation('Idle_Base', true);
    loading.hidden = true;
    console.log(`GEWEN_MODEL_READY model=${index + 1} animations=${clips.size} bones=${headBone ? 'ok' : 'missing-head'}`);
    showSpeech(`外观 ${index + 1} 加载完成`);
  } catch (error) {
    console.error(error);
    loading.hidden = false;
    loading.textContent = '模型加载失败';
  }
}

function playAnimation(name, loop = false) {
  const clip = clips.get(name);
  if (!clip || !mixer) { showSpeech(`未找到动作：${name}`); return; }
  const previousAnimationName = activeAnimationName;
  setDollAccessoryVisible(name === 'DollAction' || name === 'DollReturn');
  setDollReturnEffectVisible(name === 'DollReturn');
  if (name === 'DollAction') {
    setCharacterVisible(true);
    dollVisibilityPhase = 'transforming-to-doll';
  } else if (name === 'DollReturn') {
    setCharacterVisible(false);
    dollVisibilityPhase = 'returning-from-doll';
  } else {
    setCharacterVisible(true);
    dollVisibilityPhase = '';
  }
  const faceExpression = name === 'Interact' ? 'playful' : name === 'Greeting' ? 'surprise' : undefined;
  if (name === 'WandCelebrate' || name === 'DanceIn') {
    setFaceExpression(undefined);
    setSpecialAccessoryState(name);
  } else {
    setSpecialAccessoryState(name);
    // Apply face cards last so generic accessory cleanup cannot re-enable the
    // base eye/mouth meshes over the authored action expression.
    setFaceExpression(faceExpression);
  }
  if (name === 'DollAction') setCharacterFaceVisible(false);
  activeAnimationName = name;
  const next = mixer.clipAction(clip);
  next.reset();
  next.enabled = true;
  next.setLoop(loop || name === 'Idle_Base' ? THREE.LoopRepeat : THREE.LoopOnce, loop || name === 'Idle_Base' ? Infinity : 1);
  next.clampWhenFinished = !loop && name !== 'Idle_Base';
  const dollTransition = name === 'DollReturn' && previousAnimationName === 'DollAction';
  const fadeDuration = dollTransition ? 0.06 : 0.18;
  if (currentAction && currentAction !== next) currentAction.fadeOut(fadeDuration);
  next.fadeIn(fadeDuration).play();
  currentAction = next;
  if (!loop && name !== 'Idle_Base') {
    const onFinished = event => {
      if (event.action !== next) return;
      mixer.removeEventListener('finished', onFinished);
      playAnimation(name === 'DollAction' ? 'DollReturn' : 'Idle_Base', name !== 'DollAction');
    };
    mixer.addEventListener('finished', onFinished);
  }
}

function resize() {
  const width = innerWidth, height = innerHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

function animate() {
  requestAnimationFrame(animate);
  const delta = Math.min(clock.getDelta(), 0.05);
  mixer?.update(delta);
  if (activeAnimationName === 'DollAction' && dollVisibilityPhase === 'transforming-to-doll' && currentAction?.time >= 0.10) {
    setCharacterVisible(false);
    dollVisibilityPhase = 'doll-only';
  } else if (activeAnimationName === 'DollReturn' && dollVisibilityPhase === 'returning-from-doll' && currentAction?.time >= 0.42) {
    setCharacterVisible(true);
    setDollAccessoryVisible(false);
    dollVisibilityPhase = 'character-restored';
  }
  if (activeAnimationName === 'DanceIn' && action17FacePhase === 'tongue-smile' && currentAction?.time >= 1.10) {
    for (const part of action17AccessoryState?.parts || []) {
      part.visible = materialNames(part).includes('Arms');
    }
    for (const part of action17SurpriseFaceState?.parts || []) part.visible = true;
    action17FacePhase = 'scallion-surprise';
  }
  // Preserve the authored head and eye animation. Overwriting their local Euler
  // rotations breaks the bind pose and makes the eyes look duplicated. A very
  // small whole-character turn keeps cursor feedback without deforming the face.
  smoothGazeX += (gaze.x - smoothGazeX) * 0.045;
  if (model) {
    model.rotation.y = modelFacingY + orbitYaw + smoothGazeX * 0.055;
    model.rotation.x = orbitPitch;
  }
  renderer.render(scene, camera);
}

for (const [name, label, shortcut] of actions) {
  const button = document.createElement('button');
  button.textContent = `${label}\n${shortcut}`;
  button.addEventListener('click', () => {
    playAnimation(name, ['Celebrate', 'WandCelebrate', 'Run', 'Idle_Base'].includes(name));
    actionPanel.classList.remove('open');
  });
  actionPanel.appendChild(button);
}

document.getElementById('actionsButton').addEventListener('click', () => actionPanel.classList.toggle('open'));
modelsButton.addEventListener('click', () => window.gewenAPI.selectModel((selectedModel + 1) % 4));
document.getElementById('menuButton').addEventListener('click', () => window.gewenAPI.showMenu());
canvas.addEventListener('dblclick', event => {
  if (event.shiftKey) {
    orbitYaw = 0;
    orbitPitch = 0;
    showSpeech('视角已恢复');
    return;
  }
  playAnimation('Interact');
});
canvas.addEventListener('contextmenu', event => { event.preventDefault(); window.gewenAPI.showMenu(); });
canvas.addEventListener('pointerdown', event => {
  if (event.button !== 0) return;
  canvas.setPointerCapture(event.pointerId);
  if (event.shiftKey) {
    orbitDrag = { pointerId: event.pointerId, x: event.screenX, y: event.screenY, yaw: orbitYaw, pitch: orbitPitch };
    showSpeech('拖动查看角色视角');
    return;
  }
  window.gewenAPI.beginDrag({ x: event.screenX, y: event.screenY });
});
canvas.addEventListener('pointermove', event => {
  if (!canvas.hasPointerCapture(event.pointerId)) return;
  if (orbitDrag?.pointerId === event.pointerId) {
    orbitYaw = orbitDrag.yaw + (event.screenX - orbitDrag.x) * 0.012;
    orbitPitch = THREE.MathUtils.clamp(
      orbitDrag.pitch + (event.screenY - orbitDrag.y) * 0.008,
      THREE.MathUtils.degToRad(-70),
      THREE.MathUtils.degToRad(70)
    );
    return;
  }
  window.gewenAPI.moveDrag({ x: event.screenX, y: event.screenY });
});
function finishDrag(event) {
  if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  if (orbitDrag?.pointerId === event.pointerId) orbitDrag = undefined;
  else window.gewenAPI.endDrag();
}
canvas.addEventListener('pointerup', finishDrag);
canvas.addEventListener('pointercancel', finishDrag);
window.addEventListener('resize', resize);
window.gewenAPI.onAnimation(payload => playAnimation(payload.name, payload.loop));
window.gewenAPI.onModel(index => loadModel(index));
window.gewenAPI.onCursor(({ x, y, width, height }) => {
  gaze.x = THREE.MathUtils.clamp((x / width - 0.5) * 2, -1, 1);
  gaze.y = THREE.MathUtils.clamp((y / height - 0.45) * 2, -1, 1);
});
window.gewenAPI.onToggleUI(() => {
  appElement.classList.toggle('ui-hidden');
  actionPanel.classList.remove('open');
  const visible = !appElement.classList.contains('ui-hidden');
  window.gewenAPI.setUIState(visible);
  showSpeech(visible ? '控制菜单已显示' : '控制菜单已隐藏');
});
window.gewenAPI.setUIState(false);

resize();
loadModel(0);
animate();
