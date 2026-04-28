import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  FiActivity,
  FiAlertTriangle,
  FiChevronLeft,
  FiChevronRight,
  FiClock,
  FiDatabase,
  FiEdit3,
  FiFilter,
  FiMapPin,
  FiMoon,
  FiRefreshCcw,
  FiServer,
  FiTrash2,
  FiTrendingUp,
  FiTruck,
  FiWifi,
  FiZap
} from "react-icons/fi";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "https://trafficspring.onrender.com").replace(/\/+$/, "");

const defaultFilters = {
  zone: "",
  minSpeed: "",
  maxSpeed: ""
};

const initialForm = {
  vehicleId: "",
  speed: "",
  zone: "",
  isEmergency: false
};

const statusModes = {
  checking: {
    label: "Checking backend",
    description: "Opening a link to the Render API and waiting for a healthy response.",
    color: "from-sky-400 to-cyan-300",
    icon: FiWifi
  },
  waking: {
    label: "Waking server",
    description: "Free-tier instance is likely asleep. First hit can take a little time.",
    color: "from-amber-400 to-orange-300",
    icon: FiZap
  },
  live: {
    label: "Server live",
    description: "Backend is awake and traffic data is syncing normally.",
    color: "from-emerald-400 to-teal-300",
    icon: FiActivity
  },
  sleeping: {
    label: "Sleeping or unreachable",
    description: "Dashboard will keep retrying so the wake-up feels obvious instead of broken.",
    color: "from-slate-400 to-slate-300",
    icon: FiMoon
  }
};

function App() {
  const [status, setStatus] = useState({
    mode: "checking",
    note: `Connecting to ${API_BASE_URL}`
  });
  const [stats, setStats] = useState({
    totalViolations: 0,
    totalFineCollected: 0,
    violationsPerZone: {}
  });
  const [recordsPage, setRecordsPage] = useState({
    content: [],
    number: 0,
    totalPages: 1,
    totalElements: 0,
    numberOfElements: 0,
    first: true,
    last: true
  });
  const [filters, setFilters] = useState(defaultFilters);
  const [form, setForm] = useState(initialForm);
  const [sortBy, setSortBy] = useState("createdAt");
  const [sortOrder, setSortOrder] = useState("desc");
  const [pageSize, setPageSize] = useState(5);
  const [page, setPage] = useState(0);
  const [editingRecordId, setEditingRecordId] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [tableMessage, setTableMessage] = useState("");
  const pollRef = useRef(null);

  const zoneEntries = useMemo(() => {
    return Object.entries(stats.violationsPerZone || {}).sort((a, b) => b[1] - a[1]);
  }, [stats]);

  const topZone = zoneEntries.length ? zoneEntries[0][0] : "No data";
  const statusTheme = statusModes[status.mode] || statusModes.checking;
  const StatusIcon = statusTheme.icon;

  useEffect(() => {
    loadDashboard();
    return () => stopPolling();
  }, []);

  useEffect(() => {
    loadRecords().catch((error) => {
      setTableMessage(error.message || "Could not load records.");
    });
  }, [page, pageSize, sortBy, sortOrder]);

  async function loadDashboard() {
    setStatus({
      mode: "waking",
      note: "Pinging Render health endpoint. First wake-up can be slow."
    });

    try {
      const start = performance.now();
      await apiFetch("/actuator/health", { timeoutMs: 45000 });
      const latency = Math.round(performance.now() - start);

      const [statsResponse, recordsResponse] = await Promise.all([
        apiFetch("/traffic/stats"),
        buildRecordsRequest()
      ]);

      setStats(statsResponse);
      setRecordsPage(recordsResponse);
      setStatus({
        mode: "live",
        note:
          latency > 4000
            ? `Backend woke up in about ${latency} ms.`
            : `Healthy response in about ${latency} ms.`
      });
      setTableMessage("");
      stopPolling();
    } catch (error) {
      setStatus({
        mode: "sleeping",
        note: error.message || "Backend is still waking up or temporarily unreachable."
      });
      setTableMessage(error.message || "Could not load dashboard data.");
      startPolling();
    }
  }

  async function loadRecords() {
    try {
      const response = await buildRecordsRequest();
      setRecordsPage(response);
      setTableMessage("");
    } catch (error) {
      setTableMessage(error.message || "Could not load records.");
      throw error;
    }
  }

  function buildRecordsRequest() {
    const path = hasActiveFilters() ? "/traffic/filter" : "/traffic/all";
    const query = new URLSearchParams({
      page: String(page),
      size: String(pageSize),
      sortBy,
      order: sortOrder
    });

    if (filters.zone) query.set("zone", filters.zone);
    if (filters.minSpeed) query.set("minSpeed", filters.minSpeed);
    if (filters.maxSpeed) query.set("maxSpeed", filters.maxSpeed);

    return apiFetch(`${path}?${query.toString()}`);
  }

  async function apiFetch(path, options = {}) {
    const controller = new AbortController();
    const timeoutMs = options.timeoutMs || 30000;
    const timeout = window.setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${API_BASE_URL}${path}`, {
        method: options.method || "GET",
        headers: {
          "Content-Type": "application/json",
          ...(options.headers || {})
        },
        body: options.body,
        signal: controller.signal
      });

      if (response.status === 204) {
        return null;
      }

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message = Array.isArray(data.details) && data.details.length
          ? data.details.join(" | ")
          : data.message || "Request failed.";
        throw new Error(message);
      }
      return data;
    } catch (error) {
      if (error.name === "AbortError") {
        throw new Error("The backend took too long to respond. Render may still be waking it up.");
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  function startPolling() {
    if (pollRef.current) return;
    pollRef.current = window.setInterval(async () => {
      try {
        await apiFetch("/actuator/health", { timeoutMs: 45000 });
        stopPolling();
        loadDashboard();
      } catch (_error) {
        setStatus((previous) => ({
          ...previous,
          mode: "sleeping",
          note: "Still waiting on the Render server. Retrying automatically."
        }));
      }
    }, 15000);
  }

  function stopPolling() {
    if (pollRef.current) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  function hasActiveFilters() {
    return Boolean(filters.zone || filters.minSpeed || filters.maxSpeed);
  }

  function handleFormChange(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setFeedback(null);

    const payload = {
      vehicleId: form.vehicleId.trim(),
      speed: Number(form.speed),
      zone: form.zone.trim(),
      isEmergency: form.isEmergency
    };

    if (!payload.vehicleId || !payload.speed || !payload.zone) {
      setFeedback({ type: "error", text: "Please complete vehicle ID, speed, and zone before submitting." });
      return;
    }

    try {
      if (editingRecordId !== null) {
        const updated = await apiFetch(`/traffic/${editingRecordId}`, {
          method: "PUT",
          body: JSON.stringify(payload)
        });
        setFeedback({
          type: "success",
          text: `Record #${updated.id} updated successfully. Fine is ${formatCurrency(updated.fine)}.`
        });
      } else {
        const result = await apiFetch("/traffic/check", {
          method: "POST",
          body: JSON.stringify(payload)
        });
        setFeedback({
          type: result.violationDetected ? "success" : "warning",
          text: result.violationDetected
            ? `Violation saved successfully. Fine applied: ${formatCurrency(result.fine)}.`
            : "No violation detected. Record was not saved because the vehicle is within policy."
        });
      }

      resetForm();
      await loadDashboard();
    } catch (error) {
      setFeedback({ type: "error", text: error.message || "Unable to save record." });
    }
  }

  function resetForm() {
    setForm(initialForm);
    setEditingRecordId(null);
  }

  async function handleEdit(recordId) {
    try {
      const record = await apiFetch(`/traffic/${recordId}`);
      setEditingRecordId(record.id);
      setForm({
        vehicleId: record.vehicleId || "",
        speed: String(record.speed || ""),
        zone: record.zone || "",
        isEmergency: Boolean(record.isEmergency)
      });
      setFeedback({
        type: "warning",
        text: `Editing record #${record.id}. Update fields and save to replace the current values.`
      });
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      setFeedback({ type: "error", text: error.message || "Unable to load record for editing." });
    }
  }

  async function handleDelete(recordId) {
    if (!window.confirm(`Delete violation record #${recordId}?`)) {
      return;
    }

    try {
      await apiFetch(`/traffic/${recordId}`, { method: "DELETE" });
      setTableMessage(`Record #${recordId} deleted.`);
      if (page > 0 && recordsPage.content.length === 1) {
        setPage((current) => Math.max(0, current - 1));
      } else {
        await loadDashboard();
      }
    } catch (error) {
      setTableMessage(error.message || "Unable to delete record.");
    }
  }

  async function applyFilters(event) {
    event.preventDefault();
    setPage(0);
    await loadRecords();
  }

  function clearFilters() {
    setFilters(defaultFilters);
    setSortBy("createdAt");
    setSortOrder("desc");
    setPageSize(5);
    setPage(0);
    setTableMessage("");
  }

  useEffect(() => {
    if (!hasActiveFilters() && page === 0 && sortBy === "createdAt" && sortOrder === "desc" && pageSize === 5) {
      return;
    }
    loadRecords().catch((error) => setTableMessage(error.message || "Could not refresh records."));
  }, [filters]);

  return (
    <div className="min-h-screen bg-shell text-ink">
      <header className="relative overflow-hidden bg-[radial-gradient(circle_at_top_left,_rgba(74,222,128,0.08),_transparent_32%),linear-gradient(135deg,#09131F_0%,#12344D_52%,#185A74_100%)] px-5 pb-8 pt-8 text-white md:px-10">
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute -left-16 top-12 h-40 w-40 rounded-full bg-emerald-300/10 blur-3xl" />
          <div className="absolute right-0 top-0 h-56 w-56 animate-drift rounded-full bg-sky-300/10 blur-3xl" />
        </div>
        <div className="relative mx-auto grid max-w-7xl gap-6 xl:grid-cols-[1.25fr_0.85fr]">
          <div className="space-y-4">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-200">
              <FiServer className="text-sm" />
              TrafficSpring Control Room
            </span>
            <div className="max-w-3xl space-y-4">
              <h1 className="text-4xl font-semibold leading-tight sm:text-5xl">
                Smart traffic violation monitoring with a frontend that actually looks deployed on purpose.
              </h1>
              <p className="max-w-2xl text-sm leading-7 text-slate-200 sm:text-base">
                Netlify serves the dashboard, Render serves the API, and the interface makes the free-tier sleep behavior visible instead of awkward.
              </p>
            </div>
            <div className="flex flex-wrap gap-3 text-sm text-slate-200">
              <InfoPill icon={FiTruck} label="Vehicle checks" />
              <InfoPill icon={FiFilter} label="Filter & analytics" />
              <InfoPill icon={FiDatabase} label="Persistent cloud DB" />
            </div>
          </div>

          <motion.div
            className="glass-panel relative isolate overflow-hidden p-6"
            initial={{ opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45 }}
          >
            <div className="absolute inset-x-0 top-0 h-px bg-white/20" />
            <div className="grid gap-4 sm:grid-cols-[auto_1fr] sm:items-center">
              <div className="relative flex h-24 w-24 items-center justify-center">
                <span className={`absolute h-20 w-20 rounded-full bg-gradient-to-br ${statusTheme.color} opacity-35 blur-xl`} />
                <span className={`absolute h-16 w-16 rounded-full border border-white/15 ${status.mode !== "sleeping" ? "animate-radar" : ""}`} />
                <span className={`absolute h-12 w-12 rounded-full bg-gradient-to-br ${statusTheme.color} ${status.mode === "sleeping" ? "animate-pulseSlow" : ""}`} />
                <StatusIcon className="relative z-10 text-2xl text-white" />
              </div>
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-200">Render server state</p>
                <h2 className="text-2xl font-semibold">{statusTheme.label}</h2>
                <p className="text-sm leading-6 text-slate-200">{status.note || statusTheme.description}</p>
                <p className="break-all text-xs text-slate-300">{API_BASE_URL}</p>
              </div>
            </div>
            <div className="mt-6 grid gap-3 rounded-lg border border-white/10 bg-white/5 p-4 text-sm text-slate-200">
              <div className="flex items-start gap-3">
                <span className="mt-1 h-2.5 w-2.5 rounded-full bg-emerald-300" />
                <div>
                  <strong className="block text-white">Live</strong>
                  <span>Requests are flowing and metrics should refresh instantly.</span>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="mt-1 h-2.5 w-2.5 rounded-full bg-amber-300" />
                <div>
                  <strong className="block text-white">Waking</strong>
                  <span>First load can take longer while Render spins the free instance back up.</span>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="mt-1 h-2.5 w-2.5 rounded-full bg-slate-300" />
                <div>
                  <strong className="block text-white">Sleeping</strong>
                  <span>Dashboard keeps checking health so visitors can see what’s happening.</span>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-5 px-4 py-6 md:px-8">
        <section className="grid gap-5 xl:grid-cols-[1.45fr_0.85fr]">
          <div className="grid gap-4 md:grid-cols-3">
            <MetricCard icon={FiAlertTriangle} label="Total Violations" value={stats.totalViolations} footnote="Recorded cases across the current database" />
            <MetricCard icon={FiTrendingUp} label="Total Fine Collected" value={formatCurrency(stats.totalFineCollected)} footnote="Aggregated penalty amount" />
            <MetricCard icon={FiMapPin} label="Most Active Zone" value={topZone} footnote="Zone with the highest violation count" />
          </div>

          <div className="panel p-5">
            <SectionHeader eyebrow="Analytics" title="Violations per zone" />
            <div className="mt-4 grid gap-3">
              {zoneEntries.length ? (
                zoneEntries.map(([zone, count]) => (
                  <motion.div
                    key={zone}
                    layout
                    className="flex items-center justify-between rounded-lg border border-line bg-mist px-4 py-3"
                  >
                    <span className="font-medium">{zone}</span>
                    <span className="rounded-full bg-white px-3 py-1 text-sm font-semibold text-slate-700">{count}</span>
                  </motion.div>
                ))
              ) : (
                <EmptyInline text="No zone data yet." />
              )}
            </div>
          </div>
        </section>

        <section className="grid gap-5 xl:grid-cols-[1.55fr_0.8fr]">
          <motion.div
            className="panel p-5"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
          >
            <div className="flex flex-wrap items-end justify-between gap-3">
              <SectionHeader eyebrow="Detection" title={editingRecordId !== null ? "Edit violation record" : "Check vehicle for violation"} />
              <button className="button-secondary gap-2" type="button" onClick={loadDashboard}>
                <FiRefreshCcw />
                Refresh Data
              </button>
            </div>

            <form className="mt-5 grid gap-5" onSubmit={handleSubmit}>
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Vehicle ID">
                  <input
                    className="input-surface"
                    value={form.vehicleId}
                    onChange={(event) => handleFormChange("vehicleId", event.target.value)}
                    placeholder="MH12AB1234"
                    required
                  />
                </Field>
                <Field label="Speed">
                  <input
                    className="input-surface"
                    type="number"
                    min="1"
                    value={form.speed}
                    onChange={(event) => handleFormChange("speed", event.target.value)}
                    placeholder="110"
                    required
                  />
                </Field>
                <Field label="Zone">
                  <input
                    className="input-surface"
                    value={form.zone}
                    onChange={(event) => handleFormChange("zone", event.target.value)}
                    placeholder="Pune"
                    required
                  />
                </Field>
                <Field label="Emergency vehicle">
                  <button
                    className="flex h-11 items-center gap-3 rounded-lg border border-line bg-white px-3 text-sm font-medium text-ink"
                    type="button"
                    onClick={() => handleFormChange("isEmergency", !form.isEmergency)}
                  >
                    <span className={`relative h-6 w-11 rounded-full transition ${form.isEmergency ? "bg-teal-600" : "bg-slate-300"}`}>
                      <span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition ${form.isEmergency ? "left-6" : "left-1"}`} />
                    </span>
                    {form.isEmergency ? "Enabled" : "Disabled"}
                  </button>
                </Field>
              </div>

              <div className="flex flex-wrap gap-3">
                <button className="button-primary gap-2" type="submit">
                  <FiZap />
                  {editingRecordId !== null ? "Update Violation" : "Check & Save Violation"}
                </button>
                {editingRecordId !== null && (
                  <button className="button-secondary" type="button" onClick={resetForm}>
                    Cancel Edit
                  </button>
                )}
              </div>
            </form>

            <AnimatePresence>
              {feedback && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 6 }}
                  className={`mt-5 rounded-lg border px-4 py-3 text-sm ${
                    feedback.type === "success"
                      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                      : feedback.type === "warning"
                        ? "border-amber-200 bg-amber-50 text-amber-800"
                        : "border-rose-200 bg-rose-50 text-rose-800"
                  }`}
                >
                  {feedback.text}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

          <div className="panel overflow-hidden bg-[linear-gradient(180deg,#0B1520_0%,#13283B_100%)] p-5 text-white">
            <SectionHeader eyebrow="Rules & behavior" title="Fine engine" dark />
            <div className="mt-5 space-y-3 text-sm text-slate-200">
              <RuleRow speed="81 - 100 km/h" fine="Rs. 1000" />
              <RuleRow speed="101 - 120 km/h" fine="Rs. 2000" />
              <RuleRow speed="Above 120 km/h" fine="Rs. 5000" />
            </div>
            <div className="mt-5 rounded-lg border border-white/10 bg-white/5 p-4 text-sm leading-6 text-slate-200">
              Emergency vehicles stay exempt even when they cross the normal speed threshold. The dashboard uses health polling to make Render sleep behavior visible to users.
            </div>
          </div>
        </section>

        <section className="panel p-5">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <SectionHeader eyebrow="Records" title="Violation registry" />
            <div className="text-sm text-slate-500">
              Showing {recordsPage.numberOfElements || 0} of {recordsPage.totalElements || 0} records
            </div>
          </div>

          <form className="mt-5 grid gap-4 xl:grid-cols-[repeat(6,minmax(0,1fr))_auto]" onSubmit={applyFilters}>
            <Field label="Zone">
              <input
                className="input-surface"
                value={filters.zone}
                onChange={(event) => setFilters((current) => ({ ...current, zone: event.target.value }))}
                placeholder="Pune"
              />
            </Field>
            <Field label="Min Speed">
              <input
                className="input-surface"
                type="number"
                min="1"
                value={filters.minSpeed}
                onChange={(event) => setFilters((current) => ({ ...current, minSpeed: event.target.value }))}
                placeholder="90"
              />
            </Field>
            <Field label="Max Speed">
              <input
                className="input-surface"
                type="number"
                min="1"
                value={filters.maxSpeed}
                onChange={(event) => setFilters((current) => ({ ...current, maxSpeed: event.target.value }))}
                placeholder="150"
              />
            </Field>
            <Field label="Sort By">
              <select className="input-surface" value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
                <option value="createdAt">Timestamp</option>
                <option value="speed">Speed</option>
                <option value="fine">Fine</option>
                <option value="zone">Zone</option>
                <option value="vehicleId">Vehicle ID</option>
              </select>
            </Field>
            <Field label="Order">
              <select className="input-surface" value={sortOrder} onChange={(event) => setSortOrder(event.target.value)}>
                <option value="desc">Descending</option>
                <option value="asc">Ascending</option>
              </select>
            </Field>
            <Field label="Page Size">
              <select className="input-surface" value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))}>
                <option value="5">5</option>
                <option value="10">10</option>
                <option value="20">20</option>
              </select>
            </Field>
            <div className="flex flex-wrap items-end gap-3">
              <button className="button-primary gap-2" type="submit">
                <FiFilter />
                Apply
              </button>
              <button className="button-secondary" type="button" onClick={clearFilters}>
                Reset
              </button>
            </div>
          </form>

          <div className="mt-5 overflow-hidden rounded-lg border border-line">
            <div className="overflow-x-auto">
              <table className="min-w-[980px] w-full border-collapse">
                <thead className="bg-mist text-left text-xs uppercase tracking-[0.18em] text-slate-500">
                  <tr>
                    {["ID", "Vehicle", "Speed", "Zone", "Fine", "Emergency", "Created", "Actions"].map((heading) => (
                      <th key={heading} className="border-b border-line px-4 py-3 font-semibold">
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="bg-white text-sm">
                  {recordsPage.content.length ? (
                    recordsPage.content.map((record) => (
                      <tr key={record.id} className="border-b border-line/80 last:border-b-0">
                        <td className="px-4 py-4 font-semibold text-slate-700">{record.id}</td>
                        <td className="px-4 py-4">{record.vehicleId}</td>
                        <td className="px-4 py-4">{record.speed} km/h</td>
                        <td className="px-4 py-4">{record.zone}</td>
                        <td className="px-4 py-4">{formatCurrency(record.fine)}</td>
                        <td className="px-4 py-4">
                          <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${record.isEmergency ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                            {record.isEmergency ? "Emergency" : "Standard"}
                          </span>
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap">{formatDate(record.createdAt)}</td>
                        <td className="px-4 py-4">
                          <div className="flex gap-2">
                            <button className="button-secondary h-9 px-3" type="button" onClick={() => handleEdit(record.id)}>
                              <FiEdit3 />
                            </button>
                            <button className="button-secondary h-9 px-3 text-rose-600" type="button" onClick={() => handleDelete(record.id)}>
                              <FiTrash2 />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="8" className="px-4 py-10 text-center text-slate-500">
                        No records match the current view.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-slate-500">{tableMessage}</div>
            <div className="flex items-center gap-3">
              <button className="button-secondary h-10 px-3" type="button" disabled={recordsPage.first} onClick={() => setPage((current) => Math.max(0, current - 1))}>
                <FiChevronLeft />
              </button>
              <span className="text-sm font-medium text-slate-600">
                Page {(recordsPage.number || 0) + 1} of {Math.max(recordsPage.totalPages || 1, 1)}
              </span>
              <button className="button-secondary h-10 px-3" type="button" disabled={recordsPage.last} onClick={() => setPage((current) => current + 1)}>
                <FiChevronRight />
              </button>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

function SectionHeader({ eyebrow, title, dark = false }) {
  return (
    <div className="space-y-1">
      <p className={`text-xs font-semibold uppercase tracking-[0.2em] ${dark ? "text-teal-200" : "text-teal-700"}`}>{eyebrow}</p>
      <h2 className={`text-2xl font-semibold ${dark ? "text-white" : "text-ink"}`}>{title}</h2>
    </div>
  );
}

function MetricCard({ icon: Icon, label, value, footnote }) {
  return (
    <motion.article
      className="panel flex min-h-[168px] flex-col justify-between p-5"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className="text-sm font-medium text-slate-500">{label}</span>
          <div className="mt-3 text-3xl font-semibold text-ink">{value}</div>
        </div>
        <div className="rounded-2xl bg-teal-50 p-3 text-teal-700">
          <Icon className="text-xl" />
        </div>
      </div>
      <p className="mt-4 text-sm leading-6 text-slate-500">{footnote}</p>
    </motion.article>
  );
}

function Field({ label, children }) {
  return (
    <label className="grid gap-2">
      <span className="text-sm font-semibold text-slate-700">{label}</span>
      {children}
    </label>
  );
}

function RuleRow({ speed, fine }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-4 py-3">
      <span className="text-slate-200">{speed}</span>
      <span className="font-semibold text-white">{fine}</span>
    </div>
  );
}

function InfoPill({ icon: Icon, label }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-sm">
      <Icon />
      {label}
    </span>
  );
}

function EmptyInline({ text }) {
  return <p className="rounded-lg border border-dashed border-line bg-mist px-4 py-5 text-sm text-slate-500">{text}</p>;
}

function formatCurrency(value) {
  return `Rs. ${Number(value || 0).toLocaleString("en-IN")}`;
}

function formatDate(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

export default App;
