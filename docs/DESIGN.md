# CourseBridge Design Document

**Author:** Abel Megersa  
**Status:** Live

This document explains how I built CourseBridge, why I made certain decisions, and what I would improve next. I wrote the main explanations for anyone interested in the project, even without a programming background. The technical details are there for developers who want to dig deeper.

---

## The idea

Every professor organizes Canvas a little differently. Assignments might be in modules, on the course page, or somewhere else entirely. When you're taking several classes, keeping track of everything can be frustrating.

I built CourseBridge to bring assignments from my active Canvas courses into one Notion database. It gives students a consistent place to check their work instead of going through each class separately.

CourseBridge only reads information from Canvas. It doesn't submit assignments, change due dates, or edit anything in a course. When you sync again, it adds new assignments and updates existing ones instead of creating duplicate pages.

One important part of making this available to students is the Canvas connection. The easier **Connect with Canvas** option requires a school administrator to register the app. Until that is set up, students can connect using a personal Canvas access token.

## What I wanted to accomplish

- Bring assignments from every active Canvas course into one place.
- Keep the information organized the same way, regardless of how each professor uses Canvas.
- Let students sync again without getting duplicate assignments in Notion.
- Protect the credentials used to connect Canvas and Notion.

### What CourseBridge doesn't do

CourseBridge isn't meant to replace Canvas. Students still use Canvas to submit their work and see the official information for their classes.

It also doesn't change anything in Canvas or support connections to multiple schools in the same setup yet.

---

## How CourseBridge works

```text
Canvas ── reads assignments ──▶ CourseBridge ── creates or updates ──▶ Notion
                                      │
                                      ▼
                          Database for user accounts,
                          encrypted credentials,
                          assignment links, and sync history
```

Here's what happens when a student clicks **Sync now**.

1. CourseBridge gets assignments from their active Canvas courses.
2. It organizes the information into the same format for every class.
3. It checks whether each assignment already has a page in Notion.
4. If the assignment is new, CourseBridge creates a page. If it's already there, CourseBridge updates it.
5. It saves a record of the sync so the student can see what happened.

The goal is to make syncing predictable. Students shouldn't need to clean up duplicate pages every time they want to check for new assignments.

---

## Design decisions and trade-offs

Every decision came with a benefit and a limitation. These are the choices I made, what I considered, and why I went with them.

### 1. Only sync from Canvas to Notion

**Why I chose this**

Canvas is where professors post assignments and where students submit their work. I wanted CourseBridge to help students organize that information without risking changes to their classes. Keeping the sync one-way also makes the app simpler to maintain.

**The trade-off**

If a student marks an assignment as done in Notion, that change won't show up in Canvas. They still need to submit their work through Canvas.

**What I considered instead**

I considered syncing both ways, but that would mean allowing CourseBridge to change information in Canvas. For this project, I didn't think the added risk and complexity were worth it.

**Technical detail:** The Canvas developer key requests only `GET` permissions for courses and assignments. These allow the app to read that information without requesting permission to edit it.

### 2. Give students two ways to connect Canvas

**Why I chose this**

I wanted connecting Canvas to feel straightforward. With **Connect with Canvas**, students can authorize CourseBridge through their school's Canvas login instead of copying a secret token into the app.

Not every school will have that connection set up, though. Supporting personal access tokens gives students another way to use CourseBridge in the meantime.

**The trade-off**

I have to maintain two different connection methods. The easier login option also depends on a Canvas administrator registering the app for their school.

**What I considered instead**

I could have supported personal tokens only. That would have been easier to build, but generating a token can be confusing for students who haven't done it before. It also asks them to handle a credential directly.

**Technical detail:** The Canvas login uses OAuth 2.0 with a signed, single-use `state` value that expires after 10 minutes. Access tokens last one hour and are refreshed before a sync when they're within five minutes of expiring. The setup is explained in [CANVAS_OAUTH.md](CANVAS_OAUTH.md).

### 3. Prevent duplicate assignments

**Why I chose this**

Students need to sync again and again as assignments change. If every sync created new pages, their database would fill with copies and they’d stop trusting it.

Each Canvas assignment has a unique ID, so I used that to keep track of which Notion page belongs to which assignment. Now the sync checks for an existing page before creating a new one.

**The trade-off**

CourseBridge needs a small database table and a lookup to keep track of those connections. That's extra work behind the scenes, but it's worth it to avoid duplicate pages.

**What I considered instead**

I could have searched Notion for every assignment on every sync. That would mean more requests to Notion and slower syncing, especially for students with a lot of assignments.

**Technical detail:** The `SyncMap` table connects `(userId, canvasId)` to `notionPageId`, with a unique constraint to prevent duplicate mappings. If a mapping is missing, the app searches Notion for the Canvas ID before creating a page. That helps it recover missing assignment links.

### 4. Encrypt saved credentials

**Why I chose this**

Students need to trust CourseBridge with access to their Canvas and Notion accounts. I didn't want their access tokens stored as readable text in the database.

Encrypting those tokens adds protection if someone gets a copy of the database. The encryption key must be kept separate and secure for that protection to hold.

**The trade-off**

If I lose or replace the encryption key, the app can't read the tokens it previously saved. Students would need to connect their accounts again.

**What I considered instead**

Storing tokens as plain text would be easier, but it would expose those credentials if the database were compromised. That wasn't an acceptable trade-off.

**Technical detail:** CourseBridge uses AES-256-GCM and a 64-character hexadecimal `TOKEN_ENCRYPTION_KEY`, which is separate from `JWT_SECRET`. Saved tokens are not returned to the browser.

### 5. Start with manual syncing

**Why I chose this**

I started with a **Sync now** button so I could focus on making the actual syncing reliable before adding more moving parts. It also makes it easy to test changes and see the result immediately.

**The trade-off**

Assignments in Notion only stay current when the student runs another sync. If a professor changes a deadline afterward, Notion won't reflect that change until the next sync.

**What I considered instead**

Automatic scheduled syncing would be more convenient, and it's something I want to add. I chose to get manual syncing working first.

### 6. Avoid overwhelming the Notion API

**Why I chose this**

When CourseBridge syncs a lot of assignments, it needs to create or update multiple Notion pages. Sending too many requests at once can cause Notion to reject some of them.

I limited how many requests the app works on at the same time to reduce that risk.

**The trade-off**

A large sync can take a little longer, but it's better than sending everything at once and running into avoidable errors.

**What I considered instead**

I could have sent all the requests together. That might finish faster in ideal conditions, but it would put more pressure on Notion's API limits.

**Technical detail:** CourseBridge uses `p-limit(3)` to allow up to three Notion operations at the same time. This controls concurrency, not an exact number of requests per second. Notion's API limit is around three requests per second, so rate limits still need to be handled carefully.

### 7. Use SQLite for the database

**Why I chose this**

I wanted a database that was easy to set up while I was still building and testing the app. SQLite let me get started without running a separate database server.

**The trade-off**

SQLite works well for a smaller project, but it can become a limitation if many students are writing to the database at the same time.

**What I considered instead**

PostgreSQL would be a better option if the app grows and needs to handle more users at once. Switching would involve updating the database configuration, migrating the data, and adjusting the deployment setup.

**Technical detail:** CourseBridge uses SQLite with Prisma. PostgreSQL is a possible future migration if usage grows.

---

## What still needs work

There are a few limitations I know about and want to address.

- **Sync history counts:** The sync log can sometimes label an updated assignment as newly created. The current counter looks at mappings changed in the last 30 seconds, and updating a mapping also changes its timestamp. The assignments themselves still sync correctly. The issue is with the numbers shown in the summary.
- **Deleted assignments:** If a professor removes an assignment from Canvas, its existing Notion page stays there. I want to mark those assignments as removed so students don't mistake them for current work.
- **School setup:** Each Canvas developer key currently supports one school. Supporting more schools would take additional setup.

## What I want to build next

1. Fix the created and updated counts in sync history.
2. Add automatic syncing on a schedule.
3. Mark assignments that have been removed from Canvas.
4. Add priority tags based on how close an assignment is to its due date.
