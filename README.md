# CourseBridge

CourseBridge syncs Canvas assignments into a Notion database. It saves assignment details in one place and updates existing pages when another sync runs.

This is the new home for CourseBridge. I cleaned up the project structure, fixed a few issues, and updated the documentation before moving it here. The previous repository is archived for reference.

[Open CourseBridge](https://coursebridgesync.vercel.app)

## Why I built it

Every professor sets up Canvas a little differently. Some put assignments in modules, others post them on the course home page, and some don't include due dates. When you have several classes, it's easy to miss something.

That's why I built CourseBridge. I wanted one place to see my assignments without having to check every class or copy everything into Notion myself. Now I can bring them all together and update them whenever I need to.

**Who it's for:** Students who use Notion to keep track of schoolwork.

**What it doesn't do:** CourseBridge won't submit assignments or change anything in Canvas. It reads your assignments and adds them to the Notion database you choose.

## Features

- Import assignments from Canvas courses with active enrollments.
- View titles, course names, due dates, points, descriptions, assignment types, and Canvas links in Notion.
- Update existing pages when assignment information changes.
- Check created, updated, and failed counts in the dashboard's sync history.

Syncing is manual. Click **Sync now** to refresh assignments. CourseBridge only reads from Canvas and doesn't submit work or change course content.

## Requirements

- A Canvas account with permission to create a personal access token.
- A Notion account with an integration that can access the destination database.
- A CourseBridge account.

CourseBridge connects to Canvas with a personal access token, so schools that turn those off can't be connected.

## Getting started

### 1. Create an account

Open [CourseBridge](https://coursebridgesync.vercel.app), create an account, and go to **Connections**.

### 2. Add Canvas access

1. Sign in to the school's Canvas website.
2. Open **Account → Settings → New Access Token**.
3. Create a token and copy it.
4. In CourseBridge, enter the school's Canvas address under **Canvas URL**. For example, `https://canvas.university.edu`.
5. Paste the token under **Personal access token**.

Anyone with the token can use the permissions it grants. Keep it private and out of screenshots and public posts.

### 3. Connect Notion

1. Create an integration at [notion.so/my-integrations](https://www.notion.so/my-integrations) and copy its token.
2. Create a Notion database with the properties listed below.
3. Open the database's **Connections** menu and give the integration access.
4. Copy the database ID from the database URL. It is the 32 character identifier before any query string.
5. Enter the integration token and database ID in CourseBridge.
6. Click **Save and verify**.

The property names and types are checked before settings are saved.

### Required Notion properties

All ten properties are required, even when some assignments have empty values. Property names are case sensitive.

| Property | Notion type | Contents |
|---|---|---|
| Name | Title | Assignment title |
| Course | Select | Course name |
| Due Date | Date | Deadline, or empty when none is provided |
| Status | Select | Not Started, Submitted, or Overdue |
| Assignment Type | Select | Assignment, Quiz, Discussion, No Submission, or Other |
| Points | Number | Points possible |
| Canvas URL | URL | Link to the original assignment |
| Description | Text | Plain text instructions, up to 2,000 characters |
| Canvas ID | Text | Identifier used to match an assignment to its page |
| Last Synced | Date | Time the page was last updated |

### 4. Run a sync

Open the dashboard and click **Sync now**. CourseBridge reads assignments from Canvas and creates or updates their Notion pages. Run another sync after changes are made in Canvas.

Repeat syncs match assignments by Canvas ID and Canvas school. If a local mapping is missing, CourseBridge searches the selected Notion database before creating a page. Existing duplicate pages aren't merged automatically.

## Using the synced database

Managed properties are replaced with Canvas information on each sync. Changes made directly to those properties in Notion can be overwritten. Notes in the page body are left alone.

Removing a deadline or description in Canvas clears that field in Notion on the next sync. Removing an entire assignment in Canvas doesn't remove its Notion page.

Status uses the current student’s submission data returned by Canvas. Submitted, pending review, and graded work is shown as Submitted. Excused work and assignments that need no submission are not marked overdue. Check Canvas for the full submission and grading details.

## Troubleshooting

**The Canvas token option is missing**

The school may have disabled personal tokens. CourseBridge can't connect without one.

**Canvas connection failed**

Check that the URL opens the correct school's Canvas instance and that the personal token is valid. Replace expired or revoked tokens in Connections. Enter a token again when changing the Canvas URL. If the school is not enabled, ask the app owner to add it.

**Notion database wasn't found**

Check the database ID and confirm the integration has access through **Connections**.

**A property is missing or has the wrong type**

Compare the database with the required property table. Names and types must match exactly.

**Some assignments failed to sync**

Check the failed count in the sync result. Confirm database access and property types, then try another sync. A deleted or inaccessible Notion page may also cause a failure.

**An assignment is missing**

CourseBridge reads the Canvas assignments endpoint. It doesn't collect every item posted in modules or on course pages. If a course denies assignment access, the sync stops before writing to Notion and shows an error. Check Canvas for the original information.

## Privacy and disconnecting

New Canvas and Notion tokens are encrypted before storage. Saved tokens aren't returned to the browser. Tokens saved before encryption was added get encrypted the next time settings are saved.

Click **Disconnect** in the Canvas connection section to remove the saved Canvas connection from CourseBridge. This doesn't revoke the personal token in Canvas. Delete the token in Canvas settings to revoke it.

## Current limitations

- Syncing runs manually, without a schedule.
- Removed Canvas assignments remain in Notion.
- Status is a summary. It does not show grades, late submissions, or excused work separately.
- Existing duplicate pages aren't merged.
- The app owner must enable the school’s Canvas hostname before it can be connected.
- Assignment totals count saved mappings for the current school and Notion database. They are not a live count of Notion pages.
- Moved or deleted Notion pages cause a failure. Restore them before syncing again.
- The current Notion integration uses the older database API and expects a database with one data source.

Implementation details and local development instructions are in the [design document](docs/DESIGN.md).
