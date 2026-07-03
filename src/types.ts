export type Section = "Math" | "Verbal";

export type Difficulty = "Easy" | "Medium" | "Hard";

export type Question = {
  id: string;
  section: Section;
  domain: string;
  skill: string;
  difficulty: Difficulty;
  prompt: string;
  imagePath?: string;
  choiceImagePaths?: string[];
  choices: string[];
  correctIndex: number;
  acceptedAnswers?: string[];
  explanation: string;
  estimatedTimeSeconds?: number;
};

export type AnswerRecord = {
  questionId: string;
  selectedIndex: number;
  freeResponse?: string;
  correct: boolean;
  answeredAt: string;
};

export type UserProfile = {
  id: string;
  fullName: string;
  nickname: string;
  age: number;
  gmail: string;
  email: string;
  name: string;
  joinedAt: string;
};
