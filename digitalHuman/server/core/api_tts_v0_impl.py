# -*- coding: utf-8 -*-
'''
@File    :   tts_api_v0_impl.py
@Author  :   一力辉
'''


from typing import List, Dict
from digitalHuman.engine import EnginePool, BaseTTSEngine
from digitalHuman.utils import config
from digitalHuman.protocol import ParamDesc, EngineDesc, ENGINE_TYPE, UserDesc, AudioMessage, TextMessage, VoiceDesc
from digitalHuman.server.models import TTSEngineInput

enginePool = EnginePool()

def get_tts_list() -> List[EngineDesc]:
    # 只是查询的类型是 ENGINE_TYPE.TTS
    engines = enginePool.listEngine(ENGINE_TYPE.TTS)
    return [enginePool.getEngine(ENGINE_TYPE.TTS, engine).desc() for engine in engines]

def get_tts_default() -> EngineDesc:
    #只是从配置中读取TTS的默认引擎
    return enginePool.getEngine(ENGINE_TYPE.TTS, config.SERVER.ENGINES.TTS.DEFAULT).desc()

async def get_tts_voice(name: str, **kwargs) -> List[VoiceDesc]:
    engine: BaseTTSEngine = enginePool.getEngine(ENGINE_TYPE.TTS, name)
    voices = await engine.voices(**kwargs)
    return voices

def get_tts_param(name: str) -> List[ParamDesc]:
    #获取指定TTS引擎的参数
    engine = enginePool.getEngine(ENGINE_TYPE.TTS, name)
    return engine.parameters()

async def tts_infer(user: UserDesc, item: TTSEngineInput) -> AudioMessage:
    if item.engine.lower() == "default":
        item.engine = config.SERVER.ENGINES.TTS.DEFAULT
    ## 将输入数据标准化为 TextMessage
    input = TextMessage(data=item.data)
    engine = enginePool.getEngine(ENGINE_TYPE.TTS, item.engine)
    output: AudioMessage = await engine.run(input=input, user=user, **item.config)
    # 返回包含音频数据的 AudioMessage
    return output