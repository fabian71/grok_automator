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

chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
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
      });
    } catch (error) {
      console.error("Erro ao iniciar automação:", error);
      chrome.runtime
        .sendMessage({ action: "automationError", error: error.message })
        .catch(() => {});
    }
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
  }

  if (request.action === "contentScriptReady" && sender.tab) {
    contentScriptReady.set(sender.tab.id, true);
  }

  if (
    request.action === "updateStatus" ||
    request.action === "automationComplete" ||
    request.action === "automationError"
  ) {
    chrome.runtime.sendMessage(request).catch(() => {});
  }

  if (request.action === "downloadImage") {
    chrome.storage.local.get(["autoDownload", "downloadSubfolder"]).then((settings) => {
      if (!settings.autoDownload) return;

      const subfolder = settings.downloadSubfolder ? settings.downloadSubfolder.trim() : "";

      const safePrompt = (request.prompt || "imagem")
        .replace(/[\\/:*?"<>|]/g, "_")
        .replace(/[^a-zA-Z0-9_\s\-]/g, "")
        .trim()
        .substring(0, 100);

      // Detecta extensão pelo MIME (data:) ou assume png
      function detectExtFromUrl(url) {
        try {
          if (url.startsWith("data:image/")) {
            const m = url.match(/^data:image\/([^;]+);/i);
            if (m && m[1]) {
              const sub = m[1].toLowerCase();
              if (sub === "jpeg") return "jpg";
              if (sub === "svg+xml") return "svg";
              return sub; // png, webp, gif, etc.
            }
          }
        } catch (_) {}
        return "png";
      }

      const ext = detectExtFromUrl(request.url);
      let filename = `${safePrompt}_${Date.now()}.${ext}`;
      if (subfolder) filename = `${subfolder}/${filename}`;

      chrome.downloads.download({ url: request.url, filename }, () => {
        if (chrome.runtime.lastError) {
          console.error(
            `Falha ao baixar imagem: ${chrome.runtime.lastError.message}`,
            `Caminho: ${filename}`
          );
          chrome.runtime.sendMessage({
            action: "updateStatus",
            message: `Erro ao salvar: ${chrome.runtime.lastError.message.split(": ")[1] || "desconhecido"}`,
            type: "error",
          });
        }
      });
    });
  }

  return true;
});

chrome.tabs.onRemoved.addListener((tabId) => {
  contentScriptReady.delete(tabId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === "loading") {
    contentScriptReady.delete(tabId);
  }
});
