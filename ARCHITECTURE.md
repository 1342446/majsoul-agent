# 项目架构

0.4.0以 **Majsoul Agent** 为整体名称，提供完整版与独立牌局获取器。`extension/agent.js`复用0.3.0分析能力编排任务，`extension/harness.js`负责有界执行、取消和脱敏轨迹；`agent/`提供离线复盘与回归评测。完整说明见 [Agent与harness](docs/AGENT.md)。

这是无第三方运行依赖的 Manifest V3 扩展。`extension/` 可直接加载完整版；`npm run build` 根据显式profiles生成完整版和独立获取器。采集器、标准数据合同、Agent、UI和网络访问通过组合入口接线。

## 目录与职责

| 文件 / 目录 | 职责 | 运行位置 |
| --- | --- | --- |
| `extension/manifest.json` | 加载顺序、执行世界、可选主机授权、后台与设置入口 | 浏览器 |
| `extension/protocol.js` | 最小 Protobuf reader、Liqi 帧与牌局消息归一化 | MAIN / Node 测试 |
| `extension/capture.js` | WebSocket、既有牌谱下载的旁路观察，过滤非牌局数据 | 游戏 MAIN 世界 |
| `extension/state.js` | 纯状态转换、座风、手牌布局、宝牌和立直推导 | ISOLATED / Node 测试 |
| `extension/history.js` | 整场与各局记录、快照整理 | ISOLATED / 后台 |
| `extension/history-storage.js` | 整场记录的本地存储消息处理，与模型配置分键保存 | 扩展 Service Worker |
| `extension/collector/controller.js` | 实时与牌谱状态、游标、历史、订阅、命令和独立导出 | 纯核心 / Node |
| `extension/collector/browser-adapter.js` | 页面桥接校验、去重、浏览器存储和资源路径端口 | ISOLATED 世界 |
| `extension/overlay.js` | 默认收起的独立获取器、controller视图、命令绑定与刷新节流 | ISOLATED 世界 |
| `extension/floating-panel.js` | 通用拖动、折叠、位置记忆与视窗约束，不认识采集或分析业务 | ISOLATED 世界 |
| `extension/hand-hints.js` | 独立手动校准、Canvas几何映射、建议与高危标记，不读取controller或请求模型 | ISOLATED / Node 测试 |
| `extension/contracts/snapshot.js` | 标准授权DTO白名单、牌面规范化和标签 | 纯合同 / Node |
| `extension/collector/snapshot-adapter.js` | 获取器state与用户选择转换为标准DTO | 纯输入适配 / Node |
| `extension/apps/collector-app.js` / `agent-app.js` | 创建端口、controller和UI；完整版注入快照适配及分析面板 | 组合入口 |
| `extension/profiles/agent.json` / `collector.json` | 两种安装配置的脚本顺序、后台、权限和资源入口 | 构建输入 |
| `extension/mahjong-analysis.js` | 向听、形状进张、已见牌计数和逐对手防守特征 | ISOLATED / 后台 / Node 测试 |
| `extension/analysis.js` | 标准快照的任务准备、提示词、本地计算准备、JSON Schema和结果校验 | 后台 / 离线预览 / Node |
| `extension/adapters/model-endpoint.js` | 模型地址校验与主机权限模式 | 后台 / 设置 / Node |
| `extension/analysis-panel.js` | 数据范围与任务选择、发送预览、结构化牌面建议、本地效率表和过期提示 | ISOLATED 世界 |
| `extension/analysis-panel.css` | 分析卡样式，通过扩展本地资源载入Shadow DOM | 扩展静态资源 |
| `extension/background.js` | 身份校验、读取配置、验证授权、添加密钥、调用模型、取消与超时 | 扩展 Service Worker |
| `extension/agent.js` | 任务计划、已授权快照、本地分析和模型解释工具接线 | 后台 / Node |
| `extension/adapters/mjai.js` | 授权事件前缀转 mjai、匿名化、对手暗牌遮蔽及协议白名单 | 纯输入适配 / Node |
| `extension/contracts/engine-result.js` / `engine-agent.js` | 可选引擎输出白名单、快照与事件重放对照、合法动作验证和有界流程 | 后台 / Node |
| `extension/harness.js` | 工具注册、步数与时间预算、取消、无内容运行轨迹 | 后台 / Node |
| `extension/collector-background.js` | 独立获取器的历史存储后台，无模型功能 | Collector Service Worker |
| `agent/review.cjs` / `agent/eval.cjs` | 按游标的本地复盘、人工回归报告 | Node CLI |
| `agent/mjai-process.cjs` / `mjai-python-wrapper.py` | 可信用户进程的单次 JSONL 调用；Python 包装用户 Bot，不包含模型 | 本机 Node / Python |
| `agent/engine-server.cjs` / `engine-review.cjs` | 可选本机 HTTP 桥接与导出事件协议复盘 | Node CLI |
| `scripts/check-boundaries.mjs` | 静态依赖白名单及纯核心能力边界检查 | Node |
| `scripts/build-extensions.mjs` | 按profiles追踪资源闭包、验证加载顺序、复制安装目录 | Node |
| `extension/options.html/js/css` | 开关、接口、模型、密钥；主机权限申请、保存与清除 | 扩展设置页 |
| `extension/tiles/` | 本地牌面资源 | 扩展静态资源 |
| `tests/` | Node 协议、采集、状态、分析测试与离线浏览器预览 | 本地 |
| `research/` | 调研记录与被 Git 忽略的本地验证证据 | 开发使用 |
| `dist/` | 可解压安装的版本包 | 分发使用 |

## 数据流

```mermaid
flowchart TD
  Game[既有 WebSocket / 牌谱下载] --> Capture[capture.js 旁路观察]
  Capture --> Protocol[protocol.js 归一化]
  Protocol --> Bridge[window.postMessage 仅牌局字段]
  Bridge --> Browser[collector/browser-adapter.js 校验 / 去重]
  Browser --> Controller[collector/controller.js 状态 / 游标 / 历史]
  Controller --> State[state.js 纯状态转换]
  Controller --> UI[overlay.js 采集面板]
  State --> History[history.js 结算快照 / 分场归档]
  History --> HistoryWorker[history-storage.js 校验 / 串行存储]
  HistoryWorker --> HistoryStorage[扩展本地 roundHistoryV1]
  HistoryStorage --> HistoryUI[整场列表 / 历史快照查看]
  HistoryUI --> UI
  Controller --> Adapter[collector/snapshot-adapter.js]
  Adapter --> Contract[contracts/snapshot.js 授权 DTO]
  Contract --> Panel[analysis-panel.js 预览 / 手动发送]
  Options[设置页 开关 / 地址 / 密钥] --> Storage[扩展本地存储]
  Panel --> Worker[background.js 校验与请求]
  Storage --> Worker
  Worker --> Agent[agent.js / harness.js → analysis.js]
  Worker --> Provider[用户指定的模型接口]
  Provider --> Worker
  Worker --> Result[逐对手风险 / 本地效率表 / 过期标记]
```

MAIN 中的采集器仅观察已有通信，不主动获取牌谱，不调用游戏出牌接口。桥接数据不作为可信来源；模型消息不复用页面的 `postMessage` 通道。

controller独立于DOM和浏览器API；存储、时钟、ID和hash通过端口注入。实时数据和牌谱数据分别维护，牌谱只分析当前游标的状态。`getView()`和导出返回复制数据，UI修改不会改变内部状态。视图仅提供回放记录数量`recordCount`与有限的`recentEvents`供UI使用，完整记录留在controller和导出边界；`overlay.js`每次渲染只读取一次视图，通过controller命令操作。

`apps/collector-app.js`组装独立获取器；`apps/agent-app.js`在同一采集面板的扩展槽中挂载分析UI，传入`analysisView={snapshot(selection), seatLabels, phase, round}`与游标上下文。分析面板不读取采集器state布局，不导入采集器adapter；它保持授权选择和请求状态，通过快照指纹识别旧结果。销毁组合入口会断开桥接和订阅，并使分析面板的在途响应失效；重新挂载重新读取配置。

## 可选引擎数据流

LLM 分析与解释保持主要定位，默认 `chat` 且分析关闭。设置分别保留 `chat` 与 `mjai` 一份配置，一次只使用所选后端；不会自动串联 LLM 和引擎。Mortal/mjai 是自备模型的可选适配，不增加独立获取器的依赖或权限。

组合入口提供授权观察的本局连续事件，由 `adapters/mjai.js` 转换为 `majsoul-mjai-v1`：`start_game`、13张 `start_kyoku` 与游标前事件；玩家名匿名化，对手手牌/摸牌遮蔽。后台 `engine-agent.js` 执行 `request.validate → engine.infer → engine.validate`，只依赖净化 DTO，重放自家手牌并对照局数、点数、供托、宝牌、有序公开牌河及立直状态。原始获取器 state 不进入引擎 Agent。

扩展经带 Bearer Token 的本机 `/analyze` 调用 `engine-server.cjs`，后者由 `mjai-process.cjs` 启动用户配置的进程，写入一行完整事件数组，读取单行动作并清理进程。Python 包装器调用用户零参数 Bot 类的 `react(events_json)`，用户模块自行加载权重和依赖。命令不是沙箱；不捆绑上游运行环境或权重，上游许可另行适用。此服务默认不启动，不接受由页面指定执行命令。

页面初版仅接受完整无副露四麻的合法 `dahai`、`reach` 意向及 `none`，自家14张开局记录和其他动作明确拒绝。无法确定立直弃牌时不输出具体牌；无可靠 Q 索引映射时候选为空，Q 值不作为放铳概率或危险牌依据。`engine:review` 从事件前缀重建快照，复用同一 Agent 的完整一致性与动作校验，输出 `engine/result/localAnalysis/trace`。HTTP 服务全局只运行一次推理，忙时429且不排队，断开后等待取消清理完成才释放。完整协议与命令见 [docs/MJAI.md](docs/MJAI.md)。真实模型权重及牌力未验证。

## 历史记录边界

`history.js` 逐字段整理结算快照，实时与牌谱分场保存，按局数和本场去重；下一局开局可补齐上一局未知点数。历史快照独立于当前状态，查看记录不会移动牌谱游标或停止实时采集。当前未使用稳定游戏ID，刷新或断线后可能将同一场分段。

`history:load` / `history:save` 由后台的 `history-storage.js` 处理，限制同扩展、指定游戏origin与顶层frame；通过队列串行读改写，使用独立的 `roundHistoryV1` 键，不读取或返回模型配置。保留最近20场、每场最多100局，并按约4MiB总量淘汰最旧场次。离线预览仅使用独立localStorage键，不与真实扩展共享记录。

## 模型模块边界

标准授权DTO保持 `mj-analysis-v1`。`collector/snapshot-adapter.js`知道获取器state布局，按选择生成DTO；`contracts/snapshot.js`负责独立白名单和规范化。Agent直接调用合同的`cleanSnapshot()`，不认识获取器state、controller或DOM；其他采集器只需提供同样的DTO。`analysis.js`的`prepare()`生成外发 `mj-analysis-v2`。任务为 `danger`、`efficiency`、`combined`，兼容旧 `discard` / `both`。防守使用有序牌河及 nullable 手摸切；效率只使用自家手牌、副露和已授权已见牌统计；综合任务通过一次模型请求组合两模块输入和提示词。

`MJMahjongAnalysis.analyze()` 仅接收清洗后的快照。`localAnalysis` 按任务挑选防守或效率结果；后台忽略页面消息自带的本地计算字段，重新计算。算法和合同采用有界缓存，预览通过 `model:prepare` 在后台异步计算，避免界面刷新阻塞游戏线程。后台请求和预览共用 `prepare()` 的真实数据。普通型、七对子、国士向听及有效牌由本地计算，未见枚数为上界，模型只作解释。

输出经固定 JSON Schema 和本地严格解析校验，兼容 JSON 代码围栏，无需服务商支持 `response_format`。检查任务、合法候选、逐对手风险、现物证据及无内容结果；13 张、立直摸牌未知、手牌非法或已结算时禁止具体弃牌建议。未知手摸切保留 `null`，协议已确认的默认 `false` 仍为手切。界面转义文本，仅加载本地 SVG 牌面；任务、取消或配置变更使在途响应失效，防止旧结果回填。

- **数据合同**：`mj-analysis-v1` 包含来源、完整性、阶段、自家座位、最近动作序号和有限的采集警告。可选的 `game` 不含手牌和牌河；`rivers` 仅含所选座位的弃牌及摸切、立直、已鸣标记；`selfHand` 仅含已选自家的手牌。显式逐字段拷贝，避免扩展局面对象时顺带外发账号或对手暗牌。
- **凭据**：`modelConfig` 由设置页保存到 `chrome.storage.local`，后台将访问级别限制为 `TRUSTED_CONTEXTS`。内容脚本通过 `model:status` 仅取得开关和模型名称。设置回到游戏时刷新状态，也可手动刷新；即使面板状态过时，后台仍重新检查开关与授权。
- **授权**：manifest 只声明可选主机范围，设置页在用户点击保存时申请配置的主机。允许 HTTPS 和 HTTP loopback；拒绝 URL 用户信息、查询和片段。目标端口保留在实际请求地址中，授权模式遵循浏览器按主机匹配的规则。
- **消息**：`model:settings` 打开设置，`model:status` 查询状态，`model:analyze` 发送当前快照与任务，`model:cancel` 取消当前标签页的请求。后台只接受同扩展、指定游戏 URL、顶层 frame 的调用，不接受任意请求地址或密钥参数。
- **网络**：单标签页最多一个请求；25秒超时；拒绝重定向、不携带浏览器 cookies；请求快照上限60000字符，响应上限1MiB，展示上限16000字符。关闭、修改或清除设置会取消进行中的请求。
- **展示**：模型文本进行 HTML 转义，不执行模型输出的 HTML、脚本或链接。模型只作建议，不参与状态更新或出牌。

## 变更与验证

协议变更修改 `protocol.js` 并补人工协议帧；采集兼容性修改 `capture.js`；局面规则和推导修改 `state.js`。新增发送字段应先修改 `contracts/snapshot.js` 的显式合同和测试，再修改需要该字段的输入adapter；新模型协议应在后台适配，不将密钥或网络调用移入页面脚本。

`npm run check`检查源码语法、依赖白名单、纯核心禁止浏览器能力及profiles。构建从显式入口追踪脚本和页面资源闭包，验证内容脚本、worker和设置页的加载顺序；agent profile须与默认manifest一致，collector闭包不得包含分析或模型文件。检查器支持本项目的静态引用，不是通用JavaScript解析器；新增项目全局或加载方式需同步检查规则。两个安装目录由依赖闭包复制生成，不修改共享UI源码。

检查规则、依赖方向和静态扫描局限见[可执行的模块边界](docs/DECOUPLING.md)。

运行 `npm test`。分析测试通过 VM 中的模拟 Chrome API 和模拟 HTTP 响应覆盖开关、授权、身份、请求、错误与取消，不连接真实模型。`tests/preview.html` 用于离线界面验证，不代表真实协议采集或模型正确率。版本验证记录见 `VALIDATION.md`。
