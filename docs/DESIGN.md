# CourseBridge design and setup

CourseBridge reads assignments from Canvas and writes their properties to Notion. The frontend is a React app built with Vite. The backend is an Express server with Prisma and SQLite.

## Run locally

Use Node 22.12 or newer. Run these commands from the project folder.

```sh
cd server
npm ci
cp .env.example .env
```

Set the values in `server/.env` before starting the server:

| Variable | Purpose |
| --- | --- |
| DATABASE_URL | SQLite file location. Relative paths are resolved from `server/src/db`. |
| JWT_SECRET | At least 32 random characters for session signing. |
| TOKEN_ENCRYPTION_KEY | 64 hex characters for credential encryption. Keep this key across restarts and deployments. |
| CANVAS_ALLOWED_HOSTS | Exact school hostnames, separated by commas. Example: `school.instructure.com,canvas.school.edu`. Do not include schemes, paths, or wildcard entries. Only list trusted Canvas servers. |
| FRONTEND_URL | Allowed frontend origin, including its scheme and port. |
| PORT | Backend port, normally 3001. |
| NODE_ENV | `development` locally and `production` on the server. |
| TRUST_PROXY | Optional trusted proxy IP addresses or subnets, separated by commas. Leave empty when the backend is reached directly. |

Generate the two secrets separately:

```sh
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Then create a new local database and start the backend:

```sh
npm run db:generate
npm run db:push
npm run dev
```

In another terminal, from the project folder:

```sh
cd client
npm ci
npm run dev
```

Vite proxies `/api` requests to port 3001 during development. For a separately hosted backend, set `VITE_API_URL` before building the frontend. `client/.env.example` shows the format. Never put tokens or server secrets in Vite variables.

Local HTTP Canvas test servers are accepted only on loopback addresses outside production. Real school connections require HTTPS and an entry in `CANVAS_ALLOWED_HOSTS`. Redirects and pagination links outside the original Canvas origin are rejected.

## Check the project

From `server`, run:

```sh
npm run db:generate
npm test
npm audit
```

From `client`, run:

```sh
npm run build
npm audit
```

The tests use temporary SQLite files, local HTTP fixtures, and mocked Notion responses. They cover login, session checks, settings, disconnecting, database validation, pagination, submission status, sync recovery, destination changes, pacing, retries, and encryption. They do not prove that a real school token or Notion workspace is connected correctly.

## Main code paths

### Account access

`routes/auth.js` handles registration, login, and the current account. Email addresses are trimmed and stored in lowercase. Passwords are hashed with bcrypt at cost 12. Registration requires at least eight characters and rejects passwords over bcrypt’s 72 byte limit. Sessions are signed JWTs that expire after seven days. `services/auth.js` checks the bearer token before protected routes run.

The browser stores the session token in local storage. Logging out removes that copy. There is no server session table or token revocation endpoint, so an already copied session token remains valid until it expires. There is no password reset or email verification flow.

Login and registration share a limit of 30 requests per IP in 15 minutes. This limit is kept in one process. Configure trusted proxy addresses for the actual hosting network so that unrelated users are not counted as one proxy IP. Do not trust arbitrary forwarded headers.

### Saved connections

`routes/config.js` verifies Canvas access and the ten required Notion properties before saving. Existing tokens can be kept by leaving their fields blank. Changing the Canvas URL requires entering a token again so an old token is not sent to another school by mistake. Database IDs are normalized before saving.

`services/crypto.js` encrypts new tokens with AES 256 GCM and a random IV. The key comes from the environment, separately from the database. Legacy plaintext values are still readable and are encrypted when settings are saved. The API returns connection flags and IDs, not saved tokens.

Disconnecting clears the saved Canvas fields. It does not revoke the token in Canvas or cancel a sync that already started.

### Reading Canvas

`services/canvasService.js` follows course and assignment pagination. Each request has a 15 second timeout and a 5 MB response limit. It requests the current user’s submission with each assignment instead of using the assignment-wide `has_submitted_submissions` flag.

A Canvas request failure stops collection before any Notion writes start. This includes courses that return 401 or 403. The route receives a short error without Axios request headers or token details.

Descriptions are converted to plain text with basic tag and entity handling and limited to 2,000 characters. This is not a full HTML renderer. Modules, course pages, and calendar events are not scanned.

### Writing Notion

`services/syncEngine.js` loads the connections, fetches assignments, and processes up to three assignments at once. The mapping records the Canvas school and Notion database as well as the page ID. A mapping from another school or destination is not reused.

When a mapping is missing or belongs to another destination, `services/notionService.js` searches by Canvas ID and the school prefix in Canvas URL. A repeat sync can recover a page if its Notion write succeeded but saving the local mapping failed. Existing duplicate pages are not merged. Avoid editing Canvas ID and Canvas URL manually because recovery relies on them.

Before updating a page, the app checks that it still belongs to the selected database and is not archived. Moved, deleted, or inaccessible pages fail instead of being silently recreated. Managed properties are replaced, including empty dates and descriptions. Page body notes are left alone. Titles are limited to 2,000 characters. Course select names replace commas with slashes and are limited to 100 characters.

The SDK is kept on the `2022-06-28` database API. Use a destination database with one data source. Supporting the newer data source API is separate work. Database verification can reject configurations that the older API cannot read.

`services/requestPacer.js` spaces request starts by 350 milliseconds in this process. Explicit 429 responses are retried at most twice. Numeric Retry-After values over ten seconds, negative values, and invalid values are returned as failures. Other errors are not retried automatically because a timed out write might already have created a page. A 45 second abort signal prevents queued requests from writing after the SDK’s 60 second timeout.

### Counts and history

Created and updated counts come from completed Notion writes followed by successful mapping saves. An error in either step counts as a failed assignment. The dashboard shows the current school and destination’s saved mapping count as assignments tracked. This is not a live Notion page count.

Only one mapping per user and Canvas ID is retained. After switching destinations or schools, a sync searches the selected database and replaces those mappings. Totals settle as the new sync completes. Sync history lists runs across connections, while the latest result and totals are filtered to the current connection. Older logs without connection fields still appear in history.

## Deployment and existing data

The frontend needs static hosting with a fallback to `index.html` for React routes. The backend needs a running Node process and persistent storage for SQLite. A static frontend deployment alone does not host the Express server or preserve the database.

Before deploying, set production secrets, the frontend origin, approved Canvas hostnames, and an absolute SQLite path on a persistent disk. Review proxy settings for the host. Keep the encryption key and database backups private.

The schema adds nullable `canvasBaseUrl` on SyncMap and nullable `canvasBaseUrl` and `notionDbId` on SyncLog. Existing mappings are checked against Notion again when the school field is missing. This version also omits retired credential fields that may exist in older schemas.

Back up an existing database and compare its schema before using `db:push`. Do not accept a data loss prompt without reviewing the affected fields. No existing database was changed as part of this review. Existing mixed case account emails also need review before importing into the normalized email flow.

The sync lock, request pacing, and login limit are process local. Run one backend process with SQLite. Multiple replicas need shared locking and rate limiting before they are supported.

Before calling a deployment ready, test real account access, saving both connections, first sync, repeat sync, an assignment change, a destination change, an upstream failure, and disconnecting. The automated tests do not replace that check.

## API references

- [Canvas assignments and submission includes](https://developerdocs.instructure.com/services/canvas/resources/assignments)
- [Notion database filters for the older API](https://developers.notion.com/reference/post-database-query-filter)
- [Notion request limits](https://developers.notion.com/reference/request-limits)
