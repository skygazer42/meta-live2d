# OpenCV Vision Fallback Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a repo-native OpenCV Vision fallback so the backend can expose a usable face detector even when MediaPipe fails to initialize.

**Architecture:** Keep `FaceLipDetector` as the preferred rich engine and register a second `OpenCVFaceDetector` that uses OpenCV Haar cascades only. Update Vision config ordering so the API naturally falls back to OpenCV when MediaPipe is unavailable, then validate by restarting the backend and checking the default Vision descriptor.

**Tech Stack:** Python 3.11, FastAPI, OpenCV, existing engine registry/config loader, Node test runner

---

### Task 1: Add failing regression coverage

**Files:**
- Modify: `/Users/luke/code/meta-live2d/web/tests/regression.test.mjs`

**Step 1: Write the failing test**

Add assertions that:
- `configs/config.yaml` includes `opencvFaceDetector.yaml` in the Vision support list.
- `digitalHuman/engine/vision/__init__.py` imports the new fallback engine module.
- `digitalHuman/engine/vision/openCVFaceDetector.py` uses OpenCV cascade detection.

**Step 2: Run test to verify it fails**

Run: `node --test /Users/luke/code/meta-live2d/web/tests/regression.test.mjs`
Expected: FAIL because the fallback engine files/config do not exist yet.

### Task 2: Implement the fallback engine

**Files:**
- Create: `/Users/luke/code/meta-live2d/digitalHuman/engine/vision/openCVFaceDetector.py`
- Modify: `/Users/luke/code/meta-live2d/digitalHuman/engine/vision/__init__.py`
- Create: `/Users/luke/code/meta-live2d/configs/engines/vision/opencvFaceDetector.yaml`
- Modify: `/Users/luke/code/meta-live2d/configs/config.yaml`

**Step 1: Write minimal implementation**

Create a `BaseVisionEngine` subclass that:
- loads `haarcascade_frontalface_default.xml` from `cv2.data.haarcascades`
- detects the largest face in a grayscale frame
- returns `has_face`, `face_bbox`, approximate `face_distance`, `confidence`
- always returns `is_talking = False` and empty `head_pose`

**Step 2: Register and configure it**

Update the Vision package import and backend support list so:
- MediaPipe-backed `FaceLipDetector` stays first
- OpenCV fallback is available when MediaPipe fails

**Step 3: Run tests to verify they pass**

Run: `node --test /Users/luke/code/meta-live2d/web/tests/regression.test.mjs`
Expected: PASS

### Task 3: Verify runtime fallback

**Files:**
- No new source files required

**Step 1: Restart backend**

Run the local FastAPI server again so it reloads the new Vision engine.

**Step 2: Verify default Vision resolution**

Run: `curl -s http://127.0.0.1:8880/adh/vision/v0/engine/default`
Expected: backend returns `OpenCVFaceDetector` instead of “No vision engine available”.

**Step 3: Verify frontend still loads**

Run: `curl -I -s http://127.0.0.1:3000/sentio/default`
Expected: `HTTP/1.1 200 OK`
