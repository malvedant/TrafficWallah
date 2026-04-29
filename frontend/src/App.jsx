import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  PieChart,
  Pie,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip
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
  status: "",
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
  const [draftFilters, setDraftFilters] = useState(defaultFilters);
  const [form, setForm] = useState(initialForm);
  const [sortBy, setSortBy] = useState("createdAt");
  const [sortOrder, setSortOrder] = useState("desc");
  const [pageSize, setPageSize] = useState(5);
  const [page, setPage] = useState(0);
  const [editingRecordId, setEditingRecordId] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [tableMessage, setTableMessage] = useState("");
  const [pendingDeleteRecord, setPendingDeleteRecord] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
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

  async function loadRecords(nextFilters = filters, nextPage = page) {
    setIsRecordsLoading(true);
    try {
      const response = await buildRecordsRequest(nextFilters, nextPage);
      setRecordsPage(response);
      setTableMessage("");
    } catch (error) {
      setTableMessage(error.message || "Could not load records.");
      throw error;
    } finally {
      setIsRecordsLoading(false);
    }
  }

  function buildRecordsRequest(activeFilters = filters, activePage = page) {
    const path = hasActiveFilters(activeFilters) ? "/traffic/filter" : "/traffic/all";
    const query = new URLSearchParams({
      page: String(activePage),
      size: String(pageSize),
      sortBy,
      order: sortOrder
    });

    if (activeFilters.zone) query.set("zone", activeFilters.zone);
    if (activeFilters.status) query.set("status", activeFilters.status);
    if (activeFilters.minSpeed) query.set("minSpeed", activeFilters.minSpeed);
    if (activeFilters.maxSpeed) query.set("maxSpeed", activeFilters.maxSpeed);

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

  function hasActiveFilters(activeFilters = filters) {
    return Boolean(activeFilters.zone || activeFilters.status || activeFilters.minSpeed || activeFilters.maxSpeed);
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
      setIsSubmitting(true);
      setFeedback({
        type: "warning",
        text: editingRecordId !== null ? "Updating record. Please wait..." : "Saving traffic check. Please wait..."
      });

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
    } finally {
      setIsSubmitting(false);
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
    setFilters(draftFilters);
    setPage(0);
    await loadRecords(draftFilters, 0);
  }

  function clearFilters() {
    setDraftFilters(defaultFilters);
    setFilters(defaultFilters);
    setSortBy("createdAt");
    setSortOrder("desc");
    setPageSize(5);
    setPage(0);
    setTableMessage("");
    loadRecords(defaultFilters, 0).catch((error) => setTableMessage(error.message || "Could not refresh records."));
  }

  return (
<div className="min-h-screen">
      {/* New centered header */}
      <header className="border-b-2 border-orange-200/50 bg-white/90 shadow-subtle">
        <div className="mx-auto flex max-w-4xl flex-col items-center gap-4 px-6 py-8 md:flex-row md:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl border-4 border-orange-200 bg-orange-50 shadow-subtle text-4xl">
              🚦
            </div>
            <div className="text-center md:text-left">
              <h1 className="text-2xl font-bold text-orange-900 md:text-3xl">TrafficSpring</h1>
              <p className="text-sm text-orange-700">Violation Monitoring Dashboard</p>
            </div>
          </div>
          
          {/* Simplified centered status */}
          <div className="flex items-center gap-2 rounded-2xl bg-orange-50 px-4 py-2 text-sm font-medium text-orange-800">
            <StatusIcon className="text-lg" />
            <span>{statusTheme.label}</span>
            <span className="text-orange-600">{status.note?.split(' ')[0] || 'Live'}</span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-12">
        {/* Stacked metrics - vertical on mobile, horizontal on large */}
        <section className="mb-12 flex flex-col gap-6 lg:flex-row lg:gap-8">
          <MetricCard icon={FiAlertTriangle} label="Total violations" value={stats.totalViolations} footnote="Recorded cases" loading={isDashboardLoading} className="flex-1 lg:max-w-sm" />
          <MetricCard icon={FiTrendingUp} label="Total fines" value={formatCurrency(stats.totalFineCollected)} footnote="Collected amount" loading={isDashboardLoading} className="flex-1 lg:max-w-sm" />
          <MetricCard icon={FiMapPin} label="Top zone" value={topZone} footnote="Most violations" loading={isDashboardLoading} className="flex-1 lg:max-w-sm" />
        </section>

        {/* Centered analytics card */}
        <section className="panel-soft p-8 mb-12">
          <SectionHeader eyebrow="Analytics" title="Violations by zone" className="mb-8 text-center" />
          <div className="grid gap-8 lg:grid-cols-3">
            <div className="lg:col-span-2">
              {isDashboardLoading ? (
                <AnalyticsSkeleton />
              ) : (
                <ZoneChart entries={zoneEntries} />
              )}
            </div>
            <div className="space-y-4">
              {!isDashboardLoading && zoneEntries.length ? (
                zoneEntries.slice(0,5).map(([zone, count], index) => (
                  <div key={zone} className="flex items-center justify-between rounded-xl border border-orange-200/50 bg-white p-4 shadow-subtle">
                    <div>
                      <p className="font-semibold text-orange-900 truncate max-w-[140px]" title={zone}>{zone}</p>
                      <p className="text-xs text-orange-600">#{index + 1}</p>
                    </div>
                    <span className="rounded-full bg-orange-100 px-3 py-1 text-sm font-bold text-orange-700">{count}</span>
                  </div>
                ))
              ) : (
                <div className="text-center py-12 text-orange-500">No data</div>
              )}
            </div>
          </div>
        </section>

        {/* New full-width prominent form section, rules sidebar */}
        <section className="grid gap-8 lg:grid-cols-[2fr_1fr]">
          {/* Prominent centered form */}
          <div className="panel-soft p-8">
            <div className="mb-6 flex flex-col items-center gap-2 text-center lg:flex-row lg:items-end lg:justify-between lg:text-left">
              <SectionHeader eyebrow="Check Vehicle" title={editingRecordId ? `Edit #${editingRecordId}` : "New Check"} />
              <button className="button-secondary gap-2" type="button" onClick={loadDashboard}>
                <FiRefreshCcw className="text-lg" />
                <span className="hidden sm:inline">Refresh</span>
              </button>
            </div>

            <form className="grid max-w-2xl gap-6 mx-auto" onSubmit={handleSubmit} noValidate>
              <div className="grid gap-6 md:grid-cols-2">
                <Field label="Vehicle ID *" className="md:col-span-2 lg:col-span-1">
                  <input
                    className="input-surface"
                    value={form.vehicleId}
                    onChange={(e) => handleFormChange("vehicleId", e.target.value)}
                    placeholder="e.g. MH12AB1234"
                    disabled={isSubmitting}
                    required
                  />
                </Field>
                <Field label="Speed (km/h) *" className="lg:col-span-1">
                  <input
                    className="input-surface"
                    type="number"
                    min="1"
                    step="0.1"
                    value={form.speed}
                    onChange={(e) => handleFormChange("speed", e.target.value)}
                    placeholder="e.g. 110"
                    disabled={isSubmitting}
                    required
                  />
                </Field>
                <Field label="Zone *" className="md:col-span-2 lg:col-span-2">
                  <input
                    className="input-surface"
                    value={form.zone}
                    onChange={(e) => handleFormChange("zone", e.target.value)}
                    placeholder="e.g. Pune Expressway"
                    disabled={isSubmitting}
                    required
                  />
                </Field>
                <Field label="Emergency Vehicle" className="md:col-span-2">
                  <div className="flex items-center justify-between p-4 rounded-2xl border-2 border-orange-200 bg-white shadow-subtle hover:border-orange-300 transition-all">
                    <span className="text-base font-semibold text-orange-900">{form.isEmergency ? "Enabled" : "Disabled"}</span>
                    <button
                      type="button"
                      className={`w-14 h-7 relative rounded-full transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-orange-200 ${form.isEmergency ? 'bg-orange-500' : 'bg-orange-200'}`}
                      onClick={() => handleFormChange("isEmergency", !form.isEmergency)}
                      disabled={isSubmitting}
                    >
                      <span className={`absolute inset-0.5 bg-white rounded-full shadow-inner transition-transform duration-200 w-6 h-6 flex items-center justify-center ${form.isEmergency ? 'translate-x-7' : ''}`}>
                        ✓
                      </span>
                    </button>
                  </div>
                </Field>
              </div>

              <div className="flex flex-col gap-4 sm:flex-row justify-center">
                <button 
                  className="button-primary w-full max-w-sm flex-grow sm:w-auto px-8 !text-lg !h-14 shadow-lg" 
                  type="submit" 
                  disabled={isSubmitting}
                >
                  <FiZap className="mr-2" />
                  {isSubmitting
                    ? editingRecordId ? "Updating..." : "Checking..."
                    : editingRecordId ? "Save Changes" : "Check Vehicle"
                  }
                </button>
                {editingRecordId && (
                  <button className="button-secondary w-full max-w-sm sm:w-auto px-8 !h-14" type="button" onClick={resetForm} disabled={isSubmitting}>
                    Cancel
                  </button>
                )}
              </div>
            </form>

            {feedback && (
              <motion.div
                initial={{ opacity: 0, y: 8, height: 0 }}
                animate={{ opacity: 1, y: 0, height: "auto" }}
                exit={{ opacity: 0, y: -8, height: 0 }}
                className={`mt-8 p-6 rounded-2xl mx-auto max-w-2xl text-center font-medium ${
                  feedback.type === 'success' 
                    ? 'bg-orange-50 border-2 border-orange-200 text-orange-800' 
                    : feedback.type === 'warning' 
                    ? 'bg-amber-50 border-2 border-amber-200 text-amber-800' 
                    : 'bg-red-50 border-2 border-red-200 text-red-800'
                }`}
              >
                {feedback.text}
              </motion.div>
            )}
          </div>

          {/* Rules sidebar - vertical stack */}
          <div className="space-y-6 lg:max-h-[calc(100vh-20rem)] lg:overflow-y-auto">
            <div className="panel-soft p-6 sticky top-4 lg:sticky">
              <SectionHeader eyebrow="Fines" title="Fine Rules" />
              <div className="mt-6 space-y-3">
                <div className="flex justify-between items-center p-4 bg-white rounded-xl border-l-4 border-orange-400 shadow-subtle">
                  <span className="font-semibold text-orange-900">81-100 km/h</span>
                  <span className="bg-orange-100 text-orange-700 px-3 py-1 rounded-lg font-bold text-sm">₹1000</span>
                </div>
                <div className="flex justify-between items-center p-4 bg-white rounded-xl border-l-4 border-orange-500 shadow-subtle">
                  <span className="font-semibold text-orange-900">101-120 km/h</span>
                  <span className="bg-orange-200 text-orange-800 px-3 py-1 rounded-lg font-bold text-sm">₹2000</span>
                </div>
                <div className="flex justify-between items-center p-4 bg-white rounded-xl border-l-4 border-orange-600 shadow-subtle">
                  <span className="font-semibold text-orange-900">120+ km/h</span>
                  <span className="bg-orange-300 text-orange-900 px-3 py-1 rounded-lg font-bold text-sm">₹5000</span>
                </div>
              </div>
              <div className="mt-6 p-4 bg-orange-50 border border-orange-200 rounded-xl text-sm text-orange-800 leading-relaxed">
                ✅ Emergency vehicles exempt<br/>
                🔄 Server auto-wakes on first request
              </div>
            </div>
          </div>
        </section>

        {/* Card-based records with sidebar filters */}
        <div className="grid gap-8 lg:grid-cols-[300px_1fr]">
          {/* Filters sidebar */}
          <div className="panel-soft p-6 lg:sticky lg:top-4 lg:h-fit lg:max-h-screen lg:overflow-y-auto">
            <SectionHeader eyebrow="Filter" title="Records" />
            
            <form className="mt-6 space-y-4" onSubmit={applyFilters}>
              <Field label="Zone">
                <input
                  className="input-surface"
                  value={draftFilters.zone}
                  onChange={(e) => setDraftFilters(prev => ({...prev, zone: e.target.value}))}
                  placeholder="Any zone"
                />
              </Field>
              
              <Field label="Status">
                <select 
                  className="input-surface" 
                  value={draftFilters.status}
                  onChange={(e) => setDraftFilters(prev => ({...prev, status: e.target.value}))}
                >
                  <option value="">All status</option>
                  <option value="VIOLATION">Violations</option>
                  <option value="EMERGENCY_EXEMPT">Emergency exempt</option>
                  <option value="WITHIN_LIMIT">OK</option>
                </select>
              </Field>
              
              <div className="grid grid-cols-2 gap-3">
                <Field label="Min Speed">
                  <input
                    className="input-surface"
                    type="number"
                    min="1"
                    value={draftFilters.minSpeed}
                    onChange={(e) => setDraftFilters(prev => ({...prev, minSpeed: e.target.value}))}
                    placeholder="80"
                  />
                </Field>
                <Field label="Max Speed">
                  <input
                    className="input-surface"
                    type="number"
                    min="1"
                    value={draftFilters.maxSpeed}
                    onChange={(e) => setDraftFilters(prev => ({...prev, maxSpeed: e.target.value}))}
                    placeholder="150"
                  />
                </Field>
              </div>
              
              <div className="space-y-2 pt-2">
                <Field label="Sort">
                  <select className="input-surface" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
                    <option value="createdAt">Newest first</option>
                    <option value="speed">Speed</option>
                    <option value="fine">Fine amount</option>
                    <option value="zone">Zone</option>
                  </select>
                </Field>
                <Field label="Per page">
                  <select className="input-surface" value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
                    <option value="5">5</option>
                    <option value="10">10</option>
                    <option value="20">20</option>
                  </select>
                </Field>
              </div>
              
              <div className="grid grid-cols-1 gap-3 pt-1">
                <button className="button-primary w-full" type="submit">
                  <FiFilter className="mr-2 inline" />
                  Apply filters
                </button>
                <button className="button-secondary w-full" type="button" onClick={clearFilters}>
                  Reset all
                </button>
              </div>
              
              <div className="pt-4 border-t border-orange-200 text-xs text-orange-600 text-center">
                {recordsPage.totalElements || 0} total records
              </div>
            </form>
          </div>
          
          {/* Records cards/grid */}
          <div>
            <div className="flex flex-wrap items-center justify-between gap-4 mb-6 pb-4 border-b border-orange-200">
              <div className="text-lg font-bold text-orange-900">
                Recent Records
                <span className="ml-2 text-sm font-normal text-orange-600 bg-orange-100 px-2 py-1 rounded-full">
                  Page {page + 1}
                </span>
              </div>
              <div className="text-sm text-orange-600">
                {isRecordsLoading ? 'Loading...' : `${recordsPage.numberOfElements || 0} shown`}
              </div>
            </div>
            
            {isRecordsLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {Array.from({length: 6}).map((_, i) => (
                  <RecordCardSkeleton key={i} />
                ))}
              </div>
            ) : recordsPage.content?.length ? (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
{recordsPage.content.map((record, index) => (
                  <div key={record.id || index} className="rounded-2xl border border-orange-200/50 bg-white p-6 shadow-subtle hover:shadow-lg hover:border-orange-300">
                    <div className="flex items-start justify-between mb-4">
                      <div className="space-y-1">
                        <h3 className="font-bold text-xl text-orange-900 truncate" title={record.vehicleId}>
                          {record.vehicleId}
                        </h3>
                        <p className="text-sm text-orange-700">{record.zone}</p>
                      </div>
                      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100">
                        <button className="p-2 rounded-xl bg-orange-100 text-orange-700 hover:bg-orange-200">Edit</button>
                        <button className="p-2 rounded-xl bg-rose-100 text-rose-700 hover:bg-rose-200">Delete</button>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div>
                        <p className="text-xs font-semibold uppercase text-orange-600">Speed</p>
                        <p className="text-2xl font-bold text-orange-900">{record.speed} km/h</p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase text-orange-600">Fine</p>
                        <p className="text-xl font-bold text-orange-900">{formatCurrency(record.fine)}</p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold ${record.isEmergency ? 'bg-sky-50 text-sky-700' : Number(record.fine) > 0 ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}>
                        {record.isEmergency ? 'Emergency exempt' : Number(record.fine) > 0 ? 'Violation' : 'Within limit'}
                      </span>
                      <p className="text-sm text-orange-700">{new Date(record.createdAt).toLocaleString('en-IN')}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="panel-soft p-16 text-center">
                <FiDatabase className="mx-auto h-16 w-16 text-orange-300 mb-4" />
                <h3 className="text-xl font-semibold text-orange-900 mb-2">No records found</h3>
                <p className="text-orange-600 mb-6">Try adjusting your filters</p>
                <button className="button-secondary" onClick={clearFilters}>
                  Show all records
                </button>
              </div>
            )}
            
            {/* New pagination - more visual */}
            {!isRecordsLoading && recordsPage.totalPages > 1 && (
              <div className="mt-12 flex items-center justify-center gap-2">
                <button 
                  className="button-secondary p-3 rounded-full h-12 w-12 flex items-center justify-center" 
                  disabled={recordsPage.first} 
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                >
                  <FiChevronLeft />
                </button>
                <span className="px-4 py-2 bg-white text-orange-900 font-semibold rounded-xl shadow-subtle min-w-[100px] text-center">
                  Page {page + 1} of {recordsPage.totalPages}
                </span>
                <button 
                  className="button-secondary p-3 rounded-full h-12 w-12 flex items-center justify-center" 
                  disabled={recordsPage.last} 
                  onClick={() => setPage(p => p + 1)}
                >
                  <FiChevronRight />
                </button>
              </div>
            )}
            
            {tableMessage && (
              <div className="mt-8 p-4 rounded-xl bg-orange-50 border border-orange-200 text-orange-800 text-center font-medium">
                {tableMessage}
              </div>
            )}
          </div>
        </div>

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

export function getRecordStatus(record) {
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

export function formatCurrency(value) {
  return `Rs. ${Number(value || 0).toLocaleString("en-IN")}`;
}

export function formatDate(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
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
    name: zone,
    value: count
  }));
  const colors = ["#0f766e", "#14b8a6", "#22c55e", "#38bdf8", "#f59e0b", "#fb7185"];

  return (
    <div className="rounded-xl border border-slate-800/40 bg-[linear-gradient(180deg,#162235_0%,#1b2c43_100%)] p-4 text-white shadow-[0_18px_40px_rgba(15,23,36,0.18)]">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-300">Zone chart</p>
          <h3 className="mt-1 text-lg font-semibold text-white">Violations by zone</h3>
        </div>
        <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-medium text-slate-200">
          Top {chartEntries.length} zones
        </span>
      </div>

      <div className="h-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartEntries}
              cx="50%"
              cy="50%"
              outerRadius={80}
              dataKey="value"
              nameKey="name"
              label={({ name, percent }) => `${name.slice(0,10)}${name.length > 10 ? '...' : ''} ${(percent * 100).toFixed(0)}%`}
            >
              {chartEntries.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
              ))}
            </Pie>
            <Tooltip />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {chartEntries.map((entry, index) => (
          <div key={entry.name} className="rounded-lg border border-white/10 bg-white/10 px-3 py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-white" title={entry.name}>{entry.name}</p>
                <p className="mt-1 text-xs text-slate-300">Violations</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: colors[index % colors.length] }} />
                <span className="text-sm font-semibold text-white">{entry.value}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
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



export default App;
