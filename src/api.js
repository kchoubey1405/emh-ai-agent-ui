const BASE_URL = process.env.REACT_APP_API_URL || "/api/v1/ai";

const DASHBOARD_URL = process.env.REACT_APP_DASHBOARD_URL || "/api/v1/dashboard";



async function parseResponse(response) {

  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {

    return response.json();

  }

  return response.text();

}



export async function checkHealth() {

  const response = await fetch(`${BASE_URL}/health`);

  const body = await parseResponse(response);

  if (!response.ok) {

    throw new Error(typeof body === "string" ? body : "Health check failed");

  }

  return body;

}



export async function fetchProviders() {

  const response = await fetch(`${BASE_URL}/providers`);

  const body = await parseResponse(response);

  if (!response.ok) {

    throw new Error(typeof body === "string" ? body : "Failed to fetch providers");

  }

  return body;

}



export async function sendPrompt({ prompt, mode, sessionId, provider }) {

  const payload = {

    prompt,

    mode

  };



  if (provider && provider !== "default") {

    payload.provider = provider;

  }



  if (sessionId) {

    payload.sessionId = sessionId;

  }



  if (mode === "agent") {

    payload.enabledTools = ["all"];

  }



  const response = await fetch(`${BASE_URL}/prompt`, {

    method: "POST",

    headers: { "Content-Type": "application/json" },

    body: JSON.stringify(payload)

  });



  const body = await parseResponse(response);

  if (!response.ok) {

    const errorMessage = typeof body === "string"

      ? body

      : body?.message || body?.error || `Request failed with status ${response.status}`;

    throw new Error(errorMessage);

  }



  return body;

}



export async function cancelGeneration(sessionId) {

  if (!sessionId) return;

  try {

    await fetch(`${BASE_URL}/session/${sessionId}/cancel`, {

      method: "POST"

    });

  } catch (err) {

    console.debug("Failed to notify backend of generation cancellation", err);

  }

}



/**

 * Stream a prompt from the backend using Server-Sent Events (Flux / SSE).

 * Emits thinking status, MCP tool calls/results, line-by-line chunks, and completion.

 */

export async function sendPromptStream({

  prompt,

  mode,

  sessionId,

  provider,

  onEvent,

  onThinking,

  onToolCall,

  onToolResult,

  onChunk,

  onDone,

  onError,

  signal

}) {

  const payload = {

    prompt,

    mode

  };



  if (provider && provider !== "default") {

    payload.provider = provider;

  }



  if (sessionId) {

    payload.sessionId = sessionId;

  }



  if (mode === "agent") {

    payload.enabledTools = ["all"];

  }



  const response = await fetch(`${BASE_URL}/prompt/stream`, {

    method: "POST",

    headers: {

      "Content-Type": "application/json",

      "Accept": "text/event-stream"

    },

    body: JSON.stringify(payload),

    signal

  });



  if (!response.ok) {

    const errorBody = await parseResponse(response);

    const errorMessage = typeof errorBody === "string"

      ? errorBody

      : errorBody?.message || errorBody?.error || `Stream failed with status ${response.status}`;

    throw new Error(errorMessage);

  }



  if (!response.body) {

    throw new Error("ReadableStream not supported by this browser environment");

  }



  const reader = response.body.getReader();

  const decoder = new TextDecoder("utf-8");

  let buffer = "";

  let finalResponse = null;



  try {

    while (true) {

      const { done, value } = await reader.read();

      if (done) break;



      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");

      buffer = lines.pop() || "";



      let currentEventName = "message";

      for (const line of lines) {

        const trimmed = line.trim();

        if (!trimmed) continue;



        if (trimmed.startsWith("event:")) {

          currentEventName = trimmed.slice(6).trim();

          continue;

        }



        if (trimmed.startsWith("data:")) {

          const rawData = trimmed.slice(5).trim();

          try {

            const eventData = JSON.parse(rawData);

            if (onEvent) onEvent(eventData);



            const eventType = eventData.type || currentEventName;

            switch (eventType) {

              case "thinking":

                if (onThinking && eventData.content) {

                  onThinking(eventData.content, eventData);

                }

                break;

              case "tool_call":

                if (onToolCall) {

                  onToolCall(eventData.toolName, eventData.toolPayload || eventData.content, eventData);

                }

                break;

              case "tool_result":

                if (onToolResult) {

                  onToolResult(eventData.toolName, eventData.content, eventData.toolPayload?.status || "success", eventData);

                }

                break;

              case "chunk":

                if (onChunk && eventData.content) {

                  onChunk(eventData.content, eventData);

                  await new Promise((r) => setTimeout(r, 10));

                }

                break;

              case "done": {

                const responseObj = (typeof eventData.response === "object" && eventData.response !== null)

                  ? eventData.response

                  : {};

                const sid = eventData.sessionId || responseObj.sessionId || "";

                const responseText = typeof eventData.response === "string"

                  ? eventData.response

                  : (responseObj.response || eventData.content || "");

                const tools = Array.isArray(responseObj.toolsUsed)

                  ? responseObj.toolsUsed

                  : (Array.isArray(eventData.toolsUsed) ? eventData.toolsUsed : []);



                finalResponse = {

                  sessionId: sid,

                  response: responseText,

                  toolsUsed: tools,

                  raw: eventData

                };



                if (onDone) {

                  onDone(finalResponse, eventData);

                }

                break;

              }

              case "error":

                if (onError) {

                  onError(eventData.content || "An error occurred");

                }

                break;

              default:

                break;

            }

          } catch (parseError) {

            // Non-JSON SSE data fallback

            if (currentEventName === "chunk" && onChunk) {

              onChunk(rawData);

            }

          }

        }

      }

    }

  } finally {

    reader.releaseLock();

  }



  return finalResponse;

}



// ---------------------------------------------------------------- vulnerabilities (JFrog Xray)



function errorOf(body, response) {

  return typeof body === "string" && body ? body : body?.error || `Request failed with status ${response.status}`;

}



/** Summary of the latest release of every module: totals, projects and module-wise counts. Returns instantly. */

export async function fetchVulnerabilities(sessionId = "") {

  const sid = sessionId || (typeof window !== "undefined" ? sessionStorage.getItem("emh_session_id") || "" : "");

  const qs = sid ? `?sessionId=${encodeURIComponent(sid)}` : "";

  const response = await fetch(`${DASHBOARD_URL}/vulnerabilities${qs}`, { headers: { Accept: "application/json" } });

  const body = await parseResponse(response);

  if (!response.ok) {

    throw new Error(errorOf(body, response));

  }

  return body;

}



/** Asks the backend to reload everything from JFrog in the background. */

export async function refreshVulnerabilities(sessionId = "") {

  const sid = sessionId || (typeof window !== "undefined" ? sessionStorage.getItem("emh_session_id") || "" : "");

  const qs = sid ? `?sessionId=${encodeURIComponent(sid)}` : "";

  const response = await fetch(`${DASHBOARD_URL}/vulnerabilities/refresh${qs}`, { method: "POST", headers: { Accept: "application/json" } });

  const body = await parseResponse(response);

  if (!response.ok) {

    throw new Error(errorOf(body, response));

  }

  return body;

}



/** URL of the CSV report: per project/module, optional release; detail=true lists every CVE. */

export function vulnerabilityReportUrl({ project, module, version, detail } = {}) {

  const params = new URLSearchParams();

  if (project) params.set("project", project);

  if (module) params.set("module", module);

  if (version) params.set("version", version);

  if (detail) params.set("detail", "true");

  const query = params.toString();

  return `${DASHBOARD_URL}/vulnerabilities/report${query ? `?${query}` : ""}`;

}



/** Decodes RFC 2047 encoded words (=?UTF-8?Q?...?= / =?UTF-8?B?...?=) that some servers put in filename=. */

function decodeEncodedWord(value) {

  const match = /^=\?([^?]+)\?([QqBb])\?([^?]*)\?=$/.exec(value);

  if (!match) return value;

  try {

    if (match[2].toUpperCase() === "B") {

      const bytes = Uint8Array.from(atob(match[3]), (c) => c.charCodeAt(0));

      return new TextDecoder(match[1]).decode(bytes);

    }

    const text = match[3].replace(/_/g, " ").replace(/=([0-9A-Fa-f]{2})/g, "%$1");

    return decodeURIComponent(text);

  } catch (error) {

    return value;

  }

}



/** Extracts a clean filename from a Content-Disposition header (filename*, quoted, or encoded-word). */

export function filenameFromDisposition(disposition) {

  if (!disposition) return "";

  let name = "";

  const star = /filename\*\s*=\s*(?:[\w-]+)?'[^']*'([^;]+)/i.exec(disposition);

  if (star) {

    try {

      name = decodeURIComponent(star[1].trim());

    } catch (error) {

      name = star[1].trim();

    }

  } else {

    const plain = /filename\s*=\s*(?:"([^"]*)"|([^;]+))/i.exec(disposition);

    if (plain) name = decodeEncodedWord((plain[1] ?? plain[2]).trim());

  }

  // Never allow path separators or stray wrapper characters in the saved name.

  return name.replace(/[\\/:*?"<>|]+/g, "_").replace(/^[=_\s]+|[=_\s]+$/g, "") || "";

}



/** Downloads a file from the backend through fetch (works with the dev proxy and with CORS). */

export async function downloadFile(url, fallbackName = "vulnerability-report.csv") {

  const response = await fetch(url);

  if (!response.ok) {

    const body = await parseResponse(response);

    throw new Error(errorOf(body, response));

  }

  const blob = await response.blob();

  const disposition = response.headers.get("Content-Disposition") || "";

  const name = filenameFromDisposition(disposition) || fallbackName;



  const objectUrl = URL.createObjectURL(blob);

  const link = document.createElement("a");

  link.href = objectUrl;

  link.download = name;

  document.body.appendChild(link);

  link.click();

  link.remove();

  setTimeout(() => URL.revokeObjectURL(objectUrl), 2000);

}



// ---------------------------------------------------------------- context panel: Jira, pull requests, Kafka



async function getJson(url) {

  const response = await fetch(url);

  const body = await parseResponse(response);

  if (!response.ok) {

    throw new Error(errorOf(body, response));

  }

  return body;

}



async function fetchSection(path, refresh, sessionId = "") {

  const sid = sessionId || (typeof window !== "undefined" ? sessionStorage.getItem("emh_session_id") || "" : "");

  const params = new URLSearchParams();

  if (refresh) params.set("refresh", "true");

  if (sid) params.set("sessionId", sid);

  const qs = params.toString() ? `?${params.toString()}` : "";

  const response = await fetch(`${DASHBOARD_URL}/${path}${qs}`);

  const body = await parseResponse(response);

  if (!response.ok) {

    throw new Error(errorOf(body, response));

  }

  return body;

}



/** EMH Jira tickets counted per status: { status, total, statuses: [{ status, count }], url }. */

export const fetchJiraSummary = (refresh = false, sessionId = "") => fetchSection("jira", refresh, sessionId);



/** Open pull requests of all repositories: { status, total, projects: [{ project, openPRs, url }] }. */

export const fetchPullRequests = (refresh = false, sessionId = "") => fetchSection("prs", refresh, sessionId);



/** Kafka connectors: { status, total, running, paused, failed, other, notRunning: [...] }. */

export const fetchKafkaSummary = (refresh = false, sessionId = "") => fetchSection("kafka", refresh, sessionId);



/** Restart a specific failed task of a Kafka connector: POST /connectors/{connector}/tasks/{taskId}/restart */

export async function restartKafkaTask(connector, taskId) {

  let response = await fetch(`${DASHBOARD_URL}/kafka/connectors/${encodeURIComponent(connector)}/tasks/${encodeURIComponent(taskId)}/restart`, {

    method: "POST"

  });

  if (response.status === 404) {

    response = await fetch(`${DASHBOARD_URL}/kafka/restart?connector=${encodeURIComponent(connector)}&taskId=${encodeURIComponent(taskId)}`, {

      method: "POST"

    });

  }

  const body = await parseResponse(response);

  if (!response.ok) {

    throw new Error(errorOf(body, response));

  }

  return body;

}



/** Restart the entire Kafka connector */

export async function restartKafkaConnector(connector) {

  let response = await fetch(`${DASHBOARD_URL}/kafka/connectors/${encodeURIComponent(connector)}/restart`, {

    method: "POST"

  });

  if (response.status === 404) {

    response = await fetch(`${DASHBOARD_URL}/kafka/restart?connector=${encodeURIComponent(connector)}`, {

      method: "POST"

    });

  }

  const body = await parseResponse(response);

  if (!response.ok) {

    throw new Error(errorOf(body, response));

  }

  return body;

}



/** Restart all failed tasks of a Kafka connector */

export async function restartFailedKafkaTasks(connector) {

  let response = await fetch(`${DASHBOARD_URL}/kafka/connectors/${encodeURIComponent(connector)}/restart-failed`, {

    method: "POST"

  });

  if (response.status === 404) {

    response = await fetch(`${DASHBOARD_URL}/kafka/restart?connector=${encodeURIComponent(connector)}`, {

      method: "POST"

    });

  }

  const body = await parseResponse(response);

  if (!response.ok) {

    throw new Error(errorOf(body, response));

  }

  return body;

}



/** ServiceNow active incidents and service requests summary with optional filter */

export async function fetchServiceNowSummary(refresh = false, sessionId = "", filterOverride = null) {

  const sid = sessionId || (typeof window !== "undefined" ? sessionStorage.getItem("emh_session_id") || "" : "");

  const params = new URLSearchParams();

  if (refresh) params.set("refresh", "true");

  if (sid) params.set("sessionId", sid);

  if (filterOverride) {

    if (filterOverride.active !== undefined && filterOverride.active !== null) {

      params.set("active", String(filterOverride.active));

    }

    if (filterOverride.assignmentGroup) {

      params.set("assignmentGroup", filterOverride.assignmentGroup);

    }

    if (filterOverride.states) {

      params.set(

        "states",

        Array.isArray(filterOverride.states) ? filterOverride.states.join(",") : filterOverride.states

      );

    }

    if (filterOverride.assignedTo) {

      params.set("assignedTo", filterOverride.assignedTo);

    }

  }

  const qs = params.toString() ? `?${params.toString()}` : "";

  const url = `${DASHBOARD_URL}/servicenow${qs}`;

  return getJson(url);

}



/** Get ServiceNow active filter criteria */

export async function fetchServiceNowFilter() {

  return getJson(`${DASHBOARD_URL}/servicenow/filter`);

}



/** Update ServiceNow active filter criteria with retry resilience against temporary proxy restart drops */

export async function updateServiceNowFilter(newFilter, sessionId = "") {

  const sid = sessionId || (typeof window !== "undefined" ? sessionStorage.getItem("emh_session_id") || "" : "");

  const qs = sid ? `?sessionId=${encodeURIComponent(sid)}` : "";

  let lastErr;

  for (let attempt = 1; attempt <= 3; attempt++) {

    try {

      const response = await fetch(`${DASHBOARD_URL}/servicenow/filter${qs}`, {

        method: "POST",

        headers: { "Content-Type": "application/json" },

        body: JSON.stringify(newFilter)

      });

      if (!response.ok) {

        const text = await response.text().catch(() => "");

        if ((response.status >= 500 || text.includes("ECONNREFUSED")) && attempt < 3) {

          await new Promise((r) => setTimeout(r, 800));

          continue;

        }

        throw new Error(`Failed to update ServiceNow filter (${response.status}): ${text}`);

      }

      return response.json();

    } catch (err) {

      lastErr = err;

      if (attempt < 3) {

        await new Promise((r) => setTimeout(r, 800));

      }

    }

  }

  throw lastErr;

}



const AUTH_URL = process.env.REACT_APP_AUTH_URL || "/api/v1/auth";



export async function fetchLlmProviders(sessionId) {

  const url = sessionId ? `${AUTH_URL}/llm-providers?sessionId=${encodeURIComponent(sessionId)}` : `${AUTH_URL}/llm-providers`;

  return getJson(url);

}



export async function fetchMcpServers(sessionId) {

  const url = sessionId ? `${AUTH_URL}/mcp-servers?sessionId=${encodeURIComponent(sessionId)}` : `${AUTH_URL}/mcp-servers`;

  return getJson(url);

}



export async function saveSessionToken({ sessionId, service, token, username }) {

  const response = await fetch(`${AUTH_URL}/token`, {

    method: "POST",

    headers: { "Content-Type": "application/json" },

    body: JSON.stringify({ sessionId, service, token, username })

  });

  const body = await parseResponse(response);

  if (!response.ok) {

    throw new Error(errorOf(body, response));

  }

  return body;

}



export async function fetchAuthStatus(sessionId) {

  const url = sessionId ? `${AUTH_URL}/status?sessionId=${encodeURIComponent(sessionId)}` : `${AUTH_URL}/status`;

  return getJson(url);

}



export async function logoutSession(sessionId) {

  const response = await fetch(`${AUTH_URL}/logout`, {

    method: "POST",

    headers: { "Content-Type": "application/json" },

    body: JSON.stringify({ sessionId })

  });

  return parseResponse(response);

}



export async function fetchKafkaInfo() {

  return getJson(`${AUTH_URL}/kafka`);

}



/**

 * Returns the backend base origin. When running locally via React dev server (port 3000),

 * resolves directly to port 8080 so that popup windows open the Spring Boot authentication HTML

 * rather than being intercepted by webpack-dev-server's historyApiFallback.

 */

export function getBackendBaseUrl() {

  if (process.env.REACT_APP_BACKEND_URL) {

    return process.env.REACT_APP_BACKEND_URL;

  }

  if (typeof window !== "undefined" && window.location.port === "3000") {

    return `${window.location.protocol}//${window.location.hostname}:8080`;

  }

  return "";

}



/**

 * URL for opening dedicated LLM Provider authentication gateway (GitHub Copilot, Google Antigravity, etc.)

 */

export function getLlmLoginPopupUrl(providerId, sessionId) {

  const base = getBackendBaseUrl();

  return `${base}/api/v1/auth/llm-login?provider=${encodeURIComponent(providerId)}&sessionId=${encodeURIComponent(sessionId)}`;

}



/**

 * URL for opening MCP Server authentication gateway (Jira, Confluence, JFrog, ServiceNow, etc.)

 */

export function getMcpLoginPopupUrl(serviceId, sessionId) {

  const base = getBackendBaseUrl();

  return `${base}/api/v1/auth/popup-login?service=${encodeURIComponent(serviceId)}&sessionId=${encodeURIComponent(sessionId)}`;

}