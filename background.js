// Tab Heatmap - Background Script (Firefox v6)
// Shows heat level and trail on tab titles + top bar (no favicon changes)

const api = typeof browser !== 'undefined' ? browser : chrome;

const DEFAULT_SETTINGS = {
  baseHue: 30,
  previousHue: 210,
  thresholds: [10, 30, 60, 180, 600],
  maxOpacity: 0.9,
  showTrail: true,
  enabled: true,
};

const RESTRICTED = /^(about:|moz-extension:\/\/|file:\/\/|data:)/;

const HEAT_MARKERS = ['', '\u{1F7E1}', '\u{1F7E0}', '\u{1F534}', '\u{1F525}'];
const TRAIL_MARKER = '\u{1F535}';

let activeTabId = null;
let activeWindowId = null;
let lastActivated = Date.now();
let tabData = {};
let previousTabId = null;
let originalTitles = {};

async function init() {
  try {
    const stored = await api.storage.local.get(['tabData']);
    tabData = stored.tabData || {};

    const tabs = await api.tabs.query({});
    const activeIds = new Set(tabs.map(function(t) { return t.id; }));
    Object.keys(tabData).forEach(function(id) {
      if (!activeIds.has(parseInt(id))) delete tabData[id];
    });

    const activeTabs = await api.tabs.query({ active: true, lastFocusedWindow: true });
    if (activeTabs.length > 0) {
      const active = activeTabs[0];
      activeTabId = active.id;
      activeWindowId = active.windowId;
      lastActivated = Date.now();
      ensureTabData(active);
      originalTitles[active.id] = active.title || '';
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
  if (tab.title) {
    tabData[tab.id].title = tab.title;
    if (!originalTitles[tab.id]) {
      originalTitles[tab.id] = tab.title;
    }
  }
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

async function getSettings() {
  const stored = await api.storage.local.get('settings');
  return stored.settings || DEFAULT_SETTINGS;
}

async function saveTabData() {
  try {
    await api.storage.local.set({ tabData: tabData });
  } catch (e) {}
}

// Strip emoji markers from title
function stripMarkers(title) {
  return title.replace(/^[\u{1F7E1}\u{1F7E0}\u{1F534}\u{1F525}\u{1F535} ]+/u, '').trim();
}

// Update tab title with heat marker
async function updateTabTitle(tabId, heatLevel, isTrail) {
  try {
    const tab = await api.tabs.get(tabId);
    const originalTitle = originalTitles[tabId] || tab.title || '';
    const baseTitle = stripMarkers(originalTitle);

    let marker = '';
    if (isTrail) {
      marker = TRAIL_MARKER + ' ';
    } else if (heatLevel > 0) {
      marker = HEAT_MARKERS[heatLevel] + ' ';
    }

    const newTitle = marker + baseTitle;

    if (tab.title !== newTitle) {
      await api.tabs.executeScript(tabId, {
        code: 'document.title = ' + JSON.stringify(newTitle) + ';'
      }).catch(function() {});
    }
  } catch (e) {}
}

// Clear trail from a specific tab
async function clearTrail(tabId) {
  try {
    var settings = await getSettings();
    var data = tabData[tabId];
    if (!data) return;

    var tab = await api.tabs.get(tabId);
    if (!canInject(tab)) return;

    var heatLevel = getHeatLevel(data.totalTime, settings.thresholds);

    // Remove bar
    await api.tabs.executeScript(tabId, {
      code: '(function() { var el = document.getElementById("tab-heatmap-bar"); if (el) el.remove(); })();'
    }).catch(function() {});

    // Reapply heat bar without trail
    await injectHeatBar(tabId, heatLevel, false, settings.baseHue, settings.maxOpacity);

    // Update title without trail
    await updateTabTitle(tabId, heatLevel, false);
  } catch (e) {}
}

// Apply trail to a specific tab
async function applyTrail(tabId) {
  try {
    var settings = await getSettings();
    var data = tabData[tabId];
    if (!data) return;

    var tab = await api.tabs.get(tabId);
    if (!canInject(tab)) return;

    var heatLevel = getHeatLevel(data.totalTime, settings.thresholds);

    // Apply heat bar with trail
    await injectHeatBar(tabId, heatLevel, true, settings.baseHue, settings.previousHue, settings.maxOpacity);

    // Update title with trail marker
    await updateTabTitle(tabId, heatLevel, true);
  } catch (e) {}
}

async function injectHeatBar(tabId, heatLevel, isPrevious, baseHue, maxOpacity) {
  var heatHeight;

  if (heatLevel === 0) {
    heatHeight = 4;
  } else if (heatLevel === 1) {
    heatHeight = 6;
  } else if (heatLevel === 2) {
    heatHeight = 8;
  } else if (heatLevel === 3) {
    heatHeight = 10;
  } else {
    heatHeight = 12;
  }

  var barColor = isPrevious ? 'hsl(210, 95%, 55%)' : 'hsl(' + baseHue + ', 80%, 55%)';
  var barHeight = isPrevious ? 10 : heatHeight;
  var fillPercent = Math.min(100, (heatLevel / 4) * 100);
  var fillWidth = isPrevious ? '100%' : fillPercent + '%';
  var shadowSize = isPrevious ? '10px' : '6px';
  var glowColor = isPrevious ? 'hsl(210, 100%, 70%)' : 'hsl(' + baseHue + ', 90%, 65%)';

  var code = '(function() {'
    + 'var existing = document.getElementById("tab-heatmap-bar");'
    + 'if (existing) existing.remove();'
    + 'var bar = document.createElement("div");'
    + 'bar.id = "tab-heatmap-bar";'
    + 'bar.setAttribute("style", "position:fixed !important;top:0 !important;left:0 !important;width:100% !important;height:' + barHeight + 'px !important;z-index:2147483647 !important;pointer-events:none !important;background:transparent !important;border:none !important;margin:0 !important;padding:0 !important;");'
    + 'var fill = document.createElement("div");'
    + 'fill.setAttribute("style", "position:absolute !important;top:0 !important;left:0 !important;height:100% !important;width:' + fillWidth + ' !important;background:' + barColor + ' !important;opacity:1 !important;box-shadow:0 0 ' + shadowSize + ' ' + glowColor + ', 0 0 ' + (parseInt(shadowSize) + 4) + 'px ' + barColor + ' !important;border:none !important;margin:0 !important;padding:0 !important;");'
    + 'bar.appendChild(fill);'
    + 'if (document.body) {'
    + '  document.body.appendChild(bar);'
    + '} else {'
    + '  document.addEventListener("DOMContentLoaded", function() { document.body.appendChild(bar); });'
    + '}'
    + '})();';

  try {
    await api.tabs.executeScript(tabId, { code: code });
  } catch (e) {}
}

async function refreshAllVisuals() {
  try {
    var tabs = await api.tabs.query({});
    for (var i = 0; i < tabs.length; i++) {
      if (canInject(tabs[i])) {
        await refreshTabVisuals(tabs[i].id);
      }
    }
  } catch (e) {}
}

async function refreshTabVisuals(tabId) {
  try {
    var settings = await getSettings();
    if (!settings.enabled) return;

    var data = tabData[tabId];
    if (!data) return;

    var tab = await api.tabs.get(tabId);
    if (!canInject(tab)) return;

    var heatLevel = getHeatLevel(data.totalTime, settings.thresholds);
    var isTrailTab = settings.showTrail && tabId === previousTabId;

    await injectHeatBar(tabId, heatLevel, isTrailTab, settings.baseHue, settings.maxOpacity);
    await updateTabTitle(tabId, heatLevel, isTrailTab);
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

      if (previousTabId && previousTabId !== activeTabId) {
        await clearTrail(previousTabId);
      }

      if (oldTabId && oldTabId !== activeTabId) {
        previousTabId = oldTabId;
        await applyTrail(oldTabId);
      }

      var tab = await api.tabs.get(activeInfo.tabId);
      ensureTabData(tab);
      await refreshTabVisuals(activeInfo.tabId);
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

        if (previousTabId && previousTabId !== activeTabId) {
          await clearTrail(previousTabId);
        }

        if (oldTabId && oldTabId !== activeTabId) {
          previousTabId = oldTabId;
          await applyTrail(oldTabId);
        }

        ensureTabData(activeTabs[0]);
        await refreshTabVisuals(activeTabs[0].id);
      }

      await saveTabData();
    } catch (e) {}
  })();
});

// Tab updated
api.tabs.onUpdated.addListener(function(tabId, changeInfo, tab) {
  (async function() {
    try {
      if (changeInfo.url) {
        ensureTabData(tab);
        originalTitles[tabId] = tab.title || '';
        await saveTabData();
      }
      if (changeInfo.title) {
        var currentTitle = tab.title || '';
        if (!currentTitle.match(/^[\u{1F7E1}\u{1F7E0}\u{1F534}\u{1F525}\u{1F535} ]+/u)) {
          originalTitles[tabId] = currentTitle;
        }
      }
      if (changeInfo.status === 'complete') {
        await refreshTabVisuals(tabId);
      }
    } catch (e) {}
  })();
});

// Tab removed
api.tabs.onRemoved.addListener(function(tabId) {
  (async function() {
    try {
      delete tabData[tabId];
      delete originalTitles[tabId];
      if (tabId === activeTabId) activeTabId = null;
      if (tabId === previousTabId) previousTabId = null;
      await saveTabData();
    } catch (e) {}
  })();
});

// Periodic refresh every 3 seconds
setInterval(function() {
  (async function() {
    await trackTime();
    await saveTabData();
    if (activeTabId) {
      await refreshTabVisuals(activeTabId);
    }
  })();
}, 3000);

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
        originalTitles = {};
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
