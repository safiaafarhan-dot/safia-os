import React, { useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import Label3D from './Label3D'

const CRIMSON = '#b3122e'
const METAL = '#5a5a62'

/* ------------------------------------------------------------------ *
 * Per-project modules. Each one is a procedural form that reflects
 * what the project actually does, not generic decoration.
 * ------------------------------------------------------------------ */

/**
 * JARVIS — voice-driven AI command core: rotating rings + radial waveform.
 *
 * Modules receive `energyRef` (a ref, not a value) and read it inside their own
 * frame loop. That keeps the whole activation animation off the React render
 * path — no component re-renders while a module ramps up or down.
 */
function JarvisModule({ energyRef }) {
  const ringsRef = useRef()
  const barsRef = useRef([])
  const coreMatRef = useRef()
  const wireMatRef = useRef()
  const ringAMatRef = useRef()
  const ringBMatRef = useRef()

  const bars = useMemo(() => Array.from({ length: 20 }, (_, i) => {
    const angle = (i / 20) * Math.PI * 2
    return { angle, x: Math.cos(angle) * 0.95, z: Math.sin(angle) * 0.95, seed: i * 0.7 }
  }), [])

  // One material shared by all 20 bars, so a single opacity write drives them all.
  const barMaterial = useMemo(
    () => new THREE.MeshBasicMaterial({ color: CRIMSON, transparent: true, opacity: 0.35 }),
    []
  )
  useEffect(() => () => barMaterial.dispose(), [barMaterial])

  useFrame((state) => {
    const t = state.clock.elapsedTime
    const energy = energyRef.current

    if (ringsRef.current) {
      ringsRef.current.rotation.z = t * 0.25
      ringsRef.current.rotation.x = Math.sin(t * 0.3) * 0.25
    }
    barsRef.current.forEach((bar, i) => {
      if (!bar) return
      // Idle modules breathe faintly; active ones speak — but stay restrained.
      const amp = 0.06 + energy * 0.26
      const h = 0.08 + Math.abs(Math.sin(t * 2.2 + bars[i].seed)) * amp
      bar.scale.y = h
      bar.position.y = h / 2
    })

    if (coreMatRef.current) coreMatRef.current.emissiveIntensity = energy * 0.28
    if (wireMatRef.current) wireMatRef.current.opacity = 0.12 + energy * 0.4
    if (ringAMatRef.current) ringAMatRef.current.opacity = 0.35 + energy * 0.55
    if (ringBMatRef.current) ringBMatRef.current.opacity = 0.3 + energy * 0.4
    barMaterial.opacity = 0.35 + energy * 0.5
  })

  return (
    <group>
      {/* Machined core — stays metal; crimson reads as a lit seam, never a neon ball. */}
      <mesh>
        <icosahedronGeometry args={[0.42, 0]} />
        <meshStandardMaterial
          ref={coreMatRef}
          color="#2a2a30"
          metalness={0.92}
          roughness={0.28}
          emissive={CRIMSON}
          emissiveIntensity={0}
          flatShading
        />
      </mesh>
      <mesh scale={1.001}>
        <icosahedronGeometry args={[0.42, 0]} />
        <meshBasicMaterial ref={wireMatRef} color={CRIMSON} wireframe transparent opacity={0.12} />
      </mesh>

      <group ref={ringsRef}>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.72, 0.006, 8, 64]} />
          <meshBasicMaterial ref={ringAMatRef} color={CRIMSON} transparent opacity={0.35} />
        </mesh>
        <mesh rotation={[Math.PI / 2.6, 0.4, 0]}>
          <torusGeometry args={[0.95, 0.004, 8, 64]} />
          <meshBasicMaterial ref={ringBMatRef} color={METAL} transparent opacity={0.3} />
        </mesh>
      </group>

      {bars.map((bar, i) => (
        <mesh
          key={i}
          ref={(el) => { barsRef.current[i] = el }}
          position={[bar.x, 0.1, bar.z]}
          material={barMaterial}
        >
          <boxGeometry args={[0.035, 1, 0.035]} />
        </mesh>
      ))}
    </group>
  )
}

/** QuickBite — delivery network: location nodes, routes, a travelling order. */
function QuickBiteModule({ energyRef }) {
  const pulseRef = useRef()
  const gridRef = useRef()
  const routeMatRef = useRef()
  const nodeMatRefs = useRef([])

  const nodes = useMemo(() => ([
    [-0.75, 0, -0.5], [0.1, 0, -0.8], [0.85, 0, -0.15],
    [0.35, 0, 0.65], [-0.55, 0, 0.6], [-0.05, 0, 0.05],
  ]), [])

  // Closed delivery circuit through the location nodes.
  const route = useMemo(() => {
    const pts = [nodes[0], nodes[1], nodes[2], nodes[3], nodes[4], nodes[0]]
      .map((p) => new THREE.Vector3(p[0], 0.02, p[2]))
    return new THREE.CatmullRomCurve3(pts, true, 'catmullrom', 0.25)
  }, [nodes])

  const routePositions = useMemo(() => {
    const pts = route.getPoints(120)
    const arr = new Float32Array(pts.length * 3)
    pts.forEach((p, i) => arr.set([p.x, p.y, p.z], i * 3))
    return arr
  }, [route])

  useFrame((state) => {
    const t = state.clock.elapsedTime
    const energy = energyRef.current

    if (pulseRef.current) {
      const speed = 0.06 + energy * 0.16
      const p = route.getPointAt((t * speed) % 1)
      pulseRef.current.position.set(p.x, p.y + 0.05, p.z)
    }
    if (gridRef.current) gridRef.current.rotation.y = t * 0.05
    if (routeMatRef.current) routeMatRef.current.opacity = 0.3 + energy * 0.6
    nodeMatRefs.current.forEach((mat, i) => {
      if (mat) mat.emissiveIntensity = energy * (i === 5 ? 1.6 : 0.5)
    })
  })

  return (
    <group ref={gridRef} rotation={[-0.35, 0, 0]}>
      {/* map plane */}
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[2.3, 2.3]} />
        <meshStandardMaterial color="#17171a" metalness={0.5} roughness={0.8} transparent opacity={0.65} />
      </mesh>
      <gridHelper args={[2.3, 10, METAL, '#232328']} position={[0, 0.005, 0]} />

      {/* route */}
      <line>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" count={routePositions.length / 3} array={routePositions} itemSize={3} />
        </bufferGeometry>
        <lineBasicMaterial ref={routeMatRef} color={CRIMSON} transparent opacity={0.3} />
      </line>

      {/* location nodes */}
      {nodes.map((n, i) => (
        <mesh key={i} position={[n[0], 0.06, n[2]]}>
          <cylinderGeometry args={[0.05, 0.05, 0.1, 6]} />
          <meshStandardMaterial
            ref={(el) => { nodeMatRefs.current[i] = el }}
            color="#3a3a42"
            metalness={0.9}
            roughness={0.3}
            emissive={CRIMSON}
            emissiveIntensity={0}
          />
        </mesh>
      ))}

      {/* live order in transit */}
      <mesh ref={pulseRef}>
        <sphereGeometry args={[0.055, 12, 12]} />
        <meshStandardMaterial color={CRIMSON} emissive={CRIMSON} emissiveIntensity={2} toneMapped={false} />
      </mesh>
    </group>
  )
}

/** Distracted Driver Detection — CV inference view: scan line + detection boxes. */
function VisionModule({ energyRef }) {
  const scanRef = useRef()
  const boxARef = useRef()
  const boxBRef = useRef()

  useFrame((state) => {
    const t = state.clock.elapsedTime
    const energy = energyRef.current
    // Children may not be attached on the first frame, so every access is guarded.
    if (scanRef.current) {
      const range = 0.85
      scanRef.current.position.y = Math.sin(t * (0.7 + energy * 0.9)) * range
      if (scanRef.current.material) {
        scanRef.current.material.opacity = 0.25 + energy * 0.6
      }
    }
    // Detection confidence flickers as inference re-runs.
    // These refs point at the materials themselves, not the meshes.
    if (boxARef.current) {
      boxARef.current.opacity = 0.25 + energy * (0.5 + Math.abs(Math.sin(t * 3)) * 0.45)
    }
    if (boxBRef.current) {
      boxBRef.current.opacity = 0.15 + energy * (0.3 + Math.abs(Math.sin(t * 2.1 + 1)) * 0.4)
    }
  })

  const frame = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(2.1, 1.5, 0.02)), [])
  const boxA = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(0.62, 0.72, 0.02)), [])
  const boxB = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(0.42, 0.36, 0.02)), [])

  return (
    <group>
      {/* camera viewport */}
      <mesh>
        <planeGeometry args={[2.1, 1.5]} />
        <meshStandardMaterial color="#1e1e23" metalness={0.4} roughness={0.9} transparent opacity={0.9} />
      </mesh>
      <lineSegments geometry={frame}>
        <lineBasicMaterial color="#7a7a84" transparent opacity={0.85} />
      </lineSegments>

      {/* inference bounding boxes */}
      <lineSegments geometry={boxA} position={[-0.42, -0.05, 0.02]}>
        <lineBasicMaterial ref={boxARef} color={CRIMSON} transparent opacity={0.3} />
      </lineSegments>
      <lineSegments geometry={boxB} position={[0.55, 0.22, 0.02]}>
        <lineBasicMaterial ref={boxBRef} color={METAL} transparent opacity={0.2} />
      </lineSegments>

      {/* scan line */}
      <mesh ref={scanRef} position={[0, 0, 0.03]}>
        <planeGeometry args={[2.05, 0.012]} />
        <meshBasicMaterial color={CRIMSON} transparent opacity={0.4} />
      </mesh>
    </group>
  )
}

const MODULES = {
  jarvis: JarvisModule,
  quickbite: QuickBiteModule,
  'distracted-driver': VisionModule,
}

/* ------------------------------------------------------------------ */

function Module({ project, position, state, onHover, onSelect }) {
  const groupRef = useRef()
  const energyRef = useRef(0)

  const isActive = state === 'active'
  const isDetected = state === 'detected'
  const isDimmed = state === 'dimmed'

  const targetEnergy = isActive ? 1 : isDetected ? 0.5 : 0.08
  const targetScale = isActive ? 1.12 : isDetected ? 1.05 : 1

  useFrame((_, delta) => {
    const group = groupRef.current
    if (!group) return

    // Children read energyRef inside their own frame loops, so ramping a module
    // up or down costs zero React renders.
    energyRef.current = THREE.MathUtils.damp(energyRef.current, targetEnergy, 4, delta)

    const s = THREE.MathUtils.damp(group.scale.x, targetScale, 5, delta)
    group.scale.setScalar(s)
    group.rotation.y = THREE.MathUtils.damp(
      group.rotation.y,
      isActive || isDetected ? 0 : 0,
      3,
      delta
    )
    if (!isActive) group.rotation.y += delta * 0.12
  })

  const Visual = MODULES[project.id]

  return (
    <group position={position}>
      <group
        ref={groupRef}
        onPointerOver={(e) => { e.stopPropagation(); onHover(project.id) }}
        onPointerOut={(e) => { e.stopPropagation(); onHover(null) }}
        onClick={(e) => { e.stopPropagation(); onSelect(project.id) }}
      >
        {/* generous invisible hit area — the visuals themselves are sparse */}
        <mesh visible={false}>
          <boxGeometry args={[2.6, 2.4, 2.6]} />
        </mesh>
        {Visual && <Visual energyRef={energyRef} />}
      </group>

      {/* Label as a camera-facing sprite rather than drei's Html. With
          sizeAttenuation off it holds a constant on-screen size — the same HUD
          behaviour the Html version had with no distanceFactor. Every name and
          state here also exists as real DOM in the Projects section. */}
      <Label3D
        position={[0, -1.5, 0]}
        title={project.name}
        status={isActive ? 'MODULE ACTIVE' : isDetected ? 'MODULE DETECTED' : 'MODULE OFFLINE'}
        statusColor={isActive ? '#e6455e' : isDimmed ? '#a7aebd' : '#c3c8d4'}
      />
    </group>
  )
}

/** Cinematic camera: pulls in on the selected module, pulls back when idle. */
function CameraRig({ focusX, focused, reducedMotion }) {
  const { camera } = useThree()
  const target = useRef(new THREE.Vector3())

  useFrame((state, delta) => {
    const drift = reducedMotion ? 0 : state.pointer.x * 0.35
    const destX = focused ? focusX + drift * 0.4 : drift
    const destZ = focused ? 4.4 : 6.7
    const destY = focused ? 0.35 : 0.6 + (reducedMotion ? 0 : state.pointer.y * 0.2)

    camera.position.x = THREE.MathUtils.damp(camera.position.x, destX, 2.4, delta)
    camera.position.y = THREE.MathUtils.damp(camera.position.y, destY, 2.4, delta)
    camera.position.z = THREE.MathUtils.damp(camera.position.z, destZ, 2.4, delta)

    target.current.set(
      THREE.MathUtils.damp(target.current.x, focused ? focusX : 0, 2.4, delta),
      THREE.MathUtils.damp(target.current.y, 0, 2.4, delta),
      0
    )
    camera.lookAt(target.current)
  })

  return null
}

const SPACING = 3.4

const ProjectUniverse = ({ projects, activeId, hoverId, onHover, onSelect, reducedMotion = false }) => {
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768

  // Narrow viewports can't fit three modules side by side without clipping, so
  // mobile shows a single module at centre and the index cards switch between them.
  const visible = isMobile
    ? projects.filter((p) => p.id === (activeId ?? projects[0]?.id))
    : projects

  const focusIndex = visible.findIndex((p) => p.id === activeId)
  const focusX = !isMobile && focusIndex >= 0
    ? (focusIndex - (visible.length - 1) / 2) * SPACING
    : 0

  return (
    <Canvas
      dpr={isMobile ? 1 : [1, 1.8]}
      camera={{ position: [0, 0.6, isMobile ? 5.4 : 6.7], fov: 45 }}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      onPointerMissed={() => onSelect(null)}
    >
      <color attach="background" args={['#161618']} />
      <fog attach="fog" args={['#161618', 8, 20]} />

      <ambientLight intensity={0.45} color="#4a4a52" />
      <directionalLight position={[4, 5, 5]} intensity={1.2} color="#e8e6e1" />
      <directionalLight position={[-4, -1, -3]} intensity={0.5} color={CRIMSON} />

      {visible.map((project, i) => {
        const position = [(i - (visible.length - 1) / 2) * SPACING, 0, 0]
        let state = 'idle'
        if (activeId) state = project.id === activeId ? 'active' : 'dimmed'
        else if (hoverId === project.id) state = 'detected'
        return (
          <Module
            key={project.id}
            project={project}
            position={position}
            state={state}
            onHover={onHover}
            onSelect={onSelect}
          />
        )
      })}

      <CameraRig
        focusX={focusX}
        focused={!isMobile && focusIndex >= 0}
        reducedMotion={reducedMotion}
      />
    </Canvas>
  )
}

export default ProjectUniverse
