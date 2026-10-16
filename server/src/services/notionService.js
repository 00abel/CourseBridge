// notionService.js
// Handles all communication with the Notion API.
// Uses the official @notionhq/client package.

import { Client } from '@notionhq/client'

/**
 * Creates a Notion client for a specific user's integration token.
 */
function makeNotionClient(token) {
  return new Client({ auth: token })
}

/**
 * Converts our normalized assignment into Notion's "properties" format.
 *
 * IMPORTANT: The property names here must EXACTLY match your Notion database
 * column names. If you rename a column in Notion, update it here too.
 *
 * Each property type (title, rich_text, select, date, etc.) has a different
 * structure in the Notion API. This is the trickiest part of Notion integration.
 */
function assignmentToNotionProperties(assignment) {
  const props = {
    // "Title" is always the main title column in Notion
    'Name': {
      title: [{ text: { content: assignment.title } }],
    },

    'Course': {
      select: { name: assignment.courseName },
    },

    'Assignment Type': {
      select: { name: assignment.assignmentType },
    },

    'Status': {
      select: { name: assignment.status },
    },

    'Points': {
      number: assignment.pointsPossible,
    },

    // Canvas ID stored here for deduplication and never shown to the user
    'Canvas ID': {
      rich_text: [{ text: { content: assignment.canvasId } }],
    },

    'Canvas URL': {
      url: assignment.url || null,
    },

    'Last Synced': {
      date: { start: new Date().toISOString() },
    },
  }

  // Due Date is optional because Canvas assignments may not have one
  if (assignment.dueDate) {
    props['Due Date'] = {
      date: { start: assignment.dueDate },
    }
  }

  // Description only if it has content (Notion has a 2000-char limit on rich_text)
  if (assignment.description) {
    props['Description'] = {
      rich_text: [{ text: { content: assignment.description.slice(0, 2000) } }],
    }
  }

  return props
}

/**
 * Looks up an existing Notion page by Canvas ID.
 * Returns the page ID if found, null if not.
 *
 * This is how we detect duplicates. We filter the Notion database
 * by the "Canvas ID" property we stored when we first created the page.
 */
export async function findExistingPage(token, databaseId, canvasId) {
  const notion = makeNotionClient(token)

  const response = await notion.databases.query({
    database_id: databaseId,
    filter: {
      property: 'Canvas ID',
      rich_text: { equals: canvasId },
    },
  })

  if (response.results.length > 0) {
    return response.results[0].id  // Return the Notion page ID
  }

  return null
}

/**
 * Creates a new page in the Notion database for an assignment.
 */
export async function createNotionPage(token, databaseId, assignment) {
  const notion = makeNotionClient(token)

  const page = await notion.pages.create({
    parent: { database_id: databaseId },
    properties: assignmentToNotionProperties(assignment),
  })

  return page.id
}

/**
 * Updates an existing Notion page with fresh data from Canvas.
 * We only update properties and don't touch any notes the user
 * may have added to the page body.
 */
export async function updateNotionPage(token, pageId, assignment) {
  const notion = makeNotionClient(token)

  await notion.pages.update({
    page_id: pageId,
    properties: assignmentToNotionProperties(assignment),
  })

  return pageId
}

/**
 * Verifies that a Notion database exists and has the right structure.
 * Called before syncing to give the user a clear error if something is wrong.
 */
export async function verifyDatabase(token, databaseId) {
  const notion = makeNotionClient(token)

  try {
    const db = await notion.databases.retrieve({ database_id: databaseId })
    const properties = Object.keys(db.properties)

    // Check that required columns exist
    const required = ['Name', 'Course', 'Status', 'Canvas ID']
    const missing = required.filter(p => !properties.includes(p))

    if (missing.length > 0) {
      return {
        ok: false,
        error: `Your Notion database is missing these columns: ${missing.join(', ')}. Please add them.`,
      }
    }

    return { ok: true, dbTitle: db.title?.[0]?.plain_text || 'Untitled' }
  } catch (err) {
    if (err.code === 'object_not_found') {
      return { ok: false, error: 'Database not found. Check your database ID and that your integration has access to it.' }
    }
    throw err
  }
}
