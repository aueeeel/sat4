import { spawn } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

const port = 4313;
const dataDir = join(process.cwd(), `.arena-smoke-${Date.now()}`);
const server = spawn(process.execPath, ["server.mjs"], {
  cwd: process.cwd(),
  env: { ...process.env, PORT: String(port), DATA_DIR: dataDir, DATABASE_URL: "" },
  stdio: ["ignore", "pipe", "pipe"],
});

const baseUrl = `http://127.0.0.1:${port}`;
const waitForServer = () => new Promise((resolve, reject) => {
  const timeout = setTimeout(() => reject(new Error("Arena test server did not start.")), 8000);
  server.once("exit", (code) => reject(new Error(`Arena test server exited with ${code}.`)));
  server.stdout.on("data", (chunk) => {
    if (String(chunk).includes("API running")) {
      clearTimeout(timeout);
      resolve();
    }
  });
});

const request = async (path, options) => {
  const response = await fetch(`${baseUrl}${path}`, options);
  const payload = await response.json();
  if (!response.ok) throw new Error(`${response.status}: ${JSON.stringify(payload)}`);
  return payload;
};

const post = (path, body) => request(path, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

try {
  await waitForServer();
  const created = await post("/api/arena/create", {
    userId: "smoke-host",
    nickname: "Host",
    password: "testpass",
    maxPlayers: 2,
    sections: ["Math"],
    domains: ["Algebra"],
    skills: ["Circle equations"],
    questionCount: 3,
  });
  const joined = await post("/api/arena/join", {
    userId: "smoke-guest",
    nickname: "Guest",
    code: created.room.code,
    password: "testpass",
  });
  const started = await post("/api/arena/start", { roomId: created.room.id, userId: "smoke-host" });
  const bank = JSON.parse(readFileSync(join(process.cwd(), "src/data/question-bank.json"), "utf8"));
  const questionsById = new Map(bank.map((question) => [question.id, question]));

  for (const userId of ["smoke-host", "smoke-guest"]) {
    for (let index = 0; index < 3; index += 1) {
      const state = await request(`/api/arena/room?roomId=${created.room.id}&userId=${userId}`);
      const currentQuestion = state.room.currentQuestion;
      if (!currentQuestion) throw new Error(`${userId} has no question at step ${index + 1}.`);
      const source = questionsById.get(currentQuestion.id);
      const selectedIndex = source.choices.indexOf(source.correct_answer);
      await post("/api/arena/answer", {
        roomId: created.room.id,
        userId,
        questionId: currentQuestion.id,
        elapsedMs: 900,
        ...(selectedIndex >= 0 ? { selectedIndex } : { freeResponse: source.correct_answer }),
      });
    }
  }

  const final = await request(`/api/arena/room?roomId=${created.room.id}&userId=smoke-host`);
  const result = {
    createdPlayers: created.room.players.length,
    joinedPlayers: joined.room.players.length,
    startStatus: started.room.status,
    firstQuestion: `${started.room.currentQuestion.domain} / ${started.room.currentQuestion.skill}`,
    finalStatus: final.room.status,
    progress: final.room.players.map((player) => player.progress),
    reviewCount: final.room.review.length,
    winner: final.room.winner?.nickname,
  };
  if (result.joinedPlayers !== 2 || result.finalStatus !== "finished" || result.progress.some((value) => value !== 3) || result.reviewCount !== 3) {
    throw new Error(`Unexpected multiplayer result: ${JSON.stringify(result)}`);
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} finally {
  server.kill("SIGTERM");
  await new Promise((resolve) => server.once("exit", resolve));
  if (dataDir.startsWith(join(process.cwd(), ".arena-smoke-"))) rmSync(dataDir, { recursive: true, force: true });
}
