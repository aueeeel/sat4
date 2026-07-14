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
import { CSSProperties, FormEvent, PointerEvent as ReactPointerEvent, ReactNode, useEffect, useMemo, useState } from "react";
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
};

const vocabularyCards = vocabularyData as VocabularyCard[];
const difficulties: Array<Difficulty | "All"> = ["All", "Easy", "Medium", "Hard"];

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
  const questionStart = Math.max(
    trimmed.lastIndexOf("\nWhich "),
    trimmed.lastIndexOf("\nWhat "),
    trimmed.lastIndexOf("\nBased on "),
    trimmed.lastIndexOf("\nAccording to "),
    trimmed.lastIndexOf("\nWhich choice ")
  );

  if (questionStart <= 0) {
    return { passage: "", questionText: trimmed.replace(/\s+/g, " ") };
  }

  return {
    passage: trimmed
      .slice(0, questionStart)
      .trim()
      .split(/\n{2,}/)
      .map((paragraph) => paragraph.replace(/\s*\n\s*/g, " ").replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .join("\n\n"),
    questionText: trimmed.slice(questionStart).trim().replace(/\s+/g, " "),
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
  }, [activeDifficulty, activeDomain, activeSection, activeSkill, query]);

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

  const startPractice = (section: Section, domain = "All", skill = "All") => {
    const sessionQuestions = getQuestionSet(section, domain, skill);
    const firstQuestion = sessionQuestions[0];
    if (!firstQuestion) return;

    setActiveSection(section);
    setActiveDomain(domain);
    setActiveSkill(skill);
    setActiveDifficulty("All");
    setQuery("");
    setActiveQuestionId(firstQuestion.id);
    setSelectedIndex(answerMap.get(firstQuestion.id)?.selectedIndex ?? null);
    setFreeResponseValue(answerMap.get(firstQuestion.id)?.freeResponse ?? "");
    setCalculatorOpen(false);
    setPracticeStartedAt(Date.now());
    setCurrentTime(Date.now());
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
              <img className="brand-logo" src="/brand/4sat-logo.png" alt="sat4.me logo" />
              <span>sat4.me</span>
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
            <p className="eyebrow">готовимся вместе</p>
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

    return (
      <main className={isMathPractice ? "practice-shell math-practice-shell" : "practice-shell"}>
        <header className="sat-topbar">
          <button
            className="sat-back"
            onClick={() => {
              setCalculatorOpen(false);
              setPracticeMode(false);
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
            <button>
              <Highlighter size={15} />
              Highlight
            </button>
            {isMathPractice && (
              <>
                <button onClick={() => setCalculatorOpen((open) => !open)}>
                  <Calculator size={15} />
                  Calculator
                </button>
                <button>
                  <FileText size={15} />
                  Reference
                </button>
              </>
            )}
            <button>
              <MoreHorizontal size={17} />
              More
            </button>
          </div>
        </header>

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

        <section className={isMathPractice ? "sat-stage math-stage" : "sat-stage"}>
          {!isMathPractice && (
            <article className="sat-reading-pane">
              {activeQuestion.imagePath && (
                <img className="sat-stimulus-image" src={activeQuestion.imagePath} alt="SAT table or chart" />
              )}
              {activePrompt.passage ? (
                <div className="sat-passage">
                  {activePrompt.passage.split(/\n+/).map((paragraph, index) => (
                    <p key={`${activeQuestion.id}-passage-${index}`}>{paragraph}</p>
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
              {!activeQuestion.imagePath && <p className="sat-question-text">{activePrompt.questionText}</p>}

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
                        <button className="sat-choice-main" onClick={() => setSelectedIndex(index)}>
                          <span>{String.fromCharCode(65 + index)}</span>
                          {choiceImage && choice.startsWith("Choice ") ? (
                            <img className="sat-choice-image" src={choiceImage} alt={`Choice ${String.fromCharCode(65 + index)}`} />
                          ) : (
                            <em>{choice}</em>
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
              badge: String(sectionStats.find((stat) => stat.section === activeSection)?.answered ?? 0),
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
        <PracticePapersView />
      ) : bankView === "home" ? (
        <>
          <section id="dashboard" className="video-hero">
            <video className="video-hero-media" src="/hero/road-background.mp4" autoPlay muted loop playsInline />
            <div className="video-hero-overlay" />
            <div className="video-hero-content">
              <p className="eyebrow">готовимся вместе</p>
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
              <LibraryBig size={24} />
              <h2>Question Bank</h2>
            </div>
            <div className="bank-cards">
              {sectionStats.map((stat) => (
                <article key={stat.section} className={`bank-card ${stat.section === "Verbal" ? "reading" : "math"}`}>
                  <div>
                    <h3>{sectionLabel(stat.section)}</h3>
                    <p>{stat.total} questions</p>
                  </div>
                  <button
                    onClick={() => {
                      changeSection(stat.section);
                      setBankView("topics");
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                  >
                    Open
                    <ChevronRight size={14} />
                  </button>
                </article>
              ))}
            </div>
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
              <h2>{sectionLabel(activeSection)}</h2>
              <div className="topic-actions">
                <button>
                  <SlidersHorizontal size={14} />
                  Filters
                </button>
                <button>
                  <MoreHorizontal size={15} />
                  More options
                </button>
              </div>
            </div>

            <article className="practice-all-card">
              <div>
                <strong>Practice all topics</strong>
                <span>Start practicing all {groupedTopics.reduce((count, group) => count + group.modules.length, 0)} skills in {sectionLabel(activeSection)}.</span>
              </div>
              <button onClick={() => startPractice(activeSection)}>Start practice</button>
            </article>

            <div className="topic-table">
              <div className="topic-table-head">
                <span>Topic</span>
                <span>Progress</span>
                <span>Accuracy</span>
              </div>
              {groupedTopics.map((group) => (
                <div className="topic-group" key={group.domain}>
                  <h3>{group.domain}</h3>
                  {group.modules.map((module) => {
                    const moduleQuestions = getQuestionSet(activeSection, group.domain, module);
                    const stats = getPracticeStats(moduleQuestions);
                    const progressPercent = stats.total ? Math.round((stats.answered / stats.total) * 100) : 0;
                    return (
                      <button
                        key={`${group.domain}-${module}`}
                        className="topic-row-card"
                        disabled={!stats.total}
                        onClick={() => startPractice(activeSection, group.domain, module)}
                      >
                        <span className="topic-name">
                          <i />
                          <strong>{module}</strong>
                        </span>
                        <span className="topic-progress">
                          <span className="mini-progress">
                            <span style={{ width: `${progressPercent}%` }} />
                          </span>
                          <em>{stats.answered}/{stats.total}</em>
                        </span>
                        <span className="topic-accuracy">
                          {stats.accuracy === null ? (
                            <em>-</em>
                          ) : (
                            <>
                              <i />
                              <strong>{stats.accuracy}%</strong>
                            </>
                          )}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ))}
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
    { name: "A", color: "#54e2c0", delay: "0s" },
    { name: "M", color: "#ff6000", delay: "-0.8s" },
    { name: "S", color: "#6041b7", delay: "-1.5s" },
    { name: "K", color: "#e94196", delay: "-2.2s" },
  ];

  return (
    <section className="motivation-showcase" aria-label="SAT Battle invitation">
      <div className="motivation-copy">
        <p className="eyebrow">?? SAT BATTLE</p>
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
          <span className="friend-dock-sparkle">?</span>
          {dockFriends.map((friend) => (
            <span
              key={friend.name}
              className="friend-dock-avatar"
              style={{ "--friend-color": friend.color, "--friend-delay": friend.delay } as CSSProperties}
            >
              {friend.name}
              <i />
            </span>
          ))}
        </div>
      </div>

      <div className="score-journey-stage" aria-label="SAT score journey preview">
        <div className="score-orbit-dots" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <section className="score-journey-card">
          <div className="score-lightning" aria-hidden="true">
            <i />
            <span />
          </div>
          <div className="score-card-top">
            <div className="score-brand-mark">
              <BookOpenCheck size={17} />
            </div>
            <div>
              <small>sat4.me</small>
              <strong>Digital SAT Suite</strong>
            </div>
            <span className="score-live-pill"><i /> Live practice</span>
          </div>
          <div className="score-main">
            <p>Your projected score</p>
            <div>
              <strong>1520</strong>
              <span>/1600</span>
              <em>+70</em>
            </div>
            <small>Top 99th percentile after adaptive drills and focused battle review.</small>
          </div>
          <div className="score-bars">
            <div className="score-bar-row">
              <span><i className="score-dot amber" />Math</span>
              <em>790/800</em>
              <div><b style={{ width: "98%" }} /></div>
            </div>
            <div className="score-bar-row">
              <span><i className="score-dot cyan" />Reading & Writing</span>
              <em>730/800</em>
              <div><b className="cyan" style={{ width: "91%" }} /></div>
            </div>
            <div className="score-bar-row">
              <span><i className="score-dot violet" />Weak-area focus</span>
              <em>Geometry · 12 drills</em>
              <div><b className="violet" style={{ width: "64%" }} /></div>
            </div>
          </div>
          <div className="score-chip-row">
            <span>Advanced Math</span>
            <span>Evidence Reading</span>
            <span>Timed sets</span>
          </div>
          <div className="score-card-actions">
            <button onClick={onPlayArena}>Continue battle <ChevronRight size={15} /></button>
            <span><Clock3 size={15} /> 42m</span>
          </div>
          <div className="score-card-footer">
            <span>Next mock · Saturday</span>
            <span>14-day streak</span>
          </div>
        </section>
      </div>
    </section>
  );
}

function FeatureCardsShowcase() {
  const cards = [
    {
      tag: "practice.engine",
      title: "Targeted SAT modules",
      lines: ["Question Bank split by SAT domains", "Math + Reading & Writing modules", "Difficulty colors for smarter practice"],
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
                <code>{card.lines.map((line) => `? ${line}`).join("\n")}</code>
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
  const currentPage = currentIndex + 1;
  const total = questions.length;

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
              <button className="question-bank-mini-button">
                <SlidersHorizontal size={13} />
                Group Answered
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
          <div className="question-bank-grid">
            {questions.map((question, index) => {
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
      )}
    </div>
  );
}

function PracticePapersView() {
  const availablePaper = practicePapers.find((paper) => paper.status === "available") ?? practicePapers[0];
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
  const [paperStatusFilter, setPaperStatusFilter] = useState<"All" | "Available" | "Locked">("All");
  const [paperSort, setPaperSort] = useState<"Newest" | "Oldest" | "Title">("Newest");
  const [paperLoading, setPaperLoading] = useState(true);
  const [paperError, setPaperError] = useState("");
  const [paperIntroOpen, setPaperIntroOpen] = useState(false);
  const [pendingModuleIndex, setPendingModuleIndex] = useState(0);
  const [confirmNextModuleIndex, setConfirmNextModuleIndex] = useState<number | null>(null);
  const [breakMode, setBreakMode] = useState(false);
  const [breakStartedAt, setBreakStartedAt] = useState(Date.now());
  const [navOpen, setNavOpen] = useState(false);

  const activePaper = practicePapers.find((paper) => paper.id === activePaperId) ?? availablePaper;
  const activeModule = activeModuleIndex === null ? null : activePaper?.modules[activeModuleIndex] ?? null;
  const activeQuestion = activeModule?.questions[activeQuestionIndex] ?? null;
  const activePrompt = activeQuestion ? splitPrompt(activeQuestion.prompt) : null;
  const elapsedSeconds = Math.max(0, Math.floor((now - paperStartedAt) / 1000));
  const remainingSeconds = activeModule ? Math.max(0, activeModule.durationMinutes * 60 - elapsedSeconds) : 0;
  const breakRemainingSeconds = Math.max(0, 10 * 60 - Math.floor((now - breakStartedAt) / 1000));

  const filteredPapers = useMemo(() => {
    const query = paperSearch.trim().toLowerCase();
    const list = practicePapers.filter((paper) => {
      const matchesSearch = !query || `${paper.title} ${paper.dateLabel}`.toLowerCase().includes(query);
      const matchesSection = paperSectionFilter === "All" || paper.tags.includes(paperSectionFilter);
      const matchesStatus =
        paperStatusFilter === "All" ||
        (paperStatusFilter === "Available" ? paper.status === "available" : paper.status === "locked");
      return matchesSearch && matchesSection && matchesStatus;
    });

    return [...list].sort((first, second) => {
      if (paperSort === "Title") return first.title.localeCompare(second.title);
      const dateDiff = new Date(first.dateSort).getTime() - new Date(second.dateSort).getTime();
      return paperSort === "Newest" ? -dateDiff : dateDiff;
    });
  }, [paperSearch, paperSectionFilter, paperStatusFilter, paperSort]);

  useEffect(() => {
    const loadingTimer = window.setTimeout(() => setPaperLoading(false), 360);
    return () => window.clearTimeout(loadingTimer);
  }, []);

  useEffect(() => {
    if (activeModuleIndex === null && !breakMode) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [activeModuleIndex, breakMode]);

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
    setPaperStartedAt(Date.now());
    setNow(Date.now());
  };

  const openPaperIntro = (paper: PracticePaper, moduleIndex = 0) => {
    if (paper.status !== "available" || !paper.modules.length) return;
    setActivePaperId(paper.id);
    setPendingModuleIndex(moduleIndex);
    setPaperIntroOpen(true);
    setBreakMode(false);
    setReviewMode(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const finishModule = () => {
    setReviewMode(true);
    setNavOpen(false);
  };

  const requestNextModule = () => {
    if (activeModuleIndex === null) return;
    const nextIndex = activeModuleIndex + 1;
    if (!activePaper.modules[nextIndex]) {
      setActiveModuleIndex(null);
      setReviewMode(false);
      setConfirmNextModuleIndex(null);
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

  if (paperIntroOpen) {
    return (
      <main className="paper-intro-shell">
        <section className="paper-intro-card">
          <h1>Bluebook Simulation</h1>
          <div className="paper-intro-list">
            <article>
              <Clock3 size={25} />
              <div>
                <h2>Timing</h2>
                <p>Practice tests are timed, but you can pause them. If you continue on another device, you have to start over.</p>
              </div>
            </article>
            <article>
              <ClipboardCheck size={25} />
              <div>
                <h2>Scores</h2>
                <p>When you finish the practice test, review your answers and use the mistakes to plan your next study block.</p>
              </div>
            </article>
            <article>
              <DoorOpen size={25} />
              <div>
                <h2>No Device Lock</h2>
                <p>We do not lock your device during practice. Keep the exam screen open for the most realistic experience.</p>
              </div>
            </article>
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
        <button className="paper-preview-button" onClick={() => setReviewMode(true)}>Go to Preview Page</button>
      </div>
    );

    if (reviewMode) {
      return (
        <main className="paper-exam-shell paper-exam-shell-review">
          <header className="paper-exam-topbar">
            <button className="paper-directions">Directions <ChevronRight size={13} /></button>
            <div className="paper-timer">
              <strong>{timerHidden ? "--:--" : formatTimer(remainingSeconds)}</strong>
              <button onClick={() => setTimerHidden((hidden) => !hidden)}>{timerHidden ? "Show" : "Hide"}</button>
            </div>
            <div className="paper-tools">
              <button><Highlighter size={17} /> Highlight</button>
              <button><MoreHorizontal size={17} /> More</button>
            </div>
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
          <button className="paper-directions">Section {sectionNumber}, Module {activeModule.moduleNumber}: {sectionLabel(activeModule.section)}</button>
          <div className="paper-timer">
            <strong>{timerHidden ? "--:--" : formatTimer(remainingSeconds)}</strong>
            <button onClick={() => setTimerHidden((hidden) => !hidden)}>{timerHidden ? "Show" : "Hide"}</button>
          </div>
          <div className="paper-tools">
            {activeModule.section === "Math" && <button><Calculator size={17} /> Calculator</button>}
            <button><Highlighter size={17} /> Highlight</button>
            <button><MoreHorizontal size={17} /> More</button>
          </div>
        </header>

        <section
          className={[
            "paper-stage",
            activeModule.section === "Math" ? "paper-stage-math" : "",
            isFreeResponse ? "paper-stage-free-response" : "",
          ].join(" ")}
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
            <article className={activePrompt.passage ? "paper-passage" : "paper-passage paper-passage-empty"}>
              {activePrompt.passage || (activeModule.section === "Math" ? "" : "Read the question on the right and choose the best answer.")}
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
              <em><FileQuestion size={15} /> Report</em>
            </header>
            <p className="paper-question-text">{activePrompt.questionText}</p>
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
                    <strong>{choice.replace(/^[A-D][.)]\s*/, "")}</strong>
                  </button>
                ))}
              </div>
            )}
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

  return (
    <section className="practice-papers-page">
      <div className="practice-papers-hero">
        <p className="eyebrow">Practice Papers</p>
        <h1>Past papers, real exam feel.</h1>
        <p>Choose a paper by date, then practice modules in a clean DSAT-style test screen.</p>
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
        <select value={paperStatusFilter} onChange={(event) => setPaperStatusFilter(event.target.value as typeof paperStatusFilter)}>
          <option>All</option>
          <option>Available</option>
          <option>Locked</option>
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
          {Array.from({ length: 3 }, (_, index) => <article key={index} className="practice-paper-card skeleton" />)}
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
                onClick={() => openPaperIntro(paper, 0)}
                onKeyDown={(event) => {
                  if (disabled) return;
                  if (event.key === "Enter" || event.key === " ") openPaperIntro(paper, 0);
                }}
              >
                <div className="paper-card-copy">
                  <span><FileText size={17} /> {paper.dateLabel}</span>
                  <h2>{paper.title}</h2>
                  <p>{paper.sourceLabel} ? {totalQuestions || "Locked"} questions</p>
                  <div className="paper-card-tags">
                    {paper.tags.slice(0, 3).map((tag) => <small key={tag}>{tag}</small>)}
                  </div>
                </div>
                <button className="primary-button" disabled={disabled} onClick={(event) => { event.stopPropagation(); openPaperIntro(paper, 0); }}>
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
            {activePaper.modules.map((module, index) => (
              <button key={module.id} onClick={() => openPaperIntro(activePaper, index)}>
                <Clock3 size={17} />
                <span>{module.label}</span>
                <strong>{module.questions.length} questions ? {module.durationMinutes}:00</strong>
              </button>
            ))}
          </div>
          <article className="practice-plan-card">
            <header>
              <div>
                <p className="eyebrow">Blueprint check</p>
                <h2>98 unique questions arranged like a full Digital SAT.</h2>
              </div>
              <strong>{activePaperQuestionCount} questions</strong>
            </header>
            <div className="practice-plan-table">
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Question ID</th>
                    <th>Section</th>
                    <th>Module</th>
                    <th>Domain</th>
                    <th>Skill</th>
                    <th>Difficulty</th>
                    <th>Type</th>
                  </tr>
                </thead>
                <tbody>
                  {activePaper.modules.flatMap((module) =>
                    module.questions.map((question, questionIndex) => (
                      <tr key={`${module.id}-${question.id}`}>
                        <td>{questionIndex + 1}</td>
                        <td>{question.id}</td>
                        <td>{sectionLabel(module.section)}</td>
                        <td>{module.moduleNumber}</td>
                        <td>{question.domain}</td>
                        <td>{question.skill}</td>
                        <td>{question.difficulty}</td>
                        <td>{isFreeResponseQuestion(question) ? "Student-produced" : "Multiple choice"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </article>
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
  }, [currentUser.id, room]);

  useEffect(() => {
    if (!room) return;
    setSelectedSections(room.sections?.length ? room.sections : room.section === "Mixed" ? ["Math", "Verbal"] : [room.section]);
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
    setSelectedSkills((current) => (current.includes(skill) ? current.filter((item) => item !== skill) : [...current, skill]));
  };

  const toggleArenaSection = (section: Section) => {
    setSelectedSections((current) => {
      const next = current.includes(section) ? current.filter((item) => item !== section) : [...current, section];
      return next.length ? next : [section];
    });
    setSelectedSkills([]);
  };

  const selectAllArenaSkills = () => setSelectedSkills(skillOptions);
  const clearArenaSkills = () => setSelectedSkills([]);

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
        domains: [],
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
        domains: [],
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
        <div className="arena-hero">
          <p className="eyebrow">sat4.me Arena</p>
          <h1>Play SAT battles with friends.</h1>
          <p>Create a private room, choose Math or Reading & Writing modules, and race through random questions.</p>
        </div>
        <div className="arena-entry-grid">
          <article
            className={arenaMode === "create" ? "arena-entry-card active" : "arena-entry-card"}
            role="button"
            tabIndex={0}
            onClick={() => setArenaMode("create")}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") setArenaMode("create");
            }}
          >
            <strong>Create room</strong>
            <p>Host chooses question type, modules, player limit, and starts the match.</p>
          </article>
          <article
            className={arenaMode === "join" ? "arena-entry-card active" : "arena-entry-card"}
            role="button"
            tabIndex={0}
            onClick={() => setArenaMode("join")}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") setArenaMode("join");
            }}
          >
            <strong>Join room</strong>
            <p>Enter a code and password from your friend to join the lobby.</p>
          </article>
        </div>
        <div className="arena-panel">
          {arenaMode === "join" && <input value={joinCode} onChange={(event) => setJoinCode(event.target.value.toUpperCase())} placeholder="Room code" />}
          <input value={roomPassword} onChange={(event) => setRoomPassword(event.target.value)} placeholder="Room password" />
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
              selectedSkills={selectedSkills}
              toggleSkill={toggleArenaSkill}
              selectAllSkills={selectAllArenaSkills}
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
          <ArenaScoreboard players={sortedPlayers} />
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
                  selectedSkills={selectedSkills}
                  toggleSkill={toggleArenaSkill}
                  selectAllSkills={selectAllArenaSkills}
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
        <ArenaScoreboard players={sortedPlayers} />
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
        ) : null}
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
  selectedSkills,
  toggleSkill,
  selectAllSkills,
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
  selectedSkills: string[];
  toggleSkill: (skill: string) => void;
  selectAllSkills: () => void;
  clearSkills: () => void;
}) {
  const [openGroups, setOpenGroups] = useState<string[]>(() => moduleGroups.slice(0, 2).map((group) => `${group.section}-${group.domain}`));

  useEffect(() => {
    setOpenGroups((current) => {
      const validKeys = moduleGroups.map((group) => `${group.section}-${group.domain}`);
      const next = current.filter((key) => validKeys.includes(key));
      return next.length ? next : validKeys.slice(0, 2);
    });
  }, [moduleGroups]);

  const toggleGroup = (key: string) => {
    setOpenGroups((current) => (current.includes(key) ? current.filter((item) => item !== key) : [...current, key]));
  };

  return (
    <div className="arena-settings">
      <div className="arena-setting-row">
        <button className={selectedSections.includes("Math") ? "chip active" : "chip"} onClick={() => toggleSection("Math")}>Math</button>
        <button className={selectedSections.includes("Verbal") ? "chip active" : "chip"} onClick={() => toggleSection("Verbal")}>Reading & Writing</button>
      </div>
      <div className="arena-setting-row">
        <label>Players<input type="number" min="2" max="5" value={maxPlayers} onChange={(event) => setMaxPlayers(Number(event.target.value))} /></label>
        <label>Questions<input type="number" min="3" max="30" value={questionCount} onChange={(event) => setQuestionCount(Number(event.target.value))} /></label>
      </div>
      <div className="arena-module-toolbar">
        <button className="ghost-button" onClick={selectAllSkills}>Select all modules</button>
        <button className="ghost-button" onClick={clearSkills}>Clear</button>
        <span>{selectedSkills.length}/{skillOptions.length} selected</span>
      </div>
      <div className="arena-accordion">
        {moduleGroups.map((group) => {
          const key = `${group.section}-${group.domain}`;
          const open = openGroups.includes(key);
          const selectedInGroup = group.skills.filter((skill) => selectedSkills.includes(skill)).length;
          return (
            <article key={key} className={open ? "arena-accordion-item open" : "arena-accordion-item"}>
              <button className="arena-accordion-trigger" onClick={() => toggleGroup(key)}>
                <span>{group.section}</span>
                <strong>{group.domain}</strong>
                <em>{selectedInGroup}/{group.skills.length}</em>
                <ChevronRight size={17} />
              </button>
              <div className="arena-accordion-content">
                {group.skills.map((skill) => (
                  <button key={`${key}-${skill}`} className={selectedSkills.includes(skill) ? "arena-skill active" : "arena-skill"} onClick={() => toggleSkill(skill)}>
                    {skill}
                  </button>
                ))}
              </div>
            </article>
          );
        })}
      </div>
      <small>{selectedSkills.length ? "Only selected modules will be used." : "No module selected = all modules in selected sections."}</small>
    </div>
  );
}

function ArenaScoreboard({ players }: { players: ArenaRoom["players"] }) {
  return (
    <aside className="arena-scoreboard">
      <h2>Leaderboard</h2>
      {players.map((player, index) => (
        <div key={player.userId} className="arena-player-row">
          <span>{index + 1}</span>
          <strong>{player.nickname}{player.isHost ? " · host" : ""}</strong>
          <em>{player.score}</em>
          <i className={player.answeredCurrent ? "ready" : ""} />
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

function VocabularyView() {
  const pageSize = 60;
  const [page, setPage] = useState(1);
  const [flippedCards, setFlippedCards] = useState<string[]>([]);
  const [vocabMode, setVocabMode] = useState<"all" | "favorites">("all");
  const [favoriteWords, setFavoriteWords] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const saved = window.localStorage.getItem("4sat:vocabulary:favorites");
      return saved ? (JSON.parse(saved) as string[]) : [];
    } catch {
      return [];
    }
  });
  const favoriteSet = useMemo(() => new Set(favoriteWords), [favoriteWords]);
  const activeVocabularyCards = useMemo(
    () => (vocabMode === "favorites" ? vocabularyCards.filter((card) => favoriteSet.has(card.word.toLowerCase())) : vocabularyCards),
    [favoriteSet, vocabMode]
  );
  const totalPages = Math.max(1, Math.ceil(activeVocabularyCards.length / pageSize));
  const start = (page - 1) * pageSize;
  const visibleCards = activeVocabularyCards.slice(start, start + pageSize);
  const visiblePages = Array.from({ length: totalPages }, (_, index) => index + 1).filter(
    (pageNumber) => pageNumber === 1 || pageNumber === totalPages || Math.abs(pageNumber - page) <= 1
  );

  useEffect(() => {
    window.localStorage.setItem("4sat:vocabulary:favorites", JSON.stringify(favoriteWords));
  }, [favoriteWords]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const changePage = (nextPage: number) => {
    const safePage = Math.min(Math.max(nextPage, 1), totalPages);
    setPage(safePage);
    setFlippedCards([]);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const toggleCard = (key: string) => {
    setFlippedCards((current) => (current.includes(key) ? current.filter((item) => item !== key) : [...current, key]));
  };

  const changeVocabMode = (mode: "all" | "favorites") => {
    setVocabMode(mode);
    setPage(1);
    setFlippedCards([]);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const toggleFavorite = (word: string) => {
    const key = word.toLowerCase();
    setFavoriteWords((current) => (current.includes(key) ? current.filter((item) => item !== key) : [...current, key]));
  };

  return (
    <section className="vocab-page">
      <div className="vocab-mini-tabs" aria-label="Vocabulary filters">
        <button className={vocabMode === "all" ? "active" : ""} onClick={() => changeVocabMode("all")}>
          All words
        </button>
        <button className={vocabMode === "favorites" ? "active" : ""} onClick={() => changeVocabMode("favorites")}>
          <Star size={14} />
          Favorites
          <span>{favoriteWords.length}</span>
        </button>
      </div>

      <div className="vocab-toolbar">
        <span>
          {activeVocabularyCards.length ? `${start + 1}-${Math.min(start + pageSize, activeVocabularyCards.length)}` : "0"}
        </span>
        <strong>{activeVocabularyCards.length} words</strong>
      </div>

      <div className="vocab-grid" aria-label="SAT vocabulary flashcards">
        {visibleCards.map((card, index) => {
          const key = `${card.word}-${start + index}`;
          const isFlipped = flippedCards.includes(key);
          const isFavorite = favoriteSet.has(card.word.toLowerCase());

          return (
            <article key={key} className={isFlipped ? "vocab-card flipped" : "vocab-card"}>
              <button
                className={isFavorite ? "vocab-favorite active" : "vocab-favorite"}
                onClick={() => toggleFavorite(card.word)}
                aria-label={isFavorite ? `Remove ${card.word} from favorites` : `Add ${card.word} to favorites`}
              >
                <Star size={16} />
              </button>
              <button
                className="vocab-card-flip"
                onClick={() => toggleCard(key)}
                aria-label={isFlipped ? `Hide meaning for ${card.word}` : `Show meaning for ${card.word}`}
              >
                <span className="vocab-card-inner">
                  <span className="vocab-card-face vocab-card-front">
                    <strong>{card.word}</strong>
                  </span>
                  <span className="vocab-card-face vocab-card-back">
                    <strong>{card.word}</strong>
                    <span>{card.meaning}</span>
                    <em>{card.example}</em>
                  </span>
                </span>
              </button>
            </article>
          );
        })}
      </div>

      {!visibleCards.length && (
        <div className="vocab-empty">
          <Star size={22} />
          <strong>No favorite words yet</strong>
          <span>Tap the star on any card to save it here.</span>
        </div>
      )}

      <nav className="vocab-pagination" aria-label="Vocabulary pages">
        <button className="vocab-page-nav" disabled={page === 1} onClick={() => changePage(page - 1)}>
          <ChevronLeft size={16} />
          Previous
        </button>
        <div className="vocab-page-numbers">
          {visiblePages.map((pageNumber, index) => {
            const previousPage = visiblePages[index - 1];
            return (
              <FragmentedVocabPageButton
                key={pageNumber}
                page={pageNumber}
                previousVisible={Boolean(previousPage && pageNumber - previousPage > 1)}
                active={pageNumber === page}
                onClick={() => changePage(pageNumber)}
              />
            );
          })}
        </div>
        <button className="vocab-page-nav" disabled={page === totalPages} onClick={() => changePage(page + 1)}>
          Next
          <ChevronRight size={16} />
        </button>
      </nav>
    </section>
  );
}

function FragmentedVocabPageButton({
  page,
  previousVisible,
  active,
  onClick,
}: {
  page: number;
  previousVisible: boolean;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <>
      {previousVisible && <span className="vocab-page-ellipsis">...</span>}
      <button className={active ? "vocab-page-link active" : "vocab-page-link"} onClick={onClick}>
        {page}
      </button>
    </>
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

