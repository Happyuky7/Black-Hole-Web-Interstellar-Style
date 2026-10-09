import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { t, applyI18n, languageSelect, onLangChange } from './i18n.js';
import { fatal } from './errors.js';
import { openCredits } from './credits.js';
import { APP_VERSION } from './version.js';
import { music } from './audio.js';

const app = document.querySelector('#app');

const renderer = new THREE.WebGLRenderer({
  antialias: false,
  powerPreference: 'high-performance',
  alpha: false,
  stencil: false,
  depth: false,
  preserveDrawingBuffer: true,
});
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping; // OutputPass handles ACES + output transform.
renderer.setClearColor(0x000000, 1);
app.appendChild(renderer.domElement);

// A shader that fails to compile on this GPU/driver is unrecoverable.
renderer.debug.onShaderError = (gl, program, vs, fs) => {
  fatal('shader', gl.getProgramInfoLog(program) || gl.getShaderInfoLog(fs) || gl.getShaderInfoLog(vs));
};

// Context loss (driver reset, GPU memory pressure): give the browser a few
// seconds to restore it before bailing out to the start screen.
let contextTimer = 0;
renderer.domElement.addEventListener('webglcontextlost', e => {
  e.preventDefault();
  contextTimer = setTimeout(() => fatal('context'), 4000);
});
renderer.domElement.addEventListener('webglcontextrestored', () => clearTimeout(contextTimer));

const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

// Optional photo sky: if it is missing, the option is disabled and the
// procedural sky is used instead.
const sky = new THREE.TextureLoader().load(`${import.meta.env.BASE_URL}assets/milkyway-4k.jpg`, undefined, undefined, () => {
  const opt = document.querySelector('#skyMode option[value="photo"]');
  if(opt) opt.disabled = true;
  if(state.skyMode === 'photo'){ state.skyMode = 'procedural'; applyState(); }
});
sky.wrapS = THREE.RepeatWrapping;
sky.wrapT = THREE.ClampToEdgeWrapping;
sky.minFilter = THREE.LinearMipmapLinearFilter;
sky.magFilter = THREE.LinearFilter;
sky.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
sky.colorSpace = THREE.NoColorSpace; // decoded manually in shader

// CIE 1931 colour-matching functions (Wyman, Sloan & Shirley 2013 fit), sampled
// at 24 wavelengths 380–780 nm and pre-multiplied by Δλ. Shared with the shader.
function cieTable(){
  const lobe=(l,mu,s1,s2)=>{const t=(l-mu)/(l<mu?s1:s2);return Math.exp(-.5*t*t);};
  const out=[], dl=400/24;
  for(let i=0;i<24;i++){
    const l=380+(i+.5)*dl;
    out.push(new THREE.Vector3(
      1.056*lobe(l,599.8,37.9,31.0)+.362*lobe(l,442.0,16.0,26.7)-.065*lobe(l,501.1,20.4,26.2),
      .821*lobe(l,568.8,46.9,40.5)+.286*lobe(l,530.9,16.3,31.1),
      1.217*lobe(l,437.0,11.8,36.0)+.681*lobe(l,459.0,26.0,13.8)).multiplyScalar(dl));
  }
  return out;
}
const CIE=cieTable();

const uniforms = {
  uResolution: { value: new THREE.Vector2(1, 1) },
  uTime: { value: 0 },
  uSky: { value: sky },
  uSpin: { value: 0.998 },
  uInnerRadius: { value: 1.26 },
  uOuterRadius: { value: 14.0 },
  uDiskBrightness: { value: 1.1 },
  uDiskOpacity: { value: 0.92 },
  uTurbulence: { value: 1.0 },
  uDoppler: { value: 1.0 },
  uExposure: { value: 1.0 },
  uSkyStrength: { value: 0.62 },
  uFov: { value: 27.5 },
  uCamPos: { value: new THREE.Vector3(34, 0, 0) },
  uCamRight: { value: new THREE.Vector3(0, 1, 0) },
  uCamUp: { value: new THREE.Vector3(0, 0, 1) },
  uCamFwd: { value: new THREE.Vector3(-1, 0, 0) },
  uStepScale: { value: 1.0 },
  uMaxSteps: { value: 480.0 },
  uFilm: { value: 1.0 },
  uHaze: { value: 0.6 },
  uStars: { value: 1.0 },
  uSkyMode: { value: 0.0 },
  uSci: { value: 0.0 },          // 1 = full-physics mode
  uTscale: { value: 6e5 },       // (3 Ṁ c² / 8π σ r_g²)^(1/4) in kelvin
  uLumNorm: { value: 1.0 },      // visible luminance of the hottest annulus (g = 1)
  uIsco: { value: 3.83 },
  uCmf: { value: cieTable() },
};

const vertexShader = /* glsl */`
varying vec2 vUv;
void main(){
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const fragmentShader = /* glsl */`
precision highp float;

varying vec2 vUv;
uniform vec2 uResolution;
uniform float uTime;
uniform sampler2D uSky;
uniform float uSpin;
uniform float uInnerRadius;
uniform float uOuterRadius;
uniform float uDiskBrightness;
uniform float uDiskOpacity;
uniform float uTurbulence;
uniform float uDoppler;
uniform float uExposure;
uniform float uSkyStrength;
uniform float uFov;
uniform vec3 uCamPos;
uniform vec3 uCamRight;
uniform vec3 uCamUp;
uniform vec3 uCamFwd;

// Energy measured by the camera's local (ZAMO) frame per unit energy at infinity.
float gCamE = 1.0;
uniform float uStepScale;
uniform float uMaxSteps;
uniform float uFilm;
uniform float uHaze;
uniform float uStars;
uniform float uSkyMode;
uniform float uSci;
uniform float uTscale;
uniform float uLumNorm;
uniform float uIsco;
uniform vec3 uCmf[24];

#define PI 3.14159265358979323846
#define TAU 6.28318530717958647692
#define HALF_PI 1.57079632679489661923
#define MAX_STEPS 620

float hash21(vec2 p){
  vec3 p3 = fract(vec3(p.xyx) * vec3(.1031,.1030,.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float valueNoise(vec2 p){
  vec2 i=floor(p), f=fract(p);
  f=f*f*(3.0-2.0*f);
  float a=hash21(i);
  float b=hash21(i+vec2(1.0,0.0));
  float c=hash21(i+vec2(0.0,1.0));
  float d=hash21(i+vec2(1.0,1.0));
  return mix(mix(a,b,f.x),mix(c,d,f.x),f.y);
}

float valueNoiseP(vec2 p, float per){
  vec2 i=floor(p), f=fract(p);
  f=f*f*(3.0-2.0*f);
  float x0=mod(i.x,per), x1=mod(i.x+1.0,per);
  float a=hash21(vec2(x0,i.y));
  float b=hash21(vec2(x1,i.y));
  float c=hash21(vec2(x0,i.y+1.0));
  float d=hash21(vec2(x1,i.y+1.0));
  return mix(mix(a,b,f.x),mix(c,d,f.x),f.y);
}

// fbm that is periodic in x with period "per" (an integer number of cells).
float fbmP(vec2 p, float per){
  float f=0.0;
  f += .5000*valueNoiseP(p,per); p = vec2(p.x*2.0, p.y*2.03 + 4.7); per*=2.0;
  f += .2500*valueNoiseP(p,per); p = vec2(p.x*2.0, p.y*2.01 + 13.8); per*=2.0;
  f += .1250*valueNoiseP(p,per); p = vec2(p.x*2.0, p.y*2.07 + 21.7); per*=2.0;
  f += .0625*valueNoiseP(p,per);
  return f/.9375;
}

float fbm(vec2 p){
  float f=0.0;
  f += .5000*valueNoise(p); p = p*2.03 + vec2(17.1, 4.7);
  f += .2500*valueNoise(p); p = p*2.01 + vec2(8.3, 13.8);
  f += .1250*valueNoise(p); p = p*2.07 + vec2(3.2, 21.7);
  f += .0625*valueNoise(p);
  return f/.9375;
}

// Right-hand side of the Kerr null geodesic equations in Mino time σ.
void kerrDeriv(float r, float th, float pr, float pth, float a, float lam, float kq,
               out float dr, out float dth, out float dpr, out float dpth, out float dph){
  float s = sin(th), c = cos(th);
  float sc = max(abs(s), .002);
  float P = r*r + a*a - a*lam;
  float del = max(r*r - 2.0*r + a*a, 1e-7);
  dr = pr;
  dth = pth;
  dpr = 2.0*r*P - (r - 1.0)*kq;                        // R'(r)/2
  dpth = -s*c*a*a + lam*lam*c/(sc*sc*sc);              // Θ'(θ)/2
  dph = lam/max(s*s, 1e-7) - a + a*P/del;
}

float radialPotential(float r, float a, float lambda, float eta){
  float delta = r*r - 2.0*r + a*a;
  float P = r*r + a*a - a*lambda;
  float k = eta + (lambda-a)*(lambda-a);
  return P*P - delta*k;
}

float thetaPotential(float th, float a, float lambda, float eta){
  float s = sin(th);
  float c = cos(th);
  float s2 = max(s*s, 1e-7);
  return eta + a*a*c*c - lambda*lambda*c*c/s2;
}

// ---- Spectral colour -------------------------------------------------------
// uCmf[i] = CIE 1931 x̄ȳz̄(λ_i)·Δλ at λ_i = 380 + (i + ½)·400/24 nm, filled from JS
// with the multi-lobe fit of Wyman, Sloan & Shirley (2013).
// Planck B_λ(T) (λ in μm, consistent arbitrary units) is integrated against
// them and converted to linear sRGB (D65).
vec3 blackbodyXYZ(float T){
  vec3 xyz = vec3(0.0);
  for(int i=0;i<24;i++){
    float lm = (380.0 + (float(i)+.5)*(400.0/24.0))*1e-3;   // μm
    float x = min(14387.77/(lm*max(T,1.0)), 80.0);          // hc/(λkT)
    xyz += uCmf[i]/(lm*lm*lm*lm*lm*(exp(x) - 1.0));
  }
  return xyz;
}
vec3 blackbodyRGB(float T){
  vec3 rgb = mat3(3.2406,-.9689,.0557, -1.5372,1.8758,-.2040, -.4986,.0415,1.0570)*blackbodyXYZ(T);
  return max(rgb, vec3(0.0));
}
float blackbodyY(float T){ return blackbodyXYZ(T).y; }

// ---- Novikov–Thorne thin disk (Page & Thorne 1974) --------------------------
// Dimensionless flux F̃(x), x = √(r/M): F = 3Ṁc²/(8π r_g²) · F̃.
// One root term of the Page–Thorne bracket; a root at 0 (a = 0) contributes 0.
float ntTerm(float xi, float xj, float xk, float a, float x, float x0){
  if(abs(xi) < 1e-4) return 0.0;
  return 3.0*(xi-a)*(xi-a)/(xi*(xi-xj)*(xi-xk))*log((x-xi)/(x0-xi));
}
float ntFlux(float r, float a){
  float x = sqrt(r), x0 = sqrt(uIsco);
  if(x <= x0) return 0.0;
  float th = acos(clamp(a, -1.0, 1.0));
  float x1 = 2.0*cos((th - PI)/3.0);
  float x2 = 2.0*cos((th + PI)/3.0);
  float x3 = -2.0*cos(th/3.0);
  float B = x - x0 - 1.5*a*log(x/x0)
    - ntTerm(x1, x2, x3, a, x, x0) - ntTerm(x2, x1, x3, a, x, x0) - ntTerm(x3, x1, x2, a, x, x0);
  return max(B, 0.0)/(x*x*x*x*(x*x*x - 3.0*x + 2.0*a));
}

vec3 hash33(vec3 p){
  p = fract(p*vec3(.1031,.1030,.0973));
  p += dot(p, p.yxz+33.33);
  return fract((p.xxy+p.yxx)*p.zyx);
}

// One layer of point stars: at most one star per 3D cell, drawn as a
// pixel-sized Gaussian with a power-law brightness and a black-body-ish tint.
vec3 starLayer(vec3 d, float N, float prob, float gain){
  vec3 cell = floor(d*N);
  vec3 h = hash33(cell);
  if(h.x > prob) return vec3(0.0);
  vec3 sp = normalize((cell + .2 + .6*hash33(cell + 17.31))/N);
  if(any(notEqual(floor(sp*N), cell))) return vec3(0.0);
  float ang = length(d - sp);
  float pix = radians(uFov)/uResolution.y;
  float sz = pix*(.65 + .9*h.y*h.y);
  float I = exp(-ang*ang/(sz*sz)) * pow(h.y, 7.0) * gain;
  vec3 tint = h.z < .5 ? mix(vec3(.62,.75,1.25), vec3(1.0), h.z*2.0)
                       : mix(vec3(1.0), vec3(1.3,.85,.55), (h.z-.5)*2.0);
  if(uSci > .5 && I > 1e-4){
    // Star at 2 800–30 000 K; the camera (ZAMO) sees it as a blackbody at E_F·T.
    float Ts = 2800.0 + 27200.0*h.z*h.z;
    tint = blackbodyRGB(Ts*gCamE)/blackbodyY(Ts);
  }
  return tint*I;
}

float hash31(vec3 p){
  p = fract(p*.1031);
  p += dot(p, p.zyx+31.32);
  return fract((p.x+p.y)*p.z);
}

float noise3(vec3 x){
  vec3 i = floor(x), f = fract(x);
  f = f*f*(3.0-2.0*f);
  return mix(mix(mix(hash31(i), hash31(i+vec3(1,0,0)), f.x),
                 mix(hash31(i+vec3(0,1,0)), hash31(i+vec3(1,1,0)), f.x), f.y),
             mix(mix(hash31(i+vec3(0,0,1)), hash31(i+vec3(1,0,1)), f.x),
                 mix(hash31(i+vec3(0,1,1)), hash31(i+vec3(1,1,1)), f.x), f.y), f.z);
}

float fbm3(vec3 p){
  float f = 0.0, w = .5;
  for(int i=0;i<5;i++){ f += w*noise3(p); p = p*2.03 + 7.1; w *= .5; }
  return f/.96875;
}

// Rare, tiny distant galaxies: soft elongated smudges with a bright core.
vec3 galaxyLayer(vec3 d){
  const float N = 34.0;
  vec3 cell = floor(d*N);
  vec3 h = hash33(cell + 91.7);
  if(h.x > .16) return vec3(0.0);
  vec3 gp = normalize((cell + .3 + .4*hash33(cell + 5.3))/N);
  vec3 t1 = normalize(cross(gp, vec3(0.0,1.0,0.0) + .3*h));
  vec3 t2 = cross(gp, t1);
  vec2 q = vec2(dot(d-gp, t1), dot(d-gp, t2));
  float rot = h.y*TAU;
  q = mat2(cos(rot), -sin(rot), sin(rot), cos(rot))*q;
  float size = (.0010 + .0024*h.z)*(19.0/max(uFov, 1.0))*.6 + .0008;
  q /= size;
  q.y *= 2.2 + 2.5*h.y;
  float r2 = dot(q,q);
  float glow = exp(-r2*1.2) + .35*exp(-r2*.25);
  vec3 tint = mix(vec3(1.0,.85,.68), vec3(.75,.85,1.15), h.z);
  return tint*glow*.05;
}

// Procedural deep sky: sharp stars (denser along a galactic band), a faint
// band with dark dust lanes, very dim nebular colour and distant galaxies.
vec3 proceduralSky(vec3 d){
  vec3 gn = normalize(vec3(.32, .87, -.37));       // galactic pole
  float lat = dot(d, gn);
  float band = exp(-lat*lat/.045);
  float core = exp(-lat*lat/.010)*smoothstep(-.2, 1.0, dot(d, normalize(vec3(.9,-.25,.35))));

  float n = fbm3(d*3.2);
  float lanes = smoothstep(.40, .75, fbm3(d*7.0 + 11.0));
  float glow = band*(.35 + .9*n)*(1.0 - .75*lanes*band) + core*.9*(1.0-.7*lanes);
  vec3 col = glow*mix(vec3(.45,.48,.62), vec3(1.0,.80,.58), core*.8)*.020;

  float neb = smoothstep(.55, .95, fbm3(d*1.6 + 3.0));
  float neb2 = smoothstep(.58, .95, fbm3(d*2.3 - 8.0));
  col += neb*vec3(.38,.14,.36)*.010 + neb2*vec3(.10,.30,.42)*.009;

  float dens = 1.0 + 1.8*band + 2.5*core;
  col += (starLayer(d, 150.0, .30*dens, 4.5)
        + starLayer(d, 380.0, .20*dens, 1.8)
        + starLayer(d, 950.0, .12*dens, .9)) * uStars;
  col += galaxyLayer(d);
  return col;
}

// Film-style sky: pure black with sparse, tiny, faint stars far away.
vec3 distantStars(vec3 d){
  return (starLayer(d, 260.0, .05, 2.0)
        + starLayer(d, 700.0, .025, .7)) * uStars;
}

vec3 skySample(float th, float ph){
  vec3 d = vec3(sin(th)*cos(ph), cos(th), sin(th)*sin(ph));
  vec3 c = vec3(0.0);
  if(uSkyMode > 1.5){
    c = distantStars(d)*uSkyStrength*1.6;
  } else if(uSkyMode < .5){
    c = proceduralSky(d)*uSkyStrength*1.6;
  } else {
    vec2 uv = vec2(fract(ph/TAU + .5), clamp(th/PI, 0.001, .999));
    c = pow(max(texture2D(uSky, uv).rgb, vec3(0.0)), vec3(2.2))*uSkyStrength;
    c += (starLayer(d, 160.0, .40, 4.0) + starLayer(d, 420.0, .30, 1.6))*uStars;
  }
  return c;
}

// Interstellar/DNGR-style disk texture: thin concentric lanes plus long orbital
// streaks. The streaks are advected with a two-layer flow-map crossfade so the
// differential rotation never winds the pattern into noise over time.
float filmStructure(float r, float ph, float omega){
  float lanes = .62*valueNoise(vec2(r*2.6, 3.1)) + .38*valueNoise(vec2(r*7.5, 8.7));
  lanes = mix(.55, 1.25, smoothstep(.18, .86, lanes));

  const float T = 22.0;
  float t1 = mod(uTime, T);
  float t2 = mod(uTime + .5*T, T);
  float w1 = 1.0 - abs(2.0*t1/T - 1.0);
  float a1 = ph - omega*t1*2.2;
  float a2 = ph - omega*t2*2.2;
  float u1 = a1/TAU, u2 = a2/TAU;
  float s1 = .70*fbmP(vec2(u1*12.0, r*4.5), 12.0) + .30*fbmP(vec2(u1*31.0, r*8.0), 31.0);
  float s2 = .70*fbmP(vec2(u2*12.0 + 5.0, r*4.5 + 1.7), 12.0) + .30*fbmP(vec2(u2*31.0 + 9.0, r*8.0 + 4.3), 31.0);
  float streak = mix(s2, s1, w1);
  streak = mix(.55, 1.30, smoothstep(.25, .80, streak));
  return lanes*streak;
}

// Full-physics disk: optically thick Novikov–Thorne blackbody seen through the
// exact Kerr redshift g = E_F / (uᵗ (1 − Ω λ)) of a prograde circular emitter;
// I_ν/ν³ is invariant, so the observer sees a blackbody at g·T. Electron-
// scattering limb darkening (Chandrasekhar): I ∝ 1 + 2.06 μ, flux-normalised.
vec3 diskEmissionSci(float r, float lambda, float eta, float a, out float alpha){
  float r32 = r*sqrt(r);
  float ut = (r32 + a)/sqrt(max(r*r*r - 3.0*r*r + 2.0*a*r32, 1e-6));
  float om = 1.0/(r32 + a);
  float Eem = ut*(1.0 - om*lambda);          // photon energy in the gas frame
  float g = gCamE/max(Eem, 1e-4);
  float T = uTscale*pow(ntFlux(r, a), .25);
  float mu = clamp(sqrt(max(eta, 0.0))/(r*max(Eem, 1e-4)), 0.0, 1.0);
  float limb = (1.0 + 2.06*mu)*.4213;
  float outerFall = 1.0 - smoothstep(uOuterRadius - .4, uOuterRadius, r);
  alpha = outerFall;
  return blackbodyRGB(g*T)*limb/uLumNorm*uDiskBrightness;
}

vec3 diskEmission(float r, float ph, float lambda, float a, float order, out float alpha){
  float rin = uInnerRadius;
  float rout = max(uOuterRadius, rin + .1);
  float radial01 = clamp((r-rin)/(rout-rin), 0.0, 1.0);

  // Thin-disk-like radial temperature profile. This is an artistic visible-band
  // mapping of the Novikov-Thorne/Shakura-Sunyaev shape, not a spectral solver.
  float noTorque = pow(max(1.0 - sqrt(rin/max(r,rin+.0001)), 0.0), .25);
  float temp = noTorque / pow(max(r,1.0), .72);
  float hot = clamp(temp*2.8 + exp(-(r-rin)*1.45)*.22, 0.0, 1.0);

  // Differential rotation creates elongated turbulent filaments.
  float omega = 1.0/(pow(max(r,1.001), 1.5) + a);
  float phase = (ph - uTime*omega*2.33)/TAU*113.0;
  float n1 = fbmP(vec2(phase, r*2.2), 113.0);
  float n2 = fbmP(vec2(phase*2.0 + r*4.0, r*3.6 - uTime*.08), 226.0);
  float turbulence = mix(.72, 1.38, smoothstep(.22,.88,.66*n1+.34*n2));
  turbulence = mix(1.0, turbulence, uTurbulence);

  float rings = .87 + .13*sin(r*4.5 + sin(ph*5.0)*1.2);
  // Fade fine structure near the inner edge and in higher-order images: those
  // are squeezed into a few pixels by lensing and would only alias into moiré.
  float detail = smoothstep(rin, rin + 1.6, r) * (order < .5 ? 1.0 : .45);
  float density = exp(-radial01*1.15) * mix(1.0, turbulence*rings, detail);
  if(uFilm > .001){
    float fs = max(mix(1.0, filmStructure(r, ph, omega), uTurbulence*detail), 0.0);
    density = mix(density, exp(-radial01*2.1)*fs, uFilm);
  }

  // Exact frequency shift for a circular prograde equatorial emitter in Kerr,
  // evaluated with the ray's conserved lambda = Lz/E.
  float r32 = r*sqrt(max(r,1e-5));
  float orbitDen = max(r*r*r - 3.0*r*r + 2.0*a*r32, .012);
  float ut = (r32+a)/sqrt(orbitDen);
  float om = 1.0/(r32+a);
  float g = gCamE/(ut*max(1.0-om*lambda, .045));
  g = clamp(g, .16, 3.4);
  float gEff = pow(g, uDoppler);

  vec3 ember = vec3(.75,.025,.002);
  vec3 orange = vec3(1.20,.19,.018);
  vec3 gold = vec3(1.38,.66,.15);
  vec3 whiteHot = vec3(1.25,1.14,.92);
  vec3 c = mix(ember, orange, smoothstep(.08,.36,hot));
  c = mix(c, gold, smoothstep(.30,.67,hot));
  c = mix(c, whiteHot, smoothstep(.62,1.0,hot));

  // The film's disk is a pale gold/white with amber outskirts (Doppler colour
  // shifts were deliberately left out of the movie renders).
  vec3 fc = mix(vec3(.62,.24,.07), vec3(1.18,.64,.25), smoothstep(.04,.34,hot));
  fc = mix(fc, vec3(1.30,1.02,.70), smoothstep(.28,.72,hot));
  fc = mix(fc, vec3(1.32,1.24,1.10), smoothstep(.70,1.0,hot));
  c = mix(c, fc, uFilm);

  float blue = smoothstep(1.02, 1.85, gEff);
  float red = 1.0-smoothstep(.42,.98,gEff);
  c = mix(c, c*vec3(.74,.90,1.18), blue*.52);
  c = mix(c, c*vec3(1.16,.56,.33), red*.62);

  // Liouville invariance gives an observed bolometric scaling near g^4.
  float beam = pow(clamp(gEff,.22,2.45), 4.0);
  beam = min(beam, 26.0);

  float innerRise = smoothstep(rin, rin+.10+rin*.02, r);
  float outerFall = 1.0-smoothstep(rout-.65, rout, r);
  float edge = innerRise*outerFall;
  float orderFade = exp(-order*.22);

  alpha = clamp(edge*uDiskOpacity*smoothstep(0.0, .35, density)*orderFade, 0.0, .985);
  float emission = mix(.30 + 2.25*hot, .22 + 1.15*hot, uFilm) * density * beam * orderFade;
  return c * emission * uDiskBrightness;
}

void main(){
  vec2 p = (gl_FragCoord.xy*2.0-uResolution.xy)/uResolution.y;

  float a = clamp(uSpin, -.9995, .9995);
  float tanH = tan(radians(uFov)*.5);
  vec3 dir = normalize(uCamFwd + p.x*tanH*uCamRight + p.y*tanH*uCamUp);

  // Free camera anywhere outside the horizon (z = spin axis). Its position is
  // mapped to Boyer-Lindquist coordinates through the oblate-spheroidal relation.
  vec3 X = uCamPos;
  float bq = dot(X,X) - a*a;
  float r = sqrt(.5*(bq + sqrt(bq*bq + 4.0*a*a*X.z*X.z)));
  float th = clamp(acos(clamp(X.z/max(r,1e-4), -1.0, 1.0)), .002, PI-.002);
  float ph = atan(X.y, X.x);

  // Pixel direction in the local ZAMO frame (e_r, e_θ, e_φ), then the photon's
  // conserved quantities (Thorne et al. 2015, DNGR appendix A):
  //   E_F = 1/(α + ω ϖ n_φ),  p_r = E_F ρ/√Δ n_r,  p_θ = E_F ρ n_θ,  λ = p_φ = E_F ϖ n_φ.
  float s0 = sin(th), c0 = cos(th);
  vec3 er = vec3(s0*cos(ph), s0*sin(ph), c0);
  vec3 et = vec3(c0*cos(ph), c0*sin(ph), -s0);
  vec3 ep = vec3(-sin(ph), cos(ph), 0.0);
  vec3 n = normalize(vec3(dot(dir,er), dot(dir,et), dot(dir,ep)));
  float rhoSq = r*r + a*a*c0*c0;
  float del0 = max(r*r - 2.0*r + a*a, 1e-5);
  float Abig = (r*r+a*a)*(r*r+a*a) - a*a*del0*s0*s0;
  float lapse = sqrt(rhoSq*del0/Abig);
  float varpi = sqrt(Abig/rhoSq)*s0;
  float omegaF = 2.0*a*r/Abig;
  float EF = 1.0/(lapse + omegaF*varpi*n.z);
  gCamE = EF;
  float lambda = EF*varpi*n.z;
  float pthInit = EF*sqrt(rhoSq)*n.y;
  float eta = pthInit*pthInit + c0*c0*(lambda*lambda/(s0*s0) - a*a);

  // Second-order form of the separated Kerr equations in Mino time σ:
  //   (dr/dσ)² = R(r),  d²r/dσ² = R'(r)/2,  (dθ/dσ)² = Θ(θ),  d²θ/dσ² = Θ'(θ)/2.
  // Integrating velocities (leapfrog) passes smoothly through turning points,
  // so neighbouring pixels map to neighbouring sky directions (sharp stars).
  float pr = EF*sqrt(rhoSq*del0)*n.x;   // dr/dσ = Δ p_r
  float pth = pthInit;                   // dθ/dσ = p_θ
  float kq = eta + (lambda-a)*(lambda-a);
  // Rays whose polar turning point lies within ~0.01 rad of the axis are
  // treated, while inside 0.2 rad of it, as passing straight over the pole
  // (φ flips by π there); everything else resolves the λ²/sin³θ barrier with
  // finer steps near the axis. Avoids a seam along the image column α ≈ 0.
  bool polar = lambda*lambda < 1e-4*(eta + a*a);

  float rPlus = 1.0 + sqrt(max(1.0-a*a, 0.0));
  float escapeR = max(r*1.15 + 4.5, 60.0);

  vec3 accum = vec3(0.0);
  float trans = 1.0;
  float order = 0.0;
  float winding = 0.0;
  float minR = 1e6;
  bool captured = false;
  bool escaped = false;

  for(int i=0;i<MAX_STEPS;i++){
    if(float(i) >= uMaxSteps) break;
    if(trans < .012) break;

    minR = min(minR, r);
    if(r <= rPlus + .05 && pr < 0.0){ captured = true; break; }
    if(i>20 && r >= escapeR && pr>0.0){ escaped = true; break; }

    float s = sin(th), c = cos(th);
    float s2 = max(s*s, 1e-7);
    float sigma = r*r + a*a*c*c;
    float delta = max(r*r - 2.0*r + a*a, 1e-7);
    float P = r*r + a*a - a*lambda;
    float lamPole = (polar && abs(s) < .2) ? 0.0 : lambda;
    float dph = (lamPole/s2 - a + a*P/delta)/sigma;
    float dphFrame = (a*P/delta - a)/sigma;

    float h = mix(.020, .250, smoothstep(rPlus, 11.0, r))*uStepScale;
    h *= max(1.0, pow(r/8.0, 1.5));
    if(!polar) h *= clamp(abs(s)/.15, .06, 1.0);
    float dsig = h/sigma;

    float prevR=r, prevTh=th, prevPh=ph;

    if(uSci > .5){
      // Classic RK4 on (r, θ, p_r, p_θ, φ) in Mino time: ~7× lower median
      // error than leapfrog at the same step count (see docs/PHYSICS.md).
      float k1r, k1t, k1p, k1q, k1f, k2r, k2t, k2p, k2q, k2f;
      float k3r, k3t, k3p, k3q, k3f, k4r, k4t, k4p, k4q, k4f;
      kerrDeriv(r, th, pr, pth, a, lamPole, kq, k1r, k1t, k1p, k1q, k1f);
      kerrDeriv(r+.5*dsig*k1r, th+.5*dsig*k1t, pr+.5*dsig*k1p, pth+.5*dsig*k1q, a, lamPole, kq, k2r, k2t, k2p, k2q, k2f);
      kerrDeriv(r+.5*dsig*k2r, th+.5*dsig*k2t, pr+.5*dsig*k2p, pth+.5*dsig*k2q, a, lamPole, kq, k3r, k3t, k3p, k3q, k3f);
      kerrDeriv(r+dsig*k3r, th+dsig*k3t, pr+dsig*k3p, pth+dsig*k3q, a, lamPole, kq, k4r, k4t, k4p, k4q, k4f);
      r   += dsig*(k1r + 2.0*k2r + 2.0*k3r + k4r)/6.0;
      th  += dsig*(k1t + 2.0*k2t + 2.0*k3t + k4t)/6.0;
      pr  += dsig*(k1p + 2.0*k2p + 2.0*k3p + k4p)/6.0;
      pth += dsig*(k1q + 2.0*k2q + 2.0*k3q + k4q)/6.0;
      ph  += dsig*(k1f + 2.0*k2f + 2.0*k3f + k4f)/6.0;
      r = max(r, rPlus+.002);
      if(th < .0005){ th = .001 - th; pth = abs(pth); ph += PI; }
      if(th > PI-.0005){ th = 2.0*PI - .001 - th; pth = -abs(pth); ph += PI; }
    } else {
    // Kick-drift-kick.
    float sc = max(abs(s), .002);
    float Rp = 4.0*r*P - (2.0*r-2.0)*kq;
    float Tp = -2.0*s*c*a*a + 2.0*lamPole*lamPole*c/(sc*sc*sc);
    pr  += .25*dsig*Rp;
    pth += .25*dsig*Tp;
    float th0 = th;
    r  += dsig*pr;
    th += dsig*pth;
    ph += dphFrame*h;
    if(th > 0.0 && th < PI){
      float dth = th - th0;
      ph += abs(dth) > 1e-5
        ? lamPole*dsig*(cos(th0)/sin(th0) - cos(th)/sin(th))/dth
        : lamPole*dsig/s2;
    }
    r = max(r, rPlus+.002);
    if(th < .0005){ th = .001 - th; pth = abs(pth); ph += PI; }
    if(th > PI-.0005){ th = 2.0*PI - .001 - th; pth = -abs(pth); ph += PI; }
    float s1 = sin(th), c1 = cos(th);
    float sc1 = max(abs(s1), .002);
    float P1 = r*r + a*a - a*lambda;
    Rp = 4.0*r*P1 - (2.0*r-2.0)*kq;
    Tp = -2.0*s1*c1*a*a + 2.0*lamPole*lamPole*c1/(sc1*sc1*sc1);
    pr  += .25*dsig*Rp;
    pth += .25*dsig*Tp;
    }
    // Project back onto the null constraint (pr² = R, pθ² = Θ), keeping the
    // sign from the dynamics so turning points stay smooth.
    float Rn = radialPotential(r,a,lambda,eta);
    if(Rn > 0.0) pr = (pr >= 0.0 ? 1.0 : -1.0)*sqrt(Rn);
    float Tn = thetaPotential(th,a,lamPole,eta);
    if(Tn > 0.0) pth = (pth >= 0.0 ? 1.0 : -1.0)*sqrt(Tn);

    if(r < 7.0) winding += sqrt(pth*pth*dsig*dsig + s2*dph*dph*h*h);

    // Optically thin glowing atmosphere above/below the disk: gives the soft,
    // volumetric look of the movie instead of a razor-thin sheet.
    if(uHaze > .001 && r > uInnerRadius*.85 && r < uOuterRadius*1.1){
      float H = .035*r + .05;
      float dz = r*cos(th)/H;
      if(abs(dz) < 3.0){
        float ds = length(vec3(pr, r*pth, r*sqrt(s2)*dph*sigma))*dsig;
        float rad01 = clamp((r-uInnerRadius)/(uOuterRadius-uInnerRadius), 0.0, 1.0);
        float window = smoothstep(uInnerRadius*.85, uInnerRadius*1.3, r)
                     * (1.0-smoothstep(uOuterRadius*.7, uOuterRadius*1.1, r));
        float k = uHaze*exp(-dz*dz)*window*exp(-rad01*2.2)*ds;
        vec3 hc = mix(vec3(1.0,.42,.11), vec3(1.25,.98,.72), exp(-rad01*3.0));
        accum += trans*hc*k*.16*uDiskBrightness;
        trans *= exp(-k*.08);
      }
    }

    // Thin equatorial accretion disk. Every equator crossing can produce a
    // higher-order lensed image; opacity naturally suppresses deeper orders.
    float q0 = prevTh-HALF_PI;
    float q1 = th-HALF_PI;
    if(q0*q1 <= 0.0 && abs(th-prevTh) > 1e-7){
      float t = clamp((HALF_PI-prevTh)/(th-prevTh),0.0,1.0);
      float hitR = mix(prevR,r,t);
      float hitPh = mix(prevPh,ph,t);
      if(hitR >= uInnerRadius && hitR <= uOuterRadius && order < 6.0){
        float aDisk;
        vec3 e = uSci > .5 ? diskEmissionSci(hitR,lambda,eta,a,aDisk)
                           : diskEmission(hitR,hitPh,lambda,a,order,aDisk);
        accum += trans*e*aDisk;
        trans *= (1.0-aDisk);
        order += 1.0;
      }
    }
  }

  // Out of steps while skimming the photon sphere: treat as captured.
  if(!escaped && r < 3.6) captured = true;

  vec3 bg = vec3(0.0);
  if(!captured){
    // At large r, Boyer-Lindquist angles approach ordinary celestial angles.
    // Extrapolate to r -> inf: dθ/dr ≈ (dθ/dσ)/r², dφ/dr ≈ λ/(sin²θ r²).
    float sF = max(sin(th)*sin(th), 1e-4);
    float thInf = th + pth/max(abs(pr), 1e-3)*r*(escaped ? 1.0 : 0.0);
    float phInf = ph + (escaped ? lambda/(sF*r) : 0.0);
    bg = skySample(clamp(thInf,.001,PI-.001), phInf);
    if(!escaped) bg *= uSci > .5 ? 0.0 : .55;
  }

  vec3 col = accum + trans*bg;

  // A subtle critical-curve enhancement only for strongly wound rays. Unlike
  // the old renderer, this does not draw a perfect circle by hand.
  float critical = smoothstep(2.8, 9.0, winding)*exp(-max(minR-rPlus,0.0)*.22);
  col += vec3(1.05,.52,.16)*critical*.055*uDiskBrightness*(1.0 - uSci);

  // HDR exposure before post-processing/bloom.
  col *= uExposure;

  // Small filmic vignette and sub-LSB dither to reduce banding.
  vec2 q=(vUv-.5)*2.0;
  col *= 1.0 - .10*dot(q,q)*(1.0 - uSci);
  float dither=(hash21(gl_FragCoord.xy+uTime)-.5)/255.0;
  col += dither;

  gl_FragColor = vec4(max(col,vec3(0.0)),1.0);
}
`;

const material = new THREE.ShaderMaterial({
  uniforms,
  vertexShader,
  fragmentShader,
  depthTest: false,
  depthWrite: false,
  toneMapped: false,
});
scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material));

const halfFloatTarget = new THREE.WebGLRenderTarget(1, 1, {
  type: THREE.HalfFloatType,
  minFilter: THREE.LinearFilter,
  magFilter: THREE.LinearFilter,
  depthBuffer: false,
  stencilBuffer: false,
});
const composer = new EffectComposer(renderer, halfFloatTarget);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), .62, .33, .78);
composer.addPass(bloom);

// HDR camera-lens pass: horizontal anamorphic streak from the brightest
// highlights plus a slight radial chromatic aberration.
const lensPass = new ShaderPass({
  uniforms: {
    tDiffuse: { value: null },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uFlare: { value: .35 },
    uChroma: { value: .5 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform vec2 uResolution;
    uniform float uFlare;
    uniform float uChroma;
    varying vec2 vUv;

    vec3 bright(vec2 uv){
      vec3 c = texture2D(tDiffuse, uv).rgb;
      float l = dot(c, vec3(.2126,.7152,.0722));
      return c*max(l-1.15, 0.0)/max(l, 1e-4);
    }

    void main(){
      vec2 d = vUv-.5;
      vec2 shift = d*dot(d,d)*uChroma*.012;
      vec3 col;
      col.r = texture2D(tDiffuse, vUv-shift).r;
      col.g = texture2D(tDiffuse, vUv).g;
      col.b = texture2D(tDiffuse, vUv+shift).b;

      if(uFlare > .001){
        vec3 streak = vec3(0.0);
        float aspect = uResolution.x/uResolution.y;
        for(int i=1;i<=28;i++){
          float t = float(i)/28.0;
          float off = t*t*.42/aspect*1.6;
          float w = exp(-t*4.2);
          streak += (bright(vUv+vec2(off,0.0)) + bright(vUv-vec2(off,0.0)))*w;
        }
        streak /= 9.0;
        float l = dot(streak, vec3(.2126,.7152,.0722));
        vec3 tint = mix(vec3(l)*vec3(.78,.88,1.0), streak, .45);
        col += tint*uFlare;
      }
      gl_FragColor = vec4(col, 1.0);
    }
  `,
});
composer.addPass(lensPass);

const output = new OutputPass();
output.toneMapping = THREE.ACESFilmicToneMapping;
output.toneMappingExposure = 1.0;
composer.addPass(output);
const smaa = new SMAAPass(1, 1);
composer.addPass(smaa);

// Display-referred film pass: luminance-weighted grain and 2.39:1 letterbox.
const filmPass = new ShaderPass({
  uniforms: {
    tDiffuse: { value: null },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uTime: { value: 0 },
    uGrain: { value: .35 },
    uLetterbox: { value: 1 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform vec2 uResolution;
    uniform float uTime;
    uniform float uGrain;
    uniform float uLetterbox;
    varying vec2 vUv;

    float hash(vec2 p){
      vec3 p3 = fract(vec3(p.xyx)*.1031);
      p3 += dot(p3, p3.yzx+33.33);
      return fract((p3.x+p3.y)*p3.z);
    }

    void main(){
      vec3 col = texture2D(tDiffuse, vUv).rgb;
      if(uGrain > .001){
        vec2 px = floor(vUv*uResolution);
        float f = floor(uTime*24.0);
        float n = hash(px+f*17.13) + hash(px*1.37+f*3.71) - 1.0;
        float l = dot(col, vec3(.2126,.7152,.0722));
        col += n*uGrain*.085*(.35 + .65*(1.0-abs(2.0*l-1.0)));
      }
      if(uLetterbox > .5){
        float aspect = uResolution.x/uResolution.y;
        float bar = max(0.0, (1.0 - aspect/2.39)*.5);
        float ay = min(vUv.y, 1.0-vUv.y)*uResolution.y;
        col *= smoothstep(bar*uResolution.y-.5, bar*uResolution.y+.5, ay);
      }
      gl_FragColor = vec4(max(col, vec3(0.0)), 1.0);
    }
  `,
});
composer.addPass(filmPass);

function setPostSize(w, h){
  smaa.setSize(w, h);
  lensPass.uniforms.uResolution.value.set(w, h);
  filmPass.uniforms.uResolution.value.set(w, h);
}

const state = {
  mass: 100_000_000,
  spin: 0.998,
  inclination: 84.0,
  iscoLock: true,
  inner: 1.26,
  outer: 14.0,
  doppler: 1.0,
  diskBrightness: 1.08,
  diskOpacity: .92,
  turbulence: 1.0,
  exposure: 1.0,
  bloom: .62,
  sky: .62,
  fov: 27.5,
  observer: 34.0,
  renderScale: 1.0,
  quality: 'pro',
  paused: false,
  film: 1.0,
  haze: .6,
  flare: .35,
  grain: .35,
  letterbox: true,
  azimuth: 0,
  drift: .15,
  timeScale: 1,
  stars: 1,
  skyMode: 'procedural',
  sci: false,
  accretion: .1,               // L / L_Edd
  camMode: 'orbit',
};

const qualityModes = {
  rapido: { maxSteps: 350, stepScale: 1.22, label: 'Rápido' },
  pro: { maxSteps: 480, stepScale: 1.00, label: 'Pro' },
  ultra: { maxSteps: 610, stepScale: .82, label: 'Ultra' },
};

function iscoRadius(a){
  const aa = THREE.MathUtils.clamp(a, -.999999, .999999);
  const z1 = 1 + Math.cbrt(1-aa*aa)*(Math.cbrt(1+aa)+Math.cbrt(1-aa));
  const z2 = Math.sqrt(3*aa*aa+z1*z1);
  const s = aa >= 0 ? 1 : -1;
  return 3+z2-s*Math.sqrt(Math.max(0,(3-z1)*(3+z1+2*z2)));
}

function horizonRadius(a){
  return 1+Math.sqrt(Math.max(0,1-a*a));
}

const panel = document.createElement('aside');
panel.className = 'panel';
panel.innerHTML = `
  <div class="title-row">
    <div>
      <h1>Gargantua Kerr Lab <span>v${APP_VERSION}</span></h1>
      <p data-i18n="app.subtitle"></p>
    </div>
    <div class="title-tools">
      <span id="langSlot"></span>
      <button id="hideUi" class="icon-btn" data-i18n-title="ui.hide">×</button>
    </div>
  </div>

  <div class="preset-row">
    <button data-preset="movie" class="active" data-i18n="preset.movie"></button>
    <button data-preset="cinema" data-i18n="preset.cinema"></button>
    <button data-preset="sci" data-i18n="preset.sci"></button>
    <button data-preset="real" data-i18n="preset.real"></button>
    <button data-preset="edge" data-i18n="preset.edge"></button>
  </div>

  <div id="controls"></div>

  <div class="check-row">
    <label><input id="iscoLock" type="checkbox" checked> <span data-i18n="ui.iscoLock"></span></label>
    <label class="select-label sci-label"><input id="sciMode" type="checkbox"> <span data-i18n="ui.sci"></span></label>
    <label class="select-label"><span data-i18n="ui.quality"></span>
      <select id="quality">
        <option value="rapido" data-i18n="quality.rapido"></option>
        <option value="pro" selected data-i18n="quality.pro"></option>
        <option value="ultra" data-i18n="quality.ultra"></option>
      </select>
    </label>
  </div>

  <div class="check-row">
    <label><input id="letterbox" type="checkbox" checked> <span data-i18n="ui.letterbox"></span></label>
    <label class="select-label"><span data-i18n="ui.background"></span>
      <select id="skyMode">
        <option value="procedural" selected data-i18n="sky.procedural"></option>
        <option value="cinema" data-i18n="sky.cinema"></option>
        <option value="photo" data-i18n="sky.photo"></option>
      </select>
    </label>
  </div>

  <div class="mode-row">
    <button data-cam="orbit" class="active" data-i18n="cam.orbit"></button>
    <button data-cam="fly" data-i18n="cam.fly"></button>
  </div>
  <div class="cam-help" id="camHelp"></div>

  <div class="button-row three">
    <button id="pause"></button>
    <button id="reset" data-i18n="ui.reset"></button>
    <button id="shot" data-i18n="ui.shot"></button>
  </div>

  <div class="physics" id="physics"></div>
  <div class="legend"><span data-i18n-html="ui.legend"></span> · <button type="button" class="link-btn" id="credits" data-i18n="ui.credits"></button> · <a class="link-btn" href="./physics.html" target="_blank" data-i18n="ui.physics"></a> · <a class="link-btn" href="https://github.com/Happyuky7/Black-Hole-Web-Interstellar-Style" target="_blank" rel="noopener">GitHub</a></div>
  <div class="warning" data-i18n="ui.disclaimer"></div>
`;
panel.querySelector('#langSlot').appendChild(languageSelect('lang-select'));
panel.querySelector('#credits').addEventListener('click', openCredits);
document.body.appendChild(panel);

// Top-right navigation in the black-hole view: back to the start screen and
// the physics/sources page (opened in a new tab so the scene keeps running).
const appNav = document.createElement('nav');
appNav.className = 'app-nav';
appNav.innerHTML = `
  <button type="button" class="nav-btn" id="navBack">← <span data-i18n="nav.back"></span></button>
  <a class="nav-btn nav-accent" href="./physics.html" target="_blank" rel="noopener" data-i18n="nav.physics"></a>`;
document.body.appendChild(appNav);
appNav.querySelector('#navBack').addEventListener('click', () => location.assign('./'));

const showButton = document.createElement('button');
showButton.className = 'show-ui';
showButton.dataset.i18n = 'ui.show';
showButton.hidden = true;
document.body.appendChild(showButton);

// ---------- Music: Interstellar main theme, looped, with volume ----------

function loadVolume(){
  try {
    const raw = localStorage.getItem('gargantua-volume');
    const v = Number(raw);
    if(raw !== null && Number.isFinite(v) && v >= 0 && v <= 1) return v;
  } catch {}
  return .6;
}
let musicVolume = loadVolume();
let fadeFrame = 0;

const player = document.createElement('div');
player.className = 'player';
player.innerHTML = `
  <button id="musicToggle" class="play-btn" title="Reproducir (M)" aria-label="Reproducir música">
    <svg viewBox="0 0 24 24" aria-hidden="true"><path class="ico-play" d="M8 5.5v13l10.5-6.5z"/><path class="ico-pause" d="M7 5h3.6v14H7zM13.4 5H17v14h-3.6z"/></svg>
  </button>
  <div class="track">
    <span class="track-title">Interstellar · Main Theme</span>
    <span class="track-sub" data-i18n="music.sub"></span>
  </div>
  <div class="volume">
    <button id="musicMute" class="mute-btn" data-i18n-title="music.mute">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path class="wave" d="M15 9.2a4 4 0 0 1 0 5.6M17.4 6.8a7.4 7.4 0 0 1 0 10.4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
    </button>
    <input id="musicVolume" type="range" min="0" max="1" step=".01" data-i18n-title="music.volume">
    <output id="musicVolumeOut"></output>
  </div>
`;
document.body.appendChild(player);

const musicToggle = player.querySelector('#musicToggle');
const musicMute = player.querySelector('#musicMute');
const volumeInput = player.querySelector('#musicVolume');
const volumeOut = player.querySelector('#musicVolumeOut');

function fadeTo(target, ms, done){
  cancelAnimationFrame(fadeFrame);
  const from = music.volume, start = performance.now();
  const step = (now) => {
    const t = Math.min((now-start)/ms, 1);
    music.volume = from + (target-from)*t*t*(3-2*t);
    if(t < 1) fadeFrame = requestAnimationFrame(step);
    else if(done) done();
  };
  fadeFrame = requestAnimationFrame(step);
}

let wantPlaying = false;
// The mp3 is not shipped in the repo (copyright); degrade gracefully without it.
let musicMissing = false;
music.addEventListener('error', () => { musicMissing = true; wantPlaying = false; syncPlayer(); });
function syncPlayer(){
  player.classList.toggle('playing', wantPlaying);
  player.classList.toggle('muted', music.muted || musicVolume === 0);
  musicToggle.title = musicMissing ? t('music.missing') : t(wantPlaying ? 'music.pause' : 'music.play');
  musicToggle.setAttribute('aria-label', musicToggle.title);
  musicToggle.disabled = musicMissing;
  player.classList.toggle('unavailable', musicMissing);
  player.querySelector('.track-sub').textContent = musicMissing ? t('music.missing') : t('music.sub');
  volumeInput.value = musicVolume;
  volumeInput.style.setProperty('--fill', `${musicVolume*100}%`);
  volumeOut.textContent = `${Math.round(musicVolume*100)}`;
}

function retryOnNextGesture(){
  const retry = e => {
    if(e.target instanceof Element && e.target.closest('.player')) return;
    removeEventListener('pointerdown', retry, true);
    removeEventListener('keydown', retry, true);
    if(!wantPlaying) toggleMusic();
  };
  addEventListener('pointerdown', retry, true);
  addEventListener('keydown', retry, true);
}

async function toggleMusic(){
  if(musicMissing) return;
  wantPlaying = !wantPlaying;
  syncPlayer();
  if(wantPlaying){
    if(music.paused) music.volume = 0;
    try {
      await music.play();
      fadeTo(musicVolume, 1600);
    } catch(err) {
      console.warn('[gargantua] music playback failed', err);
      wantPlaying = false;
      syncPlayer();
      // Blocked by the browser's autoplay policy: try again on the next click
      // or key press anywhere (but not on the player, which toggles itself).
      if(err?.name === 'NotAllowedError') retryOnNextGesture();
    }
  } else {
    fadeTo(0, 450, () => { if(!wantPlaying) music.pause(); });
  }
}

musicToggle.addEventListener('click', toggleMusic);
musicMute.addEventListener('click', () => { music.muted = !music.muted; syncPlayer(); });
volumeInput.addEventListener('input', () => {
  musicVolume = Number(volumeInput.value);
  cancelAnimationFrame(fadeFrame);
  if(wantPlaying) music.volume = musicVolume;
  if(musicVolume > 0) music.muted = false;
  try { localStorage.setItem('gargantua-volume', String(musicVolume)); } catch {}
  syncPlayer();
});
syncPlayer();

const controlsEl = panel.querySelector('#controls');
const controlDefs = [
  ['mass',null,1e6,1e10,1e6,v=>`${sci10(v,1)} M☉`,'log'],
  ['accretion',null,1e-6,1,1e-6,v=>`${sci10(v,1)} L_Edd`,'log'],
  ['spin',null,-.998,.998,.001,v=>v.toFixed(3)],
  ['inclination',null,2,178,.1,v=>`${v.toFixed(1)}°`],
  ['inner',null,1.05,9,.01,v=>`${v.toFixed(2)} r_g`],
  ['outer',null,5,28,.1,v=>`${v.toFixed(1)} r_g`],
  ['doppler',null,0,1.45,.01,v=>`${v.toFixed(2)}×`],
  ['diskBrightness',null,.15,2.4,.01,v=>`${v.toFixed(2)}×`],
  ['diskOpacity',null,.2,1,.01,v=>v.toFixed(2)],
  ['turbulence',null,0,1.8,.01,v=>`${v.toFixed(2)}×`],
  ['film',null,0,1,.01,v=>`${Math.round(v*100)}%`],
  ['haze',null,0,1.5,.01,v=>`${v.toFixed(2)}×`],
  ['bloom',null,0,1.5,.01,v=>`${v.toFixed(2)}×`],
  ['flare',null,0,1.5,.01,v=>`${v.toFixed(2)}×`],
  ['grain',null,0,1,.01,v=>`${v.toFixed(2)}×`],
  ['exposure',null,.3,2.0,.01,v=>`${v.toFixed(2)}×`],
  ['sky',null,0,1.6,.01,v=>`${v.toFixed(2)}×`],
  ['stars',null,0,2,.01,v=>`${v.toFixed(2)}×`],
  ['fov',null,12,75,.1,v=>`${v.toFixed(1)}°`],
  ['observer',null,4,140,.1,v=>`${v.toFixed(1)} r_g`],
  ['drift',null,0,1,.01,v=>`${v.toFixed(2)}×`],
  ['timeScale',null,0,3,.01,v=>`${v.toFixed(2)}×`],
  ['renderScale',null,.55,1.35,.05,v=>`${Math.round(v*100)}%`],
];

const inputs = {};
function toSliderValue(def, value){
  if(def[6] !== 'log') return value;
  const min=def[2], max=def[3];
  return (Math.log10(value)-Math.log10(min))/(Math.log10(max)-Math.log10(min))*1000;
}
function fromSliderValue(def, raw){
  if(def[6] !== 'log') return Number(raw);
  const min=def[2], max=def[3];
  const t=Number(raw)/1000;
  return 10**(Math.log10(min)+t*(Math.log10(max)-Math.log10(min)));
}

for(const def of controlDefs){
  const [key,label,min,max,step,fmt,mode] = def;
  const row=document.createElement('label');
  row.className='control';
  const sliderMin=mode==='log'?0:min;
  const sliderMax=mode==='log'?1000:max;
  const sliderStep=mode==='log'?1:step;
  row.innerHTML=`<span class="control-head"><span data-i18n="ctl.${key}"></span><output></output></span><input type="range" min="${sliderMin}" max="${sliderMax}" step="${sliderStep}">`;
  const input=row.querySelector('input');
  const out=row.querySelector('output');
  input.value=toSliderValue(def,state[key]);
  input.addEventListener('input',()=>{
    state[key]=fromSliderValue(def,input.value);
    if(key==='spin' && state.iscoLock) state.inner=iscoRadius(state.spin)*1.018;
    out.textContent=fmt(state[key]);
    applyState(key==='renderScale');
    syncInputs();
  });
  inputs[key]={input,out,def,row};
  controlsEl.appendChild(row);
}

function syncInputs(){
  for(const [key,obj] of Object.entries(inputs)){
    obj.input.value=toSliderValue(obj.def,state[key]);
    obj.out.textContent=obj.def[5](state[key]);
  }
  const lockInner=state.iscoLock||state.sci;
  inputs.inner.input.disabled=lockInner;
  inputs.inner.row.classList.toggle('disabled',lockInner);
  // Full physics replaces the artistic disk controls with real ones.
  for(const k of ['doppler','film','haze','diskOpacity','turbulence']){
    inputs[k].input.disabled=state.sci;
    inputs[k].row.classList.toggle('disabled',state.sci);
  }
  inputs.accretion.input.disabled=!state.sci;
  inputs.accretion.row.classList.toggle('disabled',!state.sci);
  const sciBox=panel.querySelector('#sciMode');
  if(sciBox) sciBox.checked=state.sci;
}

function setPreset(name){
  const presets={
    // As in the film (James et al. 2015, DNGR): a* = 0.6, camera just above the
    // disk plane, Doppler/beaming switched off so the disk stays symmetric.
    movie:{spin:.6,inclination:87.2,iscoLock:true,outer:24.0,doppler:0,diskBrightness:1.0,diskOpacity:.95,turbulence:1.0,bloom:.6,exposure:.85,sky:.5,fov:19.0,observer:66,renderScale:1,quality:'pro',film:1,haze:.6,flare:.35,grain:.35,letterbox:true,stars:1,drift:.15,skyMode:'procedural',sci:false},
    real:{spin:.94,inclination:77.0,iscoLock:true,outer:18.0,doppler:1.0,diskBrightness:.82,diskOpacity:.97,turbulence:.72,bloom:.32,exposure:.88,sky:.82,fov:31.5,observer:38,renderScale:1,quality:'pro',film:0,haze:0,flare:0,grain:0,letterbox:false,stars:1,drift:.1,skyMode:'procedural',sci:false},
    // DNGR paper's exact Gargantua camera, black sky with very distant stars.
    cinema:{spin:.6,inclination:86.57,iscoLock:true,outer:24.0,doppler:0,diskBrightness:1.0,diskOpacity:.96,turbulence:.95,bloom:.55,exposure:.88,sky:1,fov:17.0,observer:74.1,renderScale:1,quality:'pro',film:1,haze:.5,flare:.22,grain:.3,letterbox:true,stars:1,drift:.08,skyMode:'cinema',sci:false},
    // Full physics: Novikov–Thorne blackbody disk, exact Doppler + gravitational
    // redshift, limb darkening, RK4 geodesics, no artistic post effects.
    sci:{spin:.9,inclination:80.0,iscoLock:true,outer:20.0,doppler:1,diskBrightness:1.0,diskOpacity:1,turbulence:0,bloom:.3,exposure:1.0,sky:1,fov:32.0,observer:40,renderScale:1,quality:'pro',film:0,haze:0,flare:0,grain:0,letterbox:false,stars:1,drift:.08,skyMode:'cinema',sci:true,mass:6.5e9,accretion:1e-4},
    edge:{spin:.998,inclination:89.15,iscoLock:true,outer:17.0,doppler:1.05,diskBrightness:1.18,diskOpacity:.90,turbulence:1.15,bloom:.67,exposure:1.0,sky:.40,fov:28.8,observer:35,renderScale:1,quality:'ultra',film:.5,haze:.4,flare:.3,grain:.2,letterbox:false,stars:1,drift:.1,skyMode:'procedural',sci:false},
  };
  setCamMode('orbit');
  Object.assign(state,presets[name]);
  if(state.iscoLock) state.inner=iscoRadius(state.spin)*1.018;
  panel.querySelector('#iscoLock').checked=state.iscoLock;
  panel.querySelector('#quality').value=state.quality;
  panel.querySelector('#letterbox').checked=state.letterbox;
  panel.querySelector('#skyMode').value=state.skyMode;
  syncInputs();
  applyState(true);
  panel.querySelectorAll('[data-preset]').forEach(b=>b.classList.toggle('active',b.dataset.preset===name));
}

// ---------- Disk physics (SI) ----------
const SIGMA_SB=5.670374419e-8, C_LIGHT=299792458, G_NEWTON=6.6743e-11, M_SUN=1.98847e30, YEAR=3.15576e7;
const L_EDD_SUN=1.2572e31;          // W per solar mass (electron scattering, hydrogen)

/** a.b×10ⁿ formatting that reads the same in every language. */
function sci10(v,digits=2){
  if(!isFinite(v)||v<=0) return '0';
  const e=Math.floor(Math.log10(v)), m=v/10**e;
  const sup=String(e).replace(/-/g,'⁻').replace(/\d/g,d=>'⁰¹²³⁴⁵⁶⁷⁸⁹'[d]);
  return e===0?m.toFixed(digits):`${m.toFixed(digits)}×10${sup}`;
}

// Page & Thorne (1974) dimensionless flux, mirrored from the shader.
function ntFluxJS(r,a,risco){
  const x=Math.sqrt(r), x0=Math.sqrt(risco);
  if(x<=x0) return 0;
  const th=Math.acos(THREE.MathUtils.clamp(a,-1,1));
  const x1=2*Math.cos((th-Math.PI)/3), x2=2*Math.cos((th+Math.PI)/3), x3=-2*Math.cos(th/3);
  const term=(xi,xj,xk)=>Math.abs(xi)<1e-4?0:3*(xi-a)**2/(xi*(xi-xj)*(xi-xk))*Math.log((x-xi)/(x0-xi));
  const B=x-x0-1.5*a*Math.log(x/x0)-term(x1,x2,x3)-term(x2,x1,x3)-term(x3,x1,x2);
  return Math.max(B,0)/(x**4*(x**3-3*x+2*a));
}

// Same Planck × CIE ȳ integral as the shader (arbitrary but matching units).
function blackbodyY(T){
  let y=0;
  for(let i=0;i<24;i++){
    const lm=(380+(i+.5)*(400/24))*1e-3;
    const x=Math.min(14387.77/(lm*Math.max(T,1)),80);
    y+=CIE[i].y/(lm**5*(Math.exp(x)-1));
  }
  return y;
}

/** Thin-disk numbers for the current mass, spin and Eddington ratio. */
function diskPhysics(){
  const a=state.spin, risco=iscoRadius(a);
  const eff=1-Math.sqrt(1-2/(3*risco));           // radiative efficiency
  const L=state.accretion*L_EDD_SUN*state.mass;     // W
  const mdot=L/(eff*C_LIGHT*C_LIGHT);               // kg/s
  const rg=G_NEWTON*state.mass*M_SUN/(C_LIGHT*C_LIGHT);
  const Tscale=Math.pow(3*mdot*C_LIGHT*C_LIGHT/(8*Math.PI*SIGMA_SB*rg*rg),.25);
  let fmax=0;
  for(let i=1;i<=600;i++) fmax=Math.max(fmax,ntFluxJS(risco*(1+i*.01),a,risco));
  return {risco,eff,L,mdotSunYr:mdot*YEAR/M_SUN,Tscale,Tmax:Tscale*fmax**.25};
}

function applyState(needsResize=false){
  if(state.iscoLock) state.inner=iscoRadius(state.spin)*1.018;
  if(state.sci) state.inner=iscoRadius(state.spin);
  const rp=horizonRadius(state.spin);
  state.inner=Math.max(state.inner,rp+.035);
  state.outer=Math.max(state.outer,state.inner+.5);

  uniforms.uSpin.value=state.spin;
  uniforms.uInnerRadius.value=state.inner;
  uniforms.uOuterRadius.value=state.outer;
  uniforms.uDoppler.value=state.doppler;
  uniforms.uDiskBrightness.value=state.diskBrightness;
  uniforms.uDiskOpacity.value=state.diskOpacity;
  uniforms.uTurbulence.value=state.turbulence;
  uniforms.uExposure.value=state.exposure;
  uniforms.uSkyStrength.value=state.sky;
  uniforms.uFov.value=state.fov;
  uniforms.uStars.value=state.stars;
  uniforms.uSkyMode.value={procedural:0,photo:1,cinema:2}[state.skyMode]??0;

  const q=qualityModes[state.quality];
  uniforms.uMaxSteps.value=q.maxSteps;
  uniforms.uStepScale.value=q.stepScale;
  uniforms.uFilm.value=state.sci?0:state.film;
  uniforms.uHaze.value=state.sci?0:state.haze;
  const disk=diskPhysics();
  uniforms.uSci.value=state.sci?1:0;
  uniforms.uIsco.value=disk.risco;
  uniforms.uTscale.value=disk.Tscale;
  uniforms.uLumNorm.value=2.5*blackbodyY(disk.Tmax);
  bloom.strength=state.bloom;
  bloom.radius=.32+.16*state.film;
  bloom.threshold=.72;
  lensPass.uniforms.uFlare.value=state.flare;
  lensPass.uniforms.uChroma.value=.6*state.film;
  filmPass.uniforms.uGrain.value=state.grain;
  filmPass.uniforms.uLetterbox.value=state.letterbox?1:0;

  const rgKm=1.4766250385*state.mass;
  const rsKm=2*rgKm;
  const isco=iscoRadius(state.spin);
  const rplus=horizonRadius(state.spin);
  const km=(x)=>`${sci10(x,2)} km`;
  panel.querySelector('#physics').innerHTML=`
    <div><span>r<sub>g</sub> = GM/c²</span><b>${km(rgKm)}</b></div>
    <div><span>r<sub>s</sub> = 2GM/c²</span><b>${km(rsKm)}</b></div>
    <div><span>r<sub>+</sub> Kerr</span><b>${rplus.toFixed(3)} r<sub>g</sub></b></div>
    <div><span>r<sub>ISCO</sub></span><b>${isco.toFixed(3)} r<sub>g</sub></b></div>
    <div><span>a* = Jc/GM²</span><b>${state.spin.toFixed(3)}</b></div>
    <div><span>η = 1 − E<sub>ISCO</sub></span><b>${(disk.eff*100).toFixed(1)} %</b></div>
    ${state.sci?`
    <div><span>T<sub>max</sub> (Novikov–Thorne)</span><b>${sci10(disk.Tmax,2)} K</b></div>
    <div><span>L = λ<sub>Edd</sub> L<sub>Edd</sub></span><b>${sci10(disk.L,2)} W</b></div>
    <div><span>Ṁ</span><b>${sci10(disk.mdotSunYr,2)} M☉/yr</b></div>`:''}
  `;
  if(needsResize) resize();
}

panel.querySelector('#iscoLock').addEventListener('change',e=>{
  state.iscoLock=e.currentTarget.checked;
  if(state.iscoLock) state.inner=iscoRadius(state.spin)*1.018;
  syncInputs();
  applyState();
});
panel.querySelector('#sciMode').addEventListener('change',e=>{
  state.sci=e.currentTarget.checked;
  syncInputs();
  applyState();
  panel.querySelectorAll('[data-preset]').forEach(b=>b.classList.remove('active'));
});
panel.querySelector('#letterbox').addEventListener('change',e=>{
  state.letterbox=e.currentTarget.checked;
  applyState();
});
panel.querySelector('#skyMode').addEventListener('change',e=>{
  state.skyMode=e.currentTarget.value;
  applyState();
});
panel.querySelector('#quality').addEventListener('change',e=>{
  state.quality=e.currentTarget.value;
  applyState();
});
panel.querySelectorAll('[data-preset]').forEach(b=>b.addEventListener('click',()=>setPreset(b.dataset.preset)));

function syncPauseLabel(){ panel.querySelector('#pause').textContent=t(state.paused?'ui.resume':'ui.pause'); }
panel.querySelector('#pause').addEventListener('click',e=>{
  state.paused=!state.paused;
  syncPauseLabel();
});
panel.querySelector('#reset').addEventListener('click',()=>{
  state.azimuth=0;
  state.mass=100_000_000;
  setPreset('movie');
});

function setPanelVisible(visible){
  panel.hidden=!visible;
  player.hidden=!visible;
  appNav.hidden=!visible;
  showButton.hidden=visible;
}
panel.querySelector('#hideUi').addEventListener('click',()=>setPanelVisible(false));
showButton.addEventListener('click',()=>setPanelVisible(true));
addEventListener('keydown',e=>{
  if(e.repeat) return;
  const key=e.key.toLowerCase();
  if(key==='h') setPanelVisible(panel.hidden);
  if(key==='m') toggleMusic();
  if(key==='v') setCamMode(state.camMode==='orbit'?'fly':'orbit');
});

// ---------- 3D camera: orbit around Gargantua or fly freely ----------
const Z_UP=new THREE.Vector3(0,0,1);
const cam={
  // Smoothed orbit values (follow state.* with inertia).
  incl:state.inclination, dist:state.observer, az:state.azimuth,
  // Free-flight pose.
  pos:new THREE.Vector3(), yaw:Math.PI, pitch:0, vel:new THREE.Vector3(),
};
const keys=new Set();

function orbitPosition(incl,dist,az,out=new THREE.Vector3()){
  const th=THREE.MathUtils.degToRad(incl);
  return out.set(Math.sin(th)*Math.cos(az),Math.sin(th)*Math.sin(az),Math.cos(th)).multiplyScalar(dist);
}
function forwardFromYawPitch(yaw,pitch,out=new THREE.Vector3()){
  return out.set(Math.cos(pitch)*Math.cos(yaw),Math.cos(pitch)*Math.sin(yaw),Math.sin(pitch));
}
function setBasis(pos,fwd){
  const right=new THREE.Vector3().crossVectors(fwd,Z_UP);
  if(right.lengthSq()<1e-8) right.set(0,1,0);
  right.normalize();
  const up=new THREE.Vector3().crossVectors(right,fwd).normalize();
  uniforms.uCamPos.value.copy(pos);
  uniforms.uCamFwd.value.copy(fwd);
  uniforms.uCamRight.value.copy(right);
  uniforms.uCamUp.value.copy(up);
}

const camHelp=panel.querySelector('#camHelp');
function setCamMode(mode){
  if(mode===state.camMode && mode==='orbit'){ syncCamUi(); return; }
  if(mode==='fly'){
    orbitPosition(cam.incl,cam.dist,cam.az,cam.pos);
    const f=cam.pos.clone().negate().normalize();
    cam.yaw=Math.atan2(f.y,f.x);
    cam.pitch=Math.asin(THREE.MathUtils.clamp(f.z,-1,1));
    cam.vel.set(0,0,0);
  } else {
    const d=Math.max(cam.pos.length(),1e-3);
    state.observer=THREE.MathUtils.clamp(d,4,140);
    state.inclination=THREE.MathUtils.clamp(THREE.MathUtils.radToDeg(Math.acos(cam.pos.z/d)),2,178);
    state.azimuth=Math.atan2(cam.pos.y,cam.pos.x);
    cam.incl=state.inclination; cam.dist=state.observer; cam.az=state.azimuth;
    syncInputs();
  }
  state.camMode=mode;
  syncCamUi();
}
function syncCamUi(){
  panel.querySelectorAll('[data-cam]').forEach(b=>b.classList.toggle('active',b.dataset.cam===state.camMode));
  camHelp.innerHTML=t(state.camMode==='orbit'?'cam.helpOrbit':'cam.helpFly');
  for(const k of ['inclination','observer','drift']){
    inputs[k].input.disabled=state.camMode!=='orbit';
    inputs[k].row.classList.toggle('disabled',state.camMode!=='orbit');
  }
}
panel.querySelectorAll('[data-cam]').forEach(b=>b.addEventListener('click',()=>setCamMode(b.dataset.cam)));

let dragging=false,lastX=0,lastY=0;
renderer.domElement.addEventListener('pointerdown',e=>{
  dragging=true;lastX=e.clientX;lastY=e.clientY;renderer.domElement.setPointerCapture(e.pointerId);
});
renderer.domElement.addEventListener('pointermove',e=>{
  if(!dragging)return;
  const dx=e.clientX-lastX, dy=e.clientY-lastY;
  lastX=e.clientX;lastY=e.clientY;
  const k=state.fov/30;
  if(state.camMode==='orbit'){
    state.azimuth-=dx*.005*k;
    state.inclination=THREE.MathUtils.clamp(state.inclination-dy*.18*k,2,178);
  } else {
    cam.yaw-=dx*.0035*k;
    cam.pitch=THREE.MathUtils.clamp(cam.pitch+dy*.0035*k,-1.55,1.55);
  }
});
const endDrag=()=>{ if(dragging){ dragging=false; syncInputs(); } };
renderer.domElement.addEventListener('pointerup',endDrag);
renderer.domElement.addEventListener('pointercancel',endDrag);
renderer.domElement.addEventListener('wheel',e=>{
  e.preventDefault();
  if(state.camMode==='orbit' && !e.shiftKey){
    state.observer=THREE.MathUtils.clamp(state.observer*Math.exp(e.deltaY*.0012),4,140);
  } else {
    state.fov=THREE.MathUtils.clamp(state.fov+e.deltaY*.02,12,75);
    applyState();
  }
  syncInputs();
},{passive:false});

addEventListener('keydown',e=>{
  if(e.target instanceof HTMLSelectElement) return;
  if(state.camMode==='fly' && e.code==='Space') e.preventDefault();
  keys.add(e.code);
});
addEventListener('keyup',e=>keys.delete(e.code));
addEventListener('blur',()=>keys.clear());

const _f=new THREE.Vector3(), _r=new THREE.Vector3(), _p=new THREE.Vector3(), _m=new THREE.Vector3();
function updateCamera(dt){
  const rp=horizonRadius(state.spin);
  if(state.camMode==='orbit'){
    if(!dragging) state.azimuth+=state.drift*.06*dt;
    const t=1-Math.exp(-dt*6);
    cam.incl+=(state.inclination-cam.incl)*t;
    cam.dist+=(state.observer-cam.dist)*t;
    cam.az+=(state.azimuth-cam.az)*t;
    cam.dist=Math.max(cam.dist,rp+1.2);
    orbitPosition(cam.incl,cam.dist,cam.az,_p);
    setBasis(_p,_f.copy(_p).negate().normalize());
  } else {
    forwardFromYawPitch(cam.yaw,cam.pitch,_f);
    _r.crossVectors(_f,Z_UP).normalize();
    _m.set(0,0,0);
    if(keys.has('KeyW')||keys.has('ArrowUp')) _m.add(_f);
    if(keys.has('KeyS')||keys.has('ArrowDown')) _m.sub(_f);
    if(keys.has('KeyD')||keys.has('ArrowRight')) _m.add(_r);
    if(keys.has('KeyA')||keys.has('ArrowLeft')) _m.sub(_r);
    if(keys.has('KeyE')||keys.has('Space')) _m.add(Z_UP);
    if(keys.has('KeyQ')||keys.has('KeyC')) _m.sub(Z_UP);
    // Speed scales with distance so the approach feels the same at any range.
    const speed=Math.max(.8,cam.pos.length()*.45)*((keys.has('ShiftLeft')||keys.has('ShiftRight'))?3.5:1);
    if(_m.lengthSq()>0) _m.normalize().multiplyScalar(speed);
    cam.vel.lerp(_m,1-Math.exp(-dt*5));
    cam.pos.addScaledVector(cam.vel,dt);
    const d=cam.pos.length(), minD=rp+1.2;
    if(d<minD) cam.pos.multiplyScalar(minD/Math.max(d,1e-4));
    if(d>400) cam.pos.multiplyScalar(400/d);
    setBasis(cam.pos,_f);
  }
}

const tmpSize=new THREE.Vector2();
function resize(){
  const dpr=Math.min(devicePixelRatio||1,2.0)*state.renderScale;
  renderer.setPixelRatio(dpr);
  renderer.setSize(innerWidth,innerHeight,false);
  composer.setPixelRatio(dpr);
  composer.setSize(innerWidth,innerHeight);
  renderer.getDrawingBufferSize(tmpSize);
  uniforms.uResolution.value.copy(tmpSize);
  setPostSize(tmpSize.x,tmpSize.y);
}
addEventListener('resize',resize);

async function capture4K(){
  const btn=panel.querySelector('#shot');
  if(btn.disabled)return;
  btn.disabled=true; btn.textContent=t('ui.rendering');
  const wasPaused=state.paused; state.paused=true;
  const oldScale=state.renderScale;
  const oldQuality=state.quality;
  try{
    // 4K output; Pro quality is used to avoid pathological GPU times on Ultra.
    state.quality='pro'; applyState();
    renderer.setPixelRatio(1);
    renderer.setSize(3840,2160,false);
    composer.setPixelRatio(1);
    composer.setSize(3840,2160);
    uniforms.uResolution.value.set(3840,2160);
    setPostSize(3840,2160);
    composer.render();
    await new Promise(resolve=>renderer.domElement.toBlob(blob=>{
      if(blob){
        const a=document.createElement('a');
        a.href=URL.createObjectURL(blob);
        a.download=`gargantua-kerr-${Date.now()}-4k.png`;
        a.click();
        setTimeout(()=>URL.revokeObjectURL(a.href),1000);
      }
      resolve();
    },'image/png'));
  } finally {
    state.renderScale=oldScale;
    state.quality=oldQuality;
    state.paused=wasPaused;
    panel.querySelector('#quality').value=state.quality;
    syncInputs();applyState(true);
    btn.disabled=false;btn.textContent=t('ui.shot');
  }
}
panel.querySelector('#shot').addEventListener('click',capture4K);

syncInputs();
setPreset('movie');
syncCamUi();
function relabel(){
  applyI18n(document);
  syncPauseLabel();
  syncCamUi();
  syncPlayer();
}
relabel();
onLangChange(relabel);

/** Called by the start screen when the user chose "enter with music". */
export function playMusic(){
  // "Enter with music" should be audible even if the last saved volume was 0.
  if(musicVolume < .05){
    musicVolume = .6;
    try { localStorage.setItem('gargantua-volume', String(musicVolume)); } catch {}
  }
  music.muted = false;
  if(!wantPlaying) toggleMusic();
}

// Start a little off-pose so the camera glides into the opening shot.
cam.dist=state.observer*1.8; cam.incl=state.inclination-8; cam.az=state.azimuth-.5;
resize();

let last=performance.now();
function tick(now){
  requestAnimationFrame(tick);
  const dt=Math.min((now-last)/1000,.05);last=now;
  if(!state.paused) uniforms.uTime.value += dt*state.timeScale;
  updateCamera(dt);
  filmPass.uniforms.uTime.value = now/1000;
  composer.render();
}
requestAnimationFrame(tick);
