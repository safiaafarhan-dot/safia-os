import React, { useMemo, useRef, useEffect } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import Label3D from './Label3D'
import { skillNodes, skillEdges, neighboursOf } from '../data/skillGraph'

// Cyan carries the network and crimson marks the selection. The graph used to
// be grey links going crimson on hover, which made it read as a diagram; a
// cool network with a warm marker on it reads as a system with something
// selected in it.
const CRIMSON = new THREE.Color('#b3122e')
const CYAN = new THREE.Color('#4fd2f0')
const METAL = new THREE.Color('#20505f')
const DIM = new THREE.Color('#131b20')

const nodeIndex = skillNodes.reduce((acc, n, i) => {
  acc[n.id] = i
  return acc
}, {})

/** Connection lines. Edges touching the active node burn crimson; the rest recede. */
function Edges({ activeId }) {
  const geomRef = useRef()

  const { positions, colors } = useMemo(() => {
    const pos = new Float32Array(skillEdges.length * 6)
    const col = new Float32Array(skillEdges.length * 6)
    skillEdges.forEach((edge, i) => {
      const a = skillNodes[nodeIndex[edge.source]].position
      const b = skillNodes[nodeIndex[edge.target]].position
      pos.set([a[0], a[1], a[2], b[0], b[1], b[2]], i * 6)
      col.set([METAL.r, METAL.g, METAL.b, METAL.r, METAL.g, METAL.b], i * 6)
    })
    return { positions: pos, colors: col }
  }, [])

  useEffect(() => {
    const attr = geomRef.current?.getAttribute('color')
    if (!attr) return
    skillEdges.forEach((edge, i) => {
      const touches = activeId && (edge.source === activeId || edge.target === activeId)
      const c = activeId ? (touches ? CYAN : DIM) : METAL
      for (let v = 0; v < 2; v++) {
        attr.array[i * 6 + v * 3] = c.r
        attr.array[i * 6 + v * 3 + 1] = c.g
        attr.array[i * 6 + v * 3 + 2] = c.b
      }
    })
    attr.needsUpdate = true
  }, [activeId])

  return (
    <lineSegments>
      <bufferGeometry ref={geomRef}>
        <bufferAttribute attach="attributes-position" count={positions.length / 3} array={positions} itemSize={3} />
        <bufferAttribute attach="attributes-color" count={colors.length / 3} array={colors} itemSize={3} />
      </bufferGeometry>
      <lineBasicMaterial vertexColors transparent opacity={0.85} />
    </lineSegments>
  )
}


/* ------------------------------------------------------------- pulses ----- */

const pulseVertex = /* glsl */ `
  attribute vec3 aStart;
  attribute vec3 aEnd;
  attribute float aPhase;
  attribute float aTouch;

  uniform float uTime;
  uniform float uHasActive;
  uniform float uPixelRatio;

  varying float vHot;
  varying float vAlpha;

  void main() {
    // Each pulse runs its own leg at its own rate, so the network never beats
    // in unison -- that is the difference between "data moving" and "a row of
    // blinking lights".
    float speed = 0.10 + fract(aPhase * 7.3) * 0.16;
    float t = fract(aPhase + uTime * speed);
    vec3 pos = mix(aStart, aEnd, t);

    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mv;

    // With nothing selected the whole graph idles at a low level. With a node
    // selected, its own legs run hot and everything else drops back, so
    // attention follows the selection instead of competing with it.
    float idle = 1.0 - uHasActive;
    vHot = aTouch;
    vAlpha = idle * 0.5 + uHasActive * (aTouch * 1.0 + (1.0 - aTouch) * 0.08);

    // Brightest mid-leg, gone at both ends, so a pulse arrives and departs
    // rather than popping in and out at the nodes.
    vAlpha *= sin(t * 3.14159);

    gl_PointSize = (aTouch > 0.5 ? 5.5 : 3.6) * uPixelRatio;
  }
`

const pulseFragment = /* glsl */ `
  varying float vHot;
  varying float vAlpha;
  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float d = length(uv);
    if (d > 0.5) discard;
    vec3 cool = vec3(0.31, 0.82, 0.94);
    vec3 hot = vec3(0.75, 0.95, 1.0);
    // Over 1.0 so the hot pulses bloom.
    gl_FragColor = vec4(mix(cool, hot, vHot) * 1.5, smoothstep(0.5, 0.0, d) * vAlpha);
  }
`

/**
 * Energy travelling between skill nodes.
 *
 * Several pulses per edge, each interpolating between the two endpoints in the
 * vertex shader. Storing both endpoints per vertex means position is a single
 * mix() and nothing is written from JavaScript per frame — the only per-frame
 * work is a clock and, when the selection changes, one pass over a small
 * attribute.
 */
function Pulses({ activeId }) {
  const matRef = useRef()
  const geomRef = useRef()
  const PER_EDGE = 3

  const { starts, ends, phases, touches, total } = useMemo(() => {
    const total = skillEdges.length * PER_EDGE
    const starts = new Float32Array(total * 3)
    const ends = new Float32Array(total * 3)
    const phases = new Float32Array(total)
    const touches = new Float32Array(total)
    skillEdges.forEach((edge, i) => {
      const a = skillNodes[nodeIndex[edge.source]].position
      const b = skillNodes[nodeIndex[edge.target]].position
      for (let k = 0; k < PER_EDGE; k++) {
        const idx = i * PER_EDGE + k
        starts.set(a, idx * 3)
        ends.set(b, idx * 3)
        phases[idx] = (idx * 0.6180339887) % 1
      }
    })
    return { starts, ends, phases, touches, total }
  }, [])

  useEffect(() => {
    const attr = geomRef.current?.getAttribute('aTouch')
    if (!attr) return
    skillEdges.forEach((edge, i) => {
      const on = activeId && (edge.source === activeId || edge.target === activeId) ? 1 : 0
      for (let k = 0; k < PER_EDGE; k++) attr.array[i * PER_EDGE + k] = on
    })
    attr.needsUpdate = true
  }, [activeId])

  const uniforms = useMemo(
    () => ({ uTime: { value: 0 }, uHasActive: { value: 0 }, uPixelRatio: { value: 1 } }),
    []
  )

  useFrame((state, delta) => {
    const u = matRef.current?.uniforms
    if (!u) return
    u.uTime.value += delta
    u.uPixelRatio.value = state.viewport.dpr || 1
    // Eased rather than switched, so selecting a node dims the rest of the
    // network smoothly instead of snapping.
    const target = activeId ? 1 : 0
    u.uHasActive.value += (target - u.uHasActive.value) * (1 - Math.exp(-6 * delta))
  })

  return (
    <points frustumCulled={false}>
      <bufferGeometry ref={geomRef}>
        <bufferAttribute attach="attributes-position" count={total} array={starts} itemSize={3} />
        <bufferAttribute attach="attributes-aStart" count={total} array={starts} itemSize={3} />
        <bufferAttribute attach="attributes-aEnd" count={total} array={ends} itemSize={3} />
        <bufferAttribute attach="attributes-aPhase" count={total} array={phases} itemSize={1} />
        <bufferAttribute attach="attributes-aTouch" count={total} array={touches} itemSize={1} />
      </bufferGeometry>
      <shaderMaterial
        ref={matRef}
        uniforms={uniforms}
        vertexShader={pulseVertex}
        fragmentShader={pulseFragment}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  )
}

function Node({ node, state, onActivate, showLabel }) {
  const meshRef = useRef()
  const isActive = state === 'active'
  const isNeighbour = state === 'neighbour'
  const isMuted = state === 'muted'

  const scale = isActive ? 1.9 : isNeighbour ? 1.3 : 1
  const color = isMuted ? '#1c2529' : node.color
  // The node itself lights CYAN when selected and its ring stays crimson. The
  // node used to burn crimson too, which put the warm accent on both the
  // marker and the thing being marked and left nothing cool in the graph.
  const emissive = isActive ? '#4fd2f0' : isNeighbour ? node.color : '#0a1a20'

  useFrame(() => {
    if (!meshRef.current) return
    meshRef.current.scale.lerp(new THREE.Vector3(scale, scale, scale), 0.15)
  })

  return (
    <group position={node.position}>
      <mesh
        ref={meshRef}
        onPointerOver={(e) => { e.stopPropagation(); onActivate(node.id) }}
        onPointerOut={(e) => { e.stopPropagation(); onActivate(null) }}
      >
        <icosahedronGeometry args={[0.135, 0]} />
        <meshStandardMaterial
          color={color}
          emissive={emissive}
          emissiveIntensity={isActive ? 2.6 : isNeighbour ? 0.9 : 0.25}
          metalness={0.7}
          roughness={0.25}
          transparent
          opacity={isMuted ? 0.32 : 1}
        />
      </mesh>

      {isActive && (
        <>
          {/* Two rings on different axes: crimson marks the selection, cyan
              echoes the network it belongs to. */}
          <mesh rotation={[Math.PI / 2.6, 0, 0]}>
            <torusGeometry args={[0.26, 0.005, 8, 48]} />
            <meshBasicMaterial color="#b3122e" transparent opacity={0.95} toneMapped={false} />
          </mesh>
          <mesh rotation={[0, Math.PI / 3, Math.PI / 2.2]}>
            <torusGeometry args={[0.34, 0.0035, 8, 48]} />
            <meshBasicMaterial color="#4fd2f0" transparent opacity={0.75} toneMapped={false} />
          </mesh>
          <pointLight color="#4fd2f0" intensity={2.2} distance={2.2} />
        </>
      )}

      {/* Camera-facing sprite label rather than drei's Html. The same
          technology names are listed as real DOM in the Skills index below the
          canvas, so the graph is never the only way to read them. */}
      {showLabel && (
        <Label3D position={[0, 0.5, 0]} title={node.name} status="" scale={0.055} />
      )}
    </group>
  )
}

function Cluster({ activeId, onActivate, reducedMotion }) {
  const groupRef = useRef()

  useFrame((state, delta) => {
    const group = groupRef.current
    if (!group) return

    if (reducedMotion) {
      // No autonomous motion — the cluster only follows the pointer.
      group.rotation.y = THREE.MathUtils.lerp(group.rotation.y, state.pointer.x * 0.6, 0.05)
    } else if (!activeId) {
      // Drift continuously, but hold still while a node is being inspected.
      group.rotation.y += delta * 0.06
    }

    group.rotation.x = THREE.MathUtils.lerp(group.rotation.x, state.pointer.y * 0.25, 0.05)
  })

  const neighbours = activeId ? neighboursOf[activeId] ?? [] : []

  return (
    <group ref={groupRef}>
      <Edges activeId={activeId} />
      <Pulses activeId={activeId} />
      {skillNodes.map((node) => {
        let state = 'idle'
        if (activeId) {
          if (node.id === activeId) state = 'active'
          else if (neighbours.includes(node.id)) state = 'neighbour'
          else state = 'muted'
        }
        return (
          <Node
            key={node.id}
            node={node}
            state={state}
            onActivate={onActivate}
            showLabel={state === 'active'}
          />
        )
      })}
    </group>
  )
}

const SkillsConstellation = ({ activeId, onActivate, reducedMotion = false }) => {
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768

  return (
    <Canvas
      dpr={isMobile ? 1 : [1, 1.8]}
      camera={{ position: [0, 0, isMobile ? 9.5 : 8], fov: 45 }}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      onPointerMissed={() => onActivate(null)}
    >
      <color attach="background" args={['#161618']} />
      <fog attach="fog" args={['#161618', 9, 18]} />

      <ambientLight intensity={0.5} color="#4a4a52" />
      <directionalLight position={[4, 5, 4]} intensity={1.1} color="#e8e6e1" />
      <directionalLight position={[-4, -2, -3]} intensity={0.7} color="#b3122e" />

      <Cluster activeId={activeId} onActivate={onActivate} reducedMotion={reducedMotion} />
    </Canvas>
  )
}

export default SkillsConstellation
