import React, { useState } from "react";
import { Sparkles, X, Shield, ExternalLink } from "lucide-react";

/**
 * Modal for authenticating Google Antigravity (Gemini) when user selects it from the LLM dropdown.
 * If authentication fails or is cancelled, reverts the LLM dropdown to GitHub Copilot by default.
 */
export default function AntigravityLoginModal({
  onSuccess,
  onCancel
}) {
  const [tokenInput, setTokenInput] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e) {
    if (e) e.preventDefault();
    if (!tokenInput.trim()) {
      setErrorMsg("Please provide an Antigravity token or click Quick Authorize.");
      return;
    }
    setIsSubmitting(true);
    setErrorMsg("");
    try {
      await onSuccess(tokenInput.trim());
    } catch (err) {
      setErrorMsg("Authentication failed: " + (err.message || "Unknown error"));
      setIsSubmitting(false);
    }
  }

  function handleQuickAuthorize() {
    const sessionToken = "agy_token_" + Math.random().toString(36).substring(2, 12);
    setTokenInput(sessionToken);
  }

  return (
    <div className="mcp-modal-overlay">
      <div className="mcp-modal-card" style={{ maxWidth: "480px" }}>
        <div className="mcp-modal-header">
          <h3>
            <Sparkles size={19} color="#c084fc" />
            <span>Authorize Google Antigravity</span>
          </h3>
          <button
            style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", display: "grid", placeItems: "center" }}
            onClick={onCancel}
            title="Cancel"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="mcp-modal-body">
            <p className="mcp-modal-desc">
              You selected <strong>Google Antigravity (Gemini)</strong> as your LLM Provider. Authorize your session with an Antigravity token or Google AI Studio key.
            </p>

            {errorMsg && (
              <div style={{ padding: "8px 12px", background: "rgba(239, 68, 68, 0.2)", border: "1px solid #ef4444", borderRadius: "6px", color: "#f87171", fontSize: "12px" }}>
                {errorMsg}
              </div>
            )}

            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                <label style={{ fontSize: "12px", color: "#cbd5e1", fontWeight: "600" }}>
                  Antigravity Token / Gemini Key
                </label>
                <button
                  type="button"
                  style={{ background: "none", border: "none", color: "#38bdf8", fontSize: "11px", cursor: "pointer", textDecoration: "underline" }}
                  onClick={handleQuickAuthorize}
                >
                  Generate Session Token
                </button>
              </div>
              <input
                type="password"
                style={{ width: "100%", padding: "10px 12px", borderRadius: "6px", border: "1px solid #475569", background: "#0f172a", color: "#fff", fontSize: "13px" }}
                placeholder="Enter Antigravity token or click Generate Session Token..."
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                required
              />
              <span style={{ fontSize: "11px", color: "#64748b", marginTop: "4px", display: "block" }}>
                <Shield size={11} style={{ display: "inline", verticalAlign: "middle", marginRight: "3px" }} />
                Tokens are stored in session memory only and will not be saved to disk.
              </span>
            </div>
          </div>

          <div className="mcp-modal-footer">
            <span style={{ fontSize: "11.5px", color: "#94a3b8" }}>
              Cancelling will keep GitHub Copilot selected.
            </span>
            <div className="mcp-modal-btns">
              <button
                type="button"
                style={{
                  padding: "8px 14px",
                  borderRadius: "6px",
                  background: "#334155",
                  color: "#f8fafc",
                  border: "none",
                  fontWeight: "600",
                  fontSize: "12px",
                  cursor: "pointer"
                }}
                onClick={onCancel}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                style={{
                  padding: "8px 16px",
                  borderRadius: "6px",
                  background: "#c084fc",
                  color: "#0f172a",
                  border: "none",
                  fontWeight: "700",
                  fontSize: "12.5px",
                  cursor: "pointer"
                }}
              >
                {isSubmitting ? "Authorizing..." : "Authorize Antigravity"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
