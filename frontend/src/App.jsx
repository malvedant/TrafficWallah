import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  FiActivity,
  FiAlertTriangle,
  FiChevronLeft,
  FiChevronRight,
  FiDatabase,
  FiEdit3,
  FiFilter,
  FiMapPin,
  FiMoon,
  FiRefreshCcw,
  FiServer,
  FiTrash2,
  FiTrendingUp,
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
    description: "Checking the API health endpoint.",
    color: "bg-sky-500",
    icon: FiWifi
  },
  waking: {
    label: "Waking server",
    description: "The hosted API may take a moment on the first request.",
    color: "bg-amber-500",
    icon: FiZap
  },
  live: {
    label: "Server live",
    description: "Requests are succeeding and the dashboard is synced.",
    color: "bg-emerald-500",
    icon: FiActivity
  },
  sleeping: {
    label: "Unavailable",
    description: "The dashboard will retry automatically.",
    color: "bg-slate-500",
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
      note: "Checking the API. The first request can take longer than usual."
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
            ? `API responded in about ${latency} ms after waking up.`
            : `API responded in about ${latency} ms.`
      });
      setTableMessage("");
      stopPolling();
    } catch (error) {
      setStatus({
        mode: "sleeping",
        note: error.message || "The backend is still waking up or temporarily unreachable."
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
      const headers = options.headers ? { ...options.headers } : {};
      if (options.body && !headers["Content-Type"]) {
        headers["Content-Type"] = "application/json";
      }

      const response = await fetch(`${API_BASE_URL}${path}`, {
        method: options.method || "GET",
        headers,
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
        throw new Error("The backend took too long to respond. The hosted server may still be waking up.");
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
          note: "Still waiting for the API. Retrying automatically."
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
          text: `Record #${updated.id} updated. Fine: ${formatCurrency(updated.fine)}.`
        });
      } else {
        const result = await apiFetch("/traffic/check", {
          method: "POST",
          body: JSON.stringify(payload)
        });
        setFeedback({
          type: result.violationDetected ? "success" : "warning",
          text: result.violationDetected
            ? `Violation saved. Fine applied: ${formatCurrency(result.fine)}.`
            : "No violation detected. The vehicle is within the configured rules."
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
        text: `Editing record #${record.id}. Update the fields and save the changes.`
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
      <header className="border-b border-line bg-white">
        <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-slate-600">
                <span className="inline-flex items-center gap-2 rounded-full bg-mist px-3 py-1.5 text-slate-700">
                  <FiServer className="text-sm" />
                  Traffic Violation Dashboard
                </span>
                <span className="inline-flex items-center gap-2 rounded-full bg-mist px-3 py-1.5 text-slate-700">
                  <FiDatabase className="text-sm" />
                  Live records
                </span>
              </div>
              <div>
                <h1 className="text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
                  Traffic violation monitoring
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">
                  Review violation stats, check vehicles, and manage records from one place.
                </p>
              </div>
            </div>

            <motion.div
              className="panel w-full max-w-xl p-4 sm:p-5"
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35 }}
            >
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-mist">
                  <span className={`flex h-9 w-9 items-center justify-center rounded-full text-white ${statusTheme.color}`}>
                    <StatusIcon className="text-lg" />
                  </span>
                </div>
                <div className="min-w-0 space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Backend status</p>
                  <h2 className="text-lg font-semibold text-ink">{statusTheme.label}</h2>
                  <p className="text-sm leading-6 text-slate-600">{status.note || statusTheme.description}</p>
                  <p className="break-all text-xs text-slate-500">{API_BASE_URL}</p>
                </div>
              </div>
              <div className="mt-4 grid gap-2 text-sm text-slate-600 sm:grid-cols-3">
                <StatusHint tone="bg-emerald-500" title="Live" text="Requests are succeeding." />
                <StatusHint tone="bg-amber-500" title="Waking" text="First load can take longer." />
                <StatusHint tone="bg-slate-500" title="Retrying" text="The dashboard keeps checking." />
              </div>
            </motion.div>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-5 px-4 py-5 sm:px-6 lg:px-8">
        <section className="grid gap-5 lg:grid-cols-[1.55fr_0.95fr]">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <MetricCard icon={FiAlertTriangle} label="Total violations" value={stats.totalViolations} footnote="Recorded cases in the current database" />
            <MetricCard icon={FiTrendingUp} label="Total fine collected" value={formatCurrency(stats.totalFineCollected)} footnote="Total amount across stored violations" />
            <MetricCard icon={FiMapPin} label="Most active zone" value={topZone} footnote="Zone with the highest number of violations" />
          </div>

          <div className="panel p-5">
            <SectionHeader eyebrow="Analytics" title="Violations by zone" />
            <div className="mt-4 grid gap-3">
              {zoneEntries.length ? (
                zoneEntries.map(([zone, count]) => (
                  <motion.div
                    key={zone}
                    layout
                    className="flex items-center justify-between gap-3 rounded-lg border border-line bg-mist px-4 py-3"
                  >
                    <span className="min-w-0 break-words font-medium text-ink">{zone}</span>
                    <span className="shrink-0 rounded-full bg-white px-3 py-1 text-sm font-semibold text-slate-700">{count}</span>
                  </motion.div>
                ))
              ) : (
                <EmptyInline text="No zone data yet." />
              )}
            </div>
          </div>
        </section>

        <section className="grid gap-5 lg:grid-cols-[1.55fr_0.85fr]">
          <motion.div
            className="panel p-5"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <SectionHeader eyebrow="Detection" title={editingRecordId !== null ? "Edit violation record" : "Check vehicle"} />
              <button className="button-secondary w-full gap-2 sm:w-auto" type="button" onClick={loadDashboard}>
                <FiRefreshCcw />
                Refresh data
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
                    className="flex h-11 w-full items-center justify-between gap-3 rounded-lg border border-line bg-white px-3 text-sm font-medium text-ink"
                    type="button"
                    onClick={() => handleFormChange("isEmergency", !form.isEmergency)}
                  >
                    <span>{form.isEmergency ? "Enabled" : "Disabled"}</span>
                    <span className={`relative h-6 w-11 rounded-full transition ${form.isEmergency ? "bg-teal-600" : "bg-slate-300"}`}>
                      <span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition ${form.isEmergency ? "left-6" : "left-1"}`} />
                    </span>
                  </button>
                </Field>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <button className="button-primary w-full gap-2 sm:w-auto" type="submit">
                  <FiZap />
                  {editingRecordId !== null ? "Update violation" : "Check and save"}
                </button>
                {editingRecordId !== null && (
                  <button className="button-secondary w-full sm:w-auto" type="button" onClick={resetForm}>
                    Cancel edit
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

          <div className="panel p-5">
            <SectionHeader eyebrow="Rules" title="Fine engine" />
            <div className="mt-5 space-y-3 text-sm text-slate-700">
              <RuleRow speed="81 - 100 km/h" fine="Rs. 1000" />
              <RuleRow speed="101 - 120 km/h" fine="Rs. 2000" />
              <RuleRow speed="Above 120 km/h" fine="Rs. 5000" />
            </div>
            <div className="mt-5 rounded-lg border border-line bg-mist p-4 text-sm leading-6 text-slate-600">
              Emergency vehicles are exempt. If the hosted API is asleep, the dashboard keeps retrying in the background.
            </div>
          </div>
        </section>

        <section className="panel p-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <SectionHeader eyebrow="Records" title="Violation registry" />
            <div className="text-sm text-slate-500">
              Showing {recordsPage.numberOfElements || 0} of {recordsPage.totalElements || 0} records
            </div>
          </div>

          <form className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-[repeat(6,minmax(0,1fr))_auto]" onSubmit={applyFilters}>
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
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end xl:items-end">
              <button className="button-primary w-full gap-2 sm:w-auto" type="submit">
                <FiFilter />
                Apply
              </button>
              <button className="button-secondary w-full sm:w-auto" type="button" onClick={clearFilters}>
                Reset
              </button>
            </div>
          </form>

          <div className="mt-5 grid gap-3 md:hidden">
            {recordsPage.content.length ? (
              recordsPage.content.map((record) => (
                <article key={record.id} className="rounded-lg border border-line bg-white p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Record</p>
                      <h3 className="mt-1 text-lg font-semibold text-ink">#{record.id}</h3>
                    </div>
                    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${record.isEmergency ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                      {record.isEmergency ? "Emergency" : "Standard"}
                    </span>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <MobileData label="Vehicle" value={record.vehicleId} />
                    <MobileData label="Speed" value={`${record.speed} km/h`} />
                    <MobileData label="Zone" value={record.zone} />
                    <MobileData label="Fine" value={formatCurrency(record.fine)} />
                    <MobileData label="Created" value={formatDate(record.createdAt)} full />
                  </div>

                  <div className="mt-4 flex gap-2">
                    <button className="button-secondary flex-1 gap-2" type="button" onClick={() => handleEdit(record.id)}>
                      <FiEdit3 />
                      Edit
                    </button>
                    <button className="button-secondary flex-1 gap-2 text-rose-600" type="button" onClick={() => handleDelete(record.id)}>
                      <FiTrash2 />
                      Delete
                    </button>
                  </div>
                </article>
              ))
            ) : (
              <EmptyInline text="No records match the current view." />
            )}
          </div>

          <div className="mt-5 hidden overflow-hidden rounded-lg border border-line md:block">
            <div className="overflow-x-auto">
              <table className="min-w-[980px] w-full border-collapse">
                <thead className="bg-mist text-left text-xs uppercase tracking-[0.16em] text-slate-500">
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
                        <td className="whitespace-nowrap px-4 py-4">{formatDate(record.createdAt)}</td>
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

          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-slate-500">{tableMessage}</div>
            <div className="flex items-center justify-between gap-3 sm:justify-end">
              <button className="button-secondary h-10 px-3" type="button" disabled={recordsPage.first} onClick={() => setPage((current) => Math.max(0, current - 1))}>
                <FiChevronLeft />
              </button>
              <span className="text-center text-sm font-medium text-slate-600">
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

function SectionHeader({ eyebrow, title }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">{eyebrow}</p>
      <h2 className="text-xl font-semibold text-ink sm:text-2xl">{title}</h2>
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
        <div className="min-w-0">
          <span className="text-sm font-medium text-slate-500">{label}</span>
          <div className="mt-3 break-words text-2xl font-semibold text-ink sm:text-3xl">{value}</div>
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
    <div className="flex items-center justify-between gap-3 rounded-lg border border-line bg-mist px-4 py-3">
      <span className="text-slate-700">{speed}</span>
      <span className="shrink-0 font-semibold text-ink">{fine}</span>
    </div>
  );
}

function EmptyInline({ text }) {
  return <p className="rounded-lg border border-dashed border-line bg-mist px-4 py-5 text-sm text-slate-500">{text}</p>;
}

function StatusHint({ tone, title, text }) {
  return (
    <div className="rounded-lg border border-line bg-mist px-3 py-3">
      <div className="flex items-center gap-2">
        <span className={`h-2.5 w-2.5 rounded-full ${tone}`} />
        <span className="text-sm font-semibold text-ink">{title}</span>
      </div>
      <p className="mt-1 text-xs leading-5 text-slate-500">{text}</p>
    </div>
  );
}

function MobileData({ label, value, full = false }) {
  return (
    <div className={full ? "sm:col-span-2" : ""}>
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className="mt-1 text-sm text-ink">{value}</p>
    </div>
  );
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
