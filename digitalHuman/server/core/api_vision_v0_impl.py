# -*- coding: utf-8 -*-

from typing import List, Dict, Any
from digitalHuman.utils import config, logger
from digitalHuman.protocol import *
from digitalHuman.engine import EnginePool
from digitalHuman.server.models import *
import numpy as np

enginePool = EnginePool()



def get_vision_list() -> List[EngineDesc]:

    try:
        # 获取引擎名称列表
        engines = list(enginePool.listEngine(ENGINE_TYPE.VISION))
        logger.info(f"[Vision API] Available engines: {engines}")

        # 返回引擎描述列表
        result = []
        for engine_name in engines:
            try:
                engine = enginePool.getEngine(ENGINE_TYPE.VISION, engine_name)
                result.append(engine.desc())
            except Exception as e:
                logger.error(f"[Vision API] Error getting engine {engine_name} desc: {e}")
        return result
    except Exception as e:
        logger.error(f"[Vision API] Error getting engine list: {e}")
        return []


def get_vision_default() -> EngineDesc:
    try:
        # 检查配置中是否有VISION配置
        if hasattr(config.SERVER, 'ENGINES') and hasattr(config.SERVER.ENGINES, 'VISION'):
            default_name = getattr(config.SERVER.ENGINES.VISION, 'DEFAULT', None)

            # 如果配置为None或空，尝试使用第一个可用引擎
            if not default_name or default_name == 'None':
                engines = list(enginePool.listEngine(ENGINE_TYPE.VISION))
                if engines:
                    default_name = engines[0]
                    logger.info(f"[Vision API] No default configured, using first available: {default_name}")
                else:
                    logger.warning("[Vision API] No vision engines available")
                    return EngineDesc(
                        name="",
                        type=ENGINE_TYPE.VISION,
                        infer_type=INFER_TYPE.NORMAL,
                        desc="No vision engine available",
                        meta={}
                    )

            # 获取引擎描述
            engine = enginePool.getEngine(ENGINE_TYPE.VISION, default_name)
            return engine.desc()
        else:
            # 没有VISION配置，尝试使用第一个可用引擎
            engines = list(enginePool.listEngine(ENGINE_TYPE.VISION))
            if engines:
                default_name = engines[0]
                engine = enginePool.getEngine(ENGINE_TYPE.VISION, default_name)
                logger.info(f"[Vision API] Using first available engine as default: {default_name}")
                return engine.desc()

            # 没有可用引擎
            return EngineDesc(
                name="",
                type=ENGINE_TYPE.VISION,
                infer_type=INFER_TYPE.NORMAL,
                desc="No vision engine available",
                meta={}
            )

    except Exception as e:
        logger.error(f"[Vision API] Error getting default engine: {e}")
        return EngineDesc(
            name="",
            type=ENGINE_TYPE.VISION,
            infer_type=INFER_TYPE.NORMAL,
            desc="Error getting default engine",
            meta={}
        )


def get_vision_param(engine: str) -> List[ParamDesc]:

    try:
        # 获取引擎实例
        vision_engine = enginePool.getEngine(ENGINE_TYPE.VISION, engine)

        # 使用引擎的parameters方法获取参数
        if hasattr(vision_engine, 'parameters'):
            params = vision_engine.parameters()
            logger.info(f"[Vision API] Engine {engine} has {len(params)} parameters")
            return params

        # 如果没有parameters方法，返回空列表
        logger.info(f"[Vision API] Engine {engine} has no parameters method")
        return []

    except Exception as e:
        logger.error(f"[Vision API] Error getting parameters for engine {engine}: {e}")
        return []



class VisionEngineOutput(BaseResponse):
    """视觉引擎输出响应"""
    data: Optional[Dict[str, Any]] = {}


class BatchVisionOutput(BaseResponse):
    """批量处理输出响应"""
    data: Optional[List[Dict[str, Any]]] = []


# ========================= 辅助函数 ===========================
async def process_vision_frame(
        engine_name: str,
        frame: np.ndarray,
        config: Dict = None
) -> FaceDetectionResult:
    """
    处理单帧图像

    Args:
        engine_name: 引擎名称
        frame: 图像帧
        config: 配置参数

    Returns:
        检测结果
    """
    try:
        # 获取引擎
        vision_engine = enginePool.getEngine(ENGINE_TYPE.VISION, engine_name)

        # 创建消息
        vision_msg = VisionMessage(frame=frame)

        # 运行引擎
        result = await vision_engine.run(vision_msg, **(config or {}))

        return result

    except Exception as e:
        logger.error(f"[Vision API] Error processing frame: {e}")
        raise


def analyze_vision_history(history: List[Dict]) -> Dict[str, Any]:
    """
    分析视觉历史数据

    Args:
        history: 历史记录列表

    Returns:
        分析结果
    """
    if not history:
        return {
            "avg_confidence": 0.0,
            "face_detection_rate": 0.0,
            "talking_rate": 0.0,
            "stable_tracking": False
        }

    # 计算统计信息
    total_confidence = sum(h.get("confidence", 0) for h in history)
    face_count = sum(1 for h in history if h.get("has_face", False))
    talking_count = sum(1 for h in history if h.get("is_talking", False))

    avg_confidence = total_confidence / len(history)
    face_detection_rate = face_count / len(history)
    talking_rate = talking_count / len(history)

    # 判断追踪稳定性
    stable_tracking = face_detection_rate > 0.8 and avg_confidence > 0.7

    return {
        "avg_confidence": avg_confidence,
        "face_detection_rate": face_detection_rate,
        "talking_rate": talking_rate,
        "stable_tracking": stable_tracking,
        "total_frames": len(history)
    }


def validate_vision_config(config: Dict) -> Dict:
    """
    验证和规范化视觉配置

    Args:
        config: 原始配置

    Returns:
        规范化后的配置
    """
    validated = {}

    # 定义配置规则
    config_rules = {
        "detect_face_confidence": (float, 0.1, 1.0, 0.7),
        "lip_open_threshold": (float, 0.1, 1.0, 0.5),
        "mar_threshold": (float, 0.1, 1.0, 0.5),
        "swing_head_threshold": (int, 10, 90, 30),
        "up_head_threshold": (int, -90, 0, -10),
        "down_head_threshold": (int, 0, 90, 45),
        "spacing_distance_threshold": (int, 30, 300, 100),
        "focal_distance": (int, 100, 2000, 600),
        "padding": (int, 0, 100, 20),
        "fixed_size": (int, 224, 512, 350),
        "detect_every_n": (int, 1, 10, 5),
        "bbox_smooth_alpha": (float, 0.1, 0.9, 0.6),
        "on_min_frames": (int, 1, 10, 3),
        "off_max_gap_ms": (int, 100, 1000, 600),
        "mar_k_on": (float, 1.0, 4.0, 2.5),
        "mar_k_off": (float, 0.5, 3.0, 1.5)
    }

    for key, (dtype, min_val, max_val, default) in config_rules.items():
        if key in config:
            try:
                value = dtype(config[key])
                # 范围检查
                if dtype in (int, float):
                    value = max(min_val, min(value, max_val))
                validated[key] = value
            except (ValueError, TypeError):
                logger.warning(f"[Vision API] Invalid config value for {key}, using default")
                validated[key] = default

    # 添加其他未定义的配置（保持原样）
    for key, value in config.items():
        if key not in validated:
            validated[key] = value

    return validated


# ========================= 状态管理 ===========================
class VisionSessionManager:
    """视觉会话管理器"""

    def __init__(self):
        self.sessions = {}

    def create_session(self, session_id: str, engine: str, config: Dict = None):
        """创建会话"""
        self.sessions[session_id] = {
            "engine": engine,
            "config": config or {},
            "history": [],
            "is_talking": False,
            "last_update": None
        }

    def update_session(self, session_id: str, result: Dict):
        """更新会话状态"""
        if session_id in self.sessions:
            session = self.sessions[session_id]
            session["history"].append(result)
            session["is_talking"] = result.get("is_talking", False)
            session["last_update"] = result.get("timestamp")

            # 限制历史记录长度
            if len(session["history"]) > 100:
                session["history"] = session["history"][-100:]

    def get_session(self, session_id: str) -> Dict:
        """获取会话"""
        return self.sessions.get(session_id)

    def remove_session(self, session_id: str):
        """移除会话"""
        if session_id in self.sessions:
            del self.sessions[session_id]

    def get_session_stats(self, session_id: str) -> Dict:
        """获取会话统计"""
        session = self.get_session(session_id)
        if not session:
            return {}

        return analyze_vision_history(session["history"])


# 全局会话管理器
vision_session_manager = VisionSessionManager()