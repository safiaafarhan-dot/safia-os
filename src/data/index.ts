export const socials = [
  {
    name: "LinkedIn",
    url: "https://www.linkedin.com/in/safiaa-farhan",
    icon: "linkedin",
    description: "Professional profile and network"
  },
  {
    name: "GitHub",
    url: "https://github.com/SafiyaFarhan-byte",
    icon: "github",
    description: "Projects and code repositories"
  },
  {
    name: "Email",
    url: "safiafarhan999@gmail.com",
    icon: "email",
    description: "Direct contact"
  }
];

export const contact = {
  email: "safiafarhan999@gmail.com",
  emailService: "gmail",
  phone: null,
  location: "Bhubaneswar, India",
  timezone: "IST (UTC +5:30)",
  availability: "Open to opportunities, collaborations, and discussions"
};

export const resume = {
  url: "/resume/Safia_Farhan_Resume.pdf",
  viewerEnabled: true,
  downloadEnabled: true,
  lastUpdated: "2026-08-17"
};

export const personalBrand = {
  name: "Safia Farhan",
  title: "AI/ML FULL-STACK ENGINEER",
  secondaryTitle: "DATA ANALYST",
  tagline: "Building intelligent systems and immersive digital experiences",
  description: "Safia is not just learning technology. Safia builds technology.",
  expertise: [
    "Artificial Intelligence",
    "Machine Learning",
    "Generative AI",
    "Large Language Models",
    "AI Agents",
    "Computer Vision",
    "Full-Stack Development",
    "Data Analysis",
    "Automation",
    "Interactive Digital Experiences"
  ],
  personality: [
    "Passionate about emerging AI technologies",
    "Continuous learner and experimenter",
    "Combines engineering with creativity",
    "Focuses on building practical, real-world solutions",
    "Interested in AI for social impact"
  ]
};

export const navigation = [
  { id: "01", label: "About", href: "about" },
  { id: "02", label: "Skills", href: "skills" },
  { id: "03", label: "Experience", href: "experience" },
  { id: "04", label: "Projects", href: "projects" },
  { id: "05", label: "AI Lab", href: "ailab" },
  { id: "06", label: "Achievements", href: "achievements" },
  { id: "07", label: "Contact", href: "contact" }
];
// NOTE: a "Resume" entry was removed — it linked to a #resume section that does
// not exist and a PDF that is not in /public. Restore both together, not just one.
