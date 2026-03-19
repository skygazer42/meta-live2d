# -*- coding: utf-8 -*-
'''
@File    :   models.py
@Author  :   一力辉
'''

from typing import List, Dict, Union
from pydantic import BaseModel
from digitalHuman.server.reponse import BaseResponse
from digitalHuman.protocol import *
#当你调用一个 API 时，你需要告诉服务器你要做什么以及提供必要的信息，服务器处理完后也需要以一种固定的格式返回结果给你。这个 models.py 文件就是用来定义这些“固定格式”的。  数据类型
class EngineListResp(BaseResponse):
    data: List[EngineDesc] = []

class EngineDefaultResp(BaseResponse):
    data: EngineDesc

class EngineParam(BaseResponse):
    data: List[ParamDesc] = []

class EngineInput(BaseModel):
    engine: str = 'default'
    config: Dict = {}
    data: Union[str, bytes] = ""

class AgentEngineInput(EngineInput):
    conversation_id: str = ""

class ASREngineInput(EngineInput, AudioMessage):
    pass

class ASREngineOutput(BaseResponse):
    data: str

class VoiceListResp(BaseResponse):
    data: List[VoiceDesc] = []

class TTSEngineInput(EngineInput):
    pass

class TTSEngineOutput(BaseResponse, AudioMessage):
    pass

class LLMEngineInput(EngineInput):
    pass

class ConversationInput(BaseModel):
    data: Dict = {}

class ConversationIdResp(BaseResponse):
    data: str