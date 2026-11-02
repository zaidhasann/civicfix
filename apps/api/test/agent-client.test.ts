import { afterEach, describe, expect, it, vi } from 'vitest';

import { AgentClient, AgentClientError } from '../src/services/agent-client.js';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.useRealTimers();
});

describe('AgentClient', () => {
  it('starts a run with agent coordinate and description shapes', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ run_id: 'run-1' }), { status: 200 }),
    );
    const client = new AgentClient('http://agent.test', 1000, 'secret');

    await expect(
      client.startRun({
        photoUrl: 'https://example.com/photo.jpg',
        lat: 18.52,
        lng: 73.85,
      }),
    ).resolves.toBe('run-1');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://agent.test/run',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'X-Agent-Secret': 'secret' }),
      }),
    );
  });

  it('returns a typed run response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ run_id: 'run-1', status: 'needs_input', state: {} }), {
        status: 200,
      }),
    );
    await expect(new AgentClient('http://agent.test').getRun('run-1')).resolves.toMatchObject({
      status: 'needs_input',
    });
  });

  it('surfaces unauthorized and server errors', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ detail: 'Unauthorized' }), { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ detail: 'Unavailable' }), { status: 503 }));
    const client = new AgentClient('http://agent.test');

    await expect(client.getRun('one')).rejects.toMatchObject<Partial<AgentClientError>>({
      status: 401,
      message: 'Unauthorized',
    });
    await expect(client.getRun('two')).rejects.toMatchObject<Partial<AgentClientError>>({
      status: 503,
      message: 'Unavailable',
    });
  });

  it('reports request timeouts', async () => {
    globalThis.fetch = vi.fn().mockImplementation(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
        }),
    );
    const client = new AgentClient('http://agent.test', 10);

    await expect(client.getRun('timeout')).rejects.toMatchObject({
      message: 'Agent request timed out',
    });
  });
});
