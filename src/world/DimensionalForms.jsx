import React, { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { ignitionAt, scrollState } from '../state/scrollStore'
import { influenceAt } from './cursorFieldState'
import { keepOutAmount } from './safeZone'

/**
 * LARGE ABSTRACT STRUCTURES — the background layer of the opening.
 *
 * These exist because of what was TAKEN OUT. The hero's dominant object used
 * to be a ringed gas giant, and a ringed gas giant is Saturn: the most
 * recognisable object in the sky and the fastest possible way to tell a
 * visitor they are looking at a space portfolio. The brief rules out both the
 * impression and the category — forms here must read as GENERATED rather than
 * manufactured or astronomical.
 *
 * So the replacement is deliberately unnameable. An incomplete sphere. A ring
 * around nothing. Planes hanging in an arrangement with no floor. None of it
 * resolves into an object you could name, and that refusal is the point: the
 * environment should feel like a dimension that is still deciding what it is.
 *
 * FOUR FORMS, NOT FORTY. The brief's sharpest instruction is that the goal is
 * not more effects, and background structure is where that discipline matters
 * most — this is the layer where adding "one more" is always tempting and
 * always wrong. Four large, slow, widely separated forms give depth. Twelve
 * would give clutter, and clutter at this scale is what makes a scene read as
 * a screensaver.
 *
 * COMPOSITION — AND WHY THERE ARE NOW THREE.
 * The whole left third of frame belongs to the reading column and is left
 * EMPTY. A fourth form was placed high in that corner to stop it reading as a
 * blank panel, and it had to go: a low-poly solid at that size renders as a
 * flat filled disc, not a structure, so it added a blob to the one part of the
 * frame that most needed to stay quiet. Negative space was the better answer,
 * which is the whole lesson of the brief's "do not keep adding objects".
 * Everything with weight now sits right of centre alongside the neural field,
 * so the opening reads as text on one side and a structured space on the other.
 *
 * BODY DIM, EDGES BRIGHT. Each form's fill is kept very low and its edges do
 * the describing. A translucent solid with a bright interior is a lamp; a
 * translucent solid with bright EDGES is glass, and it is also the only one of
 * the two that stays legible against a dark background without blooming.
 *
 * WHY THEY ARE NOT PUSHED OUT OF THE READING COLUMN. Everything nearer than
 * this gets physically moved aside by safeZone; these are hundreds of units
 * out and tens across, so moving them would swing the entire background
 * whenever the text column changed width. They are atmosphere, and atmosphere
 * DIMS behind text rather than dodging it — which is exactly the distinction
 * safeZone's `near` limit exists to draw.
 */

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v)

/**
 * Fresnel glass. Bright at grazing angles, near-invisible face-on.
 *
 * This is what separates a translucent VOLUME from a flat tinted shape. A
 * constant-alpha surface reads as a decal no matter how low the opacity;
 * brightness that varies with viewing angle reads as something light is
 * passing through, and it means the form's silhouette is drawn by its own
 * curvature instead of by an outline.
 */
const glassVertex = /* glsl */ `
  varying vec3 vNormalW;
  varying vec3 vViewDir;
  varying float vDepth;
  void main() {
    vNormalW = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vViewDir = normalize(-mv.xyz);
    vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`

const glassFragment = /* glsl */ `
  varying vec3 vNormalW;
  varying vec3 vViewDir;
  varying float vDepth;

  uniform vec3 uColor;
  uniform vec3 uRim;
  uniform float uOpacity;
  uniform float uPulse;

  void main() {
    // NARROW RIM, NOT A LIT BODY.
    //
    // At exponent 2.2 the fresnel term stays high across most of a curved
    // surface, and with additive blending over a double-sided mesh — front and
    // back faces both contributing — these rendered as saturated cyan blobs:
    // the "excessive bloom / neon" failure the brief rules out, and the
    // opposite of glass. A steep exponent confines the response to the
    // silhouette, which is where a real transparent solid actually gets bright.
    float f = pow(1.0 - max(dot(normalize(vNormalW), normalize(vViewDir)), 0.0), 3.6);

    // A slow band of light travelling across the surface. Without it these are
    // static geometry and the "living" requirement fails on the largest and
    // most visible layer in the frame.
    float sweep = 0.5 + 0.5 * sin(vDepth * 0.045 - uPulse);
    sweep = pow(sweep, 4.0);

    vec3 tint = mix(uColor, uRim, f);
    // Deliberately low. These sit hundreds of units out and are the LAST thing
    // that should compete with the wordmark for attention — they establish
    // depth, they do not perform.
    float a = (0.015 + f * 0.34 + sweep * 0.035) * uOpacity;
    gl_FragColor = vec4(tint * (0.22 + f * 0.85 + sweep * 0.22), a);
  }
`

/** Additive emissive edges — the cue that a surface has a refractive index. */
const EdgeOverlay = ({ geometry, color, opacity }) => {
  const edges = useMemo(() => new THREE.EdgesGeometry(geometry, 28), [geometry])
  return (
    <lineSegments geometry={edges} renderOrder={-300}>
      <lineBasicMaterial
        color={color}
        transparent
        opacity={opacity}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        fog={false}
      />
    </lineSegments>
  )
}

/**
 * One structure.
 *
 * `spin` is per-axis and intentionally slow and irrational relative to the
 * others — shared or harmonically related rates make separate objects look
 * like one rigid assembly turning, which collapses the depth the layer exists
 * to create.
 *
 * `extent` is the form's horizontal half-size in world units, used by the
 * keep-out test below.
 */
function Form({
  position,
  geometry,
  color,
  rim,
  scale = 1,
  spin,
  opacity = 1,
  edgeOpacity = 0.22,
  band,
  extent = 20,
}) {
  const groupRef = useRef()
  // Uniforms are written through the MATERIAL, never through the object handed
  // to the `uniforms` prop: R3F rebinds that on construction, so the closure
  // copy silently stops being what the shader reads. Left unfixed this renders
  // as bare edge wireframes with no glass inside them, which is exactly how it
  // first appeared on screen.
  const matRef = useRef()
  // Reused across frames — a per-frame Vector3 in four of these is four
  // allocations a frame for the collector.
  const world = useMemo(() => new THREE.Vector3(), [])

  const uniforms = useMemo(
    () => ({
      uColor: { value: new THREE.Color(color) },
      uRim: { value: new THREE.Color(rim) },
      uOpacity: { value: 0 },
      uPulse: { value: 0 },
    }),
    [color, rim]
  )

  useFrame(() => {
    const g = groupRef.current
    const mat = matRef.current
    if (!g || !mat) return
    const { time, station, energy } = scrollState()

    // Each form owns a slice of the timeline, so the background CHANGES as the
    // journey goes deeper rather than carrying the same four shapes the whole
    // way down.
    const present = clamp01(
      THREE.MathUtils.smoothstep(station, band[0], band[1]) *
        (1 - THREE.MathUtils.smoothstep(station, band[2], band[3]))
    )
    if (present <= 0.002) {
      if (g.visible) g.visible = false
      return
    }
    g.visible = true

    g.rotation.x = time * spin[0]
    g.rotation.y = time * spin[1]
    g.rotation.z = time * spin[2]

    // Dim behind the reading column instead of moving. See the note at the top.
    //
    // TESTED ACROSS THE FORM'S EXTENT, NOT AT ITS ORIGIN. These are tens of
    // units across — the ring is 138 wide — so a centre-point test happily
    // reports "clear" for a structure whose arc is running straight through
    // the wordmark, which is exactly what it did on the first pass. Sampling
    // the horizontal extremes as well is the cheapest thing that catches it,
    // and horizontal is the axis that matters because the reading column is a
    // vertical band.
    g.getWorldPosition(world)
    const blocked = Math.max(
      keepOutAmount(world.x, world.y, world.z),
      keepOutAmount(world.x - extent, world.y, world.z),
      keepOutAmount(world.x + extent, world.y, world.z)
    )

    // A distant structure still answers the cursor, just faintly. The brief
    // asks for the effect to stay LOCAL, and at this range a wide radius with
    // a small gain is what "local" means — the background acknowledges the
    // pointer without the whole world lurching toward it.
    const inf = influenceAt(world.x, world.y, world.z, 90) * 0.35

    // FOURTH TO ARRIVE: the large structures resolve out of the lit space
    // once the space itself exists to resolve out of.
    //
    // Pushed back from (0.22, 0.62). The arrival now has real beats in front
    // of it — the beacon, the stars, the dust, the source coming up — and at
    // the old window the structures were already resolving while the volume
    // around them was still lifting out of black, so they read as fading in
    // rather than as being REVEALED by a light that had just reached them.
    mat.uniforms.uOpacity.value =
      present * opacity * (1 - blocked * 0.75) * (1 + inf) * ignitionAt(0.40, 0.82)
    mat.uniforms.uPulse.value = time * 0.42 + energy * 1.6
  })

  return (
    <group ref={groupRef} position={position} scale={scale} visible={false}>
      <mesh geometry={geometry} renderOrder={-320}>
        <shaderMaterial
          ref={matRef}
          uniforms={uniforms}
          vertexShader={glassVertex}
          fragmentShader={glassFragment}
          transparent
          depthWrite={false}
          side={THREE.DoubleSide}
          blending={THREE.AdditiveBlending}
          fog={false}
        />
      </mesh>
      <EdgeOverlay geometry={geometry} color={rim} opacity={edgeOpacity} />
    </group>
  )
}

export default function DimensionalForms({ enabled = true }) {
  /**
   * The four forms. Geometry is built once and shared — these never change
   * shape, only orientation and presence.
   */
  const geo = useMemo(() => {
    // An INCOMPLETE SPHERE. The open azimuth is the whole idea: a closed
    // sphere is a ball, and a ball out here is a planet. Cut it and it becomes
    // a shell that was never finished.
    const shell = new THREE.SphereGeometry(30, 40, 24, 0, Math.PI * 1.35, 0.22, Math.PI * 0.72)

    // A RING AROUND NOTHING. Planetary rings need a planet; this one has an
    // empty centre, which is what stops it reading as orbital mechanics and
    // starts it reading as a constructed boundary.
    const ring = new THREE.TorusGeometry(46, 0.5, 3, 128)

    // A LATTICE FRAGMENT. Regular enough to look computed, irregular enough
    // not to look like a product.
    const lattice = new THREE.IcosahedronGeometry(22, 1)

    // FLOATING PLANES: three thin slabs at different angles, merged into one
    // geometry so the set costs a single draw call. They are the only
    // right-angled things in the composition, which is what makes them read as
    // deliberate surfaces rather than debris.
    const planeParts = []
    const specs = [
      { p: [0, 0, 0], r: [0.2, 0.5, 0.1], s: [34, 20, 0.25] },
      { p: [14, -11, -13], r: [-0.4, 0.9, 0.3], s: [22, 26, 0.25] },
      { p: [-16, 9, 9], r: [0.6, -0.3, -0.5], s: [26, 15, 0.25] },
    ]
    for (const spec of specs) {
      const box = new THREE.BoxGeometry(spec.s[0], spec.s[1], spec.s[2])
      box.rotateX(spec.r[0])
      box.rotateY(spec.r[1])
      box.rotateZ(spec.r[2])
      box.translate(spec.p[0], spec.p[1], spec.p[2])
      planeParts.push(box)
    }
    const planes = mergeGeometries(planeParts)
    planeParts.forEach((p) => p.dispose())

    return { shell, ring, lattice, planes }
  }, [])

  if (!enabled) return null

  return (
    <group>
      {/* THE DOMINANT FORM of the opening, upper right — the shape the eye
          resolves after the wordmark, and the one that replaces the planet. */}
      <Form
        position={[176, 30, -330]}
        geometry={geo.shell}
        color="#12406b"
        rim="#5fd0ff"
        scale={1.25}
        spin={[0.0041, 0.0117, 0.0023]}
        opacity={0.34}
        edgeOpacity={0.2}
        extent={40}
        band={[-1, 0, 2.4, 3.6]}
      />

      {/* Lower right, and deliberately huge. Its arc leaves frame on both
          sides, so it reads as part of a structure far bigger than the view —
          which is most of what makes the space feel like it continues past the
          edges rather than stopping at them. */}
      <Form
        position={[210, -92, -360]}
        geometry={geo.ring}
        color="#1d3a7a"
        rim="#7fa8ff"
        scale={1.5}
        spin={[0.0083, 0.0031, 0.0059]}
        opacity={0.5}
        edgeOpacity={0.3}
        extent={70}
        band={[-1, 0, 2.8, 4.0]}
      />

      {/* Deep right. Far enough back to read as another layer rather than as
          more objects at the same distance — the depth cue the background
          otherwise has to get from fog alone. */}
      <Form
        position={[250, 26, -430]}
        geometry={geo.planes}
        color="#173a63"
        rim="#8fd8ff"
        scale={1.2}
        spin={[0.0029, 0.0091, 0.0017]}
        opacity={0.2}
        edgeOpacity={0.19}
        extent={30}
        band={[0.15, 1.0, 2.6, 3.8]}
      />
    </group>
  )
}

/**
 * Minimal geometry merge for indexed position/normal attributes.
 *
 * three's own BufferGeometryUtils would do this, but importing it pulls in the
 * whole utils module for one function — and this project already removed drei
 * for exactly that reason. Only the attributes these boxes actually carry are
 * merged.
 */
function mergeGeometries(list) {
  const out = new THREE.BufferGeometry()
  const attrs = ['position', 'normal']
  let total = 0
  for (const g of list) total += g.attributes.position.count

  for (const name of attrs) {
    const size = list[0].attributes[name].itemSize
    const array = new Float32Array(total * size)
    let offset = 0
    for (const g of list) {
      array.set(g.attributes[name].array, offset)
      offset += g.attributes[name].count * size
    }
    out.setAttribute(name, new THREE.BufferAttribute(array, size))
  }

  // Indices, rebased per source geometry.
  const indices = []
  let base = 0
  for (const g of list) {
    const idx = g.index
    for (let i = 0; i < idx.count; i++) indices.push(idx.getX(i) + base)
    base += g.attributes.position.count
  }
  out.setIndex(indices)
  return out
}
