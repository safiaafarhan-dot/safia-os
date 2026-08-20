import React, { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { scrollState } from '../state/scrollStore'
import { cursorField } from './cursorFieldState'
import { safeZone } from './safeZone'

/**
 * LUMINOUS PARTICLES AND ENERGY TRAILS — the midground.
 *
 * Between the glass shards near the lens and the galaxies far out there was
 * nothing carrying light, so the middle distance of the early sections was
 * empty space with a gradient behind it. This fills it with motes that travel
 * on slow curved paths, each dragging a short comet trail.
 *
 * THE TRAIL IS THE POINT, and it is why this is a line layer rather than more
 * points. A dot moving through space reads as a speck; a dot with a tail reads
 * as a thing with a direction and a speed. That single cue is most of the
 * difference between "particles" and "energy".
 *
 * Everything is computed in the vertex shader from a handful of uniforms, so
 * several hundred trails cost two draw calls and no per-frame array writes.
 * The head and tail of each segment share an index and differ only by a
 * per-vertex `aEnd` flag, which is what lets one buffer describe both.
 *
 * KEEPING OUT OF THE TEXT is done differently here to everywhere else. The
 * other layers reposition each object on the CPU against the measured reading
 * column; doing that for this many segments would put the cost back. Instead
 * the shader fades a mote out as it crosses the column — additive light dimming
 * to nothing over the text rather than a solid object sliding aside. For a
 * layer that is pure glow, dimming IS the correct behaviour: there is no
 * silhouette to preserve.
 */

const vertexShader = /* glsl */ `
  attribute float aSeed;
  attribute float aEnd;

  uniform float uTime;
  uniform float uFade;
  uniform vec3 uCursor;
  uniform float uDwell;
  uniform float uLeft;
  uniform float uRight;
  uniform float uCamZ;

  varying vec3 vTint;
  varying float vAlpha;

  // Cyan, soft blue, violet, and a rare crimson. Chosen in the shader from the
  // seed so the palette costs nothing to store.
  vec3 tintFor(float s) {
    if (s > 0.93) return vec3(0.94, 0.30, 0.42);
    if (s > 0.72) return vec3(0.66, 0.45, 0.94);
    if (s > 0.40) return vec3(0.42, 0.66, 1.00);
    return vec3(0.36, 0.84, 0.96);
  }

  // Position of a mote at a given time. Sampling this twice - once at t and
  // once slightly earlier - is what produces the trail, so the tail always
  // lies exactly along the path the mote actually travelled.
  vec3 pathAt(float s, float t) {
    float radius = 14.0 + fract(s * 71.3) * 44.0;
    float rate = 0.05 + fract(s * 13.7) * 0.16;
    float ang = s * 62.8 + t * rate;
    float ySwing = (fract(s * 37.1) - 0.5) * 34.0;
    float slab = 190.0;
    float travel = fract(fract(s * 91.7) + t * (0.006 + fract(s * 7.3) * 0.014));

    return vec3(
      cos(ang) * radius,
      sin(ang * 1.3) * radius * 0.34 + ySwing,
      uCamZ - slab + travel * slab
    );
  }

  void main() {
    float s = aSeed;
    vec3 head = pathAt(s, uTime);
    // Trail length grows with charge: resting the cursor makes the whole field
    // streak, which reads as the environment energising.
    float tail = (0.35 + fract(s * 29.3) * 0.5) + uDwell * 1.3;
    vec3 pos = mix(head, pathAt(s, uTime - tail), aEnd);

    // LOCAL CURSOR RESPONSE. Only motes inside the field's radius are pulled,
    // and they swing around the cursor rather than at it.
    float d = distance(pos, uCursor);
    float inf = smoothstep(30.0, 0.0, d) * uDwell;
    pos.y += inf * 5.0;
    pos.xz += normalize(pos.xz - uCursor.xz + 0.001) * inf * 3.5;

    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mv;

    vTint = tintFor(fract(s * 53.9));

    // Fade across the reading column. See the note above: this layer is pure
    // additive light, so dimming over the text is the right kind of clearance.
    float ndcX = gl_Position.x / max(gl_Position.w, 0.001);
    // Distance out of the column, measured against whichever edge is nearer.
    float outside = max(uLeft - ndcX, ndcX - uRight);
    float clear = smoothstep(-0.06, 0.16, outside);

    // Head bright, tail gone: a hard gradient along the segment is what makes
    // it read as motion blur instead of as a drawn line.
    float alongTrail = 1.0 - aEnd;
    float depthFade = smoothstep(200.0, 30.0, -mv.z);
    vAlpha = alongTrail * alongTrail * depthFade * uFade * clear * (0.5 + inf * 1.6);
  }
`

const fragmentShader = /* glsl */ `
  varying vec3 vTint;
  varying float vAlpha;
  void main() {
    // Also over-driven so the heads of the trails bloom. A trail that does
    // not glow is just a scratch on the frame.
    gl_FragColor = vec4(vTint * 1.6, vAlpha * 0.5);
  }
`

export default function EnergyField({ count = 260, reducedMotion = false }) {
  const matRef = useRef()

  const { geometry, uniforms } = useMemo(() => {
    const geo = new THREE.BufferGeometry()
    // Two vertices per mote: head and tail of one segment.
    const positions = new Float32Array(count * 2 * 3)
    const seeds = new Float32Array(count * 2)
    const ends = new Float32Array(count * 2)
    for (let i = 0; i < count; i++) {
      // Golden-ratio stride rather than random: evenly spread seeds mean the
      // motes distribute instead of clumping into visible bands.
      const s = (i * 0.6180339887) % 1
      seeds[i * 2] = s
      seeds[i * 2 + 1] = s
      ends[i * 2] = 0
      ends[i * 2 + 1] = 1
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1))
    geo.setAttribute('aEnd', new THREE.BufferAttribute(ends, 1))

    return {
      geometry: geo,
      uniforms: {
        uTime: { value: 0 },
        uFade: { value: 0 },
        uCursor: { value: new THREE.Vector3() },
        uDwell: { value: 0 },
        uLeft: { value: -0.3 },
        uRight: { value: 0.3 },
        uCamZ: { value: 0 },
      },
    }
  }, [count])

  useFrame((state) => {
    const m = matRef.current
    if (!m) return
    const { time, station, energy } = scrollState()
    const u = m.uniforms

    // Strongest through the first three sections, thinning as the matter band
    // takes over -- but never to zero, so the middle keeps a little light
    // travelling through it.
    const early = 1 - THREE.MathUtils.smoothstep(station, 2.6, 4.2)
    u.uFade.value = 0.35 + early * 0.65 + energy * 0.2
    u.uTime.value = time
    u.uCamZ.value = state.camera.position.z
    u.uLeft.value = safeZone.left
    u.uRight.value = safeZone.right
    u.uDwell.value = reducedMotion ? 0 : cursorField.dwell
    u.uCursor.value.copy(cursorField.position)
  })

  return (
    <lineSegments geometry={geometry} frustumCulled={false} renderOrder={-200}>
      <shaderMaterial
        ref={matRef}
        uniforms={uniforms}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        fog={false}
      />
    </lineSegments>
  )
}
