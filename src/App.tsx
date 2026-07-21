import {
  BarChart3,
  Bookmark,
  BookOpenCheck,
  Calculator,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  DoorOpen,
  FileText,
  FileQuestion,
  Gauge,
  Highlighter,
  Home,
  LibraryBig,
  NotebookTabs,
  MoreHorizontal,
  MessageCircle,
  Rocket,
  RotateCcw,
  Search,
  Send,
  SlidersHorizontal,
  Sparkle,
  Star,
  Trophy,
  UserPlus,
  UserRound,
  Users,
  Video,
  X,
} from "lucide-react";
import { CSSProperties, FormEvent, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { questions, sourceNote } from "./data/questions";
import vocabularyData from "./data/vocabulary.json";
import {
  answerArenaQuestion,
  acceptFriendRequest,
  addFriend,
  awardUserElo,
  clearStoredUser,
  configureArenaRoom,
  createArenaRoom,
  getAnswers,
  getArenaRoom,
  getFriendMessages,
  getFriendRequests,
  getFriends,
  getStoredUser,
  getUserProfile,
  joinArenaRoom,
  loginUser,
  registerUser,
  resetAnswers,
  saveAnswer,
  saveStoredUser,
  searchFriend,
  sendFriendMessage,
  startArenaRoom,
  type ArenaRoom,
  type FriendMessage,
  type FriendRequest,
} from "./storage";
import type { AnswerRecord, Difficulty, Question, Section, UserProfile } from "./types";

const sections: Section[] = ["Verbal", "Math"];
const verbalDomains = ["Information and Ideas", "Craft and Structure", "Expression of Ideas", "Standard English Conventions"];
const verbalModules: Record<string, string[]> = {
  "Information and Ideas": ["Central Ideas and Details", "Inferences", "Command of Evidence"],
  "Expression of Ideas": ["Rhetorical Synthesis", "Transitions"],
  "Craft and Structure": ["Cross-Text Connections", "Text Structure and Purpose", "Words in Context"],
  "Standard English Conventions": ["Boundaries", "Form, Structure, and Sense"],
};
const mathDomains = ["Algebra", "Advanced Math", "Problem-Solving and Data Analysis", "Geometry and Trigonometry"];
const mathModules: Record<string, string[]> = {
  Algebra: [
    "Linear equations in one variable",
    "Linear functions",
    "Linear equations in two variables",
    "Systems of two linear equations in two variables",
    "Linear inequalities in one or two variables",
  ],
  "Advanced Math": [
    "Equivalent expressions",
    "Nonlinear equations in one variable and systems of equations in two variables",
    "Nonlinear functions",
  ],
  "Problem-Solving and Data Analysis": [
    "Ratios, rates, proportional relationships, and units",
    "Percentages",
    "One-variable data: Distributions and measures of center and spread",
    "Two-variable data: Models and scatterplots",
    "Probability and conditional probability",
    "Inference from sample statistics and margin of error",
    "Evaluating statistical claims: Observational studies and experiments",
  ],
  "Geometry and Trigonometry": ["Area and volume", "Lines, angles, and triangles", "Right triangles and trigonometry", "Circles"],
};
type VocabularyCard = {
  word: string;
  meaning: string;
  example: string;
  source?: string;
  difficulty?: VocabularyDifficulty;
};
type VocabularyDifficulty = "Easy" | "Medium" | "Hard";
type VocabularyMode = "flashcards" | "matching" | "sentence" | "library";
type SentenceFeedback = { status: "success" | "improve"; title: string; message: string };
type MatchingVine = { key: string; path: string; endX: number; endY: number; tone: "selected" | "matched" | "wrong" };

const vocabularyCards = vocabularyData as VocabularyCard[];
const SCORE_PREDICTION_MIN_ANSWERS = 40;
const vocabularyStopWords = new Set(["about", "after", "again", "also", "because", "been", "being", "from", "have", "into", "just", "more", "most", "much", "someone", "something", "that", "their", "there", "these", "they", "this", "through", "very", "what", "when", "where", "which", "while", "with", "without", "your"]);
const familiarVocabularyWords = new Set([
  "abrupt", "abstract", "adequate", "apparent", "assert", "boast", "burden", "compel", "content", "deceive",
  "decree", "deter", "devise", "dilemma", "distinct", "distinguish", "dread", "embrace", "enact", "endorse",
  "feasible", "hostile", "impose", "innovative", "invoke", "lavish", "merely", "mocking", "novel", "objection",
  "optimistic", "petty", "prejudice", "prompt", "prospect", "provoke", "proxy", "quarrel", "radical", "recount",
  "reinforce", "retain", "rigid", "robust", "scorn", "secluded", "skeptical", "sluggish", "spawn", "stimulate",
  "tangible", "vanity", "viable", "yield", "yearn",
]);
const advancedVocabularyWords = new Set([
  "abject", "admonish", "austere", "broach", "candor", "colloquial", "construe", "demur", "engender", "ephemeral",
  "equivocal", "exalt", "fetter", "ignominious", "immure", "inexorable", "inefficacious", "mired", "onerous",
  "paucity", "promulgate", "solicitude", "substantiate", "suffrage", "tumult", "ubiquitous", "vestigial",
]);
const getVocabularyDifficulty = (card: VocabularyCard): VocabularyDifficulty => {
  if (card.difficulty) return card.difficulty;
  const normalizedWord = card.word.toLowerCase().replace(/\s*\([^)]*\)/g, "").replace(/^to\s+/, "").trim();
  if (advancedVocabularyWords.has(normalizedWord)) return "Hard";
  if (familiarVocabularyWords.has(normalizedWord)) return "Easy";
  const letters = normalizedWord.replace(/[^a-z]/g, "");
  const syllables = Math.max(1, letters.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/i, "").match(/[aeiouy]{1,2}/g)?.length ?? 1);
  const hasAdvancedForm = /(acious|escence|escent|ficacious|gnomious|iferous|ibility|ious|istic|ization|ological|phobia|tude|uous)$/i.test(letters);
  if ((letters.length >= 12 && syllables >= 4) || hasAdvancedForm) return "Hard";
  return "Medium";
};
const shuffleVocabulary = <T,>(items: T[]) => [...items]
  .map((item) => ({ item, order: Math.random() }))
  .sort((a, b) => a.order - b.order)
  .map(({ item }) => item);
const difficulties: Array<Difficulty | "All"> = ["All", "Easy", "Medium", "Hard"];
type PracticeHistoryFilter = "All" | "Unanswered" | "Incorrect";
type PracticeQuestionLimit = 10 | 20 | 40 | "All";
type HighlightTone = "yellow" | "mint" | "pink";
type PracticeHighlight = { text: string; tone: HighlightTone };

function HighlightedText({ text, highlights }: { text: string; highlights: PracticeHighlight[] }) {
  const applicable = highlights
    .filter((highlight) => highlight.text.length > 1 && text.toLowerCase().includes(highlight.text.toLowerCase()))
    .sort((a, b) => b.text.length - a.text.length);
  if (!applicable.length) return <>{text}</>;

  const escaped = applicable.map((highlight) => highlight.text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const parts = text.split(new RegExp(`(${escaped.join("|")})`, "gi"));
  return (
    <>
      {parts.map((part, index) => {
        const match = applicable.find((highlight) => highlight.text.toLowerCase() === part.toLowerCase());
        return match ? <mark className={`sat-text-highlight ${match.tone}`} key={`${part}-${index}`}>{part}</mark> : part;
      })}
    </>
  );
}

const unique = (items: string[]) => Array.from(new Set(items));
const domainKey = (question: Pick<Question, "section" | "domain">) => `${question.section}::${question.domain}`;
const topicKey = (question: Pick<Question, "section" | "domain" | "skill">) =>
  `${question.section}::${question.domain}::${question.skill}`;
const sectionLabel = (section: Section) => (section === "Verbal" ? "Reading & Writing" : "Math");
const formatTimer = (seconds: number) => {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
  const remainder = (seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${remainder}`;
};

const normalizeAnswer = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[в€’вЂ“вЂ”]/g, "-")
    .replace(/\s+/g, "")
    .replace(/^0+(?=\d)/, "");

const parseAcceptedAnswers = (question: Question) => {
  if (question.acceptedAnswers?.length) return question.acceptedAnswers;
  const match = question.explanation.match(/Correct answer:\s*([^.]*)\./i);
  if (!match) return [];
  return match[1].split(/,|\bor\b/i).map((item) => item.trim()).filter(Boolean);
};

const answersMatch = (studentAnswer: string, acceptedAnswer: string) => {
  const student = normalizeAnswer(studentAnswer);
  const accepted = normalizeAnswer(acceptedAnswer);
  if (!student || !accepted) return false;
  if (student === accepted) return true;
  const studentNumber = Number(student);
  const acceptedNumber = Number(accepted);
  return Number.isFinite(studentNumber) && Number.isFinite(acceptedNumber) && Math.abs(studentNumber - acceptedNumber) < 0.0005;
};

type ActionBarItem = {
  id: string;
  label: string;
  icon: ReactNode;
  onClick: () => void;
  active?: boolean;
  badge?: string;
};

const splitPrompt = (prompt: string) => {
  const trimmed = prompt.trim();
  const notesPrompt = trimmed.match(/^(.*?following notes:)\s*\n([\s\S]*)$/i);
  if (notesPrompt) {
    const body = notesPrompt[2].trim();
    const studentGoalMatch = body.match(/\n(The student wants[\s\S]*)$/i);
    if (studentGoalMatch) {
      const notesRaw = body.slice(0, body.length - studentGoalMatch[0].length).trim();
      return {
        passage: "",
        questionText: studentGoalMatch[1].replace(/\s+/g, " ").trim(),
        notesIntro: notesPrompt[1].replace(/\s+/g, " ").trim(),
        notes: notesRaw
          .split(/\n+/)
          .map((line) => line.replace(/^[•\-–]\s*/, "").replace(/\s+/g, " ").trim())
          .filter(Boolean),
      };
    }
  }

  const questionStart = Math.max(
    trimmed.lastIndexOf("\nWhich "),
    trimmed.lastIndexOf("\nWhat "),
    trimmed.lastIndexOf("\nBased on "),
    trimmed.lastIndexOf("\nAccording to "),
    trimmed.lastIndexOf("\nWhich choice ")
  );

  if (questionStart <= 0) {
    return { passage: "", questionText: trimmed.replace(/\s+/g, " "), notesIntro: "", notes: [] as string[] };
  }

  const passageRaw = trimmed.slice(0, questionStart).trim();
  const passageLines = passageRaw
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const notesIntro = passageLines.find((line) => /following notes:?$/i.test(line)) ?? "";
  const notes = notesIntro
    ? passageLines
        .slice(passageLines.indexOf(notesIntro) + 1)
        .map((line) => line.replace(/^[•\-–]\s*/, "").trim())
        .filter(Boolean)
    : [];

  return {
    passage: notesIntro
      ? ""
      : passageRaw
          .split(/\n{2,}/)
          .map((paragraph) => paragraph.replace(/\s*\n\s*/g, " ").replace(/\s+/g, " ").trim())
          .filter(Boolean)
          .join("\n\n"),
    questionText: trimmed.slice(questionStart).trim().replace(/\s+/g, " "),
    notesIntro,
    notes,
  };
};

type PracticePaperModule = {
  id: string;
  label: string;
  section: Section;
  moduleNumber: 1 | 2;
  durationMinutes: number;
  questions: Question[];
};

type PracticePaper = {
  id: string;
  title: string;
  dateLabel: string;
  dateSort: string;
  sourceLabel: string;
  status: "available" | "locked";
  tags: string[];
  modules: PracticePaperModule[];
};

type PracticePaperAttempt = {
  id: string;
  paperId: string;
  paperTitle: string;
  mode: "full" | "module";
  moduleIndex?: number;
  label: string;
  completedAt: string;
  elapsedSeconds: number;
  questionIds: string[];
  selectedAnswers: Record<string, number>;
  freeAnswers: Record<string, string>;
  markedForReview: Record<string, boolean>;
  correct: number;
  answered: number;
  total: number;
  accuracy: number;
  estimatedScore: number;
};

type QuestionPickRequest = {
  domain?: string;
  skill?: string;
  difficulty?: Difficulty | Difficulty[];
  responseType?: "mc" | "free";
};

const difficultyRank: Record<Difficulty, number> = { Easy: 0, Medium: 1, Hard: 2 };
const stableQuestionRank = (question: Question) =>
  question.id.split("").reduce((hash, char) => ((hash << 5) - hash + char.charCodeAt(0)) | 0, 0);

const isFreeResponseQuestion = (question: Question) => question.choices.length <= 1;

const isPaperAnswerCorrect = (
  question: Question,
  selectedAnswers: Record<string, number>,
  freeAnswers: Record<string, string>
) => {
  if (isFreeResponseQuestion(question)) {
    const answer = freeAnswers[question.id] ?? "";
    return parseAcceptedAnswers(question).some((accepted) => answersMatch(answer, accepted));
  }
  return selectedAnswers[question.id] === question.correctIndex;
};

const pickQuestions = (
  section: Section,
  requests: QuestionPickRequest[],
  usedIds: Set<string>,
  fallbackPool = questions
) => {
  const picked: Question[] = [];
  const sectionPool = fallbackPool
    .filter((question) => question.section === section)
    .sort((first, second) => stableQuestionRank(first) - stableQuestionRank(second));

  const matchesRequest = (question: Question, request: QuestionPickRequest, strict = true) => {
    const wantedDifficulty = Array.isArray(request.difficulty) ? request.difficulty : request.difficulty ? [request.difficulty] : [];
    const responseMatches =
      !request.responseType ||
      (request.responseType === "free" ? isFreeResponseQuestion(question) : !isFreeResponseQuestion(question));
    const difficultyMatches = !wantedDifficulty.length || wantedDifficulty.includes(question.difficulty);
    return (
      (!strict || !request.domain || question.domain === request.domain) &&
      (!strict || !request.skill || question.skill === request.skill) &&
      difficultyMatches &&
      responseMatches
    );
  };

  requests.forEach((request) => {
    const strictMatch = sectionPool.find((question) => !usedIds.has(question.id) && matchesRequest(question, request, true));
    const relaxedSkillMatch =
      strictMatch ??
      sectionPool.find(
        (question) =>
          !usedIds.has(question.id) &&
          (!request.domain || question.domain === request.domain) &&
          (!request.responseType ||
            (request.responseType === "free" ? isFreeResponseQuestion(question) : !isFreeResponseQuestion(question))) &&
          (!request.difficulty ||
            (Array.isArray(request.difficulty)
              ? request.difficulty.includes(question.difficulty)
              : request.difficulty === question.difficulty))
      );
    const relaxedDifficultyMatch =
      relaxedSkillMatch ??
      sectionPool
        .filter((question) => !usedIds.has(question.id) && matchesRequest(question, { ...request, difficulty: undefined }, true))
        .sort((first, second) => difficultyRank[first.difficulty] - difficultyRank[second.difficulty])[0];
    const anySectionMatch =
      relaxedDifficultyMatch ??
      sectionPool.find(
        (question) =>
          !usedIds.has(question.id) &&
          (!request.responseType ||
            (request.responseType === "free" ? isFreeResponseQuestion(question) : !isFreeResponseQuestion(question)))
      );

    if (!anySectionMatch) return;
    usedIds.add(anySectionMatch.id);
    picked.push(anySectionMatch);
  });

  return picked;
};

const repeatRequests = (request: QuestionPickRequest, count: number) => Array.from({ length: count }, () => request);

const createReadingWritingModule = (
  id: string,
  label: string,
  moduleNumber: 1 | 2,
  usedIds: Set<string>
): PracticePaperModule => {
  const easyMedium: Difficulty[] = moduleNumber === 1 ? ["Easy", "Medium"] : ["Medium", "Hard"];
  const mediumHard: Difficulty[] = moduleNumber === 1 ? ["Medium", "Easy"] : ["Medium", "Hard"];
  const hardBlend: Difficulty[] = moduleNumber === 1 ? ["Medium", "Hard"] : ["Hard", "Medium"];
  const blueprint: QuestionPickRequest[] = [
    ...repeatRequests({ skill: "Words in Context", difficulty: easyMedium, responseType: "mc" }, moduleNumber === 1 ? 4 : 3),
    ...repeatRequests({ skill: "Text Structure and Purpose", difficulty: mediumHard, responseType: "mc" }, 2),
    ...repeatRequests({ skill: "Cross-Text Connections", difficulty: mediumHard, responseType: "mc" }, moduleNumber === 1 ? 1 : 2),
    ...repeatRequests({ skill: "Central Ideas and Details", difficulty: easyMedium, responseType: "mc" }, moduleNumber === 1 ? 4 : 3),
    ...repeatRequests({ skill: "Command of Evidence", difficulty: mediumHard, responseType: "mc" }, moduleNumber === 1 ? 3 : 4),
    ...repeatRequests({ skill: "Inferences", difficulty: hardBlend, responseType: "mc" }, 3),
    ...repeatRequests({ domain: "Standard English Conventions", difficulty: mediumHard, responseType: "mc" }, moduleNumber === 1 ? 7 : 6),
    ...repeatRequests({ skill: "Transitions", difficulty: mediumHard, responseType: "mc" }, 2),
    ...repeatRequests({ skill: "Rhetorical Synthesis", difficulty: moduleNumber === 1 ? "Medium" : ["Medium", "Hard"], responseType: "mc" }, moduleNumber === 1 ? 1 : 2),
  ];

  return {
    id,
    label,
    section: "Verbal",
    moduleNumber,
    durationMinutes: 32,
    questions: pickQuestions("Verbal", blueprint.slice(0, 27), usedIds),
  };
};

const createMathModule = (
  id: string,
  label: string,
  moduleNumber: 1 | 2,
  usedIds: Set<string>
): PracticePaperModule => {
  const domains = [
    "Algebra",
    "Advanced Math",
    "Problem-Solving and Data Analysis",
    "Algebra",
    "Geometry and Trigonometry",
    "Advanced Math",
    "Algebra",
    "Problem-Solving and Data Analysis",
    "Geometry and Trigonometry",
    "Algebra",
    "Advanced Math",
    "Problem-Solving and Data Analysis",
    "Algebra",
    "Geometry and Trigonometry",
    "Advanced Math",
    "Problem-Solving and Data Analysis",
    "Algebra",
    "Advanced Math",
    "Geometry and Trigonometry",
    "Problem-Solving and Data Analysis",
    "Advanced Math",
    "Algebra",
  ];
  const moduleOneDifficulties: Difficulty[] = [
    "Easy",
    "Easy",
    "Easy",
    "Medium",
    "Easy",
    "Medium",
    "Medium",
    "Medium",
    "Medium",
    "Medium",
    "Medium",
    "Medium",
    "Hard",
    "Medium",
    "Hard",
    "Medium",
    "Hard",
    "Hard",
    "Hard",
    "Hard",
    "Hard",
    "Hard",
  ];
  const moduleTwoDifficulties: Difficulty[] = [
    "Medium",
    "Medium",
    "Medium",
    "Medium",
    "Medium",
    "Hard",
    "Medium",
    "Hard",
    "Medium",
    "Hard",
    "Hard",
    "Medium",
    "Hard",
    "Hard",
    "Hard",
    "Hard",
    "Hard",
    "Hard",
    "Hard",
    "Hard",
    "Hard",
    "Hard",
  ];
  const difficultyPattern = moduleNumber === 1 ? moduleOneDifficulties : moduleTwoDifficulties;
  const blueprint = domains.map<QuestionPickRequest>((domain, index) => ({
    domain,
    difficulty: difficultyPattern[index],
    responseType: index >= 17 ? "free" : "mc",
  }));

  return {
    id,
    label,
    section: "Math",
    moduleNumber,
    durationMinutes: 35,
    questions: pickQuestions("Math", blueprint, usedIds),
  };
};

const createFullDigitalSatPracticePaper = (): PracticePaper => {
  const usedIds = new Set<string>();
  const modules = [
    createReadingWritingModule("sat4-rw-m1", "Reading and Writing · Module 1", 1, usedIds),
    createReadingWritingModule("sat4-rw-m2", "Reading and Writing · Module 2", 2, usedIds),
    createMathModule("sat4-math-m1", "Math · Module 1", 1, usedIds),
    createMathModule("sat4-math-m2", "Math · Module 2", 2, usedIds),
  ];

  return {
    id: "sat4-full-practice-1",
    title: "sat4.me Full Digital SAT Practice Test 1",
    dateLabel: "December 2024",
    dateSort: "2024-12-01",
    sourceLabel: "Built from SAT Question Bank · balanced DSAT blueprint",
    status: "available",
    tags: ["Full DSAT", "Reading & Writing", "Math"],
    modules,
  };
};

const practicePapers: PracticePaper[] = [
  {
    id: "sat4-december-2025",
    title: "December 2025 Digital SAT Practice",
    dateLabel: "December 2025",
    dateSort: "2025-12-01",
    sourceLabel: "Official-style paper slot · coming soon",
    status: "locked",
    tags: ["Full DSAT", "Coming soon"],
    modules: [],
  },
  createFullDigitalSatPracticePaper(),
];

const practiceModuleFlowers = [
  { src: "/practice/flowers/lily-bud.png", name: "Lily" },
  { src: "/practice/flowers/rose-bud.png", name: "Rose" },
  { src: "/practice/flowers/tulip-bud.png", name: "Tulip" },
  { src: "/practice/flowers/iris-bud.png", name: "Iris" },
];

export default function App() {
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(() => getStoredUser());
  const [authMode, setAuthMode] = useState<"sign-in" | "sign-up">("sign-up");
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [authPageOpen, setAuthPageOpen] = useState(false);
  const [authMathScore, setAuthMathScore] = useState(730);
  const [authRwScore, setAuthRwScore] = useState(720);
  const [authGoalScore, setAuthGoalScore] = useState(1550);
  const [answersVersion, setAnswersVersion] = useState(0);
  const [activeSection, setActiveSection] = useState<Section>("Verbal");
  const [bankView, setBankView] = useState<"home" | "bank" | "topics" | "papers" | "vocabulary" | "arena" | "study" | "friends">(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("arena") ? "arena" : "home";
  });
  const [activeDomain, setActiveDomain] = useState("All");
  const [activeSkill, setActiveSkill] = useState("All");
  const [activeDifficulty, setActiveDifficulty] = useState<Difficulty | "All">("All");
  const [query, setQuery] = useState("");
  const [activeQuestionId, setActiveQuestionId] = useState(questions[0].id);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [freeResponseValue, setFreeResponseValue] = useState("");
  const [eliminatedChoices, setEliminatedChoices] = useState<Record<string, number[]>>({});
  const [wrongPracticeChoices, setWrongPracticeChoices] = useState<Record<string, number[]>>({});
  const [reviewQuestionIds, setReviewQuestionIds] = useState<string[]>([]);
  const [shareQuestion, setShareQuestion] = useState<Question | null>(null);
  const [activeStudyRoomId, setActiveStudyRoomId] = useState("");
  const [studyDockMinimized, setStudyDockMinimized] = useState(false);
  const [openExplanationIds, setOpenExplanationIds] = useState<string[]>([]);
  const [practiceMode, setPracticeMode] = useState(false);
  const [selectedTopicKeys, setSelectedTopicKeys] = useState<string[]>([]);
  const [practiceQuestionIds, setPracticeQuestionIds] = useState<string[]>([]);
  const [topicFiltersOpen, setTopicFiltersOpen] = useState(false);
  const [topicOptionsOpen, setTopicOptionsOpen] = useState(false);
  const [practiceHistoryFilter, setPracticeHistoryFilter] = useState<PracticeHistoryFilter>("All");
  const [practiceQuestionLimit, setPracticeQuestionLimit] = useState<PracticeQuestionLimit>("All");
  const [practiceShuffle, setPracticeShuffle] = useState(true);
  const [topicBuilderMessage, setTopicBuilderMessage] = useState("");
  const [highlightToolOpen, setHighlightToolOpen] = useState(false);
  const [highlightTone, setHighlightTone] = useState<HighlightTone>("yellow");
  const [questionHighlights, setQuestionHighlights] = useState<Record<string, PracticeHighlight[]>>({});
  const [referenceOpen, setReferenceOpen] = useState(false);
  const [moreToolsOpen, setMoreToolsOpen] = useState(false);
  const [practiceTextScale, setPracticeTextScale] = useState<"standard" | "large">("standard");
  const [lineFocusEnabled, setLineFocusEnabled] = useState(false);
  const [lineFocusY, setLineFocusY] = useState(360);
  const [calculatorOpen, setCalculatorOpen] = useState(false);
  const [calculatorDragging, setCalculatorDragging] = useState(false);
  const [calculatorFrame, setCalculatorFrame] = useState({ x: 920, y: 92, width: 430, height: 540 });
  const [practiceStartedAt, setPracticeStartedAt] = useState(Date.now());
  const [practiceTimerHidden, setPracticeTimerHidden] = useState(false);

  useEffect(() => {
    if (!currentUser?.id) return;
    getUserProfile(currentUser.id)
      .then((user) => {
        saveStoredUser(user);
        setCurrentUser(user);
      })
      .catch(() => undefined);
  }, [currentUser?.id]);
  const [currentTime, setCurrentTime] = useState(Date.now());
  const authProjectedScore = authMathScore + authRwScore;
  const authScoreDelta = authProjectedScore - 1450;
  const authGoalGap = authGoalScore - authProjectedScore;
  const authGoalStatus = authGoalGap <= 0 ? "Goal reached" : authGoalGap <= 80 ? "On track" : "Focus plan";
  const authGoalFill = ((authGoalScore - 400) / 1200) * 100;

  const answers = useMemo(() => (currentUser ? getAnswers(currentUser.id) : []), [currentUser, answersVersion]);
  const currentQuestionIds = useMemo(() => new Set(questions.map((question) => question.id)), []);
  const currentAnswers = useMemo(
    () => answers.filter((answer) => currentQuestionIds.has(answer.questionId)),
    [answers, currentQuestionIds]
  );
  const answerMap = useMemo(() => new Map(currentAnswers.map((answer) => [answer.questionId, answer])), [currentAnswers]);

  useEffect(() => {
    if (!practiceMode) return;
    const timer = window.setInterval(() => setCurrentTime(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [practiceMode]);

  const domains = useMemo(
    () => [
      "All",
      ...(activeSection === "Verbal"
        ? verbalDomains
        : mathDomains),
    ],
    [activeSection]
  );

  const modules = useMemo(() => {
    if (activeSection === "Verbal") {
      const domainModules =
        activeDomain === "All" ? Object.values(verbalModules).flat() : verbalModules[activeDomain] ?? [];
      return ["All", ...domainModules];
    }
    const domainModules = activeDomain === "All" ? Object.values(mathModules).flat() : mathModules[activeDomain] ?? [];
    return ["All", ...domainModules];
  }, [activeDomain, activeSection]);

  const filteredQuestions = useMemo(() => {
    if (practiceMode && practiceQuestionIds.length > 0) {
      const questionById = new Map(questions.map((question) => [question.id, question]));
      return practiceQuestionIds
        .map((questionId) => questionById.get(questionId))
        .filter((question): question is Question => Boolean(question));
    }

    const normalizedQuery = query.trim().toLowerCase();
    return questions.filter((question) => {
      const matchesSection = question.section === activeSection;
      const matchesDomain = activeDomain === "All" || question.domain === activeDomain;
      const matchesSkill = activeSkill === "All" || question.skill === activeSkill;
      const matchesDifficulty = activeDifficulty === "All" || question.difficulty === activeDifficulty;
      const matchesQuery =
        !normalizedQuery ||
        [question.prompt, question.domain, question.skill].some((value) => value.toLowerCase().includes(normalizedQuery));
      return matchesSection && matchesDomain && matchesSkill && matchesDifficulty && matchesQuery;
    });
  }, [activeDifficulty, activeDomain, activeSection, activeSkill, practiceMode, practiceQuestionIds, query]);

  const activeQuestion = filteredQuestions.find((question) => question.id === activeQuestionId) ?? filteredQuestions[0] ?? null;
  const activeAnswer = activeQuestion ? answerMap.get(activeQuestion.id) : undefined;
  const explanationOpen = activeQuestion ? openExplanationIds.includes(activeQuestion.id) : false;
  const filteredAnsweredCount = filteredQuestions.filter((question) => answerMap.has(question.id)).length;
  const sessionComplete = filteredQuestions.length > 0 && filteredAnsweredCount === filteredQuestions.length;
  const activeQuestionIndex = activeQuestion ? filteredQuestions.findIndex((question) => question.id === activeQuestion.id) : -1;
  const activePrompt = activeQuestion ? splitPrompt(activeQuestion.prompt) : null;

  const domainProgress = useMemo(() => {
    return questions.reduce<Record<string, { answered: number; total: number }>>((progress, question) => {
      const key = domainKey(question);
      const current = progress[key] ?? { answered: 0, total: 0 };
      progress[key] = {
        answered: current.answered + (answerMap.has(question.id) ? 1 : 0),
        total: current.total + 1,
      };
      return progress;
    }, {});
  }, [answerMap]);

  const topicProgress = useMemo(() => {
    return questions.reduce<Record<string, { answered: number; total: number }>>((progress, question) => {
      const key = topicKey(question);
      const current = progress[key] ?? { answered: 0, total: 0 };
      progress[key] = {
        answered: current.answered + (answerMap.has(question.id) ? 1 : 0),
        total: current.total + 1,
      };
      return progress;
    }, {});
  }, [answerMap]);

  const skillProgress = useMemo(() => {
    return questions.reduce<Record<string, { answered: number; total: number }>>((progress, question) => {
      const key = `${question.section}::${question.skill}`;
      const current = progress[key] ?? { answered: 0, total: 0 };
      progress[key] = {
        answered: current.answered + (answerMap.has(question.id) ? 1 : 0),
        total: current.total + 1,
      };
      return progress;
    }, {});
  }, [answerMap]);

  const sectionStats = sections.map((section) => {
    const sectionQuestions = questions.filter((question) => question.section === section);
    const answered = sectionQuestions.filter((question) => answerMap.has(question.id));
    const correct = answered.filter((question) => answerMap.get(question.id)?.correct);
    return {
      section,
      total: sectionQuestions.length,
      answered: answered.length,
      correct: correct.length,
      accuracy: answered.length ? Math.round((correct.length / answered.length) * 100) : 0,
    };
  });

  const totalAnswered = currentAnswers.length;
  const totalCorrect = currentAnswers.filter((answer) => answer.correct).length;
  const totalAccuracy = totalAnswered ? Math.round((totalCorrect / totalAnswered) * 100) : 0;
  const totalQuestionCount = currentQuestionIds.size;
  const overallProgressPercent = totalQuestionCount && totalAnswered
    ? Math.max(0.1, Math.round((totalAnswered / totalQuestionCount) * 1000) / 10)
    : 0;
  const incorrectQuestions = useMemo(
    () => questions
      .filter((question) => answerMap.has(question.id) && !answerMap.get(question.id)?.correct)
      .sort((a, b) => {
        const aTime = answerMap.get(a.id)?.answeredAt ?? "";
        const bTime = answerMap.get(b.id)?.answeredAt ?? "";
        return bTime.localeCompare(aTime);
      }),
    [answerMap]
  );
  const mistakePracticeQuestions = useMemo(() => {
    if (!incorrectQuestions.length) return [];
    const mistakeSkills = new Set(incorrectQuestions.map((question) => `${question.section}::${question.skill}`));
    const incorrectIds = new Set(incorrectQuestions.map((question) => question.id));
    const relatedQuestions = questions
      .filter((question) => mistakeSkills.has(`${question.section}::${question.skill}`) && !incorrectIds.has(question.id))
      .sort((a, b) => Number(answerMap.has(a.id)) - Number(answerMap.has(b.id)));
    const practicePool = [...relatedQuestions, ...incorrectQuestions];
    return practicePool.filter((question, index) => practicePool.findIndex((item) => item.id === question.id) === index).slice(0, 12);
  }, [answerMap, incorrectQuestions]);
  const mistakeSkillCount = new Set(incorrectQuestions.map((question) => `${question.section}::${question.skill}`)).size;
  const scorePrediction = useMemo(() => {
    const answeredQuestions = questions
      .map((question) => ({ question, answer: answerMap.get(question.id) }))
      .filter((entry): entry is { question: Question; answer: AnswerRecord } => Boolean(entry.answer));
    if (answeredQuestions.length < SCORE_PREDICTION_MIN_ANSWERS) return null;

    const difficultyWeights: Record<Difficulty, number> = { Easy: 0.85, Medium: 1, Hard: 1.2 };
    let possible = 0;
    let earned = 0;
    const paceSamples: number[] = [];
    answeredQuestions.forEach(({ question, answer }) => {
      const weight = difficultyWeights[question.difficulty];
      possible += weight;
      if (answer.correct) earned += weight;
      if (answer.elapsedSeconds && question.estimatedTimeSeconds) {
        paceSamples.push(answer.elapsedSeconds / question.estimatedTimeSeconds);
      }
    });
    const mastery = possible ? earned / possible : 0;
    const averagePace = paceSamples.length ? paceSamples.reduce((sum, value) => sum + value, 0) / paceSamples.length : 1;
    const paceAdjustment = Math.max(-0.04, Math.min(0.04, (1 - averagePace) * 0.05));
    const estimated = Math.max(400, Math.min(1600, Math.round((400 + 1200 * Math.max(0, Math.min(1, mastery + paceAdjustment))) / 10) * 10));
    const range = Math.max(40, Math.round((170 - Math.min(answeredQuestions.length, 26) * 5) / 10) * 10);
    return {
      estimated,
      low: Math.max(400, estimated - range),
      high: Math.min(1600, estimated + range),
      confidence: answeredQuestions.length >= 100 ? "High confidence" : answeredQuestions.length >= 60 ? "Building confidence" : "Baseline estimate",
      sampleSize: answeredQuestions.length,
    };
  }, [answerMap]);
  const practiceTimer = formatTimer(Math.floor((currentTime - practiceStartedAt) / 1000));

  const applyEloDelta = (delta: number) => {
    if (!currentUser) return;
    awardUserElo({ userId: currentUser.id, delta })
      .then((user) => {
        setCurrentUser(user);
        saveStoredUser(user);
      })
      .catch(() => {
        // ELO is a bonus layer; answering should never fail because of it.
      });
  };

  const getQuestionSet = (section: Section, domain = "All", skill = "All") =>
    questions.filter((question) => {
      const matchesSection = question.section === section;
      const matchesDomain = domain === "All" || question.domain === domain;
      const matchesSkill = skill === "All" || question.skill === skill;
      return matchesSection && matchesDomain && matchesSkill;
    });

  const getPracticeStats = (questionSet: Question[]) => {
    const answered = questionSet.filter((question) => answerMap.has(question.id));
    const correct = answered.filter((question) => answerMap.get(question.id)?.correct);
    return {
      total: questionSet.length,
      answered: answered.length,
      correct: correct.length,
      accuracy: answered.length ? Math.round((correct.length / answered.length) * 100) : null,
    };
  };

  const groupedTopics = useMemo(() => {
    if (activeSection === "Verbal") {
      return verbalDomains.map((domain) => ({
        domain,
        modules: verbalModules[domain] ?? [],
      }));
    }

    return mathDomains.map((domain) => ({
      domain,
      modules: mathModules[domain] ?? [],
    }));
  }, [activeSection]);

  const topicBuilderQuestions = useMemo(() => {
    const selectedKeys = new Set(selectedTopicKeys);
    return questions.filter((question) => {
      if (question.section !== activeSection) return false;
      if (selectedKeys.size > 0 && !selectedKeys.has(topicKey(question))) return false;
      if (activeDifficulty !== "All" && question.difficulty !== activeDifficulty) return false;

      const answer = answerMap.get(question.id);
      if (practiceHistoryFilter === "Unanswered" && answer) return false;
      if (practiceHistoryFilter === "Incorrect" && (!answer || answer.correct)) return false;
      return true;
    });
  }, [activeDifficulty, activeSection, answerMap, practiceHistoryFilter, selectedTopicKeys]);

  const plannedQuestionCount =
    practiceQuestionLimit === "All"
      ? topicBuilderQuestions.length
      : Math.min(practiceQuestionLimit, topicBuilderQuestions.length);

  const domainStats = unique(questions.map((question) => question.domain)).map((domain) => {
    const domainQuestions = questions.filter((question) => question.domain === domain);
    const answered = domainQuestions.filter((question) => answerMap.has(question.id));
    const correct = answered.filter((question) => answerMap.get(question.id)?.correct);
    return {
      domain,
      section: domainQuestions[0].section,
      total: domainQuestions.length,
      answered: answered.length,
      correct: correct.length,
      percent: domainQuestions.length ? Math.round((correct.length / domainQuestions.length) * 100) : 0,
    };
  });

  const handleAuth = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const fullName = String(form.get("fullName") ?? "").trim();
    const nickname = String(form.get("nickname") ?? "").trim();
    const age = Number(form.get("age") ?? 0);
    const gmail = String(form.get("gmail") ?? "").trim().toLowerCase();
    const password = String(form.get("password") ?? "");

    setAuthError("");
    setAuthLoading(true);

    try {
      const user =
        authMode === "sign-up"
          ? await registerUser({ fullName, nickname, age, gmail, password })
          : await loginUser({ gmail, password });

      saveStoredUser(user);
      setCurrentUser(user);
      setAuthPageOpen(false);
    } catch (error) {
      if (error instanceof TypeError) {
        setAuthError("API server is not running. Start the site with npm run dev.");
        return;
      }
      setAuthError(error instanceof Error ? error.message : "Something went wrong.");
    } finally {
      setAuthLoading(false);
    }
  };

  const submitAnswer = (question: Question, choiceIndex: number) => {
    if (!currentUser) return;
    const correct = choiceIndex === question.correctIndex;
    const record: AnswerRecord = {
      questionId: question.id,
      selectedIndex: choiceIndex,
      correct,
      answeredAt: new Date().toISOString(),
      elapsedSeconds: Math.max(1, Math.round((Date.now() - practiceStartedAt) / 1000)),
    };
    setSelectedIndex(choiceIndex);
    if (!correct) {
      setWrongPracticeChoices((current) => ({
        ...current,
        [question.id]: [...new Set([...(current[question.id] ?? []), choiceIndex])],
      }));
    }
    if (correct && !activeAnswer?.correct) applyEloDelta(1);
    saveAnswer(currentUser.id, record);
    setAnswersVersion((value) => value + 1);
  };

  const toggleEliminatedChoice = (questionId: string, choiceIndex: number) => {
    setEliminatedChoices((current) => {
      const choices = current[questionId] ?? [];
      const nextChoices = choices.includes(choiceIndex) ? choices.filter((index) => index !== choiceIndex) : [...choices, choiceIndex];
      return { ...current, [questionId]: nextChoices };
    });
  };

  const toggleReviewQuestion = (questionId: string) => {
    setReviewQuestionIds((current) =>
      current.includes(questionId) ? current.filter((id) => id !== questionId) : [...current, questionId]
    );
  };

  const submitFreeResponse = (question: Question) => {
    if (!currentUser) return;
    const acceptedAnswers = parseAcceptedAnswers(question);
    const correct = acceptedAnswers.some((answer) => answersMatch(freeResponseValue, answer));
    const record: AnswerRecord = {
      questionId: question.id,
      selectedIndex: 0,
      freeResponse: freeResponseValue.trim(),
      correct,
      answeredAt: new Date().toISOString(),
      elapsedSeconds: Math.max(1, Math.round((Date.now() - practiceStartedAt) / 1000)),
    };
    setSelectedIndex(0);
    if (correct && !activeAnswer?.correct) applyEloDelta(1);
    saveAnswer(currentUser.id, record);
    setAnswersVersion((value) => value + 1);
  };

  const changeSection = (section: Section) => {
    setActiveSection(section);
    setActiveDomain("All");
    setActiveSkill("All");
    setActiveDifficulty("All");
    setSelectedTopicKeys([]);
    setPracticeQuestionIds([]);
    setTopicBuilderMessage("");
    setTopicFiltersOpen(false);
    setTopicOptionsOpen(false);
    const firstQuestion = questions.find((question) => question.section === section);
    if (firstQuestion) setActiveQuestionId(firstQuestion.id);
    setSelectedIndex(null);
    setFreeResponseValue("");
  };

  const toggleExplanation = (questionId: string) => {
    setOpenExplanationIds((ids) => (ids.includes(questionId) ? ids.filter((id) => id !== questionId) : [...ids, questionId]));
  };

  const changeDomain = (domain: string) => {
    setActiveDomain(domain);
    setActiveSkill("All");
    const firstQuestion = questions.find((question) => {
      const matchesSection = question.section === activeSection;
      const matchesDomain = domain === "All" || question.domain === domain;
      return matchesSection && matchesDomain;
    });
    if (firstQuestion) setActiveQuestionId(firstQuestion.id);
    setSelectedIndex(null);
    setFreeResponseValue("");
  };

  const changeSkill = (skill: string) => {
    setActiveSkill(skill);
    const firstQuestion = questions.find((question) => {
      const matchesSection = question.section === activeSection;
      const matchesDomain = activeDomain === "All" || question.domain === activeDomain;
      const matchesSkill = skill === "All" || question.skill === skill;
      return matchesSection && matchesDomain && matchesSkill;
    });
    if (firstQuestion) setActiveQuestionId(firstQuestion.id);
    setSelectedIndex(null);
    setFreeResponseValue("");
  };

  const toggleTopicSelection = (key: string) => {
    setSelectedTopicKeys((current) =>
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key]
    );
    setTopicBuilderMessage("");
  };

  const toggleDomainSelection = (domain: string, modules: string[]) => {
    const keys = modules
      .filter((module) => getQuestionSet(activeSection, domain, module).length > 0)
      .map((module) => `${activeSection}::${domain}::${module}`);
    if (!keys.length) return;
    const allSelected = keys.every((key) => selectedTopicKeys.includes(key));
    setSelectedTopicKeys((current) => {
      const currentSet = new Set(current);
      keys.forEach((key) => (allSelected ? currentSet.delete(key) : currentSet.add(key)));
      return [...currentSet];
    });
    setTopicBuilderMessage("");
  };

  const capturePracticeHighlight = (event: ReactMouseEvent<HTMLElement>) => {
    if (!highlightToolOpen || !activeQuestion) return;
    const selection = window.getSelection();
    const selectedText = selection?.toString().replace(/\s+/g, " ").trim() ?? "";
    if (!selectedText || selectedText.length < 2 || selectedText.length > 240 || !selection?.anchorNode) return;
    if (!event.currentTarget.contains(selection.anchorNode)) return;

    setQuestionHighlights((current) => {
      const existing = current[activeQuestion.id] ?? [];
      const withoutDuplicate = existing.filter((highlight) => highlight.text.toLowerCase() !== selectedText.toLowerCase());
      return { ...current, [activeQuestion.id]: [...withoutDuplicate, { text: selectedText, tone: highlightTone }] };
    });
    selection.removeAllRanges();
  };

  const resetPracticeView = () => {
    setPracticeTextScale("standard");
    setLineFocusEnabled(false);
    setHighlightToolOpen(false);
    setReferenceOpen(false);
    setQuestionHighlights((current) => activeQuestion ? { ...current, [activeQuestion.id]: [] } : current);
  };

  const launchGuidedPractice = (sessionQuestions: Question[]) => {
    const firstQuestion = sessionQuestions[0];
    if (!firstQuestion) return;
    setActiveSection(firstQuestion.section);
    setActiveDomain("All");
    setActiveSkill("All");
    setActiveDifficulty("All");
    setQuery("");
    setPracticeQuestionIds(sessionQuestions.map((question) => question.id));
    setActiveQuestionId(firstQuestion.id);
    setSelectedIndex(answerMap.get(firstQuestion.id)?.selectedIndex ?? null);
    setFreeResponseValue(answerMap.get(firstQuestion.id)?.freeResponse ?? "");
    setCalculatorOpen(false);
    setPracticeStartedAt(Date.now());
    setCurrentTime(Date.now());
    setPracticeMode(true);
  };

  const reviewSingleQuestion = (question: Question) => launchGuidedPractice([question]);

  const startMistakesPractice = () => launchGuidedPractice(mistakePracticeQuestions);

  const startScoreDiagnostic = () => {
    const diagnosticQuestions = sections.flatMap((section) => {
      const sectionQuestions = questions
        .filter((question) => question.section === section)
        .sort((a, b) => Number(answerMap.has(a.id)) - Number(answerMap.has(b.id)));
      const balanced = (["Easy", "Medium", "Hard"] as Difficulty[]).flatMap((difficulty) =>
        sectionQuestions.filter((question) => question.difficulty === difficulty).slice(0, 6)
      );
      const selectedIds = new Set(balanced.map((question) => question.id));
      const fill = sectionQuestions.filter((question) => !selectedIds.has(question.id)).slice(0, Math.max(0, 20 - balanced.length));
      return [...balanced, ...fill].slice(0, 20);
    });
    launchGuidedPractice(diagnosticQuestions);
  };

  const startSelectedPractice = () => {
    let sessionQuestions = [...topicBuilderQuestions];
    if (practiceShuffle) {
      sessionQuestions = sessionQuestions
        .map((question) => ({ question, order: Math.random() }))
        .sort((a, b) => a.order - b.order)
        .map(({ question }) => question);
    }
    if (practiceQuestionLimit !== "All") {
      sessionQuestions = sessionQuestions.slice(0, practiceQuestionLimit);
    }

    const firstQuestion = sessionQuestions[0];
    if (!firstQuestion) {
      setTopicBuilderMessage("No questions match these filters yet. Try widening your selection.");
      return;
    }

    setActiveDomain("All");
    setActiveSkill("All");
    setQuery("");
    setPracticeQuestionIds(sessionQuestions.map((question) => question.id));
    setActiveQuestionId(firstQuestion.id);
    setSelectedIndex(answerMap.get(firstQuestion.id)?.selectedIndex ?? null);
    setFreeResponseValue(answerMap.get(firstQuestion.id)?.freeResponse ?? "");
    setCalculatorOpen(false);
    setPracticeStartedAt(Date.now());
    setCurrentTime(Date.now());
    setTopicBuilderMessage("");
    setPracticeMode(true);
  };

  const goToQuestionIndex = (index: number) => {
    const nextQuestion = filteredQuestions[index];
    if (!nextQuestion) return;
    const answer = answerMap.get(nextQuestion.id);
    setActiveQuestionId(nextQuestion.id);
    setSelectedIndex(answer?.selectedIndex ?? null);
    setFreeResponseValue(answer?.freeResponse ?? "");
    setPracticeStartedAt(Date.now());
    setCurrentTime(Date.now());
  };

  const moveCalculator = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!calculatorDragging) return;
    setCalculatorFrame((frame) => ({
      ...frame,
      x: Math.max(8, Math.min(window.innerWidth - 120, frame.x + event.movementX)),
      y: Math.max(82, Math.min(window.innerHeight - 90, frame.y + event.movementY)),
    }));
  };

  const signOut = () => {
    clearStoredUser();
    setCurrentUser(null);
  };

  const openAuthPage = (mode: "sign-in" | "sign-up") => {
    setAuthMode(mode);
    setAuthError("");
    setAuthPageOpen(true);
  };

  if (!currentUser) {
    if (authPageOpen) {
      return (
        <main className="auth-page-shell">
          <section className="auth-page-media auth-page-flower-media" aria-label="sat4.me score goal preview">
            <div className="auth-page-media-overlay" />
            <nav className="auth-page-brand">
              <img className="brand-logo" src="/brand/4sat-logo.png" alt="sat4.me logo" />
              <span>sat4.me</span>
            </nav>
            <div className="auth-score-preview auth-goal-preview">
              <div className="auth-goal-orbit" aria-hidden="true">
                <span />
                <span />
                <span />
              </div>
              <section className="auth-goal-card" aria-label="Predicted SAT score and goal">
                <div className="auth-goal-lightning" aria-hidden="true"><i /><span /></div>
                <div className="auth-goal-top">
                  <div className="auth-goal-mark">
                    <BookOpenCheck size={18} />
                  </div>
                  <div>
                    <small>sat4.me</small>
                    <strong>SAT · Digital Suite</strong>
                  </div>
                  <span className="auth-goal-live"><i /> Live practice</span>
                </div>
                <div className="auth-goal-score">
                  <p>Your projected score</p>
                  <div>
                    <strong>{authProjectedScore}</strong>
                    <span>/1600</span>
                    <em>{authScoreDelta >= 0 ? "+" : ""}{authScoreDelta}</em>
                  </div>
                  <small>Predict your score, set your goal, and follow a focused plan to close the gap.</small>
                </div>
                <div className="auth-score-controls">
                  <label>
                    <span>Math <em>{authMathScore}/800</em></span>
                    <input
                      type="range"
                      min="200"
                      max="800"
                      step="10"
                      value={authMathScore}
                      onChange={(event) => setAuthMathScore(Number(event.target.value))}
                    />
                  </label>
                  <label>
                    <span>Reading & Writing <em>{authRwScore}/800</em></span>
                    <input
                      type="range"
                      min="200"
                      max="800"
                      step="10"
                      value={authRwScore}
                      onChange={(event) => setAuthRwScore(Number(event.target.value))}
                    />
                  </label>
                </div>
                <div className="auth-goal-setter">
                  <div className="auth-goal-setter-head">
                    <span>🎯 Set your goal score</span>
                    <em>{authGoalStatus}</em>
                  </div>
                  <div className="auth-goal-target">
                    <strong>{authGoalScore}</strong>
                    <span>/1600</span>
                  </div>
                  <div className="auth-goal-slider">
                    <i />
                    <b style={{ width: `${authGoalFill}%` }} />
                    <input
                      aria-label="Goal SAT score"
                      type="range"
                      min="400"
                      max="1600"
                      step="10"
                      value={authGoalScore}
                      onChange={(event) => setAuthGoalScore(Number(event.target.value))}
                    />
                  </div>
                  <div className="auth-goal-ticks">
                    <span>400</span>
                    <span>800</span>
                    <span>1200</span>
                    <span>1600</span>
                  </div>
                  <p>
                    {authGoalGap > 0 ? (
                      <>You need <strong>+{authGoalGap}</strong> more points to reach your goal</>
                    ) : (
                      <>You are <strong>{Math.abs(authGoalGap)}</strong> points above your goal</>
                    )}
                  </p>
                </div>
              </section>
            </div>
          </section>

          <section className="auth-page-panel" aria-label={authMode === "sign-up" ? "Create account" : "Sign in"}>
            <div className="auth-page-copy">
              <button className="auth-page-back" type="button" onClick={() => setAuthPageOpen(false)}>
                <ChevronLeft size={16} />
                назад
              </button>
              <p className="eyebrow">SAT PREP ACCOUNT</p>
              <h1>{authMode === "sign-up" ? "Создать аккаунт" : "С возвращением"}</h1>
              <p>
                {authMode === "sign-up" ? "Уже есть аккаунт? " : "Нет аккаунта? "}
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode(authMode === "sign-up" ? "sign-in" : "sign-up");
                    setAuthError("");
                  }}
                >
                  {authMode === "sign-up" ? "Войти" : "Зарегистрироваться"}
                </button>
              </p>
            </div>

            <div className="auth-page-card">
              <form onSubmit={handleAuth}>
                {authMode === "sign-up" && (
                  <>
                    <input name="fullName" placeholder="Full name" autoComplete="name" />
                    <input name="nickname" placeholder="Nickname" autoComplete="nickname" />
                    <input name="age" placeholder="Age" type="number" min="5" max="99" autoComplete="off" />
                  </>
                )}
                <input name="gmail" placeholder="you@example.com" type="email" autoComplete="username" />
                <input
                  name="password"
                  placeholder="Password"
                  type="password"
                  autoComplete={authMode === "sign-up" ? "new-password" : "current-password"}
                />
                {authError && <p className="form-error">{authError}</p>}
                <button className="primary-button full auth-page-submit" type="submit" disabled={authLoading}>
                  <ChevronRight size={18} />
                  {authLoading ? "Please wait..." : authMode === "sign-up" ? "Создать аккаунт" : "Войти"}
                </button>
              </form>
            </div>
          </section>
        </main>
      );
    }

    return (
      <main className="auth-shell auth-shell-warp guest-landing-shell">
        <section className="video-hero guest-video-hero">
          <video className="video-hero-media" src="/hero/road-background.mp4" autoPlay muted loop playsInline />
          <div className="video-hero-overlay" />
          <nav className="guest-hero-nav">
            <div className="brand">
              <img className="brand-logo-large" src="/brand/4sat-logo.png" alt="sat4.me logo" />
              <span className="brand-text">sat4.me</span>
            </div>
            <div className="auth-nav-actions">
              <button className="ghost-button" onClick={() => openAuthPage("sign-in")}>
                Войти
              </button>
              <button className="primary-button" onClick={() => openAuthPage("sign-up")}>
                Создать аккаунт
              </button>
            </div>
          </nav>

          <div className="video-hero-content">
            <h1>
              <span className="score-headline">
                Are you stuck at
                <span className="score-line">
                  <ScoreTypewriter scores={["1230", "1280", "1350", "1410"]} />?
                </span>
              </span>
            </h1>
            <p>
              Practice smarter with focused SAT modules, vocabulary cards, battles, and progress that shows exactly what to fix next.
            </p>
            <div className="video-hero-actions">
              <button className="primary-button" onClick={() => openAuthPage("sign-up")}>
                Start practicing
                <ChevronRight size={17} />
              </button>
              <button className="hero-ghost-button" onClick={() => openAuthPage("sign-up")}>
                Open vocabulary
              </button>
            </div>
          </div>
        </section>

        <div className="landing-continuation guest-landing-continuation">
          <StudentResultsShowcase onTryPractice={() => openAuthPage("sign-up")} />

          <MotivationShowcase
            onOpenStudy={() => openAuthPage("sign-up")}
            onPlayArena={() => openAuthPage("sign-up")}
          />

          <FeatureCardsShowcase />

        </div>
      </main>
    );
  }

  if (practiceMode && activeQuestion && activePrompt) {
    const isMathPractice = activeQuestion.section === "Math";
    const isFreeResponse = activeQuestion.choices.length === 1 && activeQuestion.correctIndex === 0 && activeQuestion.acceptedAnswers?.length;
    const activeHighlights = questionHighlights[activeQuestion.id] ?? [];
    const practiceShellClass = [
      "practice-shell",
      isMathPractice ? "math-practice-shell" : "",
      practiceTextScale === "large" ? "practice-large-text" : "",
      highlightToolOpen ? "highlight-mode" : "",
    ].filter(Boolean).join(" ");

    return (
      <main className={practiceShellClass}>
        <header className="sat-topbar">
          <button
            className="sat-back"
            onClick={() => {
              setCalculatorOpen(false);
              setHighlightToolOpen(false);
              setReferenceOpen(false);
              setMoreToolsOpen(false);
              setLineFocusEnabled(false);
              setPracticeMode(false);
              setPracticeQuestionIds([]);
            }}
          >
            <ChevronLeft size={16} />
            Go back
          </button>
          <div className="sat-timer" aria-label="Practice timer">
            {!practiceTimerHidden && <strong>{practiceTimer}</strong>}
            <button onClick={() => setPracticeTimerHidden((hidden) => !hidden)}>
              {practiceTimerHidden ? "Show" : "Hide"}
            </button>
          </div>
          <div className="sat-tools">
            <button
              className={highlightToolOpen ? "active" : ""}
              aria-expanded={highlightToolOpen}
              onClick={() => {
                setHighlightToolOpen((open) => !open);
                setReferenceOpen(false);
                setMoreToolsOpen(false);
              }}
            >
              <Highlighter size={15} />
              Highlight
            </button>
            {isMathPractice && (
              <>
                <button onClick={() => setCalculatorOpen((open) => !open)}>
                  <Calculator size={15} />
                  Calculator
                </button>
                <button
                  className={referenceOpen ? "active" : ""}
                  aria-expanded={referenceOpen}
                  onClick={() => {
                    setReferenceOpen((open) => !open);
                    setHighlightToolOpen(false);
                    setMoreToolsOpen(false);
                  }}
                >
                  <FileText size={15} />
                  Reference
                </button>
              </>
            )}
            <button
              className={moreToolsOpen ? "active" : ""}
              aria-expanded={moreToolsOpen}
              onClick={() => {
                setMoreToolsOpen((open) => !open);
                setHighlightToolOpen(false);
                setReferenceOpen(false);
              }}
            >
              <MoreHorizontal size={17} />
              More
            </button>
          </div>
        </header>

        {highlightToolOpen && (
          <aside className="sat-tool-popover sat-highlight-popover" aria-label="Highlight tool">
            <header><Highlighter size={16} /><strong>Highlight</strong></header>
            <p>Select text in the passage, question, or answers to highlight it.</p>
            <div className="sat-highlight-tones" role="group" aria-label="Highlight color">
              {(["yellow", "mint", "pink"] as HighlightTone[]).map((tone) => (
                <button key={tone} className={`${tone}${highlightTone === tone ? " active" : ""}`} aria-pressed={highlightTone === tone} onClick={() => setHighlightTone(tone)}>
                  <span />{tone}
                </button>
              ))}
            </div>
            <button
              className="sat-tool-secondary"
              disabled={!activeHighlights.length}
              onClick={() => setQuestionHighlights((current) => ({ ...current, [activeQuestion.id]: [] }))}
            >
              Remove highlights ({activeHighlights.length})
            </button>
          </aside>
        )}

        {moreToolsOpen && (
          <aside className="sat-tool-popover sat-more-popover" aria-label="Reading settings">
            <header><MoreHorizontal size={17} /><strong>Reading settings</strong></header>
            <div className="sat-tool-setting">
              <span>Text size</span>
              <div className="sat-tool-segmented" role="group" aria-label="Text size">
                <button className={practiceTextScale === "standard" ? "active" : ""} onClick={() => setPracticeTextScale("standard")}>Standard</button>
                <button className={practiceTextScale === "large" ? "active" : ""} onClick={() => setPracticeTextScale("large")}>Large</button>
              </div>
            </div>
            <button className="sat-tool-toggle" aria-pressed={lineFocusEnabled} onClick={() => setLineFocusEnabled((enabled) => !enabled)}>
              <span><strong>Line focus</strong><small>Dim the page outside your reading line</small></span>
              <i><span /></i>
            </button>
            <button className="sat-tool-secondary" onClick={resetPracticeView}><RotateCcw size={14} /> Reset question view</button>
          </aside>
        )}

        {isMathPractice && referenceOpen && (
          <aside className="sat-reference-panel" aria-label="SAT math reference sheet">
            <header>
              <div><FileText size={17} /><strong>Reference sheet</strong></div>
              <button onClick={() => setReferenceOpen(false)} aria-label="Close reference sheet"><X size={17} /></button>
            </header>
            <p>The following formulas are provided on the digital SAT.</p>
            <div className="sat-formula-grid">
              <article><span>Circle</span><strong>A = πr²</strong><strong>C = 2πr</strong></article>
              <article><span>Rectangle</span><strong>A = ℓw</strong></article>
              <article><span>Triangle</span><strong>A = ½bh</strong></article>
              <article><span>Right triangle</span><strong>c² = a² + b²</strong></article>
              <article><span>Rectangular prism</span><strong>V = ℓwh</strong></article>
              <article><span>Cylinder</span><strong>V = πr²h</strong></article>
              <article><span>Sphere</span><strong>V = ⁴⁄₃πr³</strong></article>
              <article><span>Cone</span><strong>V = ⅓πr²h</strong></article>
            </div>
            <small>The number of degrees of arc in a circle is 360. The sum of the angles of a triangle is 180°.</small>
          </aside>
        )}

        {lineFocusEnabled && <div className="sat-line-focus" aria-hidden="true" style={{ top: lineFocusY - 42 }} />}

        {isMathPractice && calculatorOpen && (
          <aside
            className="calculator-popover"
            aria-label="Desmos calculator"
            style={{ left: calculatorFrame.x, top: calculatorFrame.y, width: calculatorFrame.width, height: calculatorFrame.height }}
          >
            <div
              className="calculator-header"
              onPointerDown={(event) => {
                setCalculatorDragging(true);
                event.currentTarget.setPointerCapture(event.pointerId);
              }}
              onPointerMove={moveCalculator}
              onPointerUp={(event) => {
                setCalculatorDragging(false);
                event.currentTarget.releasePointerCapture(event.pointerId);
              }}
              onPointerCancel={() => setCalculatorDragging(false)}
            >
              <strong>Desmos Calculator</strong>
              <button onClick={() => setCalculatorOpen(false)}>Close</button>
            </div>
            <iframe title="Desmos calculator" src="https://www.desmos.com/calculator" />
          </aside>
        )}

        <section
          className={isMathPractice ? "sat-stage math-stage" : "sat-stage"}
          onMouseUp={capturePracticeHighlight}
          onPointerMove={(event) => lineFocusEnabled && setLineFocusY(event.clientY)}
        >
          {!isMathPractice && (
            <article className="sat-reading-pane">
              {activeQuestion.imagePath && (
                <img className="sat-stimulus-image" src={activeQuestion.imagePath} alt="SAT table or chart" />
              )}
              {activePrompt.passage ? (
                <div className="sat-passage">
                  {activePrompt.passage.split(/\n+/).map((paragraph, index) => (
                    <p key={`${activeQuestion.id}-passage-${index}`}><HighlightedText text={paragraph} highlights={activeHighlights} /></p>
                  ))}
                </div>
              ) : (
                <div className="sat-passage sat-passage-empty">
                  <Clock3 size={22} />
                  <p>This question does not include a separate reading passage.</p>
                </div>
              )}
            </article>
          )}

          <article className="sat-question-pane">
            <div className="sat-question-card">
              <div className="sat-question-top">
                <span className="sat-number">{activeQuestionIndex + 1}</span>
                <button
                  className={reviewQuestionIds.includes(activeQuestion.id) ? "sat-review active" : "sat-review"}
                  onClick={() => toggleReviewQuestion(activeQuestion.id)}
                >
                  <Bookmark size={15} />
                  Mark for Review
                </button>
                <button className="sat-report">Report</button>
              </div>

              {isMathPractice && activeQuestion.imagePath && (
                <img className="question-image sat-question-image" src={activeQuestion.imagePath} alt="SAT math question" />
              )}
              {!activeQuestion.imagePath && (
                <p className="sat-question-text"><HighlightedText text={activePrompt.questionText} highlights={activeHighlights} /></p>
              )}

              {isFreeResponse ? (
                <div className={activeAnswer ? (activeAnswer.correct ? "sat-free-response correct" : "sat-free-response wrong") : "sat-free-response"}>
                  <input
                    value={freeResponseValue}
                    onChange={(event) => setFreeResponseValue(event.target.value)}
                    placeholder="Answer..."
                    aria-label="Math answer"
                  />
                  <button onClick={() => submitFreeResponse(activeQuestion)} disabled={!freeResponseValue.trim()}>
                    {activeAnswer ? (activeAnswer.correct ? "Correct" : "Try again") : "Check answer"}
                  </button>
                </div>
              ) : (
                <div className="sat-choices">
                  {activeQuestion.choices.map((choice, index) => {
                    const answered = Boolean(activeAnswer?.correct);
                    const isCorrect = index === activeQuestion.correctIndex;
                    const isSelected = (selectedIndex ?? activeAnswer?.selectedIndex) === index;
                    const isEliminated = eliminatedChoices[activeQuestion.id]?.includes(index);
                    const isWrongAttempt = wrongPracticeChoices[activeQuestion.id]?.includes(index) || (!activeAnswer?.correct && activeAnswer?.selectedIndex === index);
                    const showCorrect = (answered && isSelected && isCorrect) || (sessionComplete && isCorrect);
                    const choiceImage = activeQuestion.choiceImagePaths?.[index];
                    return (
                      <div
                        key={`${activeQuestion.id}-${choice}`}
                        className={[
                          "sat-choice",
                          isSelected ? "selected" : "",
                          isEliminated ? "eliminated" : "",
                          showCorrect ? "correct" : "",
                          isWrongAttempt ? "wrong" : "",
                        ].join(" ")}
                      >
                        <button className="sat-choice-main" onClick={() => !highlightToolOpen && setSelectedIndex(index)}>
                          <span>{String.fromCharCode(65 + index)}</span>
                          {choiceImage && choice.startsWith("Choice ") ? (
                            <img className="sat-choice-image" src={choiceImage} alt={`Choice ${String.fromCharCode(65 + index)}`} />
                          ) : (
                            <em><HighlightedText text={choice} highlights={activeHighlights} /></em>
                          )}
                          {showCorrect && <Check size={18} />}
                          {isWrongAttempt && <X size={18} />}
                        </button>
                        <button
                          className="choice-strike-button"
                          aria-label={`Eliminate answer ${String.fromCharCode(65 + index)}`}
                          onClick={() => toggleEliminatedChoice(activeQuestion.id, index)}
                        >
                          <span>{String.fromCharCode(65 + index)}</span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {!isFreeResponse && selectedIndex !== null && !activeAnswer?.correct && selectedIndex !== activeAnswer?.selectedIndex && (
                <div className="sat-inline-check">
                  <button onClick={() => submitAnswer(activeQuestion, selectedIndex)}>Check answer</button>
                </div>
              )}

              {explanationOpen && (
                <div className={activeAnswer?.correct ? "sat-explanation correct" : "sat-explanation"}>
                  <strong>{activeAnswer ? (activeAnswer.correct ? "Correct" : "Review this one") : "Explanation"}</strong>
                  {activeAnswer?.correct || sessionComplete ? (
                    <p>{activeQuestion.explanation}</p>
                  ) : (
                    <p>Explanation and the correct answer unlock after you finish this practice set.</p>
                  )}
                </div>
              )}
            </div>
          </article>
        </section>

        <footer className="sat-footer">
          <div className="sat-footer-left">
            <QuestionBankNavigator
              currentIndex={activeQuestionIndex}
              questions={filteredQuestions}
              answerMap={answerMap}
              wrongChoices={wrongPracticeChoices}
              reviewQuestionIds={reviewQuestionIds}
              onGoTo={goToQuestionIndex}
            />
          </div>
          <div className="sat-footer-actions">
            <button
              className="sat-nav-button"
              disabled={activeQuestionIndex <= 0}
              onClick={() => goToQuestionIndex(activeQuestionIndex - 1)}
            >
              Previous
            </button>
            <button className="sat-explanation-button" onClick={() => toggleExplanation(activeQuestion.id)}>
              Explanation
            </button>
            <button className="sat-explanation-button" onClick={() => setShareQuestion(activeQuestion)}>
              <Send size={15} />
              Send
            </button>
            {!isFreeResponse && (
              <button
                className="sat-explanation-button"
                disabled={selectedIndex === null || Boolean(activeAnswer?.correct) || selectedIndex === activeAnswer?.selectedIndex}
                onClick={() => selectedIndex !== null && submitAnswer(activeQuestion, selectedIndex)}
              >
                Check
              </button>
            )}
            <button
              className="sat-next-button"
              disabled={activeQuestionIndex < 0 || activeQuestionIndex >= filteredQuestions.length - 1}
              onClick={() => goToQuestionIndex(activeQuestionIndex + 1)}
            >
              Next
            </button>
          </div>
        </footer>
        {shareQuestion && (
          <SendQuestionDialog currentUser={currentUser} question={shareQuestion} onClose={() => setShareQuestion(null)} />
        )}
        {activeStudyRoomId && (
          <StudyRoomDock
            currentUser={currentUser}
            roomId={activeStudyRoomId}
            minimized={studyDockMinimized}
            onMinimize={() => setStudyDockMinimized(true)}
            onRestore={() => setStudyDockMinimized(false)}
            onClose={() => setActiveStudyRoomId("")}
          />
        )}
      </main>
    );
  }

  return (
    <main className={bankView === "home" ? "app-shell home-shell" : "app-shell"}>
      <nav className="top-nav app-nav">
        <button
          className="brand nav-brand"
          onClick={() => {
            setBankView("home");
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
        >
          <img className="brand-logo" src="/brand/4sat-logo.png" alt="sat4.me logo" />
          <span>sat4.me</span>
        </button>
        <ExpandableActionBar
          items={[
            {
              id: "dashboard",
              label: "Dashboard",
              icon: <Home size={17} />,
              active: bankView === "home",
              onClick: () => {
                setBankView("home");
                window.scrollTo({ top: 0, behavior: "smooth" });
              },
            },
            {
              id: "bank",
              label: "Question Bank",
              icon: <LibraryBig size={17} />,
              active: bankView === "bank" || bankView === "topics",
              onClick: () => {
                setBankView("bank");
                window.scrollTo({ top: 0, behavior: "smooth" });
              },
            },
            {
              id: "vocabulary",
              label: "Vocabulary",
              icon: <NotebookTabs size={17} />,
              active: bankView === "vocabulary",
              onClick: () => {
                setBankView("vocabulary");
                window.scrollTo({ top: 0, behavior: "smooth" });
              },
            },
            {
              id: "papers",
              label: "Practice Papers",
              icon: <FileText size={17} />,
              active: bankView === "papers",
              onClick: () => {
                setBankView("papers");
                window.scrollTo({ top: 0, behavior: "smooth" });
              },
            },
            {
              id: "arena",
              label: "Arena",
              icon: <Trophy size={17} />,
              active: bankView === "arena",
              onClick: () => {
                setBankView("arena");
                window.scrollTo({ top: 0, behavior: "smooth" });
              },
            },
            {
              id: "study",
              label: "Study Room",
              icon: <Video size={17} />,
              active: bankView === "study",
              onClick: () => {
                setBankView("study");
                window.scrollTo({ top: 0, behavior: "smooth" });
              },
            },
            {
              id: "friends",
              label: "Friends",
              icon: <Users size={17} />,
              active: bankView === "friends",
              onClick: () => {
                setBankView("friends");
                window.scrollTo({ top: 0, behavior: "smooth" });
              },
            },
          ]}
        />
        <button className="profile-button" onClick={signOut} title="Sign out">
          <UserRound size={18} />
          <span>
            {currentUser.name}
            {currentUser.publicId && <small>ID {currentUser.publicId}</small>}
          </span>
          <DoorOpen size={16} />
        </button>
      </nav>

      {bankView === "arena" ? (
        <ArenaView currentUser={currentUser} />
      ) : bankView === "study" ? (
        <StudyRoomView
          activeRoomId={activeStudyRoomId}
          onJoinRoom={(roomId) => {
            setActiveStudyRoomId(roomId);
            setStudyDockMinimized(false);
          }}
        />
      ) : bankView === "friends" ? (
        <FriendsView
          currentUser={currentUser}
          totalAnswered={totalAnswered}
          totalAccuracy={totalAccuracy}
          onOpenQuestion={(questionId) => {
            const question = questions.find((item) => item.id === questionId);
            if (!question) return;
            changeSection(question.section);
            setActiveDomain(question.domain);
            setActiveSkill(question.skill);
            setActiveQuestionId(question.id);
            setSelectedIndex(answerMap.get(question.id)?.selectedIndex ?? null);
            setFreeResponseValue(answerMap.get(question.id)?.freeResponse ?? "");
            setBankView("topics");
          }}
        />
      ) : bankView === "vocabulary" ? (
        <VocabularyView />
      ) : bankView === "papers" ? (
        <PracticePapersView currentUser={currentUser} />
      ) : bankView === "home" ? (
        <>
          <section id="dashboard" className="video-hero">
            <video className="video-hero-media" src="/hero/road-background.mp4" autoPlay muted loop playsInline />
            <div className="video-hero-overlay" />
            <div className="video-hero-content">
              <h1>
                <span className="score-headline">
                  Are you stuck at
                  <span className="score-line">
                    <ScoreTypewriter scores={["1230", "1280", "1350", "1410"]} />?
                  </span>
                </span>
              </h1>
              <p>
                Practice smarter with focused SAT modules, vocabulary cards, battles, and progress that shows exactly what to fix next.
              </p>
              <div className="video-hero-actions">
                <button className="primary-button" onClick={() => setBankView("bank")}>
                  Start practicing
                  <ChevronRight size={17} />
                </button>
                <button className="hero-ghost-button" onClick={() => setBankView("vocabulary")}>
                  Open vocabulary
                </button>
              </div>
            </div>
          </section>

          <div className="landing-continuation">
            <StudentResultsShowcase onTryPractice={() => setBankView("bank")} />

            <MotivationShowcase
              onOpenStudy={() => setBankView("study")}
              onPlayArena={() => setBankView("arena")}
            />

            <FeatureCardsShowcase />

          </div>
        </>
      ) : bankView === "bank" ? (
          <section id="bank" className="question-bank-home">
            <div className="bank-title">
              <span>Practice library</span>
              <h2>Question Bank</h2>
              <p>Choose a section, build a focused set, or continue from your recent work.</p>
            </div>
            <div className="bank-cards">
              {sectionStats.map((stat) => (
                <article key={stat.section} className={`bank-card ${stat.section === "Verbal" ? "reading" : "math"}`}>
                  <div className="bank-card-copy">
                    <span>{stat.section === "Verbal" ? "Reading & language" : "Quantitative reasoning"}</span>
                    <h3>{sectionLabel(stat.section)}</h3>
                    <p>{stat.answered.toLocaleString()} completed · {stat.total.toLocaleString()} available</p>
                    <div className="bank-card-progress" aria-label={`${stat.total ? Math.round((stat.answered / stat.total) * 100) : 0}% of ${sectionLabel(stat.section)} completed`}>
                      <span style={{ width: `${stat.total ? Math.round((stat.answered / stat.total) * 100) : 0}%` }} />
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      changeSection(stat.section);
                      setBankView("topics");
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                  >
                    Practice
                    <ChevronRight size={14} />
                  </button>
                </article>
              ))}
            </div>
            <section className="bank-overview" aria-label="Question bank progress overview">
              <article className="bank-metric-card">
                <header><span>Completed</span></header>
                <strong>{totalAnswered.toLocaleString()}</strong>
                <p>{overallProgressPercent}% of the full question bank</p>
                <div className="bank-metric-track"><span style={{ width: `${overallProgressPercent}%` }} /></div>
              </article>
              <article className="bank-metric-card accuracy">
                <header><span>Accuracy</span></header>
                <strong>{totalAnswered ? `${totalAccuracy}%` : "—"}</strong>
                <p>{totalAnswered ? `${totalCorrect.toLocaleString()} of ${totalAnswered.toLocaleString()} correct` : "Answer your first question to begin"}</p>
                <div className="bank-metric-track"><span style={{ width: `${totalAccuracy}%` }} /></div>
              </article>
              <article className="bank-metric-card predictor">
                <header><span>Score predictor</span></header>
                <div className="bank-predicted-score">
                  <strong>{scorePrediction?.estimated ?? "—"}</strong>
                  {scorePrediction && <span>{scorePrediction.low}–{scorePrediction.high}</span>}
                </div>
                <p>{scorePrediction ? `${scorePrediction.confidence} · ${scorePrediction.sampleSize} questions` : `${Math.min(totalAnswered, SCORE_PREDICTION_MIN_ANSWERS)} of ${SCORE_PREDICTION_MIN_ANSWERS} questions completed`}</p>
                {!scorePrediction && (
                  <div
                    className="bank-predictor-track"
                    role="progressbar"
                    aria-label="Questions completed for score prediction"
                    aria-valuemin={0}
                    aria-valuemax={SCORE_PREDICTION_MIN_ANSWERS}
                    aria-valuenow={Math.min(totalAnswered, SCORE_PREDICTION_MIN_ANSWERS)}
                  >
                    <span style={{ width: `${Math.min(100, (totalAnswered / SCORE_PREDICTION_MIN_ANSWERS) * 100)}%` }} />
                  </div>
                )}
                <button onClick={startScoreDiagnostic}>{scorePrediction ? "Refine estimate" : "Start diagnostic"}<ChevronRight size={14} /></button>
              </article>
              <article className="bank-error-log">
                <header>
                  <div>
                    <span>Error log</span>
                    <h3>Questions to revisit</h3>
                  </div>
                  <strong>{incorrectQuestions.length}</strong>
                </header>
                {incorrectQuestions.length ? (
                  <div className="bank-error-list">
                    {incorrectQuestions.slice(0, 5).map((question) => (
                      <button key={question.id} onClick={() => reviewSingleQuestion(question)}>
                        <span className={`bank-error-difficulty ${question.difficulty.toLowerCase()}`}>{question.difficulty}</span>
                        <span><strong>{question.skill}</strong><small>{sectionLabel(question.section)} · {question.domain}</small></span>
                        <ChevronRight size={16} />
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="bank-error-empty">
                    <Check size={18} />
                    <span><strong>No errors yet</strong><small>Incorrect answers will appear here for quick review.</small></span>
                  </div>
                )}
              </article>
              <article className="bank-mistakes-practice">
                <div className="bank-mistakes-icon"><RotateCcw size={20} /></div>
                <div className="bank-mistakes-copy">
                  <span>Adaptive review</span>
                  <h3>Mistakes Practice</h3>
                  <p>
                    {incorrectQuestions.length
                      ? `A focused set of ${mistakePracticeQuestions.length} questions across ${mistakeSkillCount} ${mistakeSkillCount === 1 ? "skill" : "skills"} where you need more consistency.`
                      : "Your personalized practice set will appear after your first incorrect answer."}
                  </p>
                </div>
                <button disabled={!mistakePracticeQuestions.length} onClick={startMistakesPractice}>
                  {mistakePracticeQuestions.length ? "Practice weak skills" : "No mistakes yet"}
                  {mistakePracticeQuestions.length > 0 && <ChevronRight size={15} />}
                </button>
              </article>
            </section>
          </section>
      ) : (
        <section id="topics" className="topic-page">
          <button
            className="topic-back"
            onClick={() => {
              setBankView("bank");
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
          >
            <ChevronLeft size={16} />
            Question Bank
          </button>

          <div className="topic-board">
            <div className="topic-toolbar">
              <div>
                <h2>{sectionLabel(activeSection)}</h2>
                <p>Choose one or more skills, then shape your practice session.</p>
              </div>
              <div className="topic-actions">
                <button
                  className={topicFiltersOpen ? "active" : ""}
                  aria-expanded={topicFiltersOpen}
                  aria-controls="topic-filter-panel"
                  onClick={() => {
                    setTopicFiltersOpen((open) => !open);
                    setTopicOptionsOpen(false);
                  }}
                >
                  <SlidersHorizontal size={14} />
                  Filters
                  {Number(activeDifficulty !== "All") + Number(practiceHistoryFilter !== "All") > 0 && (
                    <span className="topic-action-count">
                      {Number(activeDifficulty !== "All") + Number(practiceHistoryFilter !== "All")}
                    </span>
                  )}
                </button>
                <button
                  className={topicOptionsOpen ? "active" : ""}
                  aria-expanded={topicOptionsOpen}
                  aria-controls="topic-options-panel"
                  onClick={() => {
                    setTopicOptionsOpen((open) => !open);
                    setTopicFiltersOpen(false);
                  }}
                >
                  <MoreHorizontal size={15} />
                  More options
                </button>
              </div>
            </div>

            {topicFiltersOpen && (
              <section id="topic-filter-panel" className="topic-config-panel" aria-label="Practice filters">
                <header>
                  <div>
                    <strong>Filter your question set</strong>
                    <span>These filters apply when you start the next practice session.</span>
                  </div>
                  <button
                    className="topic-config-reset"
                    onClick={() => {
                      setActiveDifficulty("All");
                      setPracticeHistoryFilter("All");
                    }}
                  >
                    Reset
                  </button>
                </header>
                <div className="topic-config-grid">
                  <div className="topic-config-field">
                    <span>Difficulty</span>
                    <div className="topic-segmented-control" role="group" aria-label="Question difficulty">
                      {difficulties.map((difficulty) => (
                        <button
                          key={difficulty}
                          className={activeDifficulty === difficulty ? "active" : ""}
                          aria-pressed={activeDifficulty === difficulty}
                          onClick={() => setActiveDifficulty(difficulty)}
                        >
                          {difficulty}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="topic-config-field">
                    <span>Question history</span>
                    <div className="topic-segmented-control" role="group" aria-label="Question history">
                      {(["All", "Unanswered", "Incorrect"] as PracticeHistoryFilter[]).map((filter) => (
                        <button
                          key={filter}
                          className={practiceHistoryFilter === filter ? "active" : ""}
                          aria-pressed={practiceHistoryFilter === filter}
                          onClick={() => setPracticeHistoryFilter(filter)}
                        >
                          {filter}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </section>
            )}

            {topicOptionsOpen && (
              <section id="topic-options-panel" className="topic-config-panel" aria-label="Practice options">
                <header>
                  <div>
                    <strong>Session preferences</strong>
                    <span>Keep the session focused and comfortable for you.</span>
                  </div>
                </header>
                <div className="topic-config-grid">
                  <div className="topic-config-field">
                    <span>Questions per session</span>
                    <div className="topic-segmented-control" role="group" aria-label="Questions per session">
                      {([10, 20, 40, "All"] as PracticeQuestionLimit[]).map((limit) => (
                        <button
                          key={limit}
                          className={practiceQuestionLimit === limit ? "active" : ""}
                          aria-pressed={practiceQuestionLimit === limit}
                          onClick={() => setPracticeQuestionLimit(limit)}
                        >
                          {limit}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="topic-option-toggles">
                    <button className="topic-toggle-row" aria-pressed={practiceShuffle} onClick={() => setPracticeShuffle((value) => !value)}>
                      <span><strong>Shuffle questions</strong><small>Mix skills throughout the session</small></span>
                      <i aria-hidden="true"><span /></i>
                    </button>
                    <button className="topic-toggle-row" aria-pressed={!practiceTimerHidden} onClick={() => setPracticeTimerHidden((hidden) => !hidden)}>
                      <span><strong>Show timer</strong><small>You can still hide it during practice</small></span>
                      <i aria-hidden="true"><span /></i>
                    </button>
                  </div>
                </div>
              </section>
            )}

            <article className="practice-all-card">
              <div>
                <strong>{selectedTopicKeys.length ? `${selectedTopicKeys.length} skills selected` : "Practice all topics"}</strong>
                <span>
                  {plannedQuestionCount} {plannedQuestionCount === 1 ? "question" : "questions"} ready
                  {activeDifficulty !== "All" ? ` · ${activeDifficulty}` : ""}
                  {practiceHistoryFilter !== "All" ? ` · ${practiceHistoryFilter.toLowerCase()}` : ""}
                </span>
              </div>
              <div className="practice-all-actions">
                {selectedTopicKeys.length > 0 && (
                  <button className="practice-clear-button" onClick={() => setSelectedTopicKeys([])}>Clear</button>
                )}
                <button disabled={plannedQuestionCount === 0} onClick={startSelectedPractice}>
                  {selectedTopicKeys.length ? "Start selected" : "Start practice"}
                </button>
              </div>
            </article>
            {topicBuilderMessage && <p className="topic-builder-message" role="status">{topicBuilderMessage}</p>}

            <div className="topic-table">
              <div className="topic-table-head">
                <span>Topic</span>
                <span>Progress</span>
                <span>Accuracy</span>
              </div>
              {groupedTopics.map((group) => {
                const availableModules = group.modules.filter((module) => getQuestionSet(activeSection, group.domain, module).length > 0);
                const groupAvailable = availableModules.length > 0;
                const groupSelected = groupAvailable && availableModules.every((module) =>
                  selectedTopicKeys.includes(`${activeSection}::${group.domain}::${module}`)
                );
                return (
                <div className={groupAvailable ? "topic-group" : "topic-group unavailable"} key={group.domain}>
                  <div className="topic-group-heading">
                    <h3>{group.domain}</h3>
                    <button disabled={!groupAvailable} onClick={() => toggleDomainSelection(group.domain, availableModules)}>
                      {!groupAvailable ? "Not available yet" : groupSelected ? "Clear group" : "Select group"}
                    </button>
                  </div>
                  {group.modules.map((module) => {
                    const moduleQuestions = getQuestionSet(activeSection, group.domain, module);
                    const stats = getPracticeStats(moduleQuestions);
                    const progressPercent = stats.total ? Math.round((stats.answered / stats.total) * 100) : 0;
                    const selectionKey = `${activeSection}::${group.domain}::${module}`;
                    const selected = selectedTopicKeys.includes(selectionKey);
                    return (
                      <button
                        key={`${group.domain}-${module}`}
                        className={selected ? "topic-row-card selected" : "topic-row-card"}
                        disabled={!stats.total}
                        aria-pressed={selected}
                        onClick={() => toggleTopicSelection(selectionKey)}
                      >
                        <span className="topic-name">
                          <i>{selected && <Check size={12} strokeWidth={3} />}</i>
                          <strong>{module}</strong>
                        </span>
                        <span className="topic-progress">
                          <span className="mini-progress">
                            <span style={{ width: `${progressPercent}%` }} />
                          </span>
                          <em>{stats.answered}/{stats.total} solved</em>
                        </span>
                        <span className="topic-accuracy">
                          {stats.accuracy === null ? (
                            <em>No attempts</em>
                          ) : (
                            <>
                              <strong>{stats.accuracy}%</strong>
                              <em>{stats.correct}/{stats.answered} correct</em>
                            </>
                          )}
                        </span>
                      </button>
                    );
                  })}
                </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      <section className="module-switch legacy-module-switch" aria-label="SAT sections">
        {sectionStats.map((stat) => (
          <button
            key={stat.section}
            className={activeSection === stat.section ? "module-card active" : "module-card"}
            onClick={() => changeSection(stat.section)}
          >
            <span>{stat.section}</span>
            <strong>{stat.answered}/{stat.total}</strong>
            <small>{stat.accuracy}% accuracy</small>
          </button>
        ))}
      </section>

      <section id="legacy-bank" className="workspace legacy-workspace">
        <aside className="bank-sidebar">
          <div className="sidebar-title">
            <SlidersHorizontal size={18} />
            <span>Question Bank</span>
          </div>
          <div className="search-box">
            <Search size={18} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search skill or prompt" />
          </div>
          <div className="filter-group">
            <p>Domain</p>
            {domains.map((domain) => (
              <button
                key={domain}
                className={activeDomain === domain ? "filter-choice active" : "filter-choice"}
                onClick={() => changeDomain(domain)}
              >
                <span>{domain}</span>
                <small>
                  {domain === "All"
                    ? `${sectionStats.find((stat) => stat.section === activeSection)?.answered ?? 0}/${
                        sectionStats.find((stat) => stat.section === activeSection)?.total ?? 0
                      } done`
                    : `${domainProgress[`${activeSection}::${domain}`]?.answered ?? 0}/${
                        domainProgress[`${activeSection}::${domain}`]?.total ?? 0
                      } done`}
                </small>
              </button>
            ))}
          </div>
          <div className="filter-group">
            <p>Module</p>
            {modules.map((module) => (
              <button
                key={module}
                className={activeSkill === module ? "filter-choice active" : "filter-choice"}
                onClick={() => changeSkill(module)}
              >
                <span>{module}</span>
                <small>
                  {module === "All"
                    ? `${filteredAnsweredCount}/${filteredQuestions.length} done`
                    : `${skillProgress[`${activeSection}::${module}`]?.answered ?? 0}/${
                        skillProgress[`${activeSection}::${module}`]?.total ?? 0
                      } done`}
                </small>
              </button>
            ))}
          </div>
          <div className="filter-group">
            <p>Difficulty</p>
            <div className="difficulty-grid">
              {difficulties.map((difficulty) => (
                <button
                  key={difficulty}
                  className={activeDifficulty === difficulty ? "chip active" : "chip"}
                  onClick={() => setActiveDifficulty(difficulty)}
                >
                  {difficulty}
                </button>
              ))}
            </div>
          </div>
        </aside>

        <section className="question-list" aria-label="Filtered questions">
          <div className="section-header">
            <div>
              <p className="eyebrow">{activeSection}</p>
              <h2>{filteredAnsweredCount}/{filteredQuestions.length} done</h2>
            </div>
            <button
              className="icon-button"
              title="Reset progress"
              onClick={() => {
                resetAnswers(currentUser.id);
                setSelectedIndex(null);
                setAnswersVersion((value) => value + 1);
              }}
            >
              <RotateCcw size={18} />
            </button>
          </div>
          {filteredQuestions.length > 0 && (
            <div className="question-map" aria-label="Question navigation">
              {filteredQuestions.map((question, index) => {
                const answer = answerMap.get(question.id);
                const statusClass = answer ? (answer.correct ? "correct" : "wrong") : "unanswered";
                return (
                  <button
                    key={question.id}
                    className={[
                      "question-map-cell",
                      statusClass,
                      activeQuestion?.id === question.id ? "active" : "",
                    ].join(" ")}
                    onClick={() => goToQuestionIndex(index)}
                    title={`Question ${index + 1}`}
                  >
                    {index + 1}
                  </button>
                );
              })}
            </div>
          )}
          <div className="question-items">
            {filteredQuestions.length === 0 && (
              <div className="empty-list">
                <strong>No questions in this topic yet</strong>
                <small>Upload this subtopic PDF and it will fill this list.</small>
              </div>
            )}
            {filteredQuestions.map((question, questionIndex) => {
              const answer = answerMap.get(question.id);
              const progress = topicProgress[topicKey(question)] ?? { answered: 0, total: 0 };
              return (
                <button
                  key={question.id}
                    className={activeQuestion?.id === question.id ? "question-row active" : "question-row"}
                  onClick={() => {
                    setActiveQuestionId(question.id);
                    setSelectedIndex(answer?.selectedIndex ?? null);
                  }}
                  >
                  <span className={answer ? (answer.correct ? "status-dot correct" : "status-dot wrong") : "status-dot"} />
                  <span>
                    <strong>Question {questionIndex + 1}: {question.skill}</strong>
                    <small>{question.domain} В· {question.difficulty} В· {progress.answered}/{progress.total} done</small>
                  </span>
                  <ChevronRight size={16} />
                </button>
              );
            })}
          </div>
        </section>

        <section className="practice-panel" aria-label="Practice question">
          {activeQuestion ? (
            <>
              <div className="difficulty-label">{activeQuestion.difficulty} question</div>
              <div className="practice-meta">
                <span>{activeQuestion.domain}</span>
                <span>{activeQuestion.skill}</span>
                {activeQuestion.estimatedTimeSeconds && <span>{activeQuestion.estimatedTimeSeconds}s</span>}
              </div>
              <div className="question-prompt">
                {activeQuestion.imagePath && (
                  <img className="question-image" src={activeQuestion.imagePath} alt="SAT math question" />
                )}
                {activePrompt?.passage && <p className="prompt-passage">{activePrompt.passage}</p>}
                <p className="prompt-question">{activePrompt?.questionText}</p>
              </div>
              <div className="choices">
                {activeQuestion.choices.map((choice, index) => {
                  const answered = activeAnswer || selectedIndex !== null;
                  const isCorrect = index === activeQuestion.correctIndex;
                  const isSelected = (activeAnswer?.selectedIndex ?? selectedIndex) === index;
                  const showCorrect = (isSelected && isCorrect) || (sessionComplete && isCorrect);
                  return (
                    <button
                      key={choice}
                      className={[
                        "choice",
                        isSelected ? "selected" : "",
                        showCorrect ? "correct" : "",
                        answered && isSelected && !isCorrect ? "wrong" : "",
                      ].join(" ")}
                      onClick={() => submitAnswer(activeQuestion, index)}
                    >
                      <span>{String.fromCharCode(65 + index)}</span>
                      {choice}
                      {showCorrect && <Check size={18} />}
                      {answered && isSelected && !isCorrect && <X size={18} />}
                    </button>
                  );
                })}
              </div>
              <div className="question-actions">
                <button
                  className="secondary-button compact"
                  disabled={activeQuestionIndex <= 0}
                  onClick={() => goToQuestionIndex(activeQuestionIndex - 1)}
                >
                  Previous question
                </button>
                <button className="explanation-toggle" onClick={() => toggleExplanation(activeQuestion.id)}>
                  {explanationOpen ? "Hide explanation" : "Explanation"}
                </button>
                <button
                  className="primary-button compact"
                  disabled={activeQuestionIndex < 0 || activeQuestionIndex >= filteredQuestions.length - 1}
                  onClick={() => goToQuestionIndex(activeQuestionIndex + 1)}
                >
                  Next question
                </button>
              </div>
              {explanationOpen && (
                <div className={activeAnswer?.correct ? "explanation correct" : "explanation"}>
                  <strong>{activeAnswer ? (activeAnswer.correct ? "Correct" : "Review this one") : "Explanation"}</strong>
                  {activeAnswer?.correct || sessionComplete ? (
                    <p>{activeQuestion.explanation}</p>
                  ) : (
                    <p>Explanation and the correct answer unlock after you finish this practice set.</p>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="empty-state">
              <FileQuestion size={32} />
              <h2>No questions yet</h2>
              <p>This topic is ready. Add a PDF export and the questions will appear here.</p>
            </div>
          )}
        </section>
      </section>

      <section id="progress" className="progress-section">
        <div className="section-header">
          <div>
            <p className="eyebrow">Skill map</p>
            <h2>Progress by domain</h2>
          </div>
          <div className="source-note">
            <Sparkle size={16} />
            <span>{sourceNote}</span>
          </div>
        </div>
        <div className="progress-grid">
          {domainStats.map((stat) => (
            <article key={stat.domain} className="progress-card">
              <div>
                <p>{stat.section}</p>
                <h3>{stat.domain}</h3>
              </div>
              <div className="progress-line" aria-label={`${stat.domain} progress`}>
                <span style={{ width: `${stat.percent}%` }} />
              </div>
              <small>{stat.correct} correct В· {stat.answered}/{stat.total} answered</small>
            </article>
          ))}
        </div>
      </section>
      {shareQuestion && (
        <SendQuestionDialog currentUser={currentUser} question={shareQuestion} onClose={() => setShareQuestion(null)} />
      )}
      {activeStudyRoomId && (
        <StudyRoomDock
          currentUser={currentUser}
          roomId={activeStudyRoomId}
          minimized={studyDockMinimized}
          onMinimize={() => setStudyDockMinimized(true)}
          onRestore={() => setStudyDockMinimized(false)}
          onClose={() => setActiveStudyRoomId("")}
        />
      )}
    </main>
  );
}

function Metric({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="metric">
      {icon}
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ScoreTypewriter({ scores }: { scores: string[] }) {
  const [scoreIndex, setScoreIndex] = useState(0);
  const [displayText, setDisplayText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const currentScore = scores[scoreIndex] ?? "";

  useEffect(() => {
    const doneTyping = displayText === currentScore;
    const doneDeleting = displayText === "";
    const delay = deleting ? 72 : doneTyping ? 1650 : 112;
    const timeout = window.setTimeout(() => {
      if (deleting) {
        if (doneDeleting) {
          setDeleting(false);
          setScoreIndex((index) => (index + 1) % scores.length);
        } else {
          setDisplayText((text) => text.slice(0, -1));
        }
        return;
      }
      if (doneTyping) {
        setDeleting(true);
      } else {
        setDisplayText(currentScore.slice(0, displayText.length + 1));
      }
    }, delay);
    return () => window.clearTimeout(timeout);
  }, [currentScore, deleting, displayText, scores.length]);

  return (
    <span className="score-typewriter">
      {displayText}
      <i aria-hidden="true">_</i>
    </span>
  );
}

function StudentResultsShowcase({ onTryPractice }: { onTryPractice: () => void }) {
  const cards = Array.from({ length: 8 }, (_, index) => index);

  return (
    <section className="student-results-showcase" aria-label="Student SAT results">
      <div className="results-copy">
        <p className="eyebrow">student scores</p>
        <h2>
          Our users got:
          <span>1500+ results</span>
        </h2>
        <p>
          With <em>sat4.me</em>, focused practice turns into real score jumps.
        </p>
        <button className="primary-button results-play-button" onClick={onTryPractice}>
          Try it and get 1500+
          <ChevronRight size={17} />
        </button>
      </div>
      <div className="results-carousel-wrapper" aria-label="Rotating SAT score result cards">
        <div className="results-carousel-inner">
          {cards.map((cardIndex) => (
            <figure
              key={cardIndex}
              className="result-photo-card"
              style={
                {
                  "--index": cardIndex,
                  "--quantity": cards.length,
                  "--color-card": cardIndex % 2 === 0 ? "84, 226, 192" : "233, 65, 150",
                } as CSSProperties
              }
            >
              <img src="/results/student-result.png" alt="SAT student result" />
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}

function MotivationShowcase({ onOpenStudy, onPlayArena }: { onOpenStudy: () => void; onPlayArena: () => void }) {
  const dockFriends = [
    { name: "Alex", img: "https://i.pravatar.cc/80?img=11", delay: "0s" },
    { name: "Maya", img: "https://i.pravatar.cc/80?img=5", delay: "-0.8s" },
    { name: "Sam", img: "https://i.pravatar.cc/80?img=12", delay: "-1.5s" },
    { name: "Kim", img: "https://i.pravatar.cc/80?img=16", delay: "-2.2s" },
  ];
  const battlePlayers = [
    { rank: "1", name: "Julian Park", elo: "1,240", score: "5 correct", avatar: "/avatars/julian.webp", initials: "JP", isCurrent: false },
    { rank: "2", name: "You", elo: "1,180", score: "4 correct", avatar: null, initials: "Y", isCurrent: true },
    { rank: "3", name: "Sofia Reyes", elo: "1,120", score: "4 correct", avatar: "/avatars/sofia.webp", initials: "SR", isCurrent: false },
  ];

  return (
    <section className="motivation-showcase" aria-label="SAT Battle invitation">
      <div className="motivation-copy">
        <p className="eyebrow">SAT BATTLE</p>
        <h2>
          Challenge
          <span>your <em>friends.</em></span>
        </h2>
        <p>
          Play live SAT battles in 1v1 or team mode. Race against real students, sharpen your skills, and climb the leaderboard.
        </p>
        <div className="motivation-actions">
          <button className="primary-button" onClick={onPlayArena}>
            Try Battle
            <ChevronRight size={17} />
          </button>
          <button className="hero-ghost-button motivation-ghost" onClick={onOpenStudy}>
            Team rooms
            <Trophy size={17} />
          </button>
        </div>
        <div className="friend-dock-preview" aria-label="Friends dock preview">
          <Users size={18} className="friend-dock-icon" />
          {dockFriends.map((friend) => (
            <img
              key={friend.name}
              className="friend-dock-avatar"
              src={friend.img}
              alt={friend.name}
              title={friend.name}
              style={{ "--friend-delay": friend.delay } as CSSProperties}
            />
          ))}
        </div>
      </div>

      <div className="battle-visual-card" aria-label="SAT Battle preview">
        <article className="battle-live-card">
          <header className="battle-live-head">
            <span className="battle-live-status"><i aria-hidden="true" /> Live match</span>
            <span className="battle-live-room">Ranked room · 4 players</span>
          </header>

          <div className="battle-live-title-row">
            <div>
              <h3>Precision under pressure.</h3>
            </div>
            <span className="battle-question-count"><strong>07</strong>/12</span>
          </div>

          <div className="battle-domain-pill">
            <Gauge size={16} aria-hidden="true" />
            <span>Round 7 · Algebra + Craft &amp; Structure</span>
          </div>

          <div className="battle-player-list" aria-label="Current leaderboard">
            {battlePlayers.map((player) => (
              <div className={`battle-player-row${player.isCurrent ? " is-current" : ""}`} key={player.name}>
                <span className="battle-player-rank">{player.rank}</span>
                <span className="battle-player-avatar">
                  {player.avatar ? <img src={player.avatar} alt="" /> : <span aria-hidden="true">{player.initials}</span>}
                </span>
                <div className="battle-player-identity">
                  <div><strong>{player.name}</strong></div>
                  <span>{player.score}</span>
                </div>
                <div className="battle-player-rating"><strong>{player.elo}</strong><span>ELO</span></div>
                {player.rank === "1" ? <Trophy size={16} aria-label="First place" /> : <span className="battle-player-delta" aria-hidden="true" />}
              </div>
            ))}
          </div>

          <div className="battle-speed-card">
            <span className="battle-speed-icon"><Rocket size={18} aria-hidden="true" /></span>
            <div><strong>Speed round next</strong><small>First correct answer earns the bonus.</small></div>
            <span className="battle-speed-prize">+10 <small>ELO</small></span>
          </div>

          <footer className="battle-live-footer">
            <span><Users size={15} aria-hidden="true" /> 4 players</span>
            <span><Clock3 size={15} aria-hidden="true" /> 15 sec per question</span>
          </footer>
        </article>
      </div>
    </section>
  );
}

function FeatureCardsShowcase() {
  const cards = [
    {
      tag: "practice.engine",
      title: "Targeted SAT modules",
      lines: ["Question Bank split by SAT domains", "Math + Reading & Writing modules", "Difficulty levels for smarter practice"],
    },
    {
      tag: "review.loop",
      title: "Mistakes become a plan",
      lines: ["Check answers when you are ready", "Review wrong attempts and explanations", "Track progress by topic"],
    },
    {
      tag: "social.mode",
      title: "Built for students together",
      lines: ["1v1 rooms with live scoring", "Friends, messages, shared tasks", "Study rooms with camera-only focus"],
    },
  ];

  return (
    <section className="feature-showcase" aria-label="sat4.me advantages">
      <div className="feature-showcase-head">
        <p className="eyebrow">why sat4.me</p>
        <h2>Everything students need after the lesson.</h2>
      </div>
      <div className="feature-card-grid">
        {cards.map((card) => (
          <article key={card.tag} className="feature-code-card">
            <div className="mac-header" aria-hidden="true">
              <span className="red" />
              <span className="yellow" />
              <span className="green" />
            </div>
            <span className="card-tag">{card.tag}</span>
            <h3>{card.title}</h3>
            <div className="code-editor">
              <pre>
                <code>{card.lines.join("\n")}</code>
              </pre>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function WarpBackground({ children, className = "" }: { children: ReactNode; className?: string }) {
  const beams = [
    { x: 12, delay: "0s", duration: "8.8s", color: "#39b7ff" },
    { x: 34, delay: "-2.6s", duration: "9.6s", color: "#a855f7" },
    { x: 58, delay: "-3.7s", duration: "8.2s", color: "#22c55e" },
    { x: 82, delay: "-4.4s", duration: "9.1s", color: "#fb7185" },
  ];

  return (
    <div className={["warp-background", className].filter(Boolean).join(" ")}>
      <div className="warp-scene" aria-hidden="true">
        {["top", "bottom", "left", "right"].map((side) => (
          <div key={side} className={`warp-plane ${side}`}>
            {beams.map((beam, index) => (
              <span
                key={`${side}-${index}`}
                className="warp-beam"
                style={
                  {
                    "--beam-x": `${beam.x}%`,
                    "--beam-delay": beam.delay,
                    "--beam-duration": beam.duration,
                    "--beam-color": beam.color,
                } as CSSProperties
                }
              />
            ))}
          </div>
        ))}
      </div>
      <div className="warp-content">{children}</div>
    </div>
  );
}

function QuestionBankNavigator({
  currentIndex,
  questions,
  answerMap,
  wrongChoices,
  reviewQuestionIds,
  onGoTo,
}: {
  currentIndex: number;
  questions: Question[];
  answerMap: Map<string, AnswerRecord>;
  wrongChoices: Record<string, number[]>;
  reviewQuestionIds: string[];
  onGoTo: (index: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [groupAnswered, setGroupAnswered] = useState(false);
  const currentPage = currentIndex + 1;
  const total = questions.length;
  const indexedQuestions = questions.map((question, index) => ({ question, index }));
  const questionGroups = groupAnswered
    ? [
        { label: "Unanswered", items: indexedQuestions.filter(({ question }) => !answerMap.has(question.id)) },
        { label: "Answered", items: indexedQuestions.filter(({ question }) => answerMap.has(question.id)) },
      ].filter((group) => group.items.length > 0)
    : [{ label: "", items: indexedQuestions }];

  return (
    <div className="question-bank-navigator">
      <button className="sat-count" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        {currentPage} of {total}
      </button>
      {open && (
        <section className="question-bank-popover" aria-label="Question Bank navigation">
          <header className="question-bank-popover-header">
            <strong>Question Bank</strong>
            <div>
              <button
                className={groupAnswered ? "question-bank-mini-button active" : "question-bank-mini-button"}
                aria-pressed={groupAnswered}
                onClick={() => setGroupAnswered((grouped) => !grouped)}
              >
                <SlidersHorizontal size={13} />
                {groupAnswered ? "Grouped" : "Group Answered"}
              </button>
              <button className="question-bank-close" onClick={() => setOpen(false)} aria-label="Close question bank menu">
                <X size={16} />
              </button>
            </div>
          </header>
          <div className="question-bank-legend">
            <span><i className="legend-dot correct"><Check size={11} /></i> Correct</span>
            <span><i className="legend-dot incorrect"><X size={11} /></i> Incorrect</span>
            <span><i className="legend-flag" /> For Review</span>
            <span><i className="legend-dot retry" /> Correct (incorrect attempts)</span>
          </div>
          <div className="question-bank-difficulty-legend">
            <span><i className="difficulty-swatch easy" /> Easy</span>
            <span><i className="difficulty-swatch medium" /> Medium</span>
            <span><i className="difficulty-swatch hard" /> Hard</span>
          </div>
          <div className="question-bank-groups">
            {questionGroups.map((group) => (
              <section className="question-bank-grid-group" key={group.label || "all"}>
                {group.label && <h4>{group.label}<span>{group.items.length}</span></h4>}
                <div className="question-bank-grid">
            {group.items.map(({ question, index }) => {
              const answer = answerMap.get(question.id);
              const wrongAttempts = wrongChoices[question.id]?.length ?? 0;
              const correctAfterWrong = Boolean(answer?.correct && wrongAttempts > 0);
              const active = index === currentIndex;
              const statusClass = answer?.correct ? (correctAfterWrong ? "retry" : "correct") : answer ? "incorrect" : "";
              return (
                <button
                  key={question.id}
                  className={[
                    "question-bank-cell",
                    question.difficulty.toLowerCase(),
                    statusClass,
                    active ? "active" : "",
                  ].join(" ")}
                  onClick={() => {
                    onGoTo(index);
                    setOpen(false);
                  }}
                  title={`${index + 1}. ${question.difficulty}${answer ? answer.correct ? " · Correct" : " · Incorrect" : ""}`}
                >
                  {index + 1}
                  {reviewQuestionIds.includes(question.id) && <Bookmark className="question-bank-review-mark" size={11} />}
                  {answer?.correct && <Check className="question-bank-status-mark" size={11} />}
                  {answer && !answer.correct && <X className="question-bank-status-mark" size={11} />}
                </button>
              );
            })}
                </div>
              </section>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function PracticePapersView({ currentUser }: { currentUser: UserProfile }) {
  const availablePaper = practicePapers.find((paper) => paper.status === "available") ?? practicePapers[0];
  const attemptHistoryKey = `sat4-practice-paper-history:${currentUser.id}`;
  const [activePaperId, setActivePaperId] = useState(availablePaper?.id ?? "");
  const [activeModuleIndex, setActiveModuleIndex] = useState<number | null>(null);
  const [activeQuestionIndex, setActiveQuestionIndex] = useState(0);
  const [reviewMode, setReviewMode] = useState(false);
  const [paperStartedAt, setPaperStartedAt] = useState(Date.now());
  const [timerHidden, setTimerHidden] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [paperAnswers, setPaperAnswers] = useState<Record<string, number>>({});
  const [freeResponseAnswers, setFreeResponseAnswers] = useState<Record<string, string>>({});
  const [markedForReview, setMarkedForReview] = useState<Record<string, boolean>>({});
  const [paperSearch, setPaperSearch] = useState("");
  const [paperSectionFilter, setPaperSectionFilter] = useState<"All" | "Full DSAT" | "Reading & Writing" | "Math">("All");
  const [paperSort, setPaperSort] = useState<"Newest" | "Oldest" | "Title">("Newest");
  const [paperLoading, setPaperLoading] = useState(true);
  const [paperError, setPaperError] = useState("");
  const [paperIntroOpen, setPaperIntroOpen] = useState(false);
  const [pendingModuleIndex, setPendingModuleIndex] = useState(0);
  const [confirmNextModuleIndex, setConfirmNextModuleIndex] = useState<number | null>(null);
  const [breakMode, setBreakMode] = useState(false);
  const [breakStartedAt, setBreakStartedAt] = useState(Date.now());
  const [navOpen, setNavOpen] = useState(false);
  const [paperResultOpen, setPaperResultOpen] = useState(false);
  const [paperCalculating, setPaperCalculating] = useState(false);
  const [completedModules, setCompletedModules] = useState<Record<string, boolean>>({});
  const [paperElapsedSeconds, setPaperElapsedSeconds] = useState(0);
  const [paperHighlightOpen, setPaperHighlightOpen] = useState(false);
  const [paperHighlightTone, setPaperHighlightTone] = useState<HighlightTone>("yellow");
  const [paperHighlights, setPaperHighlights] = useState<Record<string, PracticeHighlight[]>>({});
  const [paperMoreOpen, setPaperMoreOpen] = useState(false);
  const [paperDirectionsOpen, setPaperDirectionsOpen] = useState(false);
  const [paperReferenceOpen, setPaperReferenceOpen] = useState(false);
  const [paperCalculatorOpen, setPaperCalculatorOpen] = useState(false);
  const [paperCalculatorDragging, setPaperCalculatorDragging] = useState(false);
  const [paperCalculatorFrame, setPaperCalculatorFrame] = useState({ x: 880, y: 92, width: 430, height: 540 });
  const [paperTextScale, setPaperTextScale] = useState<"standard" | "large">("standard");
  const [paperLineFocus, setPaperLineFocus] = useState(false);
  const [paperLineFocusY, setPaperLineFocusY] = useState(360);
  const [paperReportMessage, setPaperReportMessage] = useState("");
  const [attemptMode, setAttemptMode] = useState<"full" | "module">("full");
  const [attemptModuleIndex, setAttemptModuleIndex] = useState<number | null>(null);
  const [attemptQuestionIds, setAttemptQuestionIds] = useState<string[]>([]);
  const [attemptId, setAttemptId] = useState(() => `paper-attempt-${Date.now()}`);
  const [attemptHistory, setAttemptHistory] = useState<PracticePaperAttempt[]>(() => {
    try {
      const stored = window.localStorage.getItem(attemptHistoryKey);
      return stored ? (JSON.parse(stored) as PracticePaperAttempt[]) : [];
    } catch {
      return [];
    }
  });
  const [reviewAttempt, setReviewAttempt] = useState<PracticePaperAttempt | null>(null);
  const [resultReviewIndex, setResultReviewIndex] = useState(0);
  const [resultReviewFilter, setResultReviewFilter] = useState<"All" | "Incorrect" | "Unanswered" | "Marked">("All");
  const savedAttemptId = useRef("");
  const historyRailRef = useRef<HTMLDivElement | null>(null);

  const activePaper = practicePapers.find((paper) => paper.id === activePaperId) ?? availablePaper;
  const activeModule = activeModuleIndex === null ? null : activePaper?.modules[activeModuleIndex] ?? null;
  const activeQuestion = activeModule?.questions[activeQuestionIndex] ?? null;
  const activePrompt = activeQuestion ? splitPrompt(activeQuestion.prompt) : null;
  const elapsedSeconds = Math.max(0, Math.floor((now - paperStartedAt) / 1000));
  const remainingSeconds = activeModule ? Math.max(0, activeModule.durationMinutes * 60 - elapsedSeconds) : 0;
  const breakRemainingSeconds = Math.max(0, 10 * 60 - Math.floor((now - breakStartedAt) / 1000));
  const activePaperQuestions = activePaper?.modules.flatMap((module) => module.questions) ?? [];
  const attemptQuestions = attemptQuestionIds.length
    ? attemptQuestionIds.map((id) => questions.find((question) => question.id === id)).filter((question): question is Question => Boolean(question))
    : activePaperQuestions;
  const paperResultStats = useMemo(() => {
    const answeredQuestions = attemptQuestions.filter((question) =>
      isFreeResponseQuestion(question)
        ? Boolean(freeResponseAnswers[question.id]?.trim())
        : paperAnswers[question.id] !== undefined
    );
    const correctQuestions = answeredQuestions.filter((question) =>
      isPaperAnswerCorrect(question, paperAnswers, freeResponseAnswers)
    );
    const sectionStats = (["Verbal", "Math"] as Section[]).map((section) => {
      const sectionQuestions = attemptQuestions.filter((question) => question.section === section);
      const answered = sectionQuestions.filter((question) =>
        isFreeResponseQuestion(question)
          ? Boolean(freeResponseAnswers[question.id]?.trim())
          : paperAnswers[question.id] !== undefined
      );
      const correct = answered.filter((question) => isPaperAnswerCorrect(question, paperAnswers, freeResponseAnswers));
      const accuracy = sectionQuestions.length ? correct.length / sectionQuestions.length : 0;
      return {
        section,
        total: sectionQuestions.length,
        answered: answered.length,
        correct: correct.length,
        accuracy: Math.round(accuracy * 100),
        score: sectionQuestions.length ? Math.round((200 + 600 * accuracy) / 10) * 10 : 0,
      };
    });
    const skillMisses = answeredQuestions
      .filter((question) => !isPaperAnswerCorrect(question, paperAnswers, freeResponseAnswers))
      .reduce<Record<string, number>>((result, question) => {
        result[question.skill] = (result[question.skill] ?? 0) + 1;
        return result;
      }, {});
    return {
      total: attemptQuestions.length,
      answered: answeredQuestions.length,
      correct: correctQuestions.length,
      accuracy: attemptQuestions.length ? Math.round((correctQuestions.length / attemptQuestions.length) * 100) : 0,
      sectionStats,
      focusSkills: Object.entries(skillMisses).sort((a, b) => b[1] - a[1]).slice(0, 3),
    };
  }, [attemptQuestions, freeResponseAnswers, paperAnswers]);

  const filteredPapers = useMemo(() => {
    const query = paperSearch.trim().toLowerCase();
    const list = practicePapers.filter((paper) => {
      if (paper.status !== "available") return false;
      const matchesSearch = !query || `${paper.title} ${paper.dateLabel}`.toLowerCase().includes(query);
      const matchesSection = paperSectionFilter === "All" || paper.tags.includes(paperSectionFilter);
      return matchesSearch && matchesSection;
    });

    return [...list].sort((first, second) => {
      if (paperSort === "Title") return first.title.localeCompare(second.title);
      const dateDiff = new Date(first.dateSort).getTime() - new Date(second.dateSort).getTime();
      return paperSort === "Newest" ? -dateDiff : dateDiff;
    });
  }, [paperSearch, paperSectionFilter, paperSort]);

  useEffect(() => {
    const loadingTimer = window.setTimeout(() => setPaperLoading(false), 360);
    return () => window.clearTimeout(loadingTimer);
  }, []);

  useEffect(() => {
    if (activeModuleIndex === null && !breakMode) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [activeModuleIndex, breakMode]);

  useEffect(() => {
    if (!paperResultOpen || !activePaper || savedAttemptId.current === attemptId) return;
    const estimatedScore = paperResultStats.sectionStats.reduce((sum, section) => sum + section.score, 0);
    const moduleLabel = attemptModuleIndex === null ? null : activePaper.modules[attemptModuleIndex]?.label;
    const attempt: PracticePaperAttempt = {
      id: attemptId,
      paperId: activePaper.id,
      paperTitle: activePaper.title,
      mode: attemptMode,
      moduleIndex: attemptModuleIndex ?? undefined,
      label: attemptMode === "module" && moduleLabel ? moduleLabel : "Full Digital SAT",
      completedAt: new Date().toISOString(),
      elapsedSeconds: paperElapsedSeconds,
      questionIds: attemptQuestions.map((question) => question.id),
      selectedAnswers: paperAnswers,
      freeAnswers: freeResponseAnswers,
      markedForReview,
      correct: paperResultStats.correct,
      answered: paperResultStats.answered,
      total: paperResultStats.total,
      accuracy: paperResultStats.accuracy,
      estimatedScore,
    };
    setAttemptHistory((history) => {
      const next = [attempt, ...history.filter((item) => item.id !== attempt.id)].slice(0, 30);
      window.localStorage.setItem(attemptHistoryKey, JSON.stringify(next));
      return next;
    });
    savedAttemptId.current = attemptId;
  }, [activePaper, attemptHistoryKey, attemptId, attemptMode, attemptModuleIndex, attemptQuestions, freeResponseAnswers, markedForReview, paperAnswers, paperElapsedSeconds, paperResultOpen, paperResultStats]);

  useEffect(() => {
    if (!paperCalculating) return;
    const resultTimer = window.setTimeout(() => {
      setPaperCalculating(false);
      setPaperResultOpen(true);
    }, 1400);
    return () => window.clearTimeout(resultTimer);
  }, [paperCalculating]);

  if (!activePaper) {
    return (
      <section className="practice-papers-page">
        <p className="eyebrow">Practice Papers</p>
        <h1>No papers yet.</h1>
      </section>
    );
  }

  const startModule = (moduleIndex = 0) => {
    if (!activePaper.modules[moduleIndex]) return;
    setActiveModuleIndex(moduleIndex);
    setActiveQuestionIndex(0);
    setReviewMode(false);
    setBreakMode(false);
    setPaperIntroOpen(false);
    setConfirmNextModuleIndex(null);
    setNavOpen(false);
    setTimerHidden(false);
    setPaperResultOpen(false);
    setPaperCalculating(false);
    setPaperHighlightOpen(false);
    setPaperMoreOpen(false);
    setPaperDirectionsOpen(false);
    setPaperReferenceOpen(false);
    setPaperCalculatorOpen(false);
    setPaperLineFocus(false);
    setPaperStartedAt(Date.now());
    setNow(Date.now());
  };

  const openPaperIntro = (paper: PracticePaper, moduleIndex = 0, mode: "full" | "module" = "full") => {
    if (paper.status !== "available" || !paper.modules.length) return;
    const selectedQuestions = mode === "module"
      ? paper.modules[moduleIndex]?.questions ?? []
      : paper.modules.flatMap((module) => module.questions);
    setActivePaperId(paper.id);
    setPendingModuleIndex(moduleIndex);
    setAttemptMode(mode);
    setAttemptModuleIndex(mode === "module" ? moduleIndex : null);
    setAttemptQuestionIds(selectedQuestions.map((question) => question.id));
    setAttemptId(`paper-attempt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    savedAttemptId.current = "";
    setPaperAnswers({});
    setFreeResponseAnswers({});
    setMarkedForReview({});
    setCompletedModules({});
    setPaperElapsedSeconds(0);
    setPaperResultOpen(false);
    setPaperCalculating(false);
    setReviewAttempt(null);
    setPaperIntroOpen(true);
    setBreakMode(false);
    setReviewMode(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const finishModule = () => {
    if (activeModule && !completedModules[activeModule.id]) {
      setPaperElapsedSeconds((total) => total + Math.min(elapsedSeconds, activeModule.durationMinutes * 60));
      setCompletedModules((current) => ({ ...current, [activeModule.id]: true }));
    }
    setReviewMode(true);
    setNavOpen(false);
  };

  const requestNextModule = () => {
    if (activeModuleIndex === null) return;
    if (attemptMode === "module") {
      setActiveModuleIndex(null);
      setReviewMode(false);
      setConfirmNextModuleIndex(null);
      setPaperCalculating(true);
      return;
    }
    const nextIndex = activeModuleIndex + 1;
    if (!activePaper.modules[nextIndex]) {
      setActiveModuleIndex(null);
      setReviewMode(false);
      setConfirmNextModuleIndex(null);
      setPaperCalculating(true);
      return;
    }
    setConfirmNextModuleIndex(nextIndex);
  };

  const confirmMoveToNextModule = () => {
    if (confirmNextModuleIndex === null || activeModuleIndex === null) return;
    if (activeModuleIndex === 1) {
      setReviewMode(false);
      setBreakMode(true);
      setBreakStartedAt(Date.now());
      setNow(Date.now());
      setConfirmNextModuleIndex(null);
      setActiveModuleIndex(null);
      return;
    }
    startModule(confirmNextModuleIndex);
  };

  const selectQuestionFromNav = (index: number) => {
    setActiveQuestionIndex(index);
    setReviewMode(false);
    setNavOpen(false);
  };

  const capturePaperHighlight = () => {
    if (!paperHighlightOpen || !activeQuestion) return;
    const selection = window.getSelection();
    const text = selection?.toString().replace(/\s+/g, " ").trim() ?? "";
    if (text.length < 2 || text.length > 240) return;
    setPaperHighlights((current) => {
      const highlights = current[activeQuestion.id] ?? [];
      if (highlights.some((highlight) => highlight.text.toLowerCase() === text.toLowerCase())) return current;
      return { ...current, [activeQuestion.id]: [...highlights, { text, tone: paperHighlightTone }] };
    });
    selection?.removeAllRanges();
  };

  const movePaperCalculator = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!paperCalculatorDragging) return;
    setPaperCalculatorFrame((frame) => ({
      ...frame,
      x: Math.max(8, Math.min(window.innerWidth - 120, frame.x + event.movementX)),
      y: Math.max(82, Math.min(window.innerHeight - 90, frame.y + event.movementY)),
    }));
  };

  const resetPaperAttempt = () => {
    openPaperIntro(activePaper, attemptModuleIndex ?? 0, attemptMode);
  };

  const getCurrentAttemptSnapshot = (): PracticePaperAttempt => {
    const estimatedScore = paperResultStats.sectionStats.reduce((sum, section) => sum + section.score, 0);
    const moduleLabel = attemptModuleIndex === null ? null : activePaper.modules[attemptModuleIndex]?.label;
    return {
      id: attemptId,
      paperId: activePaper.id,
      paperTitle: activePaper.title,
      mode: attemptMode,
      moduleIndex: attemptModuleIndex ?? undefined,
      label: attemptMode === "module" && moduleLabel ? moduleLabel : "Full Digital SAT",
      completedAt: new Date().toISOString(),
      elapsedSeconds: paperElapsedSeconds,
      questionIds: attemptQuestions.map((question) => question.id),
      selectedAnswers: paperAnswers,
      freeAnswers: freeResponseAnswers,
      markedForReview,
      correct: paperResultStats.correct,
      answered: paperResultStats.answered,
      total: paperResultStats.total,
      accuracy: paperResultStats.accuracy,
      estimatedScore,
    };
  };

  if (reviewAttempt) {
    const reviewQuestions = reviewAttempt.questionIds
      .map((id) => questions.find((question) => question.id === id))
      .filter((question): question is Question => Boolean(question));
    const questionStatus = (question: Question) => {
      const answered = isFreeResponseQuestion(question)
        ? Boolean(reviewAttempt.freeAnswers[question.id]?.trim())
        : reviewAttempt.selectedAnswers[question.id] !== undefined;
      return {
        answered,
        correct: answered && isPaperAnswerCorrect(question, reviewAttempt.selectedAnswers, reviewAttempt.freeAnswers),
        marked: Boolean(reviewAttempt.markedForReview[question.id]),
      };
    };
    const filteredReviewQuestions = reviewQuestions.filter((question) => {
      const status = questionStatus(question);
      if (resultReviewFilter === "Incorrect") return status.answered && !status.correct;
      if (resultReviewFilter === "Unanswered") return !status.answered;
      if (resultReviewFilter === "Marked") return status.marked;
      return true;
    });
    const safeReviewIndex = Math.min(resultReviewIndex, Math.max(0, filteredReviewQuestions.length - 1));
    const reviewQuestion = filteredReviewQuestions[safeReviewIndex] ?? null;
    const reviewStatus = reviewQuestion ? questionStatus(reviewQuestion) : null;
    const selectedChoice = reviewQuestion ? reviewAttempt.selectedAnswers[reviewQuestion.id] : undefined;
    const acceptedAnswers = reviewQuestion && isFreeResponseQuestion(reviewQuestion) ? parseAcceptedAnswers(reviewQuestion) : [];

    return (
      <main className="paper-answer-review-shell">
        <header className="paper-answer-review-topbar">
          <button onClick={() => setReviewAttempt(null)}><ChevronLeft size={17} /> {paperResultOpen ? "Back to results" : "Back to history"}</button>
          <div><span>{reviewAttempt.label}</span><strong>Answer review</strong></div>
          <span>{reviewAttempt.correct}/{reviewAttempt.total} correct</span>
        </header>
        <div className="paper-answer-review-layout">
          <aside className="paper-review-sidebar">
            <div className="paper-review-filter-tabs" role="group" aria-label="Review filter">
              {(["All", "Incorrect", "Unanswered", "Marked"] as const).map((filter) => (
                <button key={filter} className={resultReviewFilter === filter ? "active" : ""} onClick={() => { setResultReviewFilter(filter); setResultReviewIndex(0); }}>{filter}</button>
              ))}
            </div>
            <div className="paper-review-history-legend">
              <span><i className="correct"><Check size={10} /></i> Correct</span>
              <span><i className="incorrect"><X size={10} /></i> Incorrect</span>
              <span><i className="unanswered" /> Unanswered</span>
            </div>
            <div className="paper-review-history-grid">
              {filteredReviewQuestions.map((question, index) => {
                const status = questionStatus(question);
                const originalIndex = reviewQuestions.findIndex((item) => item.id === question.id);
                return (
                  <button key={question.id} className={[status.correct ? "correct" : status.answered ? "incorrect" : "unanswered", status.marked ? "marked" : "", index === safeReviewIndex ? "active" : ""].join(" ")} onClick={() => setResultReviewIndex(index)}>
                    {originalIndex + 1}
                    {status.marked && <Bookmark size={10} fill="currentColor" />}
                  </button>
                );
              })}
            </div>
          </aside>

          <section className="paper-review-detail">
            {reviewQuestion && reviewStatus ? (
              <>
                <header>
                  <div><span>Question {reviewQuestions.findIndex((question) => question.id === reviewQuestion.id) + 1}</span><strong>{reviewQuestion.domain}</strong></div>
                  <span className={reviewStatus.correct ? "correct" : reviewStatus.answered ? "incorrect" : "unanswered"}>{reviewStatus.correct ? "Correct" : reviewStatus.answered ? "Incorrect" : "Unanswered"}</span>
                </header>
                <article className="paper-review-question-card">
                  {reviewQuestion.imagePath && <img src={reviewQuestion.imagePath} alt="Question visual" />}
                  {(!reviewQuestion.imagePath || !/^enter your answer\.?$/i.test(reviewQuestion.prompt.trim())) && <p>{reviewQuestion.prompt}</p>}
                  {isFreeResponseQuestion(reviewQuestion) ? (
                    <div className="paper-review-free-answer"><span>Your answer</span><strong>{reviewAttempt.freeAnswers[reviewQuestion.id] || "No answer"}</strong><span>Accepted answer</span><strong>{acceptedAnswers.join(" or ") || "See explanation"}</strong></div>
                  ) : (
                    <div className="paper-review-choice-list">
                      {reviewQuestion.choices.map((choice, index) => (
                        <div key={`${reviewQuestion.id}-${index}`} className={[index === reviewQuestion.correctIndex ? "correct" : "", index === selectedChoice ? "selected" : ""].join(" ")}>
                          <span>{String.fromCharCode(65 + index)}</span>
                          {reviewQuestion.choiceImagePaths?.[index] && /^Choice [A-D]$/i.test(choice) ? <img src={reviewQuestion.choiceImagePaths[index]} alt={`Choice ${String.fromCharCode(65 + index)}`} /> : <strong>{choice.replace(/^[A-D][.)]\s*/, "")}</strong>}
                          {index === reviewQuestion.correctIndex && <small><Check size={13} /> Correct answer</small>}
                          {index === selectedChoice && index !== reviewQuestion.correctIndex && <small><X size={13} /> Your answer</small>}
                        </div>
                      ))}
                    </div>
                  )}
                </article>
                <article className="paper-review-explanation"><span>Explanation</span><p>{reviewQuestion.explanation}</p></article>
                <footer><button disabled={safeReviewIndex === 0} onClick={() => setResultReviewIndex((index) => Math.max(0, index - 1))}>Previous</button><span>{safeReviewIndex + 1} of {filteredReviewQuestions.length}</span><button disabled={safeReviewIndex >= filteredReviewQuestions.length - 1} onClick={() => setResultReviewIndex((index) => Math.min(filteredReviewQuestions.length - 1, index + 1))}>Next</button></footer>
              </>
            ) : (
              <div className="paper-review-empty"><Check size={28} /><h2>No questions in this filter</h2><p>Choose another filter to continue reviewing.</p></div>
            )}
          </section>
        </div>
      </main>
    );
  }

  if (paperCalculating) {
    return (
      <main className="paper-calculating-shell" aria-live="polite" aria-busy="true">
        <section className="paper-calculating-card">
          <div className="paper-calculating-mark" aria-hidden="true"><span /><span /><span /></div>
          <p>Practice complete</p>
          <h1>Calculating your results</h1>
          <span>Checking answers and preparing your review.</span>
        </section>
      </main>
    );
  }

  if (paperResultOpen) {
    const estimatedScore = paperResultStats.sectionStats.reduce((sum, section) => sum + section.score, 0);
    const resultLabel = attemptMode === "module" && attemptModuleIndex !== null
      ? activePaper.modules[attemptModuleIndex]?.label ?? "Module practice"
      : "Full Digital SAT";
    return (
      <main className="paper-results-shell">
        <header className="paper-results-header">
          <div>
            <p className="eyebrow">Practice complete</p>
            <h1>Your results are ready.</h1>
            <p>{activePaper.title} · {resultLabel}</p>
          </div>
          <button className="paper-soft-button" onClick={() => setPaperResultOpen(false)}>Back to papers</button>
        </header>

        <section className="paper-results-summary" aria-label="Practice test result summary">
          <article className="paper-score-card">
            <span>{attemptMode === "module" ? "Module score estimate" : "Practice score estimate"}</span>
            <strong>{estimatedScore}</strong>
            <small>Based on this paper’s raw accuracy, not an official College Board score.</small>
          </article>
          <article><span>Correct</span><strong>{paperResultStats.correct}/{paperResultStats.total}</strong><small>{paperResultStats.accuracy}% accuracy</small></article>
          <article><span>Answered</span><strong>{paperResultStats.answered}/{paperResultStats.total}</strong><small>{paperResultStats.total - paperResultStats.answered} left blank</small></article>
          <article><span>Time used</span><strong>{formatTimer(paperElapsedSeconds)}</strong><small>Across completed modules</small></article>
        </section>

        <section className="paper-results-detail">
          <article className="paper-section-results">
            <div className="paper-results-section-heading">
              <div>
                <p className="eyebrow">Section breakdown</p>
                <h2>See where the score came from</h2>
              </div>
            </div>
            {paperResultStats.sectionStats.filter((stat) => stat.total > 0).map((stat) => (
              <div className="paper-section-result-row" key={stat.section}>
                <div><strong>{sectionLabel(stat.section)}</strong><span>{stat.correct} of {stat.total} correct</span></div>
                <div className="paper-result-progress" aria-label={`${stat.accuracy}% correct`}><span style={{ width: `${stat.accuracy}%` }} /></div>
                <strong>{stat.score}</strong>
              </div>
            ))}
          </article>

          <article className="paper-focus-card">
            <p className="eyebrow">What to study next</p>
            <h2>{paperResultStats.focusSkills.length ? "Turn mistakes into your next practice set" : paperResultStats.answered < paperResultStats.total ? "Answer more questions for a focused plan" : "Excellent work"}</h2>
            {paperResultStats.focusSkills.length ? (
              <ul>
                {paperResultStats.focusSkills.map(([skill, misses]) => <li key={skill}><span>{skill}</span><strong>{misses} to review</strong></li>)}
              </ul>
            ) : (
              <p>{paperResultStats.answered < paperResultStats.total ? "There are not enough answered mistakes to identify a weak skill yet. Retake the paper and complete each module." : "No weak skills appeared in this attempt. Try another paper to confirm your consistency."}</p>
            )}
            <div className="paper-result-actions">
              <button className="primary-button" onClick={() => { setReviewAttempt(attemptHistory.find((attempt) => attempt.id === attemptId) ?? getCurrentAttemptSnapshot()); setResultReviewFilter("All"); setResultReviewIndex(0); }}><BookOpenCheck size={16} /> Review answers</button>
              <button className="paper-soft-button" onClick={resetPaperAttempt}><RotateCcw size={16} /> Retake</button>
            </div>
          </article>
        </section>
      </main>
    );
  }

  if (paperIntroOpen) {
    const introModule = activePaper.modules[pendingModuleIndex];
    const introFacts = attemptMode === "module"
      ? [`${introModule?.questions.length ?? 0} questions`, `${introModule?.durationMinutes ?? 0} minutes`, "Instant review"]
      : [`${activePaper.modules.reduce((sum, module) => sum + module.questions.length, 0)} questions`, `${activePaper.modules.reduce((sum, module) => sum + module.durationMinutes, 0)} minutes`, `${activePaper.modules.length} modules`];
    return (
      <main className="paper-intro-shell">
        <section className="paper-intro-card">
          <p className="paper-intro-kicker">Ready to begin?</p>
          <h1>{attemptMode === "module" ? introModule?.label : "Full Digital SAT"}</h1>
          <div className="paper-intro-facts">
            {introFacts.map((fact) => <strong key={fact}>{fact}</strong>)}
          </div>
        </section>
        <footer className="paper-intro-footer">
          <button className="paper-soft-button" onClick={() => setPaperIntroOpen(false)}>Back</button>
          <button className="paper-soft-button primary" onClick={() => startModule(pendingModuleIndex)}>Next</button>
        </footer>
      </main>
    );
  }

  if (breakMode) {
    return (
      <main className="paper-break-shell">
        <section className="paper-break-timer-card">
          <span>Remaining Break Time:</span>
          <strong>{formatTimer(breakRemainingSeconds)}</strong>
          <button onClick={() => startModule(2)}>Resume Testing</button>
        </section>
        <section className="paper-break-copy">
          <h1>Practice Test Break</h1>
          <p>You can resume this practice test as soon as you're ready to move on. On test day, you'll wait until the clock counts down.</p>
          <hr />
          <h2>Take a Break: Do Not Close Your Device</h2>
          <p>After the break, press Resume Testing and you'll start the Math section.</p>
          <strong>Follow these rules during the break:</strong>
          <ol>
            <li>Do not disturb students who are still testing.</li>
            <li>Do not exit the app or close your laptop.</li>
            <li>Do not access phones, smartwatches, textbooks, notes, or the internet.</li>
            <li>Do not eat or drink near any testing device.</li>
            <li>Do not close the testing app or your laptop.</li>
          </ol>
        </section>
      </main>
    );
  }

  if (activeModule && activeQuestion && activePrompt) {
    const questionAnswer = paperAnswers[activeQuestion.id];
    const freeAnswer = freeResponseAnswers[activeQuestion.id] ?? "";
    const questionMarked = Boolean(markedForReview[activeQuestion.id]);
    const isFreeResponse = isFreeResponseQuestion(activeQuestion);
    const sectionNumber = activeModule.section === "Verbal" ? 1 : 2;
    const isVerbalPaperQuestion = activeModule.section === "Verbal";
    const activePaperHighlights = paperHighlights[activeQuestion.id] ?? [];
    const verbalQuestionOnLeft = isVerbalPaperQuestion && !activePrompt.passage && !activePrompt.notes.length;
    const rightQuestionText = verbalQuestionOnLeft
      ? "Which choice best completes the text?"
      : activePrompt.questionText;

    const navigator = navOpen && (
      <div className="paper-nav-popover">
        <header>
          <strong>Section {sectionNumber}, Module {activeModule.moduleNumber}: {sectionLabel(activeModule.section)}</strong>
          <button onClick={() => setNavOpen(false)}><X size={17} /></button>
        </header>
        <div className="paper-nav-legend">
          <span className="current-dot">Current</span>
          <span className="empty-dot">Unanswered</span>
          <span className="review-dot">For Review</span>
        </div>
        <div className="paper-nav-grid">
          {activeModule.questions.map((question, index) => {
            const answered = paperAnswers[question.id] !== undefined || Boolean(freeResponseAnswers[question.id]);
            return (
              <button
                key={question.id}
                className={[
                  index === activeQuestionIndex ? "current" : "",
                  answered ? "answered" : "unanswered",
                  markedForReview[question.id] ? "marked" : "",
                ].join(" ")}
                onClick={() => selectQuestionFromNav(index)}
              >
                {index + 1}
              </button>
            );
          })}
        </div>
        <button className="paper-preview-button" onClick={finishModule}>Go to Preview Page</button>
      </div>
    );

    if (reviewMode) {
      return (
        <main className="paper-exam-shell paper-exam-shell-review">
          <header className="paper-exam-topbar">
            <div className="paper-directions">Review module</div>
            <div className="paper-timer">
              <strong>{timerHidden ? "--:--" : formatTimer(remainingSeconds)}</strong>
              <button onClick={() => setTimerHidden((hidden) => !hidden)}>{timerHidden ? "Show" : "Hide"}</button>
            </div>
            <div className="paper-review-status"><ClipboardCheck size={17} /> Check unanswered and marked questions</div>
          </header>
          <section className="paper-review-screen">
            <h1>Check Your Work</h1>
            <p>
              On test day, you won't be able to move on to the next module until time expires.
              <br />
              For these practice questions, you can click <strong>Next</strong> when you're ready to move on.
            </p>
            <article className="paper-review-card">
              <header>
                <strong>
                  Section {sectionNumber}, Module {activeModule.moduleNumber}: {sectionLabel(activeModule.section)}
                </strong>
                <span><i /> Unanswered</span>
                <span><Bookmark size={14} fill="#ff3b30" color="#ff3b30" /> For Review</span>
              </header>
              <div className="paper-review-grid">
                {activeModule.questions.map((question, index) => {
                  const answered = paperAnswers[question.id] !== undefined || Boolean(freeResponseAnswers[question.id]);
                  return (
                    <button
                      key={question.id}
                      className={[
                        !answered ? "unanswered" : "",
                        markedForReview[question.id] ? "marked" : "",
                      ].join(" ")}
                      onClick={() => selectQuestionFromNav(index)}
                    >
                      {index + 1}
                      {markedForReview[question.id] && <Bookmark size={10} fill="#ff3b30" color="#ff3b30" />}
                    </button>
                  );
                })}
              </div>
            </article>
          </section>
          <footer className="paper-exam-footer">
            <button className="paper-count" onClick={() => setNavOpen(true)}>{activeModule.questions.length} of {activeModule.questions.length}</button>
            <div>
              <button className="paper-soft-button" onClick={() => setReviewMode(false)}>Back</button>
              <button className="paper-soft-button primary" onClick={requestNextModule}>Next</button>
            </div>
          </footer>
          {navigator}
          {confirmNextModuleIndex !== null && (
            <div className="paper-confirm-backdrop">
              <article className="paper-confirm-card">
                <h2>Move to the next module?</h2>
                <p>You will not be able to return to this module after continuing. Make sure you reviewed unanswered and marked questions.</p>
                <div>
                  <button className="paper-soft-button" onClick={() => setConfirmNextModuleIndex(null)}>Stay here</button>
                  <button className="paper-soft-button primary" onClick={confirmMoveToNextModule}>Yes, continue</button>
                </div>
              </article>
            </div>
          )}
        </main>
      );
    }

    return (
      <main className="paper-exam-shell paper-exam-shell-dark">
        <header className="paper-exam-topbar">
          <button className="paper-directions" onClick={() => setPaperDirectionsOpen((open) => !open)} aria-expanded={paperDirectionsOpen}>Section {sectionNumber}, Module {activeModule.moduleNumber}: {sectionLabel(activeModule.section)}</button>
          <div className="paper-timer">
            <strong>{timerHidden ? "--:--" : formatTimer(remainingSeconds)}</strong>
            <button onClick={() => setTimerHidden((hidden) => !hidden)}>{timerHidden ? "Show" : "Hide"}</button>
          </div>
          <div className="paper-tools">
            {activeModule.section === "Math" && <button className={paperCalculatorOpen ? "active" : ""} onClick={() => setPaperCalculatorOpen((open) => !open)}><Calculator size={17} /> Calculator</button>}
            {activeModule.section === "Math" && <button className={paperReferenceOpen ? "active" : ""} onClick={() => { setPaperReferenceOpen((open) => !open); setPaperMoreOpen(false); }}><FileText size={17} /> Reference</button>}
            <button className={paperHighlightOpen ? "active" : ""} onClick={() => { setPaperHighlightOpen((open) => !open); setPaperMoreOpen(false); setPaperReferenceOpen(false); }}><Highlighter size={17} /> Highlight</button>
            <button className={paperMoreOpen ? "active" : ""} onClick={() => { setPaperMoreOpen((open) => !open); setPaperHighlightOpen(false); setPaperReferenceOpen(false); }}><MoreHorizontal size={17} /> More</button>
          </div>
        </header>

        {paperDirectionsOpen && (
          <aside className="paper-tool-popover paper-directions-popover">
            <header><strong>{sectionLabel(activeModule.section)} directions</strong><button onClick={() => setPaperDirectionsOpen(false)} aria-label="Close directions"><X size={16} /></button></header>
            <p>Answer every question you can. You may move within this module and mark questions for review. Once you continue to the next module, you cannot return.</p>
          </aside>
        )}

        {paperHighlightOpen && (
          <aside className="paper-tool-popover paper-highlight-popover" aria-label="Highlight tool">
            <header><strong>Highlight</strong><button onClick={() => setPaperHighlightOpen(false)} aria-label="Close highlight tool"><X size={16} /></button></header>
            <p>Select text in the question or an answer choice.</p>
            <div className="paper-highlight-tones">
              {(["yellow", "mint", "pink"] as HighlightTone[]).map((tone) => <button key={tone} className={`${tone}${paperHighlightTone === tone ? " active" : ""}`} onClick={() => setPaperHighlightTone(tone)}><span />{tone}</button>)}
            </div>
            <button className="paper-tool-action" disabled={!activePaperHighlights.length} onClick={() => setPaperHighlights((current) => ({ ...current, [activeQuestion.id]: [] }))}>Clear highlights ({activePaperHighlights.length})</button>
          </aside>
        )}

        {paperMoreOpen && (
          <aside className="paper-tool-popover paper-more-popover" aria-label="Display settings">
            <header><strong>Display settings</strong><button onClick={() => setPaperMoreOpen(false)} aria-label="Close display settings"><X size={16} /></button></header>
            <span>Text size</span>
            <div className="paper-segmented"><button className={paperTextScale === "standard" ? "active" : ""} onClick={() => setPaperTextScale("standard")}>Standard</button><button className={paperTextScale === "large" ? "active" : ""} onClick={() => setPaperTextScale("large")}>Large</button></div>
            <button className="paper-line-toggle" aria-pressed={paperLineFocus} onClick={() => setPaperLineFocus((enabled) => !enabled)}><span><strong>Line focus</strong><small>Keep attention on one reading line</small></span><i /></button>
          </aside>
        )}

        {activeModule.section === "Math" && paperReferenceOpen && (
          <aside className="paper-tool-popover paper-reference-popover" aria-label="SAT math reference sheet">
            <header><strong>Math reference</strong><button onClick={() => setPaperReferenceOpen(false)} aria-label="Close reference"><X size={16} /></button></header>
            <div className="paper-formula-grid"><span>A = πr²</span><span>C = 2πr</span><span>a² + b² = c²</span><span>V = ℓwh</span><span>V = πr²h</span><span>V = ⁴⁄₃πr³</span></div>
            <small>A circle has 360°. Triangle angles total 180°.</small>
          </aside>
        )}

        {activeModule.section === "Math" && paperCalculatorOpen && (
          <aside className="calculator-popover paper-calculator" aria-label="Desmos calculator" style={{ left: paperCalculatorFrame.x, top: paperCalculatorFrame.y, width: paperCalculatorFrame.width, height: paperCalculatorFrame.height }}>
            <div className="calculator-header" onPointerDown={(event) => { setPaperCalculatorDragging(true); event.currentTarget.setPointerCapture(event.pointerId); }} onPointerMove={movePaperCalculator} onPointerUp={(event) => { setPaperCalculatorDragging(false); event.currentTarget.releasePointerCapture(event.pointerId); }} onPointerCancel={() => setPaperCalculatorDragging(false)}>
              <strong>Desmos Calculator</strong><button onClick={() => setPaperCalculatorOpen(false)}>Close</button>
            </div>
            <iframe title="Desmos calculator" src="https://www.desmos.com/calculator" />
          </aside>
        )}

        {paperLineFocus && <div className="paper-line-focus" aria-hidden="true" style={{ top: paperLineFocusY - 42 }} />}

        <section
          className={[
            "paper-stage",
            activeModule.section === "Math" ? "paper-stage-math" : "",
            isFreeResponse ? "paper-stage-free-response" : "",
            paperTextScale === "large" ? "paper-stage-large-text" : "",
          ].join(" ")}
          onMouseUp={capturePaperHighlight}
          onPointerMove={(event) => paperLineFocus && setPaperLineFocusY(event.clientY)}
        >
          {activeModule.section === "Math" && isFreeResponse ? (
            <article className="paper-math-directions">
              <h2>Student-produced response directions</h2>
              <ul>
                <li>If you find more than one correct answer, enter only one answer.</li>
                <li>You can enter up to 5 characters for a positive answer and up to 6 characters for a negative answer.</li>
                <li>If your answer is a fraction that doesn't fit, enter its decimal equivalent.</li>
                <li>Do not enter symbols such as a percent sign, comma, or dollar sign.</li>
              </ul>
              <table>
                <thead><tr><th>Answer</th><th>Acceptable ways</th><th>Not accepted</th></tr></thead>
                <tbody>
                  <tr><td>3.5</td><td>3.5<br />3.50<br />7/2</td><td>31/2<br />3 1/2</td></tr>
                  <tr><td>2/3</td><td>.666<br />.667</td><td>0.66<br />0.67</td></tr>
                </tbody>
              </table>
            </article>
          ) : (
            <article
              className={[
                "paper-passage",
                activePrompt.notes.length ? "paper-notes-passage" : "",
                !activePrompt.passage && !activePrompt.notes.length && !verbalQuestionOnLeft ? "paper-passage-empty" : "",
              ].join(" ")}
            >
              {activePrompt.notes.length ? (
                <div className="paper-notes-block">
                  <p>{activePrompt.notesIntro}</p>
                  <ul>
                    {activePrompt.notes.map((note) => (
                      <li key={note}>{note}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                <>
                  {activeQuestion.imagePath && activeModule.section === "Verbal" && <img className="paper-stimulus-image" src={activeQuestion.imagePath} alt="Table or chart for this question" />}
                  <HighlightedText text={activePrompt.passage || (verbalQuestionOnLeft ? activePrompt.questionText : "")} highlights={activePaperHighlights} />
                </>
              )}
            </article>
          )}

          <article className="paper-question-panel">
            <header className="paper-question-header">
              <span>{activeQuestionIndex + 1}</span>
              <button
                onClick={() =>
                  setMarkedForReview((current) => ({
                    ...current,
                    [activeQuestion.id]: !current[activeQuestion.id],
                  }))
                }
              >
                <Bookmark size={15} fill={questionMarked ? "currentColor" : "none"} />
                Mark for Review
              </button>
              <button className="paper-report-button" onClick={() => setPaperReportMessage("Thanks — this question was flagged for review.")}><FileQuestion size={15} /> Report</button>
            </header>
            {activeQuestion.imagePath && activeModule.section === "Math" && <img className="paper-question-image" src={activeQuestion.imagePath} alt="Math question" />}
            {(!activeQuestion.imagePath || !/^enter your answer\.?$/i.test(rightQuestionText.trim())) && (
              <p className="paper-question-text"><HighlightedText text={rightQuestionText} highlights={activePaperHighlights} /></p>
            )}
            {isFreeResponse ? (
              <label className="paper-free-response-field">
                <span>Your answer</span>
                <input
                  value={freeAnswer}
                  onChange={(event) => setFreeResponseAnswers((current) => ({ ...current, [activeQuestion.id]: event.target.value }))}
                  placeholder="Your answer"
                />
              </label>
            ) : (
              <div className="paper-choice-list">
                {activeQuestion.choices.map((choice, index) => (
                  <button
                    key={`${activeQuestion.id}-${index}`}
                    className={questionAnswer === index ? "selected" : ""}
                    onClick={() => setPaperAnswers((current) => ({ ...current, [activeQuestion.id]: index }))}
                  >
                    <span>{String.fromCharCode(65 + index)}</span>
                    {activeQuestion.choiceImagePaths?.[index] && /^Choice [A-D]$/i.test(choice) ? (
                      <div className={`paper-choice-image-frame ${activeQuestion.id === "M-PSDA-PROB-b8150b17" ? "paper-choice-image-frame-cropped" : ""}`}>
                        <img className="paper-choice-image" src={activeQuestion.choiceImagePaths[index]} alt={`Answer choice ${String.fromCharCode(65 + index)}`} />
                      </div>
                    ) : (
                      <strong><HighlightedText text={choice.replace(/^[A-D][.)]\s*/, "")} highlights={activePaperHighlights} /></strong>
                    )}
                  </button>
                ))}
              </div>
            )}
            {paperReportMessage && <div className="paper-report-toast" role="status">{paperReportMessage}<button onClick={() => setPaperReportMessage("")} aria-label="Dismiss"><X size={14} /></button></div>}
          </article>
        </section>

        <footer className="paper-exam-footer">
          <button className="paper-count" onClick={() => setNavOpen((open) => !open)}>
            Question {activeQuestionIndex + 1} of {activeModule.questions.length} <ChevronRight size={13} />
          </button>
          <div>
            <button
              className="paper-soft-button"
              disabled={activeQuestionIndex === 0}
              onClick={() => setActiveQuestionIndex((index) => Math.max(0, index - 1))}
            >
              Previous
            </button>
            <button
              className="paper-soft-button primary"
              onClick={() => {
                if (activeQuestionIndex >= activeModule.questions.length - 1) finishModule();
                else setActiveQuestionIndex((index) => index + 1);
              }}
            >
              Next
            </button>
          </div>
        </footer>
        {navigator}
      </main>
    );
  }

  const activePaperQuestionCount = activePaper.modules.reduce((sum, module) => sum + module.questions.length, 0);
  const activePaperDuration = activePaper.modules.reduce((sum, module) => sum + module.durationMinutes, 0);
  const activePaperFreeResponseCount = activePaperQuestions.filter(isFreeResponseQuestion).length;
  const activePaperDomains = Object.entries(
    activePaperQuestions.reduce<Record<string, number>>((result, question) => {
      result[question.domain] = (result[question.domain] ?? 0) + 1;
      return result;
    }, {})
  ).sort((first, second) => second[1] - first[1]);

  return (
    <section className="practice-papers-page">
      <div className="practice-papers-hero">
        <p className="eyebrow">Practice Papers</p>
        <h1>Past papers, real exam feel.</h1>
      </div>

      <div className="practice-paper-controls">
        <label className="paper-search-box">
          <Search size={17} />
          <input
            value={paperSearch}
            onChange={(event) => setPaperSearch(event.target.value)}
            placeholder="Search by test name"
          />
        </label>
        <select value={paperSectionFilter} onChange={(event) => setPaperSectionFilter(event.target.value as typeof paperSectionFilter)}>
          <option>All</option>
          <option>Full DSAT</option>
          <option>Reading & Writing</option>
          <option>Math</option>
        </select>
        <select value={paperSort} onChange={(event) => setPaperSort(event.target.value as typeof paperSort)}>
          <option>Newest</option>
          <option>Oldest</option>
          <option>Title</option>
        </select>
      </div>

      {paperError && (
        <article className="paper-state-card error">
          <FileQuestion size={22} />
          <h2>Could not load papers.</h2>
          <p>{paperError}</p>
          <button className="primary-button" onClick={() => setPaperError("")}>Try again</button>
        </article>
      )}

      {paperLoading ? (
        <div className="practice-paper-grid">
          <article className="practice-paper-card skeleton" />
        </div>
      ) : filteredPapers.length ? (
        <div className="practice-paper-grid">
          {filteredPapers.map((paper) => {
            const selected = paper.id === activePaperId;
            const totalQuestions = paper.modules.reduce((sum, module) => sum + module.questions.length, 0);
            const disabled = paper.status !== "available";
            return (
              <article
                key={paper.id}
                className={[
                  "practice-paper-card",
                  selected ? "active" : "",
                  disabled ? "disabled" : "",
                ].join(" ")}
                role={disabled ? undefined : "button"}
                tabIndex={disabled ? -1 : 0}
                onClick={() => openPaperIntro(paper, 0, "full")}
                onKeyDown={(event) => {
                  if (disabled) return;
                  if (event.key === "Enter" || event.key === " ") openPaperIntro(paper, 0, "full");
                }}
              >
                <div className="paper-card-copy">
                  <span><FileText size={17} /> {paper.dateLabel}</span>
                  <h2>{paper.title}</h2>
                  <p>{totalQuestions || "Locked"} questions · {paper.modules.reduce((sum, module) => sum + module.durationMinutes, 0)} min</p>
                </div>
                <button className="primary-button" disabled={disabled} onClick={(event) => { event.stopPropagation(); openPaperIntro(paper, 0, "full"); }}>
                  {disabled ? "Coming soon" : "Start paper"}
                  {!disabled && <ChevronRight size={16} />}
                </button>
              </article>
            );
          })}
        </div>
      ) : (
        <article className="paper-state-card empty">
          <Search size={22} />
          <h2>No papers found.</h2>
          <p>Try another title, section filter, or status. Your current filters stay active while you search.</p>
        </article>
      )}

      {activePaper.modules.length > 0 && (
        <>
          <div className="practice-module-grid">
            {activePaper.modules.map((module, index) => {
              const flower = practiceModuleFlowers[index % practiceModuleFlowers.length];
              return (
                <button key={module.id} onClick={() => openPaperIntro(activePaper, index, "module")}>
                  <span className="practice-module-flower"><img src={flower.src} alt={`${flower.name} bud`} /></span>
                  <span className="practice-module-copy">{module.label}</span>
                  <strong className="practice-module-meta">{module.questions.length} questions · {module.durationMinutes} min</strong>
                  <ChevronRight size={17} />
                </button>
              );
            })}
          </div>
          <section className="practice-history-section">
            <header>
              <h2>Recent attempts</h2>
              {attemptHistory.length > 1 && (
                <div className="practice-history-controls" aria-label="Scroll recent attempts">
                  <button type="button" aria-label="Previous attempts" onClick={() => historyRailRef.current?.scrollBy({ left: -380, behavior: "smooth" })}><ChevronLeft size={19} /></button>
                  <button type="button" aria-label="Next attempts" onClick={() => historyRailRef.current?.scrollBy({ left: 380, behavior: "smooth" })}><ChevronRight size={19} /></button>
                </div>
              )}
            </header>
            {attemptHistory.length ? (
              <div className="practice-history-list" ref={historyRailRef} tabIndex={0} aria-label="Recent practice attempts">
                {attemptHistory.slice(0, 6).map((attempt) => (
                  <article key={attempt.id}>
                    <div className="practice-history-score"><strong>{attempt.accuracy}%</strong><span>{attempt.correct}/{attempt.total}</span></div>
                    <div><h3>{attempt.label}</h3><p>{new Date(attempt.completedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} · {formatTimer(attempt.elapsedSeconds)}</p></div>
                    <button onClick={() => { setReviewAttempt(attempt); setResultReviewFilter("All"); setResultReviewIndex(0); }}>Review <ChevronRight size={15} /></button>
                  </article>
                ))}
              </div>
            ) : (
              <div className="practice-history-empty"><ClipboardCheck size={22} /><div><strong>No completed attempts yet</strong><span>Finish a full test or any standalone module and it will appear here.</span></div></div>
            )}
          </section>
          <article className="practice-plan-card">
            <header>
              <h2>Test overview</h2>
              <strong>{activePaperQuestionCount} questions</strong>
            </header>
            <div className="practice-blueprint-summary">
              <article><span>Test time</span><strong>{activePaperDuration} min</strong><small>Four timed modules and a 10-minute break</small></article>
              <article><span>Answer formats</span><strong>{activePaperQuestionCount - activePaperFreeResponseCount} + {activePaperFreeResponseCount}</strong><small>Multiple choice and student response</small></article>
              <article><span>Results</span><strong>Instant</strong><small>Score estimate, accuracy, and answer review</small></article>
            </div>
            <div className="practice-blueprint-layout">
              <section className="practice-domain-map">
                <h3>Question mix</h3>
                {activePaperDomains.map(([domain, count]) => (
                  <div className="practice-domain-row" key={domain}>
                    <span>{domain}</span>
                    <div aria-label={`${count} questions`}><i style={{ width: `${(count / Math.max(...activePaperDomains.map((entry) => entry[1]))) * 100}%` }} /></div>
                    <strong>{count}</strong>
                  </div>
                ))}
              </section>
            </div>
          </article>
          <section className="practice-upcoming-section" aria-labelledby="practice-upcoming-title">
            <header>
              <h2 id="practice-upcoming-title">Coming next</h2>
            </header>
            {practicePapers.filter((paper) => paper.status === "locked").map((paper) => (
              <article className="practice-paper-card practice-upcoming-card disabled" key={paper.id} aria-disabled="true">
                <div className="paper-card-copy">
                  <span><FileText size={17} /> {paper.dateLabel}</span>
                  <h2>{paper.title}</h2>
                </div>
                <button className="primary-button" disabled>Coming soon</button>
              </article>
            ))}
          </section>
        </>
      )}
    </section>
  );
}

function ArenaView({ currentUser }: { currentUser: UserProfile }) {
  const inviteParams = new URLSearchParams(window.location.search);
  const [room, setRoom] = useState<ArenaRoom | null>(null);
  const [arenaMode, setArenaMode] = useState<"create" | "join">(inviteParams.get("arena") ? "join" : "create");
  const [roomPassword, setRoomPassword] = useState(inviteParams.get("password") ?? "");
  const [joinCode, setJoinCode] = useState((inviteParams.get("arena") ?? "").toUpperCase());
  const [arenaError, setArenaError] = useState("");
  const [inviteCopied, setInviteCopied] = useState(false);
  const [arenaLoading, setArenaLoading] = useState(false);
  const [selectedSections, setSelectedSections] = useState<Section[]>(["Math"]);
  const [selectedDomains, setSelectedDomains] = useState<string[]>([]);
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [maxPlayers, setMaxPlayers] = useState(2);
  const [questionCount, setQuestionCount] = useState(10);
  const [questionStartedAt, setQuestionStartedAt] = useState(Date.now());
  const [freeResponse, setFreeResponse] = useState("");
  const [arenaFeedback, setArenaFeedback] = useState("");
  const [arenaSelectedIndex, setArenaSelectedIndex] = useState<number | null>(null);
  const [arenaWrongChoices, setArenaWrongChoices] = useState<Record<string, number[]>>({});
  const [arenaEliminatedChoices, setArenaEliminatedChoices] = useState<Record<string, number[]>>({});
  const [arenaCooldownUntil, setArenaCooldownUntil] = useState(0);
  const [arenaNow, setArenaNow] = useState(Date.now());
  const [arenaCalculatorOpen, setArenaCalculatorOpen] = useState(false);
  const [arenaCalculatorDragging, setArenaCalculatorDragging] = useState(false);
  const [arenaCalculatorFrame, setArenaCalculatorFrame] = useState({ x: 860, y: 92, width: 430, height: 540 });
  const [reviewIndex, setReviewIndex] = useState(0);
  const [openReviewExplanation, setOpenReviewExplanation] = useState<Record<string, boolean>>({});
  const arenaDemoVideoRef = useRef<HTMLVideoElement>(null);

  const selectedModuleGroups = useMemo(
    () =>
      selectedSections.flatMap((section) =>
        (section === "Math" ? mathDomains : verbalDomains).map((domain) => ({
          section,
          domain,
          skills: (section === "Math" ? mathModules : verbalModules)[domain] ?? [],
        }))
      ),
    [selectedSections]
  );
  const skillOptions = useMemo(() => selectedModuleGroups.flatMap((group) => group.skills), [selectedModuleGroups]);
  const currentArenaQuestion = room?.currentQuestion;
  const currentArenaPrompt = currentArenaQuestion ? splitPrompt(currentArenaQuestion.prompt) : null;
  const selfPlayer = room?.players.find((player) => player.userId === currentUser.id);
  const sortedPlayers = [...(room?.players ?? [])].sort((a, b) => b.score - a.score);
  const isFreeResponseArena = Boolean(currentArenaQuestion && currentArenaQuestion.choices.length <= 1);
  const isArenaMath = currentArenaQuestion?.section === "Math";
  const cooldownSeconds = Math.max(0, Math.ceil((arenaCooldownUntil - arenaNow) / 1000));
  const inviteLink =
    room && typeof window !== "undefined"
      ? `${window.location.origin}${window.location.pathname}?arena=${encodeURIComponent(room.code)}&password=${encodeURIComponent(roomPassword)}`
      : "";

  useEffect(() => {
    if (!room || room.status === "finished") return;
    const timer = window.setInterval(async () => {
      try {
        setRoom(await getArenaRoom(room.id, currentUser.id));
      } catch {
        // Keep the local room state if polling briefly fails.
      }
    }, 1500);
    return () => window.clearInterval(timer);
  }, [currentUser.id, room?.id, room?.status]);

  useEffect(() => {
    if (!room) return;
    setSelectedSections(room.sections?.length ? room.sections : room.section === "Mixed" ? ["Math", "Verbal"] : [room.section]);
    setSelectedDomains(room.domains);
    setSelectedSkills(room.skills);
    setMaxPlayers(room.maxPlayers);
    setQuestionCount(room.questionCount);
  }, [room?.id]);

  useEffect(() => {
    setQuestionStartedAt(Date.now());
    setFreeResponse("");
    setArenaSelectedIndex(null);
    setArenaCooldownUntil(0);
    setArenaFeedback("");
  }, [currentArenaQuestion?.id]);

  useEffect(() => {
    const timer = window.setInterval(() => setArenaNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncDemoPlayback = () => {
      if (!arenaDemoVideoRef.current) return;
      if (motionPreference.matches) arenaDemoVideoRef.current.pause();
      else void arenaDemoVideoRef.current.play().catch(() => undefined);
    };
    syncDemoPlayback();
    motionPreference.addEventListener("change", syncDemoPlayback);
    return () => motionPreference.removeEventListener("change", syncDemoPlayback);
  }, []);

  const moveArenaCalculator = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!arenaCalculatorDragging) return;
    setArenaCalculatorFrame((frame) => ({
      ...frame,
      x: Math.max(8, Math.min(window.innerWidth - 120, frame.x + event.movementX)),
      y: Math.max(82, Math.min(window.innerHeight - 90, frame.y + event.movementY)),
    }));
  };

  const toggleArenaEliminatedChoice = (questionId: string, choiceIndex: number) => {
    setArenaEliminatedChoices((current) => {
      const choices = current[questionId] ?? [];
      const nextChoices = choices.includes(choiceIndex) ? choices.filter((index) => index !== choiceIndex) : [...choices, choiceIndex];
      return { ...current, [questionId]: nextChoices };
    });
  };

  const toggleArenaSkill = (skill: string) => {
    const parentDomain = selectedModuleGroups.find((group) => group.skills.includes(skill))?.domain;
    if (parentDomain) setSelectedDomains((current) => current.filter((item) => item !== parentDomain));
    setSelectedSkills((current) => (current.includes(skill) ? current.filter((item) => item !== skill) : [...current, skill]));
  };

  const toggleArenaDomain = (domain: string, skills: string[]) => {
    setSelectedDomains((current) => (current.includes(domain) ? current.filter((item) => item !== domain) : [...current, domain]));
    setSelectedSkills((current) => current.filter((skill) => !skills.includes(skill)));
  };

  const toggleArenaSection = (section: Section) => {
    setSelectedSections((current) => {
      const next = current.includes(section) ? current.filter((item) => item !== section) : [...current, section];
      return next.length ? next : [section];
    });
    setSelectedDomains([]);
    setSelectedSkills([]);
  };

  const clearArenaSkills = () => {
    setSelectedDomains([]);
    setSelectedSkills([]);
  };

  const runArenaAction = async (action: () => Promise<ArenaRoom>) => {
    setArenaError("");
    setArenaLoading(true);
    try {
      setRoom(await action());
    } catch (error) {
      setArenaError(error instanceof Error ? error.message : "Arena action failed.");
    } finally {
      setArenaLoading(false);
    }
  };

  const createRoom = () =>
    runArenaAction(() =>
      createArenaRoom({
        userId: currentUser.id,
        nickname: currentUser.nickname || currentUser.name,
        password: roomPassword,
        maxPlayers,
        sections: selectedSections,
        domains: selectedDomains,
        skills: selectedSkills,
        questionCount,
      })
    );

  const joinRoom = () =>
    runArenaAction(() =>
      joinArenaRoom({
        userId: currentUser.id,
        nickname: currentUser.nickname || currentUser.name,
        code: joinCode,
        password: roomPassword,
      })
    );

  const copyInviteLink = async () => {
    if (!inviteLink) return;
    await navigator.clipboard.writeText(inviteLink);
    setInviteCopied(true);
    window.setTimeout(() => setInviteCopied(false), 1800);
  };

  const saveArenaConfig = () =>
    room &&
    runArenaAction(() =>
      configureArenaRoom({
        roomId: room.id,
        userId: currentUser.id,
        maxPlayers,
        sections: selectedSections,
        domains: selectedDomains,
        skills: selectedSkills,
        questionCount,
      })
    );

  const startArena = () => room && runArenaAction(() => startArenaRoom({ roomId: room.id, userId: currentUser.id }));

  const submitArenaAnswer = async (selectedIndex?: number) => {
    if (!room || !currentArenaQuestion || selfPlayer?.answeredCurrent || cooldownSeconds > 0) return;
    setArenaLoading(true);
    setArenaError("");
    try {
      const result = await answerArenaQuestion({
        roomId: room.id,
        userId: currentUser.id,
        questionId: currentArenaQuestion.id,
        selectedIndex,
        freeResponse: selectedIndex === undefined ? freeResponse : undefined,
        elapsedMs: Date.now() - questionStartedAt,
      });
      setRoom(result.room);
      if (!result.correct) {
        if (typeof selectedIndex === "number") {
          setArenaWrongChoices((current) => ({
            ...current,
            [currentArenaQuestion.id]: [...new Set([...(current[currentArenaQuestion.id] ?? []), selectedIndex])],
          }));
        }
        setArenaCooldownUntil(Date.now() + (result.waitMs ?? 15_000));
      }
      setArenaFeedback(result.correct ? `Correct +${result.scoreAwarded}` : `Wrong: -250 points. Try again in 15 seconds.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not submit answer.";
      setArenaError(message);
      if (message.includes("Wait")) setArenaCooldownUntil(Date.now() + 15_000);
    } finally {
      setArenaLoading(false);
    }
  };

  if (!room) {
    return (
      <section className="arena-page">
        <div className="arena-hero arena-hero-art">
          <div className="arena-hero-copy">
            <p className="eyebrow">sat4.me Arena</p>
            <h1>Race. Solve.<br />Win the room.</h1>
            <p>Real-time SAT battles for 2–5 players. Pick a full topic or drill into one exact skill.</p>
            <div className="arena-hero-facts" aria-label="Arena features">
              <span><Users size={17} /> Live rooms</span>
              <span><Trophy size={17} /> Speed scoring</span>
              <span><BookOpenCheck size={17} /> Answer review</span>
            </div>
          </div>
          <div className="arena-demo-shell" aria-label="Arena product walkthrough">
            <div className="arena-demo-browser-bar" aria-hidden="true">
              <span /><span /><span />
              <em>sat4.me / arena</em>
              <strong>LIVE DEMO</strong>
            </div>
            <video
              ref={arenaDemoVideoRef}
              className="arena-demo-video"
              autoPlay
              muted
              loop
              playsInline
              preload="metadata"
              poster="/arena/arena-demo-poster.webp"
              aria-label="Silent walkthrough showing room creation, topic selection, multiplayer questions, and Arena results"
            >
              <source src="/arena/arena-demo.webm" type="video/webm" />
            </video>
          </div>
        </div>
        <div className="arena-entry-grid">
          <button type="button"
            className={arenaMode === "create" ? "arena-entry-card active" : "arena-entry-card"}
            onClick={() => setArenaMode("create")}
          >
            <span className="arena-entry-copy"><em>Host match</em><strong>Create a room</strong><small>Choose the challenge and invite friends.</small></span>
            <span className="arena-entry-arrow"><ChevronRight size={19} /></span>
          </button>
          <button type="button"
            className={arenaMode === "join" ? "arena-entry-card active" : "arena-entry-card"}
            onClick={() => setArenaMode("join")}
          >
            <span className="arena-entry-copy"><em>Room code</em><strong>Join a room</strong><small>Use the code shared by the host.</small></span>
            <span className="arena-entry-arrow"><ChevronRight size={19} /></span>
          </button>
        </div>
        <div className="arena-panel arena-setup-panel">
          <header className="arena-panel-heading">
            <div><span>{arenaMode === "create" ? "New match" : "Invitation"}</span><h2>{arenaMode === "create" ? "Build your challenge" : "Enter the arena"}</h2></div>
          </header>
          <div className="arena-room-fields">
            {arenaMode === "join" && <label>Room code<input value={joinCode} onChange={(event) => setJoinCode(event.target.value.toUpperCase())} placeholder="ABC123" /></label>}
            <label>Room password<input type="password" value={roomPassword} onChange={(event) => setRoomPassword(event.target.value)} placeholder="Enter password" /></label>
          </div>
          {arenaMode === "create" && (
            <ArenaSettings
              selectedSections={selectedSections}
              toggleSection={toggleArenaSection}
              maxPlayers={maxPlayers}
              setMaxPlayers={setMaxPlayers}
              questionCount={questionCount}
              setQuestionCount={setQuestionCount}
              skillOptions={skillOptions}
              moduleGroups={selectedModuleGroups}
              selectedDomains={selectedDomains}
              selectedSkills={selectedSkills}
              toggleDomain={toggleArenaDomain}
              toggleSkill={toggleArenaSkill}
              clearSkills={clearArenaSkills}
            />
          )}
          {arenaError && <p className="form-error">{arenaError}</p>}
          <button className="primary-button full" onClick={arenaMode === "create" ? createRoom : joinRoom} disabled={arenaLoading}>
            {arenaLoading ? "Loading..." : arenaMode === "create" ? "Create arena" : "Join arena"}
          </button>
        </div>
      </section>
    );
  }

  if (room.status === "waiting") {
    return (
      <section className="arena-page">
        <div className="arena-lobby-head">
          <div>
            <p className="eyebrow">Lobby</p>
            <h1>Room {room.code}</h1>
            <span>{room.players.length}/{room.maxPlayers} players</span>
          </div>
          <button className="ghost-button" onClick={() => setRoom(null)}>Leave</button>
        </div>
        <div className="arena-layout">
          <ArenaScoreboard players={sortedPlayers} totalQuestions={room.totalQuestions} />
          <div className="arena-panel">
            <div className="arena-invite-card">
              <div>
                <strong>Invite link</strong>
                <p>Send this link so friends can join without typing the room code.</p>
              </div>
              <input readOnly value={inviteLink} onFocus={(event) => event.currentTarget.select()} />
              <button className="ghost-button" onClick={copyInviteLink}>{inviteCopied ? "Copied!" : "Copy link"}</button>
            </div>
            {room.isHost ? (
              <>
                <ArenaSettings
                  selectedSections={selectedSections}
                  toggleSection={toggleArenaSection}
                  maxPlayers={maxPlayers}
                  setMaxPlayers={setMaxPlayers}
                  questionCount={questionCount}
                  setQuestionCount={setQuestionCount}
                  skillOptions={skillOptions}
                  moduleGroups={selectedModuleGroups}
                  selectedDomains={selectedDomains}
                  selectedSkills={selectedSkills}
                  toggleDomain={toggleArenaDomain}
                  toggleSkill={toggleArenaSkill}
                  clearSkills={clearArenaSkills}
                />
                {arenaError && <p className="form-error">{arenaError}</p>}
                <div className="arena-actions">
                  <button className="ghost-button" onClick={saveArenaConfig} disabled={arenaLoading}>Save settings</button>
                  <button className="primary-button" onClick={startArena} disabled={arenaLoading || room.players.length < 2}>
                    {room.players.length < 2 ? "Need 2 players" : "Start game"}
                  </button>
                </div>
              </>
            ) : (
              <div className="arena-waiting">
                <Rocket size={28} />
                <h2>Waiting for host</h2>
                <p>The host will choose modules and start the game.</p>
              </div>
            )}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="arena-page">
      <div className="arena-lobby-head">
        <div>
          <p className="eyebrow">{room.status === "finished" ? "Results" : `Question ${room.currentIndex + 1}/${room.totalQuestions}`}</p>
          <h1>{room.status === "finished" ? `${room.winner?.nickname ?? "Winner"} wins` : "Arena live"}</h1>
        </div>
        <button className="ghost-button" onClick={() => setRoom(null)}>Exit arena</button>
      </div>
      <div className="arena-layout">
        <ArenaScoreboard players={sortedPlayers} totalQuestions={room.totalQuestions} />
        {room.status === "finished" ? (
          <div className="arena-panel arena-review-panel">
            <div className="arena-winner compact">
              <Trophy size={34} />
              <div>
                <h2>{room.winner?.nickname} scored {room.winner?.score}</h2>
                <p>Review every question, your answer, and the explanation.</p>
              </div>
            </div>
            {room.review.length > 0 && (() => {
              const reviewQuestion = room.review[Math.min(reviewIndex, room.review.length - 1)];
              const reviewPrompt = splitPrompt(reviewQuestion.prompt);
              const explanationOpen = openReviewExplanation[reviewQuestion.id];
              return (
                <div className="arena-review-card">
                  <div className="arena-review-nav">
                    <button className="ghost-button" disabled={reviewIndex <= 0} onClick={() => setReviewIndex((index) => Math.max(0, index - 1))}>Previous</button>
                    <strong>{reviewIndex + 1}/{room.review.length}</strong>
                    <button className="ghost-button" disabled={reviewIndex >= room.review.length - 1} onClick={() => setReviewIndex((index) => Math.min(room.review.length - 1, index + 1))}>Next</button>
                  </div>
                  <div className="arena-question-meta">
                    <span>{reviewQuestion.section}</span>
                    <span>{reviewQuestion.skill}</span>
                    <span className={reviewQuestion.correct ? "review-correct" : "review-wrong"}>{reviewQuestion.correct ? "Correct" : "Wrong"}</span>
                  </div>
                  {reviewPrompt.passage && <p className="prompt-passage">{reviewPrompt.passage}</p>}
                  {reviewQuestion.imagePath && <img className="question-image" src={reviewQuestion.imagePath} alt="Arena review question" />}
                  <p className="prompt-question">{reviewPrompt.questionText}</p>
                  {reviewQuestion.choices.length > 1 ? (
                    <div className="arena-choices review">
                      {reviewQuestion.choices.map((choice, index) => {
                        const isSelected = reviewQuestion.selectedIndex === index;
                        const isCorrect = reviewQuestion.correctIndex === index;
                        return (
                          <div key={`${reviewQuestion.id}-review-${index}`} className={["arena-review-choice", isSelected ? "selected" : "", isCorrect ? "correct" : "", isSelected && !isCorrect ? "wrong" : ""].join(" ")}>
                            <span>{String.fromCharCode(65 + index)}</span>
                            <em>{choice}</em>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className={reviewQuestion.correct ? "arena-feedback correct" : "arena-feedback"}>Your answer: {reviewQuestion.freeResponse || "No answer"} · Correct: {reviewQuestion.correctAnswer}</p>
                  )}
                  <button className="sat-explanation-button" onClick={() => setOpenReviewExplanation((current) => ({ ...current, [reviewQuestion.id]: !current[reviewQuestion.id] }))}>
                    Explanation
                  </button>
                  {explanationOpen && <div className="sat-explanation correct"><p>{reviewQuestion.explanation}</p></div>}
                </div>
              );
            })()}
          </div>
        ) : currentArenaQuestion && currentArenaPrompt ? (
          <div className="arena-question-card">
            {isArenaMath && (
              <div className="arena-tools">
                <button className="ghost-button" onClick={() => setArenaCalculatorOpen((open) => !open)}>
                  <Calculator size={15} />
                  Calculator
                </button>
              </div>
            )}
            {isArenaMath && arenaCalculatorOpen && (
              <aside
                className="calculator-popover"
                aria-label="Desmos calculator"
                style={{ left: arenaCalculatorFrame.x, top: arenaCalculatorFrame.y, width: arenaCalculatorFrame.width, height: arenaCalculatorFrame.height }}
              >
                <div
                  className="calculator-header"
                  onPointerDown={(event) => {
                    setArenaCalculatorDragging(true);
                    event.currentTarget.setPointerCapture(event.pointerId);
                  }}
                  onPointerMove={moveArenaCalculator}
                  onPointerUp={(event) => {
                    setArenaCalculatorDragging(false);
                    event.currentTarget.releasePointerCapture(event.pointerId);
                  }}
                  onPointerCancel={() => setArenaCalculatorDragging(false)}
                >
                  <strong>Desmos Calculator</strong>
                  <button onClick={() => setArenaCalculatorOpen(false)}>Close</button>
                </div>
                <iframe title="Desmos calculator" src="https://www.desmos.com/calculator" />
              </aside>
            )}
            <div className="arena-question-meta">
              <span>{currentArenaQuestion.section}</span>
              <span>{currentArenaQuestion.skill}</span>
              <span>{currentArenaQuestion.difficulty}</span>
            </div>
            {currentArenaPrompt.passage && <p className="prompt-passage">{currentArenaPrompt.passage}</p>}
            {currentArenaQuestion.imagePath && <img className="question-image" src={currentArenaQuestion.imagePath} alt="Arena SAT question" />}
            <p className="prompt-question">{currentArenaPrompt.questionText}</p>
            {isFreeResponseArena ? (
              <div className="arena-free-response">
                <input value={freeResponse} onChange={(event) => setFreeResponse(event.target.value)} placeholder="Answer..." />
                <button className="primary-button" onClick={() => submitArenaAnswer()} disabled={arenaLoading || selfPlayer?.answeredCurrent || cooldownSeconds > 0 || !freeResponse.trim()}>
                  {cooldownSeconds > 0 ? `${cooldownSeconds}s` : "Check"}
                </button>
              </div>
            ) : (
              <div className="arena-choices">
                {currentArenaQuestion.choices.map((choice, index) => {
                  const wrong = arenaWrongChoices[currentArenaQuestion.id]?.includes(index);
                  const eliminated = arenaEliminatedChoices[currentArenaQuestion.id]?.includes(index);
                  const selected = arenaSelectedIndex === index;
                  return (
                    <div key={`${currentArenaQuestion.id}-${index}`} className={["arena-choice-row", selected ? "selected" : "", wrong ? "wrong" : "", eliminated ? "eliminated" : ""].join(" ")}>
                      <button className="arena-choice-main" onClick={() => setArenaSelectedIndex(index)} disabled={arenaLoading || selfPlayer?.answeredCurrent}>
                        <span>{String.fromCharCode(65 + index)}</span>
                        {currentArenaQuestion.choiceImagePaths?.[index] && choice.startsWith("Choice ") ? (
                          <img className="sat-choice-image" src={currentArenaQuestion.choiceImagePaths[index]} alt={`Choice ${String.fromCharCode(65 + index)}`} />
                        ) : (
                          <em>{choice}</em>
                        )}
                      </button>
                      <button className="choice-strike-button" onClick={() => toggleArenaEliminatedChoice(currentArenaQuestion.id, index)}>
                        <span>{String.fromCharCode(65 + index)}</span>
                      </button>
                    </div>
                  );
                })}
                <button className="primary-button" onClick={() => arenaSelectedIndex !== null && submitArenaAnswer(arenaSelectedIndex)} disabled={arenaLoading || selfPlayer?.answeredCurrent || arenaSelectedIndex === null || cooldownSeconds > 0}>
                  {cooldownSeconds > 0 ? `Wait ${cooldownSeconds}s` : "Check"}
                </button>
              </div>
            )}
            {arenaFeedback && <p className="arena-feedback">{arenaFeedback}</p>}
            {arenaError && <p className="form-error">{arenaError}</p>}
          </div>
        ) : (
          <div className="arena-panel arena-finished-waiting" role="status" aria-live="polite">
            <span><Check size={28} /></span>
            <h2>You finished the race</h2>
            <p>Your answers are locked in. Results will appear as soon as the other players finish.</p>
            <div className="arena-waiting-pulse"><i /><i /><i /></div>
          </div>
        )}
      </div>
    </section>
  );
}

function ArenaSettings({
  selectedSections,
  toggleSection,
  maxPlayers,
  setMaxPlayers,
  questionCount,
  setQuestionCount,
  skillOptions,
  moduleGroups,
  selectedDomains,
  selectedSkills,
  toggleDomain,
  toggleSkill,
  clearSkills,
}: {
  selectedSections: Section[];
  toggleSection: (section: Section) => void;
  maxPlayers: number;
  setMaxPlayers: (value: number) => void;
  questionCount: number;
  setQuestionCount: (value: number) => void;
  skillOptions: string[];
  moduleGroups: Array<{ section: Section; domain: string; skills: string[] }>;
  selectedDomains: string[];
  selectedSkills: string[];
  toggleDomain: (domain: string, skills: string[]) => void;
  toggleSkill: (skill: string) => void;
  clearSkills: () => void;
}) {
  const [openGroups, setOpenGroups] = useState<string[]>([]);

  useEffect(() => {
    setOpenGroups((current) => {
      const validKeys = moduleGroups.map((group) => `${group.section}-${group.domain}`);
      return current.filter((key) => validKeys.includes(key));
    });
  }, [moduleGroups]);

  const toggleGroup = (key: string) => {
    setOpenGroups((current) => (current.includes(key) ? current.filter((item) => item !== key) : [...current, key]));
  };

  return (
    <div className="arena-settings">
      <div className="arena-setting-section">
        <div className="arena-setting-title"><span>1</span><div><strong>Sections</strong><small>Mix both or focus on one.</small></div></div>
        <div className="arena-setting-row arena-section-switcher">
          <button type="button" className={selectedSections.includes("Math") ? "chip active" : "chip"} onClick={() => toggleSection("Math")}><Calculator size={16} /> Math</button>
          <button type="button" className={selectedSections.includes("Verbal") ? "chip active" : "chip"} onClick={() => toggleSection("Verbal")}><BookOpenCheck size={16} /> Reading & Writing</button>
        </div>
      </div>
      <div className="arena-setting-section">
        <div className="arena-setting-title"><span>2</span><div><strong>Match size</strong><small>Set the lobby and race length.</small></div></div>
        <div className="arena-setting-row arena-number-fields">
          <label>Players<input type="number" min="2" max="5" value={maxPlayers} onChange={(event) => setMaxPlayers(Number(event.target.value))} /></label>
          <label>Questions<input type="number" min="3" max="30" value={questionCount} onChange={(event) => setQuestionCount(Number(event.target.value))} /></label>
        </div>
      </div>
      <div className="arena-setting-section">
        <div className="arena-setting-title arena-topic-heading">
          <span>3</span><div><strong>Challenge topics</strong><small>Select a whole topic or open it to choose exact skills.</small></div>
          {(selectedDomains.length > 0 || selectedSkills.length > 0) && <button type="button" onClick={clearSkills}>Clear</button>}
        </div>
        <div className="arena-selection-summary" aria-live="polite">
          <strong>{selectedDomains.length + selectedSkills.length ? `${selectedDomains.length + selectedSkills.length} selected` : "All topics"}</strong>
          <span>{selectedDomains.length + selectedSkills.length ? "Questions will come from the selected topics and skills." : `All ${skillOptions.length} skills in the chosen sections are included.`}</span>
        </div>
        <div className="arena-accordion">
          {moduleGroups.map((group) => {
            const key = `${group.section}-${group.domain}`;
            const open = openGroups.includes(key);
            const domainSelected = selectedDomains.includes(group.domain);
            const selectedInGroup = group.skills.filter((skill) => selectedSkills.includes(skill)).length;
            return (
              <article key={key} className={["arena-accordion-item", open ? "open" : "", domainSelected ? "selected" : ""].join(" ")}>
                <div className="arena-accordion-trigger">
                  <button type="button" className="arena-domain-select" aria-pressed={domainSelected} onClick={() => toggleDomain(group.domain, group.skills)}>
                    <span className="arena-domain-check">{domainSelected ? <Check size={16} /> : null}</span>
                    <span><small>{group.section === "Math" ? "Math" : "Reading & Writing"}</small><strong>{group.domain}</strong></span>
                  </button>
                  <span className="arena-topic-count">{domainSelected ? "Whole topic" : selectedInGroup ? `${selectedInGroup} skills` : `${group.skills.length} skills`}</span>
                  <button type="button" className="arena-expand-button" aria-expanded={open} aria-label={`${open ? "Close" : "Open"} ${group.domain}`} onClick={() => toggleGroup(key)}><ChevronRight size={18} /></button>
                </div>
                <div className="arena-accordion-content" hidden={!open}>
                  {group.skills.map((skill) => (
                    <button type="button" key={`${key}-${skill}`} className={selectedSkills.includes(skill) ? "arena-skill active" : "arena-skill"} aria-pressed={selectedSkills.includes(skill)} onClick={() => toggleSkill(skill)}>
                      <span>{selectedSkills.includes(skill) ? <Check size={14} /> : null}</span>{skill}
                    </button>
                  ))}
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ArenaScoreboard({ players, totalQuestions }: { players: ArenaRoom["players"]; totalQuestions: number }) {
  const total = Math.max(1, totalQuestions);
  return (
    <aside className="arena-scoreboard">
      <h2>Leaderboard</h2>
      {players.map((player, index) => (
        <div key={player.userId} className="arena-player-row">
          <span>{index + 1}</span>
          <div><strong>{player.nickname}{player.isHost ? " · host" : ""}</strong><small>{player.finished ? "Finished" : `${player.progress}/${total} solved`}</small></div>
          <em>{player.score}</em>
          <i className={player.finished ? "ready" : ""} />
        </div>
      ))}
    </aside>
  );
}

function FriendsView({
  currentUser,
  totalAnswered,
  totalAccuracy,
  onOpenQuestion,
}: {
  currentUser: UserProfile;
  totalAnswered: number;
  totalAccuracy: number;
  onOpenQuestion: (questionId: string) => void;
}) {
  const [friends, setFriends] = useState<UserProfile[]>([]);
  const [friendRequests, setFriendRequests] = useState<FriendRequest[]>([]);
  const [activeFriendId, setActiveFriendId] = useState("");
  const [messages, setMessages] = useState<FriendMessage[]>([]);
  const [friendQuery, setFriendQuery] = useState("");
  const [friendResult, setFriendResult] = useState<UserProfile | null>(null);
  const [friendsError, setFriendsError] = useState("");
  const [friendsStatus, setFriendsStatus] = useState("");
  const [chatText, setChatText] = useState("");
  const activeFriend = friends.find((friend) => friend.id === activeFriendId) ?? friends[0] ?? null;
  const incomingRequests = friendRequests.filter((request) => request.direction === "incoming");
  const outgoingRequests = friendRequests.filter((request) => request.direction === "outgoing");

  const refreshFriends = async () => {
    const [friendItems, requestItems] = await Promise.all([getFriends(currentUser.id), getFriendRequests(currentUser.id)]);
    setFriends(friendItems);
    setFriendRequests(requestItems);
    if (!activeFriendId && friendItems[0]) setActiveFriendId(friendItems[0].id);
  };

  useEffect(() => {
    refreshFriends()
      .catch((error) => setFriendsError(error instanceof Error ? error.message : "Could not load friends."));
  }, [currentUser.id]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      refreshFriends().catch(() => undefined);
    }, 5000);
    return () => window.clearInterval(interval);
  }, [currentUser.id, activeFriendId]);

  useEffect(() => {
    if (!activeFriend) {
      setMessages([]);
      return;
    }
    getFriendMessages(currentUser.id, activeFriend.id)
      .then(setMessages)
      .catch((error) => setFriendsError(error instanceof Error ? error.message : "Could not load messages."));
  }, [activeFriend?.id, currentUser.id]);

  const findFriend = async () => {
    setFriendsError("");
    setFriendsStatus("");
    setFriendResult(null);
    try {
      setFriendResult(await searchFriend(currentUser.id, friendQuery));
    } catch (error) {
      setFriendsError(error instanceof Error ? error.message : "User not found.");
    }
  };

  const addFoundFriend = async () => {
    if (!friendResult) return;
    setFriendsError("");
    setFriendsStatus("");
    try {
      const result = await addFriend({ userId: currentUser.id, friendId: friendResult.id });
      setFriends(result.friends);
      setFriendRequests(result.requests);
      if (result.status === "accepted" || result.status === "friends") {
        setActiveFriendId(friendResult.id);
        setFriendsStatus("Friend added. You can chat now.");
      } else {
        setFriendsStatus("Friend request sent. They will see it in Friends.");
      }
      setFriendResult(null);
      setFriendQuery("");
    } catch (error) {
      setFriendsError(error instanceof Error ? error.message : "Could not send friend request.");
    }
  };

  const acceptRequest = async (requestId: string, friendId: string) => {
    setFriendsError("");
    setFriendsStatus("");
    try {
      const result = await acceptFriendRequest({ userId: currentUser.id, requestId });
      setFriends(result.friends);
      setFriendRequests(result.requests);
      setActiveFriendId(friendId);
      setFriendsStatus("Friend request accepted.");
    } catch (error) {
      setFriendsError(error instanceof Error ? error.message : "Could not accept friend request.");
    }
  };

  const sendMessage = async () => {
    if (!activeFriend || !chatText.trim()) return;
    const nextMessages = await sendFriendMessage({
      senderId: currentUser.id,
      receiverId: activeFriend.id,
      body: chatText.trim(),
    });
    setMessages(nextMessages);
    setChatText("");
  };

  return (
    <section className="friends-page">
      <div className="friends-hero">
        <div>
          <p className="eyebrow">Friends</p>
          <h1>Your SAT circle.</h1>
          <p>Add friends, message them, and send practice tasks straight from the question bank.</p>
        </div>
        <div className="friend-id-card">
          <span>Your ID</span>
          <strong>{currentUser.publicId ?? "------"}</strong>
        </div>
      </div>

      <div className="friends-layout">
        <aside className="profile-panel">
          <div className="profile-avatar">{currentUser.nickname.slice(0, 1).toUpperCase()}</div>
          <h2>{currentUser.nickname}</h2>
          <p>ID: {currentUser.publicId ?? "refreshing..."}</p>
          <div className="profile-stat-grid">
            <div><span>ELO</span><strong>{currentUser.elo ?? 400}</strong></div>
            <div><span>Accuracy</span><strong>{totalAccuracy}%</strong></div>
            <div><span>Solved</span><strong>{totalAnswered}</strong></div>
          </div>
        </aside>

        <section className="friends-panel">
          <div className="friend-search">
            <input value={friendQuery} onChange={(event) => setFriendQuery(event.target.value)} placeholder="Nickname or 6-digit ID" />
            <button className="primary-button" onClick={findFriend}><UserPlus size={16} /> Find</button>
          </div>
          {friendResult && (
            <div className="friend-result">
              <div>
                <strong>{friendResult.nickname}</strong>
                <span>ID {friendResult.publicId ?? "------"} · ELO {friendResult.elo ?? 400}</span>
              </div>
              <button className="ghost-button" onClick={addFoundFriend}>Add friend</button>
            </div>
          )}
          {friendsStatus && <p className="form-success">{friendsStatus}</p>}
          {friendsError && <p className="form-error">{friendsError}</p>}
          {(incomingRequests.length > 0 || outgoingRequests.length > 0) && (
            <div className="friend-requests">
              {incomingRequests.length > 0 && (
                <div>
                  <strong>Incoming requests</strong>
                  {incomingRequests.map((request) => (
                    <div key={request.id} className="friend-request-row">
                      <span>{request.user.nickname}<small>ID {request.user.publicId ?? "------"}</small></span>
                      <button className="ghost-button" onClick={() => acceptRequest(request.id, request.user.id)}>Accept</button>
                    </div>
                  ))}
                </div>
              )}
              {outgoingRequests.length > 0 && (
                <div>
                  <strong>Sent requests</strong>
                  {outgoingRequests.map((request) => (
                    <div key={request.id} className="friend-request-row muted">
                      <span>{request.user.nickname}<small>ID {request.user.publicId ?? "------"}</small></span>
                      <em>Waiting</em>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="friends-chat-layout">
            <div className="friend-list">
              {friends.length ? friends.map((friend) => (
                <button key={friend.id} className={activeFriend?.id === friend.id ? "active" : ""} onClick={() => setActiveFriendId(friend.id)}>
                  <span>{friend.nickname.slice(0, 1).toUpperCase()}</span>
                  <strong>{friend.nickname}</strong>
                  <em>ID {friend.publicId ?? "------"} · {friend.elo ?? 400} ELO</em>
                </button>
              )) : <p>Add a friend to start chatting.</p>}
            </div>

            <div className="chat-panel">
              <header>
                <MessageCircle size={18} />
                <strong>{activeFriend ? activeFriend.nickname : "No friend selected"}</strong>
              </header>
              <div className="chat-messages">
                {messages.map((message) => (
                  <div key={message.id} className={message.senderId === currentUser.id ? "chat-message mine" : "chat-message"}>
                    <p>{message.body}</p>
                    {message.questionId && <button onClick={() => onOpenQuestion(message.questionId!)}>Open task</button>}
                  </div>
                ))}
              </div>
              <div className="chat-compose">
                <input value={chatText} onChange={(event) => setChatText(event.target.value)} placeholder="Write a message..." disabled={!activeFriend} />
                <button className="primary-button" onClick={sendMessage} disabled={!activeFriend || !chatText.trim()}><Send size={15} /> Send</button>
              </div>
            </div>
          </div>
        </section>
      </div>
    </section>
  );
}

function SendQuestionDialog({ currentUser, question, onClose }: { currentUser: UserProfile; question: Question; onClose: () => void }) {
  const [friends, setFriends] = useState<UserProfile[]>([]);
  const [selectedFriendId, setSelectedFriendId] = useState("");
  const [status, setStatus] = useState("");

  useEffect(() => {
    getFriends(currentUser.id).then((items) => {
      setFriends(items);
      if (items[0]) setSelectedFriendId(items[0].id);
    });
  }, [currentUser.id]);

  const sendTask = async () => {
    if (!selectedFriendId) return;
    await sendFriendMessage({
      senderId: currentUser.id,
      receiverId: selectedFriendId,
      body: `Sent you a ${question.section} task: ${question.skill}`,
      questionId: question.id,
    });
    setStatus("Sent!");
    window.setTimeout(onClose, 900);
  };

  return (
    <div className="friend-dialog-backdrop" role="presentation">
      <section className="friend-dialog" role="dialog" aria-modal="true">
        <header>
          <div>
            <p className="eyebrow">Send task</p>
            <h2>{question.skill}</h2>
          </div>
          <button className="ghost-button" onClick={onClose}>Close</button>
        </header>
        {friends.length ? (
          <>
            <select value={selectedFriendId} onChange={(event) => setSelectedFriendId(event.target.value)}>
              {friends.map((friend) => <option key={friend.id} value={friend.id}>{friend.nickname}</option>)}
            </select>
            <button className="primary-button full" onClick={sendTask}>{status || "Send to friend"}</button>
          </>
        ) : (
          <p>Add friends first in the Friends tab.</p>
        )}
      </section>
    </div>
  );
}

const studyRooms = [
  {
    id: "room-1",
    title: "Room 1",
    subtitle: "Open camera-only study room.",
    accent: "mint",
  },
  {
    id: "room-2",
    title: "Room 2",
    subtitle: "Open camera-only study room.",
    accent: "blue",
  },
  {
    id: "room-3",
    title: "Room 3",
    subtitle: "Open camera-only study room.",
    accent: "pink",
  },
  {
    id: "room-4",
    title: "Room 4",
    subtitle: "Open camera-only study room.",
    accent: "purple",
  },
  {
    id: "room-5",
    title: "Room 5",
    subtitle: "Open camera-only study room.",
    accent: "mint",
  },
  {
    id: "room-6",
    title: "Room 6",
    subtitle: "Open camera-only study room.",
    accent: "blue",
  },
];

function StudyRoomView({ activeRoomId, onJoinRoom }: { activeRoomId: string; onJoinRoom: (roomId: string) => void }) {
  const activeRoom = studyRooms.find((room) => room.id === activeRoomId) ?? null;
  return (
    <section className="study-page">
      <div className="study-hero">
        <p className="eyebrow">Study Room</p>
        <h1>Camera-on study rooms.</h1>
        <p>Pick a room once. The meeting stays open in a floating window while you use Question Bank, Arena, Vocabulary, or Friends.</p>
      </div>

      <div className="study-layout">
        <aside className="study-room-list">
          {studyRooms.map((room) => (
            <button
              key={room.id}
              className={activeRoom?.id === room.id ? `study-room-card active ${room.accent}` : `study-room-card ${room.accent}`}
              onClick={() => onJoinRoom(room.id)}
            >
              <span><Video size={17} /></span>
              <strong>{room.title}</strong>
              <em>{room.subtitle}</em>
            </button>
          ))}
        </aside>

        <article className="study-video-panel study-room-start-panel">
          <div className="study-video-head">
            <div>
              <span>{activeRoom ? "Meeting running" : "Choose a room"}</span>
              <h2>{activeRoom ? `${activeRoom.title} is open` : "Start a study room"}</h2>
            </div>
            <p>No moderator needed: the first student starts the room automatically. Mic is hidden and muted.</p>
          </div>
          <div className="study-room-start">
            <Video size={42} />
            <strong>{activeRoom ? "Floating meeting is active" : "Select Room 1, Room 2, etc."}</strong>
            <p>{activeRoom ? "You can switch tabs now. The meeting will stay in the corner." : "When you choose a room, the conference opens in a small movable-style window."}</p>
          </div>
        </article>
      </div>
    </section>
  );
}

function StudyRoomDock({
  currentUser,
  roomId,
  minimized,
  onMinimize,
  onRestore,
  onClose,
}: {
  currentUser: UserProfile;
  roomId: string;
  minimized: boolean;
  onMinimize: () => void;
  onRestore: () => void;
  onClose: () => void;
}) {
  const room = studyRooms.find((item) => item.id === roomId) ?? studyRooms[0];
  const roomName = `sat4-${room.id}`;
  const displayName = encodeURIComponent(currentUser.nickname || currentUser.name || "sat4.me student");
  const videoUrl = `https://meet.jit.si/${roomName}#userInfo.displayName=\"${displayName}\"&config.startWithAudioMuted=true&config.startSilent=true&config.prejoinConfig.enabled=false&interfaceConfig.TOOLBAR_BUTTONS=[\"camera\",\"tileview\",\"hangup\"]`;

  return (
    <aside className={minimized ? "study-dock minimized" : "study-dock"} aria-label={`${room.title} meeting`}>
      <header>
        <div>
          <span>Study Room</span>
          <strong>{room.title}</strong>
        </div>
        <div>
          {minimized ? (
            <button onClick={onRestore}>Open</button>
          ) : (
            <button onClick={onMinimize}>Minimize</button>
          )}
          <button onClick={onClose}>End</button>
        </div>
      </header>
      {!minimized && (
        <iframe
          title={`${room.title} persistent study room`}
          src={videoUrl}
          allow="camera; display-capture; fullscreen"
          referrerPolicy="strict-origin-when-cross-origin"
        />
      )}
    </aside>
  );
}

const VOCAB_MATCH_DURATION_SECONDS = 15;

function VocabularyView() {
  const [learningMode, setLearningMode] = useState<VocabularyMode>("flashcards");
  const [collectionMode, setCollectionMode] = useState<"all" | "favorites">("all");
  const [cardIndex, setCardIndex] = useState(0);
  const [cardFlipped, setCardFlipped] = useState(false);
  const [favoriteWords, setFavoriteWords] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const saved = window.localStorage.getItem("4sat:vocabulary:favorites");
      return saved ? (JSON.parse(saved) as string[]) : [];
    } catch {
      return [];
    }
  });
  const [matchingRound, setMatchingRound] = useState<VocabularyCard[]>(() => shuffleVocabulary(vocabularyCards).slice(0, 5));
  const [selectedMatchWord, setSelectedMatchWord] = useState("");
  const [matchedWords, setMatchedWords] = useState<string[]>([]);
  const [matchingMistakes, setMatchingMistakes] = useState(0);
  const [matchingStartedAt, setMatchingStartedAt] = useState(0);
  const [matchingSeconds, setMatchingSeconds] = useState(VOCAB_MATCH_DURATION_SECONDS);
  const [matchingPhase, setMatchingPhase] = useState<"ready" | "playing" | "complete">("ready");
  const [matchingFeedback, setMatchingFeedback] = useState("Press Start when you are ready.");
  const [matchingFeedbackTone, setMatchingFeedbackTone] = useState<"neutral" | "error" | "success">("neutral");
  const [wrongMatchWord, setWrongMatchWord] = useState("");
  const [wrongDefinitionWord, setWrongDefinitionWord] = useState("");
  const matchingBoardRef = useRef<HTMLDivElement>(null);
  const [matchingPointerVine, setMatchingPointerVine] = useState<MatchingVine | null>(null);
  const [matchingVines, setMatchingVines] = useState<MatchingVine[]>([]);
  const [sentenceIndex, setSentenceIndex] = useState(0);
  const [sentenceInput, setSentenceInput] = useState("");
  const [sentenceFeedback, setSentenceFeedback] = useState<SentenceFeedback | null>(null);
  const [libraryQuery, setLibraryQuery] = useState("");
  const [libraryDifficulty, setLibraryDifficulty] = useState<VocabularyDifficulty | "All">("All");
  const [libraryPage, setLibraryPage] = useState(0);
  const favoriteSet = useMemo(() => new Set(favoriteWords), [favoriteWords]);
  const activeVocabularyCards = useMemo(
    () => (collectionMode === "favorites" ? vocabularyCards.filter((card) => favoriteSet.has(card.word.toLowerCase())) : vocabularyCards),
    [collectionMode, favoriteSet]
  );
  const activeCard = activeVocabularyCards[cardIndex] ?? activeVocabularyCards[0] ?? null;
  const sentenceCard = activeVocabularyCards[sentenceIndex] ?? activeVocabularyCards[0] ?? null;
  const matchingDefinitions = useMemo(() => shuffleVocabulary(matchingRound), [matchingRound]);
  const libraryCards = useMemo(() => {
    const normalizedQuery = libraryQuery.trim().toLowerCase();
    return activeVocabularyCards.filter((card) => {
      const matchesQuery = !normalizedQuery || `${card.word} ${card.meaning}`.toLowerCase().includes(normalizedQuery);
      const matchesDifficulty = libraryDifficulty === "All" || getVocabularyDifficulty(card) === libraryDifficulty;
      return matchesQuery && matchesDifficulty;
    });
  }, [activeVocabularyCards, libraryDifficulty, libraryQuery]);
  const libraryPageSize = 24;
  const libraryPageCount = Math.max(1, Math.ceil(libraryCards.length / libraryPageSize));
  const visibleLibraryCards = libraryCards.slice(libraryPage * libraryPageSize, (libraryPage + 1) * libraryPageSize);

  useEffect(() => {
    window.localStorage.setItem("4sat:vocabulary:favorites", JSON.stringify(favoriteWords));
  }, [favoriteWords]);

  useEffect(() => {
    if (cardIndex >= activeVocabularyCards.length) setCardIndex(0);
    if (sentenceIndex >= activeVocabularyCards.length) setSentenceIndex(0);
  }, [activeVocabularyCards.length, cardIndex, sentenceIndex]);

  useEffect(() => {
    if (libraryPage >= libraryPageCount) setLibraryPage(Math.max(0, libraryPageCount - 1));
  }, [libraryPage, libraryPageCount]);

  useEffect(() => {
    if (learningMode !== "matching" || matchingPhase !== "playing" || !matchingStartedAt) return;
    const updateCountdown = () => {
      const elapsed = Math.floor((Date.now() - matchingStartedAt) / 1000);
      const remaining = Math.max(0, VOCAB_MATCH_DURATION_SECONDS - elapsed);
      setMatchingSeconds(remaining);
      if (remaining === 0) {
        setMatchingPhase("complete");
        setSelectedMatchWord("");
        setMatchingFeedback("Time is up — start another round when you are ready.");
        setMatchingFeedbackTone("neutral");
      }
    };
    updateCountdown();
    const timer = window.setInterval(updateCountdown, 200);
    return () => window.clearInterval(timer);
  }, [learningMode, matchingPhase, matchingStartedAt]);

  useEffect(() => {
    const board = matchingBoardRef.current;
    if (!board || matchingPhase !== "playing") {
      setMatchingVines([]);
      return;
    }

    const updateVines = () => {
      const boardRect = board.getBoundingClientRect();
      const wordButtons = Array.from(board.querySelectorAll<HTMLElement>("[data-match-word]"));
      const definitionButtons = Array.from(board.querySelectorAll<HTMLElement>("[data-definition-word]"));
      const findWordButton = (word: string) => wordButtons.find((button) => button.dataset.matchWord === word);
      const findDefinitionButton = (word: string) => definitionButtons.find((button) => button.dataset.definitionWord === word);
      const createPath = (word: string, definitionWord: string | null, tone: "selected" | "matched" | "wrong") => {
        const wordButton = findWordButton(word);
        if (!wordButton) return null;
        const wordRect = wordButton.getBoundingClientRect();
        const startX = wordRect.right - boardRect.left;
        const startY = wordRect.top + wordRect.height / 2 - boardRect.top;
        const definitionButton = definitionWord ? findDefinitionButton(definitionWord) : null;
        const endX = definitionButton ? definitionButton.getBoundingClientRect().left - boardRect.left : startX + 34;
        const endY = definitionButton ? definitionButton.getBoundingClientRect().top + definitionButton.getBoundingClientRect().height / 2 - boardRect.top : startY;
        const bend = Math.max(28, (endX - startX) * 0.46);
        return {
          key: `${tone}-${word}-${definitionWord ?? "pending"}`,
          path: `M ${startX} ${startY} C ${startX + bend * 0.48} ${startY - 16}, ${endX - bend * 0.48} ${endY + 16}, ${endX} ${endY}`,
          endX,
          endY,
          tone,
        };
      };

      const nextVines = matchedWords.map((word) => createPath(word, word, "matched")).filter(Boolean) as MatchingVine[];
      if (wrongMatchWord && wrongDefinitionWord) {
        const wrongVine = createPath(wrongMatchWord, wrongDefinitionWord, "wrong");
        if (wrongVine) nextVines.push(wrongVine);
      }
      setMatchingVines(nextVines);
    };

    const frame = window.requestAnimationFrame(updateVines);
    const observer = new ResizeObserver(updateVines);
    observer.observe(board);
    window.addEventListener("resize", updateVines);
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", updateVines);
    };
  }, [matchedWords, matchingPhase, matchingRound, wrongDefinitionWord, wrongMatchWord]);

  const updateMatchingPointerVine = (clientX: number, clientY: number, word = selectedMatchWord) => {
    const board = matchingBoardRef.current;
    const wordButton = board?.querySelector<HTMLElement>(`[data-match-word="${CSS.escape(word)}"]`);
    if (!board || !wordButton || !word) return;
    const boardRect = board.getBoundingClientRect();
    const wordRect = wordButton.getBoundingClientRect();
    const startX = wordRect.right - boardRect.left;
    const startY = wordRect.top + wordRect.height / 2 - boardRect.top;
    const endX = Math.max(0, Math.min(boardRect.width, clientX - boardRect.left));
    const endY = Math.max(0, Math.min(boardRect.height, clientY - boardRect.top));
    const bend = Math.max(28, Math.abs(endX - startX) * 0.46);
    setMatchingPointerVine({
      key: `selected-${word}`,
      path: `M ${startX} ${startY} C ${startX + bend * 0.48} ${startY - 16}, ${endX - bend * 0.48} ${endY + 16}, ${endX} ${endY}`,
      endX,
      endY,
      tone: "selected",
    });
  };

  const toggleFavorite = (word: string) => {
    const key = word.toLowerCase();
    setFavoriteWords((current) => (current.includes(key) ? current.filter((item) => item !== key) : [...current, key]));
  };

  const changeCollectionMode = (mode: "all" | "favorites") => {
    setCollectionMode(mode);
    setCardIndex(0);
    setSentenceIndex(0);
    setCardFlipped(false);
    setSentenceInput("");
    setSentenceFeedback(null);
  };

  const resetMatchingRound = () => {
    const source = activeVocabularyCards.length ? activeVocabularyCards : [];
    setMatchingRound(shuffleVocabulary(source).slice(0, 5));
    setSelectedMatchWord("");
    setMatchedWords([]);
    setMatchingMistakes(0);
    setMatchingStartedAt(0);
    setMatchingSeconds(VOCAB_MATCH_DURATION_SECONDS);
    setMatchingPhase("ready");
    setMatchingFeedback("Press Start when you are ready.");
    setMatchingFeedbackTone("neutral");
    setWrongMatchWord("");
    setWrongDefinitionWord("");
    setMatchingPointerVine(null);
  };

  const startMatchingRound = () => {
    setSelectedMatchWord("");
    setMatchedWords([]);
    setMatchingMistakes(0);
    setMatchingSeconds(VOCAB_MATCH_DURATION_SECONDS);
    setMatchingStartedAt(Date.now());
    setMatchingPhase("playing");
    setMatchingFeedback("Choose a word, then connect it to its definition.");
    setMatchingFeedbackTone("neutral");
    setWrongMatchWord("");
    setWrongDefinitionWord("");
    setMatchingPointerVine(null);
  };

  const changeLearningMode = (mode: VocabularyMode) => {
    setLearningMode(mode);
    if (mode === "sentence") {
      setSentenceInput("");
      setSentenceFeedback(null);
    }
  };

  useEffect(() => {
    if (learningMode === "matching") resetMatchingRound();
  }, [collectionMode, learningMode]);

  const moveCard = (direction: -1 | 1) => {
    if (!activeVocabularyCards.length) return;
    setCardIndex((current) => (current + direction + activeVocabularyCards.length) % activeVocabularyCards.length);
    setCardFlipped(false);
  };

  const chooseDefinition = (word: string) => {
    if (matchingPhase !== "playing") return;
    if (!selectedMatchWord || matchedWords.includes(word)) {
      if (!selectedMatchWord) {
        setMatchingFeedback("Select a word first.");
        setMatchingFeedbackTone("error");
      }
      return;
    }
    if (selectedMatchWord !== word) {
      setMatchingMistakes((current) => current + 1);
      setMatchingFeedback("Not a match — both choices are highlighted below.");
      setMatchingFeedbackTone("error");
      setWrongMatchWord(selectedMatchWord);
      setWrongDefinitionWord(word);
      return;
    }
    const nextMatched = [...matchedWords, word];
    setMatchedWords(nextMatched);
    setSelectedMatchWord("");
    setMatchingFeedback("Correct pair.");
    setMatchingFeedbackTone("success");
    setWrongMatchWord("");
    setWrongDefinitionWord("");
    setMatchingPointerVine(null);
    if (nextMatched.length === matchingRound.length) {
      setMatchingPhase("complete");
    }
  };

  const checkSentence = () => {
    if (!sentenceCard) return;
    const normalizedSentence = sentenceInput.toLowerCase().replace(/[^a-z'\s-]/g, " ");
    const tokens = normalizedSentence.split(/\s+/).filter(Boolean);
    const target = sentenceCard.word.toLowerCase().replace(/[^a-z]/g, "");
    const stem = target.endsWith("e") && target.length > 5 ? target.slice(0, -1) : target;
    const usesTarget = tokens.some((token) => token === target || (stem.length >= 5 && token.startsWith(stem)));
    const contextTerms = sentenceCard.meaning.toLowerCase().match(/[a-z]+/g)?.filter((term) => term.length >= 4 && !vocabularyStopWords.has(term)) ?? [];
    const contextMatches = contextTerms.filter((term) => tokens.some((token) => token === term || (term.length >= 5 && token.startsWith(term.slice(0, 5))))).length;
    const hasUsefulContext = contextMatches > 0 || tokens.length >= 11 || tokens.some((token) => ["because", "although", "when", "while", "after", "before", "but"].includes(token));

    if (!usesTarget) {
      setSentenceFeedback({ status: "improve", title: `Use “${sentenceCard.word}” in the sentence`, message: `Keep the target word visible so its meaning can be checked. It means: ${sentenceCard.meaning}` });
    } else if (tokens.length < 7) {
      setSentenceFeedback({ status: "improve", title: "Add enough context", message: `The word is present, but the sentence is too short to prove the meaning. Show who, what, or why.` });
    } else if (!hasUsefulContext) {
      setSentenceFeedback({ status: "improve", title: "Make the meaning clearer", message: `Your grammar looks workable. Add context that communicates “${sentenceCard.meaning.toLowerCase()}” more directly.` });
    } else {
      setSentenceFeedback({ status: "success", title: "Yes — that usage works", message: `You used “${sentenceCard.word}” in a complete sentence with enough context to communicate its meaning.` });
    }
  };

  const nextSentenceWord = () => {
    if (!activeVocabularyCards.length) return;
    setSentenceIndex((current) => (current + 1) % activeVocabularyCards.length);
    setSentenceInput("");
    setSentenceFeedback(null);
  };

  const openLibraryWord = (card: VocabularyCard) => {
    const index = activeVocabularyCards.findIndex((item) => item.word === card.word);
    setCardIndex(Math.max(0, index));
    setCardFlipped(false);
    setLearningMode("flashcards");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <section className="vocab-page">
      <header className="vocab-header">
        <div>
          <span>Vocabulary Lab</span>
          <h2>Learn words by using them.</h2>
          <p>Study the meaning, connect pairs under pressure, then prove you can use each word in context.</p>
        </div>
        <div className="vocab-collection-switch" aria-label="Vocabulary collection">
          <button className={collectionMode === "all" ? "active" : ""} onClick={() => changeCollectionMode("all")}>All words</button>
          <button className={collectionMode === "favorites" ? "active" : ""} onClick={() => changeCollectionMode("favorites")}>
            <Star size={14} /> Favorites <span>{favoriteWords.length}</span>
          </button>
        </div>
      </header>

      <div className="vocab-mode-tabs" role="tablist" aria-label="Vocabulary practice modes">
        <button role="tab" aria-selected={learningMode === "flashcards"} className={learningMode === "flashcards" ? "active" : ""} onClick={() => changeLearningMode("flashcards")}>
          <NotebookTabs size={18} /><span><strong>Flashcards</strong><small>Learn one word at a time</small></span>
        </button>
        <button role="tab" aria-selected={learningMode === "matching"} className={learningMode === "matching" ? "active" : ""} onClick={() => changeLearningMode("matching")}>
          <Clock3 size={18} /><span><strong>Speed Match</strong><small>Pair words and meanings</small></span>
        </button>
        <button role="tab" aria-selected={learningMode === "sentence"} className={learningMode === "sentence" ? "active" : ""} onClick={() => changeLearningMode("sentence")}>
          <FileText size={18} /><span><strong>Use It</strong><small>Write and check a sentence</small></span>
        </button>
        <button role="tab" aria-selected={learningMode === "library"} className={learningMode === "library" ? "active" : ""} onClick={() => changeLearningMode("library")}>
          <LibraryBig size={18} /><span><strong>Word Library</strong><small>Search all {vocabularyCards.length} words</small></span>
        </button>
      </div>

      {!activeVocabularyCards.length ? (
        <div className="vocab-empty">
          <Star size={22} />
          <strong>No favorite words yet</strong>
          <span>Return to All words and save a few words to build your personal set.</span>
          <button onClick={() => changeCollectionMode("all")}>Browse all words</button>
        </div>
      ) : learningMode === "flashcards" && activeCard ? (
        <div className="vocab-flashcard-mode" role="tabpanel">
          <div className="vocab-session-meta">
            <span>{cardIndex + 1} of {activeVocabularyCards.length}</span>
            <div><span className={`vocab-difficulty ${getVocabularyDifficulty(activeCard).toLowerCase()}`}>{getVocabularyDifficulty(activeCard)}</span><strong>{activeVocabularyCards.length} words in set</strong></div>
          </div>
          <div className="vocab-study-wrap">
            <button
              className={favoriteSet.has(activeCard.word.toLowerCase()) ? "vocab-study-favorite active" : "vocab-study-favorite"}
              onClick={() => toggleFavorite(activeCard.word)}
              aria-label={favoriteSet.has(activeCard.word.toLowerCase()) ? `Remove ${activeCard.word} from favorites` : `Add ${activeCard.word} to favorites`}
            ><Star size={18} /></button>
            <button className={cardFlipped ? "vocab-study-card flipped" : "vocab-study-card"} onClick={() => setCardFlipped((value) => !value)} aria-label={cardFlipped ? `Show word ${activeCard.word}` : `Show meaning of ${activeCard.word}`}>
              <span className="vocab-study-card-inner">
                <span className="vocab-study-face front">
                  <span className={`vocab-difficulty ${getVocabularyDifficulty(activeCard).toLowerCase()}`}>{getVocabularyDifficulty(activeCard)}</span>
                  <strong>{activeCard.word}</strong>
                  <small>Tap the card to reveal the meaning</small>
                </span>
                <span className="vocab-study-face back">
                  <span>Definition</span>
                  <strong>{activeCard.meaning}</strong>
                  <em>“{activeCard.example}”</em>
                  <small>Tap to see the word again</small>
                </span>
              </span>
            </button>
          </div>
          <nav className="vocab-study-nav" aria-label="Flashcard navigation">
            <button onClick={() => moveCard(-1)}><ChevronLeft size={17} />Previous</button>
            <div className="vocab-study-progress"><span style={{ width: `${((cardIndex + 1) / activeVocabularyCards.length) * 100}%` }} /></div>
            <button onClick={() => moveCard(1)}>Next<ChevronRight size={17} /></button>
          </nav>
        </div>
      ) : learningMode === "matching" ? (
        <div className="vocab-matching-mode" role="tabpanel">
          <header className="vocab-game-header">
            <div>
              <span>Speed Match</span>
              <h3>Connect each word to its definition.</h3>
              <p className={matchingFeedbackTone} role={matchingFeedbackTone === "error" ? "alert" : "status"} aria-live="polite">{matchingFeedback}</p>
            </div>
            <div className="vocab-game-stats">
              <span className={matchingPhase === "playing" && matchingSeconds <= 5 ? "is-urgent" : ""}><Clock3 size={15} /><strong>{matchingSeconds}s</strong>Cooldown</span>
              <span className={matchingMistakes ? "has-error" : ""}><X size={15} /><strong>{matchingMistakes}</strong>Mistakes</span>
              <span><Check size={15} /><strong>{matchedWords.length}/{matchingRound.length}</strong>Matched</span>
            </div>
          </header>
          {matchingPhase === "ready" ? (
            <div className="vocab-game-ready">
              <div className="vocab-ready-orbit" aria-hidden="true"><span>15</span><small>seconds</small></div>
              <span>Quick recognition round</span>
              <h3>Five pairs. One short sprint.</h3>
              <p>The cooldown begins only after you press Start. Pick a word, then choose its meaning—the vine will hold every connection.</p>
              <div className="vocab-ready-rules" aria-label="Round rules">
                <span><strong>01</strong>Select a word</span>
                <span><strong>02</strong>Connect its meaning</span>
                <span><strong>03</strong>Finish before zero</span>
              </div>
              <button onClick={startMatchingRound}><Rocket size={17} />Start 15-second round</button>
            </div>
          ) : matchingPhase === "complete" ? (
            <div className="vocab-game-complete" role="status">
              <div>{matchedWords.length === matchingRound.length ? <Check size={24} /> : <Clock3 size={24} />}</div>
              <h3>{matchedWords.length === matchingRound.length ? `Good job ${matchingRound.length}/${matchingRound.length}` : `Try again ${matchedWords.length}/${matchingRound.length}`}</h3>
              <button onClick={resetMatchingRound}><RotateCcw size={16} />{matchedWords.length === matchingRound.length ? "Next round" : "Try again"}</button>
            </div>
          ) : (
            <div
              className="vocab-match-board"
              ref={matchingBoardRef}
              onPointerMove={(event) => {
                if (!selectedMatchWord || wrongDefinitionWord) return;
                updateMatchingPointerVine(event.clientX, event.clientY);
              }}
            >
              <svg className="vocab-vine-layer" aria-hidden="true">
                {[...matchingVines, ...(selectedMatchWord && !wrongDefinitionWord && matchingPointerVine ? [matchingPointerVine] : [])].map((vine) => (
                  <g key={vine.key} className={`vocab-vine ${vine.tone}`}>
                    <path className="vocab-vine-shadow" d={vine.path} />
                    <path className="vocab-vine-stem" d={vine.path} pathLength="1" />
                    <ellipse className="vocab-vine-leaf leaf-one" cx={vine.endX - 15} cy={vine.endY - 7} rx="7" ry="3.5" />
                    <ellipse className="vocab-vine-leaf leaf-two" cx={vine.endX - 7} cy={vine.endY + 7} rx="6" ry="3" />
                  </g>
                ))}
              </svg>
              <section>
                <h4>Words</h4>
                {matchingRound.map((card) => (
                  <button
                    key={card.word}
                    data-match-word={card.word}
                    disabled={matchedWords.includes(card.word)}
                    aria-pressed={selectedMatchWord === card.word}
                    className={wrongMatchWord === card.word ? "wrong" : selectedMatchWord === card.word ? "selected" : matchedWords.includes(card.word) ? "matched" : ""}
                    onClick={(event) => {
                      setSelectedMatchWord(card.word);
                      updateMatchingPointerVine(event.clientX, event.clientY, card.word);
                      setWrongMatchWord("");
                      setWrongDefinitionWord("");
                      setMatchingFeedbackTone("neutral");
                      setMatchingFeedback(`Now choose the meaning of “${card.word}”.`);
                    }}
                  >
                    <span className="vocab-match-word-copy">{card.word}</span>
                    <span className={`vocab-difficulty ${getVocabularyDifficulty(card).toLowerCase()}`}>{getVocabularyDifficulty(card)}</span>
                    <i className="vocab-vine-node" aria-hidden="true" />
                  </button>
                ))}
              </section>
              <section>
                <h4>Definitions</h4>
                {matchingDefinitions.map((card) => (
                  <button
                    key={card.word}
                    data-definition-word={card.word}
                    disabled={matchedWords.includes(card.word)}
                    className={wrongDefinitionWord === card.word ? "wrong" : matchedWords.includes(card.word) ? "matched" : ""}
                    onClick={() => chooseDefinition(card.word)}
                  >
                    <i className="vocab-vine-node" aria-hidden="true" />
                    <span>{card.meaning}</span>
                    {matchedWords.includes(card.word) && <Check size={16} aria-hidden="true" />}
                  </button>
                ))}
              </section>
            </div>
          )}
        </div>
      ) : learningMode === "library" ? (
        <div className="vocab-library-mode" role="tabpanel">
          <header className="vocab-library-header">
            <div>
              <span>Complete collection</span>
              <h3>Word Library</h3>
              <p>Search definitions, filter by difficulty, and open any word as a flashcard.</p>
            </div>
            <label className="vocab-library-search">
              <Search size={17} />
              <span className="sr-only">Search words and definitions</span>
              <input value={libraryQuery} onChange={(event) => { setLibraryQuery(event.target.value); setLibraryPage(0); }} placeholder="Search words or definitions" />
            </label>
          </header>
          <div className="vocab-library-toolbar">
            <div role="group" aria-label="Filter words by difficulty">
              {(["All", "Easy", "Medium", "Hard"] as const).map((difficulty) => (
                <button key={difficulty} className={libraryDifficulty === difficulty ? "active" : ""} aria-pressed={libraryDifficulty === difficulty} onClick={() => { setLibraryDifficulty(difficulty); setLibraryPage(0); }}>{difficulty}</button>
              ))}
            </div>
            <span>{libraryCards.length.toLocaleString()} {libraryCards.length === 1 ? "word" : "words"}</span>
          </div>
          {visibleLibraryCards.length ? (
            <div className="vocab-library-list" aria-label="Vocabulary word library">
              <div className="vocab-library-columns"><span>Word</span><span>Definition</span><span>Level</span></div>
              {visibleLibraryCards.map((card) => {
                const isFavorite = favoriteSet.has(card.word.toLowerCase());
                return (
                  <article key={card.word}>
                    <button className="vocab-library-word" onClick={() => openLibraryWord(card)}>
                      <strong>{card.word}</strong>
                      <span>{card.meaning}</span>
                      <span className={`vocab-difficulty ${getVocabularyDifficulty(card).toLowerCase()}`}>{getVocabularyDifficulty(card)}</span>
                    </button>
                    <button className={isFavorite ? "vocab-library-favorite active" : "vocab-library-favorite"} onClick={() => toggleFavorite(card.word)} aria-label={isFavorite ? `Remove ${card.word} from favorites` : `Add ${card.word} to favorites`}><Star size={16} /></button>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="vocab-library-empty"><Search size={20} /><strong>No words found</strong><span>Try another spelling or clear the difficulty filter.</span></div>
          )}
          <nav className="vocab-library-pagination" aria-label="Word library pages">
            <button disabled={libraryPage === 0} onClick={() => setLibraryPage((current) => Math.max(0, current - 1))}><ChevronLeft size={16} />Previous</button>
            <span>{libraryPage + 1} of {libraryPageCount}</span>
            <button disabled={libraryPage >= libraryPageCount - 1} onClick={() => setLibraryPage((current) => Math.min(libraryPageCount - 1, current + 1))}>Next<ChevronRight size={16} /></button>
          </nav>
        </div>
      ) : sentenceCard ? (
        <div className="vocab-sentence-mode" role="tabpanel">
          <div className="vocab-sentence-prompt">
            <span>Use this word</span>
            <div><h3>{sentenceCard.word}</h3><span className={`vocab-difficulty ${getVocabularyDifficulty(sentenceCard).toLowerCase()}`}>{getVocabularyDifficulty(sentenceCard)}</span></div>
            <p>{sentenceCard.meaning}</p>
          </div>
          <div className="vocab-sentence-editor">
            <label htmlFor="vocabulary-sentence">Write one clear sentence</label>
            <textarea id="vocabulary-sentence" value={sentenceInput} onChange={(event) => { setSentenceInput(event.target.value); setSentenceFeedback(null); }} placeholder={`Write a sentence using “${sentenceCard.word}”…`} rows={5} />
            <div className="vocab-sentence-actions"><span>{sentenceInput.trim().split(/\s+/).filter(Boolean).length} words</span><button disabled={!sentenceInput.trim()} onClick={checkSentence}>Check my sentence<ChevronRight size={15} /></button></div>
          </div>
          {sentenceFeedback && <div className={`vocab-sentence-feedback ${sentenceFeedback.status}`} role="status"><div>{sentenceFeedback.status === "success" ? <Check size={19} /> : <Sparkle size={19} />}</div><span><strong>{sentenceFeedback.title}</strong><p>{sentenceFeedback.message}</p>{sentenceFeedback.status === "improve" && <small>Example: “{sentenceCard.example}”</small>}</span><button onClick={nextSentenceWord}>{sentenceFeedback.status === "success" ? "Next word" : "Try another word"}<ChevronRight size={15} /></button></div>}
          {!sentenceFeedback && <button className="vocab-skip-word" onClick={nextSentenceWord}>Skip this word</button>}
        </div>
      ) : null}
    </section>
  );
}

function ExpandableActionBar({ items }: { items: ActionBarItem[] }) {
  return (
    <div className="action-bar" aria-label="Main navigation">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          className={item.active ? "action-bar-item active" : "action-bar-item"}
          onClick={item.onClick}
          title={item.label}
        >
          <span className="action-bar-highlight" />
          <span className="action-bar-icon">{item.icon}</span>
          <span className="action-bar-label">{item.label}</span>
          {item.badge && <span className="action-bar-badge">{item.badge}</span>}
        </button>
      ))}
    </div>
  );
}

