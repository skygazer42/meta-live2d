# Vision Fallback Design

**Problem:** The current Vision stack depends on MediaPipe. On this macOS host, both MediaPipe `tasks` and `solutions` fail during engine initialization with `kGpuService` / `NSOpenGLPixelFormat`, so the backend reports Vision as unavailable.

**Decision:** Add a separate OpenCV-based fallback engine instead of further overloading `FaceLipDetector`.

**Why this approach:**
- It keeps `FaceLipDetector` focused on the richer MediaPipe path.
- It gives the backend a genuinely available Vision engine on hosts where MediaPipe cannot boot.
- It preserves future behavior on healthy environments because MediaPipe can remain first in the support list.

**Scope:**
- Add `OpenCVFaceDetector` as a new Vision engine.
- Configure backend Vision support order as `FaceLipDetector` first, `OpenCVFaceDetector` second.
- Expose descriptive metadata so the frontend can tell the user this is a fallback detector.
- Verify backend default Vision resolution returns the fallback engine when MediaPipe fails.

**Non-goals:**
- Re-implement lip-motion detection in OpenCV.
- Replace MediaPipe on environments where it already works.
- Add UI-specific branching for the fallback engine.
