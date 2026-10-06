import type { UserRole } from '../models/user.js';

declare global {
  namespace Express {
    interface Request {
      user?:
        | {
            id: string;
            kind: 'user';
            role: UserRole;
          }
        | {
            id: string;
            kind: 'anonymous';
            role: 'anonymous';
            scopes: string[];
          };
    }
  }
}

export {};
