# VS Code Extension (`vscode-extension`)

URI bridge for the Chrome extension.

Handles:

- `vscode://apexguru.bridge/open-diff?...`
- `vscode://apexguru.bridge/open-file?...`

## Diff Behavior

`open-diff` priority:

1. Local file vs ApexGuru-applied result (line-number based replacement)
2. Fallback: ApexGuru snippet diff (`Current Code` vs `Recommended Code`)
3. Fallback: local file vs recommended snippet

`open-file`:

- Opens local class file and reveals method (if present).

## Path Resolution

1. `filePath` from payload
2. `<classesPath>/<ClassName>.cls` (if provided)
3. workspace search `**/<ClassName>.cls`

## Package

```bash
cd vscode-extension
npx @vscode/vsce package
```

## Install

In VS Code:

1. `Extensions: Install from VSIX...`
2. Select generated `bridge-0.1.0.vsix`
3. Reload VS Code
