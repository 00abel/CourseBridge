import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { fetchCourses, fetchAssignmentsForCourse } from '../src/services/canvasService.js'
import { getCanvasUrl } from '../src/services/canvasUrl.js'

async function withCanvas(handler, run) {
  const app = express()
  app.use(handler)
  const server = app.listen(0, '127.0.0.1')
  await new Promise(resolve => server.once('listening', resolve))
  try {
    await run(`http://127.0.0.1:${server.address().port}`)
  } finally {
    await new Promise(resolve => server.close(resolve))
  }
}

test('canvas urls require an approved school and https', () => {
  const previous = process.env.CANVAS_ALLOWED_HOSTS
  const environment = process.env.NODE_ENV
  try {
    process.env.CANVAS_ALLOWED_HOSTS = 'canvas.example.edu'
    process.env.NODE_ENV = 'production'
    assert.equal(getCanvasUrl('https://canvas.example.edu/'), 'https://canvas.example.edu')
    for (const url of [
      'http://canvas.example.edu', 'http://127.0.0.1', 'https://other.example.edu',
      'https://canvas.example.edu/path', 'https://user:secret@canvas.example.edu',
      'https://canvas.example.edu?token=secret', 'https://canvas.example.edu:8443',
    ]) assert.throws(() => getCanvasUrl(url))
  } finally {
    if (previous === undefined) delete process.env.CANVAS_ALLOWED_HOSTS
    else process.env.CANVAS_ALLOWED_HOSTS = previous
    if (environment === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = environment
  }
})

test('canvas follows pagination and requests the current student submission', async () => {
  let pages = 0
  await withCanvas((req, res) => {
    assert.equal(req.headers.authorization, 'Bearer test-token')
    if (req.path === '/api/v1/courses') {
      pages++
      if (!req.query.page) {
        res.set('Link', `</api/v1/courses?page=2>; rel="next"`)
        return res.json([{ id: 1, name: 'Writing' }])
      }
      return res.json([{ id: 2, name: 'Math' }])
    }
    assert.equal(req.query.include?.[0], 'submission')
    res.json([
      { id: 1, has_submitted_submissions: true, due_at: '2020-01-01', submission: { workflow_state: 'unsubmitted' } },
      { id: 2, has_submitted_submissions: false, submission: { workflow_state: 'submitted' } },
      { id: 3, due_at: '2020-01-01', submission_types: ['none'] },
      { id: 4, due_at: '2020-01-01', submission: { excused: true } },
    ])
  }, async base => {
    assert.equal((await fetchCourses(base, 'test-token')).length, 2)
    assert.equal(pages, 2)
    const assignments = await fetchAssignmentsForCourse(base, 'test-token', '1', 'Writing')
    assert.deepEqual(assignments.map(a => a.status), ['Overdue', 'Submitted', 'Not Started', 'Not Started'])
  })
})

test('canvas rejects off site links, repeated pages, and redirects', async () => {
  let mode = 'offsite'
  await withCanvas((req, res) => {
    if (mode === 'redirect') return res.redirect('http://127.0.0.1:1/private')
    res.set('Link', mode === 'offsite'
      ? '<http://127.0.0.1:1/private>; rel="next"'
      : '</api/v1/courses>; rel="next"')
    res.json([])
  }, async base => {
    await assert.rejects(fetchCourses(base, 'private-token'), /pagination/)
    mode = 'repeat'
    await assert.rejects(fetchCourses(base, 'private-token'), /pagination/)
    mode = 'redirect'
    await assert.rejects(fetchCourses(base, 'private-token'), /302/)
  })
})

test('canvas permission failures stop the sync without exposing request details', async () => {
  await withCanvas((_req, res) => res.sendStatus(403), async base => {
    await assert.rejects(fetchAssignmentsForCourse(base, 'private-token', '1', 'Writing'), error => {
      assert.match(error.message, /403/)
      assert.equal(error.message.includes('private-token'), false)
      assert.equal(error.config, undefined)
      return true
    })
  })
})
