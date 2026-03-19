# -*- coding: utf-8 -*-
from typing import List, AsyncGenerator, Optional
from openai import AsyncOpenAI, APIConnectionError
from openai.types.chat import ChatCompletionChunk
from digitalHuman.protocol import RoleMessage

def _normalize_base_url(url: Optional[str]) -> Optional[str]:
    if not url:
        return None
    url = url.strip()
    # 允许用别名快速走官方
    if url.lower() in {"openai", "official", "default"}:
        return "https://api.openai.com/v1"
    # 没写协议就补 https://
    if not (url.startswith("http://") or url.startswith("https://")):
        url = "https://" + url
    return url

class OpenaiLLM:
    @staticmethod
    async def chat(
        base_url: str,
        api_key: str,
        model: str,
        messages: List[RoleMessage],
        **kwargs
    ) -> AsyncGenerator[ChatCompletionChunk, None]:
        base_url = _normalize_base_url(base_url)
        if not base_url:
            base_url = "https://dashscope.aliyuncs.com/compatible-mode/v1"  # 默认走官方

        client = AsyncOpenAI(base_url=base_url, api_key=api_key)

        try:
            completions = await client.chat.completions.create(
                model=model,
                messages=[m.model_dump() for m in messages],
                stream=True,
                **kwargs
            )
        except APIConnectionError as e:
            # 给出更友好的错误信息
            raise RuntimeError(
                f"连接失败：请确认 base_url 是否为完整 URL（例如 https://api.openai.com/v1 ），当前：{base_url!r}"
            ) from e

        async for chunk in completions:
            yield chunk
