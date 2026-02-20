const vscode = require("vscode");
const fs = require("fs");
const os = require("os");
const path = require("path");

let lastPayload = null;

function parsePayload(uri) {
  const params = new URLSearchParams(uri.query || "");
  return {
    className: params.get("className") || "",
    methodName: params.get("methodName") || "",
    filePath: params.get("filePath") || "",
    classesPath: params.get("classesPath") || "",
    sourceDir: params.get("sourceDir") || "force-app/main/default/classes",
    currentCode: params.get("currentCode") || "",
    recommendedCode: params.get("recommendedCode") || "",
    rawCurrentCode: params.get("rawCurrentCode") || "",
    rawRecommendedCode: params.get("rawRecommendedCode") || "",
    pageUrl: params.get("pageUrl") || ""
  };
}

function workspaceFileForClass(className, sourceDir) {
  if (!className || !vscode.workspace.workspaceFolders?.length) return null;
  const root = vscode.workspace.workspaceFolders[0].uri.fsPath;
  const rel = sourceDir.replace(/^[/\\]+|[/\\]+$/g, "");
  return path.join(root, rel, `${className}.cls`);
}

function classesPathFileForClass(className, classesPath) {
  if (!className || !classesPath) return null;
  return path.join(classesPath.replace(/[\\/]+$/, ""), `${className}.cls`);
}

async function findClassInWorkspace(className) {
  if (!className) return null;
  const includes = `**/${className}.cls`;
  const excludes = "**/{.git,node_modules,.sfdx,.sf,coverage,dist,build}/**";
  const matches = await vscode.workspace.findFiles(includes, excludes, 30);
  if (!matches.length) return null;

  const sorted = matches
    .map((uri) => uri.fsPath)
    .sort((a, b) => {
      const aPref = a.includes(`${path.sep}classes${path.sep}`) ? 0 : 1;
      const bPref = b.includes(`${path.sep}classes${path.sep}`) ? 0 : 1;
      if (aPref !== bPref) return aPref - bPref;
      return a.length - b.length;
    });

  return sorted[0] || null;
}

function writeTmpFile(prefix, className, content) {
  const safeClass = (className || "ApexGuru").replace(/[^a-zA-Z0-9._-]/g, "_");
  const tmpFile = path.join(os.tmpdir(), `${prefix}-${safeClass}-${Date.now()}.cls`);
  fs.writeFileSync(tmpFile, content || "", "utf8");
  return tmpFile;
}

function parseSnippetLineRange(rawText) {
  if (!rawText) return null;
  const numbers = [];
  for (const line of rawText.split(/\r?\n/)) {
    const m = line.match(/^\s*(\d+)\.\s?/);
    if (m) numbers.push(Number(m[1]));
  }
  if (!numbers.length) return null;

  const uniqueSorted = Array.from(new Set(numbers)).sort((a, b) => a - b);
  let bestStart = uniqueSorted[0];
  let bestEnd = uniqueSorted[0];
  let runStart = uniqueSorted[0];
  let runEnd = uniqueSorted[0];

  for (let i = 1; i < uniqueSorted.length; i += 1) {
    const n = uniqueSorted[i];
    if (n === runEnd + 1) {
      runEnd = n;
    } else {
      if (runEnd - runStart > bestEnd - bestStart) {
        bestStart = runStart;
        bestEnd = runEnd;
      }
      runStart = n;
      runEnd = n;
    }
  }

  if (runEnd - runStart > bestEnd - bestStart) {
    bestStart = runStart;
    bestEnd = runEnd;
  }

  return { start: bestStart, end: bestEnd };
}

function stripSnippetNumbers(rawText) {
  if (!rawText) return [];
  const out = [];
  for (const line of rawText.split(/\r?\n/)) {
    if (/^\s*\.\.\.\s*$/.test(line)) continue;
    out.push(line.replace(/^\s*\d+\.\s?/, ""));
  }
  return out;
}

function applyApexGuruDeltaToLocal(localText, rawCurrentCode, rawRecommendedCode) {
  const range = parseSnippetLineRange(rawCurrentCode);
  if (!range) return null;

  const localLines = localText.split(/\r?\n/);
  const startIndex = range.start - 1;
  const endIndex = range.end - 1;
  if (startIndex < 0 || endIndex < startIndex || endIndex >= localLines.length) return null;

  const replacementLines = stripSnippetNumbers(rawRecommendedCode);
  if (!replacementLines.length) return null;

  const updated = [
    ...localLines.slice(0, startIndex),
    ...replacementLines,
    ...localLines.slice(endIndex + 1)
  ];

  const hadTrailingNewline = /\r?\n$/.test(localText);
  return updated.join("\n") + (hadTrailingNewline ? "\n" : "");
}

function tryRevealMethod(editor, methodName) {
  if (!editor || !methodName) return;
  const text = editor.document.getText();
  const regex = new RegExp(`\\b${methodName.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}\\s*\\(`);
  const match = regex.exec(text);
  if (!match) return;
  const pos = editor.document.positionAt(match.index);
  const range = new vscode.Range(pos, pos);
  editor.selection = new vscode.Selection(pos, pos);
  editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
}

async function openDiff(payload) {
  const titleBase = payload.className
    ? `ApexGuru: ${payload.className}${payload.methodName ? `.${payload.methodName}` : ""}`
    : "ApexGuru";

  let localPath = payload.filePath;
  if (!(localPath && fs.existsSync(localPath)) && payload.className) {
    const directClassesPath = classesPathFileForClass(payload.className, payload.classesPath);
    if (directClassesPath && fs.existsSync(directClassesPath)) {
      localPath = directClassesPath;
    } else {
      const configuredPath = workspaceFileForClass(payload.className, payload.sourceDir);
      if (configuredPath && fs.existsSync(configuredPath)) {
        localPath = configuredPath;
      } else {
        localPath = await findClassInWorkspace(payload.className);
      }
    }
  }

  const hasLocalFile = Boolean(localPath && fs.existsSync(localPath));
  const hasRecommended = Boolean(payload.recommendedCode);
  const hasCurrent = Boolean(payload.currentCode);
  const hasRawCurrent = Boolean(payload.rawCurrentCode);
  const hasRawRecommended = Boolean(payload.rawRecommendedCode);

  if (hasLocalFile && hasRawCurrent && hasRawRecommended) {
    const localContent = fs.readFileSync(localPath, "utf8");
    const mergedContent = applyApexGuruDeltaToLocal(localContent, payload.rawCurrentCode, payload.rawRecommendedCode);
    if (mergedContent) {
      const mergedPath = writeTmpFile("apexguru-merged", payload.className, mergedContent);
      await vscode.commands.executeCommand(
        "vscode.diff",
        vscode.Uri.file(mergedPath),
        vscode.Uri.file(localPath),
        `${titleBase} (ApexGuru Applied -> Local)`
      );
      return;
    }
  }

  if (hasCurrent && hasRecommended) {
    const currentPath = writeTmpFile("apexguru-current", payload.className, payload.currentCode);
    const recommendedPath = writeTmpFile("apexguru-recommended", payload.className, payload.recommendedCode);
    await vscode.commands.executeCommand(
      "vscode.diff",
      vscode.Uri.file(currentPath),
      vscode.Uri.file(recommendedPath),
      `${titleBase} (ApexGuru Delta)`
    );
    return;
  }

  if (hasLocalFile && hasRecommended) {
    const recommendedPath = writeTmpFile("apexguru-recommended", payload.className, payload.recommendedCode);
    await vscode.commands.executeCommand(
      "vscode.diff",
      vscode.Uri.file(recommendedPath),
      vscode.Uri.file(localPath),
      `${titleBase} (Recommended -> Local)`
    );

    const editor = vscode.window.activeTextEditor;
    tryRevealMethod(editor, payload.methodName);
    return;
  }

  if (hasLocalFile) {
    const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(localPath));
    const editor = await vscode.window.showTextDocument(doc, { preview: false });
    tryRevealMethod(editor, payload.methodName);
    vscode.window.showWarningMessage("ApexGuru bridge: no recommendation snippet found, opened class file only.");
    return;
  }

  if (hasRecommended) {
    const recommendedPath = writeTmpFile("apexguru-recommended", payload.className, payload.recommendedCode);
    const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(recommendedPath));
    await vscode.window.showTextDocument(doc, { preview: false });
    vscode.window.showWarningMessage("ApexGuru bridge: local class file not found, opened recommendation only.");
    return;
  }

  vscode.window.showErrorMessage("ApexGuru bridge: payload did not include usable code or file path.");
}

async function openFile(payload) {
  let localPath = payload.filePath;
  if (!(localPath && fs.existsSync(localPath)) && payload.className) {
    const directClassesPath = classesPathFileForClass(payload.className, payload.classesPath);
    if (directClassesPath && fs.existsSync(directClassesPath)) {
      localPath = directClassesPath;
    } else {
      const configuredPath = workspaceFileForClass(payload.className, payload.sourceDir);
      if (configuredPath && fs.existsSync(configuredPath)) {
        localPath = configuredPath;
      } else {
        localPath = await findClassInWorkspace(payload.className);
      }
    }
  }

  if (!localPath || !fs.existsSync(localPath)) {
    vscode.window.showErrorMessage(
      `ApexGuru bridge: could not locate ${payload.className || "class"} in current workspace.`
    );
    return;
  }

  const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(localPath));
  const editor = await vscode.window.showTextDocument(doc, { preview: false });
  tryRevealMethod(editor, payload.methodName);
}

function activate(context) {
  const output = vscode.window.createOutputChannel("ApexGuru Bridge");

  const uriHandler = {
    async handleUri(uri) {
      try {
        output.appendLine(`Incoming URI: ${uri.toString(true)}`);

        if (uri.path !== "/open-diff" && uri.path !== "/open-file") {
          vscode.window.showWarningMessage(`ApexGuru bridge: unknown path ${uri.path}`);
          return;
        }

        const payload = parsePayload(uri);
        lastPayload = payload;
        output.appendLine(`Payload class=${payload.className} method=${payload.methodName}`);
        if (uri.path === "/open-file") {
          await openFile(payload);
        } else {
          await openDiff(payload);
        }
      } catch (err) {
        output.appendLine(`Error: ${err && err.stack ? err.stack : String(err)}`);
        vscode.window.showErrorMessage(`ApexGuru bridge failed: ${err?.message || String(err)}`);
      }
    }
  };

  context.subscriptions.push(vscode.window.registerUriHandler(uriHandler));

  context.subscriptions.push(
    vscode.commands.registerCommand("apexguruBridge.showLastPayload", async () => {
      if (!lastPayload) {
        vscode.window.showInformationMessage("ApexGuru bridge: no payload received yet.");
        return;
      }

      const doc = await vscode.workspace.openTextDocument({
        language: "json",
        content: JSON.stringify(lastPayload, null, 2)
      });
      await vscode.window.showTextDocument(doc, { preview: false });
    })
  );

  output.appendLine("ApexGuru bridge activated.");
}

function deactivate() {}

module.exports = {
  activate,
  deactivate
};
