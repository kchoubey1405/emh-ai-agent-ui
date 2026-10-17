# EMH AI Agent UI

A React dashboard for interacting with Spring AI MCP POC backend with chat and agent modes.

## Features

- **Chat Mode**: Direct Q&A without MCP tools (lower token usage)
- **Agent Mode**: Full MCP tool access (Jira, Git, JFrog, Confluence, ServiceNow)
- **Session-based Memory**: Maintains conversation context within 5-minute TTL
- **Spring AI Backend**: Connects to `http://localhost:8080/api/v1/ai`
- **Dashboard UI**: Shows system context (Jira, GitLab, Kafka, JFrog insights)

## Installation

```bash
cd emh-ai-agent-ui
npm install
```

## Running Locally

### Prerequisites
- Spring AI backend running on `http://localhost:8080`
- Node.js 16+ with npm

### Start Dev Server

```bash
npm start
```

Opens at `http://localhost:3000`

### Build for Production

```bash
npm run build
```

Output in `build/` folder.

## Environment

Create or edit `.env`:

```dotenv
REACT_APP_API_URL=/api/v1/ai
```

In development, the `package.json` proxy redirects `/api/**` calls to Spring backend.

## Using Chat vs Agent Mode

1. Open app at `http://localhost:3000`
2. Select mode from dropdown: **Chat** or **Agent**
3. Type your question
4. Send

### Chat Mode
- Faster, cheaper
- No MCP tools
- Pure LLM response
- Good for: facts, explanations, summaries

### Agent Mode
- Uses MCP tools for actions
- Can create Jira tickets, search Git, check JFrog artifacts
- Returns tool usage in response
- Good for: multi-step operations, data retrieval

## API Contract

**Endpoint**: `POST /api/v1/ai/prompt`

**Request**:
```json
{
  "provider": "springai",
  "prompt": "Your question here",
  "mode": "chat",
  "sessionId": "optional-id-for-continuity",
  "enabledTools": ["all"]
}
```

**Response**:
```json
{
  "response": "AI answer text",
  "sessionId": "persisted-session-id",
  "provider": "springai",
  "model": "gpt-5",
  "toolsUsed": ["jira", "git"],
  "toolResults": [...],
  "timestamp": "2026-08-31T..."
}
```

## Folder Structure

```
emh-ai-agent-ui/
├── public/
│   └── index.html         # HTML entry point
├── src/
│   ├── App.js             # Main React component with UI layout
│   ├── api.js             # Spring AI API client
│   ├── index.js           # React DOM render
│   └── index.css          # Tailwind-style CSS
├── package.json           # Dependencies (React, Lucide icons)
└── .env                   # Environment config
```

## Common Issues

**CORS Error**: Make sure Spring AI backend has CORS enabled for `http://localhost:3000`.

**Backend Offline**: If health check shows "Offline", verify Spring backend is running on port 8080.

**Session Not Persisting**: Sessions expire after 5 minutes; create new session once expired.

## Next Steps

1. Run Spring AI backend: `mvn spring-boot:run` (in spring-ai-mcp-poc folder)
2. Start UI: `npm start`
3. Test endpoints in Chat mode first, then try Agent mode
4. Monitor session ID for multi-turn conversations
