import { useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpen,
  Bot,
  CircleDot,
  CircleUserRound,
  Clock,
  Diamond,
  FileText,
  GitBranch,
  Mic,
  MicOff,
  Paperclip,
  Search,
  Share2,
  SendHorizontal,
  Sparkles,
  Square,
  Waypoints,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Maximize2,
  Minimize2,
  X,
  Check,
  Volume2,
  VolumeX,
  LogOut,
  Key,
  Shield,
  AlertTriangle,
  Loader2
} from "lucide-react";
import {
  checkHealth,
  fetchProviders,
  sendPrompt,
  sendPromptStream,
  cancelGeneration,
  fetchLlmProviders,
  fetchMcpServers,
  saveSessionToken,
  fetchAuthStatus,
  logoutSession,
  getMcpLoginPopupUrl
} from "./api";
import Markdown from "./Markdown";
import VulnerabilityPanel from "./VulnerabilityPanel";
import { JiraCard, KafkaCard, PullRequestCard, ServiceNowCard } from "./ContextCards";
import LoginView from "./LoginView";
import McpConnectModal from "./McpConnectModal";
import AntigravityLoginModal from "./AntigravityLoginModal";

function hasProposalConfirmation(text) {
  if (!text) return false;
  const lower = text.toLowerCase();

  // 1. Must contain an actual unified diff block (```diff or ```patch) with added/modified lines (+ or -)
  const hasDiffBlock = lower.includes("```diff") || lower.includes("```patch");
  if (!hasDiffBlock) {
    return false;
  }
  const hasDiffLines = /\n\+[^+]/.test(text) || /\n\-[^-]/.test(text);
  if (!hasDiffLines) {
    return false;
  }

  // 2. Must contain an explicit prompt asking the user to accept/confirm before creating branch/PR
  const explicitConfirmationPrompts = [
    /reply with ['"]?(accept|proceed)/i,
    /click (on )?['"]?accept/i,
    /accept & create pr/i,
    /accept and create (a )?(pull request|pr)/i,
    /ask for (user )?confirmation before committing/i,
    /user confirmation (is )?required/i,
    /please review the proposed (file|vulnerability|pom)?\s*(changes|fix|diff)?\s*above/i,
    /confirm (to|before) (proceed|creating|raising|opening)/i,
    /proceed with creating the (feature )?branch/i,
    /authorize the agent to create/i,
    /remediate the parent project/i,
    /parent project.*remediation/i,
    /fix parent project/i
  ];

  const hasExplicitPrompt = explicitConfirmationPrompts.some((pattern) => pattern.test(text));

  // 3. Exclude read-only responses (e.g. existing PR inspection or closed PR summaries)
  const isPastOrReadOnlyQuery =
    (lower.includes("existing pull request") || lower.includes("already exists") || lower.includes("open pull requests in")) &&
    !lower.includes("reply with 'accept'") &&
    !lower.includes("reply with accept");

  return hasExplicitPrompt && !isPastOrReadOnlyQuery;
}

function ThinkingBox({ message, onToggle, onExtendWait, onStop }) {
  const isThinking = message.isThinking;
  const isExpanded = message.expandedThinking ?? true;
  const stepCount = message.thoughts ? message.thoughts.length : 0;
  const toolsCount = message.toolsUsed ? message.toolsUsed.length : 0;

  // Detect elapsed seconds from current thought, e.g. "(48s)"
  const elapsedMatch = message.currentThought ? message.currentThought.match(/\((\d+)s\)/) : null;
  const elapsedSec = elapsedMatch ? parseInt(elapsedMatch[1], 10) : 0;
  const isLongRunning = isThinking && elapsedSec >= 45;

  return (
    <div className={`thinking-box ${isThinking ? "active" : "finished"}`}>
      <button
        type="button"
        className="thinking-header"
        onClick={onToggle}
        aria-expanded={isExpanded}
      >
        <div className="thinking-title">
          <Sparkles className={`thinking-sparkle ${isThinking ? "pulse" : ""}`} size={14} />
          {isThinking ? (
            <span className="thinking-status">
              Thinking: <span className="current-thought">{message.currentThought || "Processing..."}</span>
            </span>
          ) : (
            <span className="thinking-status">
              Thought process ({stepCount} step{stepCount === 1 ? "" : "s"}{toolsCount > 0 ? `, ${toolsCount} tool${toolsCount === 1 ? "" : "s"}` : ""})
            </span>
          )}
        </div>
        <div className="thinking-toggle-icon">
          {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </div>
      </button>

      {isExpanded && (
        <div className="thinking-body">
          <ul className="thinking-steps">
            {(message.thoughts || []).map((thought, idx) => (
              <li key={idx} className="thinking-step">
                <span className="step-dot" />
                <span className="step-text">{thought}</span>
              </li>
            ))}
            {isThinking && (
              <li className="thinking-step current">
                <span className="step-dot pulsing" />
                <span className="step-text italic">Working...</span>
              </li>
            )}
          </ul>
        </div>
      )}

      {/* VS Code Copilot style long-running confirmation card */}
      {isLongRunning && !message.waitExtended && (
        <div className="long-running-card">
          <div className="long-running-header">
            <Clock size={15} className="pulsing-clock" />
            <span>It's been a long while ({elapsedSec}s) — do you want to continue waiting?</span>
          </div>
          <p className="long-running-desc">
            Multi-file code changes, Jira requirement analysis, and unified diff generation can take several minutes.
          </p>
          <div className="long-running-actions">
            <button
              type="button"
              className="long-running-btn continue"
              onClick={onExtendWait}
            >
              <Check size={13} />
              Continue waiting
            </button>
            <button
              type="button"
              className="long-running-btn stop"
              onClick={onStop}
            >
              <Square size={13} fill="currentColor" />
              Stop generating
            </button>
          </div>
        </div>
      )}

      {message.waitExtended && isThinking && (
        <div className="long-running-extended-badge">
          <Check size={12} />
          <span>Wait extended: agent is continuing code analysis and diff generation...</span>
        </div>
      )}
    </div>
  );
}

const sidebarSections = [
  {
    title: "Services",
    items: [
      { icon: Share2, label: "EMH Hub", href: "#", active: true },
      { icon: Waypoints, label: "Kafka Connectors", href: "https://uat.emh.ei.se.com/cc/kafka-connect-ui/#/cluster/kafka-connect-1" },
      { icon: Search, label: "AKHQ", href: "https://dev.emh.ei.se.com/akhq-sbx/ui/login" }
    ]
  },
  {
    title: "Operations",
    items: [
      { icon: CircleUserRound, label: "Service Now", href: "https://schneider.service-now.com/now/nav/ui/classic/params/target/%24pa_dashboard.do%3Fsysparm_dashboard%3Dbf4f3c8b8752c110a68865bc8bbb353b" },
      { icon: Diamond, label: "Jira Board", href: "https://jira.se.com/secure/RapidBoard.jspa?rapidView=4542&selectedIssue=INTSOL-31673&quickFilter=39230" },
      { icon: GitBranch, label: "Git Repository", href: "https://github.schneider-electric.com/ifw-microservices/" },
      { icon: CircleDot, label: "JFrog Artifactory", href: "https://global-artifacts.se.com/ui/builds/" }
    ]
  },
  {
    title: "Docs",
    items: [
      { icon: FileText, label: "Application Docs", href: "https://schneiderelectric.sharepoint.com/sites/IFW/Shared%20Documents/Forms/AllItems.aspx?id=%2Fsites%2FIFW%2FShared%20Documents%2FGeneral%2FIFW%20DevOps%2FDelivery%2FEMH&viewid=a1e61944%2D92f6%2D42cf%2D9c98%2D752025b4cfcf&as=json&ovuser=6e51e1ad%2Dc54b%2D4b39%2Db598%2D0ffe9ae68fef%2CSESA720729%40se%2Ecom&OR=Teams%2DHL&CT=1755161308377&clickparams=eyJBcHBOYW1lIjoiVGVhbXMtRGVza3RvcCIsIkFwcFZlcnNpb24iOiIxNDE1LzI1MDcxNzE0ODE1IiwiSGFzRmVkZXJhdGVkVXNlciI6ZmFsc2V9" },
      { icon: BookOpen, label: "Tutorials/KT", href: "https://schneiderelectric.sharepoint.com/sites/IFW/Shared%20Documents/Forms/AllItems.aspx?id=%2Fsites%2FIFW%2FShared%20Documents%2FGeneral%2FIFW%20DevOps%2FDelivery%2FEMH%2FKT&viewid=a1e61944%2D92f6%2D42cf%2D9c98%2D752025b4cfcf&as=json&ovuser=6e51e1ad%2Dc54b%2D4b39%2Db598%2D0ffe9ae68fef%2CSESA720729%40se%2Ecom&OR=Teams%2DHL&CT=1755161308377&clickparams=eyJBcHBOYW1lIjoiVGVhbXMtRGVza3RvcCIsIkFwcFZlcnNpb24iOiIxNDE1LzI1MDcxNzE0ODE1IiwiSGFzRmVkZXJhdGVkVXNlciI6ZmFsc2V9" }
    ]
  }
];

const starterMessages = [
  {
    id: "welcome-1",
    role: "assistant",
    text: "Hello, I am EMH-AI-ASSISTANT. Ask about Kafka, ServiceNow, Jira, Git, Confluence, and code changes."
  }
];

const DEFAULT_MCP_SERVERS = [
  { id: "jira", name: "Atlassian Jira", hostUrl: "https://jira.se.com", loginUrl: "https://jira.se.com/login.jsp", authSource: "NONE", authenticated: false },
  { id: "github_enterprise", name: "Enterprise GitHub (ifw-microservices)", hostUrl: "https://github.schneider-electric.com", loginUrl: "https://github.schneider-electric.com/login", authSource: "ENV_FALLBACK", authenticated: true },
  { id: "jfrog", name: "JFrog Artifactory & Xray", hostUrl: "https://global-artifacts.se.com", loginUrl: "https://global-artifacts.se.com/ui/login/", authSource: "ENV_FALLBACK", authenticated: true },
  { id: "servicenow", name: "ServiceNow ITSM", hostUrl: "https://schneider.service-now.com", loginUrl: "https://schneider.service-now.com/navpage.do", authSource: "NONE", authenticated: false },
  { id: "outlook", name: "Microsoft Outlook Mail", hostUrl: "https://outlook.office.com", loginUrl: "https://outlook.office.com", authSource: "NONE", authenticated: false },
  { id: "confluence", name: "Atlassian Confluence", hostUrl: "https://confluence.se.com", loginUrl: "https://confluence.se.com/login.action", authSource: "NONE", authenticated: false }
];

function App() {
  const [prompt, setPrompt] = useState("");
  const [mode, setMode] = useState("chat");
  const [provider, setProvider] = useState("copilot");
  const [providerInfo, setProviderInfo] = useState({ activeProvider: "copilot", activeModel: "", providers: [] });
  const [sessionId, setSessionId] = useState("");
  const [messages, setMessages] = useState(starterMessages);
  const [isLoading, setIsLoading] = useState(false);
  const [healthStatus, setHealthStatus] = useState("checking");
  const [error, setError] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState([]);
  const [speakingMessageId, setSpeakingMessageId] = useState(null);
  const [contextExpanded, setContextExpanded] = useState(false);

  // Authentication & Dynamic Session Tokens
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    return sessionStorage.getItem("emh_authenticated") === "true";
  });
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      return JSON.parse(sessionStorage.getItem("emh_user")) || { username: "kamleshkumar.choubey", provider: "copilot" };
    } catch {
      return { username: "kamleshkumar.choubey", provider: "copilot" };
    }
  });
  const [llmProviders, setLlmProviders] = useState([]);
  const [mcpServers, setMcpServers] = useState(DEFAULT_MCP_SERVERS);
  const [showMcpModal, setShowMcpModal] = useState(false);
  const [mcpServerStatus, setMcpServerStatus] = useState({});
  const [warningMessage, setWarningMessage] = useState("");
  const [showAntigravityLoginModal, setShowAntigravityLoginModal] = useState(false);

  const recognitionRef = useRef(null);
  const fileInputRef = useRef(null);
  const promptBeforeRecordRef = useRef("");
  const abortControllerRef = useRef(null);
  const sessionIdRef = useRef("");

  useEffect(() => {
    let cancelled = false;

    async function loadHealth() {
      try {
        await checkHealth();
        if (!cancelled) {
          setHealthStatus("online");
        }
      } catch {
        if (!cancelled) {
          setHealthStatus("offline");
        }
      }
    }

    async function loadProviders() {
      try {
        const info = await fetchProviders();
        if (!cancelled && info) {
          setProviderInfo(info);
        }
        const sid = sessionIdRef.current || sessionId;
        const llmList = await fetchLlmProviders(sid);
        if (!cancelled && Array.isArray(llmList) && llmList.length > 0) {
          setLlmProviders(llmList);
        }
        const mcpList = await fetchMcpServers(sid);
        if (!cancelled && Array.isArray(mcpList)) {
          setMcpServers(mcpList);
          const initialStatus = {};
          mcpList.forEach(s => {
            initialStatus[s.id] = s.authenticated ? "connected" : "not_connected";
          });
          setMcpServerStatus(initialStatus);
        }
      } catch (err) {
        console.warn("Could not load provider info", err);
      }
    }

    loadHealth();
    loadProviders();
    return () => {
      cancelled = true;
      if (abortControllerRef.current) {
        try {
          abortControllerRef.current.abort();
        } catch {
          // ignore
        }
      }
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {
          // ignore
        }
      }
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  // Listen for popup window authentication completions
  useEffect(() => {
    function handleWindowMessage(event) {
      if (event.data && event.data.type === "MCP_AUTH_SUCCESS") {
        const svcId = event.data.service;
        if (svcId) {
          setMcpServerStatus((prev) => ({ ...prev, [svcId]: "connected" }));
          window.dispatchEvent(new CustomEvent("emh_dashboard_refresh", { detail: { service: svcId } }));
        }
      } else if (event.data && event.data.type === "MCP_AUTH_FAILED") {
        const svcId = event.data.service;
        if (svcId) {
          setMcpServerStatus((prev) => ({ ...prev, [svcId]: "failed" }));
        }
      }
    }
    window.addEventListener("message", handleWindowMessage);
    return () => window.removeEventListener("message", handleWindowMessage);
  }, []);

  function handleProviderChange(newProvider) {
    if (newProvider === "antigravity") {
      const isAgAuth = sessionStorage.getItem("emh_auth_antigravity") === "true";
      if (!isAgAuth) {
        setShowAntigravityLoginModal(true);
        return;
      }
    }
    setProvider(newProvider);
  }

  async function handleAntigravityAuthSuccess(token) {
    const sid = sessionIdRef.current || sessionId;
    try {
      await saveSessionToken({
        sessionId: sid,
        service: "antigravity",
        token: token,
        username: currentUser?.username || "kamleshkumar.choubey"
      });
    } catch (e) {
      console.warn("Could not save Antigravity token to session:", e);
    }
    sessionStorage.setItem("emh_auth_antigravity", "true");
    setProvider("antigravity");
    setShowAntigravityLoginModal(false);
  }

  function handleAntigravityAuthCancel() {
    setShowAntigravityLoginModal(false);
    // Revert to copilot by default per Requirement 1
    setProvider("copilot");
  }

  function handleModeChange(newMode) {
    setMode(newMode);
    if (newMode === "agent") {
      setShowMcpModal(true);
    }
  }

  function handleConnectMcpServer(svc) {
    setMcpServerStatus((prev) => ({ ...prev, [svc.id]: "in_progress" }));
    const sid = sessionIdRef.current || sessionId;
    const popup = window.open(
      getMcpLoginPopupUrl(svc.id, sid),
      `mcp_auth_${svc.id}`,
      "width=600,height=720,status=no,toolbar=no,menubar=no,scrollbars=yes"
    );

    if (!popup) {
      setMcpServerStatus((prev) => ({ ...prev, [svc.id]: "failed" }));
      return;
    }

    const timer = setInterval(() => {
      if (popup.closed) {
        clearInterval(timer);
        setTimeout(() => {
          setMcpServerStatus((prev) => {
            if (prev[svc.id] === "in_progress") {
              return { ...prev, [svc.id]: "failed" };
            }
            return prev;
          });
        }, 500);
      }
    }, 600);
  }

  function handleContinueAgentMode() {
    setShowMcpModal(false);
    window.dispatchEvent(new CustomEvent("emh_dashboard_refresh", { detail: { service: "all" } }));
    const unauth = mcpServers.filter((s) => mcpServerStatus[s.id] !== "connected");
    if (unauth.length > 0) {
      const names = unauth.map((s) => s.name).join(", ");
      setWarningMessage(
        `Warning: Following application login failed so agent mode will work with available access only: ${names}`
      );
    } else {
      setWarningMessage("");
    }
  }

  function handleCloseMcpModalFallback() {
    setShowMcpModal(false);
    window.dispatchEvent(new CustomEvent("emh_dashboard_refresh", { detail: { service: "all" } }));
    // User closed popup: fallback to .env tokens. If .env lacks or has wrong access token, show warning
    const failedOrMissingInEnv = mcpServers.filter(
      (s) => mcpServerStatus[s.id] !== "connected" && (s.authSource === "NONE" || !s.authenticated)
    );
    if (failedOrMissingInEnv.length > 0) {
      const names = failedOrMissingInEnv.map((s) => s.name).join(", ");
      setWarningMessage(
        `Warning: Following application login failed so agent mode will work with available access only: ${names}`
      );
    } else {
      setWarningMessage("");
    }
  }

  async function handleLogout() {
    const sid = sessionIdRef.current || sessionId;
    try {
      await logoutSession(sid);
    } catch (e) {
      console.warn("Logout error:", e);
    }
    sessionStorage.removeItem("emh_authenticated");
    sessionStorage.removeItem("emh_user");
    sessionStorage.removeItem("emh_auth_antigravity");
    setIsAuthenticated(false);
  }

  async function handleLoginSuccess(selectedProvider, token, username) {
    const sid = sessionIdRef.current || sessionId;
    try {
      await saveSessionToken({
        sessionId: sid,
        service: selectedProvider,
        token: token,
        username: username
      });
    } catch (e) {
      console.warn("Could not save initial login token:", e);
    }
    sessionStorage.setItem("emh_authenticated", "true");
    sessionStorage.setItem("emh_user", JSON.stringify({ username, provider: selectedProvider }));
    if (selectedProvider === "antigravity") {
      sessionStorage.setItem("emh_auth_antigravity", "true");
    }
    setCurrentUser({ username, provider: selectedProvider });
    setProvider(selectedProvider);
    setIsAuthenticated(true);
  }

function detectLanguage(text) {
  if (!text) return "en-US";

  // 1. Script-based Unicode detection (100% accurate for non-Latin scripts)
  if (/[\u0900-\u097F]/.test(text)) return "hi-IN"; // Hindi / Devanagari
  if (/[\u0980-\u09FF]/.test(text)) return "bn-IN"; // Bengali
  if (/[\u0B80-\u0BFF]/.test(text)) return "ta-IN"; // Tamil
  if (/[\u0C00-\u0C7F]/.test(text)) return "te-IN"; // Telugu
  if (/[\u0A80-\u0AFF]/.test(text)) return "gu-IN"; // Gujarati
  if (/[\u0D00-\u0D7F]/.test(text)) return "ml-IN"; // Malayalam
  if (/[\u0C80-\u0CFF]/.test(text)) return "kn-IN"; // Kannada
  if (/[\u0600-\u06FF]/.test(text)) return "ar-SA"; // Arabic / Urdu
  if (/[\u4E00-\u9FFF]/.test(text)) return "zh-CN"; // Chinese
  if (/[\u3040-\u30FF]/.test(text)) return "ja-JP"; // Japanese
  if (/[\uAC00-\uD7AF]/.test(text)) return "ko-KR"; // Korean
  if (/[\u0400-\u04FF]/.test(text)) return "ru-RU"; // Russian / Cyrillic
  if (/[\u0E00-\u0E7F]/.test(text)) return "th-TH"; // Thai
  if (/[\u0370-\u03FF]/.test(text)) return "el-GR"; // Greek
  if (/[\u0590-\u05FF]/.test(text)) return "he-IL"; // Hebrew

  // 2. Vocabulary-based detection for European / Latin-script languages
  const lower = text.toLowerCase();
  const frenchWords = /\b(bonjour|merci|avec|dans|pour|sont|cette|aussi|nous|vous|mais|faire|comme|est|une|des|le|la|les|ce)\b/g;
  const spanishWords = /\b(hola|gracias|para|como|pero|este|esta|todo|bien|hacer|tiempo|puede|es|una|los|las|del|por)\b/g;
  const germanWords = /\b(hallo|danke|nicht|oder|aber|wird|wenn|auch|nach|ihre|durch|kann|ist|und|der|die|das|ein|eine)\b/g;
  const italianWords = /\b(ciao|grazie|questo|questa|come|anche|sono|perche|quando|tutto|con|della|gli|le)\b/g;
  const portugueseWords = /\b(ola|obrigado|muito|para|como|mais|este|esta|voce|fazer|com|sao|nao)\b/g;

  const frCount = (lower.match(frenchWords) || []).length;
  const esCount = (lower.match(spanishWords) || []).length;
  const deCount = (lower.match(germanWords) || []).length;
  const itCount = (lower.match(italianWords) || []).length;
  const ptCount = (lower.match(portugueseWords) || []).length;

  const counts = [
    { lang: "fr-FR", count: frCount },
    { lang: "es-ES", count: esCount },
    { lang: "de-DE", count: deCount },
    { lang: "it-IT", count: itCount },
    { lang: "pt-BR", count: ptCount }
  ];
  counts.sort((a, b) => b.count - a.count);
  if (counts[0].count >= 3) {
    return counts[0].lang;
  }

  return "en-US";
}

  function speakText(text, msgId) {
    const synth = window.speechSynthesis;
    if (!synth) {
      setError("Text-to-speech is not supported in this browser.");
      return;
    }

    if (speakingMessageId === msgId) {
      synth.cancel();
      setSpeakingMessageId(null);
      return;
    }

    synth.cancel();

    // Clean up code blocks and markdown markers for natural speech
    const cleanText = text
      .replace(/```[\s\S]*?```/g, "Code block omitted.")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/[*_#~>]/g, "")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .trim();

    if (!cleanText) return;

    const detectedLang = detectLanguage(cleanText);
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = detectedLang;
    utterance.rate = 1.0;

    // Pick matching voice from synth.getVoices()
    const voices = synth.getVoices() || [];
    const langPrefix = detectedLang.split("-")[0].toLowerCase();
    const voice = voices.find(
      (v) => v.lang === detectedLang || (v.lang && v.lang.toLowerCase().startsWith(langPrefix))
    );
    if (voice) {
      utterance.voice = voice;
    }

    utterance.onend = () => setSpeakingMessageId(null);
    utterance.onerror = () => setSpeakingMessageId(null);

    setSpeakingMessageId(msgId);
    synth.speak(utterance);
  }

  const modeDescription = useMemo(() => {
    if (mode === "agent") {
      return "Agent mode uses MCP tools for actions across Jira, Git, JFrog, and more.";
    }
    return "Chat mode answers directly without MCP tools to reduce token and tool usage.";
  }, [mode]);

  function toggleThinking(id) {
    setMessages((current) =>
      current.map((msg) =>
        msg.id === id ? { ...msg, expandedThinking: !msg.expandedThinking } : msg
      )
    );
  }

  function toggleVoiceInput() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError("Speech recognition is not supported in this browser. Please use Chrome, Edge, or Safari.");
      return;
    }

    if (isRecording) {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {
          // ignore
        }
      }
      setIsRecording(false);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = "en-US";

      promptBeforeRecordRef.current = prompt;

      recognition.onstart = () => {
        setIsRecording(true);
        setError("");
      };

      recognition.onresult = (event) => {
        let transcript = "";
        for (let i = 0; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
        }
        const base = promptBeforeRecordRef.current;
        setPrompt(base ? `${base} ${transcript}` : transcript);
      };

      recognition.onerror = (event) => {
        console.warn("Speech recognition error:", event.error);
        if (event.error !== "no-speech") {
          setError(`Speech recognition: ${event.error}`);
        }
        setIsRecording(false);
      };

      recognition.onend = () => {
        setIsRecording(false);
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err) {
      console.error("Speech recognition error:", err);
      setError("Could not start microphone. Please check permissions.");
      setIsRecording(false);
    }
  }

  function handleAttachClick() {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  }

  function handleFileSelect(event) {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;

    files.forEach((file) => {
      if (file.size > 2 * 1024 * 1024) {
        setError(`File "${file.name}" exceeds the 2MB size limit.`);
        return;
      }
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target.result;
        setAttachedFiles((prev) => {
          if (prev.some((f) => f.name === file.name)) {
            return prev.map((f) => (f.name === file.name ? { name: file.name, size: file.size, content } : f));
          }
          return [...prev, { name: file.name, size: file.size, content }];
        });
      };
      reader.onerror = () => {
        setError(`Failed to read file "${file.name}".`);
      };
      reader.readAsText(file);
    });

    event.target.value = "";
  }

  function removeAttachedFile(indexToRemove) {
    setAttachedFiles((prev) => prev.filter((_, idx) => idx !== indexToRemove));
  }

  function stopGenerating() {
    if (abortControllerRef.current) {
      try {
        abortControllerRef.current.abort();
      } catch {
        // ignore
      }
      abortControllerRef.current = null;
    }

    if (sessionId) {
      cancelGeneration(sessionId);
    }

    setIsLoading(false);

    setMessages((current) =>
      current.map((msg) => {
        if (!msg.isThinking && !msg.isStreaming) return msg;
        const stoppedNote = msg.text
          ? `${msg.text}\n\n_Generation stopped by user._`
          : "_Generation stopped by user._";
        return {
          ...msg,
          isThinking: false,
          isStreaming: false,
          expandedThinking: false,
          text: stoppedNote
        };
      })
    );
  }

  function handleExtendWait(messageId) {
    setMessages((current) =>
      current.map((msg) => {
        if (msg.id !== messageId) return msg;
        return {
          ...msg,
          waitExtended: true,
          thoughts: [...(msg.thoughts || []), "Wait extended: continuing generation for complex task..."]
        };
      })
    );
  }

  async function executePrompt(textToSend, attachmentsToSend = attachedFiles) {
    if (isRecording && recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // ignore
      }
      setIsRecording(false);
    }

    const trimmedPrompt = (textToSend !== undefined ? textToSend : prompt).trim();
    if ((!trimmedPrompt && attachmentsToSend.length === 0) || isLoading) {
      return;
    }

    if (abortControllerRef.current) {
      try {
        abortControllerRef.current.abort();
      } catch {
        // ignore
      }
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setError("");
    setIsLoading(true);

    let payloadPrompt = trimmedPrompt;
    if (attachmentsToSend.length > 0) {
      const isVulnCsv = attachmentsToSend.some((f) =>
        (f.name.endsWith(".csv") || f.name.includes("vuln")) &&
        (f.content.toLowerCase().includes("project") || f.content.toLowerCase().includes("cve") || f.content.toLowerCase().includes("component") || f.content.toLowerCase().includes("module"))
      );
      const fileContext = attachmentsToSend
        .map((f) => `=== Attached File: ${f.name} ===\n${f.content}\n=== End of ${f.name} ===`)
        .join("\n\n");
      payloadPrompt = trimmedPrompt
        ? `${fileContext}\n\nUser Question/Instruction:\n${trimmedPrompt}`
        : (isVulnCsv
            ? `${fileContext}\n\nFix vulnerabilities from the attached vulnerability report. First check and remediate the parent project vulnerabilities (if Spring Boot parent, update to latest stable version; if organizational parent, get consent and remediate parent first), create feature branch from develop, run all test cases with mvn clean install and fix, then show the file changes difference and wait for my approval before raising the pull request targeting develop, then update parent version in child project and fix child-level vulnerabilities.`
            : `${fileContext}\n\nPlease analyze and explain the attached file(s).`);
    }

    const currentAttachments = [...attachmentsToSend];
    const userDisplayPrompt = trimmedPrompt || `Attached: ${currentAttachments.map((f) => f.name).join(", ")}`;

    const userMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      text: userDisplayPrompt,
      attachments: currentAttachments.map((f) => ({ name: f.name, size: f.size }))
    };

    const assistantMsgId = `a-${Date.now()}`;
    const assistantMessage = {
      id: assistantMsgId,
      role: "assistant",
      text: "",
      isStreaming: true,
      isThinking: true,
      currentThought: "Initializing...",
      thoughts: ["Initializing conversation session..."],
      toolsUsed: [],
      expandedThinking: true
    };

    setMessages((current) => [...current, userMessage, assistantMessage]);
    setPrompt("");
    setAttachedFiles([]);

    try {
      let accumulatedText = "";
      const activeSessionId = sessionIdRef.current || sessionId;
      const isVulnFixPrompt = payloadPrompt.toLowerCase().includes("fix vulnerabilit") ||
        (attachmentsToSend.length > 0 && attachmentsToSend.some(f => (f.name.endsWith(".csv") || f.name.includes("vuln")) && (f.content.toLowerCase().includes("project") || f.content.toLowerCase().includes("cve"))));
      const effectiveMode = (mode === "chat" && (
        payloadPrompt.toLowerCase().includes("accept and create pull request") ||
        payloadPrompt.toLowerCase().includes("create pr") ||
        isVulnFixPrompt
      )) ? "agent" : mode;

      await sendPromptStream({
        prompt: payloadPrompt,
        mode: effectiveMode,
        sessionId: activeSessionId,
        provider: provider !== "default" ? provider : undefined,
        signal: controller.signal,
        onThinking: (thought) => {
          setMessages((current) =>
            current.map((msg) => {
              if (msg.id !== assistantMsgId) return msg;
              const thoughts = msg.thoughts || [];
              const isProgressTick = /\(\d+s\)$/.test(thought);
              let updatedThoughts;
              if (isProgressTick && thoughts.length > 0 && /\(\d+s\)$/.test(thoughts[thoughts.length - 1])) {
                updatedThoughts = [...thoughts.slice(0, -1), thought];
              } else if (thoughts[thoughts.length - 1] === thought) {
                updatedThoughts = thoughts;
              } else {
                updatedThoughts = [...thoughts, thought];
              }
              return {
                ...msg,
                isThinking: true,
                currentThought: thought,
                thoughts: updatedThoughts
              };
            })
          );
        },
        onToolCall: (toolName, toolPayload) => {
          setMessages((current) =>
            current.map((msg) => {
              if (msg.id !== assistantMsgId) return msg;
              const toolsUsed = msg.toolsUsed || [];
              const updatedTools = toolsUsed.includes(toolName) ? toolsUsed : [...toolsUsed, toolName];
              const thoughts = msg.thoughts || [];
              const toolThought = `Calling tool: ${toolName}...`;
              const updatedThoughts = thoughts.includes(toolThought) ? thoughts : [...thoughts, toolThought];
              return {
                ...msg,
                isThinking: true,
                currentThought: toolThought,
                thoughts: updatedThoughts,
                toolsUsed: updatedTools
              };
            })
          );
        },
        onToolResult: (toolName, result, status) => {
          setMessages((current) =>
            current.map((msg) => {
              if (msg.id !== assistantMsgId) return msg;
              const thoughts = msg.thoughts || [];
              const finishThought = `Completed tool: ${toolName} (${status || "done"})`;
              return {
                ...msg,
                currentThought: finishThought,
                thoughts: [...thoughts, finishThought]
              };
            })
          );
        },
        onChunk: (chunk) => {
          accumulatedText += chunk;
          setMessages((current) =>
            current.map((msg) => {
              if (msg.id !== assistantMsgId) return msg;
              return {
                ...msg,
                isStreaming: true,
                isThinking: false,
                expandedThinking: true,
                text: accumulatedText
              };
            })
          );
        },
        onDone: (result, eventData) => {
          const sid = result?.sessionId || eventData?.sessionId || result?.raw?.sessionId;
          if (sid) {
            setSessionId(sid);
            sessionIdRef.current = sid;
          }
          const finalResponse = result?.response || accumulatedText;
          const toolsUsed = Array.isArray(result?.toolsUsed) ? result.toolsUsed : [];
          setMessages((current) =>
            current.map((msg) => {
              if (msg.id !== assistantMsgId) return msg;
              const cleanThoughts = (msg.thoughts || []).map((t) =>
                t === "Delivering response..." ? "Response delivered" : t
              );
              return {
                ...msg,
                isStreaming: false,
                isThinking: false,
                currentThought: "Complete",
                thoughts: cleanThoughts,
                text: finalResponse || msg.text,
                toolsUsed: toolsUsed.length > 0 ? toolsUsed : msg.toolsUsed,
                expandedThinking: true
              };
            })
          );
        },
        onError: (streamError) => {
          setError(streamError);
          setMessages((current) =>
            current.map((msg) => {
              if (msg.id !== assistantMsgId) return msg;
              return {
                ...msg,
                isStreaming: false,
                isThinking: false,
                currentThought: "Error",
                text: msg.text ? `${msg.text}\n\n[Error: ${streamError}]` : `Error: ${streamError}`
              };
            })
          );
        }
      });
    } catch (streamFailure) {
      if (controller.signal.aborted || streamFailure?.name === "AbortError") {
        console.info("Prompt stream aborted by user");
        return;
      }
      console.warn("SSE streaming failed, falling back to sync prompt:", streamFailure);
      try {
        const result = await sendPrompt({
          prompt: payloadPrompt,
          mode,
          sessionId,
          provider: provider !== "default" ? provider : undefined
        });

        if (result?.sessionId) {
          setSessionId(result.sessionId);
        }

        const responseText = result?.response || "No response received.";
        const toolsUsed = Array.isArray(result?.toolsUsed) ? result.toolsUsed : [];

        setMessages((current) =>
          current.map((msg) => {
            if (msg.id !== assistantMsgId) return msg;
            return {
              ...msg,
              isStreaming: false,
              isThinking: false,
              text: responseText,
              toolsUsed
            };
          })
        );
      } catch (syncError) {
        if (controller.signal.aborted || syncError?.name === "AbortError") {
          return;
        }
        const errorMessage = syncError instanceof Error ? syncError.message : "Request failed";
        setError(errorMessage);
        setMessages((current) =>
          current.map((msg) => {
            if (msg.id !== assistantMsgId) return msg;
            return {
              ...msg,
              isStreaming: false,
              isThinking: false,
              text: `Error: ${errorMessage}`
            };
          })
        );
      }
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
      setIsLoading(false);
    }
  }

  async function onSubmit(event) {
    if (event && event.preventDefault) {
      event.preventDefault();
    }
    await executePrompt();
  }

  function handleAcceptProposal(proposalMessage) {
    let enrichedPrompt = "Accept and create pull request";
    const sourceText = proposalMessage?.text || messages.slice().reverse().find((m) => m.role === "assistant" && m.text)?.text || "";

    const jiraMatch = sourceText.match(/\b([A-Z][A-Z0-9]{1,9}-\d{1,6})\b/);
    let repoName = null;
    const fullOrgMatch = sourceText.match(/ifw-microservices\/([a-zA-Z0-9_.-]+)/i);
    if (fullOrgMatch && fullOrgMatch[1] && fullOrgMatch[1].toLowerCase() !== "ifw-microservices") {
      repoName = fullOrgMatch[1].replace(/[`',.:;]/g, "").trim();
    } else {
      const repoWordMatch = sourceText.match(/(?:target\s+)?(?:repo(?:sitory)?|component|service)[\s/:]+[`']?([a-zA-Z0-9_.-]+)[`']?/i);
      if (repoWordMatch && repoWordMatch[1] && repoWordMatch[1].toLowerCase() !== "ifw-microservices") {
        repoName = repoWordMatch[1].replace(/[`',.:;]/g, "").trim();
      }
    }
    if (!repoName) {
      const vulnBranchMatch = sourceText.match(/feature\/vulnerability-fix-([a-zA-Z0-9_.-]+?)-(?:\d+\.\d+\.\d+|fix)/i);
      if (vulnBranchMatch && vulnBranchMatch[1]) {
        repoName = vulnBranchMatch[1].replace(/[`',.:;]/g, "").trim();
      }
    }
    if (!repoName) {
      const vulnProjectMatch = sourceText.match(/(?:Git repository \(project\):|fix vulnerabilities in|vulnerabilities in)\s+[`']?([a-zA-Z0-9_.-]+)[`']?/i);
      if (vulnProjectMatch && vulnProjectMatch[1]) {
        repoName = vulnProjectMatch[1].replace(/[`',.:;]/g, "").trim();
      }
    }
    if (!repoName) {
      const parentRepoMatch = sourceText.match(/(?:parent project|parent repository)[\s/:]+[`']?([a-zA-Z0-9_.-]+)[`']?/i);
      if (parentRepoMatch && parentRepoMatch[1] && parentRepoMatch[1].toLowerCase() !== "ifw-microservices") {
        repoName = parentRepoMatch[1].replace(/[`',.:;]/g, "").trim();
      }
    }

    if (jiraMatch) {
      enrichedPrompt += ` for ${jiraMatch[1]}`;
    }
    if (repoName) {
      enrichedPrompt += ` in repository ifw-microservices/${repoName}`;
    }
    enrichedPrompt += ". The proposed code changes and test cases are approved. Apply the finalized changes directly to the feature branch, compile and test with Maven, verify with spring-boot:run, and raise the pull request to merge into develop. Do not re-clone, re-branch, or re-analyze the code.";

    if (mode === "chat") {
      setMode("agent");
    }

    executePrompt(enrichedPrompt);
  }

  function handleFixVulnerabilities(projectName, releaseVersion) {
    // Restore right panel to original size and restore chat div structure
    setContextExpanded(false);
    let fixPrompt = `Fix vulnerabilities in ${projectName}${releaseVersion && releaseVersion.trim() ? ` release ${releaseVersion.trim()}` : ""}. Check parent project first, create feature branch from develop, run all test cases with mvn clean install and fix, then show me the file changes difference, and wait for my approval before raising the pull request.`;

    if (mode === "chat") {
      setMode("agent");
    }
    executePrompt(fixPrompt);
  }

  function handleModifyProposal() {
    setPrompt("Please adjust the changes: ");
    const inputEl = document.querySelector(".composer input");
    if (inputEl) {
      inputEl.focus();
    }
  }

  if (!isAuthenticated) {
    return (
      <LoginView
        llmProviders={llmProviders}
        onLoginSuccess={handleLoginSuccess}
      />
    );
  }

  return (
    <div className="app-shell">
      <aside className="left-sidebar">
        <div className="brand-row">
          <div className="brand-icon-wrap">
            <Sparkles size={18} />
          </div>
          <div className="brand-text-block">
            <span className="brand-name">EMH-AI-ASSISTANT</span>
            <span className="brand-pill">
              <span className="brand-pill-dot" />
              AI AGENT
            </span>
          </div>
        </div>

        {sidebarSections.map((section) => (
          <div key={section.title} className="sidebar-section">
            <div className="section-title">{section.title}</div>
            {section.items.map((item) => (
              <a key={item.label} href={item.href} target="_blank" rel="noopener noreferrer" className={`nav-item ${item.active ? "active" : ""}`}>
                <item.icon size={18} />
                <span>{item.label}</span>
              </a>
            ))}
          </div>
        ))}
      </aside>

      <main className="main-layout">
        <header className="top-bar">
          <div className="top-actions">
            <div className="header-auth-badge">
              <CircleUserRound size={15} color="#3dcd58" />
              <span>{currentUser?.username || "kamleshkumar.choubey"}</span>
              <span style={{ fontSize: "10px", color: "#38bdf8", background: "rgba(56,189,248,0.15)", padding: "1px 6px", borderRadius: "4px" }}>
                {provider === "antigravity" ? "Antigravity" : "Copilot"}
              </span>
              <button
                className="header-logout-btn"
                title="Logout and clear session tokens"
                onClick={handleLogout}
              >
                <LogOut size={13} />
              </button>
            </div>
            <div className="profile">
              <div className="profile-status">
                <span className={`dot ${healthStatus}`} />
                {healthStatus === "online" ? "Online" : healthStatus === "offline" ? "Offline" : "Checking"}
              </div>
            </div>
          </div>
        </header>

        {warningMessage && (
          <div className="app-warning-banner">
            <div className="app-warning-content">
              <AlertTriangle size={15} color="#eab308" />
              <span>{warningMessage}</span>
            </div>
            <button className="app-warning-close" onClick={() => setWarningMessage("")} title="Dismiss warning">
              <X size={14} />
            </button>
          </div>
        )}

        <div className={`content-grid ${contextExpanded ? "context-expanded" : ""}`}>
          <section className="chat-panel">
            <div className="chat-header">
              <div className="chat-title-group">
                <div className="chat-title-row">
                  <div className="chat-ai-badge-icon">
                    <Bot size={22} />
                  </div>
                  <div className="chat-heading-wrap">
                    <div className="chat-title-line">
                      <h2>ASK EMH-AI-ASSISTANT</h2>
                      <span className="ai-agent-pill">
                        <span className="ai-pulse-dot" />
                        <span>AI AGENT ONLINE</span>
                      </span>
                    </div>
                    <p>Ask about Kafka, ServiceNow, Jira, PRs, code changes...</p>
                  </div>
                </div>
              </div>
              <div className="chat-controls">
                <div className="mode-picker">
                  <div className="provider-label-row">
                    <label htmlFor="providerSelect">LLM Provider</label>
                  </div>
                  <select
                    id="providerSelect"
                    value={provider}
                    onChange={(event) => handleProviderChange(event.target.value)}
                  >
                    {llmProviders.length > 0 ? (
                      llmProviders.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))
                    ) : (
                      <>
                        <option value="copilot">GitHub Copilot</option>
                        <option value="antigravity">Google Antigravity (Gemini)</option>
                      </>
                    )}
                  </select>
                </div>
                <div className="mode-picker">
                  <label htmlFor="modeSelect">Mode</label>
                  <select
                    id="modeSelect"
                    value={mode}
                    onChange={(event) => handleModeChange(event.target.value)}
                  >
                    <option value="chat">Chat</option>
                    <option value="agent">Agent</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="mode-banner">{modeDescription}</div>

            <div className="messages-area">
              {messages.map((message) => (
                <div key={message.id} className={`message-row ${message.role}`}>
                  <div className="avatar">
                    {message.role === "assistant" ? <Bot size={18} /> : <CircleUserRound size={18} />}
                  </div>
                  <div className={message.role === "assistant" ? "bubble has-md" : "bubble"}>
                    {message.role === "assistant" && message.thoughts && message.thoughts.length > 0 && (
                      <ThinkingBox
                        message={message}
                        onToggle={() => toggleThinking(message.id)}
                        onExtendWait={() => handleExtendWait(message.id)}
                        onStop={stopGenerating}
                      />
                    )}
                    {message.role === "assistant" ? (
                      <>
                        <Markdown text={message.text} />
                        {message.isStreaming && <span className="streaming-cursor">▊</span>}
                        {hasProposalConfirmation(message.text) && !message.isStreaming && (
                          <div className="proposal-action-card">
                            <div className="proposal-action-header">
                              <GitBranch size={16} />
                              <span>Proposed Code Changes — User Confirmation Required</span>
                            </div>
                            <p className="proposal-action-desc">
                              Review the proposed diff above. Click <strong>Accept & Create PR</strong> to apply the finalized changes to the feature branch, compile and test with Maven, verify with spring-boot:run, and raise the pull request to merge into develop in GitHub Enterprise.
                            </p>
                            <div className="proposal-action-buttons">
                              <button
                                type="button"
                                className="proposal-btn accept"
                                disabled={isLoading}
                                onClick={() => handleAcceptProposal(message)}
                              >
                                <Check size={15} />
                                Accept & Create PR
                              </button>
                              <button
                                type="button"
                                className="proposal-btn modify"
                                disabled={isLoading}
                                onClick={handleModifyProposal}
                              >
                                <X size={15} />
                                Request Modifications
                              </button>
                            </div>
                          </div>
                        )}
                        {!message.isStreaming && message.text && (
                          <div className="message-actions-bar">
                            <button
                              type="button"
                              className={`read-response-btn ${speakingMessageId === message.id ? "speaking" : ""}`}
                              onClick={() => speakText(message.text, message.id)}
                              title={speakingMessageId === message.id ? "Stop reading" : "Read response out loud"}
                              aria-label={speakingMessageId === message.id ? "Stop reading" : "Read response out loud"}
                            >
                              {speakingMessageId === message.id ? (
                                <>
                                  <VolumeX size={13} />
                                  <span>Stop</span>
                                </>
                              ) : (
                                <>
                                  <Volume2 size={13} />
                                  <span>Read</span>
                                </>
                              )}
                            </button>
                            {message.toolsUsed && message.toolsUsed.length > 0 && (
                              <span className="message-tools-tag">
                                Tools used: {message.toolsUsed.join(", ")}
                              </span>
                            )}
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        {message.attachments && message.attachments.length > 0 && (
                          <div className="message-attachments">
                            {message.attachments.map((att, idx) => (
                              <span key={idx} className="message-attachment-chip">
                                <FileText size={12} />
                                <span>{att.name}</span>
                              </span>
                            ))}
                          </div>
                        )}
                        <div>{message.text}</div>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <form className="composer-container" onSubmit={onSubmit}>
              {attachedFiles.length > 0 && (
                <div className="attached-files-bar">
                  {attachedFiles.map((file, idx) => (
                    <div key={idx} className="file-chip">
                      <FileText size={13} />
                      <span className="file-name" title={file.name}>{file.name}</span>
                      <span className="file-size">({(file.size / 1024).toFixed(1)} KB)</span>
                      <button
                        type="button"
                        className="remove-file-btn"
                        onClick={() => removeAttachedFile(idx)}
                        title="Remove file"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className={`composer ${attachedFiles.length > 0 ? "has-attachments" : ""}`}>
                <input
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  placeholder={
                    isRecording
                      ? "Listening... speak now into your microphone"
                      : "Ask about Kafka, ServiceNow, Jira, PRs, code changes..."
                  }
                />
                <input
                  type="file"
                  ref={fileInputRef}
                  style={{ display: "none" }}
                  multiple
                  onChange={handleFileSelect}
                />
                <button
                  type="button"
                  className={`icon-btn ${isRecording ? "recording" : ""}`}
                  aria-label="voice input"
                  title={isRecording ? "Stop voice recording" : "Voice input (Speech to text)"}
                  onClick={toggleVoiceInput}
                >
                  {isRecording ? <MicOff size={18} /> : <Mic size={18} />}
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label="attach file"
                  title="Attach file(s) to prompt"
                  onClick={handleAttachClick}
                >
                  <Paperclip size={18} />
                </button>
                {isLoading ? (
                  <button
                    type="button"
                    className="send-btn stop"
                    onClick={stopGenerating}
                    title="Stop generating"
                    aria-label="Stop generating"
                  >
                    <Square size={16} fill="currentColor" />
                  </button>
                ) : (
                  <button
                    type="submit"
                    className="send-btn"
                    disabled={!prompt.trim() && attachedFiles.length === 0}
                    title="Send message"
                  >
                    <SendHorizontal size={18} />
                  </button>
                )}
              </div>
            </form>

            {error && <div className="error-banner">{error}</div>}
          </section>

          <aside className={`context-panel ${contextExpanded ? "expanded" : ""}`}>
            <div className="context-header">
              <div className="context-title-row">
                <div className="context-icon-wrap">
                  <Waypoints size={17} />
                </div>
                <div className="context-title-text-wrap">
                  <div className="context-title-flex">
                    <h3>CURRENT SYSTEM CONTEXT</h3>
                    <span className="telemetry-badge">
                      <span className="telemetry-ping" />
                      <span>LIVE</span>
                    </span>
                  </div>
                  <p>Dynamic information linked to the chat</p>
                </div>
                <button
                  type="button"
                  className="context-expand-toggle-btn"
                  onClick={() => setContextExpanded((v) => !v)}
                  title={contextExpanded ? "Collapse right panel" : "Expand all right panel cards"}
                >
                  {contextExpanded ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
                  <span>{contextExpanded ? "Collapse" : "Expand All"}</span>
                </button>
              </div>
            </div>

            <div className="context-cards-container">
              <VulnerabilityPanel sessionId={sessionId} onFixProject={handleFixVulnerabilities} />

              <ServiceNowCard />

              <JiraCard />

              <KafkaCard />

              <PullRequestCard />
            </div>

            <div className="session-id">
              <div>Session: {sessionId || "new session"}</div>
              <div style={{ marginTop: "4px", fontSize: "12px", color: "#8b949e" }}>
                Active LLM: <strong style={{ color: "#58a6ff" }}>{provider !== "default" ? provider : (providerInfo.activeProvider || "copilot")}</strong>
                {providerInfo.activeModel ? ` (${providerInfo.activeModel})` : ""}
              </div>
            </div>
          </aside>
        </div>
      </main>

      {showMcpModal && (
        <McpConnectModal
          mcpServers={mcpServers}
          mcpServerStatus={mcpServerStatus}
          onConnectServer={handleConnectMcpServer}
          onContinue={handleContinueAgentMode}
          onCloseFallback={handleCloseMcpModalFallback}
        />
      )}

      {showAntigravityLoginModal && (
        <AntigravityLoginModal
          onSuccess={handleAntigravityAuthSuccess}
          onCancel={handleAntigravityAuthCancel}
        />
      )}
    </div>
  );
}

export default App;

