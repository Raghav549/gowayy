import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { prefersReducedMotion } from '@gowayy/design-system';

/** Cinematic Three.js splash: real extruded geometry, animated layer assembly, controlled reflections. */
export function Splash({ onDone }: { onDone: () => void }) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [word, setWord] = useState(false);

  useEffect(() => {
    if (prefersReducedMotion()) { onDone(); return; }
    const mount = mountRef.current;
    if (!mount) return;
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-2.1, 2.1, 2.1, -2.1, 0.1, 100);
    camera.position.set(0, 0, 8);
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false, powerPreference: 'low-power' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.setClearColor(0x000000, 0);
    mount.appendChild(renderer.domElement);

    // Custom geometric G: chamfered octagonal ring with an inward crossbar.
    const outer = [[176,48],[336,48],[432,144],[432,224],[268,224],[268,300],[432,300],[432,368],[336,464],[176,464],[80,368],[80,144]];
    const hole = [[196,132],[316,132],[372,188],[372,224],[268,224],[268,300],[372,300],[372,324],[316,380],[196,380],[140,324],[140,188]];
    const toShape = (pts: number[][]) => {
      const s = new THREE.Shape();
      pts.forEach(([x, y], i) => { const px = (Number(x) - 256) / 200; const py = (256 - Number(y)) / 200; if (i === 0) s.moveTo(px, py); else s.lineTo(px, py); });
      s.closePath(); return s;
    };
    const shape = toShape(outer);
    const holePath = new THREE.Path();
    hole.forEach(([x, y], i) => { const px = (Number(x) - 256) / 200; const py = (256 - Number(y)) / 200; if (i === 0) holePath.moveTo(px, py); else holePath.lineTo(px, py); });
    holePath.closePath(); shape.holes.push(holePath);

    const layers: THREE.Mesh[] = [];
    const specs = [
      { colour: 0x1B1E23, z: -0.55, depth: 0.20, x: 0.10, y: -0.10, metal: 0.25, rough: 0.75 },
      { colour: 0xC9A86A, z: -0.28, depth: 0.18, x: 0.05, y: -0.05, metal: 0.85, rough: 0.30 },
      { colour: 0xE9E1D0, z: 0.0, depth: 0.16, x: 0, y: 0, metal: 0.62, rough: 0.28 },
    ];
    for (const s of specs) {
      const geo = new THREE.ExtrudeGeometry(shape, { depth: s.depth, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.018, bevelSegments: 2, curveSegments: 2 });
      const mat = new THREE.MeshStandardMaterial({ color: s.colour, metalness: s.metal, roughness: s.rough });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(s.x, s.y, s.z - 3);
      mesh.rotation.set(-0.22, 0.5, -0.06);
      scene.add(mesh); layers.push(mesh);
    }
    const ambient = new THREE.AmbientLight(0xffffff, 0.55); scene.add(ambient);
    const key = new THREE.DirectionalLight(0xFFF3DC, 2.1); key.position.set(-3, 4, 6); scene.add(key);
    const sweep = new THREE.PointLight(0xD9BE86, 3.2, 14); sweep.position.set(3, 2, 4); scene.add(sweep);
    const fill = new THREE.DirectionalLight(0x9AA1AA, 0.6); fill.position.set(3, -3, 2); scene.add(fill);

    let raf = 0; const start = performance.now(); let finished = false;
    const finish = () => { if (finished) return; finished = true; onDone(); };
    const animate = (t: number) => {
      const elapsed = (t - start) / 1000; const p = Math.min(1, elapsed / 1.5);
      const ease = 1 - Math.pow(1 - p, 3);
      layers.forEach((mesh, i) => {
        const spec = specs[i];
        mesh.position.z = (spec?.z ?? 0) - 3 * (1 - ease) - i * 0.35 * (1 - ease);
        mesh.rotation.y = 0.5 + (1 - ease) * 1.1 + Math.sin(elapsed * 0.8 + i) * 0.04;
        mesh.rotation.x = -0.22 + (1 - ease) * 0.18;
      });
      sweep.position.x = 3 - elapsed * 2.2; sweep.position.y = 2 - Math.sin(elapsed) * 0.9;
      key.intensity = 1.4 + Math.sin(elapsed * 2) * 0.6;
      if (elapsed > 1.5) setWord(true);
      renderer.render(scene, camera);
      if (elapsed < 2.9) raf = requestAnimationFrame(animate); else finish();
    };
    raf = requestAnimationFrame(animate);
    const onResize = () => { renderer.setSize(mount.clientWidth, mount.clientHeight); };
    window.addEventListener('resize', onResize);
    return () => {
      cancelAnimationFrame(raf); window.removeEventListener('resize', onResize);
      layers.forEach((m) => { m.geometry.dispose(); (m.material as THREE.Material).dispose(); });
      renderer.dispose(); if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
    };
  }, [onDone]);

  return (
    <div className="splash" role="img" aria-label="GOWAYY loading animation">
      <div ref={mountRef} className="splash__canvas" />
      <div className="splash__content">
        <img className={`splash__wordmark ${word ? 'show' : ''}`} src="/brand/wordmark.png" alt="GOWAYY" />
        <div className={`splash__tag ${word ? 'show' : ''}`}>Connected journeys</div>
      </div>
      <button className="btn btn--ghost splash__skip" onClick={onDone}>Skip</button>
      <div className="splash__progress"><div /></div>
    </div>
  );
}
