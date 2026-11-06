import { Client } from '@notionhq/client'
import { createRequestPacer, createNotionFetch } from './requestPacer.js'

const pacedFetch = createNotionFetch({ pace: createRequestPacer() })

function makeNotionClient(token) {
  return new Client({
    auth: token,
    fetch: pacedFetch,
    notionVersion: '2022-06-28',
  })
}

export function assignmentToNotionProperties(assignment) {
  const props = {
    'Name': {
      title: [{ text: { content: assignment.title.slice(0, 2000) } }],
    },

    'Course': {
      select: { name: assignment.courseName.replace(/,\s*/g, ' / ').slice(0, 100) },
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

  // send empty values too so removed dates and descriptions get cleared in notion
  props['Due Date'] = { date: assignment.dueDate ? { start: assignment.dueDate } : null }
  props['Description'] = {
    rich_text: assignment.description
      ? [{ text: { content: assignment.description.slice(0, 2000) } }]
      : [],
  }

  return props
}

export async function findExistingPage(token, databaseId, canvasId, baseUrl) {
  const notion = makeNotionClient(token)

  const response = await notion.databases.query({
    database_id: databaseId,
    filter: {
      and: [
        { property: 'Canvas ID', rich_text: { equals: canvasId } },
        { property: 'Canvas URL', url: { starts_with: `${baseUrl}/` } },
      ],
    },
  })

  if (response.results.length > 0) {
    return response.results[0].id
  }

  return null
}

export async function createNotionPage(token, databaseId, assignment) {
  const notion = makeNotionClient(token)

  const page = await notion.pages.create({
    parent: { database_id: databaseId },
    properties: assignmentToNotionProperties(assignment),
  })

  return page.id
}

export async function updateNotionPage(token, pageId, assignment, databaseId) {
  const notion = makeNotionClient(token)

  const page = await notion.pages.retrieve({ page_id: pageId })
  const parentId = page.parent?.database_id?.replace(/-/g, '').toLowerCase()
  if (page.archived || page.in_trash || parentId !== databaseId.replace(/-/g, '').toLowerCase()) {
    throw new Error('The Notion page was moved or deleted. Restore it before syncing again.')
  }
  await notion.pages.update({
    page_id: pageId,
    properties: assignmentToNotionProperties(assignment),
  })

  return pageId
}

export async function verifyDatabase(token, databaseId) {
  const notion = makeNotionClient(token)

  try {
    const db = await notion.databases.retrieve({ database_id: databaseId })
    const validation = validateDatabaseProperties(db.properties)
    if (!validation.ok) return validation

    return { ok: true, dbTitle: db.title?.[0]?.plain_text || 'Untitled' }
  } catch (err) {
    if (err.code === 'object_not_found') {
      return { ok: false, error: 'Database not found. Check your database ID and that your integration has access to it.' }
    }
    throw err
  }
}

export const REQUIRED_PROPERTIES = {
  Name: 'title', Course: 'select', 'Due Date': 'date', Status: 'select',
  'Assignment Type': 'select', Points: 'number', 'Canvas URL': 'url',
  Description: 'rich_text', 'Canvas ID': 'rich_text', 'Last Synced': 'date',
}

export function validateDatabaseProperties(properties) {
  const issues = Object.entries(REQUIRED_PROPERTIES).flatMap(([name, type]) => {
    if (!properties[name]) return [`${name} is missing (needs ${type})`]
    if (properties[name].type !== type) return [`${name} must be ${type}, found ${properties[name].type}`]
    return []
  })
  return issues.length
    ? { ok: false, error: `Check your Notion columns: ${issues.join('; ')}.` }
    : { ok: true }
}
