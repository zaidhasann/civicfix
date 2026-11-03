import { env } from '../config/env.js';

export interface StartRunInput {
  photoUrl: string;
  lat: number;
  lng: number;
  description?: string;
  reportDate?: Date;
}

interface StartRunResponse {
  run_id: string;
}

export interface AgentRunResponse {
  run_id: string;
  status: 'awaiting_approval' | 'needs_input' | 'running' | 'completed';
  state: Record<string, unknown>;
}

export class AgentClientError extends Error {
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'AgentClientError';
    this.status = status;
  }
}

export class AgentClient {
  constructor(
    private readonly baseUrl: string = env.AGENT_BASE_URL,
    private readonly timeoutMs: number = env.AGENT_REQUEST_TIMEOUT_MS,
    private readonly secret: string = env.AGENT_SHARED_SECRET,
  ) {}

  startRun(input: StartRunInput): Promise<string> {
    return this.request<StartRunResponse>('/run', {
      method: 'POST',
      body: JSON.stringify({
        photo_url: input.photoUrl,
        coords: [input.lat, input.lng],
        description: input.description ?? 'No description provided',
        ...(input.reportDate ? { report_date: input.reportDate.toISOString() } : {}),
      }),
    }).then((response) => response.run_id);
  }

  getRun(runId: string): Promise<AgentRunResponse> {
    return this.request<AgentRunResponse>(`/runs/${encodeURIComponent(runId)}`, {
      method: 'GET',
    });
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(`${this.baseUrl.replace(/\/$/, '')}${path}`, {
        ...init,
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'X-Agent-Secret': this.secret,
          ...init.headers,
        },
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const detail =
          body && typeof body === 'object' && 'detail' in body && typeof body.detail === 'string'
            ? body.detail
            : 'Agent request failed';
        throw new AgentClientError(detail, response.status);
      }
      return body as T;
    } catch (error) {
      if (error instanceof AgentClientError) throw error;
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new AgentClientError('Agent request timed out');
      }
      throw new AgentClientError(error instanceof Error ? error.message : 'Agent request failed');
    } finally {
      clearTimeout(timeout);
    }
  }
}

export const agentClient = new AgentClient();
