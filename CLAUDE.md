# Kayan Sweets Backend — Coding Standards

These rules are NON-NEGOTIABLE. Every task Claude Code performs MUST comply.
If a standard conflicts with a task request, flag it — do not silently violate.

## Repo Hygiene
1. This is the BACKEND repo. Frontend lives separately at kayan-frontend.
   Do not create frontend code here under any circumstance.
2. Workspace .md files (CrossFix, DeploymentFix, SCRATCH, TempNotes, *Fix, *Notes)
   are gitignored. Do not commit them. CLAUDE.md, README.md, PROJECT_LOG.md ARE
   committed.
3. .cursor/ is gitignored. Do not commit it.

## TypeScript
4. strict mode is on. 'any' is forbidden — use 'unknown' and narrow, or define
   proper types. The ESLint rule blocks 'any' at build time.
5. Every interface lives in ITS OWN FILE under src/interfaces/<module>/<Name>.ts.
   Never group unrelated interfaces in a single file. Use barrel exports (index.ts)
   for import convenience.
6. Return types on exported functions are required.

## Environment & Constants
7. process.env is accessed ONLY in src/config/env.ts. Everywhere else imports from
   '@/config/env'. Never read process.env directly in feature code.
8. Magic strings and magic numbers are forbidden. Every constant lives in
   src/constants/<domain>.ts. HTTP statuses, error codes, error messages, business
   rule values all live in constants.
9. Error messages live in src/constants/errors.ts, keyed by ERROR_CODES. Both English
   and Arabic messages must be provided for every error code.

## API Design
10. Every HTTP response uses the ApiResponse<T> wrapper from src/lib/apiResponse.ts.
    No endpoint ever returns raw data or a custom shape.
11. HTTP status codes come from HTTP_STATUS constants. Never hardcode numbers.
    Follow REST conventions: 201 for creates, 200 for reads/updates, 204 for deletes,
    400 for validation, 401 for auth, 403 for permission, 404 for missing, 409 for
    conflict, 422 for business rule violation, 500 for server errors.
12. REST routes are plural nouns: /customers, /visits, /rewards, /branches, /admin/*.
    Actions that aren't CRUD use RPC-style sub-routes: POST /visits/scan,
    POST /rewards/:id/redeem.
13. Validation uses zod on every request (body, params, query). The validation
    middleware returns a consistent apiError on failure. Do not use Joi, Yup,
    express-validator, or hand-rolled validators.

## Database
14. Database transactions are mandatory for any operation that writes to more than
    one table, or that has an invariant across reads and writes (e.g., stamp increment
    + visit insert must be atomic). Use Supabase RPC functions for multi-statement
    transactions.
15. RLS policies are enabled on every table. Service role key is used only in Edge
    Functions and server-side code — never exposed to the client.

## Logging
16. console.log / console.error / console.warn are FORBIDDEN in production code.
    Use the logger from src/lib/logger.ts. ESLint blocks console.* at build.
17. Never log secrets, tokens, phone numbers in full, or PII. Mask phone numbers
    as +9665XXXXX123 (last 3 digits only).

## Workflow
18. At the start of every task, READ PROJECT_LOG.md to understand prior work.
19. At the end of every task, UPDATE PROJECT_LOG.md with a new entry documenting:
    what was built, decisions made, files changed, open questions.
20. If you encounter a situation where complying with these standards would require
    rework of existing code, STOP and raise it with the human before proceeding.
