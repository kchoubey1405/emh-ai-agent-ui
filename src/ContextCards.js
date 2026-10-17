import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight, ExternalLink, GitPullRequest, RefreshCw, Server, Ticket } from "lucide-react";
import { fetchJiraSummary, fetchKafkaSummary, fetchPullRequests } from "./api";

const REFRESH_MS = 5 * 60 * 1000;
const RETRY_MS = 15 * 1000;
const VISIBLE_PROJECTS = 8;

/**
 * Loads one dashboard section when the page opens, then keeps it fresh.
 * Returns { data, error, loading, reload }.
 */
function useSection(fetcher) {
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
        const body = await fetcher(force);
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
    return () => {
      alive.current = false;
      clearTimeout(timer.current);
    };
  }, [load]);

  return { data, error, loading, reload: () => load(true) };
}

function Card({ icon: Icon, title, headline, state, children, link }) {
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
  const statuses = rawStatuses.filter((row) => {
    const s = (row.status || "").toLowerCase();
    return (
      !s.includes("pushed to production") &&
      !s.includes("in production") &&
      s !== "production" &&
      s !== "closed" &&
      s !== "cancelled" &&
      s !== "canceled"
    );
  });
  const max = Math.max(1, ...statuses.map((row) => Number(row.count) || 0));
  const total = statuses.reduce((sum, row) => sum + (Number(row.count) || 0), 0);

  return (
    <Card icon={Ticket} title="EMH Jira" headline={<>Total tickets: <strong>{total}</strong></>} state={state} link={data?.url}>
      <div className="ctx-rows">
        {statuses.map((row) => (
          <div key={row.status} className="ctx-row" title={`${row.status}: ${row.count}`}>
            <span className="ctx-row-name">{row.status}</span>
            <span className="ctx-bar"><span style={{ width: `${((Number(row.count) || 0) / max) * 100}%` }} /></span>
            <strong className="ctx-row-count">{row.count}</strong>
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
      headline={<>Total open PRs: <strong>{data?.total}</strong> in {projects.length} {projects.length === 1 ? "project" : "projects"}</>}
      state={state}
    >
      <div className="ctx-rows">
        {visible.map((row) => (
          <a key={row.project} className="ctx-row ctx-link" href={row.url} target="_blank" rel="noopener noreferrer" title={`Open pull requests of ${row.project}`}>
            <span className="ctx-row-name">{row.project}</span>
            <span className="ctx-dots" />
            <strong className="ctx-row-count">{row.openPRs}</strong>
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
  const problems = data?.notRunning || [];

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
            <div className="ctx-rows">
              {problems.map((row) => (
                <div key={row.name} className="ctx-row" title={row.reason || ""}>
                  <span className="ctx-row-name">{row.name}</span>
                  <span className={`kafka-state ${String(row.health).toLowerCase()}`}>
                    {row.health === "FAILED" && row.state === "RUNNING" && row.failedTasks?.length
                      ? `FAILED (${row.failedTasks.length} of ${row.tasks} tasks)`
                      : row.health}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </Card>
  );
}
