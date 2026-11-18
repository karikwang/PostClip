# PostClip

在桌面版 Chrome 或 Brave 中，把 Instagram 帖子和 Reels 的标题、链接和封面保存到自己的 Notion 数据库。收藏前可以预览封面、编辑标题。

[下载 PostClip v1.2.1 安装包](https://github.com/karikwang/PostClip/releases/download/v1.2.1/PostClip-1.2.1.zip) · [查看最新版本](https://github.com/karikwang/PostClip/releases/latest)

## 安装

1. 下载并解压安装包，将含有 `manifest.json` 的 `PostClip` 文件夹放到长期保留的位置。
2. 在 Chrome 打开 `chrome://extensions`，或在 Brave 打开 `brave://extensions`，开启「开发者模式」。
3. 点「加载已解压的扩展程序」，选择 `PostClip` 文件夹。工具栏中的扩展名称为「网页收藏到 Notion」。

更新旧版时，请把新版文件覆盖到原先加载的文件夹，再点「重新加载 ↻」，即可沿用已有的 Notion 绑定。

## 第一次收藏

1. 在自己的 Notion 数据库准备标题、URL 和文件与媒体三种属性。数据库含有多个 URL 或文件属性时，将目标列分别命名为「Instagram 链接」和「封面」。
2. 创建自己的 Notion 内部集成，开启读取内容和插入内容权限，并在目标数据库的「连接」中添加该集成。在「管理数据源」里复制目标数据源 ID。
3. 打开一条 Instagram 帖子或 Reel，点 PostClip，在「绑定 Notion 数据库」中填入自己的集成令牌和数据源 ID，点「验证并绑定」。
4. 确认标题和封面后点「保存到 Notion」，成功后可直接打开卡片。

安装包内的 `安装与使用.html` 可以直接打开，也可以从扩展的绑定设置进入。绑定信息存放在当前浏览器的扩展存储中。
