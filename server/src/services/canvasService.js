import axios from 'axios'
import { getCanvasUrl } from './canvasUrl.js'

function makeCanvasClient(baseUrl, token) {
  return axios.create({
    baseURL: `${getCanvasUrl(baseUrl)}/api/v1`,
    timeout: 15000,
    maxRedirects: 0,
    maxContentLength: 5 * 1024 * 1024,
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })
}

async function fetchAllPages(client, url, params = {}) {
  let results = []
  const visited = new Set()
  const base = new URL(client.defaults.baseURL + '/')
  let nextUrl = new URL(url.replace(/^\//, ''), base).href

  while (nextUrl) {
    const pageUrl = new URL(nextUrl, base)
    if (pageUrl.origin !== base.origin || !pageUrl.pathname.startsWith('/api/v1/') ||
        pageUrl.username || pageUrl.password || visited.has(pageUrl.href)) {
      throw new Error('Canvas returned an invalid pagination link.')
    }
    visited.add(pageUrl.href)
    let response
    try {
      response = await client.get(pageUrl.href, { params })
    } catch (err) {
      // axios errors can contain the token, so do not pass them to the route
      const status = err.response?.status
      throw new Error(status
        ? `Canvas request failed (${status}). Check your token and course access.`
        : 'Canvas did not respond. Check the connection and try again.')
    }
    if (!Array.isArray(response.data)) throw new Error('Canvas returned an unexpected response.')
    results = results.concat(response.data)

    // canvas includes the next page in the link header
    const linkHeader = response.headers['link']
    const nextMatch = linkHeader?.match(/<([^>]+)>;\s*rel="next"/)
    nextUrl = nextMatch ? new URL(nextMatch[1], pageUrl).href : null

    // after the first request, clear params since they're already in the url
    params = {}
  }

  return results
}

export async function fetchCourses(baseUrl, token) {
  const client = makeCanvasClient(baseUrl, token)

  const courses = await fetchAllPages(client, '/courses', {
    enrollment_state: 'active',  // only courses the student is actively enrolled in
    per_page: 50,
  })

  return courses.map(c => ({
    id: String(c.id),
    name: c.name || 'Unnamed Course',
    courseCode: c.course_code || '',
  }))
}

export async function fetchAssignmentsForCourse(baseUrl, token, courseId, courseName) {
  const client = makeCanvasClient(baseUrl, token)

  const rawAssignments = await fetchAllPages(
    client,
    `/courses/${courseId}/assignments`,
    { per_page: 50, order_by: 'due_at', 'include[]': 'submission' }
  )

  return rawAssignments.map(a => {
    const assignment = normalizeAssignment(a, courseId, courseName)
    if (!assignment.url) {
      assignment.url = `${baseUrl}/courses/${courseId}/assignments/${assignment.canvasId}`
    }
    return assignment
  })
}

function normalizeAssignment(raw, courseId, courseName) {

  let status = 'Not Started'
  const submitted = Boolean(raw.submission?.submitted_at) ||
    ['submitted', 'pending_review', 'graded'].includes(raw.submission?.workflow_state)
  if (submitted) status = 'Submitted'
  if (raw.due_at && new Date(raw.due_at) < new Date() && !submitted &&
      !submissionNotRequired(raw) && !raw.submission?.excused) {
    status = 'Overdue'
  }

  const submissionTypes = raw.submission_types || []
  let assignmentType = 'Other'
  if (submissionTypes.includes('online_quiz') || raw.is_quiz_assignment) assignmentType = 'Quiz'
  else if (submissionTypes.includes('discussion_topic')) assignmentType = 'Discussion'
  else if (submissionTypes.includes('online_upload') || submissionTypes.includes('online_text_entry')) assignmentType = 'Assignment'
  else if (submissionTypes.includes('none') || submissionTypes.includes('not_graded')) assignmentType = 'No Submission'

  return {
    canvasId: String(raw.id),
    courseId: String(courseId),
    courseName,
    title: raw.name || 'Untitled Assignment',
    dueDate: raw.due_at || null,          // iso date string or null
    description: stripHtml(raw.description || ''),
    pointsPossible: raw.points_possible || 0,
    status,
    assignmentType,
    url: raw.html_url || '',
    updatedAt: raw.updated_at,
  }
}

function submissionNotRequired(raw) {
  return raw.submission_types?.some(type => ['none', 'not_graded'].includes(type))
}

function stripHtml(html) {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 2000)
}

export async function fetchAllAssignments(baseUrl, token) {
  console.log('Fetching courses from Canvas...')
  const courses = await fetchCourses(baseUrl, token)
  console.log(`Found ${courses.length} active courses`)

  const allAssignments = []
  for (const course of courses) {
    console.log(`  Fetching assignments for: ${course.name}`)
    const assignments = await fetchAssignmentsForCourse(
      baseUrl, token, course.id, course.name
    )
    allAssignments.push(...assignments)
  }

  console.log(`Total assignments fetched: ${allAssignments.length}`)
  return allAssignments
}
