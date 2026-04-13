# MediaPipe Models

These model files are downloaded from the official MediaPipe storage bucket:

- `face_detection_short_range.tflite`
  https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/latest/blaze_face_short_range.tflite
- `face_landmarker_v2_with_blendshapes.task`
  https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task

The default Vision engine config points at these repo-relative paths so local startup works without extra manual setup.
