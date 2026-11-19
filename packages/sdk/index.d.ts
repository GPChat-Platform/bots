export const DEFAULT_BASE_URL: string;

export class GPChatError extends Error {
  status?: number;
  code?: string;
  details?: unknown;
}

export interface Button { text: string; callbackData?: string; url?: string }
export const button: {
  callback(text: string, callbackData: string): Button;
  link(text: string, url: string): Button;
};

export interface SendOptions { markdown?: boolean; buttons?: Button[][]; replyToMsgId?: string; mentionedUserIds?: string[] }
export type Target = string | { to: string } | { groupId: string };

export interface Update<T = Record<string, unknown>> {
  id: string;
  type: 'message.received' | 'group_message.received' | 'callback.received' | string;
  data: T;
  createdAt?: number;
}

export interface GPChatBotOptions {
  apiKey: string;
  baseUrl?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
  maxRetries?: number;
}

export class GPChatBot {
  constructor(options: GPChatBotOptions);
  request<T = unknown>(method: string, path: string, opts?: { body?: unknown; query?: Record<string, unknown>; timeoutMs?: number }): Promise<T>;
  sendMessage(to: string, content: string, options?: SendOptions): Promise<{ msgId: string }>;
  sendGroupMessage(groupId: string, content: string, options?: SendOptions): Promise<{ msgId: string }>;
  send(body: Record<string, unknown>): Promise<{ msgId: string }>;
  editMessage(target: Target, msgId: string, patch: { content?: string; caption?: string; buttons?: Button[][] | null }): Promise<unknown>;
  deleteMessage(target: Target, msgId: string): Promise<unknown>;
  sendChatAction(to: string, action?: 'typing' | 'recording', seconds?: number): Promise<unknown>;
  getUpdates(params?: { ack?: string[]; limit?: number; timeout?: number }): Promise<{ updates: Update[]; hasMore: boolean; acknowledged?: number }>;
  poll(handler: (update: Update) => Promise<void> | void, options?: { timeout?: number; limit?: number; idleDelayMs?: number; onError?: (e: Error) => void }): () => void;
}

export function verifyWebhookSignature(
  rawBody: string | Buffer,
  header: string | undefined,
  secret: string | string[],
  options?: { toleranceSeconds?: number; now?: number },
): boolean;

export function webhookMiddleware(secret: string | string[], options?: { toleranceSeconds?: number }): (req: any, res: any, next: () => void) => void;
