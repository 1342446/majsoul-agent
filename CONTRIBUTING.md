# 贡献指南

欢迎提交兼容性修复、状态机错误的最小复现、界面改进和文档完善。较大的功能请先在Issue中说明使用场景和验收方式。

## 本地开发

使用Node.js 22或更新版本；没有第三方运行依赖，无需安装Python或启动调试端口。

```sh
git clone https://github.com/oreki-L/majsoul-ai-analysis-and-review-agent.git
cd majsoul-ai-analysis-and-review-agent
npm run check
npm test
npm run build
```

在浏览器扩展管理页加载完整版`extension/`，或构建出的`dist/majsoul-ai-analysis-and-review-agent-0.4.0/`；独立获取器加载`dist/majsoul-collector-0.4.0/`。源码变更后重新加载扩展并刷新游戏。离线演示可用任意本地静态服务器打开 `tests/preview.html`；演示只使用人工数据。

## 修改与验证

- 消息解析修改 `protocol.js`；采集兼容性修改 `capture.js`；状态规则修改 `state.js`，为真实规则错误补最小人工事件测试。
- 模型输入字段在`contracts/snapshot.js`的DTO白名单中声明；获取器布局变化只改`collector/snapshot-adapter.js`。Agent和分析核心只消费DTO，不导入获取器state或controller。网络与密钥留在后台，endpoint规则在`adapters/model-endpoint.js`。保留手动发送与数据范围选择。
- 状态、历史、游标与导出逻辑放在`collector/controller.js`，DOM展示在`overlay.js`；浏览器消息、存储和资源路径在`collector/browser-adapter.js`。端口可注入以便Node测试，视图和导出须保持复制隔离。
- 组合关系放在`apps/collector-app.js`和`apps/agent-app.js`；分析面板只接收快照函数和展示输入，不读取采集器内部布局。
- 界面变更核对桌面及窄窗口、拖动、收起和牌谱模式；不要用模拟页面宣称真实牌局已验证。
- 运行 `npm run check` 与 `npm test`，在PR中说明问题、变化和验证范围。
- 牌面由 `scripts/generate-tiles.mjs` 生成；修改生成器后运行 `npm run tiles`，不要加入游戏截图替代SVG。
- Agent编排修改`extension/agent.js`，执行预算与轨迹修改`extension/harness.js`，复盘与回归入口在`agent/`。保持模型传输和密钥在后台，不放进获取器。
- 分发变更修改`extension/profiles/agent.json`或`collector.json`，agent profile同步默认manifest。运行`npm run check`和`npm run build`，验证静态依赖、纯核心能力边界、资源闭包与加载顺序；获取器包不得包含分析/模型代码、设置页或模型权限。新增项目全局须同步`scripts/check-boundaries.mjs`，保持静态可追踪引用，不通过源码字符串替换生成安装变体。`npm run eval`只是人工向听回归，不替代真实牌谱或模型质量评估。

## 多语言介绍

模块方向与静态检查的适用范围见[可执行的模块边界](docs/DECOUPLING.md)。新增访问方式需同步检查规则和负例测试；静态检查不能全面证明运行时动态行为。

`README.md` 为简体中文主文档，`README.en.md` 为英文，`README.ja.md` 为日文。每份文件顶部提供互相切换的相对链接。修改功能、安装步骤、兼容范围或数据处理说明时，请同步三份文档；新增语言也请补齐所有语言入口。文档翻译不表示扩展界面或相应地区的游戏域名已经适配。

## 复现数据与许可

优先提交人工构造的最小事件。不要提交账号、会话、cookie、token、API Key、原始HAR/WS帧、浏览器配置、真实牌谱或第三方分析报告。即使插件导出做了字段筛选，也请逐项审查；对局手牌与弃牌本身仍可能敏感。

仅提交你有权以本项目MIT许可证分发的内容，并保留第三方许可证。参考项目的其他许可证不会自动变成MIT。
