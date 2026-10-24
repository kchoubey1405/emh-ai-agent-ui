import { useCallback, useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Clock,
  ExternalLink,
  Filter,
  GitPullRequest,
  LifeBuoy,
  RefreshCw,
  RotateCcw,
  RotateCw,
  Server,
  Ticket
} from "lucide-react";
import {
  fetchJiraSummary,
  fetchKafkaSummary,
  fetchPullRequests,
  fetchServiceNowSummary,
  updateServiceNowFilter,
  restartKafkaTask,
  restartKafkaConnector,
  restartFailedKafkaTasks
} from "./api";

const REFRESH_MS = 5 * 60 * 1000;
const RETRY_MS = 15 * 1000;
const VISIBLE_PROJECTS = 8;

/**
 * Loads one dashboard section when the page opens, then keeps it fresh.
 * Returns { data, error, loading, reload }.
 */
export function useSection(fetcher) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const timer = useRef();
  const alive = useRef(true);

  const load = useCallback(
    async (force) => {
      clearTimeout(timer.current);
      setLoading(true);
      let delay = REFRESH_MS;
      try {
        const sid = typeof window !== "undefined" ? sessionStorage.getItem("emh_session_id") || "" : "";
        const body = await fetcher(force, sid);
        if (!alive.current) {
          return;
        }
        if (body?.status === "ERROR") {
          setError(body.message || "Could not load data");
          delay = RETRY_MS;
        } else {
          setData(body);
          setError(body?.stale ? body.message || "Showing the last successful load" : "");
          delay = body?.stale ? RETRY_MS : REFRESH_MS;
        }
      } catch (failure) {
        if (!alive.current) {
          return;
        }
        setError(failure instanceof Error ? failure.message : "Backend not reachable");
        delay = RETRY_MS;
      }
      setLoading(false);
      timer.current = setTimeout(() => load(false), delay);
    },
    [fetcher]
  );

  useEffect(() => {
    alive.current = true;
    load(false);

    function onRefreshEvent() {
      load(true);
    }
    window.addEventListener("emh_dashboard_refresh", onRefreshEvent);

    return () => {
      alive.current = false;
      clearTimeout(timer.current);
      window.removeEventListener("emh_dashboard_refresh", onRefreshEvent);
    };
  }, [load]);

  return { data, error, loading, reload: () => load(true) };
}

export function Card({ icon: Icon, title, headline, state, children, link }) {
  const { data, error, loading, reload } = state;
  return (
    <div className="context-card ctx-card">
      <div className="ctx-head">
        <div className="card-title">
          <Icon size={16} /> {title}
        </div>
        <div className="ctx-tools">
          {link && (
            <a className="vuln-icon-btn" href={link} target="_blank" rel="noopener noreferrer" title="Open in browser">
              <ExternalLink size={13} />
            </a>
          )}
          <button type="button" className="vuln-icon-btn" onClick={reload} disabled={loading} title="Reload">
            <RefreshCw size={13} className={loading ? "spin" : ""} />
          </button>
        </div>
      </div>
      {headline && data && <div className="ctx-headline">{headline}</div>}
      {loading && !data && <div className="ctx-note">Loading...</div>}
      {error && <div className={`ctx-note ${data ? "warn" : "error"}`}>{error}</div>}
      {data && children}
    </div>
  );
}

// ------------------------------------------------------------------ EMH Jira

export function JiraCard() {
  const state = useSection(fetchJiraSummary);
  const { data } = state;
  const rawStatuses = data?.statuses || [];
  // Exclude finished and terminal statuses: Done, Resolved, Closed, Completed, Cancelled, In Production
  const statuses = rawStatuses.filter((row) => {
    const s = (row.status || "").toLowerCase();
    return (
      !s.includes("pushed to production") &&
      !s.includes("in production") &&
      s !== "production" &&
      s !== "closed" &&
      s !== "cancelled" &&
      s !== "canceled" &&
      s !== "done" &&
      s !== "resolved" &&
      s !== "completed"
    );
  });
  const max = Math.max(1, ...statuses.map((row) => Number(row.count) || 0));
  const total = statuses.reduce((sum, row) => sum + (Number(row.count) || 0), 0);

  return (
    <Card icon={Ticket} title="EMH Jira" headline={<>Total tickets: <strong>{total}</strong></>} state={state} link={data?.url}>
      <div className="ctx-rows jira-rows-container">
        {statuses.map((row) => (
          <div key={row.status} className="ctx-row jira-status-row" title={`${row.status}: ${row.count}`}>
            <span className="ctx-row-name jira-status-name">{row.status}</span>
            <span className="ctx-bar jira-status-bar"><span style={{ width: `${((Number(row.count) || 0) / max) * 100}%` }} /></span>
            <strong className="ctx-row-count jira-status-count">{row.count}</strong>
          </div>
        ))}
        {statuses.length === 0 && <div className="ctx-note">No open EMH tickets.</div>}
      </div>
    </Card>
  );
}

// ------------------------------------------------------------------ Pull requests

export function PullRequestCard() {
  const state = useSection(fetchPullRequests);
  const { data } = state;
  const [showAll, setShowAll] = useState(false);
  const projects = data?.projects || [];
  const visible = showAll ? projects : projects.slice(0, VISIBLE_PROJECTS);

  return (
    <Card
      icon={GitPullRequest}
      title="Open Pull Requests"
      headline={<>Total open PRs: <strong>{data?.total ?? 0}</strong> in {projects.length} {projects.length === 1 ? "project" : "projects"}</>}
      state={state}
    >
      <div className="pr-rows-container">
        {visible.map((row) => (
          <a
            key={row.project}
            className="pr-item-card"
            href={row.url}
            target="_blank"
            rel="noopener noreferrer"
            title={`Open pull requests of ${row.project}`}
          >
            <div className="pr-item-left">
              <GitPullRequest size={13} className="pr-item-icon" />
              <span className="pr-item-name">{row.project}</span>
            </div>
            <div className="pr-item-right">
              <span className="pr-count-badge">
                <strong>{row.openPRs}</strong> {row.openPRs === 1 ? "PR" : "PRs"}
              </span>
              <ExternalLink size={11} className="pr-ext-icon" />
            </div>
          </a>
        ))}
        {projects.length === 0 && <div className="ctx-note">No open pull requests.</div>}
      </div>
      {projects.length > VISIBLE_PROJECTS && (
        <button type="button" className="ctx-more" onClick={() => setShowAll((value) => !value)}>
          {showAll ? "Show top " + VISIBLE_PROJECTS : `Show all ${projects.length} projects`}
        </button>
      )}
    </Card>
  );
}

// ------------------------------------------------------------------ Kafka connectors

export function KafkaCard() {
  const state = useSection(fetchKafkaSummary);
  const { data } = state;
  const [open, setOpen] = useState(true);
  const [restarting, setRestarting] = useState({});
  const [actionFeedback, setActionFeedback] = useState({});
  const problems = data?.notRunning || [];

  const handleRestartAll = async (row) => {
    const connectorName = row.name;
    const taskIds = row.failedTaskIds?.length
      ? row.failedTaskIds
      : (row.failedTasks || [])
          .map((t) => parseInt(String(t).replace(/\D/g, ""), 10))
          .filter((n) => !isNaN(n));

    setRestarting((prev) => ({ ...prev, [connectorName]: true }));
    setActionFeedback((prev) => ({ ...prev, [connectorName]: null }));
    try {
      if (taskIds.length > 0) {
        for (const tid of taskIds) {
          await restartKafkaTask(connectorName, tid);
        }
        setActionFeedback((prev) => ({
          ...prev,
          [connectorName]: { type: "success", text: `Task ${taskIds.join(", ")} restart triggered!` }
        }));
      } else {
        await restartKafkaConnector(connectorName);
        setActionFeedback((prev) => ({
          ...prev,
          [connectorName]: { type: "success", text: `Connector ${connectorName} restart triggered!` }
        }));
      }
      setTimeout(() => {
        state.reload();
      }, 1500);
    } catch (err) {
      setActionFeedback((prev) => ({
        ...prev,
        [connectorName]: { type: "error", text: err.message || "Failed to restart" }
      }));
    } finally {
      setRestarting((prev) => ({ ...prev, [connectorName]: false }));
      setTimeout(() => {
        setActionFeedback((prev) => ({ ...prev, [connectorName]: null }));
      }, 6000);
    }
  };

  return (
    <Card icon={Server} title="Kafka Connectors" headline={<>Kafka Connector: <strong>{data?.total}</strong></>} state={state}>
      <div className="kafka-chips">
        <span className="kafka-chip running">Running: {data?.running}</span>
        <span className="kafka-chip paused">Paused: {data?.paused}</span>
        <span className="kafka-chip failed">Failed: {data?.failed}</span>
        {data?.other > 0 && <span className="kafka-chip other">Other: {data.other}</span>}
      </div>
      {problems.length > 0 && (
        <>
          <button type="button" className="ctx-more" onClick={() => setOpen((value) => !value)}>
            {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />} Not running ({problems.length})
          </button>
          {open && (
            <div className="ctx-rows kafka-rows-list">
              {problems.map((row) => {
                const taskIds = row.failedTaskIds?.length
                  ? row.failedTaskIds
                  : (row.failedTasks || [])
                      .map((t) => parseInt(String(t).replace(/\D/g, ""), 10))
                      .filter((n) => !isNaN(n));
                const isFailed = row.health === "FAILED" || taskIds.length > 0;
                const isConnectorRestarting = restarting[row.name];
                const feedback = actionFeedback[row.name];

                return (
                  <div key={row.name} className="kafka-problem-item">
                    <div className="kafka-item-row" title={row.reason || ""}>
                      <span className="kafka-item-name" title={row.name}>{row.name}</span>
                      <div className="kafka-item-actions">
                        <span className={`kafka-state-badge ${String(row.health).toLowerCase()}`} title={row.reason || row.health}>
                          {row.health === "FAILED" && taskIds.length > 0
                            ? `Task ${taskIds.join(",")} FAILED`
                            : row.health}
                        </span>
                        {isFailed && (
                          <button
                            type="button"
                            className="kafka-restart-btn-compact"
                            disabled={isConnectorRestarting}
                            onClick={() => handleRestartAll(row)}
                            title={taskIds.length > 0 ? `Restart failed task(s) for ${row.name}` : `Restart connector ${row.name}`}
                          >
                            <RotateCw size={11} className={isConnectorRestarting ? "spin" : ""} />
                            <span>{isConnectorRestarting ? "Restarting..." : "Restart"}</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {feedback && (
                      <div className={`kafka-feedback-banner ${feedback.type}`}>
                        {feedback.text}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </Card>
  );
}

// ------------------------------------------------------------------ ServiceNow (EI Services Global L2)

const AVAILABLE_SNOW_STATES = ["New", "Assigned", "In Progress", "On Hold", "Pending", "Closed", "Resolved"];

export function ServiceNowCard() {
  const state = useSection(fetchServiceNowSummary);
  const { data, reload } = state;
  const [incidentsOpen, setIncidentsOpen] = useState(false);
  const [requestsOpen, setRequestsOpen] = useState(false);
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);

  // Dynamic filter state editable from UI
  const [filterActive, setFilterActive] = useState(true);
  const [filterGroup, setFilterGroup] = useState("EI Services Global L2");
  const [filterStates, setFilterStates] = useState(["New", "Assigned", "In Progress", "On Hold"]);
  const [filterAssignedTo, setFilterAssignedTo] = useState("ARUN KUMAR");
  const [savingFilter, setSavingFilter] = useState(false);
  const [filterMsg, setFilterMsg] = useState("");

  // Keep local filter fields in sync with backend loaded criteria
  useEffect(() => {
    if (data?.filterCriteria) {
      if (typeof data.filterCriteria.active === "boolean") setFilterActive(data.filterCriteria.active);
      if (data.filterCriteria.assignmentGroup) setFilterGroup(data.filterCriteria.assignmentGroup);
      if (Array.isArray(data.filterCriteria.states)) setFilterStates(data.filterCriteria.states);
      if (data.filterCriteria.assignedTo) setFilterAssignedTo(data.filterCriteria.assignedTo);
    } else {
      if (data?.assignmentGroup) setFilterGroup(data.assignmentGroup);
      if (data?.assignedTo) setFilterAssignedTo(data.assignedTo);
    }
  }, [data?.filterCriteria, data?.assignmentGroup, data?.assignedTo]);

  const toggleStateFilter = (st) => {
    setFilterStates((prev) => {
      const exists = prev.some((s) => s.toLowerCase() === st.toLowerCase());
      if (exists) {
        const next = prev.filter((s) => s.toLowerCase() !== st.toLowerCase());
        return next.length > 0 ? next : [st]; // retain at least one
      } else {
        return [...prev, st];
      }
    });
  };

  const handleApplyFilter = async (e) => {
    e?.preventDefault?.();
    setSavingFilter(true);
    setFilterMsg("");
    try {
      const sid = typeof window !== "undefined" ? sessionStorage.getItem("emh_session_id") || "" : "";
      const payload = {
        active: Boolean(filterActive),
        assignmentGroup: filterGroup.trim() || "EI Services Global L2",
        states: filterStates,
        assignedTo: filterAssignedTo.trim() || "ARUN KUMAR"
      };
      await updateServiceNowFilter(payload, sid);
      setFilterMsg("Filter applied successfully");
      await reload(true);
      setTimeout(() => {
        setFilterMsg("");
        setFilterPanelOpen(false);
      }, 1500);
    } catch (err) {
      setFilterMsg("Failed: " + (err.message || "Could not update filter"));
    } finally {
      setSavingFilter(false);
    }
  };

  const handleResetFilter = async () => {
    const defaultFilter = {
      active: true,
      assignmentGroup: "EI Services Global L2",
      states: ["New", "Assigned", "In Progress", "On Hold"],
      assignedTo: "ARUN KUMAR"
    };
    setFilterActive(defaultFilter.active);
    setFilterGroup(defaultFilter.assignmentGroup);
    setFilterStates(defaultFilter.states);
    setFilterAssignedTo(defaultFilter.assignedTo);
    setSavingFilter(true);
    setFilterMsg("");
    try {
      const sid = typeof window !== "undefined" ? sessionStorage.getItem("emh_session_id") || "" : "";
      await updateServiceNowFilter(defaultFilter, sid);
      setFilterMsg("Reset to standard filter");
      await reload(true);
      setTimeout(() => {
        setFilterMsg("");
        setFilterPanelOpen(false);
      }, 1500);
    } catch (err) {
      setFilterMsg("Failed: " + (err.message || "Could not reset filter"));
    } finally {
      setSavingFilter(false);
    }
  };

  const statusCounts = data?.statusCounts || {};
  // Exclude Closed/Resolved/Cancelled from active bar display if active=true
  const activeStatuses = Object.entries(statusCounts).filter(([k]) => {
    if (!filterActive) return true;
    const s = k.toLowerCase();
    return s !== "closed" && s !== "resolved" && s !== "cancelled" && s !== "canceled";
  });
  const max = Math.max(1, ...activeStatuses.map(([, count]) => Number(count) || 0));

  const incidents = data?.incidents || [];
  const serviceRequests = data?.serviceRequests || [];
  const p1 = Number(data?.p1Count) || 0;
  const p2 = Number(data?.p2Count) || 0;
  const slaBreached = Number(data?.slaBreachedCount) || 0;
  const aging = Number(data?.agingCount) || 0;

  const srTotal = Number(data?.serviceRequestsTotal) || 0;
  const srAging = Number(data?.serviceRequestsAgingCount) || 0;
  const srSla = Number(data?.serviceRequestsSlaBreachedCount) || 0;

  const activeAssignee = data?.assignedTo || filterAssignedTo || "ARUN KUMAR";
  const activeGroup = data?.assignmentGroup || filterGroup || "EI Services Global L2";

  return (
    <Card
      icon={LifeBuoy}
      title="ServiceNow"
      headline={
        <div className="snow-headline-wrap">
          <div className="snow-headline-left">
            <span>Active Incidents: <strong>{data?.totalIncidents ?? 0}</strong></span>
          </div>
          <div className="snow-headline-badges">
            <span className="snow-assignee-badge" title="Assigned Engineer">
              👤 {activeAssignee}
            </span>
            <span className="snow-group-badge" title="Assignment Group">
              {activeGroup}
            </span>
          </div>
        </div>
      }
      state={state}
      link={data?.url}
    >
      {/* Active Filter Criteria Summary Bar with Configure Button */}
      <div className="snow-filter-strip">
        <div
          className="snow-filter-info"
          title={data?.filterDescription || `Active=${filterActive} AND Assignment Group=${activeGroup} AND States IN (${filterStates.join(", ")}) AND Assigned To ${activeAssignee}`}
        >
          <Filter size={11} className="snow-filter-ico" />
          <span className="snow-filter-summary-text">
            {data?.filterDescription || `Active=${filterActive} • ${activeGroup} • ${filterStates.join(", ")} • ${activeAssignee}`}
          </span>
        </div>
        <button
          type="button"
          className={`snow-filter-btn ${filterPanelOpen ? "active" : ""}`}
          onClick={() => setFilterPanelOpen((v) => !v)}
          title={filterPanelOpen ? "Close filter editor" : "Edit ServiceNow filter criteria"}
        >
          <Filter size={11} />
          <span>{filterPanelOpen ? "Hide" : "Filter"}</span>
        </button>
      </div>

      {/* Collapsible Inline Filter Editor Panel */}
      {filterPanelOpen && (
        <form className="snow-filter-panel" onSubmit={handleApplyFilter}>
          <div className="snow-panel-title">Configure Filter Criteria</div>

          <div className="snow-field-row">
            <label className="snow-field-label">Assigned To:</label>
            <input
              type="text"
              className="snow-input"
              value={filterAssignedTo}
              onChange={(e) => setFilterAssignedTo(e.target.value)}
              placeholder="e.g. ARUN KUMAR"
            />
          </div>

          <div className="snow-field-row">
            <label className="snow-field-label">Assignment Group:</label>
            <input
              type="text"
              className="snow-input"
              value={filterGroup}
              onChange={(e) => setFilterGroup(e.target.value)}
              placeholder="e.g. EI Services Global L2"
            />
          </div>

          <div className="snow-field-row">
            <label className="snow-field-label">States (IN):</label>
            <div className="snow-states-pill-wrap">
              {AVAILABLE_SNOW_STATES.map((st) => {
                const selected = filterStates.some((s) => s.toLowerCase() === st.toLowerCase());
                return (
                  <button
                    key={st}
                    type="button"
                    className={`snow-state-chip ${selected ? "selected" : ""}`}
                    onClick={() => toggleStateFilter(st)}
                  >
                    {st}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="snow-field-row snow-checkbox-row">
            <label className="snow-checkbox-label">
              <input
                type="checkbox"
                checked={filterActive}
                onChange={(e) => setFilterActive(e.target.checked)}
              />
              <span>Active Tickets Only (Active = True)</span>
            </label>
          </div>

          {filterMsg && (
            <div className={`snow-filter-feedback ${filterMsg.startsWith("Failed") ? "error" : "success"}`}>
              {filterMsg}
            </div>
          )}

          <div className="snow-filter-actions">
            <button
              type="submit"
              className="snow-apply-btn"
              disabled={savingFilter}
            >
              {savingFilter ? "Applying..." : "Apply Filter"}
            </button>
            <button
              type="button"
              className="snow-reset-btn"
              onClick={handleResetFilter}
              disabled={savingFilter}
              title="Reset to Active=True, EI Services Global L2, New/Assigned/In Progress/On Hold, ARUN KUMAR"
            >
              <RotateCcw size={11} />
              <span>Reset</span>
            </button>
            <button
              type="button"
              className="snow-cancel-btn"
              onClick={() => setFilterPanelOpen(false)}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Priority & SLA & Aging Highlight Badges */}
      <div className="snow-metrics-strip">
        <div className={`snow-metric-pill p1 ${p1 > 0 ? "has-alerts" : ""}`} title="Priority 1 (Critical) Active Incidents">
          <span className="snow-pill-label">P1</span>
          <span className="snow-pill-value">{p1}</span>
        </div>
        <div className={`snow-metric-pill p2 ${p2 > 0 ? "has-alerts" : ""}`} title="Priority 2 (High) Active Incidents">
          <span className="snow-pill-label">P2</span>
          <span className="snow-pill-value">{p2}</span>
        </div>
        <div className={`snow-metric-pill sla ${slaBreached > 0 ? "has-alerts" : ""}`} title="SLA Breached Active Incidents">
          <span className="snow-pill-label">SLA Breach</span>
          <span className="snow-pill-value">{slaBreached}</span>
        </div>
        <div className={`snow-metric-pill aging ${aging > 0 ? "has-alerts" : ""}`} title="Aging Incidents (>5 days old)">
          <span className="snow-pill-label">Aging &gt;5d</span>
          <span className="snow-pill-value">{aging}</span>
        </div>
      </div>

      {/* Status-wise Active Incidents (strictly according to active filter) */}
      <div className="ctx-rows snow-status-rows">
        {activeStatuses.map(([statusName, count]) => (
          <div key={statusName} className="ctx-row" title={`${statusName}: ${count}`}>
            <span className="ctx-row-name">{statusName}</span>
            <span className="ctx-bar">
              <span
                style={{ width: `${((Number(count) || 0) / max) * 100}%` }}
                className={`snow-bar-fill ${statusName.toLowerCase().replace(/\s+/g, "-")}`}
              />
            </span>
            <strong className="ctx-row-count">{count}</strong>
          </div>
        ))}
        {activeStatuses.length === 0 && <div className="ctx-note">No incidents match current filter criteria.</div>}
      </div>

      {/* Service Tasks & Requests (Filtered strictly: Active=True, Group, States, ARUN KUMAR) */}
      <div className="snow-sr-section">
        <div className="snow-sr-header">
          <div className="snow-sr-title">
            <span>Service Tasks: <strong>{srTotal}</strong></span>
            {srSla > 0 && <span className="snow-micro-tag breach">{srSla} SLA</span>}
            {srAging > 0 && <span className="snow-micro-tag aging">{srAging} Aging</span>}
          </div>
          {serviceRequests.length > 0 && (
            <button
              type="button"
              className="ctx-mini-toggle"
              onClick={() => setRequestsOpen((v) => !v)}
              title={requestsOpen ? "Hide Service Tasks" : "Show Service Tasks"}
            >
              {requestsOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              <span>{requestsOpen ? "Hide" : "View"} ({serviceRequests.length})</span>
            </button>
          )}
        </div>

        {requestsOpen && serviceRequests.length > 0 && (
          <div className="snow-items-list">
            {serviceRequests.map((req) => (
              <div key={req.number} className="snow-item-row" title={req.shortDescription}>
                <div className="snow-item-top">
                  <span className="snow-item-number">{req.number}</span>
                  <span className="snow-item-stage">{req.stage || req.state}</span>
                  {req.slaBreached && <span className="snow-micro-pill breach" title="SLA Breached">SLA</span>}
                  {req.isAging && <span className="snow-micro-pill aging" title="Aging >5 days">&gt;5d</span>}
                </div>
                <div className="snow-item-desc">{req.shortDescription}</div>
                <div className="snow-item-meta">
                  <span>Assignee: {req.assignedTo || activeAssignee}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Active Incidents Details Collapsible List */}
      {incidents.length > 0 && (
        <div className="snow-incidents-section">
          <button
            type="button"
            className="ctx-more"
            onClick={() => setIncidentsOpen((v) => !v)}
          >
            {incidentsOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            Active Incidents Details ({incidents.length})
          </button>

          {incidentsOpen && (
            <div className="snow-items-list">
              {incidents.map((inc) => (
                <div key={inc.number} className="snow-item-row" title={inc.description || inc.shortDescription}>
                  <div className="snow-item-top">
                    <span className="snow-item-number">{inc.number}</span>
                    <span className={`snow-priority-tag p${inc.priorityNumber || 3}`}>
                      {inc.priority || "P3"}
                    </span>
                    <span className="snow-item-state">{inc.state}</span>
                    {inc.slaBreached && <span className="snow-micro-pill breach" title="SLA Breached">SLA</span>}
                    {inc.isAging && <span className="snow-micro-pill aging" title="Aging >5 days">&gt;5d</span>}
                  </div>
                  <div className="snow-item-desc">{inc.shortDescription}</div>
                  <div className="snow-item-meta">
                    <span>Assignee: {inc.assignedTo || activeAssignee}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
