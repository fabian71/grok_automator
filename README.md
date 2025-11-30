# Grok Prompt Automator

Extensao para automatizar envios no Grok Imagine (`https://grok.com/imagine`) com foco em video: envia prompts em lote, tenta aplicar proporcao, aciona upscale (quando disponivel) e baixa os videos gerados automaticamente.

## Funcionalidades

- Modo padrao: Video (Imagem opcional).
- Envio em lote (um prompt por linha) com delay padrao de 45s (ajustavel).
- Proporcao fixa padrao 3:2 ou randomizacao entre proporcoes selecionadas.
- Upscale de video e download automatico: tenta o botao oficial "BAIXAR" e faz fallback para o `src` do video quando necessario.
- Subpasta opcional dentro de Downloads para organizar arquivos.
- Persistencia local de prompts e configuracoes.
- Overlay flutuante no Grok mostrando status, prompt atual, progresso, tempo decorrido e fases (inclui "Upscale do video...").

## Requisitos

- Chrome/Edge com suporte a Manifest V3.
- Permissoes: `storage`, `activeTab`, `scripting`, `downloads`, host `https://grok.com/*`.

## Instalacao (modo desenvolvedor)

1. Baixe/clonar este repositorio e mantenha os arquivos em uma pasta local.
2. Abra `chrome://extensions` (ou `edge://extensions`).
3. Ative o "Modo do desenvolvedor".
4. Clique em "Carregar sem compactacao" (Load unpacked) e selecione a pasta do projeto.

## Uso

1. Abra `https://grok.com/imagine` e aguarde a pagina carregar.
2. Abra o popup da extensao.
3. Cole sua lista de prompts (um por linha).
4. Ajuste o delay (padrao 45s). Para video com upscale, mantenha um tempo maior.
5. (Opcional) Defina uma subpasta para os downloads.
6. Clique em "Iniciar automacao".
7. Acompanhe o status no popup e na overlay flutuante; use "Parar automacao" para interromper.

## Como o download automatico funciona

- O content script observa novos videos gerados e captura via botao "BAIXAR" pos-upscale ou via `src` do video (`blob:`/`data:`) como fallback.
- Para video, a extensao usa `.mp4` por padrao. O nome do arquivo e baseado no prompt (sanitizado) + timestamp; se definir subpasta, os arquivos vao para `Downloads/<sua-subpasta>/`.

## Dicas e solucao de problemas

- Esteja na URL exata `https://grok.com/imagine`.
- Se nada acontecer, recarregue a pagina do Grok e tente novamente.
- Verifique se o popup mostra "Conectado a pagina do Grok Imagine".
- Se downloads falharem, veja o console do Service Worker em `chrome://extensions` > Detalhes da extensao > Service Worker.
- Para videos, use delays maiores (>=40s) quando o upscale estiver ativo, para dar tempo de concluir.

## Limitacoes conhecidas

- A selecao de proporcao depende do menu atual do Grok Imagine; se o site mudar, ajuste os seletores no content script.
- A automacao atual prioriza videos; download de imagens nao esta habilitado.
- Se o Grok alterar o DOM (ex.: nao expor videos com `generated_video.mp4`), pode ser necessario ajustar seletores.

## Privacidade

- Dados (prompts e configuracoes) ficam apenas no `chrome.storage.local` do navegador.
- A extensao nao envia dados para servidores externos.

## Doacao

Se esta ferramenta te ajuda, considere apoiar:

https://ko-fi.com/dentparanoide
