# -*- coding: utf-8 -*-

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from digitalHuman.server.api.common.common_api_v0 import router as commonRouter
from digitalHuman.server.api.asr.asr_api_v0 import router as asrRouter
from digitalHuman.server.api.tts.tts_api_v0 import router as ttsRouter
from digitalHuman.server.api.llm.llm_api_v0 import router as llmRouter
from digitalHuman.server.api.agent.agent_api_v0 import router as agentRouter
from digitalHuman.server.api.vision.vision_api_v0 import router as visionRouter
from digitalHuman.utils import config


__all__ = ["app"]

app = FastAPI(
    title=config.COMMON.NAME,
    description=f"This is a cool set of apis for {config.COMMON.NAME}",
    version=config.COMMON.VERSION
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

GLOABLE_PREFIX = "/adh"

# 路由注册
app.include_router(commonRouter, prefix=GLOABLE_PREFIX, tags=["COMMON"])  # 通用功能
app.include_router(asrRouter, prefix=GLOABLE_PREFIX, tags=["ASR"])        # 语音识别
app.include_router(ttsRouter, prefix=GLOABLE_PREFIX, tags=["TTS"])        # 语音合成
app.include_router(llmRouter, prefix=GLOABLE_PREFIX, tags=["LLM"])        # 大语言模型
app.include_router(agentRouter, prefix=GLOABLE_PREFIX, tags=["AGENT"])    # 智能体
app.include_router(visionRouter, prefix=GLOABLE_PREFIX, tags=["VISION"])  # 视觉处理