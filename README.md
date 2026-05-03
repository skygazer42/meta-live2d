# Meta-Live2D

**打造有温度的数字人 · 给 Live2D 角色注入灵魂**

一个轻量级、模块化、可扩展的 Live2D 数字人交互平台，基于 FastAPI + Next.js 构建，支持 ASR / LLM / TTS / Agent 全链路自定义，并可对接 Dify、FastGPT、Coze、OpenAI 等主流编排框架。

---

## ✨ 主要特性

- 🐳 **开箱即用**：支持 Docker 一键部署，最低配置 2 核 2G 即可运行
- 🧩 **高度模块化**：ASR、LLM、TTS、Agent、Vision 各模块均可自由扩展替换
- 🔌 **生态友好**：原生兼容 Dify / FastGPT / Coze / OpenAI 兼容接口
- 🎭 **Live2D 支持**：内置多套 Live2D 模型，可自由扩展角色和动作控制
- 📱 **全端适配**：PC 端与移动端 Web 访问一致体验
- 🗣️ **沉浸式交互**：实时语音对话、对话打断、流式 ASR/TTS 等真实交互体验

---

## 🏗️ 设计架构

通过 Coding 扩展模块实现高度定制化，通过 Agent 编排框架降低接入复杂度。

---

## 🎮 模式支持

### 交互模式
- **对话模式**：专注于文字交互的轻量聊天体验
- **沉浸模式**：实时语音、可打断、拟人化的直接交互

### Agent 模式
| Agent | 说明 |
|-------|------|
| `RepeaterAgent` | 复读机，仅用于功能测试 |
| `DifyAgent` | 接入 Dify 编排服务（ASR / TTS 可走 Dify） |
| `FastgptAgent` | 接入 FastGPT 服务 |
| `CozeAgent` | 接入 Coze 服务（ASR / TTS 可走 Coze） |
| `OpenaiAgent` | 接入任意 OpenAI 兼容接口 |

### 引擎能力
- **ASR**：Dify API / Coze API / 腾讯云 / FunASR Streaming
- **TTS**：Edge TTS / 腾讯云 / Dify API / Coze API
- **Vision**：人脸 + 唇形检测 / OpenCV 人脸检测
- **流式协议**：自定义流式引擎协议，详见 [streaming_protocol.md](./docs/streaming_protocol.md)

---

## 🚀 快速开始

```bash
# 拉取仓库
git clone https://github.com/skygazer42/meta-live2d.git
cd meta-live2d

# 一键启动（Docker）
docker compose -f docker-compose-quickStart.yaml up -d
```

完整部署与配置说明请参考：[部署文档](./docs/deploy_instrction.md)

---

## 🎭 Live2D 资源配置（可选）

前端已经支持在浏览器里临时注册自定义 Live2D 角色。进入 `Sentio -> 模型/画廊`，在角色页选择模型类型、填写模型名并添加；配置会保存在当前浏览器本地，不需要每次都改代码。

自定义资源建议放在：

```text
web/public/sentio/characters/custom/<ModelName>/
```

资源名需要保持一致，避免模型加载时找不到文件：

- 压缩包：`<ModelName>.zip`
- 解压目录：`<ModelName>/`
- 预览图：`<ModelName>.png`
- Live2D 入口配置：`<ModelName>.model3.json`

示例结构：

```text
web/public/sentio/characters/custom/HaruGreeter/
├─ Haru.2048/
│  ├─ texture_00.png
│  └─ texture_01.png
├─ expressions/
│  └─ idle.exp3.json
├─ motions/
│  └─ idle.motion3.json
├─ Haru.cdi3.json
├─ Haru.moc3
├─ Haru.physics3.json
├─ Haru.pose3.json
├─ Haru.userdata3.json
├─ HaruGreeter.model3.json
└─ HaruGreeter.png
```

如果希望模型变成项目内置默认选项，再把模型名加入 `web/lib/constants.ts` 中对应的角色列表。

---

## 🛠️ 部署 & 开发

- [部署说明](./docs/deploy_instrction.md)
- [开发说明](./docs/developer_instrction.md)
- [常见问题 Q&A](./docs/Q&A.md)

---

## 🗺️ Roadmap

- [ ] RTC 音视频流支持
- [x] 跨模态交互（麦克风 / 摄像头）
- [ ] AI 生成 Live2D 人物模型
- [ ] 基于情感的人物表情 / 动作驱动

---

## 🙏 致谢

本项目站在以下优秀开源项目的肩膀上：

- [Dify](https://github.com/langgenius/dify) — LLMOps 平台
- [Live2D](https://github.com/Live2D) — Live2D Cubism SDK
- [FunASR](https://github.com/modelscope/FunASR) — 工业级语音识别
- 以及源码中所有依赖库的作者

---

## 📄 License

详见仓库根目录 [LICENSE](./LICENSE)。
