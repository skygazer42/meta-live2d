import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function read(relativePath) {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8');
}

test('root page uses a server redirect to /sentio', () => {
  const source = read('../app/page.tsx');

  assert.match(source, /redirect\(['"]\/sentio['"]\)/);
  assert.doesNotMatch(source, /router\.push\(/);
});

test('immersive mode can render the stream input for stream ASR engines', () => {
  const source = read('../app/(products)/sentio/components/chatbot/index.tsx');

  assert.match(
    source,
    /infer_type == IFER_TYPE\.NORMAL\s*\?\s*<ChatVadInput\/>\s*:\s*<ChatStreamInput\s*\/>/
  );
});

test('agent error events stop in the error branch instead of falling through to done handling', () => {
  const source = read('../app/(products)/sentio/hooks/chat.ts');
  const start = source.indexOf('case STREAMING_EVENT_TYPE.ERROR:');
  const end = source.indexOf('case STREAMING_EVENT_TYPE.TASK:', start);

  assert.notEqual(start, -1, 'missing ERROR branch');
  assert.notEqual(end, -1, 'missing TASK branch');
  assert.match(source.slice(start, end), /break;/);
});

test('agent stream transport forwards network errors to the provided onError callback', () => {
  const source = read('../lib/api/server.ts');
  const start = source.indexOf('export function api_agent_stream(');
  const end = source.indexOf('// =========================== VISION APIs', start);

  assert.notEqual(start, -1, 'missing api_agent_stream');
  assert.notEqual(end, -1, 'missing function boundary');
  assert.match(source.slice(start, end), /onError\(/);
});

test('request host resolution has browser and local defaults when env vars are absent', () => {
  const source = read('../lib/api/requests.ts');

  assert.match(source, /globalThis\.location\?\.protocol/);
  assert.match(source, /globalThis\.location\?\.port/);
  assert.match(source, /['"]http['"]/);
});

test('embed route has a matching dynamic sentio page', () => {
  const routePath = fileURLToPath(new URL('../app/(products)/sentio/[appId]/page.tsx', import.meta.url));

  assert.equal(existsSync(routePath), true);
});

test('dynamic sentio page passes appId into the main app component', () => {
  const source = read('../app/(products)/sentio/[appId]/page.tsx');

  assert.match(source, /params/);
  assert.match(source, /<App appId=\{appId\} \/>/);
});

test('main sentio app fetches remote config when appId is present', () => {
  const source = read('../app/(products)/sentio/app.tsx');

  assert.match(source, /api_common_get_app_config/);
  assert.match(source, /if \(appId\)/);
});

test('main sentio app shows an explicit error state when a scoped app config cannot be loaded', () => {
  const source = read('../app/(products)/sentio/app.tsx');

  assert.match(source, /loadError/);
  assert.match(source, /if \(nextAppId && !config\)|if \(appId && !config\)/);
});

test('frontend api layer exposes a common app config fetcher', () => {
  const source = read('../lib/api/server.ts');

  assert.match(source, /api_common_get_app_config/);
  assert.match(source, /\/common\/\$\{SERVER_VERSION\}\/app\/\$\{appId\}/);
});

test('frontend api layer falls back to v0 when the public server version env var is absent', () => {
  const source = read('../lib/api/server.ts');

  assert.match(source, /NEXT_PUBLIC_SERVER_VERSION \|\| ["']v0["']/);
});

test('backend common api exposes an app config endpoint', () => {
  const source = read('../../digitalHuman/server/api/common/common_api_v0.py');

  assert.match(source, /@router\.get\(\"\/app\/\{app_id\}\"/);
});

test('server-side app config mapping file exists for embedded apps', () => {
  const configPath = fileURLToPath(new URL('../../configs/apps/sentio_apps.json', import.meta.url));

  assert.equal(existsSync(configPath), true);
});

test('chat record store keeps scoped histories for different embedded apps', () => {
  const source = read('../lib/store/sentio.ts');

  assert.match(source, /activeScope/);
  assert.match(source, /chatRecordByScope/);
  assert.match(source, /setScope:/);
});

test('agent store no longer uses an empty setter implementation', () => {
  const source = read('../lib/store/sentio.ts');

  assert.doesNotMatch(source, /setEnable:\s*\(enable: boolean\)\s*=>\s*set\(\(state\)\s*=>\s*\(\{\}\)\)/);
});

test('lint uses the eslint cli instead of next lint and provides a project config file', () => {
  const packageSource = read('../package.json');
  const eslintConfigPath = fileURLToPath(new URL('../.eslintrc.json', import.meta.url));

  assert.doesNotMatch(packageSource, /"lint":\s*"next lint"/);
  assert.equal(existsSync(eslintConfigPath), true);
});

test('gitignore excludes local Python virtual environments', () => {
  const source = read('../../.gitignore');

  assert.match(source, /\.venv/);
});

test('engine settings tab reads zustand stores at the component top level instead of inside switch callbacks', () => {
  const source = read('../app/(products)/sentio/components/settings/engine.tsx');

  assert.match(source, /const asrStore = useSentioAsrStore\(\);/);
  assert.match(source, /const ttsStore = useSentioTtsStore\(\);/);
  assert.match(source, /const agentStore = useSentioAgentStore\(\);/);
  assert.match(source, /const visionStore = useSentioVisionStore\(\);/);
  assert.doesNotMatch(source, /return useSentioAsrStore\(\);/);
  assert.doesNotMatch(source, /return useSentioTtsStore\(\);/);
  assert.doesNotMatch(source, /return useSentioAgentStore\(\);/);
});

test('fastapi router initializes engine and agent pools during app startup', () => {
  const source = read('../../digitalHuman/server/router.py');

  assert.match(source, /EnginePool/);
  assert.match(source, /AgentPool/);
  assert.match(source, /setup\(config\.SERVER\.ENGINES\)/);
  assert.match(source, /setup\(config\.SERVER\.AGENTS\)/);
  assert.match(source, /lifespan|on_event\(["']startup["']\)/);
});

test('engine pool setup logs and skips individual engine initialization failures instead of crashing startup', () => {
  const source = read('../../digitalHuman/engine/enginePool.py');

  assert.match(source, /try:/);
  assert.match(source, /logger\.warning/);
  assert.match(source, /Failed to create/);
});

test('frontend vision api does not fake a FaceLipDetector default when the backend reports no available engine', () => {
  const source = read('../lib/api/server.ts');
  const start = source.indexOf('export async function api_vision_get_default');
  const end = source.indexOf('export async function api_vision_get_config', start);

  assert.notEqual(start, -1, 'missing api_vision_get_default');
  assert.notEqual(end, -1, 'missing api_vision_get_default boundary');
  assert.doesNotMatch(source.slice(start, end), /FaceLipDetector/);
});

test('vision hook reads the configured vision engine instead of hardcoding FaceLipDetector', () => {
  const source = read('../app/(products)/sentio/hooks/vision.ts');

  assert.match(source, /useSentioVisionStore/);
  assert.doesNotMatch(source, /engine:\s*['"]FaceLipDetector['"]/);
});

test('vision settings stop inventing a fallback engine when the backend exposes none', () => {
  const source = read('../app/(products)/sentio/components/settings/engine.tsx');

  assert.doesNotMatch(source, /FALLBACK_VISION_ENGINE/);
  assert.match(source, /没有可用视觉引擎|visionUnavailable|当前环境没有可用视觉引擎/);
});

test('vision api resolves the default engine through availability checks instead of hardcoding FaceLipDetector', () => {
  const source = read('../../digitalHuman/server/api/vision/vision_api_v0.py');

  assert.doesNotMatch(source, /FaceLipDetector/);
  assert.match(source, /get_vision_default|resolve_vision_engine/);
});

test('engine pool keeps initialization errors available for unavailable-engine reporting', () => {
  const source = read('../../digitalHuman/engine/enginePool.py');

  assert.match(source, /_errors/);
  assert.match(source, /getEngineErrors|listEngineErrors/);
});

test('vision default metadata can surface the backend initialization failure reason', () => {
  const source = read('../../digitalHuman/server/core/api_vision_v0_impl.py');

  assert.match(source, /meta=\{/);
  assert.match(source, /tips/);
  assert.match(source, /getEngineErrors|listEngineErrors/);
});

test('face lip detector supports mediapipe tasks as a fallback backend when solutions are unavailable', () => {
  const source = read('../../digitalHuman/engine/vision/faceLipDetector.py');

  assert.match(source, /mediapipe_mode/);
  assert.match(source, /create_from_options|create_from_model_path/);
  assert.match(source, /BaseOptions/);
  assert.match(source, /ImageFormat\.SRGB/);
});

test('vision engine config exposes explicit mediapipe task model paths', () => {
  const source = read('../../configs/engines/vision/faceLipDetector.yaml');

  assert.match(source, /face_detection_model_path/);
  assert.match(source, /face_landmarker_model_path/);
  assert.match(source, /mediapipe_mode/);
  assert.match(source, /assets\/mediapipe\/face_detection_short_range\.tflite/);
  assert.match(source, /assets\/mediapipe\/face_landmarker_v2_with_blendshapes\.task/);
});

test('backend pins mediapipe to the macOS-compatible release we validated locally', () => {
  const source = read('../../requirements.txt');

  assert.match(source, /mediapipe==0\.10\.15/);
  assert.match(source, /opencv-python-headless==4\.10\.0\.84/);
});

test('vision config registers an OpenCV fallback engine behind the mediapipe engine', () => {
  const source = read('../../configs/config.yaml');

  assert.match(source, /VISION:\s*\n\s+SUPPORT_LIST:\s+\[\s*"faceLipDetector\.yaml",\s*"opencvFaceDetector\.yaml"\s*\]/m);
});

test('vision package imports the OpenCV fallback engine module', () => {
  const source = read('../../digitalHuman/engine/vision/__init__.py');

  assert.match(source, /opencvFaceDetector/);
});

test('opencv fallback vision engine uses OpenCV cascade detection without mediapipe', () => {
  const source = read('../../digitalHuman/engine/vision/opencvFaceDetector.py');

  assert.match(source, /CascadeClassifier/);
  assert.match(source, /cv2\.data\.haarcascades/);
  assert.match(source, /OpenCVFaceDetector/);
});
