# -*- coding: utf-8 -*-

import asyncio
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

import cv2
import numpy as np

from ..builder import VisionEngines
from ..engineBase import BaseVisionEngine
from digitalHuman.protocol import FaceDetectionResult, VisionMessage

__all__ = ["OpenCVFaceDetector"]


@VisionEngines.register("OpenCVFaceDetector")
class OpenCVFaceDetector(BaseVisionEngine):
    """OpenCV-based fallback face detector."""

    def setup(self):
        cascade_path = Path(cv2.data.haarcascades) / "haarcascade_frontalface_default.xml"
        self._classifier = cv2.CascadeClassifier(str(cascade_path))
        if self._classifier.empty():
            raise RuntimeError(f"Failed to load OpenCV cascade classifier: {cascade_path}")

        self.scale_factor = 1.1
        self.min_neighbors = 5
        self.min_face_size = (48, 48)

    async def run(self, input: VisionMessage, **kwargs) -> FaceDetectionResult:
        result = await self.process_frame(input.frame, **kwargs)
        return FaceDetectionResult(
            has_face=result["has_face"],
            is_talking=result["is_talking"],
            face_bbox=result.get("face_bbox"),
            face_distance=result.get("face_distance", 0),
            head_pose=result.get("head_pose", {}),
            confidence=result.get("confidence", 0.0),
            timestamp=getattr(input, "timestamp", None),
        )

    async def process_frame(self, frame: np.ndarray, **kwargs) -> Dict[str, Any]:
        return await asyncio.get_event_loop().run_in_executor(None, self._process_frame_sync, frame)

    def _process_frame_sync(self, frame: np.ndarray) -> Dict[str, Any]:
        result = {
            "has_face": False,
            "is_talking": False,
            "face_bbox": None,
            "face_distance": 0,
            "head_pose": {},
            "confidence": 0.0,
        }

        if frame is None or not isinstance(frame, np.ndarray) or frame.size == 0:
            return result

        gray = self._to_gray(frame)
        faces = self._classifier.detectMultiScale(
            gray,
            scaleFactor=self.scale_factor,
            minNeighbors=self.min_neighbors,
            minSize=self.min_face_size,
        )

        if len(faces) == 0:
            return result

        x, y, w, h = self._select_primary_face(faces)
        frame_h, frame_w = gray.shape[:2]
        area_ratio = float((w * h) / max(frame_h * frame_w, 1))

        result["has_face"] = True
        result["face_bbox"] = [int(x), int(y), int(w), int(h)]
        result["face_distance"] = max(1, min(100, int((w / max(frame_w, 1)) * 100)))
        result["confidence"] = max(0.2, min(0.95, area_ratio * 8.0))
        return result

    def _to_gray(self, frame: np.ndarray) -> np.ndarray:
        if frame.ndim == 2:
            return frame
        if frame.shape[2] == 4:
            return cv2.cvtColor(frame, cv2.COLOR_BGRA2GRAY)
        return cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)

    def _select_primary_face(self, faces: np.ndarray) -> Tuple[int, int, int, int]:
        largest = max(faces, key=lambda item: int(item[2]) * int(item[3]))
        return tuple(int(value) for value in largest)
