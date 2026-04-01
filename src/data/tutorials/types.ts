export interface TutorialStep {
  title: string;
  content: string;
  tip?: string;
  warning?: string;
  code?: string;
  scenario?: string;
}

export interface TroubleshootingItem {
  problem: string;
  cause: string;
  solution: string;
  code?: string;
}

export interface Tutorial {
  id: string;
  title: string;
  description: string;
  category: string;
  difficulty: "beginner" | "intermediate" | "advanced" | "expert";
  estimatedTime: string;
  steps: TutorialStep[];
  tags: string[];
  prerequisites?: string[];
  videoId?: string;
  troubleshooting?: TroubleshootingItem[];
  realWorldScenarios?: { title: string; description: string }[];
}

export interface FAQ {
  question: string;
  answer: string;
  category: string;
}
