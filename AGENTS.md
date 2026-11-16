# Agent Instructions
# MeetMind Project Rules
- Monorepo: `/backend` (Node.js, Express, TypeScript, Drizzle ORM, Neon Serverless Postgres) and `/frontend` (React, Vite, TypeScript, Refine Core, Tailwind CSS, shadcn/ui).
- Always use `@neondatabase/serverless` with `drizzle-orm/neon-http` for database access.
- Validate all Express API inputs with Zod.
- Use Refine Core headless hooks (`useTable`, `useForm`, `useList`) paired with `shadcn/ui` components.
- Keep production files (`Dockerfile`, `docker-compose.yml`, `workers/`) untouched until core development features work.
