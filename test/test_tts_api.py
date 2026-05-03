# -*- coding: utf-8 -*-
"""
TTS API contract tests.
"""

import pytest
from httpx import AsyncClient


class Test_TTS_API:
    @pytest.mark.asyncio(scope="session")
    async def test_list(self, version: str, client: AsyncClient):
        url = f"/adh/tts/{version}/engine"
        resp = await client.get(url)
        assert resp.status_code == 200
        resp = resp.json()
        assert resp["code"] == 0
        assert len(resp["data"]) >= 1
        assert all(engine["type"] == "TTS" for engine in resp["data"])

    @pytest.mark.asyncio(scope="session")
    async def test_edge_api_param(self, version: str, client: AsyncClient):
        url = f"/adh/tts/{version}/engine/EdgeTTS"
        resp = await client.get(url)
        assert resp.status_code == 200
        resp = resp.json()
        assert resp["code"] == 0
        assert any(param["name"] == "voice" for param in resp["data"])
