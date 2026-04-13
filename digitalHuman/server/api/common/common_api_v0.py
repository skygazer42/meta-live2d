# -*- coding: utf-8 -*-
'''
@File    :   common.py
@Author  :   一力辉 
'''

import json
from pathlib import Path

from fastapi import APIRouter, WebSocket
from fastapi.responses import JSONResponse
from digitalHuman.server.reponse import Response
from digitalHuman.server.models import AppConfigResp
from digitalHuman.server.ws import WebsocketManager
from digitalHuman.utils import logger
from digitalHuman.utils.env import CONFIG_ROOT_PATH


router = APIRouter(prefix="/common/v0")
wsManager = WebsocketManager()
APP_CONFIG_PATH = Path(CONFIG_ROOT_PATH) / "apps" / "sentio_apps.json"


def _default_app_config():
    return {
        "asr_enable": True,
        "tts_enable": True,
        "asr": {
            "name": "default",
            "type": "ASR",
            "config": {}
        },
        "tts": {
            "name": "default",
            "type": "TTS",
            "config": {}
        },
        "llm": {
            "name": "default",
            "type": "LLM",
            "config": {}
        },
        "agent": {
            "name": "default",
            "type": "AGENT",
            "config": {}
        },
        "background": None,
        "character": {
            "resource_id": "FREE_HaruGreeter",
            "name": "HaruGreeter",
            "type": "character",
            "link": "/sentio/characters/free/HaruGreeter/HaruGreeter.png"
        },
        "type": "Freedom",
        "ext": {
            "sound": True,
            "showThink": True,
            "lip_factor": 5.0,
            "chat_mode": "DIALOGUE"
        }
    }


def _load_app_configs():
    if not APP_CONFIG_PATH.exists():
        return {"default": _default_app_config()}

    with APP_CONFIG_PATH.open("r", encoding="utf-8") as fp:
        app_configs = json.load(fp)

    if not isinstance(app_configs, dict):
        raise ValueError("App config file must contain a JSON object")

    app_configs.setdefault("default", _default_app_config())
    return app_configs

# ========================= 心跳包 =========================== 健康检测
@router.websocket("/heartbeat")
async def websocket_heartbeat(websocket: WebSocket):
    try:
        await wsManager.connect(websocket)
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await wsManager.sendMessage("pong", websocket)
            else:
                # 暂不处理其它消息格式: 非探活则关闭接口
                await wsManager.sendMessage("Received unsupported message", websocket)
                wsManager.disconnect(websocket)
    except Exception as e:
        logger.error(f"[SERVER] websocket_heartbeat: {str(e)}")
        wsManager.disconnect(websocket)


@router.get("/app/{app_id}", response_model=AppConfigResp, summary="Get embedded app config")
def api_get_app_config(app_id: str):
    response = Response()
    try:
        app_configs = _load_app_configs()
        if app_id not in app_configs:
            raise KeyError(f"App config '{app_id}' not found")
        response.data = app_configs[app_id]
    except Exception as e:
        response.data = {}
        response.error(str(e))
    return JSONResponse(content=response.validate(AppConfigResp), status_code=200)
