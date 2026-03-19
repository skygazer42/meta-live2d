# -*- coding: utf-8 -*-
'''
@File    :   difyASR.py
@Author  :   一力辉
'''


from ..builder import ASREngines
from ..engineBase import BaseASREngine
import io, base64
from digitalHuman.protocol import AudioMessage, TextMessage, AUDIO_TYPE
from digitalHuman.utils import logger, httpxAsyncClient, wavToMp3, checkResponse

__all__ = ["CozeApiAsr"]

#一句话识别
@ASREngines.register("Coze")
class CozeApiAsr(BaseASREngine): 
    def setup(self):
        self.url = "https://api.coze.cn/v1/audio/transcriptions"

    async def run(self, input: AudioMessage, **kwargs) -> TextMessage:
        # 参数校验
        paramters = self.checkParameter(**kwargs) #从任务参数中获取API令牌
        API_TOKEN = paramters["token"]
#准备HTTP请求头和文件
        headers = {
            'Authorization': f'Bearer {API_TOKEN}'
        }
#准备要上传的文件
        files = {
            'file': ('adh.mp3', input.data)
        }
 #
        if isinstance(input.data, str):
            input.data = base64.b64decode(input.data)
        if input.type == AUDIO_TYPE.WAV:
            input.data = wavToMp3(input.data)
            input.type = AUDIO_TYPE.MP3
#发起异步HTTP POST请求，调用Coze的API
        response = await httpxAsyncClient.post(self.url, headers=headers, files=files)
        resp = checkResponse(response, "CozeApiAsr")
        result = resp["data"]["text"]
        logger.debug(f"[ASR] Engine response: {result}")
        message = TextMessage(data=result)
        return message