import type { Difficulty, Question, Section } from "../types";
import rawQuestionBank from "./question-bank.json";

type RawQuestion = {
  id: string;
  section: Section | "Reading & Writing";
  domain: string;
  skill: string;
  difficulty: Difficulty;
  question: string;
  image_path?: string;
  choice_image_paths?: string[];
  choices: string[];
  correct_answer: string;
  accepted_answers?: string[];
  explanation: string;
  estimated_time_seconds?: number;
};

const rawQuestions = rawQuestionBank as RawQuestion[];
const normalizeSection = (section: RawQuestion["section"]): Section => (section === "Reading & Writing" ? "Verbal" : section);
const withAssetVersion = (path?: string) => (path ? `${path}?v=math-advanced-20260702` : undefined);

export const questions: Question[] = rawQuestions.map((item) => {
  const correctIndex = item.choices.findIndex((choice) => choice === item.correct_answer);

  return {
    id: item.id,
    section: normalizeSection(item.section),
    domain: item.domain,
    skill: item.skill,
    difficulty: item.difficulty,
    prompt: item.question,
    imagePath: withAssetVersion(item.image_path),
    choiceImagePaths: item.choice_image_paths?.map((path) => withAssetVersion(path) ?? path),
    choices: item.choices,
    correctIndex: correctIndex >= 0 ? correctIndex : 0,
    acceptedAnswers: item.accepted_answers,
    explanation: item.explanation,
    estimatedTimeSeconds: item.estimated_time_seconds,
  };
});

export const sourceNote =
  "Question bank is loaded from local 4sat exports. Verbal modules are filled from each provided PDF by subtopic and module.";
