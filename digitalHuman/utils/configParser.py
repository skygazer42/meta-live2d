from pathlib import Path
from os import PathLike
from typing import Union
from yacs.config import CfgNode as CN
from digitalHuman.utils.env import CONFIG_ROOT_PATH, CONFIG_FILE

__all__ = ['config']

# 放宽 parseConfig 的入参类型，允许 PathLike
def parseConfig(configFile: Union[str, PathLike[str]]) -> CN:
    with open(configFile, 'r', encoding='utf-8') as f:
        return CN.load_cfg(f)

def parseServerConfig(config: CN) -> None:
    root = Path(CONFIG_ROOT_PATH)

    def _load_list(subdir: str, files):
        out = []
        for fn in files:
            if isinstance(fn, CN):
                out.append(fn)
            else:
                out.append(parseConfig(root / "engines" / subdir / str(fn)))
        return out

    def _load_default(subdir: str, default_file):
        if not default_file:
            return None
        return parseConfig(root / "engines" / subdir / str(default_file)).NAME

    # ---------- ENGINES: ASR / TTS / LLM ----------
    config.ENGINES.ASR.SUPPORT_LIST = _load_list("asr", config.ENGINES.ASR.SUPPORT_LIST)
    config.ENGINES.TTS.SUPPORT_LIST = _load_list("tts", config.ENGINES.TTS.SUPPORT_LIST)
    config.ENGINES.LLM.SUPPORT_LIST = _load_list("llm", config.ENGINES.LLM.SUPPORT_LIST)
    config.ENGINES.ASR.DEFAULT = _load_default("asr", config.ENGINES.ASR.DEFAULT)
    config.ENGINES.TTS.DEFAULT = _load_default("tts", config.ENGINES.TTS.DEFAULT)
    config.ENGINES.LLM.DEFAULT = _load_default("llm", config.ENGINES.LLM.DEFAULT)

    # ---------- ENGINES: VISION----------
    if hasattr(config.ENGINES, "VISION"):
        config.ENGINES.VISION.SUPPORT_LIST = _load_list("vision", config.ENGINES.VISION.SUPPORT_LIST)
        config.ENGINES.VISION.DEFAULT = _load_default("vision", config.ENGINES.VISION.DEFAULT)
    else:
        config.ENGINES.VISION = CN()
        config.ENGINES.VISION.SUPPORT_LIST = []
        config.ENGINES.VISION.DEFAULT = None

    # ---------- AGENTS ----------
    config.AGENTS.SUPPORT_LIST = [
        parseConfig(root / "agents" / str(f)) if not isinstance(f, CN) else f
        for f in config.AGENTS.SUPPORT_LIST
    ]
    config.AGENTS.DEFAULT = (
        parseConfig(root / "agents" / str(config.AGENTS.DEFAULT)).NAME
        if config.AGENTS.DEFAULT else None
    )

def getConfig(configFile: Union[str, PathLike[str]]) -> CN:
    with open(configFile, 'r', encoding='utf-8') as f:
        cfg = CN.load_cfg(f)
        parseServerConfig(cfg.SERVER)
        cfg.freeze()
        return cfg

config = getConfig(CONFIG_FILE)
