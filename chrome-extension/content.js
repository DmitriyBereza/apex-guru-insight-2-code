(() => {
  const DEBUG = true;
  const LOG_PREFIX = "[ApexGuru->VSCode]";
  const DIFF_BUTTON_CLASS = "apexguru-show-diff-vscode-btn";
  const OPEN_BUTTON_CLASS = "apexguru-open-vscode-btn";
  const BRIDGE_EXTENSION_ID = "apexguru.apexguru-insight-bridge";
  const VSCODE_SCHEME = "vscode";
  const defaults = {
    classesPath: ""
  };

  function debug(...args) {
    if (!DEBUG) return;
    console.log(LOG_PREFIX, ...args);
  }

  try {
    if (document.documentElement) {
      document.documentElement.setAttribute("data-apexguru-vscode-ext", "loaded");
    }
  } catch (e) {
    console.warn(LOG_PREFIX, "failed to set load marker", e);
  }

  function clean(text) {
    return (text || "").replace(/\s+/g, " ").trim();
  }

  function extractIdentifier(value) {
    const text = clean(value)
      .replace(/Copy\s*To\s*Clipboard/gi, "")
      .replace(/CopyToClipboard/gi, "")
      .trim();
    const match = text.match(/[A-Za-z_][A-Za-z0-9_]*/);
    return match ? match[0] : "";
  }

  function firstTextChildValue(el) {
    if (!el || !el.childNodes) return "";
    for (const node of el.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        const value = clean(node.nodeValue || "");
        if (value) return value;
      }
    }
    return "";
  }

  function normalizeCode(codeText) {
    if (!codeText) return "";
    return codeText
      .split("\n")
      .map((line) => line.replace(/^\s*\d+\.\s?/, ""))
      .join("\n")
      .trim();
  }

  function truncate(value, max = 12000) {
    if (!value) return "";
    return value.length > max ? value.slice(0, max) : value;
  }

  function isLikelyApexGuruPage() {
    const href = window.location.href;
    const bodyText = clean(document.body?.innerText || "");
    const matches = href.includes("ApexGuruInsights") || bodyText.includes("ApexGuru Insights");
    debug("page check", { href, matches });
    return matches;
  }

  function* walkNodes(root) {
    if (!root) return;
    if (root.querySelectorAll) {
      for (const el of root.querySelectorAll("*")) {
        yield el;
      }
    }

    if (root.querySelectorAll) {
      for (const host of root.querySelectorAll("*")) {
        if (host.shadowRoot) {
          yield* walkNodes(host.shadowRoot);
        }
      }
    }
  }

  function getLabelValue(labelEl) {
    if (!labelEl) return "";

    const directValueEl = labelEl.nextElementSibling;
    if (directValueEl) {
      const fromTextNode = firstTextChildValue(directValueEl);
      const fromTextContent = clean(directValueEl.textContent || "");
      const extracted = extractIdentifier(fromTextNode || fromTextContent);
      if (extracted) return extracted;
    }

    const parent = labelEl.parentElement;
    const parentText = clean(parent?.textContent || "");
    const labelText = clean(labelEl.textContent);

    if (parentText && labelText && parentText.startsWith(labelText)) {
      const maybeValue = clean(parentText.slice(labelText.length));
      const extracted = extractIdentifier(maybeValue);
      if (extracted) return extracted;
    }

    let probe = labelEl.nextElementSibling;
    while (probe) {
      const extracted = extractIdentifier(clean(probe.textContent));
      if (extracted) return extracted;
      probe = probe.nextElementSibling;
    }

    return "";
  }

  function findRecommendationContainer(startEl) {
    let node = startEl;
    let steps = 0;
    while (node && steps < 18) {
      const text = clean(node.textContent || "");
      if (text.includes("Current Code") && text.includes("Recommended Code")) {
        return node;
      }
      node = node.parentElement;
      steps += 1;
    }
    return document;
  }

  function findCodePanelText(container, panelTitle, normalize = true) {
    if (!container || !container.querySelectorAll) return "";

    if (panelTitle === "Current Code") {
      const preBefore = container.querySelector("pre.pre-before code, pre.pre-before");
      if (preBefore?.textContent) return normalize ? normalizeCode(preBefore.textContent) : (preBefore.textContent || "");
    }

    if (panelTitle === "Recommended Code") {
      const preAfter = container.querySelector("pre.pre-after code, pre.pre-after");
      if (preAfter?.textContent) return normalize ? normalizeCode(preAfter.textContent) : (preAfter.textContent || "");
    }

    return "";
  }

  function filePathForClass(classesPath, className) {
    const base = classesPath.replace(/[\\/]+$/, "");
    return `${base}/${className}.cls`;
  }

  function getStoredConfig(callback) {
    try {
      if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.sync && chrome.storage.sync.get) {
        chrome.storage.sync.get(defaults, callback);
        return;
      }

      if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local && chrome.storage.local.get) {
        chrome.storage.local.get(defaults, callback);
        return;
      }
    } catch (err) {
      debug("failed to read extension storage", err);
    }

    debug("extension storage API unavailable, using defaults");
    callback({ ...defaults });
  }

  function openViaBridge(pathName, payload) {
    getStoredConfig((cfg) => {
      const classesPath = (cfg.classesPath || "").trim();
      const filePath = classesPath && payload.className ? filePathForClass(classesPath, payload.className) : "";

      const params = new URLSearchParams({
        className: payload.className || "",
        methodName: payload.methodName || "",
        filePath,
        classesPath,
        currentCode: payload.currentCode || "",
        recommendedCode: payload.recommendedCode || "",
        rawCurrentCode: payload.rawCurrentCode || "",
        rawRecommendedCode: payload.rawRecommendedCode || "",
        pageUrl: window.location.href
      });

      const vscodeUrl = `${VSCODE_SCHEME}://${encodeURIComponent(BRIDGE_EXTENSION_ID)}${pathName}?${params.toString()}`;
      debug("opening bridge uri", {
        pathName,
        bridgeExtensionId: BRIDGE_EXTENSION_ID,
        vscodeScheme: VSCODE_SCHEME,
        className: payload.className,
        methodName: payload.methodName,
        filePath,
        currentCodeLength: (payload.currentCode || "").length,
        recommendedCodeLength: (payload.recommendedCode || "").length,
        rawCurrentCodeLength: (payload.rawCurrentCode || "").length,
        rawRecommendedCodeLength: (payload.rawRecommendedCode || "").length
      });
      window.location.href = vscodeUrl;
    });
  }

  function createDiffButton(payload) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = DIFF_BUTTON_CLASS;
    btn.textContent = "Show Diff in VS Code";
    btn.style.marginLeft = "8px";
    btn.style.padding = "4px 10px";
    btn.style.border = "1px solid #2e844a";
    btn.style.borderRadius = "4px";
    btn.style.background = "#2e844a";
    btn.style.color = "#fff";
    btn.style.cursor = "pointer";
    btn.style.fontSize = "12px";
    btn.style.fontWeight = "600";
    btn.addEventListener("click", () => openViaBridge("/open-diff", payload));
    return btn;
  }

  function createOpenButton(payload) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = OPEN_BUTTON_CLASS;
    btn.textContent = "Open in VS Code";
    btn.style.marginLeft = "8px";
    btn.style.padding = "4px 10px";
    btn.style.border = "1px solid #0176d3";
    btn.style.borderRadius = "4px";
    btn.style.background = "#fff";
    btn.style.color = "#0176d3";
    btn.style.cursor = "pointer";
    btn.style.fontSize = "12px";
    btn.addEventListener("click", () => openViaBridge("/open-file", payload));
    return btn;
  }

  function injectButtons() {
    if (!isLikelyApexGuruPage()) {
      debug("skipping inject; not ApexGuru page");
      return;
    }

    let labelsSeen = 0;
    let diffButtonsAdded = 0;
    let openButtonsAdded = 0;

    for (const el of walkNodes(document)) {
      if (clean(el.textContent) !== "Apex Class") continue;
      labelsSeen += 1;

      const className = getLabelValue(el);
      if (!className) continue;

      const container = findRecommendationContainer(el);
      const methodLabel = Array.from(container.querySelectorAll("*")).find((n) => clean(n.textContent) === "Apex Method") || null;
      const methodName = getLabelValue(methodLabel);
      const currentCode = truncate(findCodePanelText(container, "Current Code", true));
      const recommendedCode = truncate(findCodePanelText(container, "Recommended Code", true));
      const rawCurrentCode = truncate(findCodePanelText(container, "Current Code", false));
      const rawRecommendedCode = truncate(findCodePanelText(container, "Recommended Code", false));

      const payload = { className, methodName, currentCode, recommendedCode, rawCurrentCode, rawRecommendedCode };

      const host = el.parentElement || el;
      if (!host) continue;

      if (!host.querySelector(`.${DIFF_BUTTON_CLASS}`)) {
        host.appendChild(createDiffButton(payload));
        diffButtonsAdded += 1;
      }

      if (!host.querySelector(`.${OPEN_BUTTON_CLASS}`)) {
        host.appendChild(createOpenButton(payload));
        openButtonsAdded += 1;
      }

      debug("buttons injected", { className, methodName });
    }

    debug("inject pass finished", { labelsSeen, diffButtonsAdded, openButtonsAdded });
  }

  const observer = new MutationObserver(() => {
    injectButtons();
  });

  debug("content script loaded");
  injectButtons();
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
