# Pi browser runtime

本项目固定使用 npm `@earendil-works/pi-agent-core@1.4.0`（2026-10-24 查询的最新发行版），上游仓库为 <https://github.com/earendil-works/pi>。`pi-ai@1.4.0` 是其锁定的传递依赖。实际 agent loop、工具声明、参数校验、工具执行与事件由上游 `runAgentLoop` 实现。

`node scripts/bundle-pi-runtime.mjs` 生成本地 classic-worker IIFE `extension/pi-runtime.js`，公开 `MJPiRuntime.run(options)`。源码入口为 `scripts/pi-runtime-entry.mjs`。产物不需要 Node、不加载远端代码、不使用 eval 或动态 Function。构建检查依赖图和禁用语法；测试在禁止字符串代码生成的 VM 中实际执行工具循环。

首次运行或锁文件更新后先执行 `npm ci`。`npm run build` 自动重建并审计 Pi bundle，然后打包两个 profile；`npm run check` 在内存中重建并验证已提交 bundle 与源码一致（忽略 Git 平台换行差异），不修改产物。`npm run pi:bundle` 可单独更新 bundle，需随源码提交。CI 在 check/test/build 前执行 `npm ci`；普通架构和 profile 测试直接使用已提交 bundle，无须现场安装或加载 esbuild。

## 浏览器兼容处理

上游 `pi-ai` 根入口还公开 credential store 和 provider discovery；MV3 不需要这些 Node 能力。构建时仅将裸 `@earendil-works/pi-ai` 导入重定向到 `scripts/pi-ai-browser.mjs`，该文件转出上游 transcript、event-stream、identity、validation 和 json-parse 模块，不替换其实现。`pi-ai` 子路径导入保持原样。唯一行为补丁是把 `typebox/compile` 重定向到 `scripts/pi-schema-interpreter.mjs`：以同版本 TypeBox 的 `Value.Check` / `Value.Errors` 解释执行代替动态编译。上游参数规范化与校验错误格式保留。升级 Pi 或 TypeBox 时须重跑构建及 CSP 测试。

## Host contract

`run({messages, systemPrompt, tools, transport, model, signal, budget, onEvent})` 返回 `{messages, assistant, text, usage, turns, toolCalls, stopReason}`。宿主提供凭据、网络权限和工具白名单；本模块没有网络或存储权限。

工具结构为 `{name, label?, description, parameters, execute}`。`parameters` 为 JSON Schema；`execute(id, args, signal, onUpdate)` 返回 `{content:[{type:'text',text}], details?, isError?}`。未知工具和参数不合法时，上游产生 `isError:true` 工具结果，不调用执行函数。

`transport({model,messages,systemPrompt,tools,signal,maxTokens,finalTurn})` 可以返回字符串，或 `{text,toolCalls:[{id,name,arguments}],usage?,stopReason?}`，也接受原生 Pi assistant `content`。工具参数必须为解析后的对象。无工具模式只请求一次，返回原文本，兼容旧 JSON API。

`messages` 使用 Pi 的结构：`system.content` 是字符串；user 可使用文本或内容数组；assistant 的 `content` 含 `{type:'text',text}` 与 `{type:'toolCall',id,name,arguments}`；toolResult 使用 `{role:'toolResult',toolCallId,toolName,content:[{type:'text',text}],isError}`。system 中可能含 `toolsAdded`/`toolsRemoved`；transport 应使用请求顶层 `tools` 中的当前声明。宿主转换为 OpenAI 时须保留 assistant tool calls 及匹配的 tool result ID，不能把它们当作普通 user 消息。

预算字段：`maxTurns`（默认 6，上限 20）、`maxToolCalls`（12 / 60）、`maxTokens`（16000 / 200000）、`timeoutMs`（60000 / 300000）。模型请求和工具收到同一个 AbortSignal；忽略取消的 Promise 也不会阻塞 run 返回。最后一个模型请求含 `finalTurn:true` 且 `tools:[]`，宿主应要求模型直接输出最终答案；若模型仍请求工具，模块以 `TURN_BUDGET` 终止且不执行工具。token 预算依赖 transport 提供准确 usage；返回超预算结果会在工具执行前拒绝，无法撤销模型服务端已经使用的 token。

collector profile 不应导入或打包 `pi-runtime.js`；仅 Agent worker 可加载该产物。
