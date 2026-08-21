import React, { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { ignitionAt, scrollState } from '../state/scrollStore'
import { chargedInfluenceAt, cursorField } from './cursorFieldState'
import { safeZone } from './safeZone'

/**
 * THE COMPUTATIONAL LAYER — where the AI/ML identity actually lives.
 *
 * The brief is explicit that intelligence must be FELT, not illustrated: no
 * brain icons, no circuit boards, no floating code. So nothing here draws a
 * picture of a neural network. It runs one, badly, in public, and lets you
 * watch.
 *
 * Four behaviours carry the read, and they are the whole reason this is a
 * separate system rather than more particles in EnergyField:
 *
 *   1. CLUSTERING. Nodes belong to feature clusters whose centroids drift on
 *      their own slow orbits. Points are not scattered — they are ORGANISED,
 *      and the organisation is visibly the thing holding them together.
 *
 *   2. REORGANISATION (= learning). Every few seconds one node is reassigned
 *      to a different cluster and travels there over a couple of seconds. A
 *      static graph reads as a diagram; a graph that keeps revising itself
 *      reads as a process that has not finished thinking.
 *
 *   3. CONNECTION FORMATION. Edges are not authored. They are recomputed from
 *      proximity every few frames, so they appear as nodes drift together and
 *      dissolve as they part. Structure emerges from the data's own layout —
 *      which is the actual claim being made about the person whose site this
 *      is.
 *
 *   4. INFERENCE PULSES. Periodically a wavefront enters at one node and
 *      propagates outward along the edges, hop by hop, lighting each node as
 *      it arrives. This is the single most important cue in the file. A field
 *      that merely glows is decoration; a field where energy demonstrably
 *      TRAVELS THROUGH A TOPOLOGY is computation, and the eye reads the
 *      difference immediately even when it cannot name it.
 *
 * WHY THE PULSE IS BREADTH-FIRST and not a path walk: inference through a
 * layer is fan-out, not a line. A single travelling dot reads as a signal on a
 * wire — one thing moving. A wavefront expanding across a whole neighbourhood
 * reads as activation spreading through a network, which is what is meant.
 *
 * COST. Node count is small on purpose (≈90 at the top tier) because these
 * have to be individually legible — a thousand of them is dust, and dust is
 * what the rest of the world is already made of. Positions integrate on the
 * CPU, which at this count is nothing, and the edge rebuild is amortised
 * across frames rather than run every one.
 */

/** Feature clusters. Few enough that each stays legible as a group. */
const CLUSTERS = 5
/** Edges are capped hard: past this the field reads as a mesh, not a graph. */
const MAX_LINKS = 150
/** Frames between edge rebuilds. Proximity does not change fast enough to care. */
const REBUILD_EVERY = 6
/** Seconds between inference pulses. */
const PULSE_PERIOD = 5.5
/** Seconds a pulse takes to cross one hop. */
const HOP_TIME = 0.13
/** Seconds between cluster reassignments. */
const REASSIGN_PERIOD = 3.4


/* ------------------------------------------------------------------ nodes -- */

const nodeVertex = /* glsl */ `
  attribute float aAct;
  attribute float aSize;

  uniform float uFade;
  uniform float uLeft;
  uniform float uRight;
  uniform float uPixelRatio;

  varying float vAct;
  varying float vAlpha;

  void main() {
    vAct = aAct;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;

    // Activated nodes are physically larger, not just brighter. Scale is a
    // far stronger signal than luminance at this size on screen.
    float size = aSize * (1.0 + aAct * 1.9);
    gl_PointSize = size * uPixelRatio * (300.0 / max(-mv.z, 1.0));

    // Fade across the reading column rather than dodging it. These are small
    // additive lights with no silhouette to preserve, so dimming is the
    // correct clearance -- and a node sliding sideways to avoid text would
    // break the cluster it belongs to, which is the one thing that must stay
    // readable.
    float ndcX = gl_Position.x / max(gl_Position.w, 0.001);
    float outside = max(uLeft - ndcX, ndcX - uRight);
    float clear = smoothstep(-0.05, 0.20, outside);

    float depthFade = smoothstep(190.0, 24.0, -mv.z);
    vAlpha = uFade * clear * depthFade;
  }
`

const nodeFragment = /* glsl */ `
  uniform vec3 uIdle;
  uniform vec3 uHot;

  varying float vAct;
  varying float vAlpha;

  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float r = length(uv) * 2.0;
    if (r > 1.0) discard;

    // Two-part falloff: a tight core that survives bloom thresholding, and a
    // wide soft halo. One gaussian alone gives a fuzzy blob with no centre,
    // which is what makes a point field read as dust rather than as a set of
    // discrete things.
    float core = smoothstep(0.42, 0.0, r);
    float halo = smoothstep(1.0, 0.0, r);
    halo *= halo;

    vec3 tint = mix(uIdle, uHot, vAct);
    float energy = core * (0.85 + vAct * 2.6) + halo * (0.22 + vAct * 0.7);

    gl_FragColor = vec4(tint * (1.0 + vAct * 1.5), energy * vAlpha);
  }
`

/* ------------------------------------------------------------------ edges -- */

const linkVertex = /* glsl */ `
  attribute float aAct;

  uniform float uFade;
  uniform float uLeft;
  uniform float uRight;

  varying float vAct;
  varying float vAlpha;

  void main() {
    vAct = aAct;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;

    float ndcX = gl_Position.x / max(gl_Position.w, 0.001);
    float outside = max(uLeft - ndcX, ndcX - uRight);
    float clear = smoothstep(-0.05, 0.20, outside);

    float depthFade = smoothstep(190.0, 24.0, -mv.z);
    vAlpha = uFade * clear * depthFade;
  }
`

const linkFragment = /* glsl */ `
  uniform vec3 uIdle;
  uniform vec3 uHot;

  varying float vAct;
  varying float vAlpha;

  void main() {
    // Dormant edges sit just above black -- present enough that the topology
    // is readable, dim enough that the lit ones are an event. The whole
    // network being visible at full strength would leave a pulse nowhere to go.
    vec3 tint = mix(uIdle, uHot, vAct);
    float energy = 0.13 + vAct * 1.5;
    gl_FragColor = vec4(tint * (0.8 + vAct * 1.8), energy * vAlpha);
  }
`

export default function NeuralField({ count = 90, reducedMotion = false }) {
  const groupRef = useRef()
  const pointsRef = useRef()
  // Uniforms are written through the MATERIAL, never through the object handed
  // to the `uniforms` prop. R3F rebinds that prop when it constructs the
  // material, so the closure copy stops being the one the shader reads --
  // which renders as a field that integrates perfectly and draws nothing.
  // EnergyField already writes through a ref for the same reason.
  const nodeMatRef = useRef()
  const linkMatRef = useRef()


  const scratch = useMemo(() => new THREE.Vector3(), [])

  const frame = useRef(0)
  const lastPulse = useRef(-999)
  const lastReassign = useRef(0)
  const linkCount = useRef(0)

  /* ---- the network ---------------------------------------------------- */
  const net = useMemo(() => {
    // Live position, and the home the node springs toward. Kept apart so the
    // cursor and the pulse can displace a node without destroying where it
    // belongs -- it has somewhere to settle back to.
    const pos = new Float32Array(count * 3)
    const home = new Float32Array(count * 3)
    const vel = new Float32Array(count * 3)
    const cluster = new Int32Array(count)
    const act = new Float32Array(count)
    const hop = new Int32Array(count)
    const size = new Float32Array(count)
    // Local offset from the node's cluster centroid.
    const local = new Float32Array(count * 3)
    const phase = new Float32Array(count)

    for (let i = 0; i < count; i++) {
      const c = i % CLUSTERS
      cluster[i] = c
      hop[i] = -1

      // Offsets inside a cluster are drawn from a shell rather than a solid
      // ball, so clusters read as structures with an interior instead of as
      // blobs that are densest in the middle.
      const u = Math.random() * Math.PI * 2
      const v = Math.acos(2 * Math.random() - 1)
      const r = 2.6 + Math.pow(Math.random(), 0.6) * 3.4
      local[i * 3] = Math.sin(v) * Math.cos(u) * r
      local[i * 3 + 1] = Math.sin(v) * Math.sin(u) * r * 0.78
      local[i * 3 + 2] = Math.cos(v) * r

      size[i] = 2.2 + Math.pow(Math.random(), 2.2) * 4.6
      phase[i] = Math.random() * Math.PI * 2
    }

    // Adjacency, rebuilt with the edges. Flat arrays rather than arrays of
    // arrays so the pulse's breadth-first walk allocates nothing.
    const adjStart = new Int32Array(count + 1)
    const adjList = new Int32Array(MAX_LINKS * 2)
    const degree = new Int32Array(count)
    const queue = new Int32Array(count)

    return { pos, home, vel, cluster, act, hop, size, local, phase, adjStart, adjList, degree, queue }
  }, [count])

  /* ---- cluster centroids ---------------------------------------------- */
  const centroids = useMemo(
    () =>
      Array.from({ length: CLUSTERS }, (_, i) => ({
        // Each centroid rides its own slow ellipse. Different rates mean the
        // clusters drift past one another and the proximity graph genuinely
        // changes, rather than the whole assembly rotating as one rigid piece.
        radius: 7.5 + (i % 3) * 3.4,
        rate: 0.055 + (i % 4) * 0.021,
        tilt: (i / CLUSTERS) * Math.PI * 2,
        yRate: 0.037 + (i % 3) * 0.014,
        ySwing: 3.2 + (i % 2) * 2.4,
        zBias: (i - (CLUSTERS - 1) / 2) * 5.2,
      })),
    []
  )

  /* ---- buffers --------------------------------------------------------- */
  const { nodeGeometry, nodeUniforms, linkGeometry, linkUniforms } = useMemo(() => {
    const nodes = new THREE.BufferGeometry()
    nodes.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3))
    nodes.setAttribute('aAct', new THREE.BufferAttribute(new Float32Array(count), 1))
    nodes.setAttribute('aSize', new THREE.BufferAttribute(net.size, 1))
    // Frustum culling is computed from a bounding sphere that would need
    // recomputing every frame; the field is small and always near the camera,
    // so the test is not worth its own upkeep.
    nodes.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6)

    const links = new THREE.BufferGeometry()
    links.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_LINKS * 2 * 3), 3))
    links.setAttribute('aAct', new THREE.BufferAttribute(new Float32Array(MAX_LINKS * 2), 1))
    links.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6)

    const shared = () => ({
      uFade: { value: 0 },
      uLeft: { value: -0.4 },
      uRight: { value: 0.4 },
      uIdle: { value: new THREE.Color('#2f7fd8') },
      uHot: { value: new THREE.Color('#8ff0ff') },
    })

    return {
      nodeGeometry: nodes,
      linkGeometry: links,
      nodeUniforms: {
        ...shared(),
        uPixelRatio: { value: Math.min(2, typeof window === 'undefined' ? 1 : window.devicePixelRatio) },
      },
      linkUniforms: shared(),
    }
  }, [count, net.size])

  // Edge endpoints, reused across rebuilds.
  const edges = useMemo(() => new Int32Array(MAX_LINKS * 2), [])

  /* ---- edge formation --------------------------------------------------- */
  /**
   * Recompute edges from current proximity.
   *
   * Deliberately O(n^2) over a small n. A spatial index would be the textbook
   * answer, but at 90 nodes the brute-force pass is a few thousand distance
   * checks once every six frames — far cheaper than maintaining a grid, and
   * with none of the bugs.
   */
  const rebuildEdges = () => {
    const { pos, cluster, degree, adjStart, adjList } = net
    let n = 0
    degree.fill(0)

    for (let i = 0; i < count && n < MAX_LINKS; i++) {
      const ix = pos[i * 3]
      const iy = pos[i * 3 + 1]
      const iz = pos[i * 3 + 2]

      for (let j = i + 1; j < count && n < MAX_LINKS; j++) {
        const sameCluster = cluster[i] === cluster[j]
        // Intra-cluster links form readily; bridges between clusters only form
        // when two nodes are genuinely close. That asymmetry is what keeps
        // clusters distinguishable while still letting a pulse cross between
        // them -- a graph of five disconnected islands would stop every
        // wavefront at its own island's edge.
        const reach = sameCluster ? 5.0 : 3.1
        const dx = ix - pos[j * 3]
        const dy = iy - pos[j * 3 + 1]
        const dz = iz - pos[j * 3 + 2]
        const d2 = dx * dx + dy * dy + dz * dz
        if (d2 > reach * reach) continue

        // Degree cap. Without it the densest cluster eats the entire link
        // budget and the other four render as loose points.
        if (degree[i] >= 5 || degree[j] >= 5) continue

        edges[n * 2] = i
        edges[n * 2 + 1] = j
        degree[i]++
        degree[j]++
        n++
      }
    }
    linkCount.current = n

    // Flatten adjacency for the pulse walk: counting sort into a CSR layout.
    adjStart[0] = 0
    for (let i = 0; i < count; i++) adjStart[i + 1] = adjStart[i] + degree[i]
    // `cursor` reuses degree as a write head, so it has to be re-derived after.
    const head = net.queue // scratch, same length as count
    for (let i = 0; i < count; i++) head[i] = adjStart[i]
    for (let e = 0; e < n; e++) {
      const a = edges[e * 2]
      const b = edges[e * 2 + 1]
      adjList[head[a]++] = b
      adjList[head[b]++] = a
    }
  }

  /**
   * Assign every node its hop distance from `source`, breadth-first.
   * Unreached nodes keep -1 and simply never light for this pulse.
   */
  const seedPulse = (source) => {
    const { hop, adjStart, adjList, queue } = net
    hop.fill(-1)
    hop[source] = 0
    queue[0] = source
    let head = 0
    let tail = 1
    while (head < tail) {
      const node = queue[head++]
      const h = hop[node] + 1
      for (let k = adjStart[node]; k < adjStart[node + 1]; k++) {
        const nb = adjList[k]
        if (hop[nb] !== -1) continue
        hop[nb] = h
        if (tail < queue.length) queue[tail++] = nb
      }
    }
  }

  useFrame((state, delta) => {
    const g = groupRef.current
    const pts = pointsRef.current
    if (!g || !pts) return

    const { time, station, energy } = scrollState()
    const dt = Math.min(0.05, delta)

    // The computational layer belongs to the opening. It is the hero's
    // argument about who built this site, and repeating it under every
    // section would turn a statement into wallpaper. Skills has its own
    // constellation for the same idea, made of named technologies.
    const present = 1 - THREE.MathUtils.smoothstep(station, 1.35, 2.5)
    if (present <= 0.002) {
      if (g.visible) g.visible = false
      return
    }
    g.visible = true

    /* ---- park it opposite the reading column -------------------------- */
    const cam = state.camera
    // Which side has room. Mirrors GlassAssembly so the two never stack up on
    // the same side of frame.
    const toRight = safeZone.right < 0.35
    const lateral = safeZone.mobile ? 0 : 13.5
    scratch
      .set(toRight ? lateral : -lateral, safeZone.mobile ? 7.5 : 0.5, -46)
      .applyMatrix4(cam.matrixWorld)

    if (g.position.lengthSq() === 0) g.position.copy(scratch)
    else g.position.lerp(scratch, 1 - Math.exp(-1.4 * dt))

    const { pos, home, vel, cluster, act, hop, local, phase } = net

    /* ---- reorganisation: one node changes cluster ---------------------- */
    if (!reducedMotion && time - lastReassign.current > REASSIGN_PERIOD) {
      lastReassign.current = time
      const node = Math.floor(Math.random() * count)
      const next = (cluster[node] + 1 + Math.floor(Math.random() * (CLUSTERS - 1))) % CLUSTERS
      cluster[node] = next
      // Re-roll its offset too, so it takes a genuinely different place in the
      // new cluster rather than the same seat in a different room.
      const u = Math.random() * Math.PI * 2
      const v = Math.acos(2 * Math.random() - 1)
      const r = 2.6 + Math.pow(Math.random(), 0.6) * 3.4
      local[node * 3] = Math.sin(v) * Math.cos(u) * r
      local[node * 3 + 1] = Math.sin(v) * Math.sin(u) * r * 0.78
      local[node * 3 + 2] = Math.cos(v) * r
    }

    /* ---- inference pulse ------------------------------------------------ */
    let pulseAge = time - lastPulse.current
    if (!reducedMotion && pulseAge > PULSE_PERIOD && linkCount.current > 0) {
      // Enter at the best-connected node available: starting from a leaf
      // produces a wavefront that crawls in one direction, which reads as a
      // signal on a wire rather than as activation spreading.
      let best = 0
      let bestDeg = -1
      for (let t = 0; t < 8; t++) {
        const cand = Math.floor(Math.random() * count)
        const deg = net.adjStart[cand + 1] - net.adjStart[cand]
        if (deg > bestDeg) {
          bestDeg = deg
          best = cand
        }
      }
      seedPulse(best)
      lastPulse.current = time
      pulseAge = 0
    }

    /* ---- integrate ------------------------------------------------------ */
    const positions = nodeGeometry.attributes.position.array
    const acts = nodeGeometry.attributes.aAct.array

    for (let i = 0; i < count; i++) {
      const c = centroids[cluster[i]]
      const ang = time * c.rate + c.tilt

      // Home = cluster centroid + the node's own place within it, breathing.
      const breath = 1 + Math.sin(time * 0.34 + phase[i]) * 0.09
      home[i * 3] = Math.cos(ang) * c.radius + local[i * 3] * breath
      home[i * 3 + 1] =
        Math.sin(time * c.yRate + c.tilt) * c.ySwing + local[i * 3 + 1] * breath
      home[i * 3 + 2] = Math.sin(ang) * c.radius * 0.7 + c.zBias + local[i * 3 + 2] * breath

      // Spring toward home with damping. Critically this is a FORCE, not a
      // lerp: a reassigned node accelerates away, overshoots its new seat and
      // settles, which is what makes reorganisation look like something being
      // pulled rather than something being teleported with easing.
      let ax = (home[i * 3] - pos[i * 3]) * 5.2
      let ay = (home[i * 3 + 1] - pos[i * 3 + 1]) * 5.2
      let az = (home[i * 3 + 2] - pos[i * 3 + 2]) * 5.2

      const wx = g.position.x + pos[i * 3]
      const wy = g.position.y + pos[i * 3 + 1]
      const wz = g.position.z + pos[i * 3 + 2]

      // Cursor: nodes are pushed off their seats and activated. The field
      // resists -- the spring is still pulling them home -- so holding the
      // pointer in one place visibly strains the local structure.
      const inf = reducedMotion ? 0 : chargedInfluenceAt(wx, wy, wz, 17)
      if (inf > 0.001) {
        const dx = wx - cursorField.position.x
        const dy = wy - cursorField.position.y
        const dz = wz - cursorField.position.z
        const d = Math.max(0.6, Math.hypot(dx, dy, dz))
        // Orbit rather than flee: a tangential push keeps the node inside its
        // cluster while still visibly disturbed.
        ax += (-dz / d) * inf * 26
        az += (dx / d) * inf * 26
        ay += (dy / d) * inf * 12
      }

      vel[i * 3] = (vel[i * 3] + ax * dt) * 0.90
      vel[i * 3 + 1] = (vel[i * 3 + 1] + ay * dt) * 0.90
      vel[i * 3 + 2] = (vel[i * 3 + 2] + az * dt) * 0.90

      pos[i * 3] += vel[i * 3] * dt
      pos[i * 3 + 1] += vel[i * 3 + 1] * dt
      pos[i * 3 + 2] += vel[i * 3 + 2] * dt

      positions[i * 3] = pos[i * 3]
      positions[i * 3 + 1] = pos[i * 3 + 1]
      positions[i * 3 + 2] = pos[i * 3 + 2]

      /* ---- activation --------------------------------------------------- */
      // The wavefront: each node lights when the pulse reaches ITS hop count,
      // then decays. Nodes never reached stay dark, which is what gives the
      // pulse a visible frontier instead of a global flash.
      let target = 0
      const h = hop[i]
      if (h >= 0) {
        const since = pulseAge - h * HOP_TIME
        if (since > 0 && since < 1.05) {
          // Sharp attack, slow release -- the asymmetry is what makes it read
          // as something arriving rather than as a sine wave.
          target = since < 0.10 ? since / 0.10 : Math.pow(1 - (since - 0.10) / 0.95, 2.1)
        }
      }
      target = Math.max(target, inf * 1.15)
      // Idle shimmer so the network is never fully dead between pulses.
      target = Math.max(target, 0.06 + Math.sin(time * 0.7 + phase[i]) * 0.05 + energy * 0.12)

      // Rise fast, fall slow, in the same spirit as the attack curve above.
      const k = target > act[i] ? 1 - Math.exp(-14 * dt) : 1 - Math.exp(-3.4 * dt)
      act[i] += (target - act[i]) * k
      acts[i] = act[i]
    }

    nodeGeometry.attributes.position.needsUpdate = true
    nodeGeometry.attributes.aAct.needsUpdate = true

    /* ---- edges ----------------------------------------------------------- */
    frame.current++
    if (frame.current % REBUILD_EVERY === 0) rebuildEdges()

    const lp = linkGeometry.attributes.position.array
    const la = linkGeometry.attributes.aAct.array
    const n = linkCount.current
    for (let e = 0; e < n; e++) {
      const a = edges[e * 2]
      const b = edges[e * 2 + 1]
      lp[e * 6] = pos[a * 3]
      lp[e * 6 + 1] = pos[a * 3 + 1]
      lp[e * 6 + 2] = pos[a * 3 + 2]
      lp[e * 6 + 3] = pos[b * 3]
      lp[e * 6 + 4] = pos[b * 3 + 1]
      lp[e * 6 + 5] = pos[b * 3 + 2]
      // Each end carries its own node's activation, so an edge GRADIENTS from
      // lit to dark while the wavefront is crossing it. That gradient is the
      // direction of travel made visible, and it is most of why the pulse
      // reads as propagating rather than as nodes blinking in sequence.
      la[e * 2] = act[a]
      la[e * 2 + 1] = act[b]
    }
    linkGeometry.setDrawRange(0, n * 2)
    linkGeometry.attributes.position.needsUpdate = true
    linkGeometry.attributes.aAct.needsUpdate = true

    /* ---- band presence and column clearance ----------------------------- */
    // LAST TO ARRIVE, and deliberately so. The nodes already spring outward
    // from a single point at t=0, so gating their brightness to the end of the
    // ramp means the sequence reads as: space lights, structures resolve, and
    // only then does the thing in the middle start computing.
    const fade = present * (0.85 + energy * 0.15) * ignitionAt(0.46, 1)
    for (const mat of [nodeMatRef.current, linkMatRef.current]) {
      if (!mat) continue
      mat.uniforms.uFade.value = fade
      mat.uniforms.uLeft.value = safeZone.left
      mat.uniforms.uRight.value = safeZone.right
    }
  })

  return (
    <group ref={groupRef} visible={false}>
      <lineSegments geometry={linkGeometry} frustumCulled={false} renderOrder={-150}>
        <shaderMaterial
          ref={linkMatRef}
          uniforms={linkUniforms}
          vertexShader={linkVertex}
          fragmentShader={linkFragment}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          fog={false}
        />
      </lineSegments>

      <points ref={pointsRef} geometry={nodeGeometry} frustumCulled={false} renderOrder={-140}>
        <shaderMaterial
          ref={nodeMatRef}
          uniforms={nodeUniforms}
          vertexShader={nodeVertex}
          fragmentShader={nodeFragment}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          fog={false}
        />
      </points>
    </group>
  )
}
