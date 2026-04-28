(function () {
    const state = {
        page: 0,
        size: 5,
        sortBy: "createdAt",
        order: "desc",
        editingId: null,
        filters: {
            zone: "",
            minSpeed: "",
            maxSpeed: ""
        },
        lastPage: true
    };

    const elements = {
        connectionStatus: document.getElementById("connectionStatus"),
        totalViolations: document.getElementById("totalViolations"),
        totalFineCollected: document.getElementById("totalFineCollected"),
        topZone: document.getElementById("topZone"),
        zoneStatsList: document.getElementById("zoneStatsList"),
        violationForm: document.getElementById("violationForm"),
        filterForm: document.getElementById("filterForm"),
        refreshDashboardButton: document.getElementById("refreshDashboardButton"),
        resetFiltersButton: document.getElementById("resetFiltersButton"),
        submitButton: document.getElementById("submitButton"),
        cancelEditButton: document.getElementById("cancelEditButton"),
        emergencyToggle: document.getElementById("emergencyToggle"),
        emergencyLabel: document.getElementById("emergencyLabel"),
        isEmergency: document.getElementById("isEmergency"),
        recordId: document.getElementById("recordId"),
        vehicleId: document.getElementById("vehicleId"),
        speed: document.getElementById("speed"),
        zone: document.getElementById("zone"),
        filterZone: document.getElementById("filterZone"),
        filterMinSpeed: document.getElementById("filterMinSpeed"),
        filterMaxSpeed: document.getElementById("filterMaxSpeed"),
        sortBy: document.getElementById("sortBy"),
        sortOrder: document.getElementById("sortOrder"),
        pageSize: document.getElementById("pageSize"),
        resultPanel: document.getElementById("resultPanel"),
        recordsTableBody: document.getElementById("recordsTableBody"),
        tableSummary: document.getElementById("tableSummary"),
        tableMessage: document.getElementById("tableMessage"),
        prevPageButton: document.getElementById("prevPageButton"),
        nextPageButton: document.getElementById("nextPageButton"),
        pageIndicator: document.getElementById("pageIndicator")
    };

    document.addEventListener("DOMContentLoaded", init);

    function init() {
        bindEvents();
        syncControlsFromState();
        loadDashboard();
    }

    function bindEvents() {
        elements.refreshDashboardButton.addEventListener("click", loadDashboard);
        elements.filterForm.addEventListener("submit", onApplyFilters);
        elements.resetFiltersButton.addEventListener("click", resetFilters);
        elements.violationForm.addEventListener("submit", onSubmitViolation);
        elements.cancelEditButton.addEventListener("click", resetForm);
        elements.prevPageButton.addEventListener("click", goToPreviousPage);
        elements.nextPageButton.addEventListener("click", goToNextPage);
        elements.emergencyToggle.addEventListener("click", toggleEmergencyFlag);
    }

    async function loadDashboard() {
        setConnectionStatus("Syncing", false);
        try {
            await Promise.all([loadStats(), loadRecords()]);
            setConnectionStatus("Live", true);
        } catch (error) {
            setConnectionStatus("Connection issue", false);
            setTableMessage(error.message || "Could not load dashboard data.");
        }
    }

    async function loadStats() {
        const stats = await apiFetch("/traffic/stats");
        elements.totalViolations.textContent = stats.totalViolations ?? 0;
        elements.totalFineCollected.textContent = formatCurrency(stats.totalFineCollected ?? 0);

        const zoneEntries = Object.entries(stats.violationsPerZone || {});
        if (!zoneEntries.length) {
            elements.topZone.textContent = "No data";
            elements.zoneStatsList.innerHTML = '<p class="empty-inline">No zone data yet.</p>';
            return;
        }

        zoneEntries.sort((a, b) => b[1] - a[1]);
        elements.topZone.textContent = zoneEntries[0][0];
        elements.zoneStatsList.innerHTML = zoneEntries.map(([zone, count]) => `
            <div class="zone-chip">
                <span>${escapeHtml(zone)}</span>
                <strong>${count}</strong>
            </div>
        `).join("");
    }

    async function loadRecords() {
        const endpoint = hasActiveFilters() ? "/traffic/filter" : "/traffic/all";
        const query = new URLSearchParams({
            page: String(state.page),
            size: String(state.size),
            sortBy: state.sortBy,
            order: state.order
        });

        if (state.filters.zone) {
            query.set("zone", state.filters.zone);
        }
        if (state.filters.minSpeed) {
            query.set("minSpeed", state.filters.minSpeed);
        }
        if (state.filters.maxSpeed) {
            query.set("maxSpeed", state.filters.maxSpeed);
        }

        const pageData = await apiFetch(`${endpoint}?${query.toString()}`);
        renderTable(pageData);
    }

    function renderTable(pageData) {
        const records = pageData.content || [];
        state.lastPage = !!pageData.last;

        elements.tableSummary.textContent = `Showing ${pageData.numberOfElements || 0} of ${pageData.totalElements || 0} records`;
        elements.pageIndicator.textContent = `Page ${(pageData.number || 0) + 1} of ${Math.max(pageData.totalPages || 1, 1)}`;
        elements.prevPageButton.disabled = !!pageData.first;
        elements.nextPageButton.disabled = !!pageData.last;

        if (!records.length) {
            elements.recordsTableBody.innerHTML = '<tr><td colspan="8" class="table-empty">No records match the current view.</td></tr>';
            return;
        }

        elements.recordsTableBody.innerHTML = records.map((record) => `
            <tr>
                <td>${record.id}</td>
                <td>${escapeHtml(record.vehicleId)}</td>
                <td>${record.speed} km/h</td>
                <td>${escapeHtml(record.zone)}</td>
                <td>${formatCurrency(record.fine)}</td>
                <td><span class="pill ${record.isEmergency ? "safe" : "alert"}">${record.isEmergency ? "Emergency" : "Standard"}</span></td>
                <td>${formatDate(record.createdAt)}</td>
                <td>
                    <div class="table-actions">
                        <button class="action-button" type="button" data-action="edit" data-id="${record.id}">Edit</button>
                        <button class="action-button danger" type="button" data-action="delete" data-id="${record.id}">Delete</button>
                    </div>
                </td>
            </tr>
        `).join("");

        elements.recordsTableBody.querySelectorAll("[data-action='edit']").forEach((button) => {
            button.addEventListener("click", () => startEditing(Number(button.dataset.id)));
        });
        elements.recordsTableBody.querySelectorAll("[data-action='delete']").forEach((button) => {
            button.addEventListener("click", () => deleteRecord(Number(button.dataset.id)));
        });
    }

    async function onSubmitViolation(event) {
        event.preventDefault();
        clearFeedback();

        const payload = {
            vehicleId: elements.vehicleId.value.trim(),
            speed: Number(elements.speed.value),
            zone: elements.zone.value.trim(),
            isEmergency: elements.isEmergency.value === "true"
        };

        if (!payload.vehicleId || !payload.speed || !payload.zone) {
            renderFeedback("Please fill vehicle ID, speed, and zone before submitting.", "error");
            return;
        }

        try {
            if (state.editingId !== null) {
                const updated = await apiFetch(`/traffic/${state.editingId}`, {
                    method: "PUT",
                    body: JSON.stringify(payload)
                });
                resetForm();
                renderFeedback(`Record #${updated.id} updated successfully. Fine is ${formatCurrency(updated.fine)}.`, "success");
            } else {
                const result = await apiFetch("/traffic/check", {
                    method: "POST",
                    body: JSON.stringify(payload)
                });

                resetForm();
                if (result.violationDetected) {
                    renderFeedback(`Violation saved successfully. Fine applied: ${formatCurrency(result.fine)}.`, "success");
                } else {
                    renderFeedback("No violation detected. Nothing was saved because the vehicle is within policy.", "warning");
                }
            }

            await loadDashboard();
        } catch (error) {
            renderFeedback(error.message || "Unable to save record.", "error");
        }
    }

    async function startEditing(id) {
        try {
            const record = await apiFetch(`/traffic/${id}`);
            state.editingId = record.id;
            elements.recordId.value = String(record.id);
            elements.vehicleId.value = record.vehicleId || "";
            elements.speed.value = record.speed || "";
            elements.zone.value = record.zone || "";
            setEmergencyFlag(!!record.isEmergency);
            elements.submitButton.textContent = "Update Violation";
            elements.cancelEditButton.classList.remove("hidden");
            renderFeedback(`Editing record #${record.id}. Update the fields and save changes.`, "warning");
            window.scrollTo({top: 0, behavior: "smooth"});
        } catch (error) {
            renderFeedback(error.message || "Unable to load record for editing.", "error");
        }
    }

    async function deleteRecord(id) {
        const confirmed = window.confirm(`Delete violation record #${id}?`);
        if (!confirmed) {
            return;
        }

        try {
            await apiFetch(`/traffic/${id}`, {method: "DELETE"});
            setTableMessage(`Record #${id} deleted.`);
            if (state.page > 0) {
                state.page = Math.max(0, state.page - 1);
            }
            await loadDashboard();
        } catch (error) {
            setTableMessage(error.message || "Unable to delete record.");
        }
    }

    function onApplyFilters(event) {
        event.preventDefault();
        state.page = 0;
        state.size = Number(elements.pageSize.value);
        state.sortBy = elements.sortBy.value;
        state.order = elements.sortOrder.value;
        state.filters.zone = elements.filterZone.value.trim();
        state.filters.minSpeed = elements.filterMinSpeed.value.trim();
        state.filters.maxSpeed = elements.filterMaxSpeed.value.trim();
        setTableMessage("");
        loadRecords().catch((error) => setTableMessage(error.message || "Unable to apply filters."));
    }

    function resetFilters() {
        state.page = 0;
        state.size = 5;
        state.sortBy = "createdAt";
        state.order = "desc";
        state.filters = {zone: "", minSpeed: "", maxSpeed: ""};
        syncControlsFromState();
        setTableMessage("");
        loadRecords().catch((error) => setTableMessage(error.message || "Unable to reset filters."));
    }

    function goToPreviousPage() {
        if (state.page === 0) {
            return;
        }
        state.page -= 1;
        loadRecords().catch((error) => setTableMessage(error.message || "Unable to load previous page."));
    }

    function goToNextPage() {
        if (state.lastPage) {
            return;
        }
        state.page += 1;
        loadRecords().catch((error) => setTableMessage(error.message || "Unable to load next page."));
    }

    function resetForm() {
        state.editingId = null;
        elements.violationForm.reset();
        elements.recordId.value = "";
        elements.submitButton.textContent = "Check & Save Violation";
        elements.cancelEditButton.classList.add("hidden");
        setEmergencyFlag(false);
        clearFeedback();
    }

    function toggleEmergencyFlag() {
        setEmergencyFlag(elements.isEmergency.value !== "true");
    }

    function setEmergencyFlag(isEmergency) {
        elements.isEmergency.value = isEmergency ? "true" : "false";
        elements.emergencyToggle.setAttribute("aria-pressed", isEmergency ? "true" : "false");
        elements.emergencyLabel.textContent = isEmergency ? "Yes" : "No";
    }

    function syncControlsFromState() {
        elements.filterZone.value = state.filters.zone;
        elements.filterMinSpeed.value = state.filters.minSpeed;
        elements.filterMaxSpeed.value = state.filters.maxSpeed;
        elements.pageSize.value = String(state.size);
        elements.sortBy.value = state.sortBy;
        elements.sortOrder.value = state.order;
        setEmergencyFlag(false);
    }

    async function apiFetch(url, options = {}) {
        const config = {
            headers: {
                "Content-Type": "application/json"
            },
            ...options
        };

        const response = await fetch(url, config);
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
    }

    function renderFeedback(message, type) {
        elements.resultPanel.className = `feedback-panel ${type}`;
        elements.resultPanel.textContent = message;
        elements.resultPanel.classList.remove("hidden");
    }

    function clearFeedback() {
        elements.resultPanel.className = "feedback-panel hidden";
        elements.resultPanel.textContent = "";
    }

    function setTableMessage(message) {
        elements.tableMessage.textContent = message || "";
    }

    function setConnectionStatus(label, live) {
        elements.connectionStatus.textContent = label;
        elements.connectionStatus.style.background = live ? "rgba(17, 129, 103, 0.22)" : "rgba(255, 255, 255, 0.16)";
    }

    function hasActiveFilters() {
        return !!(state.filters.zone || state.filters.minSpeed || state.filters.maxSpeed);
    }

    function formatCurrency(value) {
        return `Rs. ${Number(value || 0).toLocaleString("en-IN")}`;
    }

    function formatDate(value) {
        if (!value) {
            return "-";
        }
        return new Date(value).toLocaleString("en-IN", {
            day: "2-digit",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit"
        });
    }

    function escapeHtml(value) {
        return String(value)
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#39;");
    }
})();
