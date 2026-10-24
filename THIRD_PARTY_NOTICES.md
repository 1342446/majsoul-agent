# 参考资料与资源说明

项目源码与当前原创SVG牌面使用 [MIT License](LICENSE)。Agent 扩展捆绑以下第三方运行库；不捆绑第三方字体文件或游戏资源。项目名称中的“雀魂 / Mahjong Soul”用于说明适用游戏，相关商标与游戏资产归各自权利人所有。本项目非官方，与游戏发行方及以下项目无隶属或合作关系。

## 分发的第三方代码

| 包 | 版本与版权 | 许可证与处理方式 |
| --- | --- | --- |
| [@earendil-works/pi-agent-core](https://github.com/earendil-works/pi/tree/v1.4.0/packages/agent) | 1.4.0；Copyright (c) 2025 Mario Zechner | MIT；真实 agent loop 打入 `pi-runtime.js`；完整文本见 [licenses/pi-LICENSE.txt](licenses/pi-LICENSE.txt) |
| [@earendil-works/pi-ai](https://github.com/earendil-works/pi/tree/v1.4.0/packages/ai) | 1.4.0；Copyright (c) 2025 Mario Zechner | MIT；仅打入 transcript、event-stream、identity、validation 等浏览器工具代码，排除 provider 与 Node credential store；许可证同上 |
| [TypeBox](https://github.com/sinclairzx81/typebox) | 1.3.27；Copyright (c) 2017-2026 Haydn Paterson | MIT；打入解释式 schema 校验等功能；完整文本见 [licenses/typebox-LICENSE.txt](licenses/typebox-LICENSE.txt) |

Pi 的 `typebox/compile` 在构建时以同版本 TypeBox `Value.Check` / `Value.Errors` 解释执行适配层替换，以满足 MV3 禁止动态代码的要求。补丁与构建方式见 [docs/pi-runtime.md](docs/pi-runtime.md)，固定来源及许可证校验值见 [licenses/SOURCES.md](licenses/SOURCES.md)。许可证目录随两个扩展包附带；collector 包不含上述运行库代码。

上述列表按 esbuild 最终输出中实际贡献字节的依赖审计。`partial-json` 等安装依赖经 tree shaking 后不进入扩展产物；esbuild 只在构建期间运行，不作为浏览器运行库分发。构建脚本会拒绝未审查的新分发依赖。

## 开发参考

开发时参考了以下公开资料。参考并不表示对方认可本项目，也不代表已验证当前客户端兼容性。

| 项目 | 参考用途 | 处理方式 |
| --- | --- | --- |
| [tzp1021/mj_helper](https://github.com/tzp1021/mj_helper) | CDP、WebSocket、协议解析与状态机分层思路；开源仓库文档组织 | 本项目使用浏览器扩展采集，未捆绑其Python决策代码、训练数据或报告 |
| [Avenshy/mahjong-helper-majsoul-mitmproxy](https://github.com/Avenshy/mahjong-helper-majsoul-mitmproxy) | Liqi消息封装和字段定义的研究参考 | 本项目实现最小wire reader，未捆绑其代码、proto文件或生成代码；其GPL-3.0代码不纳入本项目MIT授权 |
| [Avenshy/MajsoulMax](https://github.com/Avenshy/MajsoulMax) | 网页及桌面采集可行性线索 | 未捆绑其客户端修改逻辑 |
| [matttang27/majsoul-vision](https://github.com/matttang27/majsoul-vision) | 私密早期原型使用过其中的游戏牌面截图 | 授权范围未确认，公开历史的全部提交已移除旧PNG与旧ZIP，替换为本项目原创SVG |

本文件不是第三方素材的再授权。提交外部代码、图形或字体时，请同时提供原始来源、许可证与必要版权声明；无法确认分发权的内容不得加入。
