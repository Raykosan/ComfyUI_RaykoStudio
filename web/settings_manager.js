import { app } from "../../../scripts/app.js";

app.registerExtension({
    name: "RaykoStudio.SettingsManager",
    
    async setup() {
        if (app.extensionManager && app.extensionManager.registerSidebarTab) {
            app.extensionManager.registerSidebarTab({
                id: "RaykoStudio.SettingsManager",
                icon: "pi pi-desktop",
                title: "🦊 Settings Manager",
                tooltip: "Interface Settings Manager",
                type: "custom",
                render: (el) => {
                    renderSettingsPanel(el);
                },
            });
        }
    },
});

function renderSettingsPanel(container) {
    container.innerHTML = '';
    
    const style = document.createElement('style');
    style.textContent = `
        .sm-container { padding: 15px; display: flex; flex-direction: column; gap: 20px; min-height: 300px; }
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