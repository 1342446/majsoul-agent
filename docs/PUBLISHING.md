# 公开与打包

Majsoul Agent的源码可用于生成完整版和仅获取器。打包脚本不提交、推送、创建仓库或修改仓库可见性。

## 当前状态

项目统一维护于[1342446/majsoul-agent](https://github.com/1342446/majsoul-agent)。公开Git历史保留原私有仓库的全部10个开发提交，并已逐提交清理旧素材、打包产物、研究文件与个人邮箱；说明和逐版本测试结果见[历史迁移](HISTORY.md)。

净化后的历史通过全新仓库发布。原始bundles和提交映射仅作本地私有备份；不要把旧对象、分支或标签重新推回公开仓库。仅删除工作树文件或加入`.gitignore`不能清理旧历史。

## 检查与打包

Node.js 22+可检查、测试、生成安装目录和运行人工回归。ZIP打包需Python 3.10+，只使用标准库。

```sh
npm run check
npm test
npm run build
npm run eval
python scripts/package-public.py
```

打包器会先运行对应源码的检查和测试，再按明确白名单生成：

- `dist/majsoul-agent-source-0.4.0.zip`：以`majsoul-agent/`为根的源码，含三语介绍、Agent、harness、获取器、测试和CI。
- `dist/majsoul-agent-0.4.0.zip`：完整版，解压后直接含`manifest.json`。
- `dist/majsoul-collector-0.4.0.zip`：仅获取器，不含模型代码、设置页或模型主机权限。
- `dist/SHA256SUMS-0.4.0.txt`：以上文件的SHA-256。

`npm run build`单独生成两个可加载目录，不压缩。再次生成时会将旧目录改名为`.previous-时间戳`，不会递归删除已有目录；不再使用的旧目录可由维护者清理。不要同时在游戏中启用两种安装配置。

白名单排除`.git`、`research/`、旧安装包、HAR、日志与浏览器配置，并扫描部分常见凭据格式。它不能替代人工审查。完整源码中的截图是离线模拟，牌面为37张原创SVG，不打包早期游戏截图。

## 后续维护

1. 检查本地变更、三语介绍、许可证、来源和实际安装包。
2. 直接在统一仓库的净化历史上继续开发，使用GitHub的noreply邮箱；旧克隆应重新克隆后单独迁移改动。
3. 改动完整、验证通过后可以提交和推送，执行前核对目标仓库与差异。不要将私密研究、历史ZIP或真实对局记录加入公开提交。
4. 等待公开仓库的远程CI，不能将本地测试当成远程CI结果。已启用私密漏洞报告功能。
5. 获得发布版本的指令后创建Release，上传两种安装ZIP和校验文件。它们未签名，也不是浏览器商店分发包。

仓库简介可用：

> Majsoul Agent：雀魂局面分析与复盘，包含独立牌局获取器、有界工具执行和自选模型。Mahjong analysis and review with a standalone collector and an execution harness.

Topics建议：`mahjong`、`majsoul`、`agent`、`browser-extension`、`llm`、`replay`。

## 验证边界

两种0.4.0安装组合已在独立Edge和Chrome中通过人工牌局模拟验收，详情见[验证记录](../VALIDATION.md)。真实整场采集、断线续接、具体模型兼容性与建议质量仍待验证。内置3个人工向听样例仅用于回归，不代表实战能力。
