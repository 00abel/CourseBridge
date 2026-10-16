# Canvas OAuth ("Connect with Canvas")

Students can connect Canvas by logging in and clicking Authorize, instead of generating and pasting a personal access token.

The app supports both methods. OAuth turns on automatically once the Canvas environment variables are set. Until then, the button stays hidden and personal tokens work as before.

## How it works

1. The user clicks Connect with Canvas on the Settings page.
2. The backend builds a Canvas login URL with a signed, single-use `state` value and the frontend sends the browser there.
3. The user logs into Canvas and approves the app.
4. Canvas redirects to `/api/canvas/oauth/callback` with a one-time `code`.
5. The backend checks `state`, trades the code for an access token and a refresh token, encrypts both, and saves them.
6. Access tokens last one hour. Before every sync the backend refreshes the token if it expires within five minutes.
7. If the user revokes access in Canvas, the next refresh fails, the connection is cleared, and the user sees a "reconnect" message.
8. Disconnect revokes the token in Canvas and deletes it locally.

| File | Role |
|---|---|
| `server/src/services/canvasOAuth.js` | Authorize URL, state checks, code exchange, refresh, revoke |
| `server/src/routes/canvasOAuth.js` | `/status`, `/start`, `/callback`, `DELETE` endpoints |
| `server/src/services/crypto.js` | AES-256-GCM encryption for stored tokens |
| `server/scripts/mockCanvas.js` | Local fake Canvas for testing the flow |
| `client/src/pages/ConfigPage.jsx` | Connect, reconnect and disconnect UI |

## Requirement: a Canvas Developer Key

Canvas only allows OAuth for apps an admin has registered. A Canvas admin creates an API Developer Key (Admin → Developer Keys → + Developer Key → API Key) with:

| Field | Value |
|---|---|
| Key Name | CourseBridge |
| Redirect URIs | `https://<railway-url>/api/canvas/oauth/callback` |
| Enforce Scopes | On, with only the scopes below |
| Scopes | `url:GET\|/api/v1/courses`, `url:GET\|/api/v1/courses/:course_id/assignments` |

The app only reads courses and assignments. It never writes to Canvas.

The admin then shares the Client ID and Client Secret.

## Environment variables (Railway)

| Variable | Value |
|---|---|
| `TOKEN_ENCRYPTION_KEY` | 64 hex characters. Required even without OAuth. |
| `CANVAS_CLIENT_ID` | From the Developer Key |
| `CANVAS_CLIENT_SECRET` | From the Developer Key |
| `CANVAS_OAUTH_BASE_URL` | The school's Canvas URL, e.g. `https://canvas.uw.edu` |
| `CANVAS_REDIRECT_URI` | Exactly the Redirect URI on the key |
| `CANVAS_SCOPES` | The scopes above, space-separated, if scopes are enforced |

## Testing locally with the mock Canvas

Real OAuth needs a Developer Key. The mock server acts like Canvas so the whole flow can be tested now.

```bash
# server/.env
CANVAS_CLIENT_ID="mock-client-id"
CANVAS_CLIENT_SECRET="mock-client-secret"
CANVAS_OAUTH_BASE_URL="http://localhost:4000"
CANVAS_REDIRECT_URI="http://localhost:3001/api/canvas/oauth/callback"
```

```bash
cd server
npm run mock:canvas        # terminal 1, http://localhost:4000
npm run dev                # terminal 2
cd ../client && npm run dev   # terminal 3
```

Open http://localhost:5173/config and click Connect with Canvas.

Run the mock with `MOCK_EXPIRES_IN=30 npm run mock:canvas` to make tokens expire after 30 seconds and watch the refresh happen.

## Security notes

- Tokens never go back to the browser. `GET /api/config` only returns connection status.
- `state` is signed with `JWT_SECRET`, expires in 10 minutes, and is single-use. This blocks forged or replayed callbacks.
- Tokens are encrypted at rest with AES-256-GCM. A copy of the database alone does not expose anyone's Canvas.
- One Developer Key covers one Canvas instance. Supporting several schools would need a key per school.
