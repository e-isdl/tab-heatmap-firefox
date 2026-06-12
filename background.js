// Tab Heatmap - Background Script (Firefox)
// Tracks tab focus time and applies heat-based coloring

const api = typeof browser !== 'undefined' ? browser : chrome;

const DEFAULT_SETTINGS = {
  baseHue: 30,
  previousHue: 200,
  thresholds: [10, 30, 60, 180, 600],
  maxOpacity: 0.85,
  showTrail: true,
  enabled: true,
};

let activeTabId = null;
let activeWindowId = null;
let lastActivated = Date.now();
let tabData = {};
let previousTabId = null;

async function init() {
  const stored = await api.storage.local.get(['tabData', 'settings']);
  tabData = stored.tabData || {};

  const tabs = await api.tabs.query({});
  const activeIds = new Set(tabs.map(t => t.id));
  for (const id of Object.keys(tabData)) {
    if (!activeIds.has(parseInt(id))) {
      delete tabData[id];
    }
  }

  const activeTabs = await api.tabs.query({ active: true, lastFocusedWindow: true });
  if (activeTabs.length > 0) {
    const active = activeTabs[0];
    activeTabId = active.id;
    activeWindowId = active.windowId;
    lastActivated = Date.now();
    ensureTabData(active);
  }

  await saveTabData();
  await refreshAllTabColors();
}

function ensureTabData(tab) {
  if (!tabData[tab.id]) {
    tabData[tab.id] = {
      totalTime: 0,
      lastFocused: Date.now(),
      url: tab.url || '',
      title: tab.title || '',
    };
  }
  tabData[tab.id].url = tab.url || tabData[tab.id].url;
  tabData[tab.id].title = tab.title || tabData[tab.id].title;
}

async function trackTime() {
  if (activeTabId !== null) {
    const elapsed = (Date.now() - lastActivated) / 1000;
    if (tabData[activeTabId]) {
      tabData[activeTabId].totalTime += elapsed;
      tabData[activeTabId].lastFocused = Date.now();
    }
  }
  lastActivated = Date.now();
}

function getHeatLevel(totalTime, thresholds) {
  let level = 0;
  for (let i = 0; i < thresholds.length; i++) {
    if (totalTime >= thresholds[i]) {
      level = i + 1;
    }
  }
  return Math.min(level, 4);
}

function generateHeatSvg(baseHue, heatLevel, maxOpacity, isPrevious) {
  let opacity;
  if (heatLevel === 0) {
    opacity = 0.15;
  } else {
    opacity = 0.2 + (heatLevel / 4) * (maxOpacity - 0.2);
  }

  const hue = isPrevious ? DEFAULT_SETTINGS.previousHue : baseHue;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
    <circle cx="16" cy="16" r="12" fill="hsl(${hue}, 80%, 55%)" opacity="${opacity}"/>
    ${isPrevious ? `<circle cx="16" cy="16" r="9" fill="none" stroke="hsl(${hue}, 90%, 70%)" stroke-width="1.5" opacity="0.9"/>` : ''}
  </svg>`;

  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

async function applyTabColor(tabId) {
  const stored = await api.storage.local.get('settings');
  const settings = stored.settings || DEFAULT_SETTINGS;
  if (!settings.enabled) return;

  const data = tabData[tabId];
  if (!data) return;

  const heatLevel = getHeatLevel(data.totalTime, settings.thresholds);
  const isPrevious = settings.showTrail && tabId === previousTabId;
  const faviconUrl = generateHeatSvg(
    settings.baseHue,
    heatLevel,
    settings.maxOpacity,
    isPrevious
  );

  // Inject a link element to override the favicon
  const css = `
    #tab-heatmap-favicon { display: none !important; }
    link[rel="icon"] { display: none !important; }
    link[rel="shortcut icon"] { display: none !important; }
  `;

  try {
    // Remove existing heatmap favicon
    await api.tabs.executeScript(tabId, {
      code: `
        (function() {
          var existing = document.getElementById('tab-heatmap-favicon');
          if (existing) existing.remove();
          var links = document.querySelectorAll('link[rel="icon"], link[rel="shortcut icon"]');
          links.forEach(function(l) { l.remove(); });
          var link = document.createElement('link');
          link.id = 'tab-heatmap-favicon';
          link.rel = 'icon';
          link.type = 'image/svg+xml';
          link.href = '${faviconUrl}';
          document.head.appendChild(link);
        })();
      `,
    });
  } catch (e) {
    // Script injection can fail on protected pages
  }
}

async function refreshAllTabColors() {
  const stored = await api.storage.local.get('settings');
  const settings = stored.settings || DEFAULT_SETTINGS;
  if (!settings.enabled) return;

  const tabs = await api.tabs.query({});
  for (const tab of tabs) {
    if (tab.url && !tab.url.startsWith('about:') && !tab.url.startsWith('moz-extension://')) {
      await applyTabColor(tab.id);
    }
  }
}

async function saveTabData() {
  await api.storage.local.set({ tabData });
}

// Event Listeners

api.tabs.onActivated.addListener(async (activeInfo) => {
  await trackTime();

  const previousTabIdOld = activeTabId;
  activeTabId = activeInfo.tabId;
  activeWindowId = activeInfo.windowId;

  if (previousTabIdOld && previousTabIdOld !== activeTabId) {
    previousTabId = previousTabIdOld;
    await applyTabColor(previousTabId);
  }

  try {
    const tab = await api.tabs.get(activeInfo.tabId);
    ensureTabData(tab);
    await applyTabColor(activeInfo.tabId);
  } catch (e) {}

  await saveTabData();
});

api.windows.onFocusChanged.addListener(async (windowId) => {
  await trackTime();

  if (windowId === api.windows.WINDOW_ID_NONE) {
    activeTabId = null;
    activeWindowId = null;
    return;
  }

  activeWindowId = windowId;

  const activeTabs = await api.tabs.query({ active: true, windowId });
  if (activeTabs.length > 0) {
    activeTabId = activeTabs[0].id;
    ensureTabData(activeTabs[0]);
    await applyTabColor(activeTabs[0].id);
  }

  await saveTabData();
});

api.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.url || changeInfo.favIconUrl) {
    ensureTabData(tab);
    await saveTabData();
  }

  if (changeInfo.status === 'complete') {
    await applyTabColor(tabId);
  }
});

api.tabs.onRemoved.addListener(async (tabId) => {
  delete tabData[tabId];
  if (tabId === activeTabId) {
    activeTabId = null;
  }
  if (tabId === previousTabId) {
    previousTabId = null;
  }
  await saveTabData();
});

// Periodic save and refresh
setInterval(async () => {
  await trackTime();
  await saveTabData();
  await refreshAllTabColors();
}, 5000);

// Message handler
api.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  if (message.type === 'GET_STATS') {
    const tabs = await api.tabs.query({});
    let totalTime = 0;
    let hotTabs = 0;
    const stored = await api.storage.local.get('settings');
    const settings = stored.settings || DEFAULT_SETTINGS;

    for (const tab of tabs) {
      const data = tabData[tab.id];
      if (data) {
        totalTime += data.totalTime;
        const level = getHeatLevel(data.totalTime, settings.thresholds);
        if (level >= 3) hotTabs++;
      }
    }

    return {
      totalTabs: tabs.length,
      totalTime: Math.round(totalTime),
      hotTabs,
      activeTabId,
      previousTabId,
    };
  }

  if (message.type === 'UPDATE_SETTINGS') {
    await api.storage.local.set({ settings: message.settings });
    await refreshAllTabColors();
    return { ok: true };
  }

  if (message.type === 'GET_SETTINGS') {
    const stored = await api.storage.local.get('settings');
    return { settings: stored.settings || DEFAULT_SETTINGS };
  }

  if (message.type === 'RESET_DATA') {
    tabData = {};
    previousTabId = null;
    await saveTabData();
    await refreshAllTabColors();
    return { ok: true };
  }
});

api.runtime.onInstalled.addListener(() => {
  init();
});

api.runtime.onStartup.addListener(() => {
  init();
});

init();
