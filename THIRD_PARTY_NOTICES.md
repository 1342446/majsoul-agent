# 参考资料与资源说明

项目源码与当前原创SVG牌面使用 [MIT License](LICENSE)。不捆绑第三方运行库、字体文件或游戏资源；项目名称中的“雀魂 / Mahjong Soul”用于说明适用游戏，相关商标与游戏资产归各自权利人所有。本项目非官方，与游戏发行方及以下项目无隶属或合作关系。

开发时参考了以下公开资料。参考并不表示对方认可本项目，也不代表已验证当前客户端兼容性。

| 项目 | 参考用途 | 处理方式 |
| --- | --- | --- |
| [tzp1021/mj_helper](https://github.com/tzp1021/mj_helper) | CDP、WebSocket、协议解析与状态机分层思路；开源仓库文档组织 | 本项目使用浏览器扩展采集，未捆绑其Python决策代码、训练数据或报告 |
| [Avenshy/mahjong-helper-majsoul-mitmproxy](https://github.com/Avenshy/mahjong-helper-majsoul-mitmproxy) | Liqi消息封装和字段定义的研究参考 | 本项目实现最小wire reader，未捆绑其代码、proto文件或生成代码；其GPL-3.0代码不纳入本项目MIT授权 |
| [Avenshy/MajsoulMax](https://github.com/Avenshy/MajsoulMax) | 网页及桌面采集可行性线索 | 未捆绑其客户端修改逻辑 |
| [matttang27/majsoul-vision](https://github.com/matttang27/majsoul-vision) | 私密早期原型使用过其中的游戏牌面截图 | 授权范围未确认，公开快照中移除全部旧PNG与旧ZIP，替换为本项目原创SVG |

本文件不是第三方素材的再授权。提交外部代码、图形或字体时，请同时提供原始来源、许可证与必要版权声明；无法确认分发权的内容不得加入。
