# -*- coding: utf-8 -*-
'''
@File    :   parse.py
@Author  :   一力辉
'''

from typing import AsyncGenerator
from digitalHuman.protocol import *

# 很多先进的 Agent 模型，在生成最终答案时，会先把它的“思考过程”也通过流式的方式发送出来，并用特殊的标签（比如 <think>...</think>）包裹。这个函数就是用来**分离“思考过程”和“最终文本”**的。
__all__ = ['resonableStreamingParser']

async def resonableStreamingParser(generator: AsyncGenerator[str, None]):
    chunkBuffer: str = ""
    thinkFlag = False
    async for eventType, chunk in generator:
        # 只有text做解析
        if eventType != EVENT_TYPE.TEXT: 
            yield eventStreamResponse(eventType, chunk)
            continue
        chunkBuffer += chunk
        # 缓存10个字符
        if len(chunkBuffer) < 10:
            continue
        if not thinkFlag and '<think>' in chunkBuffer:
            # 开始标志位判断
            thinkFlag = True
            textContent, thinkContent = chunkBuffer.split('<think>')
            if thinkContent: yield eventStreamThink(thinkContent)
            if textContent: yield eventStreamText(textContent)
            chunkBuffer = ""
            continue
        if thinkFlag and '</think>' in chunkBuffer:
            # 结束标志位判断
            thinkFlag = False
            thinkContent, textContent = chunkBuffer.split('</think>')
            if thinkContent: yield eventStreamThink(thinkContent)
            if textContent: yield eventStreamText(textContent)
            chunkBuffer = ""
            continue
        chunkBuffer, content = chunkBuffer[-10:], chunkBuffer[:-10]
        if thinkFlag:
            yield eventStreamThink(content)
        else:
            yield eventStreamText(content)
    if chunkBuffer:
        if thinkFlag:
            # 结束标志位判断
            if '</think>' in chunkBuffer:
                thinkFlag = False
                thinkContent, textContent = content.split('</think>')
                yield eventStreamThink(thinkContent)
                yield eventStreamText(textContent)
            else:
                yield eventStreamThink(chunkBuffer)
        else:
            yield eventStreamText(chunkBuffer)