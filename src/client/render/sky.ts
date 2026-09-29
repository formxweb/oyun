import * as THREE from 'three';
import type { Atmosphere } from '../../core/world/types';

/**
 * Sky dome + cloud layers. The sky is driven entirely by the current blended atmosphere,
 * which is interpolated by camera altitude (see atmosphere.ts).
 */
export class Sky {
  readonly group = new THREE.Group();
  private readonly dome: THREE.Mesh;
  private readonly domeMat: THREE.ShaderMaterial;
  private readonly clouds: { mesh: THREE.Mesh; mat: THREE.ShaderMaterial; y: number; thickness: number }[] = [];

  constructor(cloudLayers: { y: number; color: number; density: number; scale: number }[]) {
    this.domeMat = new THREE.ShaderMaterial({
      uniforms: {
        uTop: { value: new THREE.Color() },
        uHorizon: { value: new THREE.Color() },
        uBelow: { value: new THREE.Color() },
        uSunDir: { value: new THREE.Vector3(0, 1, 0) },
        uSunColor: { value: new THREE.Color() },
        uStars: { value: 0 },
        uTime: { value: 0 },
      },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uTop; uniform vec3 uHorizon; uniform vec3 uBelow; uniform vec3 uSunDir; uniform vec3 uSunColor; uniform float uStars; uniform float uTime;
        varying vec3 vDir;
        float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,45.164)))*43758.5453); }
        void main(){
          vec3 d = normalize(vDir);
          float y = d.y;
          vec3 c = y > 0.0 ? mix(uHorizon, uTop, pow(clamp(y,0.0,1.0), 0.55)) : mix(uHorizon, uBelow, pow(clamp(-y,0.0,1.0), 0.6));
          float sd = max(dot(d, normalize(uSunDir)), 0.0);
          c += uSunColor * (pow(sd, 900.0)*3.0 + pow(sd, 18.0)*0.28 + pow(sd, 3.0)*0.08);
          if (uStars > 0.0 && y > -0.2) {
            vec3 q = floor(d*420.0);
            float s = step(0.9965, h(q));
            float tw = 0.6 + 0.4*sin(uTime*2.0 + h(q+1.0)*40.0);
            c += vec3(s*tw*uStars) * smoothstep(-0.2, 0.2, y);
          }
          gl_FragColor = vec4(c, 1.0);
        }`,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(4000, 32, 20), this.domeMat);
    this.dome.renderOrder = -10;
    this.dome.frustumCulled = false;
    this.group.add(this.dome);

    for (const l of cloudLayers) {
      const mat = new THREE.ShaderMaterial({
        uniforms: {
          uColor: { value: new THREE.Color(l.color) },
          uShade: { value: new THREE.Color(0x8090a0) },
          uDensity: { value: l.density },
          uScale: { value: l.scale },
          uTime: { value: 0 },
          uCam: { value: new THREE.Vector3() },
          uFade: { value: 1 },
          uFogColor: { value: new THREE.Color() },
        },
        vertexShader: /* glsl */ `
          varying vec3 vW;
          void main(){ vec4 w = modelMatrix*vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`,
        fragmentShader: /* glsl */ `
          uniform vec3 uColor; uniform vec3 uShade; uniform float uDensity; uniform float uScale; uniform float uTime; uniform vec3 uCam; uniform float uFade; uniform vec3 uFogColor;
          varying vec3 vW;
          float h21(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
          float vn(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.0-2.0*f);
            return mix(mix(h21(i),h21(i+vec2(1,0)),u.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),u.x), u.y); }
          float fbm(vec2 p){ float s=0.0,a=0.5; for(int i=0;i<5;i++){ s+=a*vn(p); p=p*2.02+vec2(17.1,9.3); a*=0.5; } return s; }
          void main(){
            vec2 p = vW.xz/uScale + vec2(uTime*0.004, uTime*0.0025);
            float n = fbm(p);
            float cov = smoothstep(1.0-uDensity, 1.0-uDensity+0.35, n);
            float dist = length(vW.xz - uCam.xz);
            float edge = 1.0 - smoothstep(1800.0, 3400.0, dist);
            // thin near the camera so we can fly through the layer
            float near = smoothstep(8.0, 60.0, abs(uCam.y - vW.y) + dist*0.02);
            float a = cov * edge * near * uFade;
            if (a < 0.01) discard;
            vec3 c = mix(uShade, uColor, smoothstep(0.3, 0.9, n));
            c = mix(c, uFogColor, smoothstep(600.0, 3400.0, dist)*0.7);
            gl_FragColor = vec4(c, a*0.92);
          }`,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(8000, 8000, 1, 1), mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = l.y;
      mesh.frustumCulled = false;
      mesh.renderOrder = 5;
      this.group.add(mesh);
      this.clouds.push({ mesh, mat, y: l.y, thickness: 30 });
    }
  }

  update(atm: Atmosphere, cam: THREE.Vector3, time: number, stars: number, cloudShade: THREE.Color, fogColor: THREE.Color): void {
    this.dome.position.copy(cam);
    const u = this.domeMat.uniforms;
    (u.uTop.value as THREE.Color).setHex(atm.skyTop);
    (u.uHorizon.value as THREE.Color).setHex(atm.skyHorizon);
    (u.uBelow.value as THREE.Color).setHex(atm.fog).multiplyScalar(0.85);
    (u.uSunDir.value as THREE.Vector3).set(atm.sunDir.x, atm.sunDir.y, atm.sunDir.z);
    (u.uSunColor.value as THREE.Color).setHex(atm.sunColor).multiplyScalar(atm.sunIntensity);
    u.uStars.value = stars;
    u.uTime.value = time;
    for (const c of this.clouds) {
      c.mat.uniforms.uTime.value = time;
      (c.mat.uniforms.uCam.value as THREE.Vector3).copy(cam);
      (c.mat.uniforms.uShade.value as THREE.Color).copy(cloudShade);
      (c.mat.uniforms.uColor.value as THREE.Color).setHex(atm.cloudColor);
      (c.mat.uniforms.uFogColor.value as THREE.Color).copy(fogColor);
      c.mesh.position.x = cam.x;
      c.mesh.position.z = cam.z;
      c.mesh.visible = Math.abs(cam.y - c.y) < 2600;
    }
  }

  setQuality(detail: number): void {
    for (const c of this.clouds) c.mesh.visible = detail > 0;
  }
}
