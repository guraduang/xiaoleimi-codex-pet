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

## 兼容性说明

本仓库只发布 pet 素材和清单，不包含、分发或修改 ChatGPT/Codex 应用程序文件。标准客户端会按照自身的 Pets 状态规则播放图集。

维护者机器上曾实验性配置过更细的“思考、工具执行、文字输出、任务完成”动作映射；这属于特定客户端版本的本地运行时修改，不是本仓库安装包的一部分，更新客户端后也可能失效。详情见[动作说明](docs/动作说明.md)。

## 校验信息

- Pet ID：`xiaoleimi`
- Runtime ID：`custom:xiaoleimi`
- Sprite version：`2`
- 单元格：`192×208`
- 图集：`1536×2288`（8×11）
- 格式：带 Alpha 的无损 WebP

## 许可

本仓库暂未附加开源许可证，默认保留所有权利。个人安装和使用请以仓库所有者授权为准；再分发、改作或商业用途请先联系仓库所有者。

## 相关文档

- [OpenAI 官方 Pets 文档](https://developers.openai.com/codex/pets)
