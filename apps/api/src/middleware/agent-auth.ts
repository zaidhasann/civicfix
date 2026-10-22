import type { RequestHandler } from 'express';

import { env } from '../config/env.js';

export const requireAgentSecret: RequestHandler = (request, response, next) => {
  const secret = request.header('X-Agent-Secret');
  if (!secret || secret !== env.AGENT_SHARED_SECRET) {
    response.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
};
