import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const loadEnvFile = (filePath) => {
  if (!existsSync(filePath)) return;
  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmedLine = line.trim();
    if (!trimmedLine || trimmedLine.startsWith("#")) continue;
    const match = trimmedLine.match(/^([^=]+)=(.*)$/);
    if (!match) continue;
    const key = match[1].trim();
    const rawValue = match[2].trim();
    if (process.env[key]) continue;
    process.env[key] = rawValue.replace(/^['"]|['"]$/g, "");
  }
};

loadEnvFile(join(__dirname, ".env.local"));
loadEnvFile(join(__dirname, ".env"));

const usePostgres = Boolean(process.env.DATABASE_URL);
const dataDir = usePostgres ? join(tmpdir(), "4sat") : process.env.DATA_DIR ?? join(__dirname, "data");
const dbPath = join(dataDir, "4sat.sqlite");
const distDir = join(__dirname, "dist");
const port = Number(process.env.PORT ?? 3001);
const { Pool } = pg;
const pgPool = usePostgres
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_URL?.includes("localhost") ? false : { rejectUnauthorized: false },
    })
  : null;

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
  explanation: question.explanation,
}));
const questionById = new Map(questionBank.map((question) => [question.id, question]));

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    public_id TEXT UNIQUE,
    full_name TEXT NOT NULL,
    nickname TEXT NOT NULL,
    age INTEGER NOT NULL,
    gmail TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    elo INTEGER NOT NULL DEFAULT 400,
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
    selected_index INTEGER,
    free_response TEXT,
    cooldown_until TEXT,
    answered_at TEXT,
    UNIQUE(room_id, user_id, question_id)
  );

  CREATE TABLE IF NOT EXISTS friendships (
    id TEXT PRIMARY KEY,
    user_a TEXT NOT NULL,
    user_b TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE(user_a, user_b)
  );

  CREATE TABLE IF NOT EXISTS friend_requests (
    id TEXT PRIMARY KEY,
    sender_id TEXT NOT NULL,
    receiver_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(sender_id, receiver_id)
  );

  CREATE TABLE IF NOT EXISTS friend_messages (
    id TEXT PRIMARY KEY,
    sender_id TEXT NOT NULL,
    receiver_id TEXT NOT NULL,
    body TEXT NOT NULL,
    question_id TEXT,
    created_at TEXT NOT NULL
  );
`);

try {
  db.exec(`ALTER TABLE arena_rooms ADD COLUMN sections_json TEXT NOT NULL DEFAULT '["Math"]';`);
} catch {
  // Existing databases already have this column.
}

for (const migration of [
  `ALTER TABLE users ADD COLUMN public_id TEXT;`,
  `ALTER TABLE users ADD COLUMN elo INTEGER NOT NULL DEFAULT 400;`,
  `ALTER TABLE arena_rooms ADD COLUMN elo_awarded INTEGER NOT NULL DEFAULT 0;`,
  `ALTER TABLE arena_answers ADD COLUMN selected_index INTEGER;`,
  `ALTER TABLE arena_answers ADD COLUMN free_response TEXT;`,
  `ALTER TABLE arena_answers ADD COLUMN cooldown_until TEXT;`,
]) {
  try {
    db.exec(migration);
  } catch {
    // Existing databases already have this column.
  }
}

db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS users_public_id_idx ON users(public_id);`);

const createPublicId = () => {
  const findExistingPublicId = db.prepare("SELECT id FROM users WHERE public_id = ?");
  let publicId = String(Math.floor(100000 + Math.random() * 900000));
  while (findExistingPublicId.get(publicId)) {
    publicId = String(Math.floor(100000 + Math.random() * 900000));
  }
  return publicId;
};

const backfillPublicIds = () => {
  const usersWithoutPublicId = db.prepare("SELECT id FROM users WHERE public_id IS NULL OR public_id = ''").all();
  const updatePublicId = db.prepare("UPDATE users SET public_id = ? WHERE id = ?");
  for (const user of usersWithoutPublicId) {
    updatePublicId.run(createPublicId(), user.id);
  }
};

backfillPublicIds();

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
  publicId: row.public_id,
  fullName: row.full_name,
  nickname: row.nickname,
  age: row.age,
  gmail: row.gmail,
  email: row.gmail,
  name: row.nickname || row.full_name,
  elo: row.elo ?? 400,
  joinedAt: row.joined_at,
});

const publicFriendRequest = (row, currentUserId) => ({
  id: row.id,
  senderId: row.sender_id,
  receiverId: row.receiver_id,
  direction: row.sender_id === currentUserId ? "outgoing" : "incoming",
  status: row.status,
  createdAt: row.created_at,
  user: publicUser({
    id: row.sender_id === currentUserId ? row.receiver_id : row.sender_id,
    public_id: row.public_id,
    full_name: row.full_name,
    nickname: row.nickname,
    age: row.age,
    gmail: row.gmail,
    elo: row.elo,
    joined_at: row.joined_at,
  }),
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
const findUserById = db.prepare("SELECT * FROM users WHERE id = ?");
const findUserByPublicId = db.prepare("SELECT * FROM users WHERE public_id = ?");
const findUserByNickname = db.prepare("SELECT * FROM users WHERE lower(nickname) = lower(?)");
const insertUser = db.prepare(`
  INSERT INTO users (id, public_id, full_name, nickname, age, gmail, password_hash, password_salt, elo, joined_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const updateUserElo = db.prepare("UPDATE users SET elo = max(0, elo + ?) WHERE id = ?");
const getFriendship = db.prepare("SELECT * FROM friendships WHERE user_a = ? AND user_b = ?");
const insertFriendship = db.prepare("INSERT OR IGNORE INTO friendships (id, user_a, user_b, created_at) VALUES (?, ?, ?, ?)");
const getFriendRequest = db.prepare(`
  SELECT * FROM friend_requests
  WHERE ((sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?))
    AND status = 'pending'
`);
const insertFriendRequest = db.prepare(`
  INSERT INTO friend_requests (id, sender_id, receiver_id, status, created_at, updated_at)
  VALUES (?, ?, ?, 'pending', ?, ?)
  ON CONFLICT(sender_id, receiver_id) DO UPDATE SET
    status = 'pending',
    updated_at = excluded.updated_at
`);
const acceptFriendRequest = db.prepare(`
  UPDATE friend_requests
  SET status = 'accepted', updated_at = ?
  WHERE id = ? AND receiver_id = ? AND status = 'pending'
`);
const getFriendRequests = db.prepare(`
  SELECT friend_requests.*, users.public_id, users.nickname, users.full_name, users.age, users.gmail, users.elo, users.joined_at
  FROM friend_requests
  JOIN users ON users.id = CASE
    WHEN friend_requests.sender_id = ? THEN friend_requests.receiver_id
    ELSE friend_requests.sender_id
  END
  WHERE (friend_requests.sender_id = ? OR friend_requests.receiver_id = ?)
    AND friend_requests.status = 'pending'
  ORDER BY friend_requests.created_at DESC
`);
const getFriendRows = db.prepare(`
  SELECT users.* FROM friendships
  JOIN users ON users.id = CASE WHEN friendships.user_a = ? THEN friendships.user_b ELSE friendships.user_a END
  WHERE friendships.user_a = ? OR friendships.user_b = ?
  ORDER BY users.nickname COLLATE NOCASE ASC
`);
const getMessagesBetween = db.prepare(`
  SELECT * FROM friend_messages
  WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)
  ORDER BY created_at ASC
`);
const insertFriendMessage = db.prepare(`
  INSERT INTO friend_messages (id, sender_id, receiver_id, body, question_id, created_at)
  VALUES (?, ?, ?, ?, ?, ?)
`);

const pgQuery = async (text, params = []) => {
  if (!pgPool) throw new Error("Postgres is not configured.");
  return pgPool.query(text, params);
};

const initializePostgres = async () => {
  if (!usePostgres) return;
  await pgQuery(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      public_id TEXT UNIQUE,
      full_name TEXT NOT NULL,
      nickname TEXT NOT NULL,
      age INTEGER NOT NULL,
      gmail TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      elo INTEGER NOT NULL DEFAULT 400,
      joined_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS friendships (
      id TEXT PRIMARY KEY,
      user_a TEXT NOT NULL,
      user_b TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(user_a, user_b)
    );

    CREATE TABLE IF NOT EXISTS friend_requests (
      id TEXT PRIMARY KEY,
      sender_id TEXT NOT NULL,
      receiver_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(sender_id, receiver_id)
    );

    CREATE TABLE IF NOT EXISTS friend_messages (
      id TEXT PRIMARY KEY,
      sender_id TEXT NOT NULL,
      receiver_id TEXT NOT NULL,
      body TEXT NOT NULL,
      question_id TEXT,
      created_at TEXT NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS users_public_id_idx ON users(public_id);
  `);
};

const createPublicIdPg = async () => {
  let publicId = String(Math.floor(100000 + Math.random() * 900000));
  while ((await pgQuery("SELECT id FROM users WHERE public_id = $1", [publicId])).rowCount) {
    publicId = String(Math.floor(100000 + Math.random() * 900000));
  }
  return publicId;
};

const backfillPublicIdsPg = async () => {
  const { rows } = await pgQuery("SELECT id FROM users WHERE public_id IS NULL OR public_id = ''");
  for (const user of rows) {
    await pgQuery("UPDATE users SET public_id = $1 WHERE id = $2", [await createPublicIdPg(), user.id]);
  }
};

await initializePostgres();
await backfillPublicIdsPg();

const getUserByIdPg = async (id) => (await pgQuery("SELECT * FROM users WHERE id = $1", [id])).rows[0] ?? null;
const getUserByGmailPg = async (gmail) => (await pgQuery("SELECT * FROM users WHERE gmail = $1", [gmail])).rows[0] ?? null;
const searchUserPg = async (query) =>
  (
    await pgQuery(
      "SELECT * FROM users WHERE public_id = $1 OR id = $1 OR lower(nickname) = lower($1) LIMIT 1",
      [query]
    )
  ).rows[0] ?? null;

const listFriendsPg = async (userId) =>
  (
    await pgQuery(
      `
        SELECT users.* FROM friendships
        JOIN users ON users.id = CASE WHEN friendships.user_a = $1 THEN friendships.user_b ELSE friendships.user_a END
        WHERE friendships.user_a = $1 OR friendships.user_b = $1
        ORDER BY users.nickname COLLATE "C" ASC
      `,
      [userId]
    )
  ).rows.map(publicUser);

const listFriendRequestsPg = async (userId) =>
  (
    await pgQuery(
      `
        SELECT friend_requests.*, users.public_id, users.nickname, users.full_name, users.age, users.gmail, users.elo, users.joined_at
        FROM friend_requests
        JOIN users ON users.id = CASE
          WHEN friend_requests.sender_id = $1 THEN friend_requests.receiver_id
          ELSE friend_requests.sender_id
        END
        WHERE (friend_requests.sender_id = $1 OR friend_requests.receiver_id = $1)
          AND friend_requests.status = 'pending'
        ORDER BY friend_requests.created_at DESC
      `,
      [userId]
    )
  ).rows.map((requestRow) => publicFriendRequest(requestRow, userId));

const areFriendsPg = async (userA, userB) =>
  (
    await pgQuery("SELECT id FROM friendships WHERE user_a = $1 AND user_b = $2", [userA, userB])
  ).rows[0] ?? null;

const getFriendRequestPg = async (userId, friendId) =>
  (
    await pgQuery(
      `
        SELECT * FROM friend_requests
        WHERE ((sender_id = $1 AND receiver_id = $2) OR (sender_id = $2 AND receiver_id = $1))
          AND status = 'pending'
        LIMIT 1
      `,
      [userId, friendId]
    )
  ).rows[0] ?? null;

const formatFriendMessage = (message) => ({
  id: message.id,
  senderId: message.sender_id,
  receiverId: message.receiver_id,
  body: message.body,
  questionId: message.question_id,
  createdAt: message.created_at,
});

const listMessagesPg = async (userId, friendId) =>
  (
    await pgQuery(
      `
        SELECT * FROM friend_messages
        WHERE (sender_id = $1 AND receiver_id = $2) OR (sender_id = $2 AND receiver_id = $1)
        ORDER BY created_at ASC
      `,
      [userId, friendId]
    )
  ).rows.map(formatFriendMessage);

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
const markRoomEloAwarded = db.prepare("UPDATE arena_rooms SET elo_awarded = 1 WHERE id = ? AND elo_awarded = 0");
const advanceRoomStatement = db.prepare("UPDATE arena_rooms SET current_index = ? WHERE id = ?");
const getAnswerRecord = db.prepare("SELECT * FROM arena_answers WHERE room_id = ? AND user_id = ? AND question_id = ?");
const upsertAnswer = db.prepare(`
  INSERT INTO arena_answers (id, room_id, user_id, question_id, attempts, correct, score_awarded, elapsed_ms, selected_index, free_response, cooldown_until, answered_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(room_id, user_id, question_id)
  DO UPDATE SET attempts = excluded.attempts, correct = excluded.correct, score_awarded = excluded.score_awarded, elapsed_ms = excluded.elapsed_ms, selected_index = excluded.selected_index, free_response = excluded.free_response, cooldown_until = excluded.cooldown_until, answered_at = excluded.answered_at
`);
const addPlayerScore = db.prepare("UPDATE arena_players SET score = max(0, score + ?) WHERE room_id = ? AND user_id = ?");
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
  explanation: question.explanation,
});

const publicRoom = (room, userId) => {
  const players = getRoomPlayers.all(room.id);
  const questionIds = parseJson(room.question_ids_json, []);
  const userCorrectIds = new Set(
    questionIds.filter((questionId) => getAnswerRecord.get(room.id, userId, questionId)?.correct)
  );
  const userCurrentIndex =
    room.status === "playing" ? questionIds.findIndex((questionId) => !userCorrectIds.has(questionId)) : room.current_index;
  const currentQuestionId = userCurrentIndex >= 0 ? questionIds[userCurrentIndex] : undefined;
  const currentQuestion = currentQuestionId ? questionById.get(currentQuestionId) : null;
  const winner = room.status === "finished" ? [...players].sort((a, b) => b.score - a.score)[0] ?? null : null;
  const sections = normalizeSections(parseJson(room.sections_json, [room.section]), room.section);
  const review = room.status === "finished"
    ? questionIds
        .map((questionId, index) => {
          const question = questionById.get(questionId);
          if (!question) return null;
          const answer = getAnswerRecord.get(room.id, userId, questionId);
          return {
            ...publicQuestion(question),
            index,
            correctAnswer: question.correctAnswer,
            correctIndex: question.choices.findIndex((choice) => choice === question.correctAnswer),
            selectedIndex: answer?.selected_index ?? null,
            freeResponse: answer?.free_response ?? "",
            correct: Boolean(answer?.correct),
            attempts: answer?.attempts ?? 0,
            scoreAwarded: answer?.score_awarded ?? 0,
          };
        })
        .filter(Boolean)
    : [];

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
    currentIndex: userCurrentIndex >= 0 ? userCurrentIndex : questionIds.length,
    totalQuestions: questionIds.length || room.question_count,
    currentQuestion: currentQuestion ? publicQuestion(currentQuestion) : null,
    review,
    players: players.map((player) => ({
      userId: player.user_id,
      nickname: player.nickname,
      score: player.score,
      isHost: player.user_id === room.host_user_id,
      answeredCurrent: questionIds.every((questionId) => getAnswerRecord.get(room.id, player.user_id, questionId)?.correct),
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


      if (usePostgres) {
        if (await getUserByGmailPg(gmail)) {
          json(response, 409, { error: "Account with this Gmail already exists." });
          return;
        }

        const { hash, salt } = createPasswordRecord(password);
        const id = randomUUID();
        const publicId = await createPublicIdPg();
        const joinedAt = new Date().toISOString();
        await pgQuery(
          `
            INSERT INTO users (id, public_id, full_name, nickname, age, gmail, password_hash, password_salt, elo, joined_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 400, $9)
          `,
          [id, publicId, fullName, nickname, age, gmail, hash, salt, joinedAt]
        );
        json(response, 201, {
          user: publicUser({
            id,
            public_id: publicId,
            full_name: fullName,
            nickname,
            age,
            gmail,
            elo: 400,
            joined_at: joinedAt,
          }),
        });
        return;
      }

      if (findUserByGmail.get(gmail)) {
        json(response, 409, { error: "Аккаунт с этим Gmail уже есть." });
        return;
      }

      const { hash, salt } = createPasswordRecord(password);
      const id = randomUUID();
      const publicId = createPublicId();
      const joinedAt = new Date().toISOString();
      insertUser.run(id, publicId, fullName, nickname, age, gmail, hash, salt, 400, joinedAt);
      json(response, 201, {
        user: publicUser({
          id,
          public_id: publicId,
          full_name: fullName,
          nickname,
          age,
          gmail,
          elo: 400,
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


      if (usePostgres) {
        const user = await getUserByGmailPg(gmail);
        if (!user || !verifyPassword(password, user.password_hash, user.password_salt)) {
          json(response, 401, { error: "Gmail or password is incorrect." });
          return;
        }

        json(response, 200, { user: publicUser(user) });
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

    if (request.method === "GET" && url.pathname === "/api/users/me") {
      const userId = String(url.searchParams.get("userId") ?? "");

      if (usePostgres) {
        const user = await getUserByIdPg(userId);
        if (!user) {
          json(response, 404, { error: "User not found." });
          return;
        }
        json(response, 200, { user: publicUser(user) });
        return;
      }

      const user = findUserById.get(userId);
      if (!user) {
        json(response, 404, { error: "User not found." });
        return;
      }
      json(response, 200, { user: publicUser(user) });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/users/elo") {
      const body = await readBody(request);
      const userId = String(body.userId ?? "");
      const delta = Math.max(-20, Math.min(20, Number(body.delta ?? 0)));
      if (!userId || !Number.isFinite(delta)) {
        json(response, 400, { error: "User and ELO delta are required." });
        return;
      }
      if (usePostgres) {
        await pgQuery("UPDATE users SET elo = GREATEST(0, elo + $1) WHERE id = $2", [delta, userId]);
        const user = await getUserByIdPg(userId);
        if (!user) {
          json(response, 404, { error: "User not found." });
          return;
        }
        json(response, 200, { user: publicUser(user) });
        return;
      }

      updateUserElo.run(delta, userId);
      const user = findUserById.get(userId);
      if (!user) {
        json(response, 404, { error: "User not found." });
        return;
      }
      json(response, 200, { user: publicUser(user) });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/friends") {
      const userId = url.searchParams.get("userId") ?? "";
      if (usePostgres) {
        json(response, 200, { friends: await listFriendsPg(userId) });
        return;
      }

      const friends = getFriendRows.all(userId, userId, userId).map(publicUser);
      json(response, 200, { friends });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/friends/requests") {
      const userId = url.searchParams.get("userId") ?? "";
      if (usePostgres) {
        json(response, 200, { requests: await listFriendRequestsPg(userId) });
        return;
      }

      const requests = getFriendRequests.all(userId, userId, userId).map((requestRow) => publicFriendRequest(requestRow, userId));
      json(response, 200, { requests });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/friends/search") {
      const query = String(url.searchParams.get("q") ?? "").trim();
      const userId = String(url.searchParams.get("userId") ?? "");
      if (usePostgres) {
        const user = query ? await searchUserPg(query) : null;
        if (!user || user.id === userId) {
          json(response, 404, { error: "User not found." });
          return;
        }
        json(response, 200, { user: publicUser(user) });
        return;
      }

      const user = query ? (findUserByPublicId.get(query) ?? findUserById.get(query) ?? findUserByNickname.get(query)) : null;
      if (!user || user.id === userId) {
        json(response, 404, { error: "User not found." });
        return;
      }
      json(response, 200, { user: publicUser(user) });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/friends/add") {
      const body = await readBody(request);
      const userId = String(body.userId ?? "");
      const friendId = String(body.friendId ?? "");
      if (usePostgres) {
        const user = await getUserByIdPg(userId);
        const friend = await getUserByIdPg(friendId);
        if (!user || !friend || userId === friendId) {
          json(response, 400, { error: "Friend could not be added." });
          return;
        }

        const [userA, userB] = [userId, friendId].sort();
        if (await areFriendsPg(userA, userB)) {
          json(response, 200, {
            status: "friends",
            friends: await listFriendsPg(userId),
            requests: await listFriendRequestsPg(userId),
          });
          return;
        }

        const existingRequest = await getFriendRequestPg(userId, friendId);
        const now = new Date().toISOString();
        if (existingRequest?.receiver_id === userId) {
          await pgQuery("UPDATE friend_requests SET status = 'accepted', updated_at = $1 WHERE id = $2", [now, existingRequest.id]);
          await pgQuery(
            "INSERT INTO friendships (id, user_a, user_b, created_at) VALUES ($1, $2, $3, $4) ON CONFLICT(user_a, user_b) DO NOTHING",
            [randomUUID(), userA, userB, now]
          );
          json(response, 200, {
            status: "accepted",
            friends: await listFriendsPg(userId),
            requests: await listFriendRequestsPg(userId),
          });
          return;
        }

        await pgQuery(
          `
            INSERT INTO friend_requests (id, sender_id, receiver_id, status, created_at, updated_at)
            VALUES ($1, $2, $3, 'pending', $4, $4)
            ON CONFLICT(sender_id, receiver_id) DO UPDATE SET status = 'pending', updated_at = excluded.updated_at
          `,
          [randomUUID(), userId, friendId, now]
        );
        json(response, 200, {
          status: "requested",
          friends: await listFriendsPg(userId),
          requests: await listFriendRequestsPg(userId),
        });
        return;
      }

      const user = findUserById.get(userId);
      const friend = findUserById.get(friendId);
      if (!user || !friend || userId === friendId) {
        json(response, 400, { error: "Friend could not be added." });
        return;
      }
      const [userA, userB] = [userId, friendId].sort();
      if (getFriendship.get(userA, userB)) {
        json(response, 200, {
          status: "friends",
          friends: getFriendRows.all(userId, userId, userId).map(publicUser),
          requests: getFriendRequests.all(userId, userId, userId).map((requestRow) => publicFriendRequest(requestRow, userId)),
        });
        return;
      }

      const existingRequest = getFriendRequest.get(userId, friendId, friendId, userId);
      if (existingRequest?.receiver_id === userId) {
        const now = new Date().toISOString();
        acceptFriendRequest.run(now, existingRequest.id, userId);
        insertFriendship.run(randomUUID(), userA, userB, now);
        json(response, 200, {
          status: "accepted",
          friends: getFriendRows.all(userId, userId, userId).map(publicUser),
          requests: getFriendRequests.all(userId, userId, userId).map((requestRow) => publicFriendRequest(requestRow, userId)),
        });
        return;
      }

      const now = new Date().toISOString();
      insertFriendRequest.run(randomUUID(), userId, friendId, now, now);
      json(response, 200, {
        status: "requested",
        friends: getFriendRows.all(userId, userId, userId).map(publicUser),
        requests: getFriendRequests.all(userId, userId, userId).map((requestRow) => publicFriendRequest(requestRow, userId)),
      });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/friends/accept") {
      const body = await readBody(request);
      const userId = String(body.userId ?? "");
      const requestId = String(body.requestId ?? "");
      if (usePostgres) {
        const requestRow = (
          await pgQuery("SELECT * FROM friend_requests WHERE id = $1 AND receiver_id = $2 AND status = 'pending'", [requestId, userId])
        ).rows[0];
        if (!requestRow) {
          json(response, 404, { error: "Friend request not found." });
          return;
        }
        const [userA, userB] = [requestRow.sender_id, requestRow.receiver_id].sort();
        const now = new Date().toISOString();
        await pgQuery("UPDATE friend_requests SET status = 'accepted', updated_at = $1 WHERE id = $2 AND receiver_id = $3", [now, requestId, userId]);
        await pgQuery(
          "INSERT INTO friendships (id, user_a, user_b, created_at) VALUES ($1, $2, $3, $4) ON CONFLICT(user_a, user_b) DO NOTHING",
          [randomUUID(), userA, userB, now]
        );
        json(response, 200, {
          friends: await listFriendsPg(userId),
          requests: await listFriendRequestsPg(userId),
        });
        return;
      }

      const requestRow = db.prepare("SELECT * FROM friend_requests WHERE id = ? AND receiver_id = ? AND status = 'pending'").get(requestId, userId);
      if (!requestRow) {
        json(response, 404, { error: "Friend request not found." });
        return;
      }
      const [userA, userB] = [requestRow.sender_id, requestRow.receiver_id].sort();
      const now = new Date().toISOString();
      acceptFriendRequest.run(now, requestId, userId);
      insertFriendship.run(randomUUID(), userA, userB, now);
      json(response, 200, {
        friends: getFriendRows.all(userId, userId, userId).map(publicUser),
        requests: getFriendRequests.all(userId, userId, userId).map((pendingRequest) => publicFriendRequest(pendingRequest, userId)),
      });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/friends/messages") {
      const userId = url.searchParams.get("userId") ?? "";
      const friendId = url.searchParams.get("friendId") ?? "";
      if (usePostgres) {
        json(response, 200, { messages: await listMessagesPg(userId, friendId) });
        return;
      }

      const messages = getMessagesBetween.all(userId, friendId, friendId, userId).map((message) => ({
        id: message.id,
        senderId: message.sender_id,
        receiverId: message.receiver_id,
        body: message.body,
        questionId: message.question_id,
        createdAt: message.created_at,
      }));
      json(response, 200, { messages });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/friends/messages") {
      const body = await readBody(request);
      const senderId = String(body.senderId ?? "");
      const receiverId = String(body.receiverId ?? "");
      const questionId = body.questionId ? String(body.questionId) : null;
      const bodyText = String(body.body ?? "").trim().slice(0, 1000);
      const [userA, userB] = [senderId, receiverId].sort();
      if (usePostgres) {
        if (!senderId || !receiverId || !bodyText || !(await areFriendsPg(userA, userB))) {
          json(response, 400, { error: "Message could not be sent." });
          return;
        }
        await pgQuery(
          "INSERT INTO friend_messages (id, sender_id, receiver_id, body, question_id, created_at) VALUES ($1, $2, $3, $4, $5, $6)",
          [randomUUID(), senderId, receiverId, bodyText, questionId, new Date().toISOString()]
        );
        json(response, 201, { messages: await listMessagesPg(senderId, receiverId) });
        return;
      }

      if (!senderId || !receiverId || !bodyText || !getFriendship.get(userA, userB)) {
        json(response, 400, { error: "Message could not be sent." });
        return;
      }
      insertFriendMessage.run(randomUUID(), senderId, receiverId, bodyText, questionId, new Date().toISOString());
      const messages = getMessagesBetween.all(senderId, receiverId, receiverId, senderId).map((message) => ({
        id: message.id,
        senderId: message.sender_id,
        receiverId: message.receiver_id,
        body: message.body,
        questionId: message.question_id,
        createdAt: message.created_at,
      }));
      json(response, 201, { messages });
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
      const userActiveQuestionId = questionIds.find((id) => !getAnswerRecord.get(roomId, userId, id)?.correct);
      if (userActiveQuestionId !== questionId) {
        json(response, 409, { error: "This is not the active question." });
        return;
      }

      const previous = getAnswerRecord.get(roomId, userId, questionId);
      if (previous?.correct) {
        json(response, 200, { correct: true, scoreAwarded: 0, room: publicRoom(room, userId) });
        return;
      }
      if (previous?.cooldown_until && new Date(previous.cooldown_until).getTime() > Date.now()) {
        json(response, 429, {
          error: "Wait before trying again.",
          waitMs: new Date(previous.cooldown_until).getTime() - Date.now(),
          room: publicRoom(room, userId),
        });
        return;
      }

      const attempts = (previous?.attempts ?? 0) + 1;
      const correct = isCorrectArenaAnswer(question, body);
      const scoreAwarded = correct ? calculateScore(elapsedMs, attempts - 1) : 0;
      const cooldownUntil = correct ? null : new Date(Date.now() + 15_000).toISOString();
      const selectedIndex = typeof body.selectedIndex === "number" ? body.selectedIndex : null;
      const submittedFreeResponse = selectedIndex === null ? String(body.freeResponse ?? body.answer ?? "") : "";
      upsertAnswer.run(
        randomUUID(),
        roomId,
        userId,
        questionId,
        attempts,
        correct ? 1 : 0,
        scoreAwarded,
        elapsedMs,
        selectedIndex,
        submittedFreeResponse,
        cooldownUntil,
        new Date().toISOString()
      );
      if (correct && scoreAwarded) addPlayerScore.run(scoreAwarded, roomId, userId);
      if (!correct) addPlayerScore.run(-250, roomId, userId);

      if (correct) {
        const players = getRoomPlayers.all(roomId);
        const everyoneFinished = players.every((arenaPlayer) =>
          questionIds.every((id) => getAnswerRecord.get(roomId, arenaPlayer.user_id, id)?.correct)
        );
        if (everyoneFinished) {
          if (!room.elo_awarded) {
            const rankedPlayers = [...players].sort((a, b) => b.score - a.score);
            rankedPlayers.forEach((arenaPlayer, index) => updateUserElo.run(index === 0 ? 10 : 3, arenaPlayer.user_id));
            markRoomEloAwarded.run(roomId);
          }
          finishRoomStatement.run(roomId);
        } else {
          const slowestProgress = Math.min(
            ...players.map((arenaPlayer) =>
              questionIds.filter((id) => getAnswerRecord.get(roomId, arenaPlayer.user_id, id)?.correct).length
            )
          );
          advanceRoomStatement.run(slowestProgress, roomId);
        }
      }

      json(response, 200, { correct, attempts, scoreAwarded, waitMs: correct ? 0 : 15_000, room: publicRoom(getRoomById.get(roomId), userId) });
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
