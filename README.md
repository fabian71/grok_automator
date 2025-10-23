# Grok Prompt Automator

Extensão para automatizar o envio de múltiplos prompts no Grok Imagine (`https://grok.com/imagine`) e baixar automaticamente as imagens geradas.

## Funcionalidades

- Envio em lote: processa uma lista de prompts, um por linha.
- Delay configurável entre envios (segundos).
- Download automático das imagens (captura `blob:` e `data:image/...`), com detecção de extensão pelo MIME.
- Subpasta opcional dentro de "Downloads" para organizar os arquivos.
- Persistência local de prompts e configurações.
- Status e progresso em tempo real no popup.

## Requisitos

- Chrome/Edge com suporte a Manifest V3.
- Permissões usadas: `storage`, `activeTab`, `scripting`, `downloads` e host `https://grok.com/*`.

## Instalação (modo desenvolvedor)

1. Baixe/clonar este repositório e mantenha os arquivos em uma pasta local.
2. Abra `chrome://extensions` (ou `edge://extensions`).
3. Ative o "Modo do desenvolvedor".
4. Clique em "Carregar sem compactação" (Load unpacked) e selecione a pasta do projeto.

## Uso

1. Abra `https://grok.com/imagine` e aguarde a página carregar.
2. Abra o popup da extensão.
3. Cole sua lista de prompts (um por linha).
4. Ajuste o delay entre envios, se quiser.
5. (Opcional) Marque "Baixar imagens automaticamente" e salve um nome de subpasta.
6. Clique em "Iniciar automação".
7. Acompanhe o status; use "Parar automação" para interromper.

## Como o download automático funciona

- O content script observa o DOM por novas imagens geradas e captura `<img>` com `src` iniciando em `blob:` ou `data:image/...`.
- Para `data:image/...`, a extensão do arquivo é deduzida do MIME (ex.: `image/jpeg` → `.jpg`, `image/png` → `.png`, etc.).
- O nome do arquivo é baseado no prompt (sanitizado) + timestamp. Se definiu uma subpasta, os arquivos são salvos em `Downloads/<sua-subpasta>/`.

## Dicas e solução de problemas

- Certifique-se de estar na URL exata `https://grok.com/imagine` ao iniciar.
- Se nada acontecer, recarregue a página do Grok e tente novamente.
- Verifique se o popup mostra "Conectado à página do Grok Imagine".
- Se downloads falharem, veja o console do Service Worker em `chrome://extensions` > Detalhes da extensão > Service Worker.
- Alguns bloqueios de download do navegador podem exigir confirmação; verifique permissões e histórico em `chrome://downloads`.

## Limitações conhecidas

- Randomização de proporção está desativada (UI do Grok Imagine não expõe um controle estável de proporção para automação).
- Se o Grok alterar a estrutura do DOM (por exemplo, não usar `<img>` ou usar canvas/background-image), pode ser necessário ajustar os seletores.
- O monitoramento captura imagens adicionadas durante a automação; imagens já presentes antes de iniciar podem não ser baixadas.

## Privacidade

- Dados (prompts e configurações) ficam apenas no `chrome.storage.local` do seu navegador.
- A extensão não envia dados para servidores externos.

## Doação

Se esta ferramenta te ajuda, considere apoiar:

https://ko-fi.com/dentparanoide

