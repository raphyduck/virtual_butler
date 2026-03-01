export interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string; // ISO string
}

export interface ChatSession {
  id: string;
  createdAt: string; // ISO string
  updatedAt: string; // ISO string
  messages: Message[];
}
