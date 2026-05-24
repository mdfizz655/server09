# DriveFleet Server

## Local Setup

```bash
npm install
# .env ফাইলে MongoDB credentials দাও
npm run dev   # localhost:8000
```

## Environment Variables

| Key | Value |
|-----|-------|
| DB_USER | MongoDB Atlas username |
| DB_PASS | MongoDB Atlas password |
| ACCESS_TOKEN_SECRET | random secret string |
| PORT | 8000 |
| NODE_ENV | production (on Render) |

## Deploy to Render
- Build command: `npm install`
- Start command: `npm start`
- Add all env vars in Render → Environment tab
