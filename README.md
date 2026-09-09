# Xiaoleimi Codex Pet（小蕾米）

小蕾米是一只粉发白翼、抱着画板和画笔的日系 Q 版小天使桌宠，可用于 ChatGPT 桌面端的 Codex/Pets 功能。

<p align="center">
  <img src="spritesheet.webp" alt="小蕾米 v2 动作图集" width="768">
</p>

## 包含内容

- `pet.json`：pet 标识、显示名称和 v2 格式声明。
- `spritesheet.webp`：1536×2288、8 列×11 行、透明背景的 WebP 图集。
- `install.sh`：Linux/macOS 快速安装脚本。
- `docs/使用手册.md`：完整安装、启用、更新及排错说明。
- `docs/动作说明.md`：标准 v2 行定义和小蕾米的动作规划。
- `docs/修改总览.md`：本机 Codex 运行时的全部已确认修改和状态触发条件。
- `docs/跨机器迁移.md`：素材安装、增强映射、诊断、验证和回滚流程。
- `install-with-runtime.sh`：带版本/模块指纹保护的 Linux 增强映射安装器。
- `scripts/runtime-patch.js`：不包含原始 ASAR 的可审计转换工具。
- `scripts/verify-install.sh`：只读检查 Pet、运行时补丁和当前选择。
- `SHA256SUMS`：发布文件校验值。

## 快速安装

Linux/macOS：

```bash
git clone https://github.com/guraduang/xiaoleimi-codex-pet.git
cd xiaoleimi-codex-pet
./install.sh
```

然后打开 ChatGPT 桌面端：

1. 进入“设置 → Pets”。
2. 点击“Refresh/刷新”。
3. 选择“小蕾米”。
4. 输入 `/pet` 唤醒桌宠；再次输入可收起。

Windows、手动安装、更新和排错方法见[完整使用手册](docs/使用手册.md)。

## 安装细分动作映射

如果需要本机现有的“思考、工具执行、文字输出、任务完成”动作映射，并且目标是指纹匹配的 Linux ChatGPT/Codex desktop `26.814.41407` 或 `26.901.20858`，请先完全退出应用，再运行：

```bash
./install-with-runtime.sh
```

脚本会在任何写入之前核对版本和对应目标模块的 SHA-256，备份原始 `app.asar`，生成并验证补丁结果；不兼容时直接停止，也不会启动或重启应用。完整步骤见[跨机器迁移指南](docs/跨机器迁移.md)。

## 兼容性说明

Pet 包可以独立安装，标准客户端会按照自身的 Pets 状态规则播放图集。

仓库现在同时提供维护者机器上细分动作映射的转换脚本，但不包含官方原始或修改后的完整应用 bundle。运行时映射属于特定客户端版本的非官方修改，更新客户端后会失效；历史适配为 Linux `26.814.41407`；新增 `26.901.20858` 已通过静态与逻辑验证，本机已安装并重启，持续工作、思考和输出动作已完成现场验收；其他场景见验收表。实际变更见[修改总览](docs/修改总览.md)。

## 跨版本维护

通用流程、适配矩阵、升级后失效提示、退出码、回滚边界和验收表见[跨版本维护方案](docs/跨版本维护方案.md)。未知版本拒绝写入；不要只修改版本号来强行安装。

## 校验信息

- Pet ID：`xiaoleimi`
- Runtime ID：`custom:xiaoleimi`
- Sprite version：`2`
- 单元格：`192×208`
- 图集：`1536×2288`（8×11）
- 格式：带 Alpha 的无损 WebP

## 两层运行关系

| 层 | 作用 | 是否随仓库迁移 |
| --- | --- | --- |
| Pet 包 | 提供 8×11 动作图集 | 是 |
| 本机选择 | 选择 `custom:xiaoleimi` | 否，需要在目标机器重新选择 |
| 运行时映射 | 把推理、工具、输出、完成映射到指定帧段 | 使用增强安装器后才会迁移 |

## 许可

本仓库暂未附加开源许可证，默认保留所有权利。个人安装和使用请以仓库所有者授权为准；再分发、改作或商业用途请先联系仓库所有者。

## 相关文档

- [OpenAI 官方 Pets 文档](https://developers.openai.com/codex/pets)
