document.addEventListener('DOMContentLoaded', () => {
  const twitchStatusText = document.getElementById('twitch-status-text');
  const twitchDot = document.getElementById('twitch-dot');
  const blazeStatusText = document.getElementById('blaze-status-text');
  const blazeDot = document.getElementById('blaze-dot');
  const lastSyncText = document.getElementById('last-sync-text');
  const syncBtn = document.getElementById('sync-btn');
  const alert = document.getElementById('alert');
  const alertText = document.getElementById('alert-text');

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

      // Blaze Status
      if (status.blazeConnected) {
        blazeStatusText.textContent = 'Connected';
        blazeDot.className = 'status-dot connected';
      } else {
        blazeStatusText.textContent = 'Not logged in';
        blazeDot.className = 'status-dot error';
      }

      // Enable sync button only if both are connected
      syncBtn.disabled = !(status.twitchConnected && status.blazeConnected);

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

  // Initial update
  updateStatus();

  // Refresh status when window is focused
  window.addEventListener('focus', updateStatus);
});
