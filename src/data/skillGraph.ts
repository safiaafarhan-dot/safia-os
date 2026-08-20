import { skillCategories } from './skills'
import { projects } from './projects'

/**
 * Technology constellation graph.
 *
 * Nodes come from the declared skill set. Edges are NOT invented — two
 * technologies are linked only because they were actually used together in
 * one of the real projects, so every connection is traceable to evidence.
 */

// Project tech strings don't always match skill names one-to-one.
const ALIASES = {
  HTML: 'HTML/CSS',
  CSS: 'HTML/CSS',
  TensorFlow: 'TensorFlow/Keras',
  'TensorFlow/Keras': 'TensorFlow/Keras',
  Keras: 'TensorFlow/Keras',
  'Scikit-learn': 'Scikit-learn',
  'REST APIs': 'REST APIs',
  'Jupyter Notebook': 'Jupyter Notebook',
  PyAutoGUI: 'PyAutoGUI',
  'DeepSeek R1 API': 'APIs Integration',
  'Google Translate': 'APIs Integration',
}

const categoryOf = {}
const nodeNames = []

for (const [category, { color, skills }] of Object.entries(skillCategories)) {
  for (const skill of skills) {
    nodeNames.push(skill.name)
    categoryOf[skill.name] = { category, color, description: skill.description }
  }
}

const normalize = (tech) => {
  const mapped = ALIASES[tech] ?? tech
  return nodeNames.includes(mapped) ? mapped : null
}

// Fibonacci sphere — deterministic, evenly distributed, no randomness at render.
const spherePosition = (index, total, radius) => {
  const offset = 2 / total
  const increment = Math.PI * (3 - Math.sqrt(5))
  const y = index * offset - 1 + offset / 2
  const r = Math.sqrt(Math.max(0, 1 - y * y))
  const phi = index * increment
  return [Math.cos(phi) * r * radius, y * radius * 0.72, Math.sin(phi) * r * radius]
}

export const skillNodes = nodeNames.map((name, i) => ({
  id: name,
  name,
  category: categoryOf[name].category,
  color: categoryOf[name].color,
  description: categoryOf[name].description,
  position: spherePosition(i, nodeNames.length, 3.1),
}))

// Build undirected edges from real project co-occurrence.
const edgeMap = new Map()

for (const project of projects) {
  const present = [...new Set(project.technologies.map(normalize).filter(Boolean))]
  for (let i = 0; i < present.length; i++) {
    for (let j = i + 1; j < present.length; j++) {
      const [a, b] = [present[i], present[j]].sort()
      const key = `${a}|${b}`
      const existing = edgeMap.get(key)
      if (existing) {
        existing.projects.push(project.name)
      } else {
        edgeMap.set(key, { source: a, target: b, projects: [project.name] })
      }
    }
  }
}

export const skillEdges = [...edgeMap.values()]

/** Neighbour lookup so hover can light up everything a node connects to. */
export const neighboursOf = skillNodes.reduce((acc, node) => {
  acc[node.id] = skillEdges
    .filter((e) => e.source === node.id || e.target === node.id)
    .map((e) => (e.source === node.id ? e.target : e.source))
  return acc
}, {})

/** Which real projects a technology appears in — shown on activation. */
export const projectsUsing = skillNodes.reduce((acc, node) => {
  acc[node.id] = projects
    .filter((p) => p.technologies.map(normalize).filter(Boolean).includes(node.id))
    .map((p) => p.name)
  return acc
}, {})
