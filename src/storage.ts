import type { AnswerRecord, UserProfile } from "./types";
import type { Question, Section } from "./types";

const SESSION_USER_KEY = "4sat.session.user";
const ANSWERS_KEY = "4sat.answers";
const DEFAULT_REMOTE_API_BASE = "https://sat4-app.onrender.com";

const getApiBaseUrl = () => {
  const configuredUrl = import.meta.env.VITE_API_BASE_URL;
  if (configuredUrl) return configuredUrl.replace(/\/$/, "");

  const hostname = window.location.hostname;
  const isLocal = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "";
  return isLocal ? "" : DEFAULT_REMOTE_API_BASE;
};

const apiUrl = (path: string) => `${getApiBaseUrl()}${path}`;

const parseJsonResponse = async <T,>(response: Response): Promise<{ error?: string } & T> => {
  const text = await response.text();
  const trimmedText = text.trim();

  if (!trimmedText) {
    return {} as { error?: string } & T;
  }

  try {
    return JSON.parse(trimmedText) as { error?: string } & T;
  } catch {
    throw new Error("Server returned an invalid response. Please try again in a moment.");
  }
};

type RegisterPayload = {
  fullName: string;
  nickname: string;
  age: number;
  gmail: string;
  password: string;
};

type LoginPayload = {
  gmail: string;
  password: string;
};

const readJson = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};

const writeJson = <T,>(key: string, value: T) => {
  localStorage.setItem(key, JSON.stringify(value));
};

const requestJson = async <T,>(path: string, payload: unknown): Promise<T> => {
  const response = await fetch(apiUrl(path), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = await parseJsonResponse<T>(response);

  if (!response.ok) {
    throw new Error(data.error || "Something went wrong.");
  }

  return data;
};

const getJson = async <T,>(path: string): Promise<T> => {
  const response = await fetch(apiUrl(path));
  const data = await parseJsonResponse<T>(response);
  if (!response.ok) throw new Error(data.error || "Something went wrong.");
  return data;
};

export type ArenaPlayer = {
  userId: string;
  nickname: string;
  score: number;
  isHost: boolean;
  answeredCurrent: boolean;
};

export type ArenaRoom = {
  id: string;
  code: string;
  isHost: boolean;
  hostUserId: string;
  maxPlayers: number;
  section: Section | "Mixed";
  sections: Section[];
  domains: string[];
  skills: string[];
  questionCount: number;
  status: "waiting" | "playing" | "finished";
  currentIndex: number;
  totalQuestions: number;
  currentQuestion: Question | null;
  review: Array<Question & {
    index: number;
    correctAnswer: string;
    selectedIndex: number | null;
    freeResponse: string;
    correct: boolean;
    attempts: number;
    scoreAwarded: number;
  }>;
  players: ArenaPlayer[];
  winner?: { userId: string; nickname: string; score: number } | null;
};

export type FriendMessage = {
  id: string;
  senderId: string;
  receiverId: string;
  body: string;
  questionId?: string | null;
  createdAt: string;
};

export type FriendRequest = {
  id: string;
  senderId: string;
  receiverId: string;
  direction: "incoming" | "outgoing";
  status: string;
  createdAt: string;
  user: UserProfile;
};

export const getStoredUser = () => readJson<UserProfile | null>(SESSION_USER_KEY, null);

export const saveStoredUser = (user: UserProfile) => writeJson(SESSION_USER_KEY, user);

export const clearStoredUser = () => localStorage.removeItem(SESSION_USER_KEY);

export const registerUser = async (payload: RegisterPayload) => {
  const data = await requestJson<{ user: UserProfile }>("/api/auth/register", payload);
  return data.user;
};

export const loginUser = async (payload: LoginPayload) => {
  const data = await requestJson<{ user: UserProfile }>("/api/auth/login", payload);
  return data.user;
};

export const getUserProfile = async (userId: string) => {
  const data = await getJson<{ user: UserProfile }>(`/api/users/me?userId=${encodeURIComponent(userId)}`);
  return data.user;
};

export const awardUserElo = async (payload: { userId: string; delta: number }) => {
  const data = await requestJson<{ user: UserProfile }>("/api/users/elo", payload);
  return data.user;
};

export const getFriends = async (userId: string) => {
  const data = await getJson<{ friends: UserProfile[] }>(`/api/friends?userId=${encodeURIComponent(userId)}`);
  return data.friends;
};

export const getFriendRequests = async (userId: string) => {
  const data = await getJson<{ requests: FriendRequest[] }>(`/api/friends/requests?userId=${encodeURIComponent(userId)}`);
  return data.requests;
};

export const searchFriend = async (userId: string, query: string) => {
  const data = await getJson<{ user: UserProfile }>(`/api/friends/search?userId=${encodeURIComponent(userId)}&q=${encodeURIComponent(query)}`);
  return data.user;
};

export const addFriend = async (payload: { userId: string; friendId: string }) => {
  return requestJson<{ status: "requested" | "accepted" | "friends"; friends: UserProfile[]; requests: FriendRequest[] }>("/api/friends/add", payload);
};

export const acceptFriendRequest = async (payload: { userId: string; requestId: string }) => {
  return requestJson<{ friends: UserProfile[]; requests: FriendRequest[] }>("/api/friends/accept", payload);
};

export const getFriendMessages = async (userId: string, friendId: string) => {
  const data = await getJson<{ messages: FriendMessage[] }>(
    `/api/friends/messages?userId=${encodeURIComponent(userId)}&friendId=${encodeURIComponent(friendId)}`
  );
  return data.messages;
};

export const sendFriendMessage = async (payload: { senderId: string; receiverId: string; body: string; questionId?: string }) => {
  const data = await requestJson<{ messages: FriendMessage[] }>("/api/friends/messages", payload);
  return data.messages;
};

export const createArenaRoom = async (payload: {
  userId: string;
  nickname: string;
  password: string;
  maxPlayers: number;
  sections: Section[];
  domains: string[];
  skills: string[];
  questionCount: number;
}) => {
  const data = await requestJson<{ room: ArenaRoom }>("/api/arena/create", payload);
  return data.room;
};

export const joinArenaRoom = async (payload: { userId: string; nickname: string; code: string; password: string }) => {
  const data = await requestJson<{ room: ArenaRoom }>("/api/arena/join", payload);
  return data.room;
};

export const configureArenaRoom = async (payload: {
  roomId: string;
  userId: string;
  maxPlayers: number;
  sections: Section[];
  domains: string[];
  skills: string[];
  questionCount: number;
}) => {
  const data = await requestJson<{ room: ArenaRoom }>("/api/arena/configure", payload);
  return data.room;
};

export const startArenaRoom = async (payload: { roomId: string; userId: string }) => {
  const data = await requestJson<{ room: ArenaRoom }>("/api/arena/start", payload);
  return data.room;
};

export const answerArenaQuestion = async (payload: {
  roomId: string;
  userId: string;
  questionId: string;
  selectedIndex?: number;
  freeResponse?: string;
  elapsedMs: number;
}) => requestJson<{ correct: boolean; attempts: number; scoreAwarded: number; waitMs?: number; room: ArenaRoom }>("/api/arena/answer", payload);

export const getArenaRoom = async (roomId: string, userId: string) => {
  const data = await getJson<{ room: ArenaRoom }>(`/api/arena/room?roomId=${encodeURIComponent(roomId)}&userId=${encodeURIComponent(userId)}`);
  return data.room;
};

export const getAnswers = (userId: string) => readJson<Record<string, AnswerRecord[]>>(ANSWERS_KEY, {})[userId] ?? [];

export const saveAnswer = (userId: string, answer: AnswerRecord) => {
  const allAnswers = readJson<Record<string, AnswerRecord[]>>(ANSWERS_KEY, {});
  const previous = allAnswers[userId] ?? [];
  const next = [...previous.filter((item) => item.questionId !== answer.questionId), answer];
  writeJson(ANSWERS_KEY, { ...allAnswers, [userId]: next });
};

export const resetAnswers = (userId: string) => {
  const allAnswers = readJson<Record<string, AnswerRecord[]>>(ANSWERS_KEY, {});
  writeJson(ANSWERS_KEY, { ...allAnswers, [userId]: [] });
};
