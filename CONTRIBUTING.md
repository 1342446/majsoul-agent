# 贡献指南

欢迎提交兼容性修复、状态机错误的最小复现、界面改进和文档完善。较大的功能请先在Issue中说明使用场景和验收方式。

## 本地开发

使用Node.js 22或更新版本；没有运行依赖和构建步骤，无需安装Python或启动调试端口。

```sh
git clone https://github.com/1342446/majsoul-observer-public.git
cd majsoul-observer-public
npm run check
npm test
```

在浏览器扩展管理页加载 `extension/`，源码变更后重新加载扩展并刷新游戏。离线演示可用任意本地静态服务器打开 `tests/preview.html`；演示只使用人工数据。

## 修改与验证

- 消息解析修改 `protocol.js`；采集兼容性修改 `capture.js`；状态规则修改 `state.js`，为真实规则错误补最小人工事件测试。
- 模型输入字段应在 `analysis.js` 的白名单合同中声明；网络和密钥处理留在后台。保留用户手动发送与数据范围选择。
- 界面变更核对桌面及窄窗口、拖动、收起和牌谱模式；不要用模拟页面宣称真实牌局已验证。
- 运行 `npm run check` 与 `npm test`，在PR中说明问题、变化和验证范围。
- 牌面由 `scripts/generate-tiles.mjs` 生成；修改生成器后运行 `npm run tiles`，不要加入游戏截图替代SVG。
- Agent编排修改`extension/agent.js`，执行预算与轨迹修改`extension/harness.js`，复盘与回归入口在`agent/`。保持模型传输和密钥在后台，不放进获取器。
- 分发变更运行`npm run build`，确认仅获取器包不含模型代码、设置页或模型主机权限。`npm run eval`只是人工向听回归，不替代真实牌谱或模型质量评估。

## 多语言介绍

`README.md` 为简体中文主文档，`README.en.md` 为英文，`README.ja.md` 为日文。每份文件顶部提供互相切换的相对链接。修改功能、安装步骤、兼容范围或数据处理说明时，请同步三份文档；新增语言也请补齐所有语言入口。文档翻译不表示扩展界面或相应地区的游戏域名已经适配。

## 复现数据与许可

优先提交人工构造的最小事件。不要提交账号、会话、cookie、token、API Key、原始HAR/WS帧、浏览器配置、真实牌谱或第三方分析报告。即使插件导出做了字段筛选，也请逐项审查；对局手牌与弃牌本身仍可能敏感。

仅提交你有权以本项目MIT许可证分发的内容，并保留第三方许可证。参考项目的其他许可证不会自动变成MIT。
