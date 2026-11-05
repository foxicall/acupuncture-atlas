import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import gsap from 'gsap';

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
export class Viewer3D {
  constructor(container, points, onSelect, onStatus, onCalibrate = () => {}) {
    this.container = container;
    this.points = points;
    this.onSelect = onSelect;
    this.onStatus = onStatus;
    this.onCalibrate = onCalibrate;
    this.calibrationMode = false;
    this.pointers = new Map();
    this.active = null;
    this.meshes = [];
    this.labels = [];
    this.visibleIds = new Set(points.filter(p => p.featured).map(p => p.id));
    this.restrictSelection = false;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#edf1ef');
    this.camera = new THREE.PerspectiveCamera(34, 1, 0.01, 100);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'low-power' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor('#edf1ef');
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.domElement.setAttribute('aria-label', '3D 人體示意模型，單指旋轉、雙指縮放；可使用穴位目錄選取穴位');
    container.prepend(this.renderer.domElement);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 0.45;
    this.controls.maxDistance = 12;
    this.controls.enablePan = true;
    this.controls.touches.ONE = THREE.TOUCH.ROTATE;
    this.controls.touches.TWO = THREE.TOUCH.DOLLY_PAN;
    this.controls.addEventListener('start', () => this.stopTween());
    this.scene.add(new THREE.HemisphereLight('#ffffff', '#777f78', 1.9));
    const key = new THREE.DirectionalLight('#ffffff', 2.3);
    key.position.set(-3, 4, 5);
    this.scene.add(key);
    const fill = new THREE.DirectionalLight('#d3e8df', 1.2);
    fill.position.set(3, 1, -3);
    this.scene.add(fill);
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.overlay = document.createElement('div');
    this.overlay.className = 'hotspot-labels';
    container.append(this.overlay);
    this.meridianOverlay = document.createElement('div');
    this.meridianOverlay.className = 'meridian-labels';
    container.append(this.meridianOverlay);
    this.meridianLabels = new Map();
    this.hotspots = new THREE.Group();
    this.needle = new THREE.Group();
    this.scene.add(this.hotspots, this.needle);
    this.calibrationMarker = new THREE.Mesh(
      new THREE.SphereGeometry(0.027, 20, 14),
      new THREE.MeshBasicMaterial({ color: '#d34b50', transparent: true, opacity: 0.55, depthWrite: false }),
    );
    this.calibrationMarker.visible = false;
    this.calibrationMarker.renderOrder = 5;
    this.scene.add(this.calibrationMarker);
    const sphere = new THREE.SphereGeometry(0.021, 12, 8);
    const material = new THREE.MeshBasicMaterial({ color: '#24765e', depthTest: false });
    points.forEach(point => {
      const mesh = new THREE.Mesh(sphere, material.clone());
      mesh.position.fromArray(point.position);
      mesh.userData.point = point;
      mesh.renderOrder = 3;
      this.hotspots.add(mesh);
      this.meshes.push(mesh);
    });
    this.renderer.domElement.addEventListener('pointerdown', e => {
      if (!this.pointers.size) this.down = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId, moved: false, multi: false };
      this.pointers.set(e.pointerId, true);
      if (this.pointers.size > 1 && this.down) this.down.multi = true;
    });
    this.renderer.domElement.addEventListener('pointermove', e => {
      if (this.down && Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y) > 7) this.down.moved = true;
    });
    this.renderer.domElement.addEventListener('pointerup', e => {
      if (this.pointers.size === 1 && this.down?.id === e.pointerId && !this.down.moved && !this.down.multi) this.pick(e);
      this.pointers.delete(e.pointerId);
      if (!this.pointers.size) this.down = null;
    });
    this.renderer.domElement.addEventListener('pointercancel', e => {
      this.pointers.delete(e.pointerId);
      if (this.down) this.down.multi = true;
      if (!this.pointers.size) this.down = null;
    });
    this.renderer.domElement.addEventListener('webglcontextlost', e => {
      e.preventDefault(); onStatus('3D 顯示暫停，請重新載入。穴位目錄與教材仍可使用。', true);
    });
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
    this.reset(false);
    onStatus('正在載入人體模型');
    new GLTFLoader().load(`${import.meta.env.BASE_URL}models/acupuncture_body.glb`, gltf => {
      this.body = gltf.scene;
      this.scene.add(gltf.scene);
      this.bodyMeshes = [];
      gltf.scene.traverse(object => { if (object.isMesh) this.bodyMeshes.push(object); });
      onStatus('人體示意模型');
      container.dataset.loaded = 'true';
    }, undefined, () => {
      onStatus('人體模型載入失敗。請重新載入，或使用穴位目錄閱讀教材。', true);
      container.dataset.loaded = 'error';
    });
    this.frame = () => {
      this.controls.update();
      this.updateVisibility();
      this.renderer.render(this.scene, this.camera);
    };
    this.renderer.setAnimationLoop(this.frame);
    this.visibilityHandler = () => this.renderer.setAnimationLoop(document.hidden ? null : this.frame);
    document.addEventListener('visibilitychange', this.visibilityHandler);
  }
  resize() {
    const { width, height } = this.container.getBoundingClientRect();
    if (!width || !height) return;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }
  stopTween() { gsap.killTweensOf(this.camera.position); gsap.killTweensOf(this.controls.target); }
  move(position, target, animate = true) {
    this.stopTween();
    const duration = animate && !reducedMotion() ? 1.15 : 0;
    gsap.to(this.camera.position, { ...position, duration, ease: 'power2.inOut' });
    gsap.to(this.controls.target, { ...target, duration, ease: 'power2.inOut' });
  }
  reset(animate = true, back = false) {
    const distance = Math.max(6.5, 3.45 / this.camera.aspect);
    this.move({ x: 0, y: 0.04, z: (back ? -1 : 1) * distance }, { x: 0, y: 0, z: 0 }, animate);
  }
  zoom(factor) {
    this.stopTween();
    const offset = this.camera.position.clone().sub(this.controls.target);
    const distance = THREE.MathUtils.clamp(offset.length() * factor, this.controls.minDistance, this.controls.maxDistance);
    this.camera.position.copy(this.controls.target).add(offset.setLength(distance));
  }
  setVisible(points, showLabels = false, restrictSelection = false) {
    this.visibleIds = new Set(points.map(p => p.id));
    this.restrictSelection = restrictSelection;
    this.meridianOverlay.replaceChildren(); this.meridianLabels.clear();
    if (showLabels) points.forEach(point => {
      const label = document.createElement('button'); label.className = 'meridian-label';
      label.dataset.id = point.id; label.textContent = `${point.id} ${point.name}`;
      label.setAttribute('aria-label', `查看${point.name}手法`);
      label.onclick = () => this.onSelect(point);
      this.meridianOverlay.append(label); this.meridianLabels.set(point.id, label);
    });
  }
  setCalibrationMode(enabled) {
    this.calibrationMode = enabled;
    this.hotspots.visible = !enabled;
    this.needle.visible = !enabled;
    this.overlay.hidden = enabled;
    this.meridianOverlay.hidden = enabled;
    this.container.classList.toggle('is-calibrating', enabled);
    this.clearCalibrationMarker();
  }
  clearCalibrationMarker() {
    this.calibrationMarker.visible = false;
    delete this.container.dataset.calibrationMarker;
  }
  updatePoints(points) {
    this.points = points;
    const lookup = new Map(points.map(point => [point.id, point]));
    this.meshes.forEach(mesh => {
      const point = lookup.get(mesh.userData.point.id);
      if (point) { mesh.userData.point = point; mesh.position.fromArray(point.position); }
    });
    if (this.active) this.select(lookup.get(this.active.id) || this.active, false);
  }
  select(point, fly = true) {
    this.active = point;
    this.overlay.replaceChildren();
    const label = document.createElement('button');
    label.className = 'hotspot-label';
    label.textContent = `${point.name} · ${point.id.startsWith('DOC-') ? '示意' : point.id}`;
    const caption = document.createElement('small');
    caption.textContent = `${point.technique?.angle || '針向未定'} · ${point.depth || '深度未載明'}`;
    label.append(caption);
    label.setAttribute('aria-label', `查看${point.name}手法`);
    label.onclick = () => this.onSelect(point);
    this.overlay.append(label);
    this.label = label;
    this.meshes.forEach(mesh => {
      const selected = mesh.userData.point.id === point.id;
      mesh.material.color.set(selected ? '#c17a31' : '#24765e');
    });
    this.needle.children.slice().forEach(child => {
      this.needle.remove(child);
      child.traverse(o => { o.geometry?.dispose(); if (o.material) o.material.dispose(); });
    });
    if (point.needleVector) {
      const direction = new THREE.Vector3(...point.needleVector).normalize();
      const surface = new THREE.Vector3(...point.position);
      const rotation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
      // Fixed display lengths. Cun/mm remain source text, without an unsupported
      // conversion to this schematic model's coordinate units.
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.38, 10), new THREE.MeshStandardMaterial({ color: '#6f7774', metalness: .7, roughness: .3 }));
      shaft.position.copy(surface).addScaledVector(direction, -0.11); shaft.quaternion.copy(rotation);
      const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.085, 12), new THREE.MeshStandardMaterial({ color: '#b67531', metalness: .5, roughness: .4 }));
      handle.position.copy(surface).addScaledVector(direction, -0.30); handle.quaternion.copy(rotation);
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.003, 0.025, 10), shaft.material.clone());
      tip.position.copy(surface).addScaledVector(direction, .0925); tip.quaternion.copy(rotation);
      const arrow = new THREE.ArrowHelper(direction, surface.clone().addScaledVector(direction, -.26), .22, '#b67531', .035, .015);
      this.needle.add(shaft, handle, tip, arrow);
    }
    if (fly) {
      const target = new THREE.Vector3(...point.position);
      const direction = new THREE.Vector3(...point.normal).normalize();
      // Approach obliquely so a perpendicular needle is seen from the side instead
      // of collapsing into an end-on dot along the camera's optical axis.
      const side = new THREE.Vector3(0, 1, 0).cross(direction).normalize();
      if (!side.lengthSq()) side.set(1, 0, 0);
      const position = target.clone().addScaledVector(direction, 1.35).addScaledVector(side, 0.65);
      position.y += 0.23;
      this.move(position, target);
    }
  }
  updateVisibility() {
    const labelRects = [];
    this.meshes.forEach(mesh => {
      const point = mesh.userData.point;
      const towardCamera = this.camera.position.clone().sub(mesh.position).normalize();
      const frontFacing = towardCamera.dot(new THREE.Vector3(...point.normal)) > 0.1;
      mesh.visible = (this.visibleIds.has(point.id) || (!this.restrictSelection && point.id === this.active?.id)) && frontFacing;
      const pixels = point.id === this.active?.id ? 5 : 3.5;
      const worldRadius = 2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * this.camera.position.distanceTo(mesh.position) * pixels / this.container.clientHeight;
      mesh.scale.setScalar(worldRadius / 0.021);
      const label = this.meridianLabels.get(point.id);
      if (label) {
        const projected = mesh.position.clone().project(this.camera);
        const x = (projected.x * .5 + .5) * this.container.clientWidth;
        const y = (-projected.y * .5 + .5) * this.container.clientHeight;
        const fits = x > 40 && x < this.container.clientWidth - 50 && y > 24 && y < this.container.clientHeight - 24;
        const overlaps = labelRects.some(rect => Math.abs(rect.x - x) < 95 && Math.abs(rect.y - y) < 42);
        label.hidden = !mesh.visible || point.id === this.active?.id || projected.z > 1 || !fits || overlaps;
        if (!label.hidden) { label.style.left = `${x + 9}px`; label.style.top = `${y}px`; labelRects.push({ x, y }); }
      }
    });
    if (this.active && this.label) {
      const point = new THREE.Vector3(...this.active.position).project(this.camera);
      const activeMesh = this.meshes.find(mesh => mesh.userData.point.id === this.active.id);
      this.label.hidden = !activeMesh?.visible || point.z > 1 || Math.abs(point.x) > 1 || Math.abs(point.y) > 1;
      this.label.style.left = `${(point.x * 0.5 + 0.5) * this.container.clientWidth}px`;
      this.label.style.top = `${(-point.y * 0.5 + 0.5) * this.container.clientHeight}px`;
    }
    this.needle.visible = !this.calibrationMode && (this.visibleIds.has(this.active?.id) || !this.restrictSelection);
  }
  pick(event) {
    if (!this.down || Math.hypot(event.clientX - this.down.x, event.clientY - this.down.y) > 7 || performance.now() - this.down.t > 500) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    if (this.calibrationMode) {
      this.scene.updateMatrixWorld(true);
      const hit = this.raycaster.intersectObjects(this.bodyMeshes || [], false)[0];
      if (!hit?.face) { this.onCalibrate(null); return; }
      const normal = hit.face.normal.clone().applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld)).normalize();
      this.calibrationMarker.position.copy(hit.point);
      this.calibrationMarker.visible = true;
      this.container.dataset.calibrationMarker = 'true';
      this.onCalibrate({ position: hit.point.toArray(), normal: normal.toArray(), surfaceMesh: hit.object.name });
      return;
    }
    // A larger picking radius leaves the visible landmark small while making it touch-friendly.
    const candidates = this.meshes.filter(mesh => mesh.visible).map(mesh => {
      const screen = mesh.position.clone().project(this.camera);
      const distance = Math.hypot((screen.x - this.pointer.x) * rect.width / 2, (screen.y - this.pointer.y) * rect.height / 2);
      return { mesh, distance };
    }).filter(item => item.distance < 22).sort((a, b) => a.distance - b.distance);
    const direct = this.raycaster.intersectObjects(this.meshes.filter(mesh => mesh.visible))[0];
    const mesh = direct?.object || candidates[0]?.mesh;
    if (mesh) this.onSelect(mesh.userData.point);
  }
  dispose() {
    this.stopTween(); this.renderer.setAnimationLoop(null); this.resizeObserver.disconnect(); this.controls.dispose();
    document.removeEventListener('visibilitychange', this.visibilityHandler);
    this.scene.traverse(o => { o.geometry?.dispose(); const materials = Array.isArray(o.material) ? o.material : [o.material]; materials.forEach(m => m?.dispose()); });
    this.renderer.dispose();
  }
}
