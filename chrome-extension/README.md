# Chrome Extension

Adds buttons on Salesforce ApexGuru Insights cards:

- `Show Diff in VS Code` (primary)
- `Open in VS Code` (secondary)

## Install

1. Open `chrome://extensions`
2. Enable `Developer mode`
3. Click `Load unpacked`
4. Select this folder: `chrome-extension`

## Options

- `Apex classes path (optional)`
  - If set, bridge resolves `<classesPath>/<ClassName>.cls` first.
  - If empty, VS Code extension searches current workspace.
