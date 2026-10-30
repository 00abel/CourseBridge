# CourseBridge

**Keep all your Canvas assignments in Notion without copying them by hand.**

CourseBridge brings assignments from all your Canvas courses into one Notion database. That way, you can see what’s due without jumping between classes.

**[Open CourseBridge](https://canvas-to-notion-sync.vercel.app)**

> **One thing to know:** Syncing is manual for now. Just click **Sync now** when you want to refresh your assignments. I’m planning to add automatic syncing later.

---

## Why I built it

Every professor sets up Canvas a little differently. Some put assignments in modules, others post them on the course home page, and some don’t include due dates. When you have several classes, it’s easy to miss something.

That’s why I built CourseBridge. I wanted one place to see my assignments without having to check every class or copy everything into Notion myself. Now I can bring them all together and update them whenever I need to.

**Who it’s for:** Students who use Notion to keep track of schoolwork.

**What it doesn’t do:** CourseBridge won’t submit assignments or change anything in Canvas. It reads your assignments and adds them to the Notion database you choose.

---

## Getting started

### 1. Create your CourseBridge account

Go to the [CourseBridge website](https://canvas-to-notion-sync.vercel.app) and create an account.

### 2. Connect Canvas

First, you’ll need to let CourseBridge see your Canvas assignments.

The easiest way is to click **Connect with Canvas** and follow the steps on screen.

If you don’t see that button, your school hasn’t set it up yet. Use a **Canvas access token** instead. Think of it as a private code that lets CourseBridge read your Canvas information.

1. Sign in to your school's Canvas website.
2. Open **Account → Settings**.
3. Look for **New Access Token** (some schools disable this option).
4. Create a token and copy it.
5. In CourseBridge, paste your school's Canvas address into **Canvas URL** (for example, `https://canvas.uw.edu`) and the token into **Access token**.

**Keep your token private.** Treat it like a password, and don’t share it in screenshots or public posts.

### 3. Connect Notion

Next, set up the place your assignments will go. A **Notion database** is a collection you can view as a table, list, or calendar.

1. **Create an integration.** Go to [notion.so/my-integrations](https://www.notion.so/my-integrations), create a new integration, and copy its token. This token lets CourseBridge write to Notion.
2. **Create your database.** Make a new database in Notion and add the columns listed in [Columns your database needs](#columns-your-database-needs). The names must match exactly.
3. **Share the database.** Open the database, click **•••** in the top right, then **Connections**, and add your integration. Without this step, CourseBridge can’t see the database.
4. **Copy the Database ID.** Look at the database’s web address. The Database ID is the 32 characters after the last slash and before any `?`.
5. **Paste both into CourseBridge.** On the Settings page, enter the token under **Integration token** and the ID under **Database ID**.

### 4. Sync your assignments

Click **Sync now**. CourseBridge will pull assignments from your active Canvas courses and add them to your chosen Notion database.

When you sync again, CourseBridge checks each assignment’s unique Canvas ID. If the assignment is already in Notion, it updates that page. If it’s new, it adds a new page. This keeps repeat syncs from creating duplicates.

### 5. Check your Notion database

Open your Notion database to see your assignments, their due dates, and which class each one belongs to. You’ll also find links back to the original assignments in Canvas.

**Just remember:** If something changes in Canvas, you’ll need to sync again to see it in Notion.

---

## Columns your database needs

Add these columns to your Notion database before your first sync. Each name must match exactly, including capital letters. **Name**, **Course**, **Status**, and **Canvas ID** are required. CourseBridge checks for them when you save your Notion details and tells you if one is missing.

| Column | Notion type | What goes in it |
|---|---|---|
|---|---|
| Name | Title | The assignment's title |
| Course | Select | The Canvas class it belongs to |
| Due Date | Date | When the assignment is due, if a date is provided |
| Status | Select | Not Started, Submitted, or Overdue |
| Assignment Type | Select | Assignment, Quiz, Discussion, or Other |
| Points | Number | How many points the assignment is worth |
| Canvas URL | URL | A link that opens the original assignment in Canvas |
| Description | Text | The assignment instructions as plain text, up to 2,000 characters |
| Canvas ID | Text | A behind-the-scenes identifier used to match assignments during a sync |
| Last Synced | Date | When CourseBridge last updated the assignment |

---

## Privacy and access

CourseBridge talks to Canvas and Notion through their **APIs**. An API is a way for two apps to share information. CourseBridge uses it to read your Canvas assignments and add pages to your Notion database. Here’s how your connection details are handled:

- **Encrypted tokens:** Canvas and Notion tokens are encrypted before they’re saved.
- **Tokens stay on the server:** Saved tokens aren’t sent back to your browser.
- **You can disconnect Canvas:** If you used **Connect with Canvas**, clicking **Disconnect** in CourseBridge also cancels the app’s access on Canvas’s side. If you used a personal access token, delete it in your Canvas settings.
- **Canvas stays unchanged:** CourseBridge reads assignment details but doesn’t edit your courses or assignments.

---

## Common questions

**Do I have to sync every day?**  
You only need to sync when you want to see the latest changes. Automatic syncing isn’t available yet.

**Will syncing again create duplicates?**  
No. CourseBridge uses each assignment’s Canvas ID to find the existing Notion page and update it.

**Why does Settings say my Notion database wasn’t found?**  
Check two things. First, make sure you shared the database with your integration through **Connections**. Second, make sure you copied the Database ID, not the ID of the page it sits on.

**Why does Settings say a column is missing?**  
A column name doesn’t match. Compare your database to [Columns your database needs](#columns-your-database-needs). Names are case-sensitive.

**Where can I see whether a sync worked?**  
You can check your sync history on the CourseBridge dashboard. The created and updated counts aren’t always accurate yet, so I’ve documented that in [the design notes](docs/DESIGN.md#what-still-needs-work).

---

## For developers

For a closer look at my design choices, trade-offs, and known limitations, see [docs/DESIGN.md](docs/DESIGN.md).

### How syncing works

The hardest part was making repeat syncs safe. Without a check, every sync would create a second copy of every assignment. So before adding a page, CourseBridge checks each assignment’s unique Canvas ID and updates the existing page instead.

Here’s what happens during a sync:

1. **Get assignments.** Fetch assignments from each active Canvas course. If Canvas splits the results across multiple pages, fetch those too.
2. **Organize the data.** Put the assignments into a consistent format with fields like title, class, due date, status, and link.
3. **Look for a match.** Check the `SyncMap` table to see if the Canvas assignment already has a Notion page.
4. **Double-check Notion.** If the mapping is missing, search Notion using the same Canvas ID. That way, an assignment won’t be duplicated just because the local mapping was lost.
5. **Add or update.** Create a page for a new assignment, or update the page that’s already there.
6. **Save the results.** Record which pages were created, updated, or failed. There’s a known issue with the counts in the sync log, which I explain in the design notes.

Notion limits how many API requests an app can make at once, so CourseBridge sends no more than **three Notion requests at a time**.

### Tech stack

| Part | Technology | Why it's used |
|---|---|---|
| Frontend | React, Vite, React Router | User interface and page navigation |
| Backend | Node.js, Express | Connection and sync endpoints |
| Database | SQLite with Prisma | Store application data and Canvas-to-Notion page mappings |
| Authentication | JWT, bcrypt | User sessions and password hashing |
| Integrations | Canvas LMS REST API (OAuth2 or personal token), Notion API | Read assignments and create or update Notion pages |
| Token security | AES-256-GCM | Encrypt stored access tokens |
| Hosting | Vercel (frontend), Railway (backend) | Deploy the website and server |

### Running it locally

To run CourseBridge on your computer, you’ll need **Node.js 18 or newer**, a Canvas account, and a Notion integration. See [docs/CANVAS_OAUTH.md](docs/CANVAS_OAUTH.md) if you need help setting up Canvas access.

**Terminal 1: start the backend**

```bash
git clone https://github.com/00abel/coursebridge.git
cd coursebridge/server

npm install
cp .env.example .env
# Update .env with DATABASE_URL, JWT_SECRET, TOKEN_ENCRYPTION_KEY, FRONTEND_URL

npm run db:push
npm run dev
```

The backend starts on port **3001**.

**Terminal 2: start the frontend**

From the `coursebridge` project directory:

```bash
cd client
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). You don’t need `VITE_API_URL` locally. The Vite dev server forwards `/api` requests to the backend on port 3001.

For testing the **Connect with Canvas** flow without a Canvas developer key, the repository provides a mock Canvas server (`npm run mock:canvas`). See [docs/CANVAS_OAUTH.md](docs/CANVAS_OAUTH.md) for how to run and configure it.

### Environment variables

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | SQLite database address. For local development, use `file:./dev.db` |
| `JWT_SECRET` | Random 32-byte hex string used to sign authentication tokens |
| `TOKEN_ENCRYPTION_KEY` | 64 hexadecimal characters for encrypting saved tokens. Use a different value from `JWT_SECRET` |
| `FRONTEND_URL` | Frontend address for CORS and the OAuth redirect |
| `VITE_API_URL` | Backend address used by the frontend in production. Not needed locally |
| `CANVAS_*` | Optional Canvas OAuth settings. See [docs/CANVAS_OAUTH.md](docs/CANVAS_OAUTH.md) |

### Project structure

```
coursebridge/
├── docs/
│   ├── DESIGN.md                # Design decisions and trade-offs
│   └── CANVAS_OAUTH.md          # Canvas OAuth setup and testing
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
│       │   ├── syncEngine.js    # Runs the sync and prevents duplicates
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

### Deployment

The backend is hosted on Railway and uses this startup command:

```bash
npx prisma db push --schema=src/db/schema.prisma && node src/index.js
```

The frontend is hosted on Vercel, with `VITE_API_URL` pointing to the Railway backend.

---

## What’s next

- [x] Support Canvas OAuth so users don't always need to paste an access token
- [ ] Sync automatically on a schedule
- [ ] Fix the created-versus-updated counts in the sync log ([known limitation](docs/DESIGN.md#what-still-needs-work))
- [ ] Mark assignments removed from Canvas instead of leaving them in Notion
- [ ] Tag assignments by priority based on their due dates
- [ ] Add charts and statistics to the dashboard
