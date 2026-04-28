import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
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
  const [pendingDeleteRecord, setPendingDeleteRecord] = useState(null);
  const [isDashboardLoading, setIsDashboardLoading] = useState(true);
  const [isRecordsLoading, setIsRecordsLoading] = useState(true);
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
    setIsDashboardLoading(true);
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
    } finally {
      setIsDashboardLoading(false);
    }
  }

  async function loadRecords() {
    setIsRecordsLoading(true);
    try {
      const response = await buildRecordsRequest();
      setRecordsPage(response);
      setTableMessage("");
    } catch (error) {
      setTableMessage(error.message || "Could not load records.");
      throw error;
    } finally {
      setIsRecordsLoading(false);
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

    if (!payload.vehicleId || !payload.zone || !form.speed) {
      setFeedback({ type: "error", text: "Please complete vehicle ID, speed, and zone before submitting." });
      return;
    }
    if (!Number.isFinite(payload.speed) || payload.speed <= 0) {
      setFeedback({ type: "error", text: "Speed must be a valid number greater than zero." });
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
        const savedRecord = result.violation;
        setFeedback({
          type: getFeedbackType(savedRecord),
          text: savedRecord
            ? `${result.message} Record #${savedRecord.id} saved.`
            : result.message || "Traffic check completed."
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
    try {
      await apiFetch(`/traffic/${recordId}`, { method: "DELETE" });
      setPendingDeleteRecord(null);
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
      <header className="border-b border-white/10 bg-[linear-gradient(135deg,#0f1724_0%,#142438_52%,#18304a_100%)] text-white shadow-[0_24px_60px_rgba(6,12,22,0.22)]">
        <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_14px_34px_rgba(7,14,24,0.22)] sm:h-22 sm:w-22">
                  <img
                    src="/logo.png"
                    alt="Indian Traffic Police"
                    className="h-full w-full scale-[1.16] object-cover"
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1.5 text-sm font-medium text-slate-100 backdrop-blur">
                    <FiServer className="text-sm" />
                    Traffic Violation Dashboard
                  </span>
                  <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1.5 text-sm font-medium text-slate-100 backdrop-blur">
                    <FiDatabase className="text-sm" />
                    Live records
                  </span>
                </div>
              </div>
              <div>
                <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                  Traffic violation monitoring
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-200 sm:text-base">
                  Review violation stats, check vehicles, and manage records from one focused dashboard.
                </p>
              </div>
            </div>

            <motion.div
              className="w-full max-w-xl rounded-lg border border-white/12 bg-white/10 p-4 shadow-[0_18px_50px_rgba(6,12,22,0.24)] backdrop-blur-md sm:p-5"
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35 }}
            >
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white/10">
                  <span className={`flex h-9 w-9 items-center justify-center rounded-full text-white shadow-inner ${statusTheme.color}`}>
                    <StatusIcon className="text-lg" />
                  </span>
                </div>
                <div className="min-w-0 space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-300">Backend status</p>
                  <h2 className="text-lg font-semibold text-white">{statusTheme.label}</h2>
                  <p className="text-sm leading-6 text-slate-200">{status.note || statusTheme.description}</p>
                  <p className="break-all text-xs text-slate-300">{API_BASE_URL}</p>
                </div>
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-3">
                <StatusHint tone="bg-emerald-500" title="Live" text="Requests are succeeding." />
                <StatusHint tone="bg-amber-500" title="Waking" text="First load can take longer." />
                <StatusHint tone="bg-slate-500" title="Retrying" text="The dashboard keeps checking." />
              </div>
            </motion.div>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-5 px-4 py-5 sm:px-6 lg:px-8">
        <section className="grid gap-5">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <MetricCard icon={FiAlertTriangle} label="Total violations" value={stats.totalViolations} footnote="Recorded cases in the current database" loading={isDashboardLoading} />
            <MetricCard icon={FiTrendingUp} label="Total fine collected" value={formatCurrency(stats.totalFineCollected)} footnote="Total amount across stored violations" loading={isDashboardLoading} />
            <MetricCard icon={FiMapPin} label="Most active zone" value={topZone} footnote="Zone with the highest number of violations" loading={isDashboardLoading} />
          </div>

          <div className="panel panel-soft p-5">
            <SectionHeader eyebrow="Analytics" title="Violations by zone" />
            <div className="mt-4 grid gap-5">
              {isDashboardLoading ? (
                <AnalyticsSkeleton />
              ) : (
                <ZoneChart entries={zoneEntries} />
              )}
              {!isDashboardLoading && zoneEntries.length ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {zoneEntries.map(([zone, count], index) => (
                    <motion.div
                      key={zone}
                      layout
                      className="rounded-lg border border-white/10 bg-white/40 px-4 py-3"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-ink" title={zone}>{zone}</p>
                          <p className="mt-1 text-xs text-slate-500">Rank #{index + 1}</p>
                        </div>
                        <span className="shrink-0 rounded-full bg-white px-3 py-1 text-sm font-semibold text-slate-700">{count}</span>
                      </div>
                    </motion.div>
                  ))}
                </div>
              ) : (
                !isDashboardLoading && <EmptyInline text="No zone data yet." />
              )}
            </div>
          </div>
        </section>

        <section className="grid gap-5 lg:grid-cols-[1.55fr_0.85fr]">
          <motion.div
            className="panel panel-soft p-5"
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

            <form className="mt-5 grid gap-5" onSubmit={handleSubmit} noValidate>
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

          <div className="panel panel-soft p-5">
            <SectionHeader eyebrow="Rules" title="Fine engine" />
            <div className="mt-5 space-y-3 text-sm text-slate-700">
              <RuleRow speed="81 - 100 km/h" fine="Rs. 1000" />
              <RuleRow speed="101 - 120 km/h" fine="Rs. 2000" />
              <RuleRow speed="Above 120 km/h" fine="Rs. 5000" />
            </div>
            <div className="mt-5 rounded-lg border border-white/10 bg-white/10 p-4 text-sm leading-6 text-slate-600">
              Emergency vehicles are exempt. If the hosted API is asleep, the dashboard keeps retrying in the background.
            </div>
          </div>
        </section>

        <section className="panel panel-soft p-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <SectionHeader eyebrow="Records" title="Traffic records" />
            <div className="text-sm text-slate-500">
              {isRecordsLoading ? "Loading records..." : `Showing ${recordsPage.numberOfElements || 0} of ${recordsPage.totalElements || 0} records`}
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
            {isRecordsLoading ? (
              Array.from({ length: 3 }).map((_, index) => <RecordCardSkeleton key={index} />)
            ) : recordsPage.content.length ? (
              recordsPage.content.map((record) => (
                <article key={record.id} className="rounded-lg border border-white/10 bg-white/90 p-4 shadow-[0_10px_24px_rgba(15,23,36,0.08)]">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Record</p>
                      <h3 className="mt-1 text-lg font-semibold text-ink">#{record.id}</h3>
                    </div>
                    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${getRecordStatus(record).className}`}>
                      {getRecordStatus(record).label}
                    </span>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <MobileData label="Vehicle" value={record.vehicleId} />
                    <MobileData label="Speed" value={`${record.speed} km/h`} />
                    <MobileData label="Zone" value={record.zone} />
                    <MobileData label="Fine" value={formatCurrency(record.fine)} />
                    <MobileData label="Status" value={getRecordStatus(record).label} />
                    <MobileData label="Created" value={formatDate(record.createdAt)} full />
                  </div>

                  <div className="mt-4 flex gap-2">
                    <button className="button-secondary flex-1 gap-2" type="button" onClick={() => handleEdit(record.id)}>
                      <FiEdit3 />
                      Edit
                    </button>
                    <button className="button-secondary flex-1 gap-2 text-rose-600" type="button" onClick={() => setPendingDeleteRecord(record)}>
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
                <thead className="bg-slate-100/90 text-left text-xs uppercase tracking-[0.16em] text-slate-500">
                  <tr>
                    {["ID", "Vehicle", "Speed", "Zone", "Fine", "Status", "Created", "Actions"].map((heading) => (
                      <th key={heading} className="border-b border-line px-4 py-3 font-semibold">
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="bg-white text-sm">
                  {isRecordsLoading ? (
                    Array.from({ length: 5 }).map((_, index) => (
                      <tr key={index} className="border-b border-line/80 last:border-b-0">
                        <td colSpan="8" className="px-4 py-4">
                          <div className="grid grid-cols-[0.55fr_1.1fr_0.9fr_1fr_0.9fr_1fr_1.2fr_0.8fr] gap-3">
                            {Array.from({ length: 8 }).map((__, cellIndex) => (
                              <SkeletonBlock key={cellIndex} className="h-10" />
                            ))}
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : recordsPage.content.length ? (
                    recordsPage.content.map((record) => (
                      <tr key={record.id} className="border-b border-line/80 last:border-b-0">
                        <td className="px-4 py-4 font-semibold text-slate-700">{record.id}</td>
                        <td className="px-4 py-4">{record.vehicleId}</td>
                        <td className="px-4 py-4">{record.speed} km/h</td>
                        <td className="px-4 py-4">{record.zone}</td>
                        <td className="px-4 py-4">{formatCurrency(record.fine)}</td>
                        <td className="px-4 py-4">
                          <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${getRecordStatus(record).className}`}>
                            {getRecordStatus(record).label}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-4">{formatDate(record.createdAt)}</td>
                        <td className="px-4 py-4">
                          <div className="flex gap-2">
                            <button className="button-secondary h-9 px-3" type="button" onClick={() => handleEdit(record.id)}>
                              <FiEdit3 />
                            </button>
                            <button className="button-secondary h-9 px-3 text-rose-600" type="button" onClick={() => setPendingDeleteRecord(record)}>
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
            <div className="text-sm text-slate-500">{isRecordsLoading ? "" : tableMessage}</div>
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

        <AnimatePresence>
          {pendingDeleteRecord && (
            <motion.div
              className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <motion.div
                className="panel panel-soft w-full max-w-md p-5"
                initial={{ opacity: 0, y: 16, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.98 }}
              >
                <SectionHeader eyebrow="Confirm" title="Delete record" />
                <p className="mt-3 text-sm leading-6 text-slate-600">
                  Delete record #{pendingDeleteRecord.id} for {pendingDeleteRecord.vehicleId}? This action cannot be undone.
                </p>
                <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:justify-end">
                  <button className="button-secondary w-full sm:w-auto" type="button" onClick={() => setPendingDeleteRecord(null)}>
                    Cancel
                  </button>
                  <button className="button-primary w-full bg-rose-600 hover:bg-rose-700 focus:ring-rose-100 sm:w-auto" type="button" onClick={() => handleDelete(pendingDeleteRecord.id)}>
                    Delete record
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
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

function MetricCard({ icon: Icon, label, value, footnote, loading = false }) {
  const resolvedValue = String(value ?? "");
  return (
    <motion.article
      className="panel panel-soft flex min-h-[168px] flex-col justify-between p-5"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="text-sm font-medium text-slate-500">{label}</span>
          <div
            className="mt-3 truncate text-2xl font-semibold text-ink sm:text-3xl"
            title={!loading ? resolvedValue : undefined}
          >
            {loading ? <SkeletonBlock className="h-8 w-28 sm:h-9 sm:w-36" /> : value}
          </div>
        </div>
        <div className="rounded-2xl bg-slate-900/5 p-3 text-teal-700">
          <Icon className="text-xl" />
        </div>
      </div>
      <div className="mt-4 text-sm leading-6 text-slate-500">
        {loading ? <SkeletonBlock className="h-4 w-full max-w-[220px]" /> : footnote}
      </div>
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
  return <p className="rounded-lg border border-dashed border-line bg-white/60 px-4 py-5 text-sm text-slate-500">{text}</p>;
}

function StatusHint({ tone, title, text }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/10 px-3 py-3 text-slate-100">
      <div className="flex items-center gap-2">
        <span className={`h-2.5 w-2.5 rounded-full ${tone}`} />
        <span className="text-sm font-semibold text-white">{title}</span>
      </div>
      <p className="mt-1 text-xs leading-5 text-slate-300">{text}</p>
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

function getRecordStatus(record) {
  if (record.isEmergency) {
    return {
      label: "Emergency exempt",
      className: "bg-sky-50 text-sky-700"
    };
  }
  if (Number(record.fine) > 0) {
    return {
      label: "Violation",
      className: "bg-rose-50 text-rose-700"
    };
  }
  return {
    label: "Within limit",
    className: "bg-emerald-50 text-emerald-700"
  };
}

function getFeedbackType(record) {
  if (!record) return "warning";
  if (record.isEmergency) return "warning";
  if (Number(record.fine) > 0) return "success";
  return "warning";
}

function ZoneChart({ entries }) {
  if (!entries.length) {
    return <EmptyInline text="Charts will appear once zone data is available." />;
  }

  const chartEntries = entries.slice(0, 6).map(([zone, count]) => ({
    zone,
    shortZone: truncateLabel(zone, 10),
    count
  }));
  const barColors = ["#0f766e", "#14b8a6", "#22c55e", "#38bdf8", "#f59e0b", "#fb7185"];

  return (
    <div className="rounded-xl border border-line bg-[linear-gradient(180deg,#f8fbfd_0%,#eef4f8_100%)] p-4 text-ink shadow-[0_18px_40px_rgba(15,23,36,0.08)]">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Zone chart</p>
          <h3 className="mt-1 text-lg font-semibold text-ink">Violations by zone</h3>
        </div>
        <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-600 shadow-sm">
          Top {chartEntries.length} zones
        </span>
      </div>

      <div className="overflow-hidden rounded-lg border border-line bg-white p-3">
        <div className="h-[280px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartEntries} margin={{ top: 12, right: 8, left: -18, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#d9e2ec" vertical={false} />
              <XAxis dataKey="shortZone" tick={{ fill: "#64748b", fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis allowDecimals={false} tick={{ fill: "#64748b", fontSize: 12 }} axisLine={false} tickLine={false} />
              <Tooltip cursor={{ fill: "rgba(15, 23, 42, 0.04)" }} content={<ZoneChartTooltip />} />
              <Bar dataKey="count" radius={[10, 10, 0, 0]} maxBarSize={56}>
                {chartEntries.map((entry, index) => (
                  <Cell key={entry.zone} fill={barColors[index % barColors.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {chartEntries.map((entry, index) => (
          <div key={entry.zone} className="rounded-lg border border-line bg-white px-3 py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ink" title={entry.zone}>{entry.zone}</p>
                <p className="mt-1 text-xs text-slate-500">Chargeable violations</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: barColors[index % barColors.length] }} />
                <span className="text-sm font-semibold text-slate-700">{entry.count}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}


function truncateLabel(value, maxLength) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 1))}…`;
}

function ZoneChartTooltip({ active, payload }) {
  if (!active || !payload?.length) {
    return null;
  }

  const item = payload[0]?.payload;
  if (!item) {
    return null;
  }

  return (
    <div className="rounded-lg border border-line bg-white px-3 py-2 shadow-lg">
      <p className="text-sm font-semibold text-ink">{item.zone}</p>
      <p className="mt-1 text-xs text-slate-600">{item.count} chargeable violation{item.count === 1 ? "" : "s"}</p>
    </div>
  );
}

function AnalyticsSkeleton() {
  return (
    <div className="rounded-xl border border-white/10 bg-[linear-gradient(180deg,rgba(15,23,36,0.96)_0%,rgba(25,42,63,0.94)_100%)] p-4 text-white shadow-[0_18px_40px_rgba(15,23,36,0.18)]">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="space-y-2">
          <SkeletonBlock className="h-3 w-24 bg-white/15" />
          <SkeletonBlock className="h-6 w-40 bg-white/15" />
        </div>
        <SkeletonBlock className="h-8 w-16 rounded-full bg-white/15" />
      </div>
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="grid gap-2 sm:grid-cols-[minmax(0,150px)_1fr_auto] sm:items-center">
            <SkeletonBlock className="h-4 w-24 bg-white/15" />
            <SkeletonBlock className="h-3 w-full rounded-full bg-white/15" />
            <SkeletonBlock className="h-4 w-8 bg-white/15" />
          </div>
        ))}
      </div>
    </div>
  );
}

function RecordCardSkeleton() {
  return (
    <article className="rounded-lg border border-white/10 bg-white/90 p-4 shadow-[0_10px_24px_rgba(15,23,36,0.08)]">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-2">
          <SkeletonBlock className="h-3 w-14" />
          <SkeletonBlock className="h-6 w-20" />
        </div>
        <SkeletonBlock className="h-7 w-28 rounded-full" />
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className={index === 4 ? "sm:col-span-2" : ""}>
            <SkeletonBlock className="h-3 w-16" />
            <SkeletonBlock className="mt-2 h-5 w-full max-w-[160px]" />
          </div>
        ))}
      </div>
      <div className="mt-4 flex gap-2">
        <SkeletonBlock className="h-11 flex-1 rounded-lg" />
        <SkeletonBlock className="h-11 flex-1 rounded-lg" />
      </div>
    </article>
  );
}

function SkeletonBlock({ className = "" }) {
  return <div className={`animate-pulse rounded-md bg-slate-200/90 ${className}`} />;
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
