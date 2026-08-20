export const skillCategories = {
  "Core AI/ML": {
    color: "#b3122e",
    skills: [
      { name: "Machine Learning", proficiency: "expert", description: "Model development, training, evaluation" },
      { name: "Deep Learning", proficiency: "expert", description: "Neural networks, CNN, model architecture" },
      { name: "Generative AI", proficiency: "expert", description: "LLMs, prompt engineering, AI APIs" },
      { name: "Data Analysis", proficiency: "expert", description: "Data preprocessing, EDA, insights" },
      { name: "Computer Vision", proficiency: "advanced", description: "Image processing, object detection" }
    ]
  },
  "Programming Languages": {
    color: "#a8a8ad",
    skills: [
      { name: "Python", proficiency: "expert", description: "ML, data analysis, automation, backend" },
      { name: "JavaScript", proficiency: "advanced", description: "Frontend, interactive UI" },
      { name: "Java", proficiency: "intermediate", description: "OOP, core programming concepts" },
      { name: "SQL", proficiency: "advanced", description: "Database design, queries, optimization" },
      { name: "HTML/CSS", proficiency: "advanced", description: "Web markup, styling, responsive design" }
    ]
  },
  "ML Libraries & Frameworks": {
    color: "#8f5460",
    skills: [
      { name: "TensorFlow/Keras", proficiency: "advanced", description: "Deep learning frameworks" },
      { name: "Scikit-learn", proficiency: "advanced", description: "Machine learning algorithms" },
      { name: "Pandas", proficiency: "expert", description: "Data manipulation, analysis" },
      { name: "NumPy", proficiency: "expert", description: "Numerical computing" },
      { name: "OpenCV", proficiency: "intermediate", description: "Computer vision processing" }
    ]
  },
  "Web & Backend": {
    color: "#71727a",
    skills: [
      { name: "React.js", proficiency: "advanced", description: "Frontend framework, UI components" },
      { name: "Flask", proficiency: "intermediate", description: "Python web framework" },
      { name: "REST APIs", proficiency: "advanced", description: "API design, integration" },
      { name: "Git", proficiency: "advanced", description: "Version control, collaboration" }
    ]
  },
  "Tools & Technologies": {
    color: "#55565e",
    skills: [
      { name: "Jupyter Notebook", proficiency: "expert", description: "Data science workflow" },
      { name: "Google Colab", proficiency: "advanced", description: "Cloud ML development" },
      { name: "APIs Integration", proficiency: "advanced", description: "DeepSeek, OpenAI, Google APIs" },
      { name: "PyAutoGUI", proficiency: "intermediate", description: "Desktop automation" }
    ]
  }
};

export const allSkills = Object.values(skillCategories)
  .flatMap(category => category.skills)
  .map((skill, idx) => ({ ...skill, id: idx }));

// Network visualization data
export const skillNetwork = {
  center: { name: "AI/ML Developer", id: "center", color: "#b3122e" },
  nodes: [
    { name: "Machine Learning", category: "Core AI/ML", connections: 8 },
    { name: "Deep Learning", category: "Core AI/ML", connections: 7 },
    { name: "Generative AI", category: "Core AI/ML", connections: 6 },
    { name: "Computer Vision", category: "Core AI/ML", connections: 5 },
    { name: "Python", category: "Languages", connections: 9 },
    { name: "Data Analysis", category: "Core AI/ML", connections: 8 },
    { name: "TensorFlow", category: "ML Frameworks", connections: 7 },
    { name: "React.js", category: "Web", connections: 6 },
    { name: "SQL", category: "Databases", connections: 6 },
    { name: "Flask", category: "Web", connections: 5 },
    { name: "APIs", category: "Integration", connections: 7 },
    { name: "Git", category: "Tools", connections: 6 }
  ]
};
