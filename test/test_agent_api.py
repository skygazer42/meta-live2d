# -*- coding: utf-8 -*-
'''
@File    :   test_asr_api.py
@Author  :   一力辉 
'''

import pytest
from httpx import AsyncClient


class Test_AGENT_API():
    # ======================== list ==========================
    @pytest.mark.asyncio(scope="session")
    async def test_list(self, version: str, client: AsyncClient):
        url = f"/adh/agent/{version}/engine"
        resp = await client.get(url)
        assert resp.status_code == 200
        resp = resp.json()
        assert resp["code"] == 0
        assert len(resp["data"]) >= 1
        assert any(engine["name"] == "Repeater" for engine in resp["data"])

    # ====================== repeater ========================
    @pytest.mark.asyncio(scope="session")
    async def test_repeater_text_infer(self, version: str, client: AsyncClient):
        url = f"/adh/agent/{version}/engine"
        item = {
            "engine": "Repeater",
            "config": {},
            "data": "你好",
        }
        resp = await client.post(url, json=item)
        assert resp.status_code == 200
        content = resp.text
        assert "event: TEXT" in content
        assert "data: 你好" in content
        assert "event: DONE" in content
