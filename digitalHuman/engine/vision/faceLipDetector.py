# -*- coding: utf-8 -*-

import asyncio
import os
import threading
from collections import deque
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

import cv2
import mediapipe as mp
import numpy as np
import onnxruntime as ort

from ..builder import VisionEngines
from ..engineBase import BaseVisionEngine
from digitalHuman.protocol import *
from digitalHuman.utils import logger

try:
    from mediapipe.tasks.python import vision as mp_vision
    from mediapipe.tasks.python.core.base_options import BaseOptions as MPBaseOptions
    from mediapipe.tasks.python.vision.core.image import (
        Image as MPImage,
        ImageFormat as MPImageFormat,
    )
except Exception:
    mp_vision = None
    MPBaseOptions = None
    MPImage = None
    MPImageFormat = None

__all__ = ["FaceLipDetector"]

PROJECT_ROOT = Path(__file__).resolve().parents[3]


@VisionEngines.register("FaceLipDetector")
class FaceLipDetector(BaseVisionEngine):
    """人脸和唇形检测引擎 - 简化版"""

    def setup(self):
        """初始化配置"""
        params = self._extract_parameters()

        # ========== 优化参数 ==========
        self.detect_every_n = int(params.get("detect_every_n", 5))
        self._frame_idx = 0
        self._last_bbox = None
        self._bbox_alpha = float(params.get("bbox_smooth_alpha", 0.6))

        # ========== MediaPipe 配置 ==========
        confidence = float(params.get("detect_face_confidence", 0.7))
        self.mediapipe_mode = str(params.get("mediapipe_mode", "auto")).strip().lower()
        self.face_detection_model_path = self._resolve_local_path(
            str(params.get("face_detection_model_path", "") or "").strip()
        )
        self.face_landmarker_model_path = self._resolve_local_path(
            str(params.get("face_landmarker_model_path", "") or "").strip()
        )
        self._mediapipe_backend = self._resolve_mediapipe_backend()
        self._setup_mediapipe_backend(confidence)

        # ========== ONNX 模型配置 ==========
        model_path = self._resolve_local_path(
            str(params.get("model_path", "/data/temp21/digital-human/models/lip_model.onnx"))
        )
        sess_options = ort.SessionOptions()
        sess_options.intra_op_num_threads = 4
        sess_options.inter_op_num_threads = 2

        providers = ["CPUExecutionProvider"]
        self.session = None
        self.input_name = ""
        self.output_name = ""
        try:
            self.session = ort.InferenceSession(model_path, sess_options=sess_options, providers=providers)
            self.input_name = self.session.get_inputs()[0].name
            self.output_name = self.session.get_outputs()[0].name
            self.use_lstm = True
            logger.info("[FaceLipDetector] LSTM model loaded successfully")
        except Exception as e:
            logger.warning(f"[FaceLipDetector] Failed to load LSTM model: {e}")
            self.use_lstm = False

        # ========== 简化检测参数 ==========
        self.mar_threshold = float(params.get("mar_threshold", 0.03))
        self.lip_moving_history = deque(maxlen=8)
        self.d_normalized_history = deque(maxlen=25)
        self.selected_landmarks_lst = deque(maxlen=50)

        self.padding = int(params.get("padding", 20))
        self.fixed_size = int(params.get("fixed_size", 350))
        self.focal_distance = int(params.get("focal_distance", 600))
        self.spacing_distance_threshold = int(params.get("spacing_distance_threshold", 100))

        self.has_person = False
        self.is_talking = False
        self.lock = threading.Lock()

        logger.info(f"[FaceLipDetector] Vision engine initialized with mediapipe backend: {self._mediapipe_backend}")

    def release(self):
        for attr_name in ("face_detection", "face_mesh"):
            engine = getattr(self, attr_name, None)
            if engine and hasattr(engine, "close"):
                try:
                    engine.close()
                except Exception as e:
                    logger.debug(f"[FaceLipDetector] Failed to close {attr_name}: {e}")

    def _extract_parameters(self) -> Dict[str, Any]:
        """从配置中提取参数"""
        params = {}

        if hasattr(self.cfg, 'PARAMETERS'):
            for param in self.cfg.PARAMETERS:
                if isinstance(param, dict):
                    params[param['name']] = param.get('default', None)
                else:
                    params[param.name] = param.get('default', None)
        elif isinstance(self.cfg, dict):
            if 'PARAMETERS' in self.cfg:
                for param in self.cfg['PARAMETERS']:
                    params[param['name']] = param.get('default', None)
            else:
                params = self.cfg.copy()

        return params

    def _resolve_local_path(self, path: str) -> str:
        if not path:
            return ""

        expanded = Path(path).expanduser()
        if expanded.is_absolute():
            return str(expanded)

        cwd_candidate = (Path.cwd() / expanded).resolve()
        if cwd_candidate.exists():
            return str(cwd_candidate)

        return str((PROJECT_ROOT / expanded).resolve())

    def _resolve_mediapipe_backend(self) -> str:
        if self.mediapipe_mode not in {"auto", "solutions", "tasks"}:
            raise RuntimeError(
                f"Unsupported mediapipe_mode: {self.mediapipe_mode}. "
                "Expected one of auto, solutions, tasks."
            )

        if self.mediapipe_mode == "solutions":
            if not hasattr(mp, "solutions"):
                raise RuntimeError("MediaPipe solutions backend is unavailable in the installed mediapipe package")
            return "solutions"

        if self.mediapipe_mode == "tasks":
            self._validate_tasks_runtime()
            self._validate_task_model_paths()
            return "tasks"

        if hasattr(mp, "solutions"):
            return "solutions"

        self._validate_tasks_runtime()
        self._validate_task_model_paths()
        return "tasks"

    def _validate_tasks_runtime(self):
        if not all((mp_vision, MPBaseOptions, MPImage, MPImageFormat)):
            raise RuntimeError("MediaPipe tasks runtime is unavailable in the installed mediapipe package")

    def _validate_task_model_paths(self):
        missing = []
        for path in (self.face_detection_model_path, self.face_landmarker_model_path):
            if not path or not os.path.exists(path):
                missing.append(path or "<empty>")
        if missing:
            raise RuntimeError(
                "MediaPipe tasks backend requires existing face_detection_model_path and "
                f"face_landmarker_model_path, missing: {missing}"
            )

    def _build_task_base_options(self, model_path: str):
        kwargs = {"model_asset_path": model_path}
        delegate_enum = getattr(MPBaseOptions, "Delegate", None)
        if delegate_enum is not None and hasattr(delegate_enum, "CPU"):
            kwargs["delegate"] = delegate_enum.CPU
        return MPBaseOptions(**kwargs)

    def _setup_mediapipe_backend(self, confidence: float):
        if self._mediapipe_backend == "solutions":
            self.face_detection = mp.solutions.face_detection.FaceDetection(
                model_selection=0,
                min_detection_confidence=confidence
            )

            self.face_mesh = mp.solutions.face_mesh.FaceMesh(
                static_image_mode=False,
                refine_landmarks=False,
                max_num_faces=1,
                min_detection_confidence=confidence,
                min_tracking_confidence=confidence
            )
            return

        detector_options = mp_vision.FaceDetectorOptions(
            base_options=self._build_task_base_options(self.face_detection_model_path),
            running_mode=mp_vision.RunningMode.IMAGE,
            min_detection_confidence=confidence,
        )
        self.face_detection = mp_vision.FaceDetector.create_from_options(detector_options)

        landmarker_options = mp_vision.FaceLandmarkerOptions(
            base_options=self._build_task_base_options(self.face_landmarker_model_path),
            running_mode=mp_vision.RunningMode.IMAGE,
            num_faces=1,
            min_face_detection_confidence=confidence,
            min_face_presence_confidence=confidence,
            min_tracking_confidence=confidence,
            output_face_blendshapes=False,
            output_facial_transformation_matrixes=False,
        )
        self.face_mesh = mp_vision.FaceLandmarker.create_from_options(landmarker_options)

    def _create_task_image(self, rgb_image: np.ndarray):
        return MPImage(image_format=MPImageFormat.SRGB, data=rgb_image)

    async def run(self, input: VisionMessage, **kwargs) -> FaceDetectionResult:
        """处理视频帧并返回检测结果"""
        frame = input.frame
        result = await self.process_frame(frame, **kwargs)

        return FaceDetectionResult(
            has_face=result["has_face"],
            is_talking=result["is_talking"],
            face_bbox=result.get("face_bbox"),
            face_distance=result.get("face_distance", 0),
            head_pose=result.get("head_pose", {}),
            confidence=result.get("confidence", 0.0),
            timestamp=getattr(input, "timestamp", None)
        )

    async def process_frame(self, frame: np.ndarray, **kwargs) -> dict:
        """处理单帧图像"""
        return await asyncio.get_event_loop().run_in_executor(
            None, self._process_frame_sync, frame
        )

    def _process_frame_sync(self, frame: np.ndarray) -> dict:
        """同步处理单帧图像 - 简化版"""
        result = {
            "has_face": False,
            "is_talking": False,
            "face_bbox": None,
            "face_distance": 0,
            "head_pose": {},
            "confidence": 0.0
        }

        try:
            self._frame_idx += 1

            if self._frame_idx % self.detect_every_n == 1 or self._last_bbox is None:
                bbox = self._detect_face(frame)
                if bbox:
                    self._last_bbox = self._smooth_bbox(self._last_bbox, bbox)
            else:
                bbox = self._last_bbox

            if bbox:
                result["has_face"] = True
                x_min, y_min, width, height = bbox[:4]
                result["face_bbox"] = [x_min, y_min, width, height]

                if len(bbox) >= 6:
                    face_distance = self._calculate_face_distance(bbox)
                    result["face_distance"] = face_distance
                else:
                    result["face_distance"] = 50

                face_roi = self._extract_face_roi(frame, bbox)
                landmarks = self._detect_landmarks(face_roi)

                if landmarks is not None:
                    is_talking, confidence = self._detect_lip_movement_simple(landmarks)
                    result["is_talking"] = is_talking
                    result["confidence"] = confidence

                    swing, nodding = self._calculate_head_pose(landmarks)
                    result["head_pose"] = {"swing": swing, "nodding": nodding}
            else:
                self._last_bbox = None
                self.has_person = False
                self.lip_moving_history.clear()
                self.d_normalized_history.clear()

        except Exception as e:
            logger.error(f"[FaceLipDetector] Error processing frame: {e}")

        return result

    def _detect_lip_movement_simple(self, landmarks: np.ndarray) -> Tuple[bool, float]:
        """简化的唇动检测"""
        mar = self._calculate_mouth_aspect_ratio(landmarks)
        detected_mar = mar > self.mar_threshold

        detected_lstm = False
        lstm_confidence = 0.0

        if self.use_lstm:
            self.selected_landmarks_lst.append(landmarks)
            if len(self.selected_landmarks_lst) >= 25:
                distances = []
                for lm in list(self.selected_landmarks_lst)[-25:]:
                    _, d_norm = self._calculate_lip_distance(lm)
                    distances.append(d_norm)

                self.d_normalized_history = deque(distances, maxlen=25)

                if len(self.d_normalized_history) >= 25 and self.session is not None:
                    try:
                        normalized = self._normalize(list(self.d_normalized_history))
                        input_array = np.array(normalized, dtype=np.float32).reshape(1, 25, 1)

                        with self.lock:
                            y_pred = self.session.run([self.output_name], {self.input_name: input_array})

                        predict = np.argmax(y_pred[0], axis=-1)
                        detected_lstm = int(predict) == 1
                        lstm_confidence = 0.6 if detected_lstm else 0.3
                    except Exception as e:
                        logger.debug(f"[FaceLipDetector] LSTM prediction error: {e}")

        detected = detected_mar or detected_lstm
        self.lip_moving_history.append(detected)

        if len(self.lip_moving_history) >= 8:
            talking_count = sum(self.lip_moving_history)
            is_talking = talking_count >= 3
        else:
            is_talking = detected

        mar_confidence = min(mar / self.mar_threshold, 1.0) if mar > 0 else 0
        confidence = max(mar_confidence, lstm_confidence)

        if self._frame_idx % 30 == 0:
            logger.debug(
                f"[FaceLipDetector] MAR: {mar:.3f}, Threshold: {self.mar_threshold:.3f}, Talking: {is_talking}"
            )

        return is_talking, float(np.clip(confidence, 0.1, 0.95))

    def _smooth_bbox(self, prev, cur, alpha=0.6):
        """平滑边界框"""
        if prev is None:
            return cur

        smoothed = []
        for i in range(min(len(prev), len(cur))):
            if isinstance(prev[i], (int, float)) and isinstance(cur[i], (int, float)):
                smoothed.append(int(alpha * prev[i] + (1 - alpha) * cur[i]))
            else:
                smoothed.append(cur[i])

        return tuple(smoothed)

    def _detect_face(self, frame: np.ndarray) -> Optional[tuple]:
        """检测人脸"""
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        frame_height, frame_width, _ = frame.shape

        if self._mediapipe_backend == "solutions":
            results = self.face_detection.process(rgb_frame)

            if not results.detections:
                return None

            best_detection = max(
                results.detections,
                key=lambda d: d.location_data.relative_bounding_box.width *
                d.location_data.relative_bounding_box.height
            )

            bbox = best_detection.location_data.relative_bounding_box
            x_min = int(bbox.xmin * frame_width)
            y_min = int(bbox.ymin * frame_height)
            width = int(bbox.width * frame_width)
            height = int(bbox.height * frame_height)

            if hasattr(best_detection.location_data, 'relative_keypoints'):
                rk = best_detection.location_data.relative_keypoints
                if len(rk) >= 2:
                    right_eye = (rk[0].x * frame_width, rk[0].y * frame_height)
                    left_eye = (rk[1].x * frame_width, rk[1].y * frame_height)
                    return (x_min, y_min, width, height, right_eye, left_eye)

            return (x_min, y_min, width, height)

        with self.lock:
            results = self.face_detection.detect(self._create_task_image(rgb_frame))

        if not results.detections:
            return None

        best_detection = max(
            results.detections,
            key=lambda detection: detection.bounding_box.width * detection.bounding_box.height
        )
        bbox = best_detection.bounding_box
        x_min = int(bbox.origin_x)
        y_min = int(bbox.origin_y)
        width = int(bbox.width)
        height = int(bbox.height)

        if best_detection.keypoints and len(best_detection.keypoints) >= 2:
            right_eye = (
                best_detection.keypoints[0].x * frame_width,
                best_detection.keypoints[0].y * frame_height,
            )
            left_eye = (
                best_detection.keypoints[1].x * frame_width,
                best_detection.keypoints[1].y * frame_height,
            )
            return (x_min, y_min, width, height, right_eye, left_eye)

        return (x_min, y_min, width, height)

    def _extract_face_roi(self, frame: np.ndarray, bbox: tuple) -> Optional[np.ndarray]:
        """提取人脸区域"""
        x_min, y_min, width, height = bbox[:4]
        frame_height, frame_width = frame.shape[:2]

        x_min_padded = max(0, x_min - self.padding)
        y_min_padded = max(0, y_min - self.padding)
        x_max_padded = min(frame_width, x_min + width + self.padding)
        y_max_padded = min(frame_height, y_min + height + self.padding)

        face_roi = frame[y_min_padded:y_max_padded, x_min_padded:x_max_padded]

        if face_roi.size > 0:
            return cv2.resize(face_roi, (self.fixed_size, self.fixed_size))

        return None

    def _detect_landmarks(self, face_roi: Optional[np.ndarray]) -> Optional[np.ndarray]:
        """检测面部特征点"""
        if face_roi is None or face_roi.size == 0:
            return None

        rgb_face = cv2.cvtColor(face_roi, cv2.COLOR_BGR2RGB)

        if self._mediapipe_backend == "solutions":
            with self.lock:
                output = self.face_mesh.process(rgb_face)

            if not output.multi_face_landmarks:
                return None

            landmarks = output.multi_face_landmarks[0].landmark
        else:
            with self.lock:
                output = self.face_mesh.detect(self._create_task_image(rgb_face))

            if not output.face_landmarks:
                return None

            landmarks = output.face_landmarks[0]

        return np.array(
            [(lm.x * self.fixed_size, lm.y * self.fixed_size) for lm in landmarks],
            dtype=np.float32
        )

    def _calculate_mouth_aspect_ratio(self, landmarks: np.ndarray) -> float:
        """计算嘴唇纵横比（MAR）- 简化版"""
        upper_idx = np.array([13, 81, 82, 312, 311])
        lower_idx = np.array([14, 178, 87, 317, 402])

        vertical = np.linalg.norm(
            landmarks[upper_idx] - landmarks[lower_idx], axis=1
        ).mean()
        horizontal = np.linalg.norm(landmarks[61] - landmarks[291])

        return vertical / (horizontal + 1e-6)

    def _calculate_lip_distance(self, landmarks: np.ndarray) -> Tuple[float, float]:
        """计算唇部距离特征"""
        mar = self._calculate_mouth_aspect_ratio(landmarks)
        upper_lip = landmarks[13, 1]
        lower_lip = landmarks[14, 1]
        distance_upper_lip = abs(upper_lip - lower_lip)
        d_norm = distance_upper_lip / 10.0

        return mar, d_norm

    def _normalize(self, data: list) -> list:
        """MinMax归一化"""
        data_array = np.array(data)
        min_val = np.min(data_array)
        max_val = np.max(data_array)

        if max_val == min_val:
            return data

        normalized = (data_array - min_val) / (max_val - min_val)
        return normalized.tolist()

    def _calculate_head_pose(self, landmarks: np.ndarray) -> Tuple[float, float]:
        """计算头部姿态角度"""
        left_eye = landmarks[33]
        right_eye = landmarks[263]
        nose_tip = landmarks[1]

        eye_center = (left_eye + right_eye) / 2
        interocular_distance = np.linalg.norm(right_eye - left_eye)

        eye_nose_delta_x = nose_tip[0] - eye_center[0]
        swing_angle = np.degrees(np.arctan2(abs(eye_nose_delta_x), interocular_distance))

        eye_nose_delta_y = nose_tip[1] - eye_center[1]
        nodding_angle = np.degrees(np.arctan2(abs(eye_nose_delta_y), interocular_distance))

        return swing_angle, nodding_angle

    def _calculate_face_distance(self, bbox: tuple) -> float:
        """计算人脸到摄像头的距离"""
        if len(bbox) < 6:
            return 50.0

        _, _, _, _, left_eye, right_eye = bbox
        eye_distance = np.linalg.norm(np.array(left_eye) - np.array(right_eye))
        return (6.3 * self.focal_distance) / (eye_distance + 1e-6)
