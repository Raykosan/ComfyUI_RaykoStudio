import { app } from "../../../scripts/app.js";

let topbarInterval = null;
const STORAGE_KEY = "RaykoStudio.ShowIcon";

app.registerExtension({
    name: "RaykoStudio.SettingsManager",
    
    async setup() {
        // Одна настройка без явной category — ComfyUI возьмет раздел из id (часть до точки)
        app.ui.settings.addSetting({
            id: "RaykoStudio.SettingsManager",
            name: "Settings Manager",
            type: () => {
                const container = document.createElement("div");
                container.id = "sm-settings-container";
                container.style.display = "flex";
                container.style.flexDirection = "column";
                container.style.gap = "4px";
                container.style.margin = "0";
                container.style.padding = "0";

                // --- Строка с тогглом ---
                const toggleRow = document.createElement("label");
                toggleRow.style.display = "flex";
                toggleRow.style.alignItems = "center";
                toggleRow.style.gap = "10px";
                toggleRow.style.cursor = "pointer";
                toggleRow.style.fontSize = "14px";
                toggleRow.style.lineHeight = "1.2";

                const toggleInput = document.createElement("input");
                toggleInput.type = "checkbox";
                toggleInput.style.cursor = "pointer";
                toggleInput.style.width = "16px";
                toggleInput.style.height = "16px";
                toggleInput.style.margin = "0";
                
                const isEnabled = localStorage.getItem(STORAGE_KEY) === "true";
                toggleInput.checked = isEnabled;

                toggleInput.onchange = (e) => {
                    localStorage.setItem(STORAGE_KEY, e.target.checked ? "true" : "false");
                    updateTopbarIcon(e.target.checked);
                };

                const toggleText = document.createElement("span");
                toggleText.textContent = "Show Icon On Menu";
                toggleText.style.color = "var(--fg-color)";

                toggleRow.appendChild(toggleInput);
                toggleRow.appendChild(toggleText);

                // --- Кнопка открытия менеджера ---
                const btn = document.createElement("button");
                btn.className = "sm-btn sm-btn-success";
                btn.textContent = "Open Settings Manager";
                btn.style.width = "auto";
                btn.style.alignSelf = "flex-start";
                btn.style.padding = "6px 12px";
                btn.style.fontSize = "13px";
                btn.style.marginTop = "4px";
                btn.onclick = () => openSettingsManagerModal();

                container.appendChild(toggleRow);
                container.appendChild(btn);

                return container;
            }
        });

        // Инициализация при загрузке
        setTimeout(() => {
            const initialVal = localStorage.getItem(STORAGE_KEY) === "true";
            updateTopbarIcon(initialVal);
        }, 1000);
    },
});

// --- Управление иконкой в верхнем меню ---

function updateTopbarIcon(show) {
    if (show) {
        startTopbarInjection();
    } else {
        stopTopbarInjection();
        const existingBtn = document.getElementById("sm-topbar-btn");
        if (existingBtn) {
            existingBtn.remove();
            console.log("🦊 Settings Manager: Иконка скрыта.");
        }
    }
}

function startTopbarInjection() {
    if (topbarInterval) return;
    
    console.log("🦊 Settings Manager: Начинаем поиск верхнего меню...");
    let attempts = 0;
    const maxAttempts = 20;

    topbarInterval = setInterval(() => {
        attempts++;
        const actionBar = document.querySelector('.actionbar-container');
        
        if (actionBar) {
            if (document.getElementById("sm-topbar-btn")) {
                clearInterval(topbarInterval);
                topbarInterval = null;
                return;
            }

            const topBtn = document.createElement("button");
            topBtn.id = "sm-topbar-btn";
            topBtn.className = "comfyui-button";
            topBtn.title = "Settings Manager";
            topBtn.innerHTML = `<span style="font-size: 18px; line-height: 1;">🖥️</span>`; 
            topBtn.onclick = () => openSettingsManagerModal();

            topBtn.style.width = "38px";
            topBtn.style.height = "100%";
            topBtn.style.minHeight = "32px";
            topBtn.style.maxHeight = "40px";
            topBtn.style.padding = "0";
            topBtn.style.margin = "0 5px";
            topBtn.style.display = "inline-flex";
            topBtn.style.alignItems = "center";
            topBtn.style.justifyContent = "center";
            topBtn.style.cursor = "pointer";
            topBtn.style.background = "var(--comfy-input-bg)";
            topBtn.style.color = "var(--fg-color)";
            topBtn.style.border = "1px solid var(--border-color)";
            topBtn.style.borderRadius = "8px";
            topBtn.style.transition = "background 0.2s";
            topBtn.style.boxSizing = "border-box";

            topBtn.onmouseenter = () => { topBtn.style.background = "var(--comfy-menu-secondary-bg)"; };
            topBtn.onmouseleave = () => { topBtn.style.background = "var(--comfy-input-bg)"; };

            const runContainer = actionBar.querySelector('.flex.h-full.items-center');
            if (runContainer) {
                actionBar.insertBefore(topBtn, runContainer);
            } else {
                actionBar.appendChild(topBtn);
            }
            
            console.log("🦊 Settings Manager: Иконка добавлена в верхнее меню.");
            clearInterval(topbarInterval);
            topbarInterval = null;
        } else {
            if (attempts >= maxAttempts) {
                console.error("🦊 Settings Manager: Не удалось найти .actionbar-container.");
                clearInterval(topbarInterval);
                topbarInterval = null;
            }
        }
    }, 500);
}

function stopTopbarInjection() {
    if (topbarInterval) {
        clearInterval(topbarInterval);
        topbarInterval = null;
    }
}

// --- Модальное окно и интерфейс менеджера ---

function openSettingsManagerModal() {
    const overlay = document.createElement("div");
    overlay.className = "sm-modal-overlay";
    
    const modal = document.createElement("div");
    modal.className = "sm-modal-content";
    
    const closeBtn = document.createElement("button");
    closeBtn.className = "sm-btn sm-btn-danger sm-btn-small";
    closeBtn.textContent = "✕ Close";
    closeBtn.style.width = "100%";
    closeBtn.style.marginTop = "10px";
    closeBtn.onclick = () => document.body.removeChild(overlay);
    
    renderSettingsPanel(modal);
    modal.appendChild(closeBtn);
    overlay.appendChild(modal);
    
    overlay.onclick = (e) => {
        if (e.target === overlay) document.body.removeChild(overlay);
    };
    
    document.body.appendChild(overlay);
}

function renderSettingsPanel(container) {
    container.innerHTML = '';
    
    const style = document.createElement('style');
    style.textContent = `
        .sm-modal-overlay {
            position: fixed; top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0,0,0,0.6);
            display: flex; justify-content: center; align-items: center;
            z-index: 10000;
        }
        .sm-modal-content {
            background: var(--comfy-menu-bg);
            border: 1px solid var(--border-color);
            border-radius: 8px;
            padding: 20px;
            width: 90%; max-width: 450px;
            max-height: 90vh; overflow-y: auto;
            box-shadow: 0 4px 6px rgba(0,0,0,0.3);
            position: relative;
        }
        .sm-container { display: flex; flex-direction: column; gap: 20px; min-height: 300px; }
        .sm-section { background-color: var(--comfy-input-bg); border: 1px solid var(--border-color); border-radius: 8px; padding: 15px; }
        .sm-title { font-size: 16px; font-weight: bold; margin-bottom: 10px; color: var(--fg-color); }
        .sm-description { font-size: 12px; color: var(--descrip-text); margin-bottom: 15px; }
        .sm-input { width: 100%; padding: 8px 12px; margin-bottom: 5px; background-color: var(--bg-color); border: 1px solid var(--border-color); border-radius: 4px; color: var(--fg-color); font-size: 14px; box-sizing: border-box; }
        .sm-input:focus { border-color: var(--primary-color); outline: none; }
        .sm-hint { font-size: 11px; color: var(--descrip-text); margin-bottom: 15px; font-style: italic; }
        .sm-btn { padding: 10px 20px; background-color: var(--comfy-menu-bg); border: 1px solid var(--border-color); border-radius: 4px; color: var(--fg-color); cursor: pointer; font-size: 14px; width: 100%; transition: all 0.3s ease; }
        .sm-btn:hover:not(:disabled) { background-color: var(--comfy-menu-secondary-bg); }
        .sm-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .sm-btn-success { background-color: #10b981; color: white; border-color: #10b981; }
        .sm-btn-success:hover:not(:disabled) { background-color: #059669; }
        .sm-btn-warning { background-color: #f59e0b; color: white; border-color: #f59e0b; animation: smPulse 2s infinite; }
        .sm-btn-warning:hover:not(:disabled) { background-color: #d97706; }
        @keyframes smPulse { 0%, 100% { box-shadow: 0 0 0 0 rgba(245, 158, 11, 0.7); } 50% { box-shadow: 0 0 0 10px rgba(245, 158, 11, 0); } }
        .sm-btn-danger { background-color: #dc2626; color: white; border-color: #dc2626; }
        .sm-btn-danger:hover:not(:disabled) { background-color: #b91c1c; }
        .sm-backup-item { display: flex; justify-content: space-between; align-items: center; padding: 10px; background-color: var(--bg-color); border: 1px solid var(--border-color); border-radius: 4px; margin-bottom: 8px; }
        .sm-backup-name { flex: 1; color: var(--fg-color); font-size: 13px; word-break: break-all; margin-right: 10px; }
        .sm-btn-small { padding: 5px 10px; font-size: 12px; min-width: 80px; width: auto; }
        .sm-status-container { margin-top: auto; padding-top: 10px; min-height: 40px; display: flex; align-items: center; justify-content: center; }
        .sm-status { padding: 10px 20px; border-radius: 6px; font-size: 13px; text-align: center; display: none; width: 100%; animation: smFadeIn 0.3s ease; }
        @keyframes smFadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        .sm-status.sm-success { display: block; background-color: #10b981; color: white; }
        .sm-status.sm-error { display: block; background-color: #ef4444; color: white; }
        .sm-status.sm-info { display: block; background-color: #3b82f6; color: white; }
        .sm-hidden { display: none; }
        .sm-restore-container { display: flex; gap: 10px; margin-top: 10px; }
    `;
    container.appendChild(style);
    
    const mainDiv = document.createElement('div');
    mainDiv.className = 'sm-container';
    
    const saveSection = document.createElement('div');
    saveSection.className = 'sm-section';
    saveSection.innerHTML = `
        <div class="sm-title">Save Interface Settings</div>
        <div class="sm-description">Backup current interface configuration to Documents folder</div>
        <input type="text" id="sm-backup-name" class="sm-input" placeholder="name backup">
        <div class="sm-hint">If no name is entered, the creation date will be used.</div>
    `;
    
    const saveBtn = document.createElement('button');
    saveBtn.className = 'sm-btn sm-btn-success';
    saveBtn.textContent = '💾 Save Settings';
    saveBtn.onclick = async function() {
        const nameInput = document.getElementById('sm-backup-name');
        const backupName = nameInput ? nameInput.value.trim() : '';
        
        showStatus('Saving...', 'info');
        saveBtn.disabled = true;
        saveBtn.textContent = '⏳ Saving...';
        
        try {
            const response = await fetch('/rayko_settings_manager/save', { 
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ backup_name: backupName })
            });
            const data = await response.json();
            
            if (data.success) {
                showStatus(`✅ Saved as: ${data.folder}`, 'success');
                if (nameInput) nameInput.value = '';
                
                if (backupListDiv && !backupListDiv.classList.contains('sm-hidden')) {
                    const newItem = createBackupItem(data.folder, backupListDiv);
                    backupListDiv.insertBefore(newItem, backupListDiv.firstChild);
                }
            } else {
                showStatus(`❌ Error: ${data.error}`, 'error');
            }
        } catch (e) {
            showStatus(`❌ Error: ${e.message}`, 'error');
        }
        
        saveBtn.disabled = false;
        saveBtn.textContent = '💾 Save Settings';
    };
    
    saveSection.appendChild(saveBtn);
    mainDiv.appendChild(saveSection);
    
    const restoreSection = document.createElement('div');
    restoreSection.className = 'sm-section';
    restoreSection.innerHTML = `
        <div class="sm-title">Restore Interface Settings</div>
        <div class="sm-description">Load previously saved configuration and restart server</div>
    `;
    
    const loadBtn = document.createElement('button');
    loadBtn.className = 'sm-btn';
    loadBtn.textContent = ' Load Backups';
    loadBtn.onclick = async function() {
        await loadBackups(backupListDiv, loadBtn);
    };
    
    restoreSection.appendChild(loadBtn);
    
    const backupListDiv = document.createElement('div');
    backupListDiv.id = 'sm-backup-list';
    backupListDiv.className = 'sm-hidden';
    backupListDiv.style.marginTop = '10px';
    
    restoreSection.appendChild(backupListDiv);
    mainDiv.appendChild(restoreSection);
    
    const statusContainer = document.createElement('div');
    statusContainer.className = 'sm-status-container';
    
    const statusDiv = document.createElement('div');
    statusDiv.id = 'sm-status';
    statusDiv.className = 'sm-status';
    statusContainer.appendChild(statusDiv);
    
    mainDiv.appendChild(statusContainer);
    container.appendChild(mainDiv);
}

function showStatus(message, type) {
    const statusDiv = document.getElementById('sm-status');
    if (statusDiv) {
        statusDiv.textContent = message;
        statusDiv.className = 'sm-status';
        
        if (type === 'success') statusDiv.classList.add('sm-success');
        else if (type === 'error') statusDiv.classList.add('sm-error');
        else if (type === 'info') statusDiv.classList.add('sm-info');
        
        if (type !== 'info') {
            setTimeout(() => {
                statusDiv.className = 'sm-status';
                statusDiv.textContent = '';
            }, 5000);
        }
    }
}

async function loadBackups(backupListDiv, loadBtn) {
    showStatus('Loading backups...', 'info');
    
    loadBtn.disabled = true;
    loadBtn.textContent = '⏳ Loading...';
    backupListDiv.classList.remove('sm-hidden');
    backupListDiv.innerHTML = '<div style="text-align:center;padding:20px;color:var(--descrip-text)">Loading...</div>';
    
    try {
        const response = await fetch('/rayko_settings_manager/list');
        const data = await response.json();
        
        backupListDiv.innerHTML = '';
        
        if (data.success && data.backups && data.backups.length > 0) {
            data.backups.forEach((backupName) => {
                const item = createBackupItem(backupName, backupListDiv);
                backupListDiv.appendChild(item);
            });
            showStatus(`✅ Found ${data.backups.length} backups`, 'success');
        } else {
            backupListDiv.innerHTML = '<div style="text-align:center;padding:20px;color:var(--descrip-text)">No backups found</div>';
            showStatus('ℹ️ No backups found', 'info');
        }
    } catch (e) {
        backupListDiv.innerHTML = '<div style="text-align:center;padding:20px;color:var(--descrip-text)">Error loading</div>';
        showStatus(`❌ Error: ${e.message}`, 'error');
    }
    
    loadBtn.disabled = false;
    loadBtn.textContent = '🔄 Refresh Backups';
}

function createBackupItem(backupName, backupListDiv) {
    const item = document.createElement('div');
    item.className = 'sm-backup-item';
    
    const nameSpan = document.createElement('span');
    nameSpan.className = 'sm-backup-name';
    nameSpan.textContent = backupName;
    nameSpan.title = backupName;
    item.appendChild(nameSpan);
    
    const buttonsDiv = document.createElement('div');
    buttonsDiv.className = 'sm-restore-container';
    
    const restoreBtn = document.createElement('button');
    restoreBtn.className = 'sm-btn sm-btn-small';
    restoreBtn.textContent = '✓ Restore';
    restoreBtn.onclick = async function() {
        showStatus('Restoring...', 'info');
        restoreBtn.disabled = true;
        restoreBtn.textContent = '⏳...';
        
        try {
            const res = await fetch('/rayko_settings_manager/restore', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ backup_name: backupName })
            });
            const data = await res.json();
            
            if (data.success) {
                showStatus(`✅ Settings restored from ${backupName}`, 'success');
                restoreBtn.textContent = '✓ Restored';
                restoreBtn.disabled = true;
                
                const restartBtn = document.createElement('button');
                restartBtn.className = 'sm-btn sm-btn-small sm-btn-warning';
                restartBtn.textContent = '🔄 RESTART SERVER';
                restartBtn.onclick = async function() {
                    restartBtn.disabled = true;
                    restartBtn.textContent = ' Restarting...';
                    showStatus('Server restarting...', 'info');
                    
                    try {
                        await fetch('/rayko_settings_manager/restart', { method: 'POST' });
                    } catch (e) {}
                    
                    startPolling(restartBtn);
                };
                
                buttonsDiv.appendChild(restartBtn);
            } else {
                showStatus(`❌ Error: ${data.error}`, 'error');
                restoreBtn.disabled = false;
                restoreBtn.textContent = '✓ Restore';
            }
        } catch (e) {
            showStatus(`❌ Error: ${e.message}`, 'error');
            restoreBtn.disabled = false;
            restoreBtn.textContent = '✓ Restore';
        }
    };
    
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'sm-btn sm-btn-small sm-btn-danger';
    deleteBtn.textContent = '✕';
    deleteBtn.title = 'Delete backup';
    deleteBtn.onclick = async function() {
        showStatus('Deleting...', 'info');
        deleteBtn.disabled = true;
        deleteBtn.textContent = '⏳';
        
        try {
            const res = await fetch(`/rayko_settings_manager/delete/${encodeURIComponent(backupName)}`, {
                method: 'DELETE'
            });
            const data = await res.json();
            
            if (data.success) {
                item.remove();
                showStatus(`✅ Deleted: ${backupName}`, 'success');
                
                if (backupListDiv.children.length === 0) {
                    backupListDiv.innerHTML = '<div style="text-align:center;padding:20px;color:var(--descrip-text)">No backups found</div>';
                }
            } else {
                showStatus(`❌ Error: ${data.error}`, 'error');
                deleteBtn.disabled = false;
                deleteBtn.textContent = '✕';
            }
        } catch (e) {
            showStatus(`❌ Error: ${e.message}`, 'error');
            deleteBtn.disabled = false;
            deleteBtn.textContent = '✕';
        }
    };
    
    buttonsDiv.appendChild(restoreBtn);
    buttonsDiv.appendChild(deleteBtn);
    item.appendChild(buttonsDiv);
    
    return item;
}

function startPolling(restartBtn) {
    let attempts = 0;
    const maxAttempts = 10;
    const interval = 5000;
    
    const pollInterval = setInterval(async () => {
        attempts++;
        showStatus(`Waiting for server... (${attempts}/${maxAttempts})`, 'info');
        
        try {
            const res = await fetch('/rayko_settings_manager/ping');
            const data = await res.json();
            
            if (data.status === 'ok') {
                clearInterval(pollInterval);
                showStatus('✅ Server is ready! Refreshing page...', 'success');
                setTimeout(() => {
                    window.location.reload();
                }, 2000);
            }
        } catch (e) {
            if (attempts >= maxAttempts) {
                clearInterval(pollInterval);
                showStatus('️ Server may not have restarted. Please refresh manually.', 'error');
                restartBtn.disabled = false;
                restartBtn.textContent = '🔄 RESTART SERVER';
            }
        }
    }, interval);
}