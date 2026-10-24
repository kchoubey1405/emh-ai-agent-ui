import React, { useState, useEffect, useRef } from "react";
import { Bot, Sparkles, Key, ChevronRight, Check, Shield, Loader2, AlertTriangle, RefreshCw } from "lucide-react";
import { getLlmLoginPopupUrl } from "./api";

/**
 * Enterprise Login View for Schneider Electric EMH Platform.
 * Redirects to GitHub Copilot / LLM Provider login in a new window,
 * fetches dynamic access token upon successful completion, and closes the window.
 * If login fails or window is closed without authorization, closes the window
 * and displays the exact failure message with retry / alternate provider options.
 */
export default function LoginView({ llmProviders, onLoginSuccess }) {
  const [authenticatingProvider, setAuthenticatingProvider] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [showManualFallback, setShowManualFallback] = useState(false);
  const [manualToken, setManualToken] = useState("");
  const [manualUser, setManualUser] = useState("kamleshkumar.choubey");

  const popupRef = useRef(null);
  const pollTimerRef = useRef(null);

  const providersToRender = (llmProviders && llmProviders.length > 0)
    ? llmProviders
    : [
        { id: "copilot", name: "GitHub Copilot", isDefault: true },
        { id: "antigravity", name: "Google Antigravity (Gemini)", isDefault: false }
      ];

  function getFailureMessage(p) {
    if (!p) return "Authentication failed, please retry or try other LLM provider login.";
    if (p.id === "copilot" || p.id === "github") {
      return "Copilot login failed, please retry or try other LLM provider login.";
    }
    if (p.id === "antigravity" || p.id === "gemini") {
      return "Antigravity login failed, please retry or try other LLM provider login.";
    }
    const cleanName = p.name ? p.name.replace(/ LLM$/i, "") : p.id;
    return `${cleanName} login failed, please retry or try other LLM provider login.`;
  }

  // Clean up timers and popup on unmount
  useEffect(() => {
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      try {
        if (popupRef.current && !popupRef.current.closed) {
          popupRef.current.close();
        }
      } catch (e) {}
    };
  }, []);

  function handleStartLogin(provider) {
    setErrorMsg("");
    setAuthenticatingProvider(provider);

    const width = 560;
    const height = 720;
    const left = Math.max(0, (window.screen.width / 2) - (width / 2));
    const top = Math.max(0, (window.screen.height / 2) - (height / 2));
    const sessionId = "session-" + Math.random().toString(36).substring(2, 10);
    const popupUrl = getLlmLoginPopupUrl(provider.id, sessionId);

    const popup = window.open(
      popupUrl,
      "llm_oauth_window",
      `width=${width},height=${height},left=${left},top=${top},status=no,toolbar=no,menubar=no,resizable=yes`
    );

    popupRef.current = popup;

    if (!popup || popup.closed || typeof popup.closed === "undefined") {
      setErrorMsg(getFailureMessage(provider) + " (Browser blocked popup window. Please allow popups or use manual entry below.)");
      setAuthenticatingProvider(null);
      return;
    }

    const messageHandler = async (event) => {
      if (!event.data) return;

      if (event.data.type === "LLM_AUTH_SUCCESS" || event.data.type === "MCP_AUTH_SUCCESS") {
        cleanup();
        try {
          if (popup && !popup.closed) popup.close();
        } catch (e) {}
        setAuthenticatingProvider(null);
        await onLoginSuccess(
          provider.id,
          event.data.token || ("session_token_" + Math.random().toString(36).substring(2, 10)),
          event.data.username || "enterprise-user"
        );
      } else if (event.data.type === "LLM_AUTH_FAILED") {
        cleanup();
        try {
          if (popup && !popup.closed) popup.close();
        } catch (e) {}
        setAuthenticatingProvider(null);
        setErrorMsg(getFailureMessage(provider));
      }
    };

    window.addEventListener("message", messageHandler);

    // Poll to detect if user closed the new window without authenticating
    pollTimerRef.current = setInterval(() => {
      try {
        if (popup && popup.closed) {
          cleanup();
          setAuthenticatingProvider(null);
          setErrorMsg(getFailureMessage(provider));
        }
      } catch (e) {
        // Cross-origin access issue, ignore
      }
    }, 800);

    function cleanup() {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
      window.removeEventListener("message", messageHandler);
    }
  }

  function handleCancelLogin() {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    try {
      if (popupRef.current && !popupRef.current.closed) {
        popupRef.current.close();
      }
    } catch (e) {}

    const prov = authenticatingProvider;
    setAuthenticatingProvider(null);
    setErrorMsg(getFailureMessage(prov));
  }

  async function handleManualSubmit(e) {
    if (e) e.preventDefault();
    if (!manualToken.trim()) {
      setErrorMsg("Please provide an access token to authorize this session.");
      return;
    }
    const defaultProvider = providersToRender[0] || { id: "copilot" };
    try {
      await onLoginSuccess(defaultProvider.id, manualToken.trim(), manualUser.trim());
    } catch (err) {
      setErrorMsg("Sign in failed: " + (err.message || "Unknown error"));
    }
  }

  return (
    <div className="login-view-container">
      <div className="login-card">
        <div className="login-brand-header">
          <span className="login-logo-pill">Schneider Electric</span>
          <h2 className="login-title">EMH AI Assistant</h2>
          <p className="login-subtitle">
            Enterprise Middleware Hub Intelligent Pair Programmer. Sign in with your configured LLM Provider to begin your session.
          </p>
        </div>

        {errorMsg && (
          <div style={{
            padding: "12px 16px",
            background: "rgba(239, 68, 68, 0.16)",
            border: "1px solid rgba(239, 68, 68, 0.45)",
            borderRadius: "8px",
            color: "#fca5a5",
            fontSize: "13px",
            display: "flex",
            alignItems: "flex-start",
            gap: "10px",
            lineHeight: 1.45
          }}>
            <AlertTriangle size={18} color="#ef4444" style={{ flexShrink: 0, marginTop: "2px" }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: "600", marginBottom: "2px" }}>Authentication Error</div>
              <div>{errorMsg}</div>
            </div>
          </div>
        )}

        {authenticatingProvider ? (
          <div style={{
            background: "rgba(15, 23, 42, 0.8)",
            border: "1px solid #334155",
            borderRadius: "10px",
            padding: "24px 20px",
            textAlign: "center",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "14px"
          }}>
            <Loader2 size={36} color="#38bdf8" className="spinner-spin" />
            <div>
              <h3 style={{ margin: "0 0 6px 0", fontSize: "16px", color: "#f8fafc" }}>
                Authenticating with {authenticatingProvider.name}
              </h3>
              <p style={{ margin: 0, fontSize: "12.5px", color: "#94a3b8", lineHeight: 1.5 }}>
                A new login window has opened to complete your authentication. Once sign-in succeeds, this window will automatically proceed.
              </p>
            </div>

            <div style={{ display: "flex", gap: "10px", marginTop: "8px" }}>
              <button
                type="button"
                onClick={() => handleStartLogin(authenticatingProvider)}
                style={{
                  padding: "8px 14px",
                  borderRadius: "6px",
                  border: "1px solid #475569",
                  background: "#1e293b",
                  color: "#e2e8f0",
                  cursor: "pointer",
                  fontSize: "12px",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px"
                }}
              >
                <RefreshCw size={13} /> Re-open Login Window
              </button>
              <button
                type="button"
                onClick={handleCancelLogin}
                style={{
                  padding: "8px 14px",
                  borderRadius: "6px",
                  border: "1px solid rgba(239, 68, 68, 0.5)",
                  background: "rgba(239, 68, 68, 0.15)",
                  color: "#f87171",
                  cursor: "pointer",
                  fontSize: "12px"
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="login-provider-list">
            {providersToRender.map((p) => {
              const isCopilot = p.id === "copilot" || p.id === "github";
              const isAntigravity = p.id === "antigravity";
              const btnClass = isCopilot ? "primary-copilot" : isAntigravity ? "primary-antigravity" : "";

              return (
                <button
                  key={p.id}
                  className={`login-provider-btn ${btnClass}`}
                  onClick={() => handleStartLogin(p)}
                >
                  <div className="login-btn-left">
                    {isCopilot ? (
                      <Bot size={22} color="#3dcd58" />
                    ) : isAntigravity ? (
                      <Sparkles size={22} color="#c084fc" />
                    ) : (
                      <Key size={22} color="#38bdf8" />
                    )}
                    <div>
                      <div style={{ textAlign: "left" }}>
                        Sign in with {p.name}
                        {p.isDefault && <span style={{ marginLeft: "8px", fontSize: "11px", color: "#3dcd58", fontWeight: "700" }}>DEFAULT</span>}
                      </div>
                      <div style={{ fontSize: "11.5px", color: "#94a3b8", textAlign: "left" }}>
                        {isCopilot ? "Redirects to GitHub login in new window" : isAntigravity ? "Redirects to Google Antigravity login in new window" : "Redirects to provider login in new window"}
                      </div>
                    </div>
                  </div>
                  <ChevronRight size={18} color="#94a3b8" />
                </button>
              );
            })}

            <div className="login-help-text">
              <Shield size={12} style={{ display: "inline", verticalAlign: "middle", marginRight: "4px" }} />
              Configured via <code>LLM_PROVIDERS</code>. Access tokens are held strictly in session cache and purged on logout or window close.
            </div>

            <div style={{ borderTop: "1px solid #334155", paddingTop: "12px", marginTop: "4px" }}>
              <button
                type="button"
                onClick={() => setShowManualFallback((v) => !v)}
                style={{
                  background: "none",
                  border: "none",
                  color: "#64748b",
                  cursor: "pointer",
                  fontSize: "12px",
                  padding: 0,
                  textDecoration: "underline"
                }}
              >
                {showManualFallback ? "Hide manual token authorization" : "Or authorize session with access token manually"}
              </button>

              {showManualFallback && (
                <form onSubmit={handleManualSubmit} style={{ marginTop: "12px", display: "flex", flexDirection: "column", gap: "10px" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "11.5px", color: "#94a3b8", marginBottom: "4px" }}>
                      User ID / Email:
                    </label>
                    <input
                      type="text"
                      value={manualUser}
                      onChange={(e) => setManualUser(e.target.value)}
                      style={{ width: "100%", padding: "8px 10px", borderRadius: "6px", border: "1px solid #475569", background: "#0f172a", color: "#fff", fontSize: "12.5px", boxSizing: "border-box" }}
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "11.5px", color: "#94a3b8", marginBottom: "4px" }}>
                      Personal Access Token (PAT):
                    </label>
                    <input
                      type="password"
                      placeholder="ghp_... or agy_..."
                      value={manualToken}
                      onChange={(e) => setManualToken(e.target.value)}
                      style={{ width: "100%", padding: "8px 10px", borderRadius: "6px", border: "1px solid #475569", background: "#0f172a", color: "#fff", fontSize: "12.5px", boxSizing: "border-box" }}
                    />
                  </div>
                  <button
                    type="submit"
                    style={{
                      padding: "8px 14px",
                      borderRadius: "6px",
                      border: "none",
                      background: "#38bdf8",
                      color: "#0f172a",
                      fontWeight: "600",
                      fontSize: "12px",
                      cursor: "pointer",
                      marginTop: "4px"
                    }}
                  >
                    Authorize Session Manually
                  </button>
                </form>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
