# -*- coding: utf-8 -*-
'''
@File    :   app.py
@Author  :   一力辉 
'''

# 1. 导入项目需要的各个组件
import uvicorn  # 导入uvicorn服务器这是实际运行网络服务的**“服务器引擎”**。uvicorn 是一个高性能的 ASGI 服务器，专门用来运行像 FastAPI 这样的现代 Python Web 框架。
from digitalHuman.engine import EnginePool  # 导入引擎池
from digitalHuman.agent import AgentPool  # 导入智能体池  这个是我们很熟悉的智能体池
from digitalHuman.server import app  # 导入Web应用实例
from digitalHuman.utils import config  # 导入配置工具

# 定义此文件可以被外部引用的成员，这里是 runServer 函数
__all__ = ["runServer"]


# 2. 定义核心的服务器启动函数
def runServer():
    # 步骤 A: 初始化并配置“引擎池”
    enginePool = EnginePool()
    enginePool.setup(config.SERVER.ENGINES)

    # 步骤 B: 初始化并配置“智能体池”
    agentPool = AgentPool()
    agentPool.setup(config.SERVER.AGENTS)

    # 步骤 C: 启动uvicorn网络服务器
    uvicorn.run(app, host=config.SERVER.IP, port=config.SERVER.PORT, log_level="info")