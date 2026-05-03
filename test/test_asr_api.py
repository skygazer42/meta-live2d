# -*- coding: utf-8 -*-
'''
@File    :   test_asr_api.py
@Author  :   一力辉 
'''

import pytest
from httpx import AsyncClient

class Test_ASR_API():
    @pytest.mark.asyncio(scope="session")
    async def test_list(self, version: str, client: AsyncClient):
        url = f"/adh/asr/{version}/engine"
        resp = await client.get(url)
        assert resp.status_code == 200
        resp = resp.json()
        assert resp["code"] == 0
        assert len(resp["data"]) >= 1
        assert all(engine["type"] == "ASR" for engine in resp["data"])

    @pytest.mark.asyncio(scope="session")
    async def test_default(self, version: str, client: AsyncClient):
        url = f"/adh/asr/{version}/engine/default"
        resp = await client.get(url)
        assert resp.status_code == 200
        resp = resp.json()
        assert resp["code"] == 0
        assert resp["data"]["type"] == "ASR"
