// Background Service Worker para MV3 - Comunicação entre popup e content script
let contentScriptReady = new Map();

async function isContentScriptReady(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { action: "ping" });
    return true;
  } catch (error) {
    return false;
  }
}

async function ensureContentScript(tabId) {
  try {
    const tab = await chrome.tabs.get(tabId);
    if (!tab.url.includes("grok.com/imagine")) {
      throw new Error("Não está na página do Grok Imagine");
    }

    if (await isContentScriptReady(tabId)) {
      return true;
    }

    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content.js"],
    });

    await new Promise((resolve) => setTimeout(resolve, 1000));
    return await isContentScriptReady(tabId);
  } catch (error) {
    console.error("Erro ao garantir content script:", error);
    return false;
  }
}

async function sendMessageWithRetry(tabId, message, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const isReady = await ensureContentScript(tabId);
      if (!isReady) {
        throw new Error(`Content script não está pronto na aba ${tabId}`);
      }
      await chrome.tabs.sendMessage(tabId, message);
      return true;
    } catch (error) {
      console.warn(`Tentativa ${attempt}/${maxRetries} falhou:`, error.message);
      if (attempt === maxRetries) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
    }
  }
}

// Map to temporarily store potential filenames by URL to avoid race conditions with download ID
const pendingDownloads = new Map();

chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
  // ... existing startAutomation/stopAutomation handlers ...
  if (request.action === "startAutomation") {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const currentTab = tabs[0];

      if (!currentTab || !currentTab.url.includes("grok.com/imagine")) {
        throw new Error("Abra a página do Grok Imagine primeiro!");
      }

      await sendMessageWithRetry(currentTab.id, {
        action: "startAutomation",
        prompts: request.prompts,
        delay: request.delay,
        settings: request.settings,
        mode: request.mode,
      });
    } catch (error) {
      console.error("Erro ao iniciar automação:", error);
      chrome.runtime
        .sendMessage({ action: "automationError", error: error.message })
        .catch(() => { });
    }
    return true;
  }

  if (request.action === "stopAutomation") {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const currentTab = tabs[0];

      if (currentTab && currentTab.url.includes("grok.com/imagine")) {
        await sendMessageWithRetry(currentTab.id, { action: "stopAutomation" });
      }
    } catch (error) {
      console.error("Erro ao parar automação:", error);
    }
    return true;
  }

  if (request.action === "contentScriptReady" && sender.tab) {
    contentScriptReady.set(sender.tab.id, true);
  }

  if (
    request.action === "updateStatus" ||
    request.action === "automationComplete" ||
    request.action === "automationError"
  ) {
    chrome.runtime.sendMessage(request).catch(() => { });
  }

  if (request.action === "downloadImage") {
    chrome.storage.local.get(["autoDownload", "savePromptTxt", "downloadSubfolder"]).then((settings) => {
      if (!settings.autoDownload) return;

      const subfolder = settings.downloadSubfolder ? settings.downloadSubfolder.trim().replace(/[\\/]+$/g, '') : "";
      const originalPrompt = request.prompt || "imagem";

      const safePrompt = originalPrompt
        .replace(/[\\/:*?"<>|]/g, "_")
        .replace(/[^a-zA-Z0-9_\s\-]/g, "")
        .trim()
        .substring(0, 100);

      function detectExtFromUrl(url, type) {
        if (type === 'video') return 'mp4';
        try {
          if (url.startsWith("data:image/")) {
            const m = url.match(/^data:image\/([^;]+);/i);
            if (m && m[1]) {
              const sub = m[1].toLowerCase();
              if (sub === "jpeg") return "jpg";
              if (sub === "svg+xml") return "svg";
              return sub;
            }
          }
        } catch (_) { }
        return "png";
      }

      const ext = detectExtFromUrl(request.url, request.type);
      const timestamp = Date.now();
      const baseFilename = `${safePrompt}_${timestamp}`;
      let mainFilename = `${baseFilename}.${ext}`;
      let txtFilename = `${baseFilename}.txt`;

      if (subfolder) {
        mainFilename = `${subfolder}/${mainFilename}`;
        txtFilename = `${subfolder}/${txtFilename}`;
      }

      // Store filename mapped to URL
      pendingDownloads.set(request.url, mainFilename);

      // Download the image/video
      chrome.downloads.download({
        url: request.url,
        saveAs: false,
        conflictAction: 'uniquify'
      }, (downloadId) => {
        if (chrome.runtime.lastError) {
          console.error(`Falha no download da mídia: ${chrome.runtime.lastError.message}`);
          pendingDownloads.delete(request.url); // Clean up on fail
        } else {
          console.log(`Mídia solicitada. ID: ${downloadId}, Destino: ${mainFilename}`);
        }
      });

      // Create and download the .txt file with the prompt (if enabled)
      if (settings.savePromptTxt) {
        const txtContent = originalPrompt;
        const base64Content = btoa(unescape(encodeURIComponent(txtContent)));
        const txtDataUrl = `data:text/plain;base64,${base64Content}`;

        pendingDownloads.set(txtDataUrl, txtFilename);

        chrome.downloads.download({
          url: txtDataUrl,
          saveAs: false,
          conflictAction: 'uniquify'
        }, (txtDownloadId) => {
          if (chrome.runtime.lastError) {
            console.error(`Falha no download do texto: ${chrome.runtime.lastError.message}`);
            pendingDownloads.delete(txtDataUrl);
          } else {
            console.log(`Texto solicitado. ID: ${txtDownloadId}, Destino: ${txtFilename}`);
          }
        });
      }
    });
  }

  return true;
});

// Listener robusto para forçar nomes de arquivos e pastas
chrome.downloads.onDeterminingFilename.addListener((item, suggest) => {
  // Check if we have a pending name for this URL
  if (pendingDownloads.has(item.url)) {
    console.log(`[onDeterminingFilename] Interceptado URL: ${item.url}`);
    const desiredFilename = pendingDownloads.get(item.url);
    pendingDownloads.delete(item.url); // Clean up

    suggest({
      filename: desiredFilename,
      conflictAction: 'uniquify'
    });
    return;
  }

  // Fallback: If URL doesn't match exactly (maybe changed by browser), we might miss it.
  // But for data-urls and specific blobs, it usually matches.
  // If we miss, standard browser behavior applies.
});

chrome.tabs.onRemoved.addListener((tabId) => {
  contentScriptReady.delete(tabId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === "loading") {
    contentScriptReady.delete(tabId);
  }
});
