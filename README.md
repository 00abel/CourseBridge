# CourseBridge

Sync Canvas assignments into Notion.

CourseBridge pulls your assignments out of Canvas and writes them into a Notion database, all in the same format, so every class shows up in one place.

Live app: [canvas-to-notion-sync.vercel.app](https://canvas-to-notion-sync.vercel.app)

---

## Why I built it

Every professor sets up Canvas differently. One puts assignments inside modules, another posts them on the front page, and a third never sets due dates. Once you're taking four or five classes, keeping track of what's due gets hard.

Notion is the opposite. It's clean and you can filter and sort it however you want. So I made Canvas the source of truth and Notion the place where you actually look at your work. CourseBridge sits in the middle and moves the data over.

---

## What it does

- Connects to Canvas through "Connect with Canvas" (OAuth2), or with a personal access token if your school allows those
- Encrypts the Canvas and Notion tokens it stores (AES-256-GCM)
- Grabs every assignment from every active course
- Writes them into a Notion database with the same columns every time
- Updates existing pages when you sync again instead of making duplicates
- Supports multiple users, each with their own accounts and data

---

## Screens

| Screen | What you do there |
|---|---|
| Login / register | Make an account |
| Settings | Connect Canvas and add your Notion integration |
| Dashboard | Run a sync and see past runs |
| Notion | See all your assignments by course, due date, status and type |

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React, Vite, React Router |
| Backend | Node.js, Express |
| Database | SQLite with Prisma |
| Auth | JWT, bcrypt for passwords |
| APIs | Canvas LMS REST API, Notion API |
| Hosting | Vercel (frontend), Railway (backend) |

---

## How a sync works

1. Fetch every assignment from every course you're enrolled in.
2. Clean each one up into the same shape: title, course, due date, status, type, points and link.
3. Look up the Canvas ID in the `SyncMap` table to see if it already has a Notion page.
4. Create a Notion page for new assignments and update the ones that already exist.
5. Log the run with how many pages were created, updated or failed.

You can sync as many times as you want. `SyncMap` remembers every assignment that's been written to Notion, so nothing gets added twice.

---

## Notion database columns

| Column | Type | What's in it |
|---|---|---|
| Name | Title | Assignment title |
| Course | Select | Course name |
| Due Date | Date | Due date from Canvas |
| Status | Select | Not Started / Submitted / Overdue |
| Assignment Type | Select | Assignment / Quiz / Discussion / Other |
| Points | Number | Points possible |
| Canvas ID | Text | Used to avoid duplicates |
| Canvas URL | URL | Link back to the assignment in Canvas |
| Description | Text | Assignment description, with the HTML stripped out |
| Last Synced | Date | When it was last updated |

---

## Running it locally

You'll need Node.js 18 or newer, a Canvas account with API access, and a Notion account with an integration.

```bash
git clone https://github.com/00abel/canvas-to-notion-sync.git
cd canvas-to-notion-sync

# Install dependencies
cd server && npm install
cd ../client && npm install

# Set up your environment file
cd ../server
cp .env.example .env
# Then open .env and fill in DATABASE_URL, JWT_SECRET, TOKEN_ENCRYPTION_KEY and FRONTEND_URL

# Create the database
npm run db:push

# Start the backend on port 3001
npm run dev

# In a second terminal, start the frontend on port 5173
cd ../client && npm run dev
```

Then open [http://localhost:5173](http://localhost:5173).

To try "Connect with Canvas" without a real Canvas developer key, run the mock Canvas server with `npm run mock:canvas`. [docs/CANVAS_OAUTH.md](docs/CANVAS_OAUTH.md) explains the setup.

### Environment variables

| Variable | What it's for |
|---|---|
| `DATABASE_URL` | `file:./dev.db` for local SQLite |
| `JWT_SECRET` | A random 32 byte hex string for signing logins |
| `TOKEN_ENCRYPTION_KEY` | 64 hex characters for encrypting saved tokens. Use a different value from `JWT_SECRET` |
| `FRONTEND_URL` | The frontend's URL, used for CORS |
| `VITE_API_URL` | The backend's URL (frontend only) |
| `CANVAS_*` | Optional OAuth settings, covered in [docs/CANVAS_OAUTH.md](docs/CANVAS_OAUTH.md) |

---

## Project structure

```
canvas-to-notion-sync/
├── docs/
│   └── CANVAS_OAUTH.md          # How Canvas OAuth is set up and tested
├── server/
│   ├── scripts/
│   │   └── mockCanvas.js        # Fake Canvas for testing OAuth locally
│   └── src/
│       ├── routes/
│       │   ├── auth.js          # Register and login
│       │   ├── config.js        # Save Canvas and Notion settings
│       │   ├── canvasOAuth.js   # Connect with Canvas endpoints
│       │   └── sync.js          # Run a sync, view logs
│       ├── services/
│       │   ├── canvasService.js # Canvas API calls and cleanup
│       │   ├── canvasOAuth.js   # OAuth login, refresh and revoke
│       │   ├── crypto.js        # Token encryption
│       │   ├── notionService.js # Notion API reads and writes
│       │   ├── syncEngine.js    # Runs the sync and handles duplicates
│       │   └── auth.js          # JWT and bcrypt helpers
│       └── db/
│           ├── schema.prisma    # Database schema
│           └── db.js            # Prisma client
└── client/
    └── src/
        ├── pages/
        │   ├── AuthPage.jsx     # Login and register
        │   ├── Dashboard.jsx    # Sync button and history
        │   └── ConfigPage.jsx   # Account setup
        ├── hooks/
        │   └── useAuth.jsx      # Auth context
        └── lib/
            └── api.js           # API client
```

---

## Deployment

The backend runs on Railway with this start command:

```
npx prisma db push --schema=src/db/schema.prisma && node src/index.js
```

The frontend runs on Vercel, with `VITE_API_URL` set to the Railway backend.

---

## What's next

- [ ] Sync automatically on a schedule with `node-cron`
- [ ] Tag assignments by priority based on how soon they're due
- [ ] Highlight overdue assignments
- [x] Let people connect Canvas with OAuth instead of making a token by hand
- [ ] Add charts and stats to the dashboard
