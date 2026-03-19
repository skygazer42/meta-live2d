# -*- coding: utf-8 -*-
'''
@File    :   protocol.py
@Author  :   一力辉 
'''

import struct
import numpy as np
from enum import Enum
from uuid import uuid4
from typing import Optional, Union, List, Dict, Tuple, Any
from datetime import datetime
from pydantic import BaseModel, Field
from fastapi import WebSocket


# ======================= 枚举类型 =======================
class StrEnum(str, Enum):
    def __str__(self):
        return str(self.value)


class IntEnum(int, Enum):
    def __str__(self):
        return str(self.value)


class ENGINE_TYPE(StrEnum):
    ASR = "ASR"
    TTS = "TTS"
    LLM = "LLM"
    AGENT = "AGENT"
    VISION = "VISION"  # 新增视觉引擎类型


class GENDER_TYPE(StrEnum):
    MALE = 'MALE'
    FEMALE = 'FEMALE'


class EVENT_TYPE(StrEnum):
    CONVERSATION_ID = 'CONVERSATION_ID'
    MESSAGE_ID = 'MESSAGE_ID'
    TEXT = 'TEXT'
    THINK = 'THINK'
    TASK = 'TASK'
    DONE = 'DONE'
    ERROR = 'ERROR'
    # 视觉相关事件
    VISION_FACE_DETECTED = 'VISION_FACE_DETECTED'
    VISION_TALKING_START = 'VISION_TALKING_START'
    VISION_TALKING_END = 'VISION_TALKING_END'


class PARAM_TYPE(StrEnum):
    STRING = 'string'
    INT = 'int'
    FLOAT = 'float'
    BOOL = 'bool'


class AUDIO_TYPE(StrEnum):
    MP3 = 'mp3'
    WAV = 'wav'


class ROLE_TYPE(StrEnum):
    SYSTEM = 'system'
    USER = 'user'
    ASSISTANT = 'assistant'
    TOOL = 'tool'


class INFER_TYPE(StrEnum):
    NORMAL = 'normal'
    STREAM = 'stream'


class RESPONSE_CODE(IntEnum):
    OK = 0
    ERROR = -1


# ========================== Message =============================
class BaseMessage(BaseModel):
    """
    Base Protocol
    """

    # id: str = Field(default_factory=lambda: str(uuid4()))
    def __str__(self) -> str:
        return f'Message({self.model_dump()})'


class AudioMessage(BaseMessage):
    data: Optional[Union[str, bytes]] = None
    type: AUDIO_TYPE = AUDIO_TYPE.WAV
    sampleRate: int = 16000
    sampleWidth: int = 2


class TextMessage(BaseMessage):
    data: Optional[str] = None


class RoleMessage(BaseMessage):
    role: ROLE_TYPE
    content: str


# ========================== Vision Messages =============================
class VisionMessage(BaseMessage):
    """视觉输入消息"""
    frame: Any  # np.ndarray - 使用Any避免pydantic序列化问题
    timestamp: Optional[float] = None
    metadata: Optional[Dict] = None

    class Config:
        arbitrary_types_allowed = True  # 允许任意类型


class FaceDetectionResult(BaseMessage):
    """人脸检测结果"""
    has_face: bool
    is_talking: bool
    face_bbox: Optional[List[int]] = None  # [x, y, width, height]
    face_distance: float = 0.0
    head_pose: Dict[str, float] = {}  # {"swing": angle, "nodding": angle}
    confidence: float = 0.0
    timestamp: Optional[float] = None


class LipSyncEvent(BaseModel):
    """唇形同步事件"""
    event_type: str  # "start_talking", "stop_talking"
    timestamp: float
    duration: Optional[float] = None
    confidence: float = 0.0


class VisionFrameData(BaseModel):
    """视觉帧数据"""
    frame_id: str = Field(default_factory=lambda: str(uuid4()))
    width: int
    height: int
    channels: int
    data: Union[str, bytes]  # base64编码的图像数据或原始字节
    format: str = "bgr"  # 图像格式: bgr, rgb, gray
    timestamp: float


class VisionTrackingState(BaseModel):
    """视觉追踪状态"""
    tracking_id: Optional[str] = None
    is_tracking: bool = False
    frames_tracked: int = 0
    last_update: Optional[float] = None
    tracking_confidence: float = 0.0


# ========================== server =============================
class BaseResponse(BaseModel):
    code: RESPONSE_CODE
    message: str


# ========================== voice =============================
class VoiceDesc(BaseModel):
    name: str
    gender: GENDER_TYPE


# ========================== param =============================
class ParamDesc(BaseModel):
    name: str
    description: str
    type: PARAM_TYPE
    required: bool
    range: List[Union[str, int, float]] = []
    choices: List[Union[str, int, float]] = []
    default: Union[str, int, float, bool]


# ========================== engine =============================
class EngineDesc(BaseModel):
    name: str
    type: ENGINE_TYPE
    infer_type: INFER_TYPE
    desc: str = ""
    meta: Dict = {}


class EngineConfig(BaseModel):
    name: str
    type: ENGINE_TYPE
    config: Dict


# ========================== user =============================
class UserDesc(BaseModel):
    user_id: str
    request_id: str
    cookie: str


# ========================== func =============================
def eventStreamResponse(event: EVENT_TYPE, data: str) -> str:
    message = "event: " + str(event) + "\ndata: " + data.replace("\n", "\\n") + "\n\n"
    return message


def eventStreamText(data: str) -> str:
    return eventStreamResponse(EVENT_TYPE.TEXT, data)


def eventStreamTask(task_id: str) -> str:
    return eventStreamResponse(EVENT_TYPE.TASK, task_id)


def eventStreamThink(data: str) -> str:
    return eventStreamResponse(EVENT_TYPE.THINK, data)


def eventStreamConversationId(conversation_id: str) -> str:
    return eventStreamResponse(EVENT_TYPE.CONVERSATION_ID, conversation_id)


def eventStreamMessageId(message_id: str) -> str:
    return eventStreamResponse(EVENT_TYPE.MESSAGE_ID, message_id)


def eventStreamDone() -> str:
    return f"event: {EVENT_TYPE.DONE}\ndata: Done\n\n"


def eventStreamError(error: str):
    return eventStreamResponse(EVENT_TYPE.ERROR, error)


# 视觉相关事件流函数
def eventStreamVisionFaceDetected(data: Dict) -> str:
    import json
    return eventStreamResponse(EVENT_TYPE.VISION_FACE_DETECTED, json.dumps(data))


def eventStreamVisionTalkingStart(timestamp: float) -> str:
    return eventStreamResponse(EVENT_TYPE.VISION_TALKING_START, str(timestamp))


def eventStreamVisionTalkingEnd(data: Dict) -> str:
    import json
    return eventStreamResponse(EVENT_TYPE.VISION_TALKING_END, json.dumps(data))


def isEventStreamResponse(message: str) -> bool:
    return message.startswith("event:")


# ========================== websocket =============================
# 协议常量定义
ACTION_HEADER_SIZE = 18  # action字段大小（18字节）
# 协议格式: [Action(18字节)] + [Payload Size(4字节)] + [Payload(可变长度)]
PROTOCOL_HEADER_FORMAT = ">18sI"  # 大端序: 18字节action + 4字节无符号整数payload_size
PROTOCOL_HEADER_SIZE = struct.calcsize(PROTOCOL_HEADER_FORMAT)  # 22字节


class WS_RECV_ACTION_TYPE(StrEnum):
    """客户端请求类型"""
    PING = "PING"  # 心跳包
    ENGINE_START = "ENGINE_START"  # 启动引擎
    ENGINE_PARTIAL_INPUT = "PARTIAL_INPUT"  # 引擎输入
    ENGINE_FINAL_INPUT = "FINAL_INPUT"  # 引擎输入
    ENGINE_STOP = "ENGINE_STOP"  # 停止引擎
    # 视觉相关动作
    VISION_FRAME = "VISION_FRAME"  # 视频帧输入
    VISION_START = "VISION_START"  # 开始视觉处理
    VISION_STOP = "VISION_STOP"  # 停止视觉处理
    VISION_CONFIG = "VISION_CONFIG"  # 更新视觉配置


class WS_SEND_ACTION_TYPE(StrEnum):
    """服务端响应类型"""
    PONG = "PONG"  # 心跳响应
    ENGINE_INITIALZING = "ENGINE_INITIALZING"  # 引擎初始化
    ENGINE_STARTED = "ENGINE_STARTED"  # 引擎准备就绪
    ENGINE_PARTIAL_OUTPUT = "PARTIAL_OUTPUT"  # 引擎输出
    ENGINE_FINAL_OUTPUT = "FINAL_OUTPUT"  # 引擎输出
    ENGINE_STOPPED = "ENGINE_STOPPED"  # 关闭引擎
    ERROR = "ERROR"  # 错误响应
    # 视觉相关响应
    VISION_RESULT = "VISION_RESULT"  # 视觉检测结果
    VISION_STARTED = "VISION_STARTED"  # 视觉处理已启动
    VISION_STOPPED = "VISION_STOPPED"  # 视觉处理已停止
    VISION_TRACKING = "VISION_TRACKING"  # 视觉追踪状态


def _format_action(action_name: str) -> bytes:
    """格式化action名称为18字节，右侧用空格填充"""
    if len(action_name) > ACTION_HEADER_SIZE:
        raise ValueError(
            f"Action name '{action_name}' exceeds {ACTION_HEADER_SIZE} bytes"
        )
    return action_name.ljust(ACTION_HEADER_SIZE).encode("utf-8")


def struct_message(action: str, message: str | bytes) -> bytes:
    """构造发送消息"""
    if isinstance(message, str):
        message = message.encode("utf-8")
    action_bytes = _format_action(action)
    payload_size = len(message)
    # 打包协议头部: action(18字节) + payload_size(4字节)
    header = struct.pack(PROTOCOL_HEADER_FORMAT, action_bytes, payload_size)
    return header + message


def parse_message(message: bytes) -> Tuple[str, bytes]:
    """解析接收到的消息"""
    if len(message) < PROTOCOL_HEADER_SIZE:
        raise ValueError(
            f"Message too short: {len(message)} bytes, expected at least {PROTOCOL_HEADER_SIZE}"
        )
    # 解析协议头部: action(18字节) + payload_size(4字节)
    action, payload_size = struct.unpack(
        PROTOCOL_HEADER_FORMAT, message[:PROTOCOL_HEADER_SIZE]
    )

    expected_total_size = PROTOCOL_HEADER_SIZE + payload_size
    if len(message) != expected_total_size:
        raise ValueError(
            f"Message size mismatch: got {len(message)} bytes, expected {expected_total_size}"
        )

    # 提取payload
    payload = message[PROTOCOL_HEADER_SIZE: PROTOCOL_HEADER_SIZE + payload_size] if payload_size > 0 else b""

    return (action.decode("utf-8").strip(), payload)


class WebSocketHandler():
    """
    websocket处理类(协议控制)
    """

    @staticmethod
    async def connect(ws: WebSocket) -> None:
        """连接WebSocket"""
        await ws.accept()
        # logger.debug(f"WebSocket connected: {ws.client.host}")

    @staticmethod
    async def disconnect(ws: WebSocket):
        """断开WebSocket连接"""
        await ws.close()
        # logger.debug(f"WebSocket disconnected: {ws.client.host}")

    @staticmethod
    async def send_message(ws: WebSocket, action: str, message: str | bytes = b'') -> None:
        """发送WebSocket消息"""
        data = struct_message(action, message)
        await ws.send_bytes(data)
        # logger.debug(f"Sent action: {action}, payload size: {len(data) - PROTOCOL_HEADER_SIZE} bytes")

    @staticmethod
    async def recv_message(ws: WebSocket) -> Tuple[str, bytes]:
        """接收WebSocket消息"""
        message = await ws.receive_bytes()
        action, payload = parse_message(message)
        # logger.debug(f"Received action: {action.decode('utf-8').strip()}, payload size: {len(payload)} bytes")
        return action, payload