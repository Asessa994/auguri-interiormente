import * as THREE from 'three';
import { DIM } from './dimensions.js';

// ─────────────────────────────────────────────────────────────
//  Set fotografico: environment map da studio (softbox), fondale
//  curvo "a sguscio" con ombra morbida e caustica del vetro, luci.
// ─────────────────────────────────────────────────────────────

// Environment generato in tempo reale: stanza scura e calda con
// softbox principale a sinistra, pannello di riempimento, strip
// alta e una lama di luce posteriore che disegna il bordo del vetro.
export function createStudioEnvironment(renderer, palette) {
  const env = new THREE.Scene();
  const wall = new THREE.Color(palette.backgroundEdge).multiplyScalar(0.22);
  const room = new THREE.Mesh(
    new THREE.BoxGeometry(12, 9, 12),
    new THREE.MeshBasicMaterial({ color: wall, side: THREE.BackSide })
  );
  room.position.y = 2.5;
  env.add(room);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(12, 12),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(palette.background).multiplyScalar(0.55) })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -1.9;
  env.add(floor);

  const panel = (w, h, intensity, tint, pos, lookAt) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(tint).multiplyScalar(intensity), side: THREE.DoubleSide })
    );
    m.position.set(...pos);
    m.lookAt(...lookAt);
    env.add(m);
  };
  // softbox principale (sinistra, leggermente frontale)
  panel(3.2, 4.2, 9.0, '#FFF3E4', [-5.6, 2.2, 2.2], [0, 0, 0]);
  // riempimento tenue (destra)
  panel(3.5, 3.0, 1.4, '#F4F1EC', [5.7, 1.2, 1.0], [0, 0, 0]);
  // strip alta
  panel(5.0, 0.8, 3.2, '#FFF8EE', [0, 6.5, 0.6], [0, 0, 0]);
  // lama posteriore destra: riflesso sul bordo del vetro
  panel(0.55, 5.0, 7.0, '#FFFFFF', [3.6, 1.6, -5.4], [0, 0, 0]);
  // cartoncino avorio frontale basso: riflesso caldo sulla base
  panel(5.0, 1.4, 0.8, palette.background, [0, -0.9, 5.8], [0, 0, 0]);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const rt = pmrem.fromScene(env, 0.035);
  pmrem.dispose();
  env.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
  return rt.texture;
}

// Fondale continuo (pavimento + curva + parete) con ombre analitiche.
export function createBackdrop(palette, keyDirection) {
  const G = DIM.GROUND_Y;
  // profilo nel piano (z, y)
  const profile = [];
  profile.push([14, G]);
  profile.push([-2.2, G]);
  const rc = 3.2;
  for (let i = 1; i <= 16; i++) {
    const a = (i / 16) * (Math.PI / 2);
    profile.push([-2.2 - Math.sin(a) * rc, G + (1 - Math.cos(a)) * rc]);
  }
  profile.push([-2.2 - rc, G + 24]);

  const xs = 2, xMin = -40, xMax = 40;
  const positions = [];
  const indices = [];
  for (let i = 0; i < profile.length; i++) {
    for (let j = 0; j < xs; j++) {
      const x = xMin + (j / (xs - 1)) * (xMax - xMin);
      positions.push(x, profile[i][1], profile[i][0]);
    }
  }
  for (let i = 0; i < profile.length - 1; i++) {
    const a = i * xs, b = (i + 1) * xs;
    indices.push(a, b, a + 1, a + 1, b, b + 1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);

  // direzione orizzontale dell'ombra (opposta alla luce principale)
  const sh = new THREE.Vector2(-keyDirection.x, -keyDirection.z).normalize();
  const elev = Math.asin(Math.max(0.2, keyDirection.y));
  const reach = 1 / Math.tan(elev);

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(palette.background) },
      uEdge: { value: new THREE.Color(palette.backgroundEdge) },
      uGround: { value: G },
      uShadowDir: { value: sh },
      uReach: { value: reach },
      uSeatH: { value: DIM.SEAT_Y - G },
      uGlobeH: { value: -G },
      uShadowStrength: { value: 1 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vW;
      void main() {
        vec4 w = modelMatrix * vec4( position, 1.0 );
        vW = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform vec3 uEdge;
      uniform float uGround;
      uniform vec2 uShadowDir;
      uniform float uReach;
      uniform float uSeatH;
      uniform float uGlobeH;
      uniform float uShadowStrength;
      varying vec3 vW;

      float sdCapsule( vec2 p, vec2 a, vec2 b, float r ) {
        vec2 pa = p - a, ba = b - a;
        float h = clamp( dot( pa, ba ) / dot( ba, ba ), 0.0, 1.0 );
        return length( pa - ba * h ) - r;
      }

      void main() {
        float h = vW.y - uGround;                 // altezza sopra il pavimento
        // coordinate "sguscio": distanza lungo il fondale dal centro della scena
        float along = max( 0.0, -vW.z - 2.2 ) + h;
        vec2 q = vec2( vW.x * 0.62, along * 0.55 + max( 0.0, vW.z ) * 0.35 );
        float vig = smoothstep( 0.6, 7.0, length( q - vec2( -0.25, 0.9 ) ) );
        vec3 col = mix( uColor, uEdge, vig * 0.85 );
        // parete di fondo più scura (fondale "a sfumatura" da still life):
        // vista attraverso il vetro dà contrasto alla neve bianca
        float wall = smoothstep( 0.25, 2.2, h );
        col = mix( col, uEdge * 0.9, wall * 0.62 );
        // pozza di luce dietro l'oggetto, leggermente a sinistra
        col *= 1.0 + 0.05 * ( 1.0 - smoothstep( 0.0, 3.5, length( vec2( vW.x + 0.8, along - 1.6 ) ) ) );

        // ombre solo sul pavimento
        float onFloor = 1.0 - smoothstep( 0.02, 0.4, h );
        if ( onFloor > 0.0 ) {
          vec2 p = vW.xz;
          float rBase = 0.975;
          // contatto
          float dC = length( p ) - rBase;
          float contact = ( 1.0 - smoothstep( -0.02, 0.22, dC ) ) * 0.55;
          // ombra portata della base (capsula nella direzione opposta alla luce)
          vec2 tip = uShadowDir * uSeatH * uReach;
          float dB = sdCapsule( p, vec2( 0.0 ), tip, rBase * 0.96 );
          float baseSh = ( 1.0 - smoothstep( -0.15, 0.55, dB ) ) * 0.32;
          // ombra tenue della sfera di vetro + caustica luminosa
          vec2 gc = uShadowDir * uGlobeH * uReach;
          vec2 rel = p - gc;
          vec2 dirn = uShadowDir;
          float u = dot( rel, dirn ) / ( 1.0 + uReach * 0.55 );
          float v = dot( rel, vec2( -dirn.y, dirn.x ) );
          float e = length( vec2( u, v ) );
          float globeSh = ( 1.0 - smoothstep( 0.55, 1.15, e ) ) * 0.16;
          float caustic = ( 1.0 - smoothstep( 0.0, 0.38, length( vec2( u + 0.12, v ) ) ) ) * 0.22;
          float shadow = max( max( contact, baseSh ), globeSh );
          col *= 1.0 - shadow * onFloor * uShadowStrength;
          col += uColor * caustic * onFloor * uShadowStrength * vec3( 1.0, 0.95, 0.85 );
        }
        gl_FragColor = vec4( col, 1.0 );
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'backdrop';
  return mesh;
}

export function createLights(scene, objectRoot, palette) {
  // Luce principale laterale (sinistra, alta, leggermente frontale).
  // È agganciata all'oggetto: le ombre restano valide durante l'oscillazione.
  const key = new THREE.DirectionalLight('#FFF7EE', 3.2);
  key.position.set(-5.0, 3.9, 2.0);
  key.target.position.set(0, -0.1, 0);
  key.castShadow = true;
  key.shadow.camera.left = -1.15;
  key.shadow.camera.right = 1.15;
  key.shadow.camera.top = 1.15;
  key.shadow.camera.bottom = -1.15;
  key.shadow.camera.near = 3;
  key.shadow.camera.far = 11;
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.018;
  key.shadow.radius = 3;
  objectRoot.add(key);
  objectRoot.add(key.target);

  // Riempimento tenue dalla destra.
  const fill = new THREE.DirectionalLight('#EEF0F2', 0.35);
  fill.position.set(4, 1.5, 3);
  scene.add(fill);

  // Controluce per staccare i contorni della scultura.
  const rim = new THREE.DirectionalLight('#FFF6EA', 0.9);
  rim.position.set(2.5, 3.0, -4.5);
  scene.add(rim);

  return { key, fill, rim, keyDirection: key.position.clone().normalize() };
}
