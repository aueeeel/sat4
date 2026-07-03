import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { DatabaseSync } from "node:sqlite";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = process.env.DATA_DIR ?? join(__dirname, "data");
const dbPath = join(dataDir, "4sat.sqlite");
const distDir = join(__dirname, "dist");
const port = Number(process.env.PORT ?? 3001);

mkdirSync(dataDir, { recursive: true });

const db = new DatabaseSync(dbPath);
const rawQuestionBank = JSON.parse(readFileSync(join(__dirname, "src", "data", "question-bank.json"), "utf8"));
const normalizeSection = (section) => (section === "Reading & Writing" ? "Verbal" : section);
const questionBank = rawQuestionBank.map((question) => ({
  id: question.id,
  section: normalizeSection(question.section),
  domain: question.domain,
  skill: question.skill,
  difficulty: question.difficulty,
  question: question.question,
  imagePath: question.image_path,
  choiceImagePaths: question.choice_image_paths ?? [],
  choices: question.choices ?? [],
  correctAnswer: question.correct_answer,
  acceptedAnswers: question.accepted_answers ?? [],
}));
const questionById = new Map(questionBank.map((question) => [question.id, question]));

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    full_name TEXT NOT NULL,
    nickname TEXT NOT NULL,
    age INTEGER NOT NULL,
    gmail TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    joined_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS arena_rooms (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    host_user_id TEXT NOT NULL,
    max_players INTEGER NOT NULL DEFAULT 2,
    section TEXT NOT NULL DEFAULT 'Math',
    sections_json TEXT NOT NULL DEFAULT '["Math"]',
    domains_json TEXT NOT NULL DEFAULT '[]',
    skills_json TEXT NOT NULL DEFAULT '[]',
    question_count INTEGER NOT NULL DEFAULT 10,
    question_ids_json TEXT NOT NULL DEFAULT '[]',
    current_index INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'waiting',
    created_at TEXT NOT NULL,
    started_at TEXT
  );

  CREATE TABLE IF NOT EXISTS arena_players (
    id TEXT PRIMARY KEY,
    room_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    nickname TEXT NOT NULL,
    score INTEGER NOT NULL DEFAULT 0,
    joined_at TEXT NOT NULL,
    UNIQUE(room_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS arena_answers (
    id TEXT PRIMARY KEY,
    room_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    question_id TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    correct INTEGER NOT NULL DEFAULT 0,
    score_awarded INTEGER NOT NULL DEFAULT 0,
    elapsed_ms INTEGER NOT NULL DEFAULT 0,
    answered_at TEXT,
    UNIQUE(room_id, user_id, question_id)
  );
`);

try {
  db.exec(`ALTER TABLE arena_rooms ADD COLUMN sections_json TEXT NOT NULL DEFAULT '["Math"]';`);
} catch {
  // Existing databases already have this column.
}

const json = (response, status, payload) => {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  });
  response.end(JSON.stringify(payload));
};

const contentTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".svg", "image/svg+xml"],
  [".ico", "image/x-icon"],
  [".webp", "image/webp"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"],
]);

const sendStaticFile = (response, filePath) => {
  const stream = createReadStream(filePath);
  response.writeHead(200, {
    "Content-Type": contentTypes.get(extname(filePath).toLowerCase()) ?? "application/octet-stream",
  });
  stream.pipe(response);
  stream.on("error", () => response.end());
};

const serveFrontend = (url, response) => {
  const safeDistDir = resolve(distDir);
  const requestedPath = decodeURIComponent(url.pathname);
  const relativePath = requestedPath === "/" ? "index.html" : requestedPath.replace(/^\/+/, "");
  const requestedFile = resolve(distDir, relativePath);
  const isInsideDist = requestedFile === safeDistDir || requestedFile.startsWith(`${safeDistDir}${sep}`);
  const fallbackFile = join(distDir, "index.html");
  const filePath =
    isInsideDist && existsSync(requestedFile) && statSync(requestedFile).isFile() ? requestedFile : fallbackFile;

  if (!existsSync(filePath)) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Build files were not found. Run npm run build first.");
    return;
  }

  sendStaticFile(response, filePath);
};

const readBody = (request) =>
  new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        request.destroy();
        reject(new Error("Request body is too large."));
      }
    });
    request.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("Invalid JSON body."));
      }
    });
    request.on("error", reject);
  });

const normalizeGmail = (gmail) => String(gmail ?? "").trim().toLowerCase();

const isValidGmail = (gmail) => /^[^\s@]+@gmail\.com$/.test(gmail);

const createPasswordRecord = (password) => {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return { hash, salt };
};

const verifyPassword = (password, hash, salt) => {
  const passwordHash = Buffer.from(hash, "hex");
  const candidateHash = scryptSync(password, salt, 64);
  return passwordHash.length === candidateHash.length && timingSafeEqual(passwordHash, candidateHash);
};

const publicUser = (row) => ({
  id: row.id,
  fullName: row.full_name,
  nickname: row.nickname,
  age: row.age,
  gmail: row.gmail,
  email: row.gmail,
  name: row.nickname || row.full_name,
  joinedAt: row.joined_at,
});

const validateRegistration = ({ fullName, nickname, age, gmail, password }) => {
  if (!fullName || !nickname || !age || !gmail || !password) return "Заполни все поля.";
  if (!isValidGmail(gmail)) return "Введи Gmail в формате name@gmail.com.";
  if (String(password).length < 6) return "Пароль должен быть минимум 6 символов.";
  const numericAge = Number(age);
  if (!Number.isInteger(numericAge) || numericAge < 5 || numericAge > 99) return "Возраст должен быть числом от 5 до 99.";
  return "";
};

const findUserByGmail = db.prepare("SELECT * FROM users WHERE gmail = ?");
const insertUser = db.prepare(`
  INSERT INTO users (id, full_name, nickname, age, gmail, password_hash, password_salt, joined_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

const getRoomById = db.prepare("SELECT * FROM arena_rooms WHERE id = ?");
const getRoomByCode = db.prepare("SELECT * FROM arena_rooms WHERE code = ?");
const getRoomPlayers = db.prepare("SELECT * FROM arena_players WHERE room_id = ? ORDER BY joined_at ASC");
const getPlayer = db.prepare("SELECT * FROM arena_players WHERE room_id = ? AND user_id = ?");
const countPlayers = db.prepare("SELECT COUNT(*) AS count FROM arena_players WHERE room_id = ?");
const insertRoom = db.prepare(`
  INSERT INTO arena_rooms (id, code, password, host_user_id, max_players, section, sections_json, domains_json, skills_json, question_count, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const insertPlayer = db.prepare(`
  INSERT OR IGNORE INTO arena_players (id, room_id, user_id, nickname, joined_at)
  VALUES (?, ?, ?, ?, ?)
`);
const updateRoomConfig = db.prepare(`
  UPDATE arena_rooms
  SET max_players = ?, section = ?, sections_json = ?, domains_json = ?, skills_json = ?, question_count = ?
  WHERE id = ? AND host_user_id = ? AND status = 'waiting'
`);
const startRoomStatement = db.prepare(`
  UPDATE arena_rooms
  SET status = 'playing', question_ids_json = ?, current_index = 0, started_at = ?
  WHERE id = ? AND host_user_id = ? AND status = 'waiting'
`);
const finishRoomStatement = db.prepare("UPDATE arena_rooms SET status = 'finished' WHERE id = ?");
const advanceRoomStatement = db.prepare("UPDATE arena_rooms SET current_index = ? WHERE id = ?");
const getAnswerRecord = db.prepare("SELECT * FROM arena_answers WHERE room_id = ? AND user_id = ? AND question_id = ?");
const upsertAnswer = db.prepare(`
  INSERT INTO arena_answers (id, room_id, user_id, question_id, attempts, correct, score_awarded, elapsed_ms, answered_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(room_id, user_id, question_id)
  DO UPDATE SET attempts = excluded.attempts, correct = excluded.correct, score_awarded = excluded.score_awarded, elapsed_ms = excluded.elapsed_ms, answered_at = excluded.answered_at
`);
const addPlayerScore = db.prepare("UPDATE arena_players SET score = score + ? WHERE room_id = ? AND user_id = ?");
const getCorrectAnswersForQuestion = db.prepare("SELECT COUNT(*) AS count FROM arena_answers WHERE room_id = ? AND question_id = ? AND correct = 1");

const randomRoomCode = () => randomBytes(3).toString("hex").toUpperCase();

const createUniqueRoomCode = () => {
  let code = randomRoomCode();
  while (getRoomByCode.get(code)) code = randomRoomCode();
  return code;
};

const parseJson = (value, fallback) => {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
};

const normalizeSections = (sections, fallback = "Math") => {
  const rawSections = Array.isArray(sections) ? sections : [fallback];
  const validSections = rawSections.filter((section) => section === "Math" || section === "Verbal");
  return [...new Set(validSections)].length ? [...new Set(validSections)] : ["Math"];
};

const publicQuestion = (question) => ({
  id: question.id,
  section: question.section,
  domain: question.domain,
  skill: question.skill,
  difficulty: question.difficulty,
  prompt: question.question,
  imagePath: question.imagePath,
  choiceImagePaths: question.choiceImagePaths,
  choices: question.choices,
});

const publicRoom = (room, userId) => {
  const players = getRoomPlayers.all(room.id);
  const questionIds = parseJson(room.question_ids_json, []);
  const currentQuestionId = questionIds[room.current_index];
  const currentQuestion = currentQuestionId ? questionById.get(currentQuestionId) : null;
  const answers = currentQuestionId
    ? players.map((player) => getAnswerRecord.get(room.id, player.user_id, currentQuestionId)).filter(Boolean)
    : [];
  const winner = room.status === "finished" ? [...players].sort((a, b) => b.score - a.score)[0] ?? null : null;
  const sections = normalizeSections(parseJson(room.sections_json, [room.section]), room.section);

  return {
    id: room.id,
    code: room.code,
    isHost: room.host_user_id === userId,
    hostUserId: room.host_user_id,
    maxPlayers: room.max_players,
    section: sections.length === 1 ? sections[0] : "Mixed",
    sections,
    domains: parseJson(room.domains_json, []),
    skills: parseJson(room.skills_json, []),
    questionCount: room.question_count,
    status: room.status,
    currentIndex: room.current_index,
    totalQuestions: questionIds.length || room.question_count,
    currentQuestion: currentQuestion ? publicQuestion(currentQuestion) : null,
    players: players.map((player) => ({
      userId: player.user_id,
      nickname: player.nickname,
      score: player.score,
      isHost: player.user_id === room.host_user_id,
      answeredCurrent: answers.some((answer) => answer.user_id === player.user_id && answer.correct),
    })),
    winner: winner ? { userId: winner.user_id, nickname: winner.nickname, score: winner.score } : null,
  };
};

const pickQuestions = ({ sections, domains, skills, count }) => {
  const filtered = questionBank.filter((question) => {
    const matchesSection = sections.includes(question.section);
    const matchesDomain = !domains.length || domains.includes(question.domain);
    const matchesSkill = !skills.length || skills.includes(question.skill);
    return matchesSection && matchesDomain && matchesSkill;
  });
  return [...filtered].sort(() => Math.random() - 0.5).slice(0, count).map((question) => question.id);
};

const normalizeAnswerValue = (value) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/^0+(?=\d)/, "");

const isCorrectArenaAnswer = (question, body) => {
  if (typeof body.selectedIndex === "number" && question.choices[body.selectedIndex]) {
    return question.choices[body.selectedIndex] === question.correctAnswer;
  }
  const answer = normalizeAnswerValue(body.freeResponse ?? body.answer);
  const accepted = [question.correctAnswer, ...question.acceptedAnswers].map(normalizeAnswerValue);
  return Boolean(answer) && accepted.includes(answer);
};

const calculateScore = (elapsedMs, attemptsBefore) => {
  const speedScore = Math.max(250, Math.round(1000 - Math.max(0, elapsedMs) / 40));
  return Math.max(0, speedScore - attemptsBefore * 250);
};

const server = createServer(async (request, response) => {
  if (request.method === "OPTIONS") {
    json(response, 204, {});
    return;
  }

  try {
    const url = new URL(request.url ?? "/", `http://${request.headers.host}`);

    if (request.method === "GET" && url.pathname === "/api/health") {
      json(response, 200, { ok: true, database: dbPath });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/auth/register") {
      const body = await readBody(request);
      const fullName = String(body.fullName ?? "").trim();
      const nickname = String(body.nickname ?? "").trim();
      const age = Number(body.age);
      const gmail = normalizeGmail(body.gmail);
      const password = String(body.password ?? "");
      const validationError = validateRegistration({ fullName, nickname, age, gmail, password });

      if (validationError) {
        json(response, 400, { error: validationError });
        return;
      }

      if (findUserByGmail.get(gmail)) {
        json(response, 409, { error: "Аккаунт с этим Gmail уже есть." });
        return;
      }

      const { hash, salt } = createPasswordRecord(password);
      const id = randomUUID();
      const joinedAt = new Date().toISOString();
      insertUser.run(id, fullName, nickname, age, gmail, hash, salt, joinedAt);
      json(response, 201, {
        user: publicUser({
          id,
          full_name: fullName,
          nickname,
          age,
          gmail,
          joined_at: joinedAt,
        }),
      });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/auth/login") {
      const body = await readBody(request);
      const gmail = normalizeGmail(body.gmail);
      const password = String(body.password ?? "");

      if (!gmail || !password) {
        json(response, 400, { error: "Введи Gmail и пароль." });
        return;
      }

      const user = findUserByGmail.get(gmail);
      if (!user || !verifyPassword(password, user.password_hash, user.password_salt)) {
        json(response, 401, { error: "Gmail или пароль не совпадают." });
        return;
      }

      json(response, 200, { user: publicUser(user) });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/arena/create") {
      const body = await readBody(request);
      const userId = String(body.userId ?? "");
      const nickname = String(body.nickname ?? "Player").trim().slice(0, 32);
      const password = String(body.password ?? "").trim();
      const maxPlayers = Math.min(5, Math.max(2, Number(body.maxPlayers ?? 2)));
      const sections = normalizeSections(body.sections, body.section === "Verbal" ? "Verbal" : "Math");
      const section = sections.length === 1 ? sections[0] : "Mixed";
      const domains = Array.isArray(body.domains) ? body.domains.map(String) : [];
      const skills = Array.isArray(body.skills) ? body.skills.map(String) : [];
      const questionCount = Math.min(30, Math.max(3, Number(body.questionCount ?? 10)));

      if (!userId || !password) {
        json(response, 400, { error: "User and room password are required." });
        return;
      }

      const id = randomUUID();
      const code = createUniqueRoomCode();
      const now = new Date().toISOString();
      insertRoom.run(id, code, password, userId, maxPlayers, section, JSON.stringify(sections), JSON.stringify(domains), JSON.stringify(skills), questionCount, now);
      insertPlayer.run(randomUUID(), id, userId, nickname || "Host", now);
      json(response, 201, { room: publicRoom(getRoomById.get(id), userId) });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/arena/join") {
      const body = await readBody(request);
      const userId = String(body.userId ?? "");
      const nickname = String(body.nickname ?? "Player").trim().slice(0, 32);
      const code = String(body.code ?? "").trim().toUpperCase();
      const password = String(body.password ?? "").trim();
      const room = getRoomByCode.get(code);

      if (!room || room.password !== password) {
        json(response, 404, { error: "Room code or password is wrong." });
        return;
      }
      if (room.status !== "waiting") {
        json(response, 409, { error: "This game already started." });
        return;
      }
      if (!getPlayer.get(room.id, userId) && countPlayers.get(room.id).count >= room.max_players) {
        json(response, 409, { error: "Room is full." });
        return;
      }

      insertPlayer.run(randomUUID(), room.id, userId, nickname || "Player", new Date().toISOString());
      json(response, 200, { room: publicRoom(getRoomById.get(room.id), userId) });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/arena/configure") {
      const body = await readBody(request);
      const roomId = String(body.roomId ?? "");
      const userId = String(body.userId ?? "");
      const maxPlayers = Math.min(5, Math.max(2, Number(body.maxPlayers ?? 2)));
      const sections = normalizeSections(body.sections, body.section === "Verbal" ? "Verbal" : "Math");
      const section = sections.length === 1 ? sections[0] : "Mixed";
      const domains = Array.isArray(body.domains) ? body.domains.map(String) : [];
      const skills = Array.isArray(body.skills) ? body.skills.map(String) : [];
      const questionCount = Math.min(30, Math.max(3, Number(body.questionCount ?? 10)));
      updateRoomConfig.run(maxPlayers, section, JSON.stringify(sections), JSON.stringify(domains), JSON.stringify(skills), questionCount, roomId, userId);
      const room = getRoomById.get(roomId);
      if (!room) {
        json(response, 404, { error: "Room not found." });
        return;
      }
      json(response, 200, { room: publicRoom(room, userId) });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/arena/start") {
      const body = await readBody(request);
      const roomId = String(body.roomId ?? "");
      const userId = String(body.userId ?? "");
      const room = getRoomById.get(roomId);

      if (!room || room.host_user_id !== userId) {
        json(response, 403, { error: "Only host can start the game." });
        return;
      }
      const domains = parseJson(room.domains_json, []);
      const skills = parseJson(room.skills_json, []);
      const sections = normalizeSections(parseJson(room.sections_json, [room.section]), room.section);
      const questionIds = pickQuestions({ sections, domains, skills, count: room.question_count });
      if (!questionIds.length) {
        json(response, 400, { error: "No questions match this setup." });
        return;
      }
      startRoomStatement.run(JSON.stringify(questionIds), new Date().toISOString(), room.id, userId);
      json(response, 200, { room: publicRoom(getRoomById.get(room.id), userId) });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/arena/answer") {
      const body = await readBody(request);
      const roomId = String(body.roomId ?? "");
      const userId = String(body.userId ?? "");
      const questionId = String(body.questionId ?? "");
      const elapsedMs = Math.max(0, Number(body.elapsedMs ?? 0));
      const room = getRoomById.get(roomId);
      const player = room ? getPlayer.get(room.id, userId) : null;
      const question = questionById.get(questionId);

      if (!room || !player || !question || room.status !== "playing") {
        json(response, 400, { error: "Game is not ready." });
        return;
      }

      const questionIds = parseJson(room.question_ids_json, []);
      if (questionIds[room.current_index] !== questionId) {
        json(response, 409, { error: "This is not the active question." });
        return;
      }

      const previous = getAnswerRecord.get(roomId, userId, questionId);
      if (previous?.correct) {
        json(response, 200, { correct: true, scoreAwarded: 0, room: publicRoom(room, userId) });
        return;
      }

      const attempts = (previous?.attempts ?? 0) + 1;
      const correct = isCorrectArenaAnswer(question, body);
      const scoreAwarded = correct ? calculateScore(elapsedMs, attempts - 1) : 0;
      upsertAnswer.run(randomUUID(), roomId, userId, questionId, attempts, correct ? 1 : 0, scoreAwarded, elapsedMs, new Date().toISOString());
      if (correct && scoreAwarded) addPlayerScore.run(scoreAwarded, roomId, userId);

      const playerCount = countPlayers.get(roomId).count;
      const correctCount = getCorrectAnswersForQuestion.get(roomId, questionId).count;
      if (correctCount >= playerCount) {
        const nextIndex = room.current_index + 1;
        if (nextIndex >= questionIds.length) finishRoomStatement.run(roomId);
        else advanceRoomStatement.run(nextIndex, roomId);
      }

      json(response, 200, { correct, attempts, scoreAwarded, room: publicRoom(getRoomById.get(roomId), userId) });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/arena/room") {
      const roomId = url.searchParams.get("roomId");
      const code = url.searchParams.get("code");
      const userId = url.searchParams.get("userId") ?? "";
      const room = roomId ? getRoomById.get(roomId) : getRoomByCode.get(String(code ?? "").toUpperCase());
      if (!room) {
        json(response, 404, { error: "Room not found." });
        return;
      }
      json(response, 200, { room: publicRoom(room, userId) });
      return;
    }

    if (request.method === "GET" && !url.pathname.startsWith("/api/")) {
      serveFrontend(url, response);
      return;
    }

    json(response, 404, { error: "Not found." });
  } catch (error) {
    json(response, 500, { error: error instanceof Error ? error.message : "Server error." });
  }
});

server.listen(port, () => {
  console.log(`4sat API running on http://127.0.0.1:${port}`);
  console.log(`SQLite database: ${dbPath}`);
});
