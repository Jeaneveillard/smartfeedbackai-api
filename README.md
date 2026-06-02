# SmartFeedbackAI API

Node.js/Express REST API for SmartFeedbackAI.

## Local development

1. Copy `.env.example` to `.env` and fill in values
2. Create PostgreSQL databases: `createdb smartfeedbackai && createdb smartfeedbackai_test`
3. Run migrations: `npm run migrate && npm run migrate:test`
4. Start dev server: `npm run dev`

## Tests

Requires PostgreSQL. Run: `npm test`

## Deploy to Railway

1. Push to GitHub
2. Connect repo to Railway
3. Add PostgreSQL plugin
4. Set env vars: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_CALLBACK_URL, JWT_SECRET, FRONTEND_URL
5. Run migrations via Railway shell: `npm run migrate`
