document.addEventListener('DOMContentLoaded', () => {
  const twitchStatusText = document.getElementById('twitch-status-text');
  const twitchDot = document.getElementById('twitch-dot');
  const trailblazerStatusText = document.getElementById('trailblazer-status-text');
  const trailblazerDot = document.getElementById('trailblazer-dot');
  const lastSyncText = document.getElementById('last-sync-text');
  const syncBtn = document.getElementById('sync-btn');
  const alert = document.getElementById('alert');
  const alertText = document.getElementById('alert-text');
  const retryTrailblazerBtn = document.getElementById('retry-trailblazer-btn');

  function updateStatus() {
    chrome.runtime.sendMessage({ type: 'GET_STATUS' }, (status) => {
      if (!status) return;

      // Twitch Status
      if (status.twitchConnected) {
        twitchStatusText.textContent = 'Connected';
        twitchDot.className = 'status-dot connected';
      } else {
        twitchStatusText.textContent = 'Not logged in';
        twitchDot.className = 'status-dot error';
      }

      // TRAILBLAZER Status
      if (status.trailblazerConnected) {
        trailblazerStatusText.textContent = 'Connected';
        trailblazerDot.className = 'status-dot connected';
      } else {
        trailblazerStatusText.textContent = 'Not logged in';
        trailblazerDot.className = 'status-dot error';
      }

      // Enable sync button only if both are connected
      syncBtn.disabled = !(status.twitchConnected && status.trailblazerConnected);

      // Last Sync
      if (status.lastSync) {
        const date = new Date(status.lastSync);
        lastSyncText.textContent = `Last synced: ${date.toLocaleString()}`;
      } else {
        lastSyncText.textContent = 'Never synced';
      }
    });
  }

  function showAlert(message, isSuccess = false) {
    alertText.textContent = message;
    alert.className = isSuccess ? 'alert success' : 'alert';
    alert.style.display = 'block';
    setTimeout(() => {
      alert.style.display = 'none';
    }, 5000);
  }

  syncBtn.addEventListener('click', () => {
    const icon = syncBtn.querySelector('svg');
    icon.classList.add('spinning');
    syncBtn.disabled = true;

    chrome.runtime.sendMessage({ type: 'SYNC_NOW' }, (response) => {
      icon.classList.remove('spinning');
      syncBtn.disabled = false;

      if (response && response.success) {
        updateStatus();
        showAlert('Sync successful!', true);
      } else {
        showAlert(`Sync failed: ${response?.reason || 'unknown error'}`);
      }
    });
  });
  
  if (retryTrailblazerBtn) {
    retryTrailblazerBtn.addEventListener('click', () => {
      const icon = retryTrailblazerBtn.querySelector('svg');
      icon.classList.add('spinning');
      retryTrailblazerBtn.disabled = true;
      
      chrome.runtime.sendMessage({ type: 'REFRESH_TRAILBLAZER' }, (response) => {
        icon.classList.remove('spinning');
        if (response && response.success) {
          updateStatus();
          showAlert('Account refreshed via API!', true);
        } else {
          updateStatus();
          showAlert(`Could not refresh: ${response?.reason || 'Please log in again'}`);
        }

        // 5 second cooldown
        setTimeout(() => {
          retryTrailblazerBtn.disabled = false;
        }, 5000);
      });
    });
  }

  // Initial update
  updateStatus();

  // Refresh status when window is focused
  window.addEventListener('focus', updateStatus);
});
