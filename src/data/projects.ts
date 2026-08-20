export const projects = [
  {
    id: "jarvis",
    number: "01",
    name: "JARVIS",
    category: "AI Personal Assistant",
    tagline: "Voice-controlled intelligent automation",
    description: "A voice-controlled AI assistant designed to interact with the user through voice commands, understand natural-language instructions, and perform tasks on the computer.",
    shortDescription: "Voice-controlled personal AI assistant with multilingual support and computer automation capabilities",
    problem: "Users need a hands-free, intelligent way to control their computers and get information through natural conversation",
    solution: "Developed a Python-based voice assistant that listens to commands, processes them with an LLM, and executes actions",
    technologies: ["Python", "DeepSeek R1 API", "SpeechRecognition", "PyAudio", "pyttsx3", "gTTS", "Google Translate", "PyAutoGUI", "Resemblyzer"],
    features: {
      implemented: [
        "Voice command recognition and processing",
        "Text-to-speech responses",
        "Speech-to-text interaction",
        "Multilingual support (Hindi, English, Odia)",
        "Computer control using PyAutoGUI",
        "LLM/API integration for intelligent responses",
        "Wake-word detection ('Jarvis')",
        "Natural language command processing",
        "Translation functionality"
      ],
      exploring: [
        "Voice authentication and user identification",
        "Advanced computer automation",
        "Contextual memory and conversation history",
        "Real-time voice interaction optimization",
        "Multi-user conversation support",
        "Advanced agent-like task execution",
        "Integration with modern LLMs",
        "Security and authentication improvements"
      ]
    },
    status: "Active Development 🚧",
    imageUrl: "/projects/jarvis-hero.jpg",
    github: "https://github.com/SafiyaFarhan-byte",
    liveDemo: null,
    caseStudy: {
      challenge: "Building a voice-controlled assistant that understands natural language, supports multiple languages, and can control a computer system without explicit programming for every command.",
      solution: "Leveraged speech recognition APIs, integrated DeepSeek LLM for natural language understanding, used text-to-speech for responses, and PyAutoGUI for system control.",
      results: "Successfully created a functional voice assistant capable of understanding commands in multiple languages and performing system automation tasks",
      keyLearnings: [
        "Speech processing and audio handling",
        "LLM API integration and prompt engineering",
        "Multi-language support",
        "System automation and PyAutoGUI",
        "Real-time audio processing challenges"
      ]
    }
  },
  {
    id: "quickbite",
    number: "02",
    name: "QuickBite",
    category: "Food Delivery Platform",
    tagline: "Modern full-stack food delivery experience",
    description: "A food-delivery web application inspired by platforms like Zomato and Swiggy, providing users with a convenient interface to discover restaurants, explore menus, and place orders.",
    shortDescription: "Full-stack food delivery platform with restaurant discovery, menu browsing, and ordering system",
    problem: "Users need an intuitive way to discover restaurants, browse food options, and place orders online",
    solution: "Developed a full-stack web application with frontend UI, backend APIs, and database integration for managing restaurants and orders",
    technologies: ["HTML", "CSS", "JavaScript", "Python", "Flask", "REST APIs", "SQL"],
    features: {
      implemented: [
        "Restaurant and food-item browsing",
        "Advanced search functionality",
        "Interactive menu displays",
        "Add-to-cart functionality",
        "Complete food-order workflow",
        "User-friendly interface",
        "Responsive design across devices",
        "Frontend-backend API integration",
        "Database integration"
      ],
      exploring: [
        "User authentication and accounts",
        "Order tracking system",
        "Payment gateway integration",
        "Restaurant dashboard",
        "Review and rating system"
      ]
    },
    status: "In Development 🟡",
    imageUrl: "/projects/quickbite-hero.jpg",
    github: "https://github.com/SafiyaFarhan-byte",
    liveDemo: null,
    caseStudy: {
      challenge: "Creating a seamless experience for restaurant discovery and food ordering with responsive design and backend data management",
      solution: "Built a full-stack application with React/HTML frontend, Flask backend, and SQL database, implementing REST APIs for communication",
      results: "Functional food delivery platform with restaurant discovery, menu browsing, and cart management",
      keyLearnings: [
        "Full-stack web development",
        "API design and integration",
        "Database schema design",
        "Responsive UI/UX implementation",
        "Frontend-backend synchronization"
      ]
    }
  },
  {
    id: "distracted-driver",
    number: "03",
    name: "Distracted Driver Detection",
    category: "Computer Vision & Deep Learning",
    tagline: "AI-powered driving behavior analysis",
    description: "A deep learning-based computer vision system that classifies driver behavior from images to identify potentially dangerous distracted-driving activities and improve road safety.",
    shortDescription: "CNN-based system for classifying driver behavior and detecting distracted driving activities",
    problem: "Road safety is compromised by distracted driving behaviors that are difficult to monitor manually. There's a need for automated detection systems.",
    solution: "Developed a CNN-based image classification model trained on the State Farm dataset to identify different driver behaviors",
    technologies: ["Python", "TensorFlow/Keras", "OpenCV", "NumPy", "Pandas", "Scikit-learn", "Jupyter Notebook"],
    features: {
      implemented: [
        "Driver behavior image classification",
        "Detection of distracted driving activities",
        "Multi-class classification system",
        "Data preprocessing pipeline",
        "Model training and evaluation",
        "Confusion matrix analysis",
        "Visualization of results"
      ],
      exploring: [
        "Real-time video detection",
        "Integration with vehicle systems",
        "Model optimization for edge devices",
        "Transfer learning improvements",
        "Performance tuning"
      ]
    },
    status: "Active Development 🟡",
    imageUrl: "/projects/driver-detection-hero.jpg",
    github: "https://github.com/SafiyaFarhan-byte",
    liveDemo: null,
    caseStudy: {
      challenge: "Creating an accurate deep learning model that can classify various driver behaviors from images with high accuracy and generalize to different lighting and camera angles",
      solution: "Used CNN architecture, trained on State Farm dataset with preprocessing, data augmentation, and careful hyperparameter tuning",
      results: "Functional image classification system for driver behavior detection with model evaluation metrics",
      keyLearnings: [
        "Computer vision and image processing",
        "Deep learning model architecture design",
        "Data preprocessing and augmentation",
        "Model training and hyperparameter tuning",
        "Performance evaluation metrics"
      ]
    }
  }
];

export const getProjectById = (id) => projects.find(p => p.id === id);
