import * as THREE from 'three';

// ─────────────────────────────────────────────────────────────
//  Materiali fisicamente plausibili: marmo, pietra, ottone, vetro.
//  Il marmo e la pietra usano una mappatura triplanare (non serve
//  che la scansione abbia UV) con texture procedurali tassellabili.
// ─────────────────────────────────────────────────────────────

const loader = new THREE.TextureLoader();
const pending = [];

// Texture di dati (non colore), tassellabili. In caso di errore resta una texture neutra.
function dataTexture(url, maxAnisotropy) {
  const tex = new THREE.Texture();
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.NoColorSpace;
  tex.anisotropy = Math.min(8, maxAnisotropy);
  pending.push(new Promise((resolve) => {
    loader.load(url, (t) => {
      tex.image = t.image;
      tex.needsUpdate = true;
      resolve(true);
    }, undefined, () => {
      console.warn('[texture] non caricata:', url);
      const c = document.createElement('canvas');
      c.width = c.height = 4;
      const g = c.getContext('2d');
      g.fillStyle = 'rgb(128,128,255)';
      g.fillRect(0, 0, 4, 4);
      tex.image = c;
      tex.needsUpdate = true;
      resolve(false);
    });
  }));
  return tex;
}

// Uniform condivisi: spazio della scultura (per tenere ferme le venature
// sulla superficie anche quando la sfera oscilla).
export const sculptSpace = {
  uSpaceMatrix: { value: new THREE.Matrix4() },
  uSpaceInverse: { value: new THREE.Matrix4() },
};

export function updateSculptSpace(object3D) {
  object3D.updateWorldMatrix(true, false);
  sculptSpace.uSpaceMatrix.value.copy(object3D.matrixWorld);
  sculptSpace.uSpaceInverse.value.copy(object3D.matrixWorld).invert();
}

const TRIPLANAR_VERT_PARS = /* glsl */ `
uniform mat4 uSpaceInverse;
varying vec3 vTpPos;
varying vec3 vTpNormal;
`;

const TRIPLANAR_VERT_MAIN = /* glsl */ `
{
  vec4 tpW = modelMatrix * vec4( transformed, 1.0 );
  vTpPos = ( uSpaceInverse * tpW ).xyz;
  vTpNormal = normalize( mat3( uSpaceInverse ) * mat3( modelMatrix ) * objectNormal );
}
`;

const TRIPLANAR_FRAG_PARS = /* glsl */ `
uniform mat4 uSpaceMatrix;
uniform sampler2D uTpData;
uniform sampler2D uTpNormal;
uniform float uTpScale;
uniform float uTpNormalStrength;
uniform vec3 uTpBase;
uniform vec3 uTpAccent;
uniform float uTpTint;
uniform float uTpAccentAmount;
uniform float uTpRoughVar;
uniform float uTpSparkle;
uniform float uTpFleck;
varying vec3 vTpPos;
varying vec3 vTpNormal;

vec3 tpWeights( vec3 n ) {
  vec3 w = pow( abs( n ), vec3( 4.0 ) );
  return w / ( w.x + w.y + w.z + 1e-5 );
}
vec4 tpSample( sampler2D t, vec3 p, vec3 w ) {
  return texture( t, p.zy ) * w.x + texture( t, p.xz ) * w.y + texture( t, p.xy ) * w.z;
}
// Triplanare con fusione "whiteout" (B. Golus) nello spazio della scultura.
vec3 tpNormalBlend( vec3 p, vec3 n, vec3 w, float strength ) {
  vec3 tx = texture( uTpNormal, p.zy ).xyz * 2.0 - 1.0;
  vec3 ty = texture( uTpNormal, p.xz ).xyz * 2.0 - 1.0;
  vec3 tz = texture( uTpNormal, p.xy ).xyz * 2.0 - 1.0;
  tx.xy *= strength; ty.xy *= strength; tz.xy *= strength;
  tx = vec3( tx.xy + n.zy, abs( tx.z ) * n.x );
  ty = vec3( ty.xy + n.xz, abs( ty.z ) * n.y );
  tz = vec3( tz.xy + n.xy, abs( tz.z ) * n.z );
  return normalize( tx.zyx * w.x + ty.xzy * w.y + tz.xyz * w.z );
}
`;

const TRIPLANAR_COLOR = /* glsl */ `
#include <color_fragment>
vec3 tpN = normalize( vTpNormal );
vec3 tpWts = tpWeights( tpN );
vec3 tpP = vTpPos * uTpScale;
vec4 tpD = tpSample( uTpData, tpP, tpWts );
// variazione cromatica larga (macchie), venature / screziature
diffuseColor.rgb *= uTpBase * mix( 1.0 - uTpTint, 1.0 + uTpTint * 0.6, tpD.r );
diffuseColor.rgb = mix( diffuseColor.rgb, uTpAccent, clamp( tpD.g * uTpAccentAmount, 0.0, 1.0 ) );
diffuseColor.rgb += uTpFleck * tpD.b * tpD.b;
`;

const TRIPLANAR_ROUGHNESS = /* glsl */ `
#include <roughnessmap_fragment>
#ifdef TP_LITE
roughnessFactor = clamp( roughnessFactor + ( tpD.b - 0.5 ) * uTpRoughVar - tpD.a * uTpSparkle, 0.05, 1.0 );
#else
roughnessFactor = clamp( roughnessFactor + ( tpSample( uTpData, tpP * 3.0, tpWts ).b - 0.5 ) * uTpRoughVar - tpD.a * uTpSparkle, 0.05, 1.0 );
#endif
`;

const TRIPLANAR_NORMAL = /* glsl */ `
#include <normal_fragment_maps>
{
  vec3 nS = tpNormalBlend( tpP * 2.0, tpN, tpWts, uTpNormalStrength );
  vec3 nV = normalize( ( viewMatrix * ( uSpaceMatrix * vec4( nS, 0.0 ) ) ).xyz );
  vec3 gV = normalize( ( viewMatrix * ( uSpaceMatrix * vec4( tpN, 0.0 ) ) ).xyz );
  normal = normalize( normal + ( nV - gV ) );
}
`;

// Diffusione sottosuperficiale approssimata (luce "avvolgente" del marmo).
const SCATTER_PATCH = /* glsl */ `
	float dotNL = saturate( dot( geometryNormal, directLight.direction ) );
	float tpWrapNL = saturate( ( dot( geometryNormal, directLight.direction ) + uScatterWrap ) / ( 1.0 + uScatterWrap ) );
	reflectedLight.directDiffuse += ( tpWrapNL - dotNL ) * uScatterAmount * uScatterColor * directLight.color * BRDF_Lambert( material.diffuseColor );
`;

function applyTriplanar(material, uniforms, { scatter = false, lite = false } = {}) {
  if (lite) material.defines = { ...(material.defines || {}), TP_LITE: '' };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, sculptSpace, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + TRIPLANAR_VERT_PARS)
      .replace('#include <fog_vertex>', '#include <fog_vertex>\n' + TRIPLANAR_VERT_MAIN);
    let frag = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + TRIPLANAR_FRAG_PARS + (scatter ? '\nuniform float uScatterWrap;\nuniform float uScatterAmount;\nuniform vec3 uScatterColor;\n' : ''))
      .replace('#include <color_fragment>', TRIPLANAR_COLOR)
      .replace('#include <roughnessmap_fragment>', TRIPLANAR_ROUGHNESS)
      .replace('#include <normal_fragment_maps>', TRIPLANAR_NORMAL);
    if (scatter) {
      const chunk = THREE.ShaderChunk.lights_physical_pars_fragment.replace(
        '\tfloat dotNL = saturate( dot( geometryNormal, directLight.direction ) );',
        SCATTER_PATCH
      );
      frag = frag.replace('#include <lights_physical_pars_fragment>', chunk);
    }
    shader.fragmentShader = frag;
  };
  material.customProgramCacheKey = () => 'tp-' + (scatter ? 's' : 'n') + (lite ? 'l' : 'f') + (material.normalMap ? 'N' : '') + (material.aoMap ? 'A' : '');
  return material;
}

// Vetro "veloce" per i telefoni: nessun secondo rendering della scena.
// Riflessi fisici dell'ambiente e delle luci + leggera attenuazione,
// sommati in modalità premoltiplicata sopra l'interno già disegnato.
function createFastGlass() {
  const m = new THREE.MeshPhysicalMaterial({
    color: 0x000000,
    metalness: 0,
    roughness: 0.03,
    ior: 1.5,
    specularIntensity: 1,
    envMapIntensity: 0.38,
    transparent: true,
    depthWrite: false,
    side: THREE.FrontSide,
  });
  m.blending = THREE.CustomBlending;
  m.blendEquation = THREE.AddEquation;
  m.blendSrc = THREE.OneFactor;
  m.blendDst = THREE.OneMinusSrcAlphaFactor;
  m.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', /* glsl */ `
      #include <opaque_fragment>
      {
        float gNdV = clamp( dot( normal, normalize( vViewPosition ) ), 0.0, 1.0 );
        float gF = pow( 1.0 - gNdV, 3.0 );
        gl_FragColor = vec4( outgoingLight + vec3( 0.95, 0.94, 0.9 ) * ( 0.004 + 0.05 * gF ), 0.04 + 0.28 * gF );
      }
    `);
  };
  m.customProgramCacheKey = () => 'fast-glass';
  return m;
}

export function createMaterials(renderer, palette, { fastGlass = false, lite = false } = {}) {
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  const marbleData = dataTexture('./assets/textures/marble-data.webp', maxAniso);
  const marbleNormal = dataTexture('./assets/textures/marble-normal.webp', maxAniso);
  const stoneData = dataTexture('./assets/textures/stone-data.webp', maxAniso);
  const stoneNormal = dataTexture('./assets/textures/stone-normal.webp', maxAniso);

  const marbleColor = new THREE.Color(palette.marble);

  // Marmo statuario: bianco caldo, satinato, con grana cristallina e venature appena percettibili.
  const marbleUniforms = {
    uTpData: { value: marbleData },
    uTpNormal: { value: marbleNormal },
    uTpScale: { value: 0.85 },
    uTpNormalStrength: { value: 0.16 },
    uTpBase: { value: new THREE.Color(1, 1, 1) },
    uTpAccent: { value: new THREE.Color(palette.marbleVein) },
    uTpTint: { value: 0.035 },
    uTpAccentAmount: { value: 0.22 },
    uTpRoughVar: { value: 0.14 },
    uTpSparkle: { value: 0.24 },
    uTpFleck: { value: 0.0 },
    uScatterWrap: { value: 0.55 },
    uScatterAmount: { value: 0.42 },
    uScatterColor: { value: new THREE.Color(1.0, 0.96, 0.92) },
  };

  const makeMarble = () => applyTriplanar(new THREE.MeshPhysicalMaterial({
    color: marbleColor,
    roughness: 0.36,
    metalness: 0,
    specularIntensity: 0.6,
    // su mobile niente strato di vernice e "sheen": costano molto e si notano poco
    clearcoat: lite ? 0 : 0.18,
    clearcoatRoughness: 0.28,
    sheen: lite ? 0 : 0.1,
    sheenRoughness: 0.7,
    sheenColor: new THREE.Color(1.0, 0.98, 0.95),
    envMapIntensity: 0.62,
  }), marbleUniforms, { scatter: true, lite });

  const marble = makeMarble();

  // Pietra antracite levigata (opaca) per la base.
  const stone = applyTriplanar(new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(palette.stone),
    roughness: 0.5,
    metalness: 0,
    clearcoat: lite ? 0 : 0.25,
    clearcoatRoughness: 0.45,
    envMapIntensity: 0.8,
  }), {
    uTpData: { value: stoneData },
    uTpNormal: { value: stoneNormal },
    uTpScale: { value: 0.9 },
    uTpNormalStrength: { value: 0.25 },
    uTpBase: { value: new THREE.Color(1, 1, 1) },
    uTpAccent: { value: new THREE.Color(palette.stone).multiplyScalar(0.7) },
    uTpTint: { value: 0.18 },
    uTpAccentAmount: { value: 0.0 },
    uTpRoughVar: { value: 0.25 },
    uTpSparkle: { value: 0.0 },
    uTpFleck: { value: 0.06 },
  }, { lite });

  // Ottone champagne satinato (piastra) e lucidato (lettere).
  const brass = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(palette.brass),
    metalness: 1,
    roughness: 0.34,
    envMapIntensity: 1.15,
  });
  const brassPolished = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(palette.brass).offsetHSL(0, 0.03, 0.04),
    metalness: 1,
    roughness: 0.14,
    envMapIntensity: 1.3,
  });
  const enamel = new THREE.MeshStandardMaterial({
    color: new THREE.Color(palette.enamel),
    roughness: 0.4,
    metalness: 0,
  });
  // Piano della targhetta: ottone spazzolato chiaro (leggermente "illuminato"
  // perché le lettere nere si leggano anche sullo schermo piccolo del telefono).
  const plaqueFace = new THREE.MeshStandardMaterial({
    color: new THREE.Color(palette.brass),
    metalness: 0.8,
    roughness: 0.42,
    emissive: new THREE.Color(palette.brass),
    emissiveIntensity: 0.16,
    envMapIntensity: 1.1,
  });
  // Lettere della targhetta: nero opaco, il massimo contrasto sull'ottone.
  const plaqueText = new THREE.MeshStandardMaterial({
    color: new THREE.Color(palette.plaqueText || '#111111'),
    roughness: 0.62,
    metalness: 0,
    envMapIntensity: 0.4,
  });

  // Neve depositata (letto fisso sul fondo).
  const snowBed = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(palette.snow).multiplyScalar(0.94),
    roughness: 0.92,
    metalness: 0,
    sheen: lite ? 0 : 0.6,
    sheenRoughness: 0.5,
    sheenColor: new THREE.Color(1, 1, 1),
    envMapIntensity: 0.7,
  });

  // Vetro spesso con liquido limpido: trasmissione fisica + volume.
  const glass = fastGlass ? createFastGlass() : new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    metalness: 0,
    roughness: 0.015,
    transmission: 1,
    thickness: 0.32,
    ior: 1.22,                                  // rifrazione delicata: David e targhetta restano leggibili
    specularColor: new THREE.Color(3.2, 3.2, 3.2), // riflettanza del vetro reale (~4%) nonostante l'ior basso
    attenuationColor: new THREE.Color('#FAF7F1'),
    attenuationDistance: 9,
    specularIntensity: 1,
    envMapIntensity: 1.0,
    side: THREE.FrontSide,
  });

  const ready = Promise.all(pending.splice(0));
  return { marble, makeMarble, marbleUniforms, stone, brass, brassPolished, enamel, plaqueText, plaqueFace, snowBed, glass, ready };
}
