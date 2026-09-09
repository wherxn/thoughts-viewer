# 想法记录浏览页面

基于飞书多维表格的想法记录浏览页面，支持关键词搜索、三级分类联动筛选、附件下载。

## 功能特性

- 📋 浏览所有想法记录（卡片式展示）
- 🔍 关键词搜索（标题、内容、分类）
- 🏷️ 三级分类联动筛选（选任意一个，另外两个自动过滤选项）
- ⭐ 收藏标注筛选
- 📎 附件下载（图片、PDF、Excel 等）
- 🔄 手动刷新数据
- 📱 响应式布局（支持手机、平板、电脑）

## 技术栈

- 前端：原生 HTML + CSS + JavaScript（无框架依赖）
- 后端：Node.js Serverless Functions（Vercel）
- 数据源：飞书多维表格（通过飞书开放 API 读取）

## 项目结构

```
thoughts-viewer/
├── api/
│   ├── _utils.js              # 共享工具函数（获取 token、调用 API）
│   ├── get-records.js         # 获取所有想法记录
│   └── get-attachment-url.js  # 获取附件临时下载链接
├── public/
│   ├── index.html             # 页面结构
│   ├── style.css              # 页面样式
│   └── app.js                 # 前端交互逻辑
├── package.json               # 项目配置
├── vercel.json                # Vercel 部署配置
└── README.md                  # 本文件
```

## 部署到 Vercel（详细步骤）

### 前置准备

1. 一个 GitHub 账号（https://github.com 注册）
2. 一个 Vercel 账号（https://vercel.com 用 GitHub 登录）
3. 飞书自建应用的 App ID 和 App Secret
4. 飞书多维表格的 base_token 和 table_id（已配置在代码中，如需修改可在环境变量中覆盖）

### 第1步：上传代码到 GitHub

1. 登录 GitHub，点击右上角「+」→「New repository」
2. 仓库名称填 `thoughts-viewer`，选择 Public 或 Private 都可以
3. 点击「Create repository」
4. 在创建好的仓库页面，点击「Add file」→「Upload files」
5. 把项目所有文件（包括 api/、public/、package.json、vercel.json、README.md）拖拽上传
6. 点击「Commit changes」

### 第2步：导入到 Vercel

1. 登录 Vercel（https://vercel.com）
2. 点击「Add New...」→「Project」
3. 在「Import Git Repository」中找到你的 `thoughts-viewer` 仓库，点击「Import」
4. 项目名称默认即可，Framework Preset 选择「Other」
5. 点击「Environment Variables」展开，添加以下环境变量：

| 变量名 | 值 | 说明 |
|---|---|---|
| `FEISHU_APP_ID` | 你的飞书应用 App ID | 例如：cli_aa2a72b9d1799cc4 |
| `FEISHU_APP_SECRET` | 你的飞书应用 App Secret | 在飞书开放平台「凭证与基础信息」中查看 |
| `FEISHU_BASE_TOKEN` | WfIrbiQAYaITeSsR5uGcmnjHnCb | 多维表格 token（已默认配置，可不用填） |
| `FEISHU_TABLE_ID` | tblQwBZZyVeCrY2A | 数据表 ID（已默认配置，可不用填） |

6. 点击「Deploy」开始部署
7. 等待 1-2 分钟，部署完成后会显示「Congratulations!」

### 第3步：访问页面

1. 部署完成后，点击「Visit」按钮，或者直接访问 `https://你的项目名.vercel.app`
2. 页面会自动加载飞书多维表格中的想法记录
3. 如果显示错误，检查环境变量是否配置正确，以及飞书应用权限是否开通

## 飞书应用配置检查清单

部署前请确认飞书应用已完成以下配置：

- [ ] 已创建企业自建应用
- [ ] 已开通权限：`查看、评论、编辑和管理多维表格`（bitable:app）
- [ ] 已开通权限：`查看、评论和导出多维表格`（bitable:app:readonly）
- [ ] 已发布包含权限的版本（版本管理与发布 → 创建版本 → 申请发布）
- [ ] 已将应用添加到目标多维表格（多维表格右上角「...」→ 添加文档应用 → 搜索应用名 → 权限设为可编辑）

## 常见问题

### Q: 页面显示「加载失败」怎么办？

A: 检查以下几点：
1. 环境变量 `FEISHU_APP_ID` 和 `FEISHU_APP_SECRET` 是否正确
2. 飞书应用是否已开通多维表格权限
3. 飞书应用是否已发布版本（权限需要发布后才生效）
4. 应用是否已添加到多维表格，且权限为可编辑

### Q: 数据不更新怎么办？

A: 页面加载时会从飞书拉取最新数据。如果飞书里的数据有更新，点击页面上的「刷新」按钮即可重新加载。

### Q: 附件下载失败怎么办？

A: 检查飞书应用是否有「查看、评论和导出多维表格」权限。附件下载需要导出权限。

### Q: 可以修改页面样式吗？

A: 可以。修改 `public/style.css` 中的样式，然后提交到 GitHub，Vercel 会自动重新部署。

### Q: 可以增加新功能吗？

A: 可以。前端逻辑在 `public/app.js`，后端 API 在 `api/` 目录下。修改后提交到 GitHub 即可自动部署。

## 本地开发（可选）

如果想在本地运行调试：

```bash
# 安装依赖
npm install

# 安装 Vercel CLI
npm install -g vercel

# 登录 Vercel
vercel login

# 本地运行
vercel dev
```

然后访问 http://localhost:3000

## 许可证

MIT
