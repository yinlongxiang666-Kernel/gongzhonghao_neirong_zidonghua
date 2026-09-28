---
name: wechat-article-workbench
description: Run a local WeChat Official Account article workbench that generates Chinese articles with three images, keeps local history, and syncs drafts to the user's own account. Use when setting up or operating this repository as a Codex skill on the user's computer.
---

# WeChat article workbench

This skill runs the accompanying local web app. Keep the server bound to `127.0.0.1`; each user runs their own instance and binds their own WeChat Official Account in the browser.

1. From this skill directory, check `codex login status`, `node --version`, and `ffmpeg -version`. If Codex is not logged in, direct the user to `codex login`.
2. Start `node preview-server.cjs` and open `http://127.0.0.1:4173/`. Reuse an already running healthy server rather than starting a duplicate.
3. Let the user enter article requirements in the page. Generation creates a new article and three images; history and images stay on this computer.
4. For draft synchronization, let the user enter their own AppID and AppSecret in the local binding dialog. Never request or print the secret in chat. The server stores it under the current system user's `~/.gaozijian/` directory for restart persistence. The user can change the bound account in the same dialog.
5. If WeChat returns error 40164, use the IP reported by WeChat to guide the user in updating their API IP whitelist, then recheck binding. Synchronization creates a draft; it does not publish the article.

Read [README.md](README.md) for installation and troubleshooting. GitHub Pages cannot run this app's local Node APIs. Do not expose the local server publicly.
