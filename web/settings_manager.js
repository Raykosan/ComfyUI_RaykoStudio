import { app } from "../../../scripts/app.js";

console.log("🦊 Settings Manager JS v30 (Hybrid Save) loaded at", new Date().toLocaleTimeString());

const STORAGE_KEY = "RaykoStudio.ShowIcon";
const ACTIVE_PRESET_KEY = "RaykoStudio.ActivePreset";

let _activePresetName = sessionStorage.getItem(ACTIVE_PRESET_KEY) || null;

app.registerExtension({
    name: "RaykoStudio.SettingsManager",

    async setup() {
        injectStyles();

        app.ui.settings.addSetting({
            id: "RaykoStudio.SettingsManager.Open",
            name: "Settings Manager",
            type: () => buildSettingsEntry(),
        });

        if (localStorage.getItem(STORAGE_KEY) === "true") {
            waitForActionBar((bar) => injectTopbarButton(bar));
        }

        _startTopbarWatchdog();
    },
});

function buildSettingsEntry() {
    const container = document.createElement("div");
    container.style.display = "flex";
    container.style.flexDirection = "column";
    container.style.gap = "8px";

    const toggleRow = document.createElement("label");
    toggleRow.style.display = "flex";
    toggleRow.style.alignItems = "center";
    toggleRow.style.gap = "10px";
    toggleRow.style.cursor = "pointer";

    const toggle = document.createElement("input");
    toggle.type = "checkbox";
    toggle.checked = localStorage.getItem(STORAGE_KEY) === "true";
    toggle.onchange = () => {
        localStorage.setItem(STORAGE_KEY, toggle.checked ? "true" : "false");
        const existing = document.getElementById("sm-topbar-block");
        if (toggle.checked) {
            waitForActionBar((bar) => injectTopbarButton(bar));
        } else if (existing) {
            existing.remove();
        }
    };

    const toggleLabel = document.createElement("span");
    toggleLabel.textContent = "Show icon in top menu";
    toggleLabel.style.color = "var(--fg-color)";

    toggleRow.appendChild(toggle);
    toggleRow.appendChild(toggleLabel);

    container.appendChild(toggleRow);
    return container;
}

// ============================================================
//                     TOPBAR INJECTION
// ============================================================

function waitForActionBar(callback) {
    const existing = document.querySelector(".actionbar-container");
    if (existing) return callback(existing);

    const observer = new MutationObserver(() => {
        const bar = document.querySelector(".actionbar-container");
        if (bar) {
            observer.disconnect();
            callback(bar);
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => observer.disconnect(), 30000);
}

function injectTopbarButton(actionBar) {
    if (localStorage.getItem(STORAGE_KEY) !== "true") return;
    if (document.getElementById("sm-topbar-block")) return;
    if (!actionBar || !document.body.contains(actionBar)) return;

    const block = document.createElement("div");
    block.id = "sm-topbar-block";
    block.className = "sm-topbar-block";

    const btn = document.createElement("button");
    btn.className = "sm-topbar-btn";
    btn.title = "Settings Manager";
    btn.innerHTML = `<span class="sm-topbar-icon">🖥️</span>`;
    btn.onclick = () => openSettingsManagerModal();
    block.appendChild(btn);

    const closeAllBtn = document.createElement("button");
    closeAllBtn.className = "sm-topbar-btn";
    closeAllBtn.title = "Close All Workflows (Keeps fresh Unsaved)";
    closeAllBtn.innerHTML = `<span class="sm-topbar-icon">🗑️</span>`;
    closeAllBtn.onclick = () => closeAllWorkflowsWithConfirm();
    block.appendChild(closeAllBtn);

    const runContainer = actionBar.querySelector(".flex.h-full.items-center");
    if (runContainer) {
        actionBar.insertBefore(block, runContainer);
    } else {
        actionBar.appendChild(block);
    }
}

function _startTopbarWatchdog() {
    if (window.__smTopbarWatchdog) return;
    window.__smTopbarWatchdog = true;

    setInterval(() => {
        if (localStorage.getItem(STORAGE_KEY) !== "true") return;

        const block = document.getElementById("sm-topbar-block");
        const bar = document.querySelector(".actionbar-container");
        if (!bar) return;

        if (!block) {
            injectTopbarButton(bar);
        } else if (!bar.contains(block)) {
            try { block.remove(); } catch (e) { }
            injectTopbarButton(bar);
        }
    }, 500);
}

// ============================================================
//                    WORKFLOW HELPERS
// ============================================================

function isUnsavedWorkflow(wf) {
    if (!wf) return false;
    const path = wf.path || "";
    return path === "" || path.includes("Unsaved");
}

function setActivePreset(name) {
    _activePresetName = name;
    if (name) {
        sessionStorage.setItem(ACTIVE_PRESET_KEY, name);
    } else {
        sessionStorage.removeItem(ACTIVE_PRESET_KEY);
    }
    updatePresetUI();
}

async function checkActivePresetValidity() {
    if (!_activePresetName) return;
    const wfStore = app.extensionManager?.workflow;
    if (!wfStore) return;

    try {
        const res = await fetch(`/rayko_settings_manager/presets/get/${encodeURIComponent(_activePresetName)}`);
        if (!res.ok) {
            setActivePreset(null);
            return;
        }
        const data = await res.json();
        const paths = data.workflows || [];
        
        const stringPaths = paths.filter(p => typeof p === "string");
        if (stringPaths.length === 0) return;

        const openPaths = (wfStore.openWorkflows || []).map(w => w.path).filter(Boolean);
        const hasOverlap = stringPaths.some(p => openPaths.some(op => op.includes(p)));
        
        if (!hasOverlap) {
            console.log("[Rayko] All preset tabs are closed. Detaching preset.");
            setActivePreset(null);
        }
    } catch (e) {
        console.warn("[Rayko] Failed to check preset validity", e);
    }
}

function getOpenWorkflowPaths() {
    const result = [];
    try {
        const wfStore = app.extensionManager?.workflow;
        const openWorkflows = wfStore?.openWorkflows;

        if (Array.isArray(openWorkflows) && openWorkflows.length > 0) {
            for (const wf of openWorkflows) {
                if (isUnsavedWorkflow(wf)) continue;
                if (wf.path) {
                    result.push(wf.path);
                }
            }
        }
    } catch (e) {
        console.warn("[Rayko] Workflow store access failed", e);
    }
    return result;
}

async function getWorkflowLookup() {
    try {
        const res = await fetch('/api/userdata?dir=workflows&recurse=true');
        if (!res.ok) return {};
        const data = await res.json();
        const map = {};
        for (const item of data) {
            const path = typeof item === "string" ? item : item.name;
            if (!path) continue;
            const fileName = path.split(/[/\\]/).pop();
            if (!map[fileName]) map[fileName] = [];
            map[fileName].push("workflows/" + path);
        }
        return map;
    } catch (e) {
        console.warn("[Rayko] Failed to build workflow lookup", e);
        return {};
    }
}

// ГИБРИДНОЕ СОХРАНЕНИЕ (НАТИВНОЕ ДЛЯ АКТИВНОЙ, POST ДЛЯ ОСТАЛЬНЫХ)
async function saveAllModifiedWorkflows() {
    const wfStore = app.extensionManager?.workflow;
    if (!wfStore) return;

    const openWfs = wfStore.openWorkflows || [];
    console.log(`[Rayko] Starting to save ${openWfs.length} open workflows...`);
    
    let workflowLookup = null;
    let savedAny = false;

    for (const wf of openWfs) {
        let finalPath = wf.path || "";
        console.log(`[Rayko] Checking workflow: ${finalPath}`);
        
        if (finalPath === "" || finalPath.includes("Unsaved")) {
            console.log(`[Rayko] Skipping unsaved/empty: ${finalPath}`);
            continue;
        }

        if (!finalPath.includes("/") && !finalPath.includes("\\")) {
            if (!workflowLookup) {
                workflowLookup = await getWorkflowLookup();
            }
            if (workflowLookup[finalPath] && workflowLookup[finalPath].length > 0) {
                finalPath = workflowLookup[finalPath][0];
            }
        }

        try {
            const isActive = (wfStore.activeWorkflow === wf) || (wfStore.activeWorkflow && wfStore.activeWorkflow.path === wf.path);
            
            console.log(`[Rayko] Is active: ${isActive}`);

            // 1. Для АКТИВНОЙ вкладки используем нативный saveWorkflow (он точно сохранит новые ноды)
            if (isActive && typeof wfStore.saveWorkflow === "function") {
                console.log(`[Rayko] Saving active workflow natively: ${finalPath}`);
                try {
                    await wfStore.saveWorkflow(wf);
                    console.log(`[Rayko] ✅ Natively saved: ${finalPath}`);
                    savedAny = true;
                    continue;
                } catch (e) {
                    console.warn(`[Rayko] Native save failed, falling back to POST`, e);
                }
            }

            // 2. Для НЕАКТИВНЫХ вкладок или при ошибке натива - сохраняем через POST
            let state = null;
            if (isActive) {
                state = app.graph.serialize();
            } else if (wf.changeTracker && wf.changeTracker.activeState) {
                state = JSON.parse(JSON.stringify(wf.changeTracker.activeState));
            } else if (wf.activeState) {
                try { state = JSON.parse(JSON.stringify(wf.activeState)); } catch(e) {}
            }

            if (!state || !state.nodes) {
                console.warn(`[Rayko] No state for ${finalPath}, skipping.`);
                continue;
            }

            console.log(`[Rayko] Force saving ${state.nodes.length} nodes via POST: ${finalPath}`);
            const safePath = encodeURIComponent(finalPath);
            const res = await fetch(`/api/userdata/${safePath}?overwrite=true`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(state)
            });

            if (res.ok) {
                console.log(`[Rayko] ✅ Successfully saved via POST: ${finalPath}`);
                if (wf.changeTracker) wf.changeTracker.isDirty = false;
                if (wf.isModified !== undefined) wf.isModified = false;
                savedAny = true;
            } else {
                console.error(`[Rayko] ❌ Failed to save ${finalPath}: HTTP ${res.status}`);
            }
        } catch (e) {
            console.error(`[Rayko] ❌ Exception saving ${finalPath}`, e);
        }
    }

    if (savedAny) {
        try {
            if (app.extensionManager?.workflow && typeof app.extensionManager.workflow.loadWorkflows === "function") {
                await app.extensionManager.workflow.loadWorkflows();
                console.log("[Rayko] Sidebar workflows reloaded.");
            }
        } catch(e) {}
    }
}

async function saveCurrentStateToActivePreset() {
    if (!_activePresetName) return;

    console.log(`[Rayko] Preparing to update preset: ${_activePresetName}`);
    await saveAllModifiedWorkflows();

    const workflows = getOpenWorkflowPaths();
    if (workflows.length === 0) throw new Error("No valid workflows to save.");

    const res = await fetch("/rayko_settings_manager/presets/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: _activePresetName, workflows }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || "Save failed");
    console.log(`[Rayko] ✅ Preset JSON updated successfully.`);
}

// ============================================================
//                    CLOSE ALL LOGIC
// ============================================================

async function closeAllWorkflowsWithConfirm() {
    const wfStore = app.extensionManager?.workflow;
    if (!wfStore || !wfStore.openWorkflows || wfStore.openWorkflows.length === 0) {
        if (_activePresetName) setActivePreset(null);
        return;
    }

    if (_activePresetName) {
        const action = await smConfirmSavePreset(_activePresetName);
        if (action === "cancel") return;
        if (action === "save") {
            try { await saveCurrentStateToActivePreset(); }
            catch (e) { await smAlert("Save Failed", e.message, true); return; }
        }
    } else {
        const confirmed = await smConfirm({
            title: "Close All Workflows",
            message: "All open workflows will be closed. A fresh Unsaved Workflow will be created. Continue?",
            okText: "Close All",
            danger: true
        });
        if (!confirmed) return;
    }

    await performCloseAll();
    setActivePreset(null);
}

async function performCloseAll() {
    const wfStore = app.extensionManager?.workflow;
    if (!wfStore) return;

    const allWfs = [...(wfStore.openWorkflows || [])];
    let freshWf = null;

    try {
        if (typeof wfStore.createTemporaryWorkflow === "function") {
            freshWf = await wfStore.createTemporaryWorkflow();
        } else if (typeof wfStore.createTemporary === "function") {
            freshWf = await wfStore.createTemporary();
        }

        if (freshWf) {
            const emptyState = { nodes: [], links: [], groups: [], config: {}, extra: {}, version: 0.4 };
            await app.loadGraphData(emptyState, true, true, freshWf);
        }
    } catch (e) {
        console.warn("[Rayko] Failed to create fresh workflow", e);
    }

    for (const wf of allWfs) {
        if (wf === freshWf) continue;
        try {
            if (typeof wfStore.closeWorkflow === "function") {
                await wfStore.closeWorkflow(wf);
            } else if (typeof wf.unload === "function") {
                await wf.unload();
            }
        } catch (e) {
            console.warn("[Rayko] Failed to close", wf, e);
        }
    }

    if (Array.isArray(wfStore.openWorkflowPaths) && freshWf?.path) {
        wfStore.openWorkflowPaths = [freshWf.path];
    }
}

// ============================================================
//                    SETTINGS MODAL
// ============================================================

async function openSettingsManagerModal() {
    if (document.getElementById("sm-modal-overlay")) return;
    
    try { await checkActivePresetValidity(); } catch (e) {}

    const overlay = document.createElement("div");
    overlay.id = "sm-modal-overlay";
    overlay.className = "sm-modal-overlay";
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

    const modal = document.createElement("div");
    modal.className = "sm-modal-content";

    const closeBtn = document.createElement("button");
    closeBtn.className = "sm-btn sm-btn-danger sm-btn-small";
    closeBtn.textContent = "✕ Close";
    closeBtn.style.width = "100%";
    closeBtn.style.marginTop = "10px";
    closeBtn.onclick = () => overlay.remove();

    renderSettingsPanel(modal);
    
    const statusDiv = document.getElementById("sm-status");
    if (statusDiv) {
        statusDiv.className = "sm-status";
        statusDiv.textContent = "";
    }

    modal.appendChild(closeBtn);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    
    updatePresetUI();
}

function renderSettingsPanel(container) {
    container.innerHTML = "";
    const mainDiv = document.createElement("div");
    mainDiv.className = "sm-container";

    renderPresetsSection(mainDiv);

    const saveSection = document.createElement("div");
    saveSection.className = "sm-section";
    saveSection.innerHTML = `
        <div class="sm-title">Save Interface Settings</div>
        <div class="sm-description">Backup current interface configuration to Documents folder</div>
        <input type="text" id="sm-backup-name" class="sm-input" placeholder="name backup">
        <div class="sm-hint">If no name is entered, the creation date will be used.</div>
    `;

    const saveBtn = document.createElement("button");
    saveBtn.className = "sm-btn sm-btn-success";
    saveBtn.textContent = "💾 Save Settings";
    saveBtn.onclick = async function () {
        const nameInput = document.getElementById("sm-backup-name");
        const backupName = nameInput ? nameInput.value.trim() : "";

        showStatus("Saving...", "info");
        saveBtn.disabled = true;
        saveBtn.textContent = "⏳ Saving...";

        try {
            const response = await fetch("/rayko_settings_manager/save", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ backup_name: backupName }),
            });
            const data = await response.json();

            if (data.success) {
                showStatus(`✅ Saved as: ${data.folder}`, "success");
                if (nameInput) nameInput.value = "";
                if (backupListDiv && !backupListDiv.classList.contains("sm-hidden")) {
                    const newItem = createBackupItem(data.folder, backupListDiv);
                    backupListDiv.insertBefore(newItem, backupListDiv.firstChild);
                }
            } else {
                showStatus(`❌ Error: ${data.error}`, "error");
            }
        } catch (e) {
            showStatus(`❌ Error: ${e.message}`, "error");
        }
        saveBtn.disabled = false;
        saveBtn.textContent = "💾 Save Settings";
    };

    saveSection.appendChild(saveBtn);
    mainDiv.appendChild(saveSection);

    const restoreSection = document.createElement("div");
    restoreSection.className = "sm-section";
    restoreSection.innerHTML = `
        <div class="sm-title">Restore Interface Settings</div>
        <div class="sm-description">Load previously saved configuration and restart server</div>
    `;

    const loadBtn = document.createElement("button");
    loadBtn.className = "sm-btn";
    loadBtn.textContent = "📂 Load Backups";
    loadBtn.onclick = async function () {
        await loadBackups(backupListDiv, loadBtn);
    };

    restoreSection.appendChild(loadBtn);

    const backupListDiv = document.createElement("div");
    backupListDiv.id = "sm-backup-list";
    backupListDiv.className = "sm-hidden";
    backupListDiv.style.marginTop = "10px";

    restoreSection.appendChild(backupListDiv);
    mainDiv.appendChild(restoreSection);

    const statusContainer = document.createElement("div");
    statusContainer.className = "sm-status-container";
    const statusDiv = document.createElement("div");
    statusDiv.id = "sm-status";
    statusDiv.className = "sm-status";
    statusContainer.appendChild(statusDiv);

    mainDiv.appendChild(statusContainer);
    container.appendChild(mainDiv);
}

function showStatus(message, type) {
    const statusDiv = document.getElementById("sm-status");
    if (statusDiv) {
        statusDiv.textContent = message;
        statusDiv.className = "sm-status";
        if (type === "success") statusDiv.classList.add("sm-success");
        else if (type === "error") statusDiv.classList.add("sm-error");
        else if (type === "info") statusDiv.classList.add("sm-info");

        if (type !== "info") {
            setTimeout(() => {
                statusDiv.className = "sm-status";
                statusDiv.textContent = "";
            }, 5000);
        }
    }
}

// ============================================================
//                    BACKUPS LOGIC
// ============================================================

async function loadBackups(backupListDiv, loadBtn) {
    showStatus("Loading backups...", "info");
    loadBtn.disabled = true;
    loadBtn.textContent = "⏳ Loading...";
    backupListDiv.classList.remove("sm-hidden");
    backupListDiv.innerHTML = '<div style="text-align:center;padding:20px;color:var(--descrip-text)">Loading...</div>';

    try {
        const response = await fetch("/rayko_settings_manager/list");
        const data = await response.json();
        backupListDiv.innerHTML = "";

        if (data.success && data.backups && data.backups.length > 0) {
            data.backups.forEach((backupName) => {
                const item = createBackupItem(backupName, backupListDiv);
                backupListDiv.appendChild(item);
            });
            showStatus(`✅ Found ${data.backups.length} backups`, "success");
        } else {
            backupListDiv.innerHTML = '<div style="text-align:center;padding:20px;color:var(--descrip-text)">No backups found</div>';
            showStatus("ℹ️ No backups found", "info");
        }
    } catch (e) {
        backupListDiv.innerHTML = '<div style="text-align:center;padding:20px;color:var(--descrip-text)">Error loading</div>';
        showStatus(`❌ Error: ${e.message}`, "error");
    }
    loadBtn.disabled = false;
    loadBtn.textContent = "🔄 Refresh Backups";
}

function createBackupItem(backupName, backupListDiv) {
    const item = document.createElement("div");
    item.className = "sm-backup-item";

    const nameSpan = document.createElement("span");
    nameSpan.className = "sm-backup-name";
    nameSpan.textContent = backupName;
    nameSpan.title = backupName;
    item.appendChild(nameSpan);

    const buttonsDiv = document.createElement("div");
    buttonsDiv.className = "sm-restore-container";

    const restoreBtn = document.createElement("button");
    restoreBtn.className = "sm-btn sm-btn-small";
    restoreBtn.textContent = "✓ Restore";
    restoreBtn.onclick = async function () {
        showStatus("Restoring...", "info");
        restoreBtn.disabled = true;
        restoreBtn.textContent = "⏳...";

        try {
            const res = await fetch("/rayko_settings_manager/restore", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ backup_name: backupName }),
            });
            const data = await res.json();

            if (data.success) {
                showStatus(`✅ Settings restored from ${backupName}`, "success");
                restoreBtn.textContent = "✓ Restored";
                restoreBtn.disabled = true;

                const restartBtn = document.createElement("button");
                restartBtn.className = "sm-btn sm-btn-small sm-btn-warning";
                restartBtn.textContent = "🔄 RESTART SERVER";
                restartBtn.onclick = async function () {
                    restartBtn.disabled = true;
                    restartBtn.textContent = "⏳ Restarting...";
                    showStatus("Server restarting...", "info");
                    try { await fetch("/rayko_settings_manager/restart", { method: "POST" }); } catch (e) { }
                    startPolling(restartBtn);
                };
                buttonsDiv.appendChild(restartBtn);
            } else {
                showStatus(`❌ Error: ${data.error}`, "error");
                restoreBtn.disabled = false;
                restoreBtn.textContent = "✓ Restore";
            }
        } catch (e) {
            showStatus(`❌ Error: ${e.message}`, "error");
            restoreBtn.disabled = false;
            restoreBtn.textContent = "✓ Restore";
        }
    };

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "sm-btn sm-btn-small sm-btn-danger";
    deleteBtn.textContent = "✕";
    deleteBtn.title = "Delete backup";
    deleteBtn.onclick = async function () {
        showStatus("Deleting...", "info");
        deleteBtn.disabled = true;
        deleteBtn.textContent = "⏳";

        try {
            const res = await fetch(`/rayko_settings_manager/delete/${encodeURIComponent(backupName)}`, { method: "DELETE" });
            const data = await res.json();

            if (data.success) {
                item.remove();
                showStatus(`✅ Deleted: ${backupName}`, "success");
                if (backupListDiv.children.length === 0) {
                    backupListDiv.innerHTML = '<div style="text-align:center;padding:20px;color:var(--descrip-text)">No backups found</div>';
                }
            } else {
                showStatus(`❌ Error: ${data.error}`, "error");
                deleteBtn.disabled = false;
                deleteBtn.textContent = "✕";
            }
        } catch (e) {
            showStatus(`❌ Error: ${e.message}`, "error");
            deleteBtn.disabled = false;
            deleteBtn.textContent = "✕";
        }
    };

    buttonsDiv.appendChild(restoreBtn);
    buttonsDiv.appendChild(deleteBtn);
    item.appendChild(buttonsDiv);
    return item;
}

function startPolling(restartBtn) {
    let attempts = 0;
    const pollInterval = setInterval(async () => {
        attempts++;
        showStatus(`Waiting for server... (${attempts}/10)`, "info");
        try {
            const res = await fetch("/rayko_settings_manager/ping");
            const data = await res.json();
            if (data.status === "ok") {
                clearInterval(pollInterval);
                showStatus("✅ Server is ready! Refreshing page...", "success");
                setTimeout(() => window.location.reload(), 2000);
            }
        } catch (e) {
            if (attempts >= 10) {
                clearInterval(pollInterval);
                showStatus("⚠️ Server may not have restarted. Please refresh manually.", "error");
                restartBtn.disabled = false;
                restartBtn.textContent = "🔄 RESTART SERVER";
            }
        }
    }, 5000);
}

// ============================================================
//                    WORKFLOW PRESETS
// ============================================================

function renderPresetsSection(mainDiv) {
    const section = document.createElement("div");
    section.className = "sm-section";

    const banner = document.createElement("div");
    banner.id = "sm-active-preset-banner";
    banner.className = "sm-active-banner sm-hidden";
    banner.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
            <span>Active Preset: <strong id="sm-active-preset-name"></strong></span>
            <button id="sm-detach-preset" style="background:transparent; border:none; color:var(--descrip-text); cursor:pointer; font-size:16px; padding:0;" title="Detach from this preset (stop tracking)">✕</button>
        </div>
    `;

    const updateBtn = document.createElement("button");
    updateBtn.className = "sm-btn sm-btn-primary sm-btn-small";
    updateBtn.textContent = "💾 Update This Preset";
    
    updateBtn.onclick = async () => {
        if (!_activePresetName) return;
        updateBtn.disabled = true;
        updateBtn.textContent = "⏳ Saving...";
        try {
            await saveCurrentStateToActivePreset();
            updateBtn.textContent = "✅ Updated!";
            updateBtn.style.backgroundColor = "#10b981";
            updateBtn.style.borderColor = "#10b981";
            setTimeout(() => {
                if (updateBtn) {
                    updateBtn.textContent = "💾 Update This Preset";
                    updateBtn.style.backgroundColor = "";
                    updateBtn.style.borderColor = "";
                }
            }, 2000);
        } catch (e) {
            updateBtn.textContent = "❌ Failed";
            updateBtn.style.backgroundColor = "#dc2626";
            setTimeout(() => {
                if (updateBtn) {
                    updateBtn.textContent = "💾 Update This Preset";
                    updateBtn.style.backgroundColor = "";
                }
            }, 2000);
            showStatus(`❌ ${e.message}`, "error");
        }
        updateBtn.disabled = false;
    };
    banner.appendChild(updateBtn);

    banner.querySelector("#sm-detach-preset").onclick = () => {
        setActivePreset(null);
        showStatus("Detached from active preset.", "info");
    };

    section.appendChild(banner);

    const formDiv = document.createElement("div");
    formDiv.innerHTML = `
        <div class="sm-title">Workflow Presets</div>
        <div class="sm-description">Save open workflows (excl. Unsaved) or load a preset. Presets store file paths.</div>
        <input type="text" id="sm-preset-name" class="sm-input" placeholder="preset name">
        <div class="sm-hint">Stored in custom_nodes/ComfyUI_RaykoStudio/presets_workflow</div>
    `;
    section.appendChild(formDiv);

    const saveBtn = document.createElement("button");
    saveBtn.className = "sm-btn sm-btn-success";
    saveBtn.textContent = "💾 Save Open Tabs as New Preset";
    saveBtn.style.marginBottom = "10px";
    saveBtn.onclick = async () => {
        const nameInput = section.querySelector("#sm-preset-name");
        const name = (nameInput?.value || "").trim();
        if (!name) return showStatus("Enter preset name", "error");

        const workflows = getOpenWorkflowPaths();
        if (workflows.length === 0) return showStatus("No valid open workflows to save (Unsaved filtered)", "error");

        saveBtn.disabled = true;
        saveBtn.textContent = "⏳ Saving...";
        try {
            await saveAllModifiedWorkflows();

            const res = await fetch("/rayko_settings_manager/presets/save", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name, workflows }),
            });
            const data = await res.json();
            if (data.success) {
                showStatus(`✅ Preset "${data.name}" saved (${data.count} workflows)`, "success");
                nameInput.value = "";
                setActivePreset(data.name);
                const list = section.querySelector("#sm-preset-list");
                if (list && !list.classList.contains("sm-hidden")) await refreshPresetList(list);
            } else {
                showStatus(`❌ ${data.error || "Save failed"}`, "error");
            }
        } catch (e) {
            showStatus(`❌ ${e.message}`, "error");
        }
        saveBtn.disabled = false;
        saveBtn.textContent = "💾 Save Open Tabs as New Preset";
    };
    section.appendChild(saveBtn);

    const toggleBtn = document.createElement("button");
    toggleBtn.className = "sm-btn";
    toggleBtn.textContent = "📂 Show Presets";
    toggleBtn.onclick = async () => {
        const list = section.querySelector("#sm-preset-list");
        list.classList.toggle("sm-hidden");
        if (!list.classList.contains("sm-hidden")) await refreshPresetList(list);
    };
    section.appendChild(toggleBtn);

    const list = document.createElement("div");
    list.id = "sm-preset-list";
    list.className = "sm-hidden";
    list.style.marginTop = "10px";
    section.appendChild(list);

    mainDiv.appendChild(section);
}

function updatePresetUI() {
    const banner = document.getElementById("sm-active-preset-banner");
    const nameSpan = document.getElementById("sm-active-preset-name");
    if (banner && nameSpan) {
        if (_activePresetName) {
            nameSpan.textContent = `"${_activePresetName}"`;
            banner.classList.remove("sm-hidden");
        } else {
            banner.classList.add("sm-hidden");
        }
    }
}

async function loadPresetAsNewTabs(presetName) {
    const wfStore = app.extensionManager?.workflow;
    if (!wfStore) throw new Error("Workflow store not available");

    if (_activePresetName && _activePresetName !== presetName) {
        const action = await smConfirmSavePreset(_activePresetName);
        if (action === "cancel") return 0;
        if (action === "save") {
            try { await saveCurrentStateToActivePreset(); }
            catch (e) { await smAlert("Save Failed", e.message, true); return 0; }
        }
    } else if (!_activePresetName) {
        const confirmed = await smConfirm({
            title: "Load Preset",
            message: `Loading preset "${presetName}" will close other tabs (Unsaved tabs are kept). Continue?`,
            okText: "Load & Replace",
            danger: true
        });
        if (!confirmed) return 0;
    }

    const res = await fetch(`/rayko_settings_manager/presets/get/${encodeURIComponent(presetName)}`);
    if (!res.ok) throw new Error("Preset not found");
    const data = await res.json();
    if (!data.workflows || data.workflows.length === 0) throw new Error("Preset is empty");

    // --- БЕЗОПАСНОЕ ЗАКРЫТИЕ ВКЛАДОК ---
    let safeWf = null;
    try {
        if (typeof wfStore.createTemporaryWorkflow === "function") {
            safeWf = await wfStore.createTemporaryWorkflow();
        } else if (typeof wfStore.createTemporary === "function") {
            safeWf = await wfStore.createTemporary();
        }
        if (safeWf) {
            const emptyState = { nodes: [], links: [], groups: [], config: {}, extra: {}, version: 0.4 };
            await app.loadGraphData(emptyState, true, true, safeWf);
            if (typeof wfStore.openWorkflow === "function") {
                await wfStore.openWorkflow(safeWf);
            }
        }
    } catch (e) {
        console.warn("[Rayko] Failed to create safe workflow", e);
    }

    const oldWfs = [...(wfStore.openWorkflows || [])];
    for (const wf of oldWfs) {
        if (wf === safeWf) continue;
        if (isUnsavedWorkflow(wf)) continue;
        if (wfStore.openWorkflows.includes(wf)) {
            try {
                await wfStore.closeWorkflow(wf);
            } catch (e) {
                console.warn("[Rayko] Failed to close old tab", e);
            }
        }
    }
    // -----------------------------------

    let loaded = 0;
    let failed = [];
    let firstLoadedWf = null;
    let workflowLookup = null;

    for (const item of data.workflows) {
        try {
            let finalPath = item;

            if (typeof item === "string") {
                if (!item.includes("/") && !item.includes("\\")) {
                    if (!workflowLookup) {
                        workflowLookup = await getWorkflowLookup();
                    }
                    if (workflowLookup[item] && workflowLookup[item].length > 0) {
                        finalPath = workflowLookup[item][0];
                        console.log(`[Rayko] Auto-healed path: ${item} -> ${finalPath}`);
                    }
                }

                let currentWf = null;

                // 1. Пытаемся использовать нативный load, но предварительно чистим кэш
                if (typeof wfStore.load === "function") {
                    try {
                        if (wfStore.workflows) {
                            delete wfStore.workflows[finalPath];
                            delete wfStore.workflows[finalPath.replace(/^workflows\//, '')];
                        }
                        currentWf = await wfStore.load(finalPath);
                        if (currentWf) {
                            await wfStore.openWorkflow(currentWf);
                        }
                    } catch (e) { 
                        console.warn("wfStore.load failed", e); 
                    }
                }

                // 2. Если нативный метод не сработал, используем fetch + loadGraphData
                if (!currentWf) {
                    const safePath = encodeURIComponent(finalPath);
                    const fileRes = await fetch(`/api/userdata/${safePath}?rand=${Date.now()}`);
                    if (!fileRes.ok) throw new Error(`HTTP ${fileRes.status}`);
                    
                    const textData = await fileRes.text();
                    let fileData;
                    try {
                        fileData = JSON.parse(textData);
                    } catch (e) {
                        throw new Error(`Failed to parse workflow JSON: ${e.message}`);
                    }

                    if (!fileData || typeof fileData !== 'object' || !fileData.nodes) {
                        throw new Error("Invalid workflow structure (missing nodes)");
                    }

                    const fileName = finalPath.split(/[/\\]/).pop() || finalPath;
                    
                    if (typeof wfStore.createTemporaryWorkflow === "function") {
                        currentWf = await wfStore.createTemporaryWorkflow(fileName);
                    } else if (typeof wfStore.createTemporary === "function") {
                        currentWf = await wfStore.createTemporary();
                    }

                    if (currentWf) {
                        currentWf.path = finalPath;
                        await app.loadGraphData(fileData, true, true, currentWf);
                        
                        if (currentWf.changeTracker) {
                            try { currentWf.changeTracker.activeState = JSON.parse(JSON.stringify(fileData)); } catch(e) {}
                            currentWf.changeTracker.isDirty = false;
                        }
                        if (wfStore.workflows) wfStore.workflows[finalPath] = currentWf;
                        
                        if (typeof wfStore.openWorkflow === "function") {
                            await wfStore.openWorkflow(currentWf);
                        }
                    }
                }

                if (!firstLoadedWf && currentWf) {
                    firstLoadedWf = currentWf;
                }

                loaded++;
            } else if (item && item.data) {
                let targetWf = null;
                if (typeof wfStore.createTemporaryWorkflow === "function") {
                    targetWf = await wfStore.createTemporaryWorkflow(item.name);
                } else if (typeof wfStore.createTemporary === "function") {
                    targetWf = await wfStore.createTemporary();
                }
                if (targetWf) {
                    targetWf.path = item.name;
                    await app.loadGraphData(item.data, true, true, targetWf);
                    if (targetWf.changeTracker) {
                        try { targetWf.changeTracker.activeState = JSON.parse(JSON.stringify(item.data)); } catch(e) {}
                        targetWf.changeTracker.isDirty = false;
                    }
                    if (typeof wfStore.openWorkflow === "function") {
                        await wfStore.openWorkflow(targetWf);
                    }
                    
                    if (!firstLoadedWf) firstLoadedWf = targetWf;
                }
                loaded++;
            }
        } catch (e) {
            console.error("[Rayko] Failed to load workflow", item, e);
            failed.push(typeof item === "string" ? item : (item.name || "Unknown"));
        }
    }

    if (safeWf && loaded > 0) {
        try {
            await wfStore.closeWorkflow(safeWf);
        } catch (e) {}
    }

    if (failed.length > 0) {
        await smAlert("Some workflows not found", `The following files could not be opened (they may have been moved or deleted):\n\n${failed.join('\n')}`, true);
    }

    if (loaded === 0) throw new Error("Failed to load any workflow");
    
    setActivePreset(presetName);
    return loaded;
}

async function refreshPresetList(listEl) {
    listEl.innerHTML = '<div style="text-align:center;padding:10px;color:var(--descrip-text)">Loading...</div>';
    try {
        const res = await fetch("/rayko_settings_manager/presets/list");
        const data = await res.json();
        listEl.innerHTML = "";

        if (!data.success || !data.presets || data.presets.length === 0) {
            listEl.innerHTML = '<div style="text-align:center;padding:10px;color:var(--descrip-text)">No presets</div>';
            return;
        }

        for (const p of data.presets) {
            const item = document.createElement("div");
            item.className = "sm-backup-item";

            const nameSpan = document.createElement("span");
            nameSpan.className = "sm-backup-name";
            nameSpan.textContent = `${p.name} (${p.count})`;
            nameSpan.title = `${p.count} workflows`;
            item.appendChild(nameSpan);

            const btns = document.createElement("div");
            btns.className = "sm-restore-container";

            const loadBtn = document.createElement("button");
            loadBtn.className = "sm-btn sm-btn-small";
            loadBtn.textContent = "📂 Load";
            loadBtn.onclick = async () => {
                loadBtn.disabled = true;
                loadBtn.textContent = "⏳...";
                try {
                    const count = await loadPresetAsNewTabs(p.name);
                    if (count > 0) {
                        showStatus(`✅ Loaded "${p.name}" (${count} workflows)`, "success");
                        const overlay = document.getElementById("sm-modal-overlay");
                        if (overlay) overlay.remove();
                    } else {
                        loadBtn.disabled = false;
                        loadBtn.textContent = "📂 Load";
                    }
                } catch (e) {
                    showStatus(`❌ ${e.message}`, "error");
                    loadBtn.disabled = false;
                    loadBtn.textContent = "📂 Load";
                }
            };
            btns.appendChild(loadBtn);

            const delBtn = document.createElement("button");
            delBtn.className = "sm-btn sm-btn-small sm-btn-danger";
            delBtn.textContent = "✕";
            delBtn.title = "Delete preset";
            delBtn.onclick = async () => {
                if (!confirm(`Delete preset "${p.name}"?`)) return;
                delBtn.disabled = true;
                try {
                    const r = await fetch(`/rayko_settings_manager/presets/delete/${encodeURIComponent(p.name)}`, { method: "DELETE" });
                    const d = await r.json();
                    if (d.success) {
                        item.remove();
                        showStatus(`✅ Deleted "${p.name}"`, "success");
                        if (_activePresetName === p.name) setActivePreset(null);
                    } else {
                        showStatus(`❌ ${d.error || "Delete failed"}`, "error");
                    }
                } catch (e) {
                    showStatus(`❌ ${e.message}`, "error");
                }
                delBtn.disabled = false;
            };
            btns.appendChild(delBtn);

            item.appendChild(btns);
            listEl.appendChild(item);
        }
    } catch (e) {
        listEl.innerHTML = `<div style="color:#ef4444;padding:10px">Error: ${e.message}</div>`;
    }
}

// ============================================================
//                        DIALOGS
// ============================================================

function smConfirmSavePreset(presetName) {
    return new Promise((resolve) => {
        const overlay = document.createElement("div");
        overlay.className = "sm-modal-overlay";
        overlay.style.zIndex = "1000000";

        const modal = document.createElement("div");
        modal.className = "sm-modal-content";
        modal.style.maxWidth = "400px";

        const title = document.createElement("div");
        title.className = "sm-title";
        title.textContent = "Save Changes?";
        
        const msg = document.createElement("div");
        msg.className = "sm-description";
        msg.style.marginBottom = "20px";
        msg.style.lineHeight = "1.5";
        msg.innerHTML = `You have an active preset: <strong>"${presetName}"</strong>.<br><br>Do you want to save the current workflows to this preset before continuing?`;

        const btnRow = document.createElement("div");
        btnRow.style.display = "flex";
        btnRow.style.flexDirection = "column";
        btnRow.style.gap = "10px";

        const cancelBtn = document.createElement("button");
        cancelBtn.className = "sm-btn";
        cancelBtn.textContent = "Cancel";
        cancelBtn.onclick = () => { overlay.remove(); resolve("cancel"); };

        const saveBtn = document.createElement("button");
        saveBtn.className = "sm-btn sm-btn-success";
        saveBtn.textContent = "💾 Save & Continue";
        saveBtn.onclick = () => { overlay.remove(); resolve("save"); };

        const discardBtn = document.createElement("button");
        discardBtn.className = "sm-btn sm-btn-danger";
        discardBtn.textContent = "Discard Changes & Continue";
        discardBtn.onclick = () => { overlay.remove(); resolve("discard"); };

        btnRow.appendChild(saveBtn);
        btnRow.appendChild(discardBtn);
        btnRow.appendChild(cancelBtn);

        modal.appendChild(title);
        modal.appendChild(msg);
        modal.appendChild(btnRow);
        overlay.appendChild(modal);
        document.body.appendChild(overlay);
    });
}

function smConfirm(opts) {
    return new Promise((resolve) => {
        const overlay = document.createElement("div");
        overlay.className = "sm-modal-overlay";
        overlay.style.zIndex = "1000000";

        const modal = document.createElement("div");
        modal.className = "sm-modal-content";
        modal.style.maxWidth = "350px";

        const title = document.createElement("div");
        title.className = "sm-title";
        title.textContent = opts.title || "Confirm";
        
        const msg = document.createElement("div");
        msg.className = "sm-description";
        msg.style.marginBottom = "20px";
        msg.style.lineHeight = "1.5";
        msg.textContent = opts.message || "Are you sure?";

        const btnRow = document.createElement("div");
        btnRow.style.display = "flex";
        btnRow.style.gap = "10px";

        const cancelBtn = document.createElement("button");
        cancelBtn.className = "sm-btn";
        cancelBtn.textContent = "Cancel";
        cancelBtn.onclick = () => { overlay.remove(); resolve(false); };

        const okBtn = document.createElement("button");
        okBtn.className = opts.danger ? "sm-btn sm-btn-danger" : "sm-btn sm-btn-success";
        okBtn.textContent = opts.okText || "OK";
        okBtn.onclick = () => { overlay.remove(); resolve(true); };

        btnRow.appendChild(cancelBtn);
        btnRow.appendChild(okBtn);

        modal.appendChild(title);
        modal.appendChild(msg);
        modal.appendChild(btnRow);
        overlay.appendChild(modal);
        document.body.appendChild(overlay);
    });
}

function smAlert(titleText, message, danger) {
    return new Promise((resolve) => {
        const overlay = document.createElement("div");
        overlay.className = "sm-modal-overlay";
        overlay.style.zIndex = "1000000";

        const modal = document.createElement("div");
        modal.className = "sm-modal-content";
        modal.style.maxWidth = "350px";

        const title = document.createElement("div");
        title.className = "sm-title";
        title.textContent = titleText || "Alert";
        
        const msg = document.createElement("div");
        msg.className = "sm-description";
        msg.style.marginBottom = "20px";
        msg.style.lineHeight = "1.5";
        msg.textContent = message || "";

        const btnRow = document.createElement("div");
        btnRow.style.display = "flex";
        btnRow.style.gap = "10px";

        const okBtn = document.createElement("button");
        okBtn.className = danger ? "sm-btn sm-btn-danger" : "sm-btn sm-btn-primary";
        okBtn.textContent = "OK";
        okBtn.onclick = () => { overlay.remove(); resolve(); };

        btnRow.appendChild(okBtn);
        modal.appendChild(title);
        modal.appendChild(msg);
        modal.appendChild(btnRow);
        overlay.appendChild(modal);
        document.body.appendChild(overlay);
    });
}

// ============================================================
//                        STYLES
// ============================================================

function injectStyles() {
    if (document.getElementById("sm-styles")) return;
    const style = document.createElement("style");
    style.id = "sm-styles";
    style.textContent = `
        /* ---------- Topbar block ---------- */
        .sm-topbar-block {
            display: inline-flex;
            align-items: stretch;
            align-self: center;
            flex: 0 0 auto;
            height: 32px;
            margin: 0 0 0 5px;
            background: #2b2a32;
            border-radius: 6px;
            overflow: hidden;
            box-sizing: border-box;
        }
        .sm-topbar-btn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 3px;
            padding: 0 10px;
            margin: 0;
            background: transparent;
            border: none;
            color: var(--fg-color);
            cursor: pointer;
            transition: background 0.15s;
            height: 100%;
            font-family: inherit;
            font-size: 13px;
            box-sizing: border-box;
        }
        .sm-topbar-btn:hover:not(:disabled) { background: #52525e; }
        .sm-topbar-btn:active:not(:disabled) { background: #52525e; filter: brightness(0.92); }
        .sm-topbar-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .sm-topbar-icon { font-size: 16px; line-height: 1; }

        /* ---------- Modal ---------- */
        .sm-modal-overlay {
            position: fixed; inset: 0;
            background: rgba(0,0,0,0.6);
            display: flex; justify-content: center; align-items: center;
            z-index: 999999;
        }
        .sm-modal-content {
            background: var(--comfy-menu-bg);
            border: 1px solid var(--border-color);
            border-radius: 10px;
            padding: 20px;
            width: 90%; max-width: 480px;
            max-height: 90vh; overflow-y: auto;
            box-shadow: 0 8px 24px rgba(0,0,0,0.4);
            position: relative;
        }
        .sm-container { display: flex; flex-direction: column; gap: 20px; min-height: 300px; }
        .sm-section {
            background-color: var(--comfy-input-bg);
            border: 1px solid var(--border-color);
            border-radius: 8px;
            padding: 15px;
        }
        .sm-title { font-size: 16px; font-weight: bold; margin-bottom: 10px; color: var(--fg-color); }
        .sm-description { font-size: 12px; color: var(--descrip-text); margin-bottom: 15px; }
        .sm-input {
            width: 100%; padding: 8px 12px; margin-bottom: 5px;
            background-color: var(--bg-color);
            border: 1px solid var(--border-color); border-radius: 4px;
            color: var(--fg-color); font-size: 14px; box-sizing: border-box;
        }
        .sm-input:focus { border-color: var(--primary-color); outline: none; }
        .sm-hint { font-size: 11px; color: var(--descrip-text); margin-bottom: 15px; font-style: italic; }
        .sm-btn {
            padding: 10px 20px;
            background-color: var(--comfy-menu-bg);
            border: 1px solid var(--border-color);
            border-radius: 4px; color: var(--fg-color);
            cursor: pointer; font-size: 14px; width: 100%;
            transition: all 0.3s ease;
        }
        .sm-btn:hover:not(:disabled) { background-color: var(--comfy-menu-secondary-bg); }
        .sm-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .sm-btn-success { background-color: #10b981; color: white; border-color: #10b981; }
        .sm-btn-success:hover:not(:disabled) { background-color: #059669; }
        .sm-btn-primary { background-color: #3b82f6; color: white; border-color: #3b82f6; }
        .sm-btn-primary:hover:not(:disabled) { background-color: #2563eb; }
        .sm-btn-warning { background-color: #f59e0b; color: white; border-color: #f59e0b; animation: smPulse 2s infinite; }
        .sm-btn-warning:hover:not(:disabled) { background-color: #d97706; }
        @keyframes smPulse {
            0%, 100% { box-shadow: 0 0 0 0 rgba(245, 158, 11, 0.7); }
            50% { box-shadow: 0 0 0 10px rgba(245, 158, 11, 0); }
        }
        .sm-btn-danger { background-color: #dc2626; color: white; border-color: #dc2626; }
        .sm-btn-danger:hover:not(:disabled) { background-color: #b91c1c; }
        .sm-backup-item {
            display: flex; justify-content: space-between; align-items: center;
            padding: 10px;
            background-color: var(--bg-color);
            border: 1px solid var(--border-color);
            border-radius: 4px; margin-bottom: 8px;
        }
        .sm-backup-name { flex: 1; color: var(--fg-color); font-size: 13px; word-break: break-all; margin-right: 10px; }
        .sm-btn-small { padding: 5px 10px; font-size: 12px; min-width: 80px; width: auto; }
        .sm-status-container { margin-top: auto; padding-top: 10px; min-height: 40px; display: flex; align-items: center; justify-content: center; }
        .sm-status {
            padding: 10px 20px; border-radius: 6px; font-size: 13px;
            text-align: center; display: none; width: 100%;
            animation: smFadeIn 0.3s ease;
        }
        @keyframes smFadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        .sm-status.sm-success { display: block; background-color: #10b981; color: white; }
        .sm-status.sm-error { display: block; background-color: #ef4444; color: white; }
        .sm-status.sm-info { display: block; background-color: #3b82f6; color: white; }
        .sm-hidden { display: none; }
        .sm-restore-container { display: flex; gap: 10px; margin-top: 10px; }

        /* ---------- Active Preset Banner ---------- */
        .sm-active-banner {
            background: rgba(16, 185, 129, 0.15);
            border: 1px solid #10b981;
            border-radius: 8px;
            padding: 12px;
            margin-bottom: 15px;
            color: var(--fg-color);
            font-size: 13px;
            animation: smFadeIn 0.3s ease;
        }
    `;
    document.head.appendChild(style);
}