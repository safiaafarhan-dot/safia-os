import React, { useMemo, useRef, useEffect } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { skillNodes, skillEdges, neighboursOf } from '../data/skillGraph'

const CRIMSON = new THREE.Color('#b3122e')
const METAL = new THREE.Color('#2e2e34')
const DIM = new THREE.Color('#1a1a1d')

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
      const c = activeId ? (touches ? CRIMSON : DIM) : METAL
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
      <lineBasicMaterial vertexColors transparent opacity={0.75} />
    </lineSegments>
  )
}

function Node({ node, state, onActivate, showLabel }) {
  const meshRef = useRef()
  const isActive = state === 'active'
  const isNeighbour = state === 'neighbour'
  const isMuted = state === 'muted'

  const scale = isActive ? 1.9 : isNeighbour ? 1.25 : 1
  const color = isMuted ? '#26262b' : node.color
  // Crimson is the system's "selected" signal, so the active node always burns
  // crimson while neighbours keep their category colour.
  const emissive = isActive ? '#b3122e' : isNeighbour ? node.color : '#000000'

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
          emissiveIntensity={isActive ? 2.2 : isNeighbour ? 0.6 : 0}
          metalness={0.85}
          roughness={0.3}
          transparent
          opacity={isMuted ? 0.35 : 1}
        />
      </mesh>

      {isActive && (
        <>
          <mesh rotation={[Math.PI / 2.6, 0, 0]}>
            <torusGeometry args={[0.26, 0.005, 8, 48]} />
            <meshBasicMaterial color="#b3122e" transparent opacity={0.9} />
          </mesh>
          <pointLight color="#b3122e" intensity={1.4} distance={1.6} />
        </>
      )}

      {showLabel && (
        <Html center distanceFactor={9} zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
          <div className="whitespace-nowrap -translate-y-8 font-mono text-[11px] tracking-[0.2em] uppercase text-off-white bg-hero-black/85 border border-crimson/50 px-2 py-1 rounded-sm">
            {node.name}
          </div>
        </Html>
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
