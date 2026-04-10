# ClipChat Chrome Extension

ClipChat is a Chrome extension that lets you ask questions about the current YouTube video.

## Prerequisites

- Node.js 20
- npm
- Google Chrome

## Setup

1. Install and use Node 20:
   ```bash
   nvm install 20
   nvm use 20
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Build the extension:
   ```bash
   npm run build
   ```

## Load in Chrome (Developer Mode)

1. Open Chrome and go to `chrome://extensions`.
2. Turn on `Developer mode` (top-right).
3. Click `Load unpacked`.
4. Select the project's `dist/` folder.
5. Restart Chrome once after loading/updating the extension.

## Update flow after code changes

1. Run:
   ```bash
   npm run build
   ```
2. Go to `chrome://extensions`.
3. Click the refresh icon on ClipChat.
4. Restart Chrome
