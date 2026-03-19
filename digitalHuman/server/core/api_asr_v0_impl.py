# -*- coding: utf-8 -*-
'''
@File    :   asr_api_v0_impl.py
@Author  :   一力辉
'''

import json
from typing import List
from digitalHuman.engine import EnginePool
from digitalHuman.utils import config
from digitalHuman.protocol import *
from digitalHuman.server.models import *
from digitalHuman.server.ws import *

enginePool = EnginePool()

def get_asr_list() -> List[EngineDesc]:
    # 从引擎池中，列出所有类型为 ASR 的引擎
    engines = enginePool.listEngine(ENGINE_TYPE.ASR)
    # 遍历引擎列表，获取每个引擎的描述信息
    return [enginePool.getEngine(ENGINE_TYPE.ASR, engine).desc() for engine in engines]

def get_asr_default() -> EngineDesc:
    # 从配置文件中读取默认的 ASR 引擎名称
    return enginePool.getEngine(ENGINE_TYPE.ASR, config.SERVER.ENGINES.ASR.DEFAULT).desc()

def get_asr_param(name: str) -> List[ParamDesc]:
    # 根据给定的名称，从引擎池中获取特定的 ASR 引擎实例
    engine = enginePool.getEngine(ENGINE_TYPE.ASR, name)
    return engine.parameters()
# 一句话识别
async def asr_infer(user: UserDesc, items: ASREngineInput) -> TextMessage:
    if items.engine.lower() == "default":
        items.engine = config.SERVER.ENGINES.ASR.DEFAULT
    input = AudioMessage(data=items.data, sampleRate=items.sampleRate, sampleWidth=items.sampleWidth, type=items.type)
    engine = enginePool.getEngine(ENGINE_TYPE.ASR, items.engine)
    if engine.inferType != INFER_TYPE.NORMAL:
        raise Exception("ASR engine {} not support infer type {}".format(items.engine, engine.inferType))
    output: TextMessage = await engine.run(input=input, user=user, **items.config)
    return output
#流式识别
async def asr_stream_infer(user: UserDesc, websocket: WebSocket):
    await websocket.accept()
    client_waitting = True
    while client_waitting:
        action, payload = await WebSocketHandler.recv_message(websocket)
        match action:
            case WS_RECV_ACTION_TYPE.PING:
                await WebSocketHandler.send_message(websocket, WS_SEND_ACTION_TYPE.PONG, b'')
            case WS_RECV_ACTION_TYPE.ENGINE_START:
                # 解析payload
                items = EngineInput.model_validate_json(payload)
                client_waitting = False
            case _:
                await WebSocketHandler.send_message(websocket, WS_SEND_ACTION_TYPE.ERROR, 'First action must be ENGINE_START | PING')
                return
    if items.engine.lower() == "default":
        items.engine = config.SERVER.ENGINES.ASR.DEFAULT
    engine = enginePool.getEngine(ENGINE_TYPE.ASR, items.engine)
    if engine.inferType != INFER_TYPE.STREAM:
        raise Exception("ASR engine {} not support infer type {}".format(items.engine, engine.inferType))
    await engine.run(websocket=websocket, user=user, **items.config)