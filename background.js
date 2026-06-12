// Tab Heatmap - Background Script (Firefox v2)
// Adds a visible heat bar at the top of each tab

const api = typeof browser !== 'undefined' ? browser : chrome;

const DEFAULT_SETTINGS = {
  baseHue: 30,
  previousHue: 210,
  thresholds: [10, 30, 60, 180, 600],
  maxOpacity: 0.85,
  showTrail: true,
  enabled: true,
};

const RESTRICTED = /^(about:|moz-extension:\/\/|file:\/\/|data:)/;

let activeTabId = null;
let activeWindowId = null;
let lastActivated = Date.now();
let tabData = {};
let previousTabId = null;

async function init() {
  try {
    const stored = await api.storage.local.get(['tabData']);
    tabData = stored.tabData || {};

    const tabs = await api.tabs.query({});
    const activeIds = new Set(tabs.map(t => t.id));
    for (const id of Object.keys(tabData)) {
      if (!activeIds.has(parseInt(id))) delete tabData[id];
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
  } catch (e) {}
}

function ensureTabData(tab) {
  if (!tab || !tab.id) return;
  if (!tabData[tab.id]) {
    tabData[tab.id] = { totalTime: 0, lastFocused: Date.now(), url: '', title: '' };
  }
  if (tab.url) tabData[tab.id].url = tab.url;
  if (tab.title) tabData[tab.id].title = tab.title;
}

async function trackTime() {
  if (activeTabId !== null && tabData[activeTabId]) {
    const elapsed = (Date.now() - lastActivated) / 1000;
    tabData[activeTabId].totalTime += elapsed;
    tabData[activeTabId].lastFocused = Date.now();
  }
  lastActivated = Date.now();
}

function getHeatLevel(totalTime, thresholds) {
  let level = 0;
  for (let i = 0; i < thresholds.length; i++) {
    if (totalTime >= thresholds[i]) level = i + 1;
  }
  return Math.min(level, 4);
}

function canInject(tab) {
  if (!tab || !tab.url) return false;
  return !RESTRICTED.test(tab.url);
}

function buildInjectionScript(heatLevel, isPrevious, baseHue, previousHue, maxOpacity) {
  let heatOpacity, heatHeight, heatColor;
  if (heatLevel === 0) {
    heatOpacity = 0.2;
    heatHeight = 3;
    heatColor = 'hsl(' + baseHue + ', 60%, 50%)';
  } else {
    heatOpacity = 0.4 + (heatLevel / 4) * (maxOpacity - 0.4);
    heatHeight = 3 + (heatLevel / 4) * 5;
    heatColor = 'hsl(' + baseHue + ', 80%, 55%)';
  }

  var barColor = isPrevious ? 'hsl(' + previousHue + ', 90%, 60%)' : heatColor;
  var barHeight = isPrevious ? 8 : heatHeight;
  var barOpacity = isPrevious ? 1.0 : heatOpacity;
  var fillPercent = Math.min(100, (heatLevel / 4) * 100);

  return '(function() {' +
    'var existing = document.getElementById("tab-heatmap-bar");' +
    'if (existing) existing.remove();' +
    'var bar = document.createElement("div");' +
    'bar.id = "tab-heatmap-bar";' +
    'bar.style.cssText = "position:fixed;top:0;left:0;width:100%;height:' + barHeight + 'px;z-index:2147483647;pointer-events:none;background:transparent;";' +
    'var fill = document.createElement("div");' +
    'fill.style.cssText = "position:absolute;top:0;left:0;height:100%;width:' + (isPrevious ? '100' : fillPercent) + '%;background:' + barColor + ';opacity:' + barOpacity + ';transition:width 0.5s ease,background 0.3s ease;box-shadow:0 0 ' + (isPrevious ? '8' : '4') + 'px ' + barColor + '";' +
    'bar.appendChild(fill);' +
    'document.body.appendChild(bar);' +
  '})();';
}

function buildFaviconScript(hue, heatLevel, maxOpacity, isPrevious) {
  var size = 32, r = 12, cx = 16, cy = 16;
  var opacity;
  if (heatLevel === 0) { opacity = 0.3; }
  else { opacity = 0.4 + (heatLevel / 4) * (maxOpacity - 0.4); }

  var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '">' +
    '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="hsl(' + hue + ', 80%, 55%)" opacity="' + opacity + '"/>' +
    (isPrevious ? '<circle cx="' + cx + '" cy="' + cy + '" r="' + (r - 2) + '" fill="none" stroke="hsl(' + hue + ', 90%, 70%)" stroke-width="2" opacity="1"/>' : '') +
    '</svg>';

  var faviconUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);

  return '(function() {' +
    'var existing = document.getElementById("tab-heatmap-favicon");' +
    'if (existing) existing.remove();' +
    'var link = document.createElement("link");' +
    'link.id = "tab-heatmap-favicon";' +
    'link.rel = "icon";' +
    'link.type = "image/svg+xml";' +
    'link.href = "' + faviconUrl + '";' +
    'document.head.appendChild(link);' +
  '})();';
}

async function applyTabVisuals(tabId) {
  try {
    var stored = await api.storage.local.get('settings');
    var settings = stored.settings || DEFAULT_SETTINGS;
    if (!settings.enabled) return;

    var data = tabData[tabId];
    if (!data) return;

    var tab = await api.tabs.get(tabId);
    if (!canInject(tab)) return;

    var heatLevel = getHeatLevel(data.totalTime, settings.thresholds);
    var isPrevious = settings.showTrail && tabId === previousTabId;

    // Inject top bar
    var barScript = buildInjectionScript(
      heatLevel, isPrevious,
      settings.baseHue, settings.previousHue, settings.maxOpacity
    );

    try {
      await api.tabs.executeScript(tabId, { code: barScript });
    } catch (e) {}

    // Inject favicon
    var favHue = isPrevious ? settings.previousHue : settings.baseHue;
    var favScript = buildFaviconScript(favHue, heatLevel, settings.maxOpacity, isPrevious);

    try {
      await api.tabs.executeScript(tabId, { code: favScript });
    } catch (e) {}
  } catch (e) {}
}

async function refreshAllVisuals() {
  try {
    var tabs = await api.tabs.query({});
    for (var i = 0; i < tabs.length; i++) {
      if (canInject(tabs[i])) {
        await applyTabVisuals(tabs[i].id);
      }
    }
  } catch (e) {}
}

async function getSettings() {
  var stored = await api.storage.local.get('settings');
  return stored.settings || DEFAULT_SETTINGS;
}

async function saveTabData() {
  try {
    await api.storage.local.set({ tabData: tabData });
  } catch (e) {}
}

// Tab activated
api.tabs.onActivated.addListener(function(activeInfo) {
  (async function() {
    try {
      await trackTime();

      var oldTabId = activeTabId;
      activeTabId = activeInfo.tabId;
      activeWindowId = activeInfo.windowId;

      // Clear trail from old previous tab
      if (previousTabId && previousTabId !== activeTabId && previousTabId !== oldTabId) {
        await applyTabVisuals(previousTabId);
      }

      // Set new previous tab
      if (oldTabId && oldTabId !== activeTabId) {
        previousTabId = oldTabId;
        await applyTabVisuals(oldTabId);
      }

      // Update new active tab
      var tab = await api.tabs.get(activeInfo.tabId);
      ensureTabData(tab);
      await applyTabVisuals(activeInfo.tabId);
      await saveTabData();
    } catch (e) {}
  })();
});

// Window focus changed
api.windows.onFocusChanged.addListener(function(windowId) {
  (async function() {
    try {
      await trackTime();

      if (windowId === api.windows.WINDOW_ID_NONE) {
        activeTabId = null;
        activeWindowId = null;
        return;
      }

      activeWindowId = windowId;

      var activeTabs = await api.tabs.query({ active: true, windowId: windowId });
      if (activeTabs.length > 0) {
        var oldTabId = activeTabId;
        activeTabId = activeTabs[0].id;

        if (oldTabId && oldTabId !== activeTabId) {
          previousTabId = oldTabId;
          await applyTabVisuals(oldTabId);
        }

        ensureTabData(activeTabs[0]);
        await applyTabVisuals(activeTabs[0].id);
      }

      await saveTabData();
    } catch (e) {}
  })();
});

// Tab updated
api.tabs.onUpdated.addListener(function(tabId, changeInfo, tab) {
  (async function() {
    try {
      if (changeInfo.url || changeInfo.title) {
        ensureTabData(tab);
        await saveTabData();
      }
      if (changeInfo.status === 'complete') {
        await applyTabVisuals(tabId);
      }
    } catch (e) {}
  })();
});

// Tab removed
api.tabs.onRemoved.addListener(function(tabId) {
  (async function() {
    try {
      delete tabData[tabId];
      if (tabId === activeTabId) activeTabId = null;
      if (tabId === previousTabId) previousTabId = null;
      await saveTabData();
    } catch (e) {}
  })();
});

// Periodic refresh (every 5 seconds)
setInterval(function() {
  (async function() {
    await trackTime();
    await saveTabData();
    if (activeTabId) {
      await applyTabVisuals(activeTabId);
    }
  })();
}, 5000);

// Message handler
api.runtime.onMessage.addListener(function(message, sender) {
  return (async function() {
    try {
      if (message.type === 'GET_STATS') {
        var tabs = await api.tabs.query({});
        var totalTime = 0;
        var hotTabs = 0;
        var settings = await getSettings();

        for (var i = 0; i < tabs.length; i++) {
          var data = tabData[tabs[i].id];
          if (data) {
            totalTime += data.totalTime;
            var level = getHeatLevel(data.totalTime, settings.thresholds);
            if (level >= 3) hotTabs++;
          }
        }

        return {
          totalTabs: tabs.length,
          totalTime: Math.round(totalTime),
          hotTabs: hotTabs,
          activeTabId: activeTabId,
          previousTabId: previousTabId,
        };
      } else if (message.type === 'UPDATE_SETTINGS') {
        await api.storage.local.set({ settings: message.settings });
        await refreshAllVisuals();
        return { ok: true };
      } else if (message.type === 'GET_SETTINGS') {
        var stored = await api.storage.local.get('settings');
        return { settings: stored.settings || DEFAULT_SETTINGS };
      } else if (message.type === 'RESET_DATA') {
        tabData = {};
        previousTabId = null;
        await saveTabData();
        await refreshAllVisuals();
        return { ok: true };
      }
    } catch (e) {
      return { error: e.message };
    }
  })();
});

api.runtime.onInstalled.addListener(function() { init(); });
api.runtime.onStartup.addListener(function() { init(); });

init();
