// canvasService.js
// Responsible for talking to the Canvas LMS API.
// Canvas calls use either a personal access token or an OAuth token (see canvasOAuth.js).

import axios from 'axios'

/**
 * Creates an axios instance pre-configured for a user's Canvas instance.
 * @param {string} baseUrl - e.g. "https://canvas.school.edu"
 * @param {string} token   - Canvas personal access token
 */
function makeCanvasClient(baseUrl, token) {
  return axios.create({
    baseURL: `${baseUrl}/api/v1`,
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })
}

/**
 * Canvas paginates results using Link headers.
 * This helper keeps fetching pages until there's no "next" link.
 * @param {AxiosInstance} client
 * @param {string} url - starting URL
 * @param {object} params - query params
 * @returns {Array} - all results combined
 */
async function fetchAllPages(client, url, params = {}) {
  let results = []
  let nextUrl = url

  while (nextUrl) {
    const response = await client.get(nextUrl, { params })
    results = results.concat(response.data)

    // Canvas puts the next page URL in the Link header
    // e.g. Link: <https://...?page=2>; rel="next"
    const linkHeader = response.headers['link']
    const nextMatch = linkHeader?.match(/<([^>]+)>;\s*rel="next"/)
    nextUrl = nextMatch ? nextMatch[1] : null

    // After the first request, clear params since they're already in the URL
    params = {}
  }

  return results
}

/**
 * Fetches all active courses for a user.
 */
export async function fetchCourses(baseUrl, token) {
  const client = makeCanvasClient(baseUrl, token)

  const courses = await fetchAllPages(client, '/courses', {
    enrollment_state: 'active',  // Only courses the student is actively enrolled in
    per_page: 50,
  })

  return courses.map(c => ({
    id: String(c.id),
    name: c.name || 'Unnamed Course',
    courseCode: c.course_code || '',
  }))
}

/**
 * Fetches all assignments for a given course.
 * Returns them in our normalized "assignment" shape.
 */
export async function fetchAssignmentsForCourse(baseUrl, token, courseId, courseName) {
  const client = makeCanvasClient(baseUrl, token)

  let rawAssignments
  try {
    rawAssignments = await fetchAllPages(
      client,
      `/courses/${courseId}/assignments`,
      { per_page: 50, order_by: 'due_at' }
    )
  } catch (err) {
    // Some courses don't allow assignment listing, so we skip them
    if (err.response?.status === 401 || err.response?.status === 403) {
      console.warn(`Skipping course ${courseId}: no permission`)
      return []
    }
    throw err
  }

  // Normalize each assignment into our consistent shape
  return rawAssignments.map(a => normalizeAssignment(a, courseId, courseName))
}

/**
 * Converts a raw Canvas assignment object into our clean, consistent format.
 * This is the normalization step. Canvas returns a huge messy object,
 * we only keep what we need.
 */
function normalizeAssignment(raw, courseId, courseName) {
  // Determine submission status
  let status = 'Not Started'
  if (raw.has_submitted_submissions) status = 'Submitted'
  if (raw.due_at && new Date(raw.due_at) < new Date() && !raw.has_submitted_submissions) {
    status = 'Overdue'
  }

  // Infer assignment type from submission types
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
    dueDate: raw.due_at || null,          // ISO date string or null
    description: stripHtml(raw.description || ''),
    pointsPossible: raw.points_possible || 0,
    status,
    assignmentType,
    url: raw.html_url || '',
    updatedAt: raw.updated_at,
  }
}

/**
 * Canvas descriptions are HTML. This strips tags to get plain text.
 * We truncate to 2000 chars because Notion has field length limits.
 */
function stripHtml(html) {
  return html
    .replace(/<[^>]*>/g, ' ')   // Remove HTML tags
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')       // Collapse whitespace
    .trim()
    .slice(0, 2000)
}

/**
 * Main entry point: fetches ALL assignments across ALL active courses.
 * Returns a flat array of normalized assignments.
 */
export async function fetchAllAssignments(baseUrl, token) {
  console.log('Fetching courses from Canvas...')
  const courses = await fetchCourses(baseUrl, token)
  console.log(`Found ${courses.length} active courses`)

  // Fetch assignments for all courses (sequentially to be polite to Canvas)
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
