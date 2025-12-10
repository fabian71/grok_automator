document.addEventListener('DOMContentLoaded', function () {
    // --- Element Declarations ---
    const promptsTextarea = document.getElementById('prompts-textarea');
    const delayInput = document.getElementById('delay-input');
    const startBtn = document.getElementById('start-btn');
    const stopBtn = document.getElementById('stop-btn');
    const statusText = document.getElementById('status-text');
    const progressInfo = document.getElementById('progress-info');
    const statusDiv = document.querySelector('.status');

    // Download elements
    const autoDownloadCheckbox = document.getElementById('auto-download-checkbox');
    const savePromptTxtCheckbox = document.getElementById('save-prompt-txt-checkbox');
    const downloadSubfolderName = document.getElementById('downloadSubfolderName');
    const saveDownloadFolder = document.getElementById('saveDownloadFolder');
    const downloadFolderStatus = document.getElementById('downloadFolderStatus');
    const videoDelayWarning = document.getElementById('video-delay-warning');
    const downloadSettingsSection = document.querySelector('.download-settings');

    // --- Aspect Ratio Elements ---
    const aspectRatioSelect = document.getElementById('aspect-ratio-select');
    const randomizeToggle = document.getElementById('toggle-randomize');
    const randomizeSection = document.getElementById('randomize-section');
    const randomOptionCheckboxes = document.querySelectorAll('.random-option');

    // --- Mode Elements ---
    const modeImageRadio = document.getElementById('mode-image');
    const modeVideoRadio = document.getElementById('mode-video');
    const upscaleContainer = document.getElementById('upscale-container');
    const upscaleToggle = document.getElementById('toggle-upscale');

    // --- Break Settings Elements ---
    const breakToggle = document.getElementById('toggle-break');
    const breakSettings = document.getElementById('break-settings');
    const breakPromptsInput = document.getElementById('break-prompts');
    const breakDurationInput = document.getElementById('break-duration');

    let isRunning = false;

    // --- Function Definitions ---

    function loadSettings() {
        const keys = [
            'prompts', 'delay', 'autoDownload', 'savePromptTxt', 'downloadSubfolder',
            'randomizeToggle', 'randomizeOptions', 'generationMode', 'aspectRatio', 'upscaleVideo',
            'breakEnabled', 'breakPrompts', 'breakDuration'
        ];
        chrome.storage.local.get(keys).then((result) => {
            promptsTextarea.value = result.prompts || '';
            delayInput.value = result.delay || 45;
            autoDownloadCheckbox.checked = result.autoDownload || false;
            savePromptTxtCheckbox.checked = result.savePromptTxt || false;
            downloadSubfolderName.value = result.downloadSubfolder || '';
            if (result.downloadSubfolder) {
                downloadFolderStatus.textContent = `Salvo em: 'Downloads/${result.downloadSubfolder}'`;
            }

            randomizeToggle.checked = result.randomizeToggle || false;
            aspectRatioSelect.value = result.aspectRatio || '3:2';
            upscaleToggle.checked = result.upscaleVideo || false;

            // Break settings
            breakToggle.checked = result.breakEnabled || false;
            breakPromptsInput.value = result.breakPrompts || 90;
            breakDurationInput.value = result.breakDuration || 3;

            if (result.randomizeOptions) {
                randomOptionCheckboxes.forEach(box => {
                    box.checked = result.randomizeOptions[box.id] !== false; // Default true
                });
            } else {
                randomOptionCheckboxes.forEach(box => { box.checked = true; });
            }

            if (result.generationMode === 'image') {
                modeImageRadio.checked = true;
                upscaleContainer.style.display = 'none';
            } else {
                modeVideoRadio.checked = true; // default
                upscaleContainer.style.display = 'flex';
            }

            updateRandomizeUI();
            updateDownloadUI();
            updateDelayWarning();
            updateBreakUI();
        }).catch(error => console.error('Erro ao carregar dados:', error));
    }

    function saveSettings() {
        let randomizeOptions = {};
        randomOptionCheckboxes.forEach(box => {
            randomizeOptions[box.id] = box.checked;
        });

        chrome.storage.local.set({
            prompts: promptsTextarea.value.trim(),
            delay: parseInt(delayInput.value) || 45,
            autoDownload: autoDownloadCheckbox.checked,
            savePromptTxt: savePromptTxtCheckbox.checked,
            downloadSubfolder: downloadSubfolderName.value.trim(),
            randomizeToggle: randomizeToggle.checked,
            aspectRatio: aspectRatioSelect.value,
            randomizeOptions: randomizeOptions,
            generationMode: modeVideoRadio.checked ? 'video' : 'image',
            upscaleVideo: upscaleToggle.checked,
            breakEnabled: breakToggle.checked,
            breakPrompts: parseInt(breakPromptsInput.value) || 90,
            breakDuration: parseInt(breakDurationInput.value) || 3
        }).catch(error => console.error('Erro no auto-save:', error));
    }

    function updateRandomizeUI() {
        if (randomizeToggle.checked) {
            randomizeSection.style.display = 'block';
            aspectRatioSelect.disabled = true;
        } else {
            randomizeSection.style.display = 'none';
            aspectRatioSelect.disabled = false;
        }
    }

    function updateDelayWarning() {
        const delay = parseInt(delayInput.value) || 0;

        // Video mode warning: delay < 40
        const showVideoWarning = modeVideoRadio.checked && delay > 0 && delay < 40;
        if (videoDelayWarning) {
            videoDelayWarning.style.display = showVideoWarning ? 'block' : 'none';
        }

        // Image mode warning: delay < 20
        const imageDelayWarning = document.getElementById('image-delay-warning');
        const showImageWarning = modeImageRadio.checked && delay > 0 && delay < 20;
        if (imageDelayWarning) {
            imageDelayWarning.style.display = showImageWarning ? 'block' : 'none';
        }
    }

    function updateDownloadUI() {
        // Always enable download settings for both Image and Video modes
        [autoDownloadCheckbox, downloadSubfolderName, saveDownloadFolder].forEach(el => {
            el.disabled = false;
        });
        if (downloadSettingsSection) {
            downloadSettingsSection.style.opacity = '1';
            downloadSettingsSection.style.pointerEvents = 'auto';
        }
    }

    function updateBreakUI() {
        if (breakSettings) {
            breakSettings.style.display = breakToggle.checked ? 'block' : 'none';
        }
    }

    function updateModeUI() {
        if (modeVideoRadio.checked) {
            upscaleContainer.style.display = 'flex';
        } else {
            upscaleContainer.style.display = 'none';
        }
        updateDownloadUI();
        updateDelayWarning();
        saveSettings();
    }

    async function startAutomation() {
        const prompts = promptsTextarea.value.trim();
        if (!prompts) {
            showStatus('Por favor, adicione pelo menos um prompt!', 'error');
            return;
        }

        let ratiosToRandomize = [];
        if (randomizeToggle.checked) {
            randomOptionCheckboxes.forEach(box => {
                if (box.checked) ratiosToRandomize.push(box.value);
            });
            if (ratiosToRandomize.length === 0) {
                showStatus('Selecione pelo menos uma proporção para o sorteio!', 'error');
                return;
            }
        }

        try {
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tabs[0] || !tabs[0].url.includes('grok.com/imagine')) {
                showStatus('Abra a página do Grok Imagine primeiro!', 'error');
                return;
            }

            isRunning = true;
            updateUI();

            await chrome.runtime.sendMessage({
                action: 'startAutomation',
                prompts: prompts.split('\n').filter(p => p.trim()),
                delay: parseInt(delayInput.value) || 20,
                settings: {
                    randomize: randomizeToggle.checked,
                    aspectRatios: ratiosToRandomize,
                    fixedRatio: aspectRatioSelect.value,
                    upscale: upscaleToggle.checked,
                    autoDownload: autoDownloadCheckbox.checked,
                    breakEnabled: breakToggle.checked,
                    breakPrompts: parseInt(breakPromptsInput.value) || 90,
                    breakDuration: parseInt(breakDurationInput.value) || 3
                },
                mode: modeVideoRadio.checked ? 'video' : 'image'
            });

            showStatus(`Iniciando automação...`, 'running');
        } catch (error) {
            console.error('Erro ao iniciar automação:', error);
            showStatus(`Erro: ${error.message}`, 'error');
            isRunning = false;
            updateUI();
        }
    }

    async function stopAutomation() {
        try {
            isRunning = false;
            updateUI();
            await chrome.runtime.sendMessage({ action: 'stopAutomation' });
            showStatus('Automação interrompida pelo usuário', 'stopped');
            progressInfo.textContent = '';
        } catch (error) {
            console.error('Erro ao parar automação:', error);
            showStatus('Erro ao parar automação', 'error');
        }
    }

    function saveSubfolder() {
        const subfolder = downloadSubfolderName.value.trim();
        chrome.storage.local.set({ downloadSubfolder: subfolder }).then(() => {
            downloadFolderStatus.textContent = `Salvo! As imagens irão para 'Downloads/${subfolder}'`;
            downloadFolderStatus.style.color = 'green';
            setTimeout(() => {
                downloadFolderStatus.textContent = subfolder ? `Salvo em: 'Downloads/${subfolder}'` : '';
                downloadFolderStatus.style.color = '';
            }, 3000);
        }).catch(error => {
            downloadFolderStatus.textContent = 'Erro ao salvar.';
            downloadFolderStatus.style.color = 'red';
            console.error('Erro ao salvar subpasta:', error);
        });
    }

    function updateUI() {
        const elementsToDisable = [
            startBtn, promptsTextarea, delayInput, autoDownloadCheckbox, downloadSubfolderName,
            saveDownloadFolder, randomizeToggle, aspectRatioSelect, ...randomOptionCheckboxes,
            modeImageRadio, modeVideoRadio, upscaleToggle
        ];
        if (isRunning) {
            elementsToDisable.forEach(el => el.disabled = true);
            stopBtn.disabled = false;
            statusDiv.classList.add('running');
        } else {
            elementsToDisable.forEach(el => el.disabled = false);
            stopBtn.disabled = true;
            statusDiv.classList.remove('running');
            updateRandomizeUI();
        }
    }

    function showStatus(message, type) {
        statusText.textContent = message;
        statusDiv.classList.remove('success', 'error', 'running', 'stopped');
        if (type) {
            statusDiv.classList.add(type);
        }
        if (type === 'success' || type === 'error') {
            setTimeout(() => {
                if (!isRunning) {
                    statusText.textContent = 'Pronto para iniciar';
                    statusDiv.classList.remove(type);
                }
            }, 3000);
        }
    }

    // --- Event Listeners ---
    loadSettings();

    startBtn.addEventListener('click', startAutomation);
    stopBtn.addEventListener('click', stopAutomation);
    saveDownloadFolder.addEventListener('click', saveSubfolder);

    const elementsToAutoSave = [
        promptsTextarea, delayInput, autoDownloadCheckbox, savePromptTxtCheckbox,
        randomizeToggle, aspectRatioSelect, ...randomOptionCheckboxes,
        modeImageRadio, modeVideoRadio, upscaleToggle
    ];
    elementsToAutoSave.forEach(el => {
        const eventType = el.type === 'textarea' || el.type === 'number' || el.type === 'text' ? 'input' : 'change';
        el.addEventListener(eventType, saveSettings);
    });

    randomizeToggle.addEventListener('change', updateRandomizeUI);
    delayInput.addEventListener('input', updateDelayWarning);
    randomOptionCheckboxes.forEach(box => {
        box.addEventListener('change', () => {
            updateRandomizeUI();
        });
    });

    modeImageRadio.addEventListener('change', updateModeUI);
    modeVideoRadio.addEventListener('change', updateModeUI);

    // Break settings listeners
    breakToggle.addEventListener('change', () => {
        updateBreakUI();
        saveSettings();
    });
    breakPromptsInput.addEventListener('input', saveSettings);
    breakDurationInput.addEventListener('input', saveSettings);

    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === 'updateStatus') {
            showStatus(request.message, request.type);
            if (request.progress) {
                progressInfo.textContent = request.progress;
            }
        }
        if (request.action === 'automationComplete') {
            isRunning = false;
            updateUI();
            showStatus('Automação concluída!', 'success');
            progressInfo.textContent = `Todos os ${request.totalPrompts} prompts foram enviados`;
        }
        if (request.action === 'automationError') {
            isRunning = false;
            updateUI();
            showStatus(`Erro: ${request.error}`, 'error');
            progressInfo.textContent = '';
        }
        return true;
    });

    chrome.tabs.query({ active: true, currentWindow: true }).then(tabs => {
        const currentTab = tabs[0];
        if (currentTab && currentTab.url && currentTab.url.includes('grok.com/imagine')) {
            showStatus('Conectado à página do Grok Imagine', 'success');
        } else {
            showStatus('Abra a página do Grok Imagine para usar', 'error');
        }
    }).catch(error => {
        console.error('Erro ao verificar aba:', error);
    });
});
