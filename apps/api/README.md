# CivicFix API

Express API service for CivicFix.

Copy `.env.example` to `.env` and provide the required environment values.

```bash
npm run dev --workspace apps/api
```

The health check is available at `GET /health`.

## Authentication

- `POST /auth/register` creates a citizen account.
- `POST /auth/login` returns a short-lived access token and sets an httpOnly refresh cookie.
- `POST /auth/refresh` rotates the refresh cookie and returns a new access token.

Set `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` to different random values of at least 32 characters.
