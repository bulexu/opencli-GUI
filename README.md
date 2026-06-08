# OpenCLI GUI

基于 Electron + React + TypeScript 构建的 OpenCLI 桌面客户端，为用户提供可视化界面来浏览平台、选择指令、配置参数并导出数据。

## 功能特性

- **开箱即用**：OpenCLI 已内置，无需单独安装 Node.js 或全局 npm 包
- 动态加载 160+ 平台、1030+ 指令（随 OpenCLI 版本自动更新）
- **极速启动**：适配器列表本地缓存，首次启动后秒开
- 三步向导式操作：选择平台 → 选择指令 → 配置参数并运行
- 自动生成参数表单，支持文本、数字、布尔、下拉选择等类型
- 结果表格支持排序、筛选、分页
- 一键导出 CSV 文件
- **预设分组管理**：按平台/指令分组的折叠树，支持行内重命名、删除
- **批量运行**：同平台指令的多个预设一键批量执行，结果统一展示、统一导出

---

## 一、开发环境配置

### 1.1 前置依赖

| 依赖 | 最低版本 | 说明 |
|------|---------|------|
| Node.js | >= 20 | 运行时环境 |
| pnpm | >= 8 | 包管理器 |

> OpenCLI 已作为项目依赖内置，无需全局安装。

### 1.2 安装 Node.js

前往 [Node.js 官网](https://nodejs.org/) 下载 LTS 版本并安装。

验证安装：
```bash
node -v    # 应输出 v20.x.x 或更高
```

### 1.3 安装 pnpm

```bash
npm install -g pnpm
```

### 1.4 克隆项目并安装依赖

```bash
git clone <repository-url> opencli-GUI
cd opencli-GUI
pnpm install
```

> **国内用户加速：** 如果 Electron 下载缓慢，可使用镜像：
> ```bash
> ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/" pnpm install
> ```
> 或在 `~/.npmrc` 中添加永久配置：
> ```
> electron_mirror=https://npmmirror.com/mirrors/electron/
> ```

### 1.5 启动开发环境

```bash
pnpm run dev
```

执行后会自动打开 Electron 窗口，显示应用主界面。开发模式支持热重载——修改 `src/` 下的 React 代码会自动刷新界面。

### 1.6 其他开发命令

| 命令 | 说明 |
|------|------|
| `pnpm run build` | 构建生产版本（输出到 `dist/` 和 `dist-electron/`） |
| `pnpm run preview` | 预览构建产物 |

---

## 二、打包应用

### 2.1 Windows 打包

```bash
pnpm run dist:win  --x64
```

打包完成后，在 `releases/` 目录下生成 `.exe` 安装包。

### 2.2 macOS 打包

```bash
pnpm run dist
```

生成 `.dmg` 安装包。

### 2.3 Linux 打包

```bash
pnpm run dist
```

生成 `.AppImage` 可执行文件。

### 2.4 打包产物说明

| 平台 | 格式 | 产物路径 |
|------|------|---------|
| Windows | NSIS 安装程序 (.exe) | `releases/OpenCLI GUI Setup x.x.x.exe` |
| macOS | 磁盘映像 (.dmg) | `releases/OpenCLI GUI-x.x.x.dmg` |
| Linux | AppImage | `releases/OpenCLI GUI-x.x.x.AppImage` |

### 2.5 打包内置内容

打包后的应用已包含：
- **OpenCLI 引擎**：无需用户安装 Node.js 或 `npm install -g`
- **适配器列表缓存**：首次启动即可使用，无需等待加载

### 2.6 自定义打包配置

编辑 `electron-builder.yml` 可修改：
- 应用图标（`build/icon.ico` / `build/icon.icns`）
- 应用 ID（`appId`）
- 安装目录选项
- 安装包名称

---

## 三、使用手册

### 3.1 环境准备

打包好的应用**无需任何额外环境配置**，开箱即用。

以下情况需要额外准备：

#### （可选）安装 Chrome 扩展

以下平台**需要** Chrome 扩展和浏览器登录才能使用：

- 社交：Twitter、微博、小红书、抖音、B站、知乎等
- 电商：淘宝、京东、拼多多等
- 金融：雪球、东方财富、同花顺等
- AI：ChatGPT、Claude、DeepSeek 等
- 职位：LinkedIn、Boss直聘等

**公开 API 平台无需任何额外配置**，包括：HackerNews、StackOverflow、Wikipedia、npm、PyPI、Steam 等。

安装 Chrome 扩展步骤：
1. 打开 Chrome 浏览器
2. 前往 Chrome 应用商店搜索 "OpenCLI" 安装扩展
3. 扩展安装后会自动启动本地守护进程（端口 19825）
4. 在 Chrome 中登录你需要的平台账号

### 3.2 启动应用

**方式一：使用打包好的安装程序**
1. 双击 `.exe`（Windows）/ `.dmg`（macOS）/ `.AppImage`（Linux）安装并运行
2. 首次启动会立即加载平台列表（内置缓存），后台自动刷新

**方式二：开发模式运行**
```
cd opencli-GUI
pnpm run dev
```

### 3.3 使用流程

#### 步骤一：选择平台

启动后进入平台选择页面：

- 所有平台按策略分组显示：**公开**（无需登录）、**需登录**（需要 Chrome 扩展）、**浏览器**（UI 交互）、**本地**（本地工具）
- 顶部搜索框可快速筛选平台（如输入 "twitter" 或 "bilibili"）
- 每个平台卡片显示可用指令数量

#### 步骤二：选择指令

选择平台后，显示该平台下所有可用指令：

- 每条指令显示名称、描述、策略标签（读取/写入）
- 必填参数以红色标签标出（如 `--limit*`）
- 点击指令卡片进入参数配置

#### 步骤三：配置参数并运行

参数表单自动生成：

| 参数类型 | 表单控件 | 示例 |
|---------|---------|------|
| 文本 (str/string) | 文本输入框 | `--from 北京` |
| 数字 (int/number/float) | 数字输入框 | `--limit 10` |
| 布尔 (boolean/bool) | 复选框 | `--include-sensitive` |
| 枚举 (choices) | 下拉选择框 | `--format json` |
| 位置参数 | 文本输入框（无前缀） | `username` |

填写参数后，点击 **运行** 按钮执行命令。

#### 查看结果

- 结果以表格形式展示
- 点击表头可排序（升序/降序切换）
- 搜索框可筛选表格内容
- 超过 100 条结果自动分页
- 点击 **导出 CSV** 按钮选择保存路径

#### 错误处理

| 错误提示 | 含义 | 解决方法 |
|---------|------|---------|
| 请先启动 Chrome 并安装 OpenCLI 扩展 | 浏览器扩展未运行 | 安装 Chrome 扩展并确保 Chrome 已打开 |
| 请先在 Chrome 中登录该平台 | 未登录对应平台 | 在 Chrome 中登录该平台账号 |
| 命令执行超时，请重试 | 响应超时 | 检查网络，点击"重试"按钮 |
| 查询结果为空 | 平台无数据 | 正常情况，尝试其他指令或参数 |

### 3.4 预设管理

预设功能可以保存常用命令配置，避免重复填写参数。

#### 保存预设

1. 配置好平台、指令和参数
2. 在底部输入预设名称（可选，不填则自动生成）
3. 点击 **保存预设**

#### 预设分组

预设按 **平台 > 指令** 自动分组，以折叠树形式展示在右侧边栏：

- 点击平台名称展开/收起该平台下的指令分组
- 点击指令名称展开/收起该指令下的预设列表
- **单击**预设名称加载该预设
- **双击**预设名称进入行内重命名
- 点击 ✎ 编辑按钮重命名，点击 ✕ 删除按钮删除预设

#### 批量运行

同一指令下有多个预设时，支持批量运行：

1. 展开指令分组，勾选要运行的预设（或点击"全选"）
2. 点击 **批量运行** 按钮
3. 预设将按顺序逐个执行，顶部显示进度（如 2/3）
4. 运行过程中可点击 **取消** 按钮中断（当前执行完后停止）
5. 所有结果合并到一个表格中，`_preset_name` 列标识每行来源
6. 点击 **导出 CSV** 一键导出全部结果

预设数据保存在本地用户数据目录，重启应用后仍然可用。

---

## 四、项目结构

```
opencli-GUI/
├── build/
│   └── adapters-cache.json    # 内置适配器列表缓存（加速首次启动）
├── electron/
│   ├── main.ts                # Electron 主进程（窗口管理、IPC、命令执行、缓存）
│   └── preload.ts             # 预加载脚本（安全桥接主进程与渲染进程）
├── src/
│   ├── components/
│   │   ├── PlatformSelector.tsx   # 平台选择器
│   │   ├── CommandSelector.tsx    # 指令选择器
│   │   ├── ParamForm.tsx          # 参数配置表单
│   │   ├── ResultTable.tsx        # 结果表格与 CSV 导出
│   │   └── PresetManager.tsx      # 预设分组管理侧边栏
│   ├── services/
│   │   └── opencli.ts        # IPC 调用封装
│   ├── types.ts              # TypeScript 类型定义
│   ├── App.tsx               # 应用主组件（向导流程、批量运行）
│   ├── main.tsx              # React 入口
│   └── index.css             # 全局样式
├── package.json
├── tsconfig.json             # React/TypeScript 配置
├── tsconfig.node.json        # Electron 主进程 TypeScript 配置
├── vite.config.ts            # Vite 构建配置（含 Electron 插件）
└── electron-builder.yml      # 打包配置
```

---

## 五、常见问题

**Q: 启动后显示"启动失败"？**
A: 检查终端日志中的错误信息。开发模式下确认 `pnpm install` 已完成。打包版本不应出现此问题（OpenCLI 已内置）。

**Q: 某些平台提示需要登录？**
A: 标记为"需登录"的平台需要在 Chrome 中登录对应账号，并确保 OpenCLI Chrome 扩展已安装且运行中。

**Q: Electron 下载失败（pnpm install 报错）？**
A: 使用国内镜像：`ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/" pnpm install`

**Q: 如何更新 OpenCLI？**
A: 运行 `pnpm update @jackwener/opencli`，然后重新打包。适配器缓存会在下次启动时自动刷新。

**Q: 导出的 CSV 文件在哪里？**
A: 点击"导出 CSV"后会弹出系统保存对话框，由你选择保存位置。

**Q: 批量运行时某个预设失败了怎么办？**
A: 失败的预设会在结果表格中显示错误信息（`_错误` 列），成功的数据正常展示。你也可以点击"取消"中断后续执行。

---

## 六、更新日志

### v1.1.0 (2026-06-08)

**新功能：**
- 预设分组管理：按平台 > 指令折叠树展示，支持行内重命名
- 批量运行：同指令多预设一键批量执行，结果合并展示、统一导出 CSV
- 批量运行支持取消，失败预设在结果表格中显示错误信息

**性能优化：**
- OpenCLI 引擎内置，无需用户全局安装
- 适配器列表本地缓存 + 打包内置缓存，首次启动即秒开
- 后台静默刷新适配器列表，有变化自动更新

**修复：**
- 修复 positional 参数被错误添加 `--key` 前缀的问题
- 修复批量运行中 IPC 异常导致 UI 卡死的问题（try/finally）
- 修复取消批量运行后提示信息不正确的问题
- 修复合并结果表格丢失部分列的问题

### v1.0.0 (2026-06-05)

- 初始版本发布
- 三步向导式操作：选择平台 → 选择指令 → 配置参数
- 结果表格支持排序、筛选、分页
- CSV 导出
- 预设保存与加载
- 支持 Windows (.exe)、macOS (.dmg)、Linux (.AppImage) 打包
