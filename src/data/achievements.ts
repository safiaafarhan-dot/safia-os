export const achievements = [
  {
    id: "nptel-affective",
    title: "Elite NPTEL Certification – Affective Computing",
    issuer: "NPTEL, IIT Madras & IIIT Delhi",
    date: "2026-04",
    category: "Certification",
    description: "Successfully completed a 12-week NPTEL course with Elite certification and 66% consolidated score",
    details: "Gained knowledge of affective computing and human-centered AI development",
    verified: true,
    verificationLink: "https://nptel.ac.in",
    icon: "🏆"
  },
  {
    id: "nptel-industry40",
    title: "Elite NPTEL Certification – Industry 4.0 & IoT",
    issuer: "NPTEL, IIT Madras & IIT Kharagpur",
    date: "2025-04",
    category: "Certification",
    description: "Successfully completed a 12-week NPTEL course with Elite certification and 60% consolidated score",
    details: "Gained knowledge of Industry 4.0, IoT, and modern industrial technologies",
    verified: true,
    verificationLink: "https://nptel.ac.in",
    icon: "🔧"
  },
  {
    id: "nptel-software-testing",
    title: "NPTEL Certification – Software Testing",
    issuer: "NPTEL, IIT Madras & IIIT Bangalore",
    date: "2025-10",
    category: "Certification",
    description: "Successfully completed a 12-week NPTEL course with 52% consolidated score",
    details: "Developed foundational knowledge of software testing methodologies and practices",
    verified: true,
    verificationLink: "https://nptel.ac.in",
    icon: "✓"
  },
  {
    id: "nptel-soft-skills",
    title: "Elite NPTEL Certification – Soft Skills & Personality",
    issuer: "NPTEL, IIT Madras & IIT Kanpur",
    date: "2024-04",
    category: "Certification",
    description: "Successfully completed an 8-week NPTEL course with Elite certification and 61% consolidated score",
    details: "Strengthened professional communication, soft skills, and personality development",
    verified: true,
    verificationLink: "https://nptel.ac.in",
    icon: "⭐"
  },
  {
    id: "cttc-aiml-internship",
    title: "AI/ML Internship Completion",
    issuer: "Central Tool Room & Training Centre (CTTC)",
    date: "2025-07",
    category: "Internship",
    description: "Successfully completed a 2-month AI/ML focused internship",
    details: "Gained practical experience in machine learning, data analysis, and AI applications",
    verified: true,
    verificationLink: null,
    icon: "🤖"
  },
  {
    id: "ocac-java-internship",
    title: "Java Programming Internship Completion",
    issuer: "Odisha Computer Application Centre (OCAC)",
    date: "2024-08",
    category: "Internship",
    description: "Successfully completed a 1-month Java programming internship",
    details: "Developed strong foundation in Java programming and OOP concepts",
    verified: true,
    verificationLink: null,
    icon: "☕"
  },
  {
    id: "bput-hackathon",
    title: "Hackathon Participant",
    issuer: "Biju Patnaik University of Technology (BPUT)",
    date: "2025",
    category: "Hackathon",
    description: "Participated in university-level hackathon competition",
    details: "Gained experience in rapid problem-solving, teamwork, and technical innovation",
    verified: true,
    verificationLink: null,
    icon: "💡"
  },
  {
    id: "skill-ai-ml",
    title: "AI/ML Skill Achievement",
    issuer: "Technical Learning Milestone",
    date: "2025-12",
    category: "Skill",
    description: "Developed practical skills in machine learning and AI development",
    details: "Through academic projects and hands-on learning: model development, training, deployment",
    verified: true,
    verificationLink: null,
    icon: "🎯"
  },
  {
    id: "skill-python",
    title: "Python Programming Proficiency",
    issuer: "Technical Learning Milestone",
    date: "2026",
    category: "Skill",
    description: "Developed practical proficiency in Python programming",
    details: "Data processing, automation, AI/ML development using Python libraries",
    verified: true,
    verificationLink: null,
    icon: "🐍"
  },
  {
    id: "skill-data-science",
    title: "Data Science Skills",
    issuer: "Technical Learning Milestone",
    date: "2025-12",
    category: "Skill",
    description: "Developed data science and analytics skills",
    details: "Data preprocessing, EDA, visualization, and data-driven problem solving",
    verified: true,
    verificationLink: null,
    icon: "📊"
  }
];

export const achievementCategories = {
  Certification: "Academic certifications and course completions",
  Internship: "Professional internship experiences",
  Hackathon: "Hackathon and competition participation",
  Skill: "Technical skill achievements and milestones"
};

export const getAchievementsByCategory = (category) =>
  achievements.filter(a => a.category === category);
