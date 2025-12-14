(function () {
    'use strict';

    if (window.whiskAutomatorLoaded) {
        return;
    }
    window.whiskAutomatorLoaded = true;

    // --- State Management ---
    let automationState = {
        isRunning: false,
        prompts: [],
        currentIndex: 0,
        delay: 45,
        timeoutId: null,
        settings: {
            randomize: false,
            aspectRatios: [],
            fixedRatio: '3:2',
            upscale: false,
            autoDownload: false,
            breakEnabled: false,
            breakPrompts: 90,
            breakDuration: 3
        },
        mode: 'video',
        modeApplied: false,
        startTime: null,
        upscaledPrompts: new Set(),
        processingPrompts: new Set(),
        downloadedVideos: new Set(),
        processedVideoUrls: new Set(),
        imageDownloadInitiated: false,
        restoredFromReload: false,
        promptsSinceLastBreak: 0,
        isOnBreak: false,
        breakEndTime: null
    };

    // --- Persistence Helpers ---
    async function saveAutomationState() {
        const stateToSave = {
            ...automationState,
            upscaledPrompts: Array.from(automationState.upscaledPrompts),
            processingPrompts: Array.from(automationState.processingPrompts),
            downloadedVideos: Array.from(automationState.downloadedVideos)
        };
        delete stateToSave.timeoutId;
        await chrome.storage.local.set({ 'grokAutomationState': stateToSave });
    }

    async function clearAutomationState() {
        await chrome.storage.local.remove('grokAutomationState');
    }

    async function loadAutomationState() {
        try {
            const result = await chrome.storage.local.get('grokAutomationState');
            if (result.grokAutomationState && result.grokAutomationState.isRunning) {
                const saved = result.grokAutomationState;
                automationState = {
                    ...saved,
                    upscaledPrompts: new Set(saved.upscaledPrompts),
                    processingPrompts: new Set(saved.processingPrompts),
                    downloadedVideos: new Set(saved.downloadedVideos),
                    timeoutId: null,
                    restoredFromReload: true,
                    modeApplied: false // Force re-check of mode on new page
                };

                console.log('♻️ Estado da automação restaurado após reload.');

                if (automationState.currentIndex >= automationState.prompts.length) {
                    console.log('✅ Estado restaurado indica conclusão. Finalizando...');
                    handleAutomationComplete();
                    return;
                }

                startOverlayTimer();
                // Wait for page hydration/interactivity
                setTimeout(() => {
                    runAutomation();
                }, 3000);
            }
        } catch (e) {
            console.error('Erro ao carregar estado:', e);
        }
    }

    // --- Selectors ---
    const SELECTORS = {
        textarea: '.tiptap.ProseMirror',
        submitButton: 'button[aria-label="Enviar"]',
        aspectRatioMenuItem: '[role="menuitem"]'
    };

    // --- Overlay Helpers ---
    function ensureOverlay() {
        if (overlayState.container) return overlayState.container;

        const container = document.createElement('div');
        Object.assign(container.style, {
            position: 'fixed',
            bottom: '20px',
            right: '20px',
            width: '320px',
            maxWidth: '85vw',
            zIndex: '999999',
            backdropFilter: 'blur(10px)',
            background: 'linear-gradient(135deg, rgba(24,24,32,0.9), rgba(32,40,56,0.85))',
            border: '1px solid rgba(255,255,255,0.08)',
            boxShadow: '0 12px 32px rgba(0,0,0,0.28)',
            borderRadius: '18px',
            padding: '14px 16px',
            color: '#f7f9ff',
            fontFamily: 'Inter, Segoe UI, system-ui, -apple-system, sans-serif',
            opacity: '0',
            transform: 'translateY(10px)',
            transition: 'opacity 160ms ease, transform 200ms ease'
        });

        const titleRow = document.createElement('div');
        Object.assign(titleRow.style, { display: 'flex', alignItems: 'center', gap: '8px' });

        const badge = document.createElement('div');
        badge.textContent = 'Grok Automator';
        Object.assign(badge.style, {
            fontSize: '12px',
            padding: '4px 8px',
            borderRadius: '999px',
            background: 'rgba(255,255,255,0.08)',
            color: '#c5d4ff',
            letterSpacing: '0.02em',
            textTransform: 'uppercase'
        });

        const statusEl = document.createElement('div');
        Object.assign(statusEl.style, {
            fontWeight: '700',
            fontSize: '14px',
            color: '#e8edff',
            flex: '1',
            textAlign: 'right'
        });
        statusEl.textContent = 'Pronto';

        titleRow.appendChild(badge);
        titleRow.appendChild(statusEl);

        const promptEl = document.createElement('div');
        Object.assign(promptEl.style, {
            marginTop: '10px',
            fontSize: '13px',
            lineHeight: '1.35',
            color: '#dbe6ff',
            maxHeight: '60px',
            overflow: 'hidden',
            textOverflow: 'ellipsis'
        });

        const counterEl = document.createElement('div');
        Object.assign(counterEl.style, {
            marginTop: '8px',
            fontSize: '12px',
            color: '#9fb4e6'
        });

        const timerEl = document.createElement('div');
        Object.assign(timerEl.style, {
            marginTop: '4px',
            fontSize: '12px',
            color: '#b7c7f5'
        });
        timerEl.textContent = 'Tempo: 00:00';

        const breakInfoEl = document.createElement('div');
        Object.assign(breakInfoEl.style, {
            marginTop: '6px',
            fontSize: '11px',
            color: '#ffcc80',
            display: 'none'
        });

        const progressTrack = document.createElement('div');
        Object.assign(progressTrack.style, {
            marginTop: '10px',
            width: '100%',
            height: '8px',
            borderRadius: '999px',
            background: 'rgba(255,255,255,0.08)',
            overflow: 'hidden'
        });

        const progressBar = document.createElement('div');
        Object.assign(progressBar.style, {
            height: '100%',
            width: '0%',
            background: 'linear-gradient(90deg, #7dd6ff, #9b8cfc)',
            transition: 'width 160ms ease'
        });
        progressTrack.appendChild(progressBar);

        container.appendChild(titleRow);
        container.appendChild(promptEl);
        container.appendChild(counterEl);
        container.appendChild(timerEl);
        container.appendChild(breakInfoEl);
        container.appendChild(progressTrack);

        const donateEl = document.createElement('div');
        Object.assign(donateEl.style, {
            marginTop: '10px',
            fontSize: '12px',
            color: '#c5d4ff'
        });
        donateEl.innerHTML = 'Gosta do projeto? <span style="color:#ff6b9a;">❤</span> Me paga um cafezinho: <a href="https://ko-fi.com/dentparanoide" target="_blank" rel="noopener noreferrer" style="color:#9bd5ff; text-decoration: underline;">ko-fi.com/dentparanoide</a>';
        container.appendChild(donateEl);

        document.body.appendChild(container);

        overlayState.container = container;
        overlayState.statusEl = statusEl;
        overlayState.promptEl = promptEl;
        overlayState.counterEl = counterEl;
        overlayState.timerEl = timerEl;
        overlayState.breakInfoEl = breakInfoEl;
        overlayState.progressBar = progressBar;

        requestAnimationFrame(() => {
            container.style.opacity = '1';
            container.style.transform = 'translateY(0)';
        });
        return container;
    }

    function formatDuration(totalSeconds) {
        const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
        const seconds = Math.floor(totalSeconds % 60).toString().padStart(2, '0');
        return `${minutes}:${seconds}`;
    }

    function updateOverlay({ status, prompt, index, total, elapsedSeconds }) {
        ensureOverlay();
        overlayState.lastData = { status, prompt, index, total };
        if (overlayState.statusEl) overlayState.statusEl.textContent = status || '...';
        if (overlayState.promptEl) overlayState.promptEl.textContent = prompt || '';
        if (overlayState.counterEl && total) {
            overlayState.counterEl.textContent = index
                ? `Prompt ${index} de ${total}`
                : `Total: ${total}`;
        }
        if (overlayState.timerEl && typeof automationState !== 'undefined') {
            const elapsed = typeof elapsedSeconds === 'number'
                ? elapsedSeconds
                : (automationState.startTime ? Math.max(0, Math.floor((Date.now() - automationState.startTime) / 1000)) : 0);
            overlayState.timerEl.textContent = `Tempo: ${formatDuration(elapsed)}`;
        }
        if (overlayState.progressBar && total) {
            const pct = Math.min(100, Math.max(0, Math.round(((index || 0) / total) * 100)));
            overlayState.progressBar.style.width = `${pct}%`;
        }

        // Update break info - only show if total prompts > breakPrompts setting
        const shouldShowBreakInfo = overlayState.breakInfoEl &&
            automationState.settings.breakEnabled &&
            automationState.prompts.length > automationState.settings.breakPrompts;

        if (shouldShowBreakInfo) {
            overlayState.breakInfoEl.style.display = 'block';

            if (automationState.isOnBreak && automationState.breakEndTime) {
                const remainingMs = automationState.breakEndTime - Date.now();
                if (remainingMs > 0) {
                    const remainingSec = Math.ceil(remainingMs / 1000);
                    overlayState.breakInfoEl.textContent = `☕ Pausa: ${formatDuration(remainingSec)} restantes`;
                    overlayState.breakInfoEl.style.color = '#ff9800';
                } else {
                    overlayState.breakInfoEl.textContent = '☕ Retomando...';
                }
            } else {
                const promptsUntilBreak = automationState.settings.breakPrompts - automationState.promptsSinceLastBreak;
                overlayState.breakInfoEl.textContent = `⏱️ Próxima pausa em ${promptsUntilBreak} prompts (${automationState.settings.breakDuration} min)`;
                overlayState.breakInfoEl.style.color = '#ffcc80';
            }
        } else if (overlayState.breakInfoEl) {
            overlayState.breakInfoEl.style.display = 'none';
        }

        if (overlayState.container) overlayState.container.style.display = 'block';
    }

    function hideOverlay() {
        if (!overlayState.container) return;
        overlayState.container.style.opacity = '0';
        overlayState.container.style.transform = 'translateY(10px)';
        setTimeout(() => {
            if (overlayState.container) overlayState.container.style.display = 'none';
        }, 200);
    }

    function startOverlayTimer() {
        if (overlayState.timerInterval) return;
        overlayState.timerInterval = setInterval(() => {
            updateOverlay(overlayState.lastData || {});
        }, 1000);
    }

    function stopOverlayTimer() {
        if (overlayState.timerInterval) {
            clearInterval(overlayState.timerInterval);
            overlayState.timerInterval = null;
        }
    }

    // --- Overlay State ---
    const overlayState = {
        container: null,
        statusEl: null,
        promptEl: null,
        counterEl: null,
        timerEl: null,
        progressBar: null,
        timerInterval: null,
        lastData: {}
    };

    // --- Utility Functions ---
    function findElement(selector, parent = document) {
        return parent.querySelector(selector);
    }

    function findAllElements(selector, parent = document) {
        return Array.from(parent.querySelectorAll(selector));
    }

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function normalizeText(text) {
        return (text || '')
            .normalize('NFD')
            .replace(/\p{Diacritic}/gu, '')
            .toLowerCase()
            .trim();
    }

    function isVisible(element) {
        if (!element) return false;
        const style = window.getComputedStyle(element);
        return style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            style.opacity !== '0' &&
            element.offsetParent !== null;
    }

    function waitForElement(selector, timeout = 10000) {
        return new Promise((resolve, reject) => {
            const element = findElement(selector);
            if (element) return resolve(element);

            const observer = new MutationObserver(() => {
                const element = findElement(selector);
                if (element) {
                    observer.disconnect();
                    resolve(element);
                }
            });

            const timer = setTimeout(() => {
                observer.disconnect();
                reject(new Error(`Elemento não encontrado: ${selector}`));
            }, timeout);

            observer.observe(document.body, { childList: true, subtree: true });
        });
    }

    function simulateTyping(element, text) {
        element.focus();
        if (element.isContentEditable) {
            element.innerHTML = `<p>${text}</p>`;
        } else {
            element.value = text;
        }
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
    }

    function sendMessageToBackground(message) {
        try {
            chrome.runtime.sendMessage(message);
        } catch (error) {
            console.warn('Falha ao enviar mensagem para o background.', error);
        }
    }

    // --- Interaction Helpers ---
    function forceClick(element) {
        if (!element) return;

        // Ensure visibility
        element.style.pointerEvents = 'auto';
        element.style.visibility = 'visible';
        element.style.opacity = '1';
        element.style.display = 'block';

        if (element.scrollIntoView) {
            element.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'center' });
        }

        const events = [
            'pointerover', 'pointerenter', 'mouseover', 'mouseenter',
            'pointermove', 'mousemove',
            'pointerdown', 'mousedown',
            'focus', 'focusin',
            'pointerup', 'mouseup',
            'click'
        ];

        const rect = element.getBoundingClientRect();
        const x = rect.left + rect.width / 2;
        const y = rect.top + rect.height / 2;

        events.forEach(type => {
            const event = new MouseEvent(type, {
                bubbles: true,
                cancelable: true,
                view: window,
                clientX: x,
                clientY: y,
                buttons: 1
            });
            element.dispatchEvent(event);
        });

        try {
            element.click();
        } catch (e) { }
    }

    function findMoreOptionsButton(parent = document) {
        // 1. Search by aria-label
        const targets = ['mais opcoes', 'more options', 'mais opciones'];
        const buttons = findAllElements('button[aria-label], button', parent);

        let found = buttons.find(btn => {
            const label = normalizeText(btn.getAttribute('aria-label') || btn.title || btn.textContent);
            return targets.some(target => label.includes(target));
        });

        if (found) return found;

        // 2. Search by SVG icon (ellipsis)
        const allButtons = findAllElements('button', parent);
        for (const btn of allButtons) {
            const svg = btn.querySelector('svg.lucide-ellipsis');
            if (svg) {
                const circles = svg.querySelectorAll('circle');
                if (circles.length === 3) return btn;
            }
        }

        return null;
    }

    async function openMenuAndGetItems(button, maxAttempts = 5) {
        for (let i = 0; i < maxAttempts; i++) {
            console.log(`🔄 Tentativa ${i + 1}/${maxAttempts} de abrir menu...`);
            forceClick(button);

            // Poll for menu items
            for (let j = 0; j < 8; j++) {
                await sleep(300);
                const items = findAllElements('[role="menuitem"]');
                if (items.length > 0) {
                    return items;
                }
            }
            await sleep(500);
        }
        return [];
    }

    // --- Aspect Ratio Helpers ---
    function findModelOptionsTrigger() {
        const buttons = findAllElements('button');
        return buttons.find(btn => {
            const label = normalizeText(btn.getAttribute('aria-label') || btn.textContent || '');
            return btn.id === 'model-select-trigger' || label.includes('selecao de modelo') || label.includes('modelo');
        });
    }

    function findAspectRatioOption(targetRatio) {
        const normalizedTarget = targetRatio.replace(/\s+/g, '').toLowerCase();
        const buttons = findAllElements('button');
        return buttons.find(btn => {
            const label = (btn.getAttribute('aria-label') || btn.textContent || '').replace(/\s+/g, '').toLowerCase();
            return label.includes(normalizedTarget);
        });
    }

    async function selectGenerationMode(mode) {
        const target = mode === 'video' ? 'video' : 'imagem';
        const trigger = findModelOptionsTrigger();
        if (!trigger) {
            console.warn('Botão de seleção de modelo não encontrado.');
            return false;
        }

        const triggerLabel = normalizeText(trigger.textContent);
        if (triggerLabel.includes(target)) return true;

        for (let attempt = 0; attempt < 4; attempt++) {
            forceClick(trigger);
            await sleep(300);
            const menuItems = findAllElements('[role="menuitem"]');
            const option = menuItems.find(item => normalizeText(item.textContent).includes(target));
            if (option) {
                forceClick(option);
                await sleep(300);
                return true;
            }
            await sleep(200);
        }

        console.warn(`Opção de modo "${target}" não encontrada.`);
        return false;
    }

    async function selectAspectRatio(aspectRatio) {
        const target = aspectRatio || '';
        let option = findAspectRatioOption(target);

        if (!option || !isVisible(option)) {
            const trigger = findModelOptionsTrigger();
            if (trigger) {
                for (let i = 0; i < 3 && (!option || !isVisible(option)); i++) {
                    forceClick(trigger);
                    await sleep(400);
                    option = findAspectRatioOption(target);
                }
            }
        }

        if (option) {
            forceClick(option);
            await sleep(200);
            return true;
        }

        console.warn(`Aspect ratio "${aspectRatio}" nǜo encontrado.`);
        return false;
    }

    // --- Upscale Logic ---
    async function waitForUpscaleComplete(container, maxWaitTime = 120000) {
        const startTime = Date.now();
        console.log('⏳ Aguardando upscale HD terminar...');

        while ((Date.now() - startTime) < maxWaitTime) {
            try {
                // Look for HD button indicator
                const hdButtons = findAllElements('button');
                const hdButton = hdButtons.find(btn => {
                    const hdText = btn.querySelector('div.text-\\[10px\\]');
                    return hdText && normalizeText(hdText.textContent) === 'hd';
                });

                if (hdButton) {
                    console.log('✅ Upscale HD concluído! Botão HD encontrado.');
                    await sleep(2000);

                    // Tentar encontrar o vídeo HD para baixar com o nome correto
                    const hdVideo = document.querySelector('video#hd-video') ||
                        Array.from(document.querySelectorAll('video')).find(v => v.src && v.src.includes('generated_video') && v.style.visibility !== 'hidden');

                    if (hdVideo && hdVideo.src) {
                        console.log('📥 Vídeo HD encontrado, baixando via extensão...');
                        return { success: true, url: hdVideo.src, method: 'extension' };
                    }

                    // Se não achar o vídeo, tenta o botão de download como fallback
                    const downloadBtn = findAllElements('button').find(btn => {
                        const label = normalizeText(btn.getAttribute('aria-label') || '');
                        return label.includes('baixar') || label.includes('download');
                    });

                    if (downloadBtn) {
                        console.log('📥 Vídeo HD não acessível diretamente. Clicando no botão de download (fallback)...');
                        forceClick(downloadBtn);
                        await sleep(1000);
                        return { success: true, method: 'click' };
                    } else {
                        console.warn('⚠️ Botão de download não encontrado após upscale.');
                        return { success: false };
                    }
                }

                await sleep(2000);
            } catch (error) {
                console.error('Erro ao aguardar upscale:', error);
            }
        }

        console.warn('⚠️ Timeout aguardando upscale HD completar.');
        return { success: false };
    }

    async function upscaleVideo(videoElement) {
        const maxRetries = 30;
        let attempt = 0;

        // Find container
        let container = videoElement.closest('.relative.mx-auto');
        if (!container) {
            let parent = videoElement.parentElement;
            for (let i = 0; i < 8; i++) {
                if (parent && findMoreOptionsButton(parent)) {
                    container = parent;
                    break;
                }
                parent = parent ? parent.parentElement : null;
            }
        }

        while (attempt < maxRetries) {
            try {
                attempt++;

                // 1. Check if video generation is complete
                const generatingText = container ? container.querySelector('span.text-white') : null;
                const isGenerating = generatingText && normalizeText(generatingText.textContent).includes('gerando');

                if (isGenerating) {
                    console.log(`[${attempt}] 📊 Vídeo ainda gerando...`);
                    await sleep(2000);
                    continue;
                }

                if (!videoElement.src || !videoElement.src.includes('generated_video.mp4')) {
                    console.log(`[${attempt}] ⏳ Aguardando vídeo ter src válido...`);
                    await sleep(1500);
                    continue;
                }

                if (videoElement.readyState < 2) {
                    console.log(`[${attempt}] 🔄 Vídeo carregando...`);
                    await sleep(1500);
                    continue;
                }

                console.log(`[${attempt}] ✅ Vídeo pronto! Procurando botão de mais opções...`);

                // Force hover
                if (container) {
                    container.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
                    container.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
                }

                // 2. Find "More options" button
                let moreOptionsBtn = container ? findMoreOptionsButton(container) : null;

                // Fallback global search
                if (!moreOptionsBtn) {
                    const allBtns = findAllElements('button');
                    for (const btn of allBtns) {
                        const svg = btn.querySelector('svg.lucide-ellipsis');
                        if (svg && svg.querySelectorAll('circle').length === 3) {
                            moreOptionsBtn = btn;
                            break;
                        }
                    }
                }

                if (!moreOptionsBtn) {
                    console.log(`[${attempt}] ❌ Botão "Mais opções" não encontrado.`);
                    await sleep(2000);
                    continue;
                }

                console.log(`[${attempt}] ✅ Botão encontrado! Clicando...`);

                // 3. Open Menu
                const menuItems = await openMenuAndGetItems(moreOptionsBtn, 6);
                if (!menuItems.length) {
                    console.log(`[${attempt}] ⚠️ Menu não abriu.`);
                    await sleep(1500);
                    continue;
                }

                console.log(`📋 Menu aberto! Itens: ${menuItems.map(m => normalizeText(m.textContent)).join(' | ')}`);

                const upscaleItem = menuItems.find(item => {
                    const text = normalizeText(item.textContent);
                    return text.includes('upscale') || text.includes('ampliar');
                });

                if (upscaleItem) {
                    forceClick(upscaleItem);
                    console.log('🚀 Upscale solicitado com sucesso!');
                    await sleep(1000);

                    // Wait for upscale and download
                    return await waitForUpscaleComplete(container);
                } else {
                    console.log(`[${attempt}] ⚠️ Opção "Upscale" não encontrada no menu.`);
                    forceClick(moreOptionsBtn); // Close menu
                    await sleep(2000);
                }

            } catch (error) {
                console.error(`[${attempt}] ❌ Erro no loop de upscale:`, error);
                await sleep(2000);
            }
        }
        return { success: false };
    }

    // --- Core Logic ---
    async function submitPrompt(prompt, aspectRatio) {
        try {
            const textarea = await waitForElement(SELECTORS.textarea);
            simulateTyping(textarea, prompt);
            await sleep(500);

            if (aspectRatio) {
                await selectAspectRatio(aspectRatio);
            }

            const submitButton = findElement(SELECTORS.submitButton);
            if (!submitButton || submitButton.disabled) {
                throw new Error('Botão de envio não encontrado ou desabilitado.');
            }
            submitButton.click();

        } catch (error) {
            console.error('Erro ao enviar prompt:', error);
            throw error;
        }
    }

    function handleAutomationComplete() {
        sendMessageToBackground({
            action: 'automationComplete',
            totalPrompts: automationState.prompts.length
        });
        updateOverlay({
            status: 'Concluído',
            prompt: 'Todos os prompts enviados',
            index: automationState.prompts.length,
            total: automationState.prompts.length
        });
        setTimeout(hideOverlay, 1200);
        resetAutomation();
    }

    function resetAutomation() {
        if (automationState.timeoutId) clearTimeout(automationState.timeoutId);
        automationState = {
            isRunning: false,
            prompts: [],
            currentIndex: 0,
            delay: 45,
            timeoutId: null,
            settings: {},
            mode: 'video',
            modeApplied: false,
            startTime: null,
            upscaledPrompts: new Set(),
            processingPrompts: new Set(),
            downloadedVideos: new Set()
        };
        clearAutomationState();
        hideOverlay();
        stopOverlayTimer();
    }

    async function runAutomation() {
        if (!automationState.isRunning || automationState.currentIndex >= automationState.prompts.length) {
            handleAutomationComplete();
            return;
        }

        // --- Reload Logic for Image Mode ---
        // Se estiver no modo imagem e NÃO acabou de ser restaurado, recarrega a página para limpar o chat
        if (automationState.mode === 'image' && !automationState.restoredFromReload) {
            console.log('🔄 Recarregando página para limpar estado (Modo Imagem)...');
            await saveAutomationState();
            window.location.href = 'https://grok.com/imagine';
            return;
        }
        automationState.restoredFromReload = false; // Reset flag

        automationState.imageDownloadInitiated = false; // Reset for the new prompt

        const currentPrompt = automationState.prompts[automationState.currentIndex];
        let currentAspectRatio = null;

        // For video mode: always select mode before each prompt (Grok may reset it)
        // For image mode: only select once
        if (automationState.mode === 'video' || !automationState.modeApplied) {
            console.log(`🎯 Selecionando modo ${automationState.mode} antes do prompt...`);
            await selectGenerationMode(automationState.mode);
            automationState.modeApplied = true;
        }

        if (automationState.settings.randomize && automationState.settings.aspectRatios && automationState.settings.aspectRatios.length > 0) {
            const possibleRatios = automationState.settings.aspectRatios;
            currentAspectRatio = possibleRatios[Math.floor(Math.random() * possibleRatios.length)];
            sendMessageToBackground({ action: 'updateStatus', message: `Sorteado: ${currentAspectRatio}` });
        } else if (!automationState.settings.randomize && automationState.settings.fixedRatio) {
            currentAspectRatio = automationState.settings.fixedRatio;
        }

        sendMessageToBackground({
            action: 'updateStatus',
            message: `Enviando: "${currentPrompt.substring(0, 30)}..."`,
            type: 'running',
            progress: `Prompt ${automationState.currentIndex + 1} de ${automationState.prompts.length}`
        });

        updateOverlay({
            status: automationState.mode === 'video' ? 'Gerando vídeo' : 'Gerando imagem',
            prompt: currentPrompt,
            index: automationState.currentIndex + 1,
            total: automationState.prompts.length
        });

        try {
            await sleep(500);
            await submitPrompt(currentPrompt, currentAspectRatio);
            automationState.currentIndex++;
            automationState.promptsSinceLastBreak++;
            saveAutomationState(); // Persist progress immediately

            if (automationState.isRunning && automationState.currentIndex < automationState.prompts.length) {
                // Check if it's time for a break
                if (automationState.settings.breakEnabled &&
                    automationState.promptsSinceLastBreak >= automationState.settings.breakPrompts) {

                    const breakDurationMs = automationState.settings.breakDuration * 60 * 1000;
                    automationState.isOnBreak = true;
                    automationState.breakEndTime = Date.now() + breakDurationMs;

                    console.log(`☕ Iniciando pausa de ${automationState.settings.breakDuration} minutos após ${automationState.promptsSinceLastBreak} prompts...`);

                    updateOverlay({
                        status: '☕ Pausa programada',
                        prompt: `Descansando por ${automationState.settings.breakDuration} minutos...`,
                        index: automationState.currentIndex,
                        total: automationState.prompts.length
                    });

                    automationState.timeoutId = setTimeout(() => {
                        automationState.isOnBreak = false;
                        automationState.breakEndTime = null;
                        automationState.promptsSinceLastBreak = 0;
                        console.log('☕ Pausa concluída, retomando automação...');
                        runAutomation();
                    }, breakDurationMs);
                } else {
                    automationState.timeoutId = setTimeout(runAutomation, automationState.delay * 1000);
                }
            } else if (automationState.isRunning) {
                sendMessageToBackground({
                    action: 'updateStatus',
                    message: 'Aguardando a última geração...',
                    type: 'running'
                });
            }

            if (automationState.isRunning && automationState.currentIndex >= automationState.prompts.length) {
                updateOverlay({
                    status: 'Finalizando...',
                    prompt: currentPrompt,
                    index: automationState.currentIndex,
                    total: automationState.prompts.length
                });
            }
        } catch (error) {
            sendMessageToBackground({ action: 'automationError', error: error.message });
            updateOverlay({
                status: 'Erro',
                prompt: error.message,
                index: automationState.currentIndex,
                total: automationState.prompts.length
            });
            resetAutomation();
        }
    }

    // --- Listeners ---
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === 'ping') {
            sendResponse({ status: 'ready' });
            return true;
        }

        if (request.action === 'startAutomation') {
            if (automationState.isRunning) {
                sendResponse({ status: 'already_running' });
                return true;
            }

            automationState.isRunning = true;
            automationState.prompts = request.prompts;
            automationState.delay = request.delay;
            automationState.settings = request.settings;
            // Default fixed ratio when randomização estiver desligada
            if (!automationState.settings.fixedRatio) {
                automationState.settings.fixedRatio = '3:2';
            }
            automationState.mode = request.mode || 'image';
            automationState.modeApplied = false;
            automationState.currentIndex = 0;
            automationState.startTime = Date.now();
            automationState.upscaledPrompts = new Set();
            automationState.processingPrompts = new Set();
            automationState.downloadedVideos = new Set();
            automationState.promptsSinceLastBreak = 0;
            automationState.isOnBreak = false;
            automationState.breakEndTime = null;

            startOverlayTimer();
            runAutomation();
            sendResponse({ status: 'started' });
            return true;
        }

        if (request.action === 'stopAutomation') {
            resetAutomation();
            sendMessageToBackground({ action: 'updateStatus', message: 'Automação interrompida', type: 'stopped' });
            sendResponse({ status: 'stopped' });
            return true;
        }

        if (request.action === 'resetQueue') {
            resetAutomation();
            sendMessageToBackground({ action: 'updateStatus', message: 'Fila zerada e automação parada', type: 'stopped' });
            sendResponse({ status: 'reset' });
            return true;
        }

        return false;
    });

    // Helper to process download
    const triggerDownload = (url, type, promptIndex = automationState.currentIndex - 1) => {
        if (type === 'video' && automationState.downloadedVideos.has(promptIndex)) {
            console.log(`�Y"' Download jǭ marcado para prompt ${promptIndex}, ignorando duplicata.`);
            return;
        }

        const prompt = automationState.prompts[promptIndex] || 'prompt_desconhecido';

        const send = (finalUrl) => {
            setTimeout(() => {
                sendMessageToBackground({
                    action: 'downloadImage',
                    url: finalUrl,
                    prompt: prompt,
                    type: type
                });
                if (type === 'video') {
                    automationState.downloadedVideos.add(promptIndex);
                }
                // Check if this was the last prompt and we are done
                if (automationState.currentIndex >= automationState.prompts.length) {
                    // Ensure we don't call this multiple times
                    if (automationState.isRunning) {
                        handleAutomationComplete();
                    }
                }
            }, 500);
        };

        // Se o vídeo vier como blob:, converte para data URL para garantir download correto
        if (type === 'video' && url && url.startsWith('blob:')) {
            fetch(url)
                .then(resp => resp.blob())
                .then(blob => new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result);
                    reader.onerror = reject;
                    reader.readAsDataURL(blob);
                }))
                .then(dataUrl => send(dataUrl))
                .catch(err => {
                    console.warn('Falha ao converter blob de vídeo, usando URL original', err);
                    send(url);
                });
            return;
        }

        send(url);
    };

    function clickVideoDownloadButton() {
        const buttons = findAllElements('button[aria-label], button');
        const target = buttons.find(btn => {
            const label = normalizeText(btn.getAttribute('aria-label') || '');
            return label.includes('baixar');
        });
        if (target) {
            forceClick(target);
            return true;
        }
        return false;
    }

    function processVideoElement(video) {
        const currentPromptIndex = automationState.currentIndex - 1;
        const shouldUpscale = automationState.settings.upscale;

        // Prevent duplicate processing
        if (automationState.processingPrompts.has(currentPromptIndex)) {
            console.log(`🔒 Prompt ${currentPromptIndex} já está sendo processado. Ignorando.`);
            return;
        }

        const process = async () => {
            if (shouldUpscale) {
                if (automationState.upscaledPrompts.has(currentPromptIndex)) {
                    console.log(`✅ Prompt ${currentPromptIndex} já foi upscalado. Ignorando.`);
                    return;
                }

                console.log(`🎬 Iniciando upscale para prompt ${currentPromptIndex}...`);
                automationState.processingPrompts.add(currentPromptIndex); // Lock

                const result = await upscaleVideo(video);

                if (result.success) {
                    console.log(`✅ Upscale concluído para prompt ${currentPromptIndex}!`);
                    automationState.upscaledPrompts.add(currentPromptIndex);

                    if (result.method === 'extension' && result.url) {
                        triggerDownload(result.url, 'video');
                    } else if (result.method === 'click') {
                        const clicked = clickVideoDownloadButton();
                        if (!clicked) {
                            console.warn('⚠ Botão de download não encontrado após upscale, tentando src do vídeo.');
                            triggerDownload(video.src, 'video');
                        }
                        if (automationState.currentIndex >= automationState.prompts.length) {
                            handleAutomationComplete();
                        }
                    } else {
                        if (automationState.currentIndex >= automationState.prompts.length) {
                            handleAutomationComplete();
                        }
                    }
                } else {
                    console.warn(`⚠️ Upscale falhou para prompt ${currentPromptIndex}. Baixando vídeo SD.`);
                    triggerDownload(video.src, 'video');
                }

                automationState.processingPrompts.delete(currentPromptIndex); // Unlock
            } else {
                console.log('📥 Fazendo download do vídeo SD (upscale desabilitado)');
                triggerDownload(video.src, 'video');
            }
        };
        process();
    }

    function handleImageGeneration(mutations) {
        if (!automationState.isRunning) return;

        const hasRelevantChanges = mutations.some(m => m.addedNodes.length > 0 || (m.attributeName === 'src'));
        if (!hasRelevantChanges) return;

        // --- New Image Logic (Image Mode) ---
        if (automationState.mode === 'image' && automationState.settings.autoDownload && !automationState.imageDownloadInitiated) {
            const unprocessedItems = Array.from(document.querySelectorAll('div[role="listitem"]:not([data-gpa-image-processed="true"])'));

            if (unprocessedItems.length > 0) {
                // Sort by vertical position to find the newest item (closest to the top)
                unprocessedItems.sort((a, b) => {
                    const topA = parseFloat(a.style.top) || Infinity;
                    const topB = parseFloat(b.style.top) || Infinity;
                    return topA - topB;
                });
                const topMostItem = unprocessedItems[0];

                if (topMostItem) {
                    // Calculate download delay: delay - 8 seconds, minimum 5 seconds
                    const downloadDelay = Math.max(5, automationState.delay - 8) * 1000;
                    console.log(`⏱️ Aguardando ${downloadDelay / 1000}s antes de iniciar download da imagem...`);

                    setTimeout(() => {
                        if (!automationState.isRunning) return;
                        if (automationState.imageDownloadInitiated) return;
                        const playIcon = topMostItem.querySelector('svg.lucide-play');
                        const image = topMostItem.querySelector('img[src^="data:image/"]');

                        if (playIcon && image && image.src) {
                            automationState.imageDownloadInitiated = true;
                            console.log('🖼️ Imagem mais recente detectada (pela posição). Baixando...');
                            topMostItem.dataset.gpaImageProcessed = 'true';
                            triggerDownload(image.src, 'image');
                        }
                    }, downloadDelay);
                }
            }
        }

        // --- Existing Video Logic (Video Mode) ---
        for (const mutation of mutations) {
            if (mutation.type === 'childList') {
                for (const node of mutation.addedNodes) {
                    if (node.nodeType !== 1) continue;
                    if (automationState.mode === 'video') {
                        const videos = node.matches('video') ? [node] : Array.from(node.querySelectorAll('video'));
                        videos.forEach(video => {
                            const videoUrl = video.src;
                            if (videoUrl && videoUrl.includes('generated_video.mp4') && !automationState.processedVideoUrls.has(videoUrl)) {
                                automationState.processedVideoUrls.add(videoUrl); // Mark URL as processed immediately
                                video.dataset.processedSrc = videoUrl;
                                console.log('🎬 Vídeo gerado detectado:', videoUrl);
                                processVideoElement(video);
                            }
                        });
                    }
                }
            } else if (mutation.type === 'attributes' && mutation.attributeName === 'src') {
                const target = mutation.target;
                const videoUrl = target.src;
                if (automationState.mode === 'video' && target.tagName === 'VIDEO' && videoUrl && videoUrl.includes('generated_video.mp4') && !automationState.processedVideoUrls.has(videoUrl)) {
                    automationState.processedVideoUrls.add(videoUrl); // Mark URL as processed immediately
                    target.dataset.processedSrc = videoUrl;
                    console.log('🎬 Vídeo atualizado detectado:', videoUrl);
                    processVideoElement(target);
                }
            }
        }
    }

    // --- Override: prefer botão oficial para download de vídeo após upscale ---
    function processVideoElement(video) {
        const currentPromptIndex = automationState.currentIndex - 1;
        const shouldUpscale = automationState.settings.upscale;

        if (automationState.processingPrompts.has(currentPromptIndex) || automationState.downloadedVideos.has(currentPromptIndex)) {
            return;
        }

        // SET LOCK SYNCHRONOUSLY - This is critical to prevent race conditions
        automationState.processingPrompts.add(currentPromptIndex);

        const process = async () => {
            if (shouldUpscale) {
                if (automationState.upscaledPrompts.has(currentPromptIndex)) {
                    automationState.processingPrompts.delete(currentPromptIndex);
                    return;
                }

                // Lock already set synchronously above
                const result = await upscaleVideo(video);

                if (result.success) {
                    automationState.upscaledPrompts.add(currentPromptIndex);

                    if (result.method === 'extension' && result.url) {
                        triggerDownload(result.url, 'video', currentPromptIndex);
                        automationState.downloadedVideos.add(currentPromptIndex);
                    } else {
                        const clicked = clickVideoDownloadButton();
                        if (clicked) {
                            automationState.downloadedVideos.add(currentPromptIndex);
                        } else {
                            triggerDownload(video.src, 'video', currentPromptIndex);
                        }
                    }
                } else {
                    const clicked = clickVideoDownloadButton();
                    if (clicked) {
                        automationState.downloadedVideos.add(currentPromptIndex);
                    } else {
                        triggerDownload(video.src, 'video', currentPromptIndex);
                    }
                }
                automationState.processingPrompts.delete(currentPromptIndex);
            } else {
                // Non-upscale path - lock already set synchronously above
                console.log('⏳ Aguardando renderização final do vídeo (2s)...');
                await sleep(2000); // Wait for UI to settle (button might appear)

                // Double check after sleep
                if (automationState.downloadedVideos.has(currentPromptIndex)) {
                    automationState.processingPrompts.delete(currentPromptIndex);
                    return;
                }

                console.log('📥 Fazendo download do vídeo SD (upscale desabilitado)');

                // Try to click the button first
                const clicked = clickVideoDownloadButton();

                // Mark as downloaded IMMEDIATELY to prevent race conditions during the process
                automationState.downloadedVideos.add(currentPromptIndex);

                if (clicked) {
                    console.log('✅ Botão de download clicado.');
                    if (automationState.currentIndex >= automationState.prompts.length) {
                        handleAutomationComplete();
                    }
                } else {
                    console.log('⚠️ Botão de download não encontrado. Usando fallback da extensão.');
                    triggerDownload(video.src, 'video', currentPromptIndex);
                }

                automationState.processingPrompts.delete(currentPromptIndex);
            }
        };
        process();
    }

    // Mantém overlay visível ao finalizar e mostra elapsed; injeta status de upscale
    const __originalResetAutomation = resetAutomation;
    resetAutomation = function (options = {}) {
        const { keepOverlay = false, stopTimer = true } = options;
        if (automationState.timeoutId) clearTimeout(automationState.timeoutId);
        automationState = {
            isRunning: false,
            prompts: [],
            currentIndex: 0,
            delay: 20,
            timeoutId: null,
            settings: {},
            mode: 'video',
            modeApplied: false,
            startTime: null,
            upscaledPrompts: new Set(),
            processingPrompts: new Set(),
            downloadedVideos: new Set(),
            processedVideoUrls: new Set(),
            imageDownloadInitiated: false,
            promptsSinceLastBreak: 0,
            isOnBreak: false,
            breakEndTime: null
        };
        clearAutomationState();
        if (stopTimer) stopOverlayTimer();
        if (!keepOverlay) hideOverlay();
    };

    const __originalHandleAutomationComplete = handleAutomationComplete;
    handleAutomationComplete = function () {
        const elapsed = automationState.startTime ? Math.max(0, Math.floor((Date.now() - automationState.startTime) / 1000)) : 0;
        sendMessageToBackground({
            action: 'automationComplete',
            totalPrompts: automationState.prompts.length
        });
        stopOverlayTimer();
        updateOverlay({
            status: 'Concluído',
            prompt: 'Todos os prompts enviados',
            index: automationState.prompts.length,
            total: automationState.prompts.length,
            elapsedSeconds: elapsed
        });
        resetAutomation({ keepOverlay: true, stopTimer: true });
    };

    const __originalProcessVideoElement = processVideoElement;
    processVideoElement = function (video) {
        const currentPromptIndex = automationState.currentIndex - 1;

        // Early return if already processing or downloaded
        if (automationState.processingPrompts.has(currentPromptIndex) || automationState.downloadedVideos.has(currentPromptIndex)) {
            console.log(`🔒 [Wrapper] Prompt ${currentPromptIndex} já está sendo processado ou baixado. Ignorando.`);
            return;
        }

        const promptText = automationState.prompts[currentPromptIndex] || '';
        if (automationState.settings.upscale) {
            updateOverlay({
                status: 'Upscale do vídeo...',
                prompt: promptText,
                index: currentPromptIndex + 1,
                total: automationState.prompts.length
            });
        }
        return __originalProcessVideoElement(video);
    };

    function initialize() {
        const observer = new MutationObserver(handleImageGeneration);
        observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });
        sendMessageToBackground({ action: 'contentScriptReady' });
        loadAutomationState();
        console.log('🚀 Grok Prompt Automator carregado!');
    }

    if (document.readyState === 'complete') {
        initialize();
    } else {
        window.addEventListener('load', initialize);
    }
})();
