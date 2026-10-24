# 公开与打包

Majsoul AI Analysis & Review Agent的源码可用于生成完整版和仅获取器。打包脚本不提交、推送、创建仓库或修改仓库可见性。

## 当前状态

项目统一维护于[oreki-L/majsoul-ai-analysis-and-review-agent](https://github.com/oreki-L/majsoul-ai-analysis-and-review-agent)。公开Git历史保留原私有仓库的全部10个开发提交，并已逐提交清理旧素材、打包产物、研究文件与个人邮箱；说明和逐版本测试结果见[历史迁移](HISTORY.md)。

净化后的历史通过全新仓库发布。原始bundles和提交映射仅作本地私有备份；不要把旧对象、分支或标签重新推回公开仓库。仅删除工作树文件或加入`.gitignore`不能清理旧历史。

## 检查与打包

Node.js 22.19+可检查、测试、生成安装目录和运行人工回归。首次使用或锁文件更新后先执行 `npm ci`；源码包包含 `package-lock.json`、已生成的 Pi bundle 和完整第三方许可证。ZIP打包需Python 3.10+，打包脚本本身只使用标准库。

```sh
npm ci
npm run check
npm test
npm run build
npm run eval
python scripts/package-public.py
```

打包器会先运行对应源码的检查和测试，再按明确白名单生成：

- `dist/majsoul-ai-analysis-and-review-agent-source-<version>.zip`：以`majsoul-ai-analysis-and-review-agent/`为根的源码，含三语介绍、Agent、harness、获取器、测试和CI。
- `dist/majsoul-ai-analysis-and-review-agent-<version>.zip`：完整版，解压后直接含`manifest.json`。
- `dist/majsoul-collector-<version>.zip`：仅获取器，不含模型代码、设置页或模型主机权限。
- `dist/SHA256SUMS-<version>.txt`：以上文件的SHA-256，版本以源码中的 manifest 与 package 为准。

`npm run build`单独生成两个可加载目录，不压缩。再次生成时会将旧目录改名为`.previous-时间戳`，不会递归删除已有目录；不再使用的旧目录可由维护者清理。不要同时在游戏中启用两种安装配置。

`--base-ref` 隔离快照从同一提交提取运行代码、构建脚本、npm 配置与锁文件，避免把当前 Pi 依赖混入旧版本。旧提交没有 npm 依赖时可生成空锁文件；有依赖却未提交锁文件时拒绝打包。快照的版本号同时更新 manifest、profile 和锁文件；文档及原创牌面仍来自当前准备目录。有依赖的临时快照先在自己的目录执行 `npm ci --ignore-scripts --no-audit --no-fund`，需要 npm 与依赖下载能力；安装失败会停止验证，无依赖的旧快照不安装。

白名单排除`.git`、`research/`、旧安装包、HAR、日志与浏览器配置，并扫描部分常见凭据格式。它不能替代人工审查。完整源码中的截图是离线模拟，牌面为37张原创SVG，不打包早期游戏截图。

0.6.0 发布从已提交的干净 Git 快照打包：先用 `git archive` 将选定提交解压至独立目录，在快照目录执行 `npm ci` 和 `python scripts/package-public.py`。不要直接打包带有未提交修改的工作区；白名单包含 `ARCHITECTURE.md`，因此本地未提交的架构草稿也必须由提交快照隔离。核对四个资产、三份 ZIP 的 SHA256，以及源码／manifest／profile／锁文件版本一致后，再上传 Release。

## 后续维护

1. 检查本地变更、三语介绍、许可证、来源和实际安装包。
2. 直接在统一仓库的净化历史上继续开发，使用GitHub的noreply邮箱；旧克隆应重新克隆后单独迁移改动。
3. 改动完整、验证通过后可以提交和推送，执行前核对目标仓库与差异。不要将私密研究、历史ZIP或真实对局记录加入公开提交。
4. 等待公开仓库的远程CI，不能将本地测试当成远程CI结果。已启用私密漏洞报告功能。
5. 获得发布版本的指令后创建Release，上传源码 ZIP、两种安装 ZIP 和校验文件。它们未签名，也不是浏览器商店分发包。

仓库简介可用：

> Majsoul AI Analysis & Review Agent：雀魂局面分析与复盘，包含独立牌局获取器、有界工具执行和自选模型。Mahjong analysis and review with a standalone collector and an execution harness.

Topics建议：`mahjong`、`majsoul`、`agent`、`browser-extension`、`llm`、`replay`。

## 验证边界

历史两种安装组合已在独立 Edge 和 Chrome 中通过人工牌局模拟验收。0.6.0 验证包括 321 项自动测试、Edge 真实扩展的模拟模型／工具链与 Chrome 离线 UI；本轮未完成 Chrome MV3 扩展加载验收，详情见[验证记录](../VALIDATION.md)。真实整场采集、断线续接、具体模型兼容性与建议质量仍待验证。内置3个人工向听样例仅用于回归，不代表实战能力。
