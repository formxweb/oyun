import * as THREE from 'three';

/**
 * The world material: a Lambert material patched with world-space procedural surface
 * patterns selected per-vertex by material id. One material (and usually one draw call
 * per chunk) renders every architectural surface in the game without textures.
 *
 * Per-vertex attributes:
 *   color  - tint
 *   aMat   - material id (see core Mat)
 *   aFace  - (u, v, w, h): position within the face and face size in metres
 *            used for edge highlights on walkable tops and contact darkening on walls.
 */
export interface WorldUniforms {
  uTime: { value: number };
  uDetail: { value: number };
  uFogColor: { value: THREE.Color };
  uFogDensity: { value: number };
  uHeightFogColor: { value: THREE.Color };
  uCamY: { value: number };
  uFallGlow: { value: number };
  uSkyTop: { value: THREE.Color };
}

export function createWorldUniforms(): WorldUniforms {
  return {
    uTime: { value: 0 },
    uDetail: { value: 1 },
    uFogColor: { value: new THREE.Color(0x9fb4c8) },
    uFogDensity: { value: 0.0022 },
    uHeightFogColor: { value: new THREE.Color(0xc8d2dc) },
    uCamY: { value: 0 },
    uFallGlow: { value: 0 },
    uSkyTop: { value: new THREE.Color(0x3a6ea5) },
  };
}

const COMMON = /* glsl */ `
uniform float uTime;
uniform float uDetail;
uniform vec3 uFogColor;
uniform float uFogDensity;
uniform vec3 uHeightFogColor;
uniform float uCamY;
uniform float uFallGlow;
uniform vec3 uSkyTop;
varying vec3 vWPos;
varying vec3 vWNorm;
varying float vMat;
varying vec4 vFace;

float h21(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
float h31(vec3 p){ p = fract(p*0.3183099+vec3(0.71,0.113,0.419)); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float vnoise(vec2 p){
  vec2 i = floor(p); vec2 f = fract(p);
  float a = h21(i), b = h21(i+vec2(1,0)), c = h21(i+vec2(0,1)), d = h21(i+vec2(1,1));
  vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(a,b,u.x), mix(c,d,u.x), u.y);
}
float fbm(vec2 p){ float s=0.0, a=0.5; for(int i=0;i<3;i++){ s+=a*vnoise(p); p*=2.03; a*=0.5; } return s; }

// Planar coordinates for the dominant axis of the face.
vec2 faceUV(vec3 p, vec3 n){
  vec3 an = abs(n);
  if (an.y > an.x && an.y > an.z) return p.xz;
  if (an.x > an.z) return vec2(p.z, p.y);
  return vec2(p.x, p.y);
}

vec3 surface(vec3 base, float m, vec3 p, vec3 n){
  vec2 uv = faceUV(p, n);
  float top = step(0.7, n.y);
  float d = uDetail;
  float nz = fbm(uv*0.7);
  vec3 c = base;
  if (m < 0.5) { // concrete: formwork lines + stains
    float lines = smoothstep(0.02, 0.0, abs(fract(p.y/1.2)-0.5)-0.47) * (1.0-top);
    c *= 0.86 + 0.22*nz - 0.08*lines*d;
    c *= 1.0 - 0.12*smoothstep(0.6,1.0,fbm(uv*vec2(0.5,2.5)))*(1.0-top)*d;
  } else if (m < 1.5) { // brick
    vec2 b = uv*vec2(2.2, 5.0);
    b.x += step(1.0, mod(floor(b.y),2.0))*0.5;
    vec2 f = fract(b);
    float mortar = step(f.x, 0.06) + step(f.y, 0.1);
    float jit = h21(floor(b));
    c *= mix(0.78 + 0.3*jit, 1.25, clamp(mortar,0.0,1.0)*d);
    if (top > 0.5) c = base*(0.8+0.2*nz);
  } else if (m < 2.5) { // plaster
    c *= 0.9 + 0.15*nz;
    c *= 1.0 - 0.1*smoothstep(0.55,0.9,vnoise(vec2(uv.x*3.0, uv.y*0.3)))*(1.0-top)*d;
  } else if (m < 3.5) { // metal panels
    vec2 f = fract(uv*vec2(1.0,0.7));
    float seam = (step(f.x,0.015)+step(f.y,0.02))*d;
    c *= 0.9 + 0.12*nz - 0.2*clamp(seam,0.0,1.0);
  } else if (m < 4.5) { // painted girder
    c *= 0.88 + 0.16*nz;
    float wear = smoothstep(0.62, 0.8, fbm(uv*2.0));
    c = mix(c, vec3(0.32,0.2,0.14), wear*0.55*d);
  } else if (m < 5.5) { // wood planks
    float along = abs(n.y) > 0.5 ? uv.x : uv.y;
    float plank = floor(along*4.0);
    float grain = vnoise(vec2(plank*7.0, (abs(n.y)>0.5?uv.y:uv.x)*6.0));
    float gap = step(fract(along*4.0), 0.05)*d;
    c *= (0.8 + 0.25*h21(vec2(plank,1.0)) + 0.1*grain) * (1.0-0.35*gap);
  } else if (m < 6.5) { // cut stone blocks
    vec2 b = uv*vec2(0.8, 1.6);
    b.x += step(1.0, mod(floor(b.y),2.0))*0.5;
    vec2 f = fract(b);
    float joint = (step(f.x,0.03)+step(f.y,0.05))*d;
    c *= (0.84 + 0.2*h21(floor(b)) + 0.08*nz) * (1.0-0.3*clamp(joint,0.0,1.0));
  } else if (m < 7.5) { // glass curtain wall
    vec2 f = fract(uv*vec2(0.6,0.3));
    float mull = step(f.x,0.04)+step(f.y,0.05);
    float lit = step(0.93, h21(floor(uv*vec2(0.6,0.3))));
    vec3 refl = mix(uSkyTop*0.8, uHeightFogColor, 0.5+0.5*n.y);
    c = mix(refl*0.7 + base*0.3, vec3(0.1,0.12,0.14), clamp(mull,0.0,1.0)*d);
    c += lit*vec3(0.9,0.75,0.45)*0.35*(1.0-top);
  } else if (m < 8.5) { // moss
    c *= 0.7 + 0.45*fbm(uv*1.5);
  } else if (m < 9.5) { // cloth / awning stripes
    c *= 0.85 + 0.2*step(0.5, fract(uv.x*1.25));
  } else if (m < 10.5) { // pillar rock: sedimentary bands, vertical fissures, weathering
    float ang = atan(p.z, p.x);
    float band = vnoise(vec2(p.y*0.11, 3.1));
    float band2 = vnoise(vec2(p.y*0.9 + ang*2.0, 7.7));
    float fis = abs(fract(ang*5.0 + vnoise(vec2(p.y*0.03, ang*3.0))*2.4) - 0.5);
    float crack = smoothstep(0.03, 0.0, fis - 0.47) * step(0.45, vnoise(vec2(ang*5.0, p.y*0.02)));
    c *= 0.5 + 0.42*band + 0.14*band2 + 0.1*fbm(uv*0.6);
    c = mix(c, c*vec3(1.12,0.97,0.82), smoothstep(0.4,0.8,band));
    c *= 1.0 - 0.45*crack*(1.0-top)*d;
    c *= 1.0 - 0.25*smoothstep(0.55,0.9,vnoise(vec2(ang*14.0, p.y*0.08)))*(1.0-top);
    if (top > 0.5) {
      c *= 0.78 + 0.34*fbm(uv*0.9);
      c = mix(c, vec3(0.3,0.36,0.18), 0.4*smoothstep(0.4,0.75,fbm(uv*0.5+3.0)));
    }
  } else if (m < 11.5) { // tiles
    vec2 f = fract(uv*2.0);
    float g = step(f.x,0.05)+step(f.y,0.05);
    c *= (0.9+0.12*h21(floor(uv*2.0))) * (1.0-0.25*clamp(g,0.0,1.0)*d);
  } else if (m < 12.5) { // rust
    float r = fbm(uv*1.3);
    c = mix(base*0.9, vec3(0.45,0.2,0.1), smoothstep(0.35,0.75,r));
  } else if (m < 13.5) { // marble
    float v = abs(sin((uv.x+uv.y)*1.7 + fbm(uv*1.2)*6.0));
    c *= 0.9 + 0.12*smoothstep(0.9,1.0,v)*-1.0 + 0.1*nz;
  } else if (m < 14.5) { // crystal
    c = base * (0.8 + 0.4*abs(sin(p.y*0.8 + uTime*0.6)));
  } else if (m < 15.5) { // grass: meadow patches at two scales
    c *= 0.72 + 0.3*fbm(uv*0.05) + 0.2*fbm(uv*1.8);
    c = mix(c, c*vec3(1.18,1.05,0.7), 0.35*smoothstep(0.5,0.8,fbm(uv*0.03+7.0)));
  } else if (m < 16.5) { // dirt
    c *= 0.8 + 0.3*fbm(uv*2.5);
  } else if (m < 17.5) { // brass
    c *= 0.85 + 0.35*pow(1.0-abs(n.y),2.0) + 0.1*nz;
  } else if (m < 18.5) { // paint (flat)
  } else if (m < 19.5) { // glow
  } else if (m < 20.5) { // water
    c *= 0.85 + 0.2*vnoise(uv*0.8 + vec2(uTime*0.2, uTime*0.13));
  } else if (m < 21.5) { // asphalt
    c *= 0.85 + 0.2*h21(floor(uv*20.0));
  } else if (m < 22.5) { // obsidian
    c = base*0.6 + vec3(0.25,0.3,0.45)*pow(1.0-abs(n.y), 3.0);
  } else { // cloud
    c = base;
  }
  return c;
}
`;

export function createWorldMaterial(u: WorldUniforms, opts: { transparent?: boolean; fallLines?: boolean } = {}): THREE.MeshLambertMaterial {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: opts.transparent ?? false });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
attribute float aMat;
attribute vec4 aFace;
varying vec3 vWPos;
varying vec3 vWNorm;
varying float vMat;
varying vec4 vFace;`,
      )
      .replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
vec4 wp4 = modelMatrix * vec4(transformed, 1.0);
vWPos = wp4.xyz;
vWNorm = normalize(mat3(modelMatrix) * objectNormal);
vMat = aMat;
vFace = aFace;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${COMMON}`)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
{
  vec3 n = normalize(vWNorm);
  vec3 col = surface(diffuseColor.rgb, vMat, vWPos, n);
  // Edges: walkable tops get a worn bright rim so landings are readable;
  // vertical faces darken toward their base (contact occlusion).
  float eu = min(vFace.x, vFace.z - vFace.x);
  float ev = min(vFace.y, vFace.w - vFace.y);
  float edge = min(eu, ev);
  if (n.y > 0.7) {
    col *= 1.0 + 0.28*smoothstep(0.14, 0.0, edge)*uDetail;
    col *= 1.0 - 0.06*smoothstep(0.35, 0.14, edge)*uDetail;
  } else if (n.y > -0.7) {
    col *= 0.72 + 0.28*smoothstep(0.0, 1.4, vFace.y);
    col *= 1.0 + 0.12*smoothstep(0.08, 0.0, vFace.w - vFace.y)*uDetail;
  } else {
    col *= 0.7;
  }
  diffuseColor.rgb = col;
}`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
if (vMat > 18.5 && vMat < 19.5) totalEmissiveRadiance += diffuseColor.rgb * 1.2;
if (vMat > 13.5 && vMat < 14.5) totalEmissiveRadiance += diffuseColor.rgb * 0.35;`,
      )
      .replace(
        '#include <fog_fragment>',
        `{
  // Atmospheric perspective + height haze: distance fades to the horizon colour and
  // everything far below the camera sinks into a luminous haze — "I came from there".
  float dist = length(vWPos - cameraPosition);
  float fogF = 1.0 - exp(-pow(dist * uFogDensity, 1.35));
  float below = clamp((uCamY - vWPos.y) / 420.0, 0.0, 1.0);
  vec3 fogCol = mix(uFogColor, uHeightFogColor, below);
  fogF = clamp(fogF + below*below*0.35*smoothstep(40.0, 260.0, dist), 0.0, 1.0);
  gl_FragColor.rgb = mix(gl_FragColor.rgb, fogCol, fogF);
  gl_FragColor.rgb += uFallGlow * vec3(0.9,0.7,0.5) * 0.05 * below;
}`,
      );
  };
  mat.customProgramCacheKey = () => 'vertigo-world-' + (opts.transparent ? 't' : 'o');
  return mat;
}

/** Material for fall lines: nearly invisible threads that glow only while falling. */
export function createFallLineMaterial(): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color: 0xffe0a8,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}
