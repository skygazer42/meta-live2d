# -*- coding: utf-8 -*-

import cv2
import numpy as np
import mediapipe as mp
import onnxruntime as ort
from collections import deque
from typing import Dict, Optional, Tuple, Any
from ..builder import VisionEngines
from ..engineBase import BaseVisionEngine
from digitalHuman.protocol import *
from digitalHuman.utils import logger
import asyncio
import threading
import time

__all__ = ["FaceLipDetector"]


@VisionEngines.register("FaceLipDetector")
class FaceLipDetector(BaseVisionEngine):
    """人脸和唇形检测引擎 - 简化版"""

    def setup(self):
        """初始化配置"""
        params = self._extract_parameters()

        # ========== 优化参数 ==========
        # 人脸检测降频
        self.detect_every_n = int(params.get("detect_every_n", 5))
        self._frame_idx = 0
        self._last_bbox = None
        self._bbox_alpha = float(params.get("bbox_smooth_alpha", 0.6))

        # ========== MediaPipe配置 ==========
        confidence = float(params.get("detect_face_confidence", 0.7))
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

        # ========== ONNX模型配置 ==========
        model_path = params.get("model_path", "/data/temp21/digital-human/models/lip_model.onnx")
        sess_options = ort.SessionOptions()
        sess_options.intra_op_num_threads = 4
        sess_options.inter_op_num_threads = 2

        providers = ["CPUExecutionProvider"]
        try:
            self.session = ort.InferenceSession(model_path, sess_options=sess_options, providers=providers)
            self.input_name = self.session.get_inputs()[0].name
            self.output_name = self.session.get_outputs()[0].name
            self.use_lstm = True
            logger.info(f"[FaceLipDetector] LSTM model loaded successfully")
        except Exception as e:
            logger.warning(f"[FaceLipDetector] Failed to load LSTM model: {e}")
            self.use_lstm = False

        # ========== 简化的检测参数 ==========
        # MAR阈值 - 大幅降低
        self.mar_threshold = float(params.get("mar_threshold", 0.03))  # 从0.5降到0.15

        # 唇动检测历史
        self.lip_moving_history = deque(maxlen=8)  # 用于判断是否在说话
        self.d_normalized_history = deque(maxlen=25)  # LSTM输入历史
        self.selected_landmarks_lst = deque(maxlen=50)

        # 简化的参数
        self.padding = int(params.get("padding", 20))
        self.fixed_size = int(params.get("fixed_size", 350))
        self.focal_distance = int(params.get("focal_distance", 600))
        self.spacing_distance_threshold = int(params.get("spacing_distance_threshold", 100))

        # 状态追踪
        self.has_person = False
        self.is_talking = False

        # 线程安全
        self.lock = threading.Lock()

        logger.info("[FaceLipDetector] Vision engine initialized (simplified version)")

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

            # ========== 人脸检测 ==========
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

                # 计算人脸距离
                if len(bbox) >= 6:
                    face_distance = self._calculate_face_distance(bbox)
                    result["face_distance"] = face_distance
                else:
                    result["face_distance"] = 50  # 默认距离

                # 提取人脸区域
                face_roi = self._extract_face_roi(frame, bbox)

                # 检测面部特征点
                landmarks = self._detect_landmarks(face_roi)

                if landmarks is not None:
                    # 简化的唇动检测
                    is_talking, confidence = self._detect_lip_movement_simple(landmarks)
                    result["is_talking"] = is_talking
                    result["confidence"] = confidence

                    # 计算头部姿态（可选）
                    swing, nodding = self._calculate_head_pose(landmarks)
                    result["head_pose"] = {"swing": swing, "nodding": nodding}
            else:
                # 无人脸时重置
                self._last_bbox = None
                self.has_person = False
                self.lip_moving_history.clear()
                self.d_normalized_history.clear()

        except Exception as e:
            logger.error(f"[FaceLipDetector] Error processing frame: {e}")

        return result

    def _detect_lip_movement_simple(self, landmarks: np.ndarray) -> Tuple[bool, float]:
        """简化的唇动检测"""
        # 计算MAR
        mar = self._calculate_mouth_aspect_ratio(landmarks)

        # MAR阈值判断
        detected_mar = mar > self.mar_threshold

        # LSTM预测（如果可用）
        detected_lstm = False
        lstm_confidence = 0.0

        if self.use_lstm:
            self.selected_landmarks_lst.append(landmarks)
            if len(self.selected_landmarks_lst) >= 25:
                # 计算唇部距离
                distances = []
                for lm in list(self.selected_landmarks_lst)[-25:]:
                    _, d_norm = self._calculate_lip_distance(lm)
                    distances.append(d_norm)

                self.d_normalized_history = deque(distances, maxlen=25)

                if len(self.d_normalized_history) >= 25:
                    try:
                        # LSTM预测
                        normalized = self._normalize(list(self.d_normalized_history))
                        input_array = np.array(normalized, dtype=np.float32).reshape(1, 25, 1)

                        with self.lock:
                            y_pred = self.session.run([self.output_name], {self.input_name: input_array})

                        predict = np.argmax(y_pred[0], axis=-1)
                        # print("predict =", predict)
                        detected_lstm = int(predict) == 1
                        lstm_confidence = 0.6 if detected_lstm else 0.3
                    except Exception as e:
                        logger.debug(f"[FaceLipDetector] LSTM prediction error: {e}")

        # 综合判断：MAR或LSTM任一检测到即认为在说话
        detected = detected_mar or detected_lstm

        # 添加到历史记录
        self.lip_moving_history.append(detected)

        # 简单的滤波：最近8帧中有3帧以上检测到说话
        if len(self.lip_moving_history) >= 8:
            talking_count = sum(self.lip_moving_history)
            is_talking = talking_count >= 3
        else:
            is_talking = detected

        # 计算置信度
        mar_confidence = min(mar / self.mar_threshold, 1.0) if mar > 0 else 0
        confidence = max(mar_confidence, lstm_confidence)

        # 调试输出
        if self._frame_idx % 30 == 0:  # 每秒输出一次
            logger.debug(
                f"[FaceLipDetector] MAR: {mar:.3f}, Threshold: {self.mar_threshold:.3f}, Talking: {is_talking}")

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

        results = self.face_detection.process(rgb_frame)

        if results.detections:
            # 选择最大的人脸
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

            # 获取眼睛关键点（用于距离计算）
            if hasattr(best_detection.location_data, 'relative_keypoints'):
                rk = best_detection.location_data.relative_keypoints
                if len(rk) >= 2:
                    right_eye = (rk[0].x * frame_width, rk[0].y * frame_height)
                    left_eye = (rk[1].x * frame_width, rk[1].y * frame_height)
                    return (x_min, y_min, width, height, right_eye, left_eye)

            return (x_min, y_min, width, height)

        return None

    def _extract_face_roi(self, frame: np.ndarray, bbox: tuple) -> np.ndarray:
        """提取人脸区域"""
        x_min, y_min, width, height = bbox[:4]
        frame_height, frame_width = frame.shape[:2]

        # 添加padding
        x_min_padded = max(0, x_min - self.padding)
        y_min_padded = max(0, y_min - self.padding)
        x_max_padded = min(frame_width, x_min + width + self.padding)
        y_max_padded = min(frame_height, y_min + height + self.padding)

        face_roi = frame[y_min_padded:y_max_padded, x_min_padded:x_max_padded]

        # 调整到固定大小
        if face_roi.size > 0:
            face_roi_resized = cv2.resize(face_roi, (self.fixed_size, self.fixed_size))
            return face_roi_resized

        return None

    def _detect_landmarks(self, face_roi: np.ndarray) -> Optional[np.ndarray]:
        """检测面部特征点"""
        if face_roi is None or face_roi.size == 0:
            return None

        rgb_face = cv2.cvtColor(face_roi, cv2.COLOR_BGR2RGB)

        with self.lock:
            output = self.face_mesh.process(rgb_face)

        if output.multi_face_landmarks:
            landmarks = output.multi_face_landmarks[0].landmark
            landmarks_np = np.array(
                [(lm.x * self.fixed_size, lm.y * self.fixed_size)
                 for lm in landmarks],
                dtype=np.float32
            )
            return landmarks_np

        return None

    def _calculate_mouth_aspect_ratio(self, landmarks: np.ndarray) -> float:
        """计算嘴唇纵横比（MAR）- 简化版"""
        # 上唇和下唇的关键点索引
        upper_idx = np.array([13, 81, 82, 312, 311])
        lower_idx = np.array([14, 178, 87, 317, 402])

        # 计算垂直距离
        vertical = np.linalg.norm(
            landmarks[upper_idx] - landmarks[lower_idx], axis=1
        ).mean()

        # 计算水平距离
        horizontal = np.linalg.norm(landmarks[61] - landmarks[291])

        # 计算MAR
        mar = vertical / (horizontal + 1e-6)

        return mar

    def _calculate_lip_distance(self, landmarks: np.ndarray) -> Tuple[float, float]:
        """计算唇部距离特征"""
        mar = self._calculate_mouth_aspect_ratio(landmarks)

        # 简化的归一化距离计算
        upper_lip = landmarks[13, 1]
        lower_lip = landmarks[14, 1]
        distance_upper_lip = abs(upper_lip - lower_lip)

        d_norm = distance_upper_lip / 10.0  # 简化归一化

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
        LEFT_EYE_INDEX = 33
        RIGHT_EYE_INDEX = 263
        NOSE_TIP_INDEX = 1

        left_eye = landmarks[LEFT_EYE_INDEX]
        right_eye = landmarks[RIGHT_EYE_INDEX]
        nose_tip = landmarks[NOSE_TIP_INDEX]

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
            return 50.0  # 默认距离

        _, _, _, _, left_eye, right_eye = bbox

        eye_distance = np.linalg.norm(
            np.array(left_eye) - np.array(right_eye)
        )

        W = 6.3  # 平均瞳距（厘米）
        distance = (W * self.focal_distance) / (eye_distance + 1e-6)

        return distance