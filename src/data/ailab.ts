export const aiLabExperiments = [
  {
    id: "nurani",
    name: "NURANI",
    category: "Voice AI",
    status: "Exploring",
    description: "AI Voice Assistant with advanced conversational capabilities",
    tags: ["Voice", "NLP", "Conversational AI", "LLMs"],
    technologies: ["Python", "Speech Recognition", "LLMs", "Text-to-Speech"],
    learnings: "Building voice-based AI interactions",
    demoUrl: null
  },
  {
    id: "thyroid-detection",
    name: "Thyroid Disease Detection",
    category: "Computer Vision",
    status: "Implemented",
    description: "Deep learning model for detecting thyroid diseases from medical images",
    tags: ["Deep Learning", "Medical AI", "Image Classification", "Healthcare"],
    technologies: ["Python", "TensorFlow", "OpenCV", "Medical Imaging"],
    learnings: "Applying AI to healthcare problems",
    demoUrl: null
  },
  {
    id: "crm-ai",
    name: "CRM.AI",
    category: "AI Automation",
    status: "In Development",
    description: "AI-powered Customer Relationship Management system with intelligent features",
    tags: ["LLMs", "Automation", "Business AI", "APIs"],
    technologies: ["Python", "Flask", "LLM APIs", "Database"],
    learnings: "Building enterprise AI solutions",
    demoUrl: null
  },
  {
    id: "mental-health",
    name: "Mental Health Support Platform",
    category: "Generative AI",
    status: "Exploring",
    description: "AI-driven platform for mental health support and wellness",
    tags: ["Generative AI", "NLP", "Conversational", "Wellness"],
    technologies: ["Python", "LLMs", "Backend", "UI/UX"],
    learnings: "AI for social impact and wellbeing",
    demoUrl: null
  },
  {
    id: "rag-system",
    name: "RAG Knowledge System",
    category: "LLM Applications",
    status: "Exploring",
    description: "Retrieval-Augmented Generation system for domain-specific knowledge",
    tags: ["RAG", "LLMs", "Knowledge Base", "Semantic Search"],
    technologies: ["Python", "LLM APIs", "Vector DB", "Embeddings"],
    learnings: "Building knowledge-aware AI systems",
    demoUrl: null
  },
  {
    id: "ai-agents",
    name: "Agentic AI Experiments",
    category: "AI Agents",
    status: "Exploring",
    description: "Building autonomous AI agents capable of reasoning and tool use",
    tags: ["Agents", "Reasoning", "Tool Use", "Automation"],
    technologies: ["Python", "LLM APIs", "Agent Frameworks", "Tools"],
    learnings: "Creating autonomous AI systems",
    demoUrl: null
  },
  {
    id: "vision-nlp",
    name: "Vision + NLP Fusion",
    category: "Generative AI",
    status: "Exploring",
    description: "Combining computer vision with natural language for multimodal AI",
    tags: ["Multimodal", "Vision", "NLP", "AI"],
    technologies: ["Python", "Vision APIs", "LLMs", "Fusion"],
    learnings: "Multimodal AI applications",
    demoUrl: null
  },
  {
    id: "automation-tools",
    name: "AI-Powered Automation Tools",
    category: "AI Automation",
    status: "Exploring",
    description: "Tools and scripts for intelligent automation of repetitive tasks",
    tags: ["Automation", "Productivity", "Tools", "Python"],
    technologies: ["Python", "APIs", "Scripting", "Automation"],
    learnings: "Building practical AI tools",
    demoUrl: null
  }
];

export const aiLabCategories = [
  "LLM Applications",
  "Generative AI",
  "Voice AI",
  "Computer Vision",
  "AI Automation",
  "AI Agents",
  "Experimental Projects"
];

export const getExperimentsByCategory = (category) =>
  aiLabExperiments.filter(exp => exp.category === category);

export const getExperimentById = (id) =>
  aiLabExperiments.find(exp => exp.id === id);
