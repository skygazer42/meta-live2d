# -*- coding: utf-8 -*-
from ..builder import VisionEngines
from ..engineBase import BaseVisionEngine
from typing import List
from yacs.config import CfgNode as CN
from digitalHuman.protocol import ENGINE_TYPE
from digitalHuman.utils import logger

__all__ = ["VisionFactory"]


class VisionFactory():
    """
    Computer Vision Factory
    """
    @staticmethod
    def create(config: CN) -> BaseVisionEngine:
        if config.NAME in VisionEngines.list():
            logger.info(f"[VisionFactory] Create engine: {config.NAME}")
            # 获取引擎类
            engine_class = VisionEngines.get(config.NAME)
            # 创建实例并传入配置和引擎类型
            engine = engine_class(config=config, engine_type=ENGINE_TYPE.VISION)
            return engine
        else:
            raise RuntimeError(
                f"[VisionFactory] Please check config, support Vision: {VisionEngines.list()}, but get {config.NAME}")

    @staticmethod
    def list() -> List:
        return VisionEngines.list()