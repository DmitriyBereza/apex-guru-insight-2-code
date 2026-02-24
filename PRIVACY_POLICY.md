# Privacy Policy for ApexGuru to VS Code

Effective date: February 24, 2026

ApexGuru to VS Code is a browser extension that adds actions to Salesforce ApexGuru Insights pages to help users open related Apex code in Visual Studio Code.

## What the extension does

The extension reads information visible on supported Salesforce ApexGuru pages, including:

- Apex class names
- Apex method names
- Code snippets shown in the ApexGuru recommendation card (`Current Code` and `Recommended Code`)

This information is used only to construct a local `vscode://` link so the companion VS Code extension can open a file or diff on the user's machine.

## Data collection and transmission

- The extension does **not** collect personal data.
- The extension does **not** transmit page content or code snippets to external servers.
- The extension does **not** use analytics, tracking, advertising, or telemetry.

## Local storage

The extension stores a user-provided local configuration value in browser extension storage:

- `classesPath` (optional local path to the Apex classes folder)

This value is stored locally in the user's browser and is used only to build local file paths for VS Code links.

## Remote code

The extension does **not** download or execute remote code. All executable code is packaged within the extension at install time.

## Third-party services

The extension does not send data to third-party services. It operates on supported Salesforce pages in the user's browser and opens a local VS Code URI.

## Changes to this policy

This policy may be updated in future versions of the extension. Material changes will be reflected by updating the effective date above.

## Contact

For questions about this policy, contact:

Dmitriy Bereza  
dmitriy.bereza91@gmail.com
