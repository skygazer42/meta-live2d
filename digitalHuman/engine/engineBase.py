# -*- coding: utf-8 -*-
'''
@File    :   engineBase.py
@Author  :   一力辉 
'''

from fastapi import WebSocket
from typing import List, MutableMapping, Any, Optional
from abc import abstractmethod
from digitalHuman.core import BaseRunner
from digitalHuman.protocol import BaseMessage, TextMessage, AudioMessage, VoiceDesc, VisionMessage, FaceDetectionResult
import numpy as np

__all__ = ["BaseEngine", "BaseLLMEngine", "BaseASREngine", "BaseTTSEngine", "StreamBaseEngine", "BaseVisionEngine"]


class BaseEngine(BaseRunner):
    """基础引擎类，包含配置属性"""

    def __init__(self, config: Optional[Any] = None, engine_type: Optional[str] = None):
        """初始化基础引擎

        Args:
            config: 引擎配置（可以是CfgNode或字典）
            engine_type: 引擎类型
        """
        # 直接传递config给父类，不转换类型
        super().__init__(config=config, type=engine_type)
        # 保存一份引用以便子类访问
        self.config = config
        self.engine_type = engine_type

    @abstractmethod
    async def run(self, input: BaseMessage, **kwargs) -> BaseMessage:
        raise NotImplementedError


class BaseLLMEngine(BaseEngine):
    """大语言模型引擎基类"""

    @abstractmethod
    async def run(self, input, streaming: bool = True, **kwargs):
        raise NotImplementedError


class BaseASREngine(BaseEngine):
    """语音识别引擎基类"""

    @abstractmethod
    async def run(self, input: AudioMessage, **kwargs) -> TextMessage:
        raise NotImplementedError


class BaseTTSEngine(BaseEngine):
    """语音合成引擎基类"""

    async def voices(self, **kwargs) -> List[VoiceDesc]:
        return []

    @abstractmethod
    async def run(self, input: TextMessage, **kwargs) -> AudioMessage:
        raise NotImplementedError


class StreamBaseEngine(BaseEngine):
    """流式处理引擎基类"""

    @abstractmethod
    async def run(self, websocket: WebSocket, **kwargs) -> None:
        raise NotImplementedError


class BaseVisionEngine(BaseEngine):
    """视觉处理引擎基类"""

    @abstractmethod
    async def run(self, input: VisionMessage, **kwargs) -> FaceDetectionResult:
        raise NotImplementedError

    @abstractmethod
    async def process_frame(self, frame: np.ndarray, **kwargs) -> dict:
        """处理单帧图像"""
        raise NotImplementedError