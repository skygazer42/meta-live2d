# -*- coding: utf-8 -*-

import cv2
import json
import base64
import numpy as np
from typing import Dict, Optional, List
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query, UploadFile, Form
from fastapi.responses import JSONResponse, StreamingResponse
from digitalHuman.utils import logger
from digitalHuman.protocol import *
from digitalHuman.engine import EnginePool
from digitalHuman.server.reponse import Response
from digitalHuman.server.header import HeaderInfo
from digitalHuman.server.models import *
from digitalHuman.server.core.api_vision_v0_impl import *
from digitalHuman.server.ws import WebsocketManager
import asyncio
from collections import deque

router = APIRouter(prefix="/vision/v0")
enginePool = EnginePool()
wsManager = WebsocketManager()


def resolve_vision_engine(engine_name: str) -> str:
    requested_engine = (engine_name or "default").strip()
    if requested_engine.lower() != "default":
        return requested_engine

    default_engine = get_vision_default()
    resolved_name = getattr(default_engine, "name", "")
    if resolved_name:
        return resolved_name

    raise RuntimeError("No vision engine available")


# ========================= 获取Vision支持列表 ===========================
@router.get("/engine", response_model=EngineListResp, summary="Get Vision Engine List")
def api_get_vision_list():
    """
    获取Vision支持引擎列表
    """
    response = Response()
    try:
        response.data = get_vision_list()
    except Exception as e:
        response.data = []
        response.error(str(e))
    return JSONResponse(content=response.validate(EngineListResp), status_code=200)


# ========================= 获取Vision默认引擎 ===========================
@router.get("/engine/default", response_model=EngineDefaultResp, summary="Get Default Vision Engine")
def api_get_vision_default():
    """
    获取默认Vision引擎
    """
    response = Response()
    try:
        response.data = get_vision_default()
    except Exception as e:
        response.data = ""
        response.error(str(e))
    return JSONResponse(content=response.validate(EngineDefaultResp), status_code=200)


# ========================= 获取Vision引擎参数列表 ===========================
@router.get("/engine/{engine}", response_model=EngineParam, summary="Get Vision Engine Param")
def api_get_vision_param(engine: str):
    """
    获取Vision引擎配置参数列表
    """
    response = Response()
    try:
        response.data = get_vision_param(engine)
    except Exception as e:
        response.data = []
        response.error(str(e))
    return JSONResponse(content=response.validate(EngineParam), status_code=200)


# ========================= 处理单张图片 ===========================
@router.post("/engine/image", response_model=VisionEngineOutput, summary="Process Single Image")
async def api_vision_process_image(
        header: HeaderInfo,
        file: UploadFile = None,
        engine: str = Form(default="default"),
        config: str = Form(default='{}')  # 这个参数名保持不变
):
    """
    处理单张图片的人脸和唇形检测
    """
    response = Response()
    try:
        engine = resolve_vision_engine(engine)
        # 读取图片
        image_data = await file.read()
        nparr = np.frombuffer(image_data, np.uint8)
        frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        # 创建视觉消息
        vision_msg = VisionMessage(frame=frame)

        # 获取引擎并处理
        vision_engine = enginePool.getEngine(ENGINE_TYPE.VISION, engine)
        config_dict = json.loads(config) if config else {}  # config 作为表单参数使用
        result = await vision_engine.run(vision_msg, **config_dict)

        # 构建响应
        response.data = {
            "has_face": result.has_face,
            "is_talking": result.is_talking,
            "face_bbox": result.face_bbox,
            "face_distance": result.face_distance,
            "head_pose": result.head_pose,
            "confidence": result.confidence
        }
    except Exception as e:
        response.data = {}
        response.error(str(e))

    return JSONResponse(content=response.validate(VisionEngineOutput), status_code=200)


# ========================= WebSocket视频流处理 ===========================
@router.websocket("/stream")
async def api_vision_stream(
        websocket: WebSocket,
        engine: str = Query(default="default"),
        fps: int = Query(default=25, description="Frame rate"),
        buffer_size: int = Query(default=10, description="Frame buffer size")
):
    """
    WebSocket端点：实时处理视频流

    协议：
    Client -> Server: {"type": "frame", "data": "base64_image", "timestamp": float}
    Server -> Client: {"type": "result", "data": {...}}
    """
    await websocket.accept()

    try:
        engine = resolve_vision_engine(engine)
        logger.info(f"[Vision API] WebSocket connected with engine: {engine}, fps: {fps}")
        vision_engine = enginePool.getEngine(ENGINE_TYPE.VISION, engine)
    except (KeyError, RuntimeError) as e:
        await websocket.send_json({
            "type": "error",
            "message": str(e)
        })
        await websocket.close()
        return

    # 帧缓冲区（虽然文档说可以删掉，但保留以备后用）
    frame_buffer = deque(maxlen=buffer_size)
    process_interval = 1.0 / fps
    last_process_time = 0

    try:
        while True:
            # 接收消息
            message = await websocket.receive_json()
            msg_type = message.get("type")

            if msg_type == "frame":
                current_time = asyncio.get_event_loop().time()

                # 控制处理频率
                if current_time - last_process_time >= process_interval:
                    # 解码图像
                    img_data = base64.b64decode(message["data"])
                    nparr = np.frombuffer(img_data, np.uint8)
                    frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

                    # 创建视觉消息
                    vision_msg = VisionMessage(
                        frame=frame,
                        timestamp=message.get("timestamp")
                    )

                    # 处理图像
                    result = await vision_engine.run(vision_msg)

                    # 发送结果
                    await websocket.send_json({
                        "type": "result",
                        "data": {
                            "has_face": result.has_face,
                            "is_talking": result.is_talking,
                            "face_bbox": result.face_bbox,
                            "face_distance": result.face_distance,
                            "head_pose": result.head_pose,
                            "confidence": result.confidence,
                            "timestamp": result.timestamp
                        }
                    })

                    last_process_time = current_time
                else:
                    # 帧率限制，跳过处理
                    await websocket.send_json({
                        "type": "skipped",
                        "reason": "fps_limit"
                    })

            elif msg_type == "config":
                # 动态更新配置
                new_config = message.get("config", {})
                logger.info(f"[Vision API] Updating config: {new_config}")
                # TODO: 实现配置更新逻辑
                await websocket.send_json({
                    "type": "config_updated",
                    "config": new_config
                })

            elif msg_type == "ping":
                await websocket.send_json({"type": "pong"})

            elif msg_type == "close":
                break

    except WebSocketDisconnect:
        logger.info("[Vision API] WebSocket disconnected")
    except Exception as e:
        logger.error(f"[Vision API] Error: {e}")
        await websocket.send_json({
            "type": "error",
            "message": str(e)
        })
    finally:
        await websocket.close()


# ========================= 多模态联动WebSocket ===========================
@router.websocket("/multimodal")
async def api_vision_multimodal(
        websocket: WebSocket,
        vision_engine: str = Query(default="default"),
        asr_engine: str = Query(default=None),
        enable_audio: bool = Query(default=True)
):
    """
    多模态WebSocket端点：视觉+音频联动处理

    支持同时处理视频帧和音频数据，实现唇形与语音的同步检测
    """
    await websocket.accept()

    # 获取引擎
    try:
        vision_engine = resolve_vision_engine(vision_engine)
        logger.info(f"[Vision Multimodal] Connected - Vision: {vision_engine}, ASR: {asr_engine}")
        vision_eng = enginePool.getEngine(ENGINE_TYPE.VISION, vision_engine)
        asr_eng = None
        if asr_engine and enable_audio:
            asr_eng = enginePool.getEngine(ENGINE_TYPE.ASR, asr_engine)
    except (KeyError, RuntimeError) as e:
        await websocket.send_json({
            "type": "error",
            "message": str(e)
        })
        await websocket.close()
        return

    # 状态管理
    is_talking = False
    audio_buffer = []
    vision_history = deque(maxlen=10)
    lip_event = asyncio.Event()

    try:
        while True:
            message = await websocket.receive_json()
            msg_type = message.get("type")

            if msg_type == "frame":
                # 视觉处理
                img_data = base64.b64decode(message["data"])
                nparr = np.frombuffer(img_data, np.uint8)
                frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

                vision_msg = VisionMessage(
                    frame=frame,
                    timestamp=message.get("timestamp")
                )
                result = await vision_eng.run(vision_msg)

                # 保存历史
                vision_history.append({
                    "timestamp": message.get("timestamp"),
                    "has_face": result.has_face,
                    "is_talking": result.is_talking,
                    "confidence": result.confidence
                })

                # 检测状态变化
                prev_talking = is_talking
                is_talking = result.is_talking

                if not prev_talking and is_talking:
                    # 开始说话
                    lip_event.set()
                    audio_buffer.clear()
                    await websocket.send_json({
                        "type": "talking_start",
                        "timestamp": message.get("timestamp")
                    })
                    logger.info("[Vision Multimodal] User started talking")

                elif prev_talking and not is_talking:
                    # 停止说话，触发ASR
                    lip_event.clear()

                    if asr_eng and audio_buffer:
                        # 合并音频数据
                        audio_data = b''.join(audio_buffer)
                        audio_msg = AudioMessage(
                            data=audio_data,
                            sampleRate=16000,
                            sampleWidth=2
                        )

                        # ASR识别
                        text_result = await asr_eng.run(audio_msg)

                        await websocket.send_json({
                            "type": "talking_end",
                            "data": {
                                "text": text_result.data,
                                "timestamp": message.get("timestamp"),
                                "audio_duration": len(audio_data) / (16000 * 2)
                            }
                        })
                        logger.info(f"[Vision Multimodal] ASR Result: {text_result.data}")
                    else:
                        await websocket.send_json({
                            "type": "talking_end",
                            "timestamp": message.get("timestamp")
                        })

                    audio_buffer.clear()
                    logger.info("[Vision Multimodal] User stopped talking")

                # 发送视觉结果
                await websocket.send_json({
                    "type": "vision_result",
                    "data": {
                        "has_face": result.has_face,
                        "is_talking": result.is_talking,
                        "face_bbox": result.face_bbox,
                        "face_distance": result.face_distance,
                        "head_pose": result.head_pose,
                        "confidence": result.confidence,
                        "timestamp": result.timestamp
                    }
                })

            elif msg_type == "audio" and is_talking and enable_audio:
                # 收集音频数据
                audio_data = base64.b64decode(message["data"])
                audio_buffer.append(audio_data)

                await websocket.send_json({
                    "type": "audio_received",
                    "size": len(audio_data)
                })

            elif msg_type == "stats":
                # 返回统计信息
                recent_confidence = sum(h["confidence"] for h in vision_history) / len(
                    vision_history) if vision_history else 0
                face_detected_count = sum(1 for h in vision_history if h["has_face"])

                await websocket.send_json({
                    "type": "statistics",
                    "data": {
                        "avg_confidence": recent_confidence,
                        "face_detection_rate": face_detected_count / len(vision_history) if vision_history else 0,
                        "is_talking": is_talking,
                        "audio_buffer_size": len(audio_buffer),
                        "vision_history_size": len(vision_history)
                    }
                })

            elif msg_type == "ping":
                await websocket.send_json({"type": "pong"})

            elif msg_type == "close":
                break

    except WebSocketDisconnect:
        logger.info("[Vision Multimodal] WebSocket disconnected")
    except Exception as e:
        logger.error(f"[Vision Multimodal] Error: {e}")
        await websocket.send_json({
            "type": "error",
            "message": str(e)
        })
    finally:
        await websocket.close()


# ========================= 批量处理 ===========================
@router.post("/batch", response_model=BatchVisionOutput, summary="Batch Process Images")
async def api_vision_batch_process(
        header: HeaderInfo,
        files: List[UploadFile],
        engine: str = Form(default="default"),
        config: str = Form(default='{}')  # 这个参数名保持不变
):
    """
    批量处理多张图片
    """
    response = Response()
    results = []

    try:
        engine = resolve_vision_engine(engine)
        vision_engine = enginePool.getEngine(ENGINE_TYPE.VISION, engine)
        config_dict = json.loads(config) if config else {}  # config 作为表单参数使用

        for file in files:
            # 读取图片
            image_data = await file.read()
            nparr = np.frombuffer(image_data, np.uint8)
            frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

            # 处理图片
            vision_msg = VisionMessage(frame=frame)
            result = await vision_engine.run(vision_msg, **config_dict)

            results.append({
                "filename": file.filename,
                "has_face": result.has_face,
                "is_talking": result.is_talking,
                "confidence": result.confidence
            })

        response.data = results
    except Exception as e:
        response.data = []
        response.error(str(e))

    return JSONResponse(content=response.validate(BatchVisionOutput), status_code=200)
