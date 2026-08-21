import React, { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { scrollState } from '../state/scrollStore'
import { artifactState } from './artifactState'
import { STATIONS } from './stations'

/**
 * EMBERS FROM THE BREAK.
 *
 * When a transit's shell fractures at the lens it now throws hot debris, and
 * the debris behaves like debris: it leaves fast, it is slowed by the medium it
 * is travelling through, it is pulled off course by turbulence, it cools from
 * white through the station's accent to nothing, and it goes out. Then there is
 * none of it until the next break.
 *
 * WHY IT EXISTS. The cut had a flash and now a shockwave — two things that
 * happen to the IMAGE. Neither of them is matter. A shell that comes apart at
 * the camera and leaves nothing behind reads as a transition effect; one that
 * throws pieces past the lens reads as an object that broke. That is the whole
 * argument for this layer, and it is why the sparks are emitted at the
 * artifact's own moment rather than on a timer of their own.
 *
 * ---------------------------------------------------------------- the physics
 *
 * Every particle is a closed-form function of its seed and one clock. Nothing
 * is integrated on the CPU and no attribute is ever rewritten after upload —
 * the entire burst costs one uniform per frame, which is the same discipline
 * the dust field runs on and the reason a few hundred embers are free.
 *
 * Position under linear drag has an exact solution, so the shader uses it
 * rather than an Euler step:
 *
 *     v(t) = v0·e^(-kt)
 *     p(t) = (v0/k)·(1 - e^(-kt))
 *
 * That is what makes them decelerate properly — a burst that travels at
 * constant speed reads as a starfield wipe, and one that is faded out while
 * still moving fast reads as a texture being cross-dissolved. Real debris
 * covers most of its distance immediately and then hangs, and the exponential
 * gives that for one exp() per vertex.
 *
 * Gravity is a slow constant pull applied on top, and a little curl-ish
 * turbulence keeps the front from being a clean sphere — a perfectly radial
 * burst is the single most obvious tell of a particle system.
 *
 * ------------------------------------------------------------------ restraint
 *
 * It is COLD by default and only ever briefly hot. The count is small, the
 * lifetime is short, and the whole thing is additive-blended at low alpha, so
 * it cannot become the "random particle spam" the brief rules out. It also
 * yields to nothing else — by the time the next section's content is being
 * read, every ember is gone.
 */

const sparkVertex = /* glsl */ `
  attribute vec3 aDir;
  attribute float aSpeed;
  attribute float aSize;
  attribute float aLife;
  attribute float aSeed;

  uniform float uAge;      // seconds since the burst
  uniform float uDrag;
  uniform float uGravity;
  uniform float uSpread;

  varying float vFade;
  varying float vHeat;

  void main() {
    // Normalised age. Past 1 the particle is dead and is collapsed to a point
    // behind the camera rather than being drawn.
    float life = aLife;
    float t = uAge / life;
    if (t >= 1.0 || uAge <= 0.0) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      gl_PointSize = 0.0;
      vFade = 0.0;
      vHeat = 0.0;
      return;
    }

    // Closed-form travel under linear drag.
    float k = uDrag;
    float travel = (aSpeed / k) * (1.0 - exp(-k * uAge));
    vec3 p = aDir * travel * uSpread;

    // A slow pull, so the field sags rather than staying a clean shell.
    p.y -= uGravity * uAge * uAge * 0.5;

    // Turbulence. Three cheap sines at unrelated rates, scaled by how far the
    // particle has already travelled so the deflection grows with distance
    // rather than jittering at the source.
    float w = travel * 0.06;
    p.x += sin(aSeed * 6.283 + uAge * 1.7) * w;
    p.y += sin(aSeed * 11.13 + uAge * 1.1) * w * 0.8;
    p.z += cos(aSeed * 8.71 + uAge * 1.4) * w;

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;

    // Fade: a fast ignition and a long tail, so they arrive as a burst and
    // leave as an ember rather than both ends being symmetric.
    vFade = smoothstep(0.0, 0.04, t) * pow(1.0 - t, 1.8);
    // Heat falls faster than brightness — the classic ember curve. White at
    // the instant of the break, the station's accent a moment later, dark
    // before it disappears.
    vHeat = pow(1.0 - t, 3.4);

    // Perspective sizing, clamped so a near particle cannot become a slab.
    gl_PointSize = clamp(aSize * (1.0 + vHeat * 1.6) * (60.0 / -mv.z), 1.0, 26.0);
  }
`

const sparkFragment = /* glsl */ `
  uniform vec3 uHot;
  uniform vec3 uCool;
  uniform float uOpacity;

  varying float vFade;
  varying float vHeat;

  void main() {
    if (vFade <= 0.001) discard;
    vec2 uv = gl_PointCoord - 0.5;
    float d = length(uv);
    if (d > 0.5) discard;
    // A tight core with a soft skirt. The skirt is what the bloom pass catches
    // and turns into an actual light rather than a dot.
    float core = smoothstep(0.30, 0.0, d);
    float skirt = smoothstep(0.5, 0.0, d) * 0.35;
    vec3 col = mix(uCool, uHot, vHeat);
    gl_FragColor = vec4(col, (core + skirt) * vFade * uOpacity);
  }
`

/** Ember lifetime ceiling, in seconds. Short on purpose. */
const MAX_LIFE = 2.2

export default function Sparks({ count = 260, reducedMotion = false }) {
  const matRef = useRef()
  const groupRef = useRef()
  /** Seconds since the last break, or null when nothing is burning. */
  const age = useRef(null)
  /** Which boundary the current burst belongs to. One burst per transit. */
  const burstFor = useRef(0)
  const colour = useMemo(() => new THREE.Color('#ff8a5c'), [])
  const next = useMemo(() => new THREE.Color(), [])

  const geo = useMemo(() => {
    const dir = new Float32Array(count * 3)
    const pos = new Float32Array(count * 3)
    const speed = new Float32Array(count)
    const size = new Float32Array(count)
    const life = new Float32Array(count)
    const seed = new Float32Array(count)

    for (let i = 0; i < count; i++) {
      // Even distribution on a sphere. Sampling angles independently clusters
      // at the poles, which reads as two visible jets rather than a burst.
      const u = Math.random() * 2 - 1
      const phi = Math.random() * Math.PI * 2
      const r = Math.sqrt(Math.max(0, 1 - u * u))
      dir[i * 3] = r * Math.cos(phi)
      dir[i * 3 + 1] = r * Math.sin(phi)
      dir[i * 3 + 2] = u
      // Biased toward the camera, because the shell breaks AT the lens and
      // what sells that is debris coming past the viewer rather than a
      // symmetric ball receding.
      dir[i * 3 + 2] = u * 0.6 + 0.55

      // Wide speed spread: a burst where everything travels at the same rate
      // reads as an expanding shell, not as fragments of different masses.
      speed[i] = 6 + Math.pow(Math.random(), 2) * 46
      size[i] = 0.5 + Math.random() * 1.9
      life[i] = 0.5 + Math.random() * (MAX_LIFE - 0.5)
      seed[i] = Math.random()
    }

    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('aDir', new THREE.BufferAttribute(dir, 3))
    g.setAttribute('aSpeed', new THREE.BufferAttribute(speed, 1))
    g.setAttribute('aSize', new THREE.BufferAttribute(size, 1))
    g.setAttribute('aLife', new THREE.BufferAttribute(life, 1))
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1))
    // Never culled: every particle sits at the origin in object space, so the
    // computed bounding sphere is a point and the whole burst would vanish the
    // moment that point left the frustum.
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 400)
    return g
  }, [count])

  const uniforms = useMemo(
    () => ({
      uAge: { value: -1 },
      uDrag: { value: 1.35 },
      uGravity: { value: 1.1 },
      uSpread: { value: 1 },
      uHot: { value: new THREE.Color('#fff4e2') },
      uCool: { value: new THREE.Color('#ff6a3c') },
      uOpacity: { value: 0.85 },
    }),
    []
  )

  useFrame((state, delta) => {
    const g = groupRef.current
    const mat = matRef.current
    if (!g || !mat) return
    const s = scrollState()

    if (reducedMotion) {
      g.visible = false
      return
    }

    // ONE BURST PER BOUNDARY, TRIGGERED BY THE BREAK.
    //
    // `justCracked` alone is the wrong trigger, and this is worth spelling out
    // because it looks like the right one. It is an AUDIO edge: it fires every
    // time the fracture value takes a step up, on a 0.11s cooldown, because
    // glass coming apart crackles progressively rather than once. Driving the
    // debris from it restarted the burst about ten times across a single
    // fracture, which reads as a stutter rather than an explosion — the embers
    // never got past their first tenth of a second of travel.
    //
    // Gating on the transit id as well gives exactly one burst per boundary,
    // and makes it idempotent under scrubbing: crossing the same boundary back
    // and forth cannot re-fire it, and crossing at speed still gets it.
    if (artifactState.justCracked && artifactState.transit !== burstFor.current) {
      burstFor.current = artifactState.transit
      age.current = 0
      // Seat the burst at the camera and orient it to the view, so the debris
      // comes past the lens the way the shell that made it did. It is parented
      // to nothing and re-seated per burst rather than tracked every frame:
      // embers that follow the camera are not embers, they are a HUD.
      g.position.copy(state.camera.position)
      g.quaternion.copy(state.camera.quaternion)

      // The debris carries the colour of the station being arrived at, so it
      // belongs to the same handover the transit and the shockwave do.
      const at = Math.max(0, Math.min(STATIONS.length - 1, artifactState.transit))
      next.set(STATIONS[at].mood.accent)
      colour.lerp(next, 1)
      mat.uniforms.uCool.value.copy(colour)
    }

    if (age.current === null) {
      g.visible = false
      return
    }

    age.current += delta
    if (age.current > MAX_LIFE) {
      // Released once the burst is spent, so the NEXT approach to this same
      // boundary can burn again — scrubbing back and forth over a whole
      // section should not permanently disarm its cut.
      burstFor.current = 0
      age.current = null
      g.visible = false
      return
    }

    g.visible = true
    mat.uniforms.uAge.value = age.current
    // Travelling fast throws the debris further — the shell had more momentum
    // to give it.
    mat.uniforms.uSpread.value = 1 + Math.min(1, Math.abs(s.flow)) * 0.5
  })

  return (
    <group ref={groupRef} visible={false}>
      <points frustumCulled={false} geometry={geo}>
        <shaderMaterial
          ref={matRef}
          uniforms={uniforms}
          vertexShader={sparkVertex}
          fragmentShader={sparkFragment}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          fog={false}
        />
      </points>
    </group>
  )
}
