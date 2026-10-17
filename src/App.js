import { useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpen,
  Bell,
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
  X,
  Check,
  Volume2,
  VolumeX
} from "lucide-react";
import { checkHealth, fetchProviders, sendPrompt, sendPromptStream, cancelGeneration } from "./api";
import Markdown from "./Markdown";
import VulnerabilityPanel from "./VulnerabilityPanel";
import { JiraCard, KafkaCard, PullRequestCard } from "./ContextCards";

function hasProposalConfirmation(text) {
  if (!text) return false;
  const lower = text.toLowerCase();
  return (
    (lower.includes("proposed") || lower.includes("diff") || lower.includes("```diff")) &&
    (lower.includes("accept") || lower.includes("confirm") || lower.includes("pull request") || lower.includes("create pr") || lower.includes("approval"))
  );
}

function ThinkingBox({ message, onToggle, onExtendWait, onStop }) {
  const isThinking = message.isThinking;
  const isExpanded = message.expandedThinking ?? isThinking;
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

function App() {
  const [prompt, setPrompt] = useState("");
  const [mode, setMode] = useState("chat");
  const [provider, setProvider] = useState("default");
  const [providerInfo, setProviderInfo] = useState({ activeProvider: "copilot", activeModel: "", providers: [] });
  const [sessionId, setSessionId] = useState("");
  const [messages, setMessages] = useState(starterMessages);
  const [isLoading, setIsLoading] = useState(false);
  const [healthStatus, setHealthStatus] = useState("checking");
  const [error, setError] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState([]);
  const [speakingMessageId, setSpeakingMessageId] = useState(null);
  const recognitionRef = useRef(null);
  const fileInputRef = useRef(null);
  const promptBeforeRecordRef = useRef("");
  const abortControllerRef = useRef(null);

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
      const fileContext = attachmentsToSend
        .map((f) => `=== Attached File: ${f.name} ===\n${f.content}\n=== End of ${f.name} ===`)
        .join("\n\n");
      payloadPrompt = trimmedPrompt
        ? `${fileContext}\n\nUser Question/Instruction:\n${trimmedPrompt}`
        : `${fileContext}\n\nPlease analyze and explain the attached file(s).`;
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
      await sendPromptStream({
        prompt: payloadPrompt,
        mode,
        sessionId,
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
          const callLabel = `Called tool: ${toolName}`;
          setMessages((current) =>
            current.map((msg) => {
              if (msg.id !== assistantMsgId) return msg;
              const toolsUsed = msg.toolsUsed || [];
              const updatedTools = toolsUsed.includes(toolName) ? toolsUsed : [...toolsUsed, toolName];
              return {
                ...msg,
                isThinking: true,
                currentThought: `Executing tool ${toolName}...`,
                thoughts: [...(msg.thoughts || []), callLabel],
                toolsUsed: updatedTools
              };
            })
          );
        },
        onToolResult: (toolName, result, status) => {
          const resultLabel = `Tool ${toolName} finished (${status})`;
          setMessages((current) =>
            current.map((msg) => {
              if (msg.id !== assistantMsgId) return msg;
              return {
                ...msg,
                thoughts: [...(msg.thoughts || []), resultLabel]
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
                expandedThinking: false,
                text: accumulatedText
              };
            })
          );
        },
        onDone: (result) => {
          if (result?.sessionId) {
            setSessionId(result.sessionId);
          }
          const finalResponse = result?.response || accumulatedText;
          const toolsUsed = Array.isArray(result?.toolsUsed) ? result.toolsUsed : [];
          setMessages((current) =>
            current.map((msg) => {
              if (msg.id !== assistantMsgId) return msg;
              return {
                ...msg,
                isStreaming: false,
                isThinking: false,
                text: finalResponse || msg.text,
                toolsUsed: toolsUsed.length > 0 ? toolsUsed : msg.toolsUsed
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

  function handleAcceptProposal() {
    executePrompt("Accept and create pull request");
  }

  function handleModifyProposal() {
    setPrompt("Please adjust the changes: ");
    const inputEl = document.querySelector(".composer input");
    if (inputEl) {
      inputEl.focus();
    }
  }

  return (
    <div className="app-shell">
      <aside className="left-sidebar">
        <div className="brand-row">
          <Sparkles size={20} />
          <span>EMH-AI-ASSISTANT</span>
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
            <Bell size={18} />
            <div className="profile">
              <CircleUserRound size={24} />
              <div>
                <div className="profile-name">Integration Engineer</div>
                <div className="profile-status">
                  <span className={`dot ${healthStatus}`} />
                  {healthStatus === "online" ? "Online" : healthStatus === "offline" ? "Offline" : "Checking"}
                </div>
              </div>
            </div>
          </div>
        </header>

        <div className="content-grid">
          <section className="chat-panel">
            <div className="chat-header">
              <div>
                <h2>ASK EMH-AI-ASSISTANT</h2>
                <p>Ask about Kafka, ServiceNow, Jira, PRs, code changes...</p>
              </div>
              <div className="chat-controls">
                <div className="mode-picker">
                  <div className="provider-label-row">
                    <label htmlFor="providerSelect">LLM Provider</label>
                    {provider === "antigravity" && (
                      <a
                        href="https://aistudio.google.com/apikey"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="auth-link-badge"
                        title="Google AI Studio API Keys & Authentication"
                      >
                        Auth <ExternalLink size={10} />
                      </a>
                    )}
                  </div>
                  <select
                    id="providerSelect"
                    value={provider}
                    onChange={(event) => setProvider(event.target.value)}
                  >
                    <option value="default">Default ({providerInfo.activeProvider || "Configured"})</option>
                    <option value="antigravity">Antigravity (Gemini)</option>
                    <option value="copilot">GitHub Copilot</option>
                  </select>
                </div>
                <div className="mode-picker">
                  <label htmlFor="modeSelect">Mode</label>
                  <select
                    id="modeSelect"
                    value={mode}
                    onChange={(event) => setMode(event.target.value)}
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
                              Review the proposed diff above. Click <strong>Accept & Create PR</strong> to authorize the agent to create the feature branch, commit the changes, and raise the pull request in GitHub Enterprise.
                            </p>
                            <div className="proposal-action-buttons">
                              <button
                                type="button"
                                className="proposal-btn accept"
                                disabled={isLoading}
                                onClick={handleAcceptProposal}
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

          <aside className="context-panel">
            <h3>CURRENT SYSTEM CONTEXT</h3>
            <p>Dynamic information linked to the chat</p>

            <VulnerabilityPanel />

            <JiraCard />

            <KafkaCard />

            <PullRequestCard />

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
    </div>
  );
}

export default App;

