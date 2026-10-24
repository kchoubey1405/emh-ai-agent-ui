import React from "react";
import { Shield, X, Check, Loader2, ExternalLink } from "lucide-react";

/**
 * Enterprise MCP Server Connection Modal.
 * Appears when user selects 'Agent' mode from the UI.
 * Connects to configured MCP servers (Jira, Organization Git, JFrog, ServiceNow, Outlook, Confluence).
 * Opens individual login tabs, tracks in-progress status, and updates to green check or red cross.
 */
export default function McpConnectModal({
  mcpServers,
  mcpServerStatus,
  onConnectServer,
  onContinue,
  onCloseFallback
}) {
  return (
    <div className="mcp-modal-overlay">
      <div className="mcp-modal-card">
        <div className="mcp-modal-header">
          <h3>
            <Shield size={19} color="#38bdf8" />
            <span>Connect Enterprise MCP Applications</span>
          </h3>
          <button
            style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", display: "grid", placeItems: "center" }}
            onClick={onCloseFallback}
            title="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="mcp-modal-body">
          <p className="mcp-modal-desc">
            Agent mode requires authorization to query and execute operations across your enterprise systems. Click <strong>Connect</strong> beside each service to authorize in a secure tab. Completed logins will close automatically and persist for this session only.
          </p>

          {mcpServers.map((svc) => {
            const status = mcpServerStatus[svc.id] || "not_connected";

            return (
              <div key={svc.id} className="mcp-server-item">
                <div className="mcp-server-info">
                  <span className="mcp-server-name">{svc.name}</span>
                  <span className="mcp-server-host">{svc.hostUrl}</span>
                </div>
                <div className="mcp-server-actions">
                  {status === "connected" && (
                    <span className="mcp-status-pill connected" style={{ color: "#22c55e", borderColor: "rgba(34, 197, 94, 0.4)", fontWeight: "700" }}>
                      <Check size={13} color="#22c55e" strokeWidth={2.5} /> Connected
                    </span>
                  )}
                  {status === "in_progress" && (
                    <span className="mcp-status-pill in-progress" style={{ color: "#38bdf8", borderColor: "rgba(56, 189, 248, 0.4)", fontWeight: "700" }}>
                      <Loader2 size={13} className="spin" color="#38bdf8" /> Login in progress...
                    </span>
                  )}
                  {status === "failed" && (
                    <span className="mcp-status-pill failed" style={{ color: "#ef4444", borderColor: "rgba(239, 68, 68, 0.5)", fontWeight: "700" }}>
                      <X size={13} color="#ef4444" strokeWidth={2.5} /> Failed
                    </span>
                  )}
                  {status === "not_connected" && (
                    <span className="mcp-status-pill not-connected">
                      Not Connected
                    </span>
                  )}

                  <button
                    className="mcp-connect-btn"
                    onClick={() => onConnectServer(svc)}
                    disabled={status === "in_progress"}
                  >
                    {status === "connected" ? "Re-connect" : status === "failed" ? "Retry Login" : status === "in_progress" ? "Logging in..." : "Connect"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mcp-modal-footer">
          <div className="mcp-modal-notice">
            Agent mode will provide answer based on successful logins of applications.
          </div>
          <div className="mcp-modal-btns">
            <button
              className="btn-secondary"
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
              onClick={onCloseFallback}
              title="Use static tokens configured in .env fallback"
            >
              Skip (.env Fallback)
            </button>
            <button
              className="btn-primary"
              style={{
                padding: "8px 18px",
                borderRadius: "6px",
                background: "#3dcd58",
                color: "#0f172a",
                border: "none",
                fontWeight: "700",
                fontSize: "13px",
                cursor: "pointer"
              }}
              onClick={onContinue}
              title="Continue to Agent Mode"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
