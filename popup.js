// Tab Heatmap - Popup Script (Firefox)
// Handles settings UI and stats display

const api = typeof browser !== 'undefined' ? browser : chrome;

document.addEventListener('DOMContentLoaded', async () => {
  // Load current settings
  const response = await api.runtime.sendMessage({ type: 'GET_SETTINGS' });
  const settings = response.settings;

  // Load stats
  const stats = await api.runtime.sendMessage({ type: 'GET_STATS' });
  document.getElementById('totalTabs').textContent = stats.totalTabs;
  document.getElementById('totalTime').textContent = formatTime(stats.totalTime);
  document.getElementById('hotTabs').textContent = stats.hotTabs;

  // Apply settings to UI
  document.getElementById('enabled').checked = settings.enabled;
  document.getElementById('showTrail').checked = settings.showTrail;
  document.getElementById('baseHue').value = settings.baseHue;
  document.getElementById('previousHue').value = settings.previousHue;
  document.getElementById('maxOpacity').value = settings.maxOpacity;

  // Thresholds
  for (let i = 0; i < 5; i++) {
    document.getElementById(`t${i}`).value = settings.thresholds[i] || 0;
  }

  // Update color previews
  updateColorPreview('basePreview', settings.baseHue);
  updateColorPreview('previousPreview', settings.previousHue);

  // Slider listeners
  document.getElementById('baseHue').addEventListener('input', (e) => {
    updateColorPreview('basePreview', e.target.value);
  });

  document.getElementById('previousHue').addEventListener('input', (e) => {
    updateColorPreview('previousPreview', e.target.value);
  });

  // Save button
  document.getElementById('saveBtn').addEventListener('click', async () => {
    const newSettings = {
      enabled: document.getElementById('enabled').checked,
      showTrail: document.getElementById('showTrail').checked,
      baseHue: parseInt(document.getElementById('baseHue').value),
      previousHue: parseInt(document.getElementById('previousHue').value),
      maxOpacity: parseFloat(document.getElementById('maxOpacity').value),
      thresholds: [],
    };

    for (let i = 0; i < 5; i++) {
      newSettings.thresholds.push(parseInt(document.getElementById(`t${i}`).value) || 10);
    }

    await api.runtime.sendMessage({ type: 'UPDATE_SETTINGS', settings: newSettings });

    // Visual feedback
    const btn = document.getElementById('saveBtn');
    btn.textContent = 'Saved!';
    btn.style.background = '#2ecc71';
    setTimeout(() => {
      btn.textContent = 'Save Settings';
      btn.style.background = '';
    }, 1500);
  });

  // Reset button
  document.getElementById('resetBtn').addEventListener('click', async () => {
    if (confirm('Reset all tab tracking data?')) {
      await api.runtime.sendMessage({ type: 'RESET_DATA' });
      document.getElementById('totalTabs').textContent = '0';
      document.getElementById('totalTime').textContent = '0s';
      document.getElementById('hotTabs').textContent = '0';
    }
  });
});

function updateColorPreview(elementId, hue) {
  const el = document.getElementById(elementId);
  el.style.background = `hsl(${hue}, 80%, 55%)`;
}

function formatTime(seconds) {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  return `${(seconds / 3600).toFixed(1)}h`;
}
