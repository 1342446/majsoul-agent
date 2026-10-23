# Majsoul Agent：Agent、harness与获取器

0.4.0整合0.3.0已实现的危险牌、牌效率、综合攻守任务，不重写其本地算法和结构化合同。第一阶段服务于局面分析和复盘。

## 三个边界

| 组件 | 职责 | 实现 |
| --- | --- | --- |
| Collector | 旁路采集、归一化、状态推导、面板、历史与JSON导出 | `protocol.js`、`capture.js`、`state.js`、`history.js`、`collector/controller.js`、`collector/browser-adapter.js`、`overlay.js` |
| Agent | 按任务制定固定工具计划，连接本地证据、模型解释和结果校验 | `extension/agent.js`，复用`analysis.js`与`mahjong-analysis.js` |
| Harness | 工具注册校验、执行预算、取消、超时、运行轨迹；提供离线复盘与回归评测入口 | `extension/harness.js`、`agent/review.cjs`、`agent/eval.cjs` |

```mermaid
flowchart LR
  Game[游戏已下发数据] --> Collector[独立获取器]
  Collector --> Export[JSON导出]
  Export --> Review[离线复盘CLI]
  Collector --> Snapshot[用户选择的授权快照]
  Snapshot --> Agent[Agent固定计划]
  Agent --> Harness[Harness执行已注册工具]
  Harness --> Local[本地向听/进张/防守特征]
  Harness --> Model[模型解释]
  Model --> Validate[合同与合法性校验]
  Validate --> Panel[结果与运行记录]
  Review --> Local
```

当前是有界分析Agent的基础版本：计划固定为快照校验、分析准备、模型解释、结果校验；本地复盘只执行前两步。模型不自行选择工具，不执行任意代码，也没有多轮规划、自我修正或自动打牌。工具边界已经独立，可在后续有明确评测用例时再扩展。

## 执行规则

标准输入是`contracts/snapshot.js`定义的`mj-analysis-v1` DTO，合同同时负责牌面规范化与逐字段白名单。Agent直接使用合同，不依赖获取器state或浏览器API；陌生采集器可直接提供相同DTO。`collector/snapshot-adapter.js`独立负责获取器state与用户授权范围的映射。`analysis.js`只处理任务、提示词、本地计算准备和结果解析；endpoint与权限模式在`adapters/model-endpoint.js`。自家手牌默认不发，对手暗牌和未知字段不进入分析输入。

controller持有实时、牌谱、历史和游标，通过注入端口取得存储、时钟、ID和hash；视图与导出为复制数据。`overlay.js`只展示视图并调用controller命令。`apps/collector-app.js`组合独立获取器；`apps/agent-app.js`额外挂载分析面板，传入`snapshot(selection)`函数、座位标签、阶段、局数及游标上下文。分析面板不读取采集器内部布局。销毁时取消在途模型、使准备和模型响应失效；重新挂载重新绑定监听并读取配置。

- 执行前核对完整计划中每个工具是否注册；默认预算6步，最多允许16步。当前在线计划实际为4步。
- 默认25秒，允许的最长预算60秒；取消或超时后不执行后续工具，忽略晚到结果。同步计算不能被JavaScript定时器强制抢占，本地算法自身保留计算边界与缓存。
- `background.js`仍负责扩展身份、主机权限、配置和API密钥。Agent只接收授权快照与注入的模型传输函数，不读取密钥或任意文件。
- 每次执行先复制并清洗输入；本地计算和提示词使用同一份快照。界面继续使用既有指纹标记旧局面结果。
- `majsoul-run-v1`轨迹只记录工具名、状态和相对耗时。不写入牌局原文、模型原文、密钥、请求地址或任意错误文本。成功运行可在面板查看轨迹；失败和取消轨迹由harness附在异常上，当前界面仍显示简短错误。

## 两种安装方式

```sh
npm run build
python scripts/package-public.py
```

前者使用`extension/profiles/agent.json`和`collector.json`，在`dist/`生成`majsoul-agent-0.4.0/`和`majsoul-collector-0.4.0/`；后者先检查和测试，再生成完整源码、两种安装ZIP和SHA-256文件。获取器只含必要的采集、状态、历史、展示代码与原创牌面。其后台仅处理历史记录，没有模型监听器、分析模块、设置页或可选模型主机权限。

构建按各profile的资源依赖闭包复制文件，不对共享UI做字符串替换。默认`extension/manifest.json`与agent profile一致。`npm run check`验证静态模块边界、纯核心不访问浏览器能力、资源完整性及加载顺序；collector闭包不能引入分析或模型文件。新增模块需同步显式入口与静态依赖规则。

视图仅暴露回放记录数量与有限的最近事件，完整记录通过导出获取；UI每次渲染只读取一次复制视图。具体依赖规则和静态检查局限见[可执行的模块边界](DECOUPLING.md)。

同一页面只启用一个版本，避免重复观察连接。两种扩展存储独立。当前的独立集成方式是JSON导出与离线复盘，尚未提供外部HTTP服务、MCP服务器或跨扩展实时RPC。

## 复盘与评测

```sh
npm run review -- observation.json --seat 0 --hand --cursor 12
npm run review -- observation.json --task danger
npm run eval
```

复盘CLI的输入边界接受获取器导出的`mj-observer-v1`对象，重建所选局面后通过`collector/snapshot-adapter.js`转为标准DTO交给Agent。牌谱模式只应用游标前的事件，不使用导出对象里的最终状态推测过去；自家手牌默认不参与，需显式`--hand`。实时模式使用导出时的局面，不从可能截断的最近事件列表伪造完整回放。Agent本身只消费DTO。CLI只计算本地结果，不调用模型，输出`majsoul-review-v1`。

`npm run eval`运行3个人工向听样例，通过同一Agent与harness输出`majsoul-eval-v1`报告；失败时进程返回非零。它是执行链与本地结果的回归检查，不是模型牌力评估。新分发组合的浏览器模拟验收见[验证记录](../VALIDATION.md)；真实牌谱集、逐动作标注、模型质量与实战表现仍待补充。
