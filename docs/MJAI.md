# 可选 mjai 本地引擎适配

项目仍以用户自选 LLM 的局面分析与解释为主要用途。`mjai` 是可选后端，默认选择 `chat`，分析默认关闭；Mortal 只是可能接入的上游之一，不是内置或默认引擎。设置页分别保留一份 `chat` 与 `mjai` 配置，保存时选择其中一种生效，一次请求不会同时调用两者，也不会把引擎输出再发送给 LLM。

浏览器扩展与独立获取器没有第三方运行依赖。以下本地引擎工具需要 Node.js 22+；使用 Python 包装器时还需 Python 3，以及用户自行安装的上游模块、推理依赖和模型权重。本项目不捆绑、下载或训练权重，没有完成真实 Mortal/Akagi 权重推理验证。上游代码、模型及数据各自的许可证和使用条件另行适用。

## 先准备能加载模型的 Bot

`agent/mjai-python-wrapper.py` 适配一个用户提供的 Python 模块：模块导出可零参数构造的 `Bot` 类（可用 `--class` 修改类名），由该类自行初始化运行环境并加载权重。包装器调用一次 `bot.react(events_json)`；参数是整个事件数组的 JSON 字符串，返回值应为 mjai 动作字典或该字典的 JSON 字符串。

这不表示任意上游 `bot.py` 都可直接运行。如果现有 Bot 需要构造参数、异步方法、不同的 `react` 签名或另行加载权重，应先自行提供上述接口的适配类。命令和模块以当前工作目录运行，不自动切换到配置文件目录；建议使用绝对路径。

```sh
python agent/mjai-python-wrapper.py --help
```

例如将自己的适配模块保存为 `D:/my-engine/my_mjai_bot.py`，并准备 `runtime.json`：

```json
{
  "command": "python",
  "args": [
    "D:/majsoul-ai-analysis-and-review-agent/agent/mjai-python-wrapper.py",
    "--module-dir", "D:/my-engine",
    "--module", "my_mjai_bot",
    "--class", "Bot"
  ],
  "timeoutMs": 15000,
  "maxOutputBytes": 65536,
  "maxInputBytes": 2097152
}
```

以上路径均需替换为本机实际路径；`my_mjai_bot` 是用户模块示例名，不是本项目提供的模型。依赖和权重由该模块管理。配置中的 `command` 与 `args` 是本机程序执行权限，**不是沙箱**；虽然以 `shell:false` 启动，仍会执行所配置程序及导入模块的任意代码，只应使用可信配置和模块。

## JSONL 进程协议

每次推理都会启动一个新进程，不复用模型状态。Node runner 在 stdin 写入 **一行 JSON 事件数组加换行**，随后关闭 stdin；不是逐事件多行，也不是 HTTP 请求外层对象：

```text
[{"type":"start_game","id":0,"names":["Player 0","Player 1","Player 2","Player 3"]},{"type":"start_kyoku",...},{"type":"tsumo","actor":0,"pai":"9p"}]
```

上行仅示意数组形状，`...` 不是有效 JSON；真实内容由适配器生成，包含完整开局字段与从本局开局到当前游标的连续事件。上游必须基于这一批事件重建状态并返回当前动作。数牌使用 `1m` 至 `9s`，赤五使用 `5mr/5pr/5sr`，字牌为 `E/S/W/N/P/F/C`。

stdout 必须仅输出一行动作 JSON，并以换行结束；不要输出 `{ "action": ... }` 外层包装：

```json
{"type":"dahai","actor":0,"pai":"9p","tsumogiri":true}
```

日志应写 stderr。runner 收到第一行完整响应后结束并清理进程；超时、取消、异常退出、响应超限或非 JSON 响应会失败。默认进程预算15秒，stdout 与 stderr 的累计限额64KiB，进程输入和 HTTP 请求体限额2MiB；mjai DTO 还受256KiB序列化长度限制。浏览器 Agent 整体预算25秒，调大进程超时不会延长浏览器预算。每次重新加载大模型的成本可能导致超时，当前没有常驻模型服务池。

Python 包装器把模块初始化和 `react` 中的 stdout 调试输出重定向到 stderr；输出只保留动作字段，删除上游 metadata/Q 值。它不是权限隔离机制。自写其他 JSONL 进程也可接入，但同样必须遵守这些约定。

## 本地桥接与扩展设置

在仓库根目录执行：

```sh
npm run engine:serve -- --config runtime.json --port 17341
```

服务只监听 `127.0.0.1`，显示 `/analyze` 地址和随机 Bearer Token。也可通过环境变量 `MJAI_ENGINE_TOKEN` 或 `--token` 指定 Token；命令行参数可能进入终端历史，不要公开服务输出或凭据。服务全局同时只运行一次推理，忙时返回 HTTP 429，不排队；客户端断开后先取消并清理进程，推理结束后才释放执行槽位。

在完整版“模型设置”选择 `mjai`，填写 `http://127.0.0.1:17341/analyze` 和该 Token，手动开启分析、保存并授予本地主机权限。切换回 `chat` 时可恢复已保存的聊天模型配置；点击关闭会关闭分析，清除会移除两种后端的配置与凭据。仅获取器版没有这些入口，也不包含引擎适配或网络权限。

页面使用时需要授权对局信息、四家牌河及自家手牌，确认自家座位，选择“综合攻守”，预览真实的 `majsoul-mjai-v1` 请求后手动分析。HTTP `POST /analyze` 接收 `{format,seat,events}`，返回 `{action: <mjai动作>}`；Token 由扩展后台加入 Authorization，不进入页面桥接或牌局导出。

## 导出事件的协议复盘

```sh
npm run engine:review -- observation.json --config runtime.json --seat 0 --hand --cursor 12
```

输入为获取器导出的 `mj-observer-v1` JSON，`--hand` 必须显式授权，座位0至3。牌谱 `--cursor N` 仅使用前 N 条记录，禁止游标后的未来事件；实时导出省略 `--cursor`。缺少本局开局或连续事件时拒绝，不能从结算历史快照或截断事件伪造回放。

此 CLI 从指定游标重建快照，通过同一个 `EngineAgent.run` 执行快照/事件一致性对照、用户进程推理及最终动作合同校验。输出 `majsoul-engine-review-v1`，包含 `engine`、兼容分析结果的 `result`、`localAnalysis` 与脱敏 `trace`，不直接透传上游原始动作或文本。它同样受完整无副露四麻及支持动作的限制，不自动执行游戏操作。原有 `npm run review` 仍只做本地确定性计算，不启动外部引擎。

## 当前支持范围与数据边界

- 页面 Agent 仅支持完整、进行中、无副露的四人对局。自家必须有明确可验证手牌、摸牌、四家有序牌河和对局信息；副露、杠、三麻、已结束局面及信息缺口明确拒绝。自家14张开局记录无法可靠区分庄家摸牌，适配器明确拒绝，不猜测拆牌。
- 适配器生成 `start_game` 和13张 `start_kyoku` 后的事件流。玩家名匿名化，对手开局手牌和摸牌统一为 `?`；牌谱即使保存四家手牌，也不会向此引擎发送对手暗牌。严格白名单拒绝未知字段和额外私人数据。
- Agent 重放自家手牌，检查摸打轮转、立直成立顺序，并对照快照的局数、本场、供托、点数、宝牌、公开有序牌河及立直状态。不从 collector 内部状态或未来事件补全缺失信息。
- 页面只接受验证通过的 `dahai`、`reach`、`none`。弃牌须来自当前手牌和本地合法候选；立直后仅允许确认的摸切。`reach` 只显示立直意向，尚未确定弃牌时 `tile:null`。吃、碰、杠、和牌等动作不受支持，不自动执行任何操作。
- Q 值是策略分数，不是放铳概率。没有可验证的固定动作索引映射时 `candidates` 为空；不会对 Q 值做 softmax 后冒充概率，也不会据此生成危险牌。非有限值、非法动作和超大响应拒绝。
- harness 只记录工具名、状态和耗时，不记录牌局载荷、原始输出或密钥。Token 保存在扩展本地存储，与聊天 API Key 一样不是加密保险箱。

当前验证基于人工事件、模拟进程与 HTTP 服务，不证明真实游戏整场兼容性、真实模型加载能力或牌力。模型可能在 Agent 尚不支持的动作中选出最优动作，此时明确失败，不擅自替换成另一个动作。运行与数据风险另见 [SECURITY.md](../SECURITY.md)，验证记录见 [VALIDATION.md](../VALIDATION.md)。
