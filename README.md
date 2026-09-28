# 稿子间｜公众号文章创作界面

**许可：**任何人可下载并在自己的设备上修改、运行；未经作者书面许可，不得再次分发或作为面向他人的在线服务提供。详见 [LICENSE](LICENSE)。

## 安装到自己的电脑

需要 Node.js 20 或更新版本、已登录的 Codex CLI、`ffmpeg` 和可以调用公众号 API 的网络。每位使用者应使用自己的 ChatGPT/Codex 登录及自己的公众号 AppID、AppSecret。

普通本地部署：

```powershell
git clone https://github.com/yinlongxiang666-Kernel/gongzhonghao_neirong_zidonghua.git
cd gongzhonghao_neirong_zidonghua
codex login status
node preview-server.cjs
```

若要作为 Codex 技能安装，可将本仓库克隆到 `~/.codex/skills/wechat-article-workbench`，再开启新的 Codex 会话。技能入口为 [SKILL.md](SKILL.md)。

本地页面：[http://127.0.0.1:4173/](http://127.0.0.1:4173/)

## 启动

1. 在这台电脑运行 `codex login status`，确认已通过 ChatGPT 登录。未登录时运行 `codex login`。
2. 在项目目录运行 `node preview-server.cjs`，保持服务运行。
3. 打开上面的本地页面，生成文章。
4. 点击页面里的“绑定公众号”，输入公众号 AppID 和 AppSecret。验证成功后，点击“一键同步”即可将当前文章连同三张配图上传到公众号**草稿箱**，不会自动发布。

首次绑定后，AppID、AppSecret 和可选的作者署名保存在当前系统用户的 `~/.gaozijian/wechat-credentials.json` 中，服务重启后自动恢复。页面中的“重新绑定”可修改公众号。该文件不在 Git 仓库内；请保护本机用户账户，不要复制、上传或分享此文件。也可以在服务启动前设置 `WECHAT_APP_ID`、`WECHAT_APP_SECRET` 和 `WECHAT_AUTHOR` 环境变量。不要把 AppSecret 发在聊天中。

如果微信返回 `40164`，页面会显示微信报告的实际出口 IP；只需把该 IP 加入公众号 API IP 白名单后重试验证。已有白名单无需预先更改。当前服务仅监听 `127.0.0.1`。

同步流程自动把封面和两张正文配图转成适合微信上传的 JPEG，上传封面永久素材和正文图片，然后调用草稿箱接口并核对结果。本机需要 `ffmpeg` 可执行文件（当前电脑已安装）。

文章与图片通过本机已登录的 Codex 并行生成，无需 `OPENAI_API_KEY`。文章字数按标题、导语、小标题及正文合计，去除空白字符，超出目标 ±50 字时优先按完整句校准，仍不达标才重新生成一次。

原生 `image_gen` 工具目前没有指定模型版本的参数，因此此模式不能保证或标记为 image 2.5。明确选择具体图像模型版本需要使用 OpenAI Image API 和单独的 API 凭证。

文章历史在当前浏览器的本地存储中，生成图片在 `generated/` 目录。删除历史文章会删除对应的本地图片，不影响已经同步到公众号草稿箱的副本。

## GitHub 发布方式

本仓库公开源码，使用者克隆到自己的电脑运行，并在本机页面绑定自己的公众号。每台电脑的文章历史、生成图片和公众号密钥互不共享。服务仅监听 `127.0.0.1`，不可直接向互联网开放。

GitHub Pages 只能展示静态页面，无法运行本项目的 Node 接口、Codex 本机登录或公众号同步流程，因此不要把 Pages 链接当作可用的文章生成服务。
