# -*- coding: utf-8 -*-
'''
@File    :   enginePool.py
@Author  :   一力辉 
'''

from threading import RLock
from typing import Dict, List
from collections import defaultdict
from yacs.config import CfgNode as CN
from digitalHuman.utils import logger
from digitalHuman.protocol import ENGINE_TYPE
from .engineBase import BaseEngine
from .asr import ASRFactory
from .tts import TTSFactory
from .llm import LLMFactory
from .vision import VisionFactory
__all__ = ["EnginePool"]

class EnginePool():
    singleLock = RLock()
    _init = False

    def __init__(self):
        if not self._init:
            self._pool = defaultdict(dict)
            self._errors = defaultdict(dict)
            self._init = True
    
    # Single Instance
    def __new__(cls, *args, **kwargs):
        with EnginePool.singleLock:
            if not hasattr(cls, '_instance'):
                EnginePool._instance = super().__new__(cls)
        return EnginePool._instance

    def __del__(self):
        self._pool.clear()
        self._errors.clear()
        self._init = False

    def _register_engine(self, engine_type: ENGINE_TYPE, factory, engine_cfg: CN, label: str):
        try:
            self._pool[engine_type][engine_cfg.NAME] = factory.create(engine_cfg)
            self._errors[engine_type].pop(engine_cfg.NAME, None)
            logger.info(f"[EnginePool] {label} Engine {engine_cfg.NAME} is created.")
        except Exception as e:
            self._errors[engine_type][engine_cfg.NAME] = str(e)
            logger.warning(f"[EnginePool] Failed to create {label} engine {engine_cfg.NAME}: {e}")
    
    def setup(self, config: CN):
        self._pool.clear()
        self._errors.clear()
        # asr
        for asrCfg in config.ASR.SUPPORT_LIST:
            self._register_engine(ENGINE_TYPE.ASR, ASRFactory, asrCfg, "ASR")
        logger.info(f"[EnginePool] ASR Engine default is {config.ASR.DEFAULT}.")
        # tts
        for ttsCfg in config.TTS.SUPPORT_LIST:
            self._register_engine(ENGINE_TYPE.TTS, TTSFactory, ttsCfg, "TTS")
        logger.info(f"[EnginePool] TTS Engine default is {config.TTS.DEFAULT}.")
        # llm 大脑
        for llmCfg in config.LLM.SUPPORT_LIST:
            self._register_engine(ENGINE_TYPE.LLM, LLMFactory, llmCfg, "LLM")
        logger.info(f"[EnginePool] LLM Engine default is {config.LLM.DEFAULT}.")

        if hasattr(config, 'VISION') and config.VISION:
            if hasattr(config.VISION, 'SUPPORT_LIST'):
                for visionCfg in config.VISION.SUPPORT_LIST:
                    self._register_engine(ENGINE_TYPE.VISION, VisionFactory, visionCfg, "Vision")
    def listEngine(self, engineType: ENGINE_TYPE) -> List[str]:
        if engineType not in self._pool: return []
        return self._pool[engineType].keys()

    def getEngineErrors(self, engineType: ENGINE_TYPE) -> Dict[str, str]:
        if engineType not in self._errors:
            return {}
        return dict(self._errors[engineType])
            
    def getEngine(self, engineType: ENGINE_TYPE, engineName: str) -> BaseEngine:
        if engineType not in self._pool:
            raise KeyError(f"[EnginePool] No such engine type: {engineType}")
        if engineName not in self._pool[engineType]:
            raise KeyError(f"[EnginePool] No such engine: {engineName}")
        return self._pool[engineType][engineName]
