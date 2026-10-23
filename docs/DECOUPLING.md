# 可执行的模块边界（0.4.0）

`extension/profiles/agent.json` 与 `collector.json` 是两个独立、完整的 Chrome manifest。构建器直接读取各自入口，不从 Agent 文件清单删除模块生成 Collector。`extension/manifest.json` 保持可直接加载的 Agent 配置；检查会拒绝它与 Agent profile 的任何漂移。

## 组合与依赖方向

- `apps/agent-app.js` 组合获取器、独立悬浮分析卡、局面DTO适配器和手牌标记；`apps/collector-app.js` 只组合获取器与显示面板。两者分别启动应用，分析卡不再挂在获取器的扩展槽内。
- `collector/controller.js` 管理状态、记录和回放，接收存储、时钟、哈希等端口；`collector/browser-adapter.js` 提供 Chrome、页面事件和浏览器存储端口。`overlay.js` 负责显示和用户输入。
- `contracts/snapshot.js` 定义清洗后的分析输入；`collector/snapshot-adapter.js` 将获取器状态投影为该合同。`analysis-panel.js` 接收 snapshot 函数、座位标签和局面标识，不持有获取器状态机。
- `agent.js` 仅依赖合同、分析算法和通用执行器；`harness.js` 不认识项目业务模块。HTTP 和权限地址规则在 `adapters/model-endpoint.js`，Chrome 设置与请求执行由 `background.js` 和设置页组装。
- 获取器内部、浏览器适配器与获取器显示层禁止依赖模型 endpoint、Agent、harness 和分析模块。分析面板禁止直接依赖 Agent。合同、Agent、分析算法、执行器和获取器核心禁止使用 DOM、Chrome、网络及浏览器存储能力。

`floating-panel.js` 只处理通用界面行为，不读取业务模块。`hand-hints.js` 只接收手牌、摸牌、建议与逐对手风险的展示数据，用手动校准映射Canvas位置，不访问controller或Agent。组合入口同步订阅controller，让分析面板在每次局面变化时立即清除不匹配的标记；获取器仍独立节流刷新。当前局面、发送范围、任务和视图上下文共同判断结果是否过期，历史／牌谱结果不能标记实时手牌。标记模块不加入Collector依赖闭包，也不改变手牌外发授权。

本地预览的分析面板会使用 `MJAnalysis.prepare`，因此 Agent content scripts 明确加载合同、本地算法和分析模块；Agent 执行器仍只由后台加载。Collector 的资源闭包不含分析模块、模型地址适配器和设置页。

## 构建与验证

运行 `npm run check`、`npm test`、`npm run build`。检查递归覆盖 `extension` 子目录。公开源码包按既有顶层白名单递归收录新增模块，拒绝其中嵌套的 `.git`、`research`、`node_modules` 和 `dist`。

`scripts/check-boundaries.mjs` 提供受控项目 global 到源文件的 provider 表，并分析静态 `require`、`import`、`export ... from`、`importScripts` 和浏览器 global 名称。词法扫描跳过注释、字符串、正则文本及 template 文本，扫描 template 的表达式。对受限核心禁止计算形式的 global 访问、`eval`、`Function`，拒绝动态模块路径和未知 `MJ...` 项目 global。新增模块必须显式登记 provider 和允许方向。

构建器从每个 profile 的 content scripts、worker、设置 HTML、HTML 资源与 web-accessible resources 解析依赖闭包，仅复制该闭包。每个 content script 隔离组和设置页面独立检查依赖加载顺序；classic worker 按实际静态 `importScripts` 顺序递归检查。构建前验证源文件，复制后重新验证资源、依赖和顺序。版本保持 `0.4.0`。

`tests/architecture-boundaries.test.js` 用违规代码注入验证依赖方向、浏览器能力、动态路径、未知 global、加载顺序、缺失传递资源和默认 manifest 漂移均被拒绝。`tests/build-profiles.test.js` 检查 Collector 实际闭包排除模型文件，Agent 保留相应能力。

这些是针对当前代码约定的静态约束，不是完整 JavaScript parser，也不能全面证明运行时动态依赖。别名、反射、原型和新语法可能超出检查范围；新写法需要增加规则及负例测试，运行时行为仍需测试和浏览器验收。
