# Tab Heatmap (Firefox)

Firefox extension that colors tabs by time spent. Find your way back with a heat trail.

## What It Does

- **Heat coloring**: Tabs get colored based on how long you've looked at them. Cold (rarely visited) to hot (frequently visited).
- **Back-trail marker**: When you click a new tab, the previous tab gets a distinct color so you can find your way back instantly.
- **Customizable**: Change colors, intensity, and time thresholds to match your workflow.

## Installation

### From Source (Temporary Add-on)

1. Open Firefox and go to `about:debugging#/runtime/this-firefox`
2. Click "Load Temporary Add-on..."
3. Select any file inside the `tab-heatmap-firefox` folder
4. The extension icon appears in your toolbar

### From Mozilla (when published)

1. Go to Firefox Add-ons
2. Search for "Tab Heatmap"
3. Click "Add to Firefox"

## Customization

Click the extension icon to open settings:

- **Heatmap Color**: Choose the base color for the heatmap (default: orange)
- **Back-Trail Color**: Choose the color for the previous-tab marker (default: blue)
- **Heat Thresholds**: Adjust how many seconds trigger each heat level
- **Max Intensity**: Control how opaque the hottest tabs get
- **Show Trail**: Toggle the back-trail marker on/off
- **Enable Coloring**: Turn the entire system on/off

## Heat Levels

| Level | Time | Visual |
|-------|------|--------|
| Cold | 0-10s | Faint dot |
| Warm | 10-30s | Light glow |
| Medium | 30-60s | Moderate glow |
| Hot | 60-180s | Strong glow |
| Inferno | 180s+ | Full intensity |

## Differences from Chrome Version

- Uses Manifest V2 (Firefox's stable format)
- Uses `browser` namespace (WebExtension standard)
- Background script runs as event page (not service worker)
- Favicon injection via content script

## Permissions

- `tabs`: Track tab focus and switch events
- `storage`: Save settings and tab data locally
- `<all_urls>`: Inject favicon overrides on visited pages

All data stays local. No data is sent anywhere.

## File Structure

```
tab-heatmap-firefox/
  manifest.json      # Extension manifest (Manifest V2)
  background.js      # Background script - tracks time, applies colors
  popup.html         # Settings popup UI
  popup.css          # Popup styles
  popup.js           # Popup logic
  icons/             # Extension icons
    icon16.png
    icon48.png
    icon128.png
```
