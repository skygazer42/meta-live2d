import "whatwg-fetch";
import { fetchEventSource } from '@microsoft/fetch-event-source';
import * as PROTOCOL from "../protocol";
import { v4 as uuidv4 } from 'uuid';
import { getHost, errorHandler, get, post, filePost, put, del, getWsUrl } from "./requests";
import { WebsocketClient } from "./websocket";

const SERVER_VERSION = process.env.NEXT_PUBLIC_SERVER_VERSION || "v0";

const BASE_PATH = "/adh"
const VISION_PATH = BASE_PATH + `/vision/${SERVER_VERSION}`

// =========================== Common APIs ===========================
export async function api_common_get_app_config(appId: string): Promise<PROTOCOL.AppConfig | null> {
    const path = `${BASE_PATH}/common/${SERVER_VERSION}/app/${appId}`;
    return get(path, null).then((response: PROTOCOL.AppConfigResponse) => {
        return response.data;
    }).catch(() => {
        return null;
    })
}

// =========================== ASR APIs ===========================
const ASR_PATH = BASE_PATH + `/asr/${SERVER_VERSION}`

export async function api_asr_get_list(): Promise<PROTOCOL.EngineDesc[]>{
    const path = `${ASR_PATH}/engine`;
    return get(path, null).then((response: PROTOCOL.EngineListResponse) => {
        return response.data
    }).catch(() => {
        return [] as PROTOCOL.EngineDesc[]
    })
}

export async function api_asr_get_default(): Promise<PROTOCOL.EngineDesc>{
    const path = `${ASR_PATH}/engine/default`;
    return get(path, null).then((response: PROTOCOL.EngineDefaultResponse) => {
        return response.data
    }).catch(() => {
        return {} as PROTOCOL.EngineDesc
    })
}

export async function api_asr_get_config(engine: string): Promise<PROTOCOL.EngineParamDesc[]>{
    const path = `${ASR_PATH}/engine/${engine}`;
    return get(path, null).then((response: PROTOCOL.EngineConfigResponse) => {
        return response.data;
    }).catch(() => {
        return [] as PROTOCOL.EngineParamDesc[];
    })
}

export async function api_asr_infer(
    engine: string,
    config: {},
    data: string | Blob,
    type: string = PROTOCOL.AUDIO_TYPE.WAV as string,
    sampleRate: Number = 16000,
    sampleWidth: Number = 2
): Promise<string> {
    const path = `${ASR_PATH}/engine`;
    const body = JSON.stringify({
        engine: engine,
        config: config,
        data: data,
        type: type,
        sampleRate: sampleRate,
        sampleWidth: sampleWidth
    });
    return post(path, body, null).then((response: PROTOCOL.StringResponse) => {
        return response.data;
    }).catch(() => {
        return "";
    })
}

export async function api_asr_infer_file(
    engine: string,
    config: {},
    data: Blob,
    type: string = PROTOCOL.AUDIO_TYPE.MP3 as string,
    sampleRate: Number = 16000,
    sampleWidth: Number = 2
): Promise<string> {
    const path = `${ASR_PATH}/engine/file`;
    const formData = new FormData();
    const mp3File = new File([data], 'file.mp3', { type: 'audio/mp3' })
    formData.append('file', mp3File)
    formData.append('engine', engine);
    formData.append('config', JSON.stringify(config));
    formData.append('type', type);
    formData.append('sampleRate', String(sampleRate));
    formData.append('sampleWidth', String(sampleWidth));

    return filePost(path, formData, null).then((response: PROTOCOL.StringResponse) => {
        return response.data;
    }).catch(() => {
        return "";
    })
}

// =========================== TTS APIs ===========================
const TTS_PATH = BASE_PATH + `/tts/${SERVER_VERSION}`

export async function api_tts_get_list(): Promise<PROTOCOL.EngineDesc[]>{
    const path = `${TTS_PATH}/engine`;
    return get(path, null).then((response: PROTOCOL.EngineListResponse) => {
        return response.data
    }).catch(() => {
        return [] as PROTOCOL.EngineDesc[]
    })
}

export async function api_tts_get_voice(
    engine: string,
    config: {}
): Promise<PROTOCOL.VoiceDesc[]>{
    const path = `${TTS_PATH}/engine/${engine}/voice?config=${encodeURIComponent(JSON.stringify(config))}`;
    return get(path, null).then((response: PROTOCOL.VoiceListResponse) => {
        return response.data
    }).catch(() => {
        return [] as PROTOCOL.VoiceDesc[]
    })
}

export async function api_tts_get_default(): Promise<PROTOCOL.EngineDesc>{
    const path = `${TTS_PATH}/engine/default`;
    return get(path, null).then((response: PROTOCOL.EngineDefaultResponse) => {
        return response.data
    }).catch(() => {
        return {} as PROTOCOL.EngineDesc
    })
}

export async function api_tts_get_config(
    engine: string,
): Promise<PROTOCOL.EngineParamDesc[]>{
    const path = `${TTS_PATH}/engine/${engine}`;
    return get(path, null).then((response: PROTOCOL.EngineConfigResponse) => {
        return response.data;
    }).catch(() => {
        return [] as PROTOCOL.EngineParamDesc[];
    })
}

export async function api_tts_infer(
    engine: string,
    config: {},
    data: string,
    signal: AbortSignal,
): Promise<string> {
    const path = `${TTS_PATH}/engine`;
    const body = JSON.stringify({
        engine: engine,
        config: config,
        data: data,
    });
    return post(path, body, signal).then((response: PROTOCOL.BaseResponse) => {
        return response.data;
    }).catch(() => {
        return "";
    })
}

// =========================== Agent APIs ===========================
const AGENT_PATH = BASE_PATH + `/agent/${SERVER_VERSION}`

export async function api_agent_get_list(): Promise<PROTOCOL.EngineDesc[]> {
    const path = `${AGENT_PATH}/engine`;
    return get(path, null).then((response: PROTOCOL.EngineListResponse) => {
        return response.data
    }).catch(() => {
        return [] as PROTOCOL.EngineDesc[]
    })
}

export async function api_agent_get_default(): Promise<PROTOCOL.EngineDesc> {
    const path = `${AGENT_PATH}/engine/default`;
    return get(path, null).then((response: PROTOCOL.EngineDefaultResponse) => {
        return response.data
    }).catch(() => {
        return {} as PROTOCOL.EngineDesc
    })
}

export async function api_agent_get_config(
    engine: string
): Promise<PROTOCOL.EngineParamDesc[]> {
    const path = `${AGENT_PATH}/engine/${engine}`;
    return get(path, null).then((response: PROTOCOL.EngineConfigResponse) => {
        return response.data;
    }).catch(() => {
        return [] as PROTOCOL.EngineParamDesc[];
    })
}

export async function api_agent_create_conversation(
    engine: string,
    config: {},
): Promise<string>{
    const path = `${AGENT_PATH}/engine/${engine}`;
    const body = JSON.stringify({
        engine: engine,
        data: config,
    });
    return post(path, body, null).then((response: PROTOCOL.StringResponse) => {
        return response.data;
    }).catch(() => {
        return "";
    })
}

export function api_agent_stream(
    engine: string,
    config: {},
    data: string,
    conversation_id: string,
    signal: AbortSignal,
    onOk: (response: PROTOCOL.EventResponse) => void,
    onError: (error: Error) => void = (error) => {}
){
    const path = `${AGENT_PATH}/engine`
    const url = getHost() + path;
    fetchEventSource(url, {
        method: "POST",
        headers: {
            'Content-Type': 'application/json',
            'Request-Id': uuidv4(),
            'User-Id': "",
        },
        body: JSON.stringify({
            engine: engine,
            config: config,
            data: data,
            conversation_id: conversation_id
        }),
        signal: signal,
        onmessage: (msg) => {
            const { event, data } = msg;
            const eventResp : PROTOCOL.EventResponse = {
                event: event as PROTOCOL.STREAMING_EVENT_TYPE,
                data: data
            }
            onOk(eventResp)
        },
        onerror(error) {
            throw error instanceof Error ? error : new Error(String(error))
        },
    }).catch((error) => {
        const requestError = error instanceof Error ? error : new Error(String(error));
        onError(requestError);
        errorHandler(requestError, signal)
    })
}

// =========================== VISION APIs ===========================

export async function api_vision_get_list(): Promise<PROTOCOL.EngineDesc[]> {
    const path = `${VISION_PATH}/engine`;
    return get(path, null).then((response: PROTOCOL.EngineListResponse) => {
        return response.data
    }).catch(() => {
        return [] as PROTOCOL.EngineDesc[]
    })
}

export async function api_vision_get_default(): Promise<PROTOCOL.EngineDesc | string> {
    const path = `${VISION_PATH}/engine/default`;
    return get(path, null).then((response: PROTOCOL.EngineDefaultResponse) => {
        return response.data || ""
    }).catch(() => {
        return ""
    })
}

export async function api_vision_get_config(engine: string): Promise<PROTOCOL.EngineParamDesc[]> {
    const path = `${VISION_PATH}/engine/${engine}`;
    return get(path, null).then((response: PROTOCOL.EngineConfigResponse) => {
        return response.data;
    }).catch(() => {
        return [] as PROTOCOL.EngineParamDesc[];
    })
}

export async function api_vision_process_image(
    file: Blob,
    engine: string = "default",
    config: any = {}
): Promise<PROTOCOL.VisionDetectionResult | null> {
    const path = `${VISION_PATH}/engine/image`;
    const formData = new FormData();
    formData.append("file", file);
    formData.append("engine", engine);
    formData.append("config", JSON.stringify(config));

    return filePost(path, formData, null).then((response: PROTOCOL.VisionEngineOutput) => {
        return response.data;
    }).catch((error) => {
        console.error("[Vision API] Process image error:", error);
        return null;
    })
}

export async function api_vision_batch_process(
    files: Blob[],
    engine: string = "default",
    config: any = {}
): Promise<any[]> {
    const path = `${VISION_PATH}/batch`;
    const formData = new FormData();

    files.forEach((file) => {
        formData.append("files", file);
    });
    formData.append("engine", engine);
    formData.append("config", JSON.stringify(config));

    return filePost(path, formData, null).then((response: PROTOCOL.BatchVisionOutput) => {
        return response.data;
    }).catch(() => {
        return [];
    })
}

// =========================== Vision WebSocket APIs ===========================

export interface VisionStreamOptions {
    engine?: string;
    fps?: number;
    bufferSize?: number;
    onMessage?: (msg: PROTOCOL.VisionWSResponse) => void;
    onOpen?: () => void;
    onClose?: () => void;
    onError?: (e: Event) => void;
}

export interface MultimodalOptions {
    visionEngine?: string;
    asrEngine?: string;
    enableAudio?: boolean;
    onMessage?: (msg: PROTOCOL.VisionWSResponse) => void;
    onOpen?: () => void;
    onClose?: () => void;
    onError?: (e: Event) => void;
}

export class VisionStreamClient {
    private ws: WebSocket | null = null;
    private options: VisionStreamOptions;

    constructor(options: VisionStreamOptions = {}) {
        this.options = {
            engine: "default",
            fps: 25,
            bufferSize: 10,
            ...options
        };
    }

    connect(): void {
        const { engine, fps, bufferSize } = this.options;
        const url = getWsUrl(
            `${VISION_PATH}/stream?engine=${encodeURIComponent(engine!)}&fps=${fps}&buffer_size=${bufferSize}`
        );

        this.ws = new WebSocket(url);

        this.ws.onopen = () => {
            console.log("[VisionStream] WebSocket connected");
            this.options.onOpen?.();
        };

        this.ws.onclose = () => {
            console.log("[VisionStream] WebSocket disconnected");
            this.options.onClose?.();
        };

        this.ws.onerror = (e) => {
            console.error("[VisionStream] WebSocket error:", e);
            this.options.onError?.(e);
        };

        this.ws.onmessage = (ev) => {
            try {
                const msg = JSON.parse(ev.data);
                this.options.onMessage?.(msg);
            } catch (error) {
                console.error("[VisionStream] Failed to parse message:", error);
            }
        };
    }

    sendFrame(base64jpeg: string, timestamp?: number): void {
        if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                type: "frame",
                data: base64jpeg,
                timestamp: timestamp || performance.now() / 1000
            }));
        }
    }

    updateConfig(config: any): void {
        if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                type: "config",
                config: config
            }));
        }
    }

    ping(): void {
        if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ type: "ping" }));
        }
    }

    close(): void {
        if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ type: "close" }));
        }
        this.ws?.close();
        this.ws = null;
    }

    isConnected(): boolean {
        return this.ws?.readyState === WebSocket.OPEN;
    }
}

export class MultimodalClient {
    private ws: WebSocket | null = null;
    private options: MultimodalOptions;

    constructor(options: MultimodalOptions = {}) {
        this.options = {
            visionEngine: "default",
            asrEngine: "default",
            enableAudio: true,
            ...options
        };
    }

    connect(): void {
        const { visionEngine, asrEngine, enableAudio } = this.options;

        const params = new URLSearchParams({
            vision_engine: visionEngine!,
            ...(asrEngine && { asr_engine: asrEngine }),
            enable_audio: String(enableAudio)
        });

        const url = getWsUrl(`${VISION_PATH}/multimodal?${params.toString()}`);
        this.ws = new WebSocket(url);

        this.ws.onopen = () => {
            console.log("[Multimodal] WebSocket connected");
            this.options.onOpen?.();
        };

        this.ws.onclose = () => {
            console.log("[Multimodal] WebSocket disconnected");
            this.options.onClose?.();
        };

        this.ws.onerror = (e) => {
            console.error("[Multimodal] WebSocket error:", e);
            this.options.onError?.(e);
        };

        this.ws.onmessage = (ev) => {
            try {
                const msg = JSON.parse(ev.data);
                this.options.onMessage?.(msg);
            } catch (error) {
                console.error("[Multimodal] Failed to parse message:", error);
            }
        };
    }

    sendFrame(base64jpeg: string, timestamp?: number): void {
        if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                type: "frame",
                data: base64jpeg,
                timestamp: timestamp || performance.now() / 1000
            }));
        }
    }

    sendAudio(base64pcm16: string): void {
        if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                type: "audio",
                data: base64pcm16
            }));
        }
    }

    requestStats(): void {
        if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ type: "stats" }));
        }
    }

    ping(): void {
        if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ type: "ping" }));
        }
    }

    close(): void {
        if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ type: "close" }));
        }
        this.ws?.close();
        this.ws = null;
    }

    isConnected(): boolean {
        return this.ws?.readyState === WebSocket.OPEN;
    }
}

// =========================== Vision 工具函数 ===========================

export function canvasToBase64(canvas: HTMLCanvasElement, quality = 0.6): string {
    const dataUrl = canvas.toDataURL('image/jpeg', quality);
    return dataUrl.split(',')[1];
}

export function captureVideoFrame(
    video: HTMLVideoElement,
    canvas: HTMLCanvasElement,
    width?: number,
    height?: number
): string {
    const w = width || video.videoWidth || 640;
    const h = height || video.videoHeight || 480;

    canvas.width = w;
    canvas.height = h;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
        throw new Error('Failed to get canvas context');
    }

    ctx.drawImage(video, 0, 0, w, h);
    return canvasToBase64(canvas);
}

export async function blobToBase64Vision(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const base64 = reader.result as string;
            const base64Data = base64.split(',')[1];
            resolve(base64Data);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

export function float32ToBase64PCM16(audioData: Float32Array): string {
    const int16Data = new Int16Array(audioData.length);
    for (let i = 0; i < audioData.length; i++) {
        const sample = Math.max(-1, Math.min(1, audioData[i]));
        int16Data[i] = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
    }

    const bytes = new Uint8Array(int16Data.length * 2);
    for (let i = 0; i < int16Data.length; i++) {
        const sample = int16Data[i];
        bytes[i * 2] = sample & 0xFF;
        bytes[i * 2 + 1] = (sample >> 8) & 0xFF;
    }

    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

// =========================== Custom APIs ===========================
export async function api_get_engine_list(
    engineType: string
){
    switch (engineType){
        case PROTOCOL.ENGINE_TYPE.ASR:
            return api_asr_get_list();
        case PROTOCOL.ENGINE_TYPE.TTS:
            return api_tts_get_list();
        case PROTOCOL.ENGINE_TYPE.AGENT:
            return api_agent_get_list();
        case PROTOCOL.ENGINE_TYPE.VISION:
            return api_vision_get_list();
    }
}

export async function api_get_engine_default(
    engineType: string
){
    switch (engineType){
        case PROTOCOL.ENGINE_TYPE.ASR:
            return api_asr_get_default();
        case PROTOCOL.ENGINE_TYPE.TTS:
            return api_tts_get_default();
        case PROTOCOL.ENGINE_TYPE.AGENT:
            return api_agent_get_default();
        case PROTOCOL.ENGINE_TYPE.VISION:
            return api_vision_get_default();
    }
}

export function api_get_engine_config(
    engineType: string,
    engine: string
){
    switch (engineType){
        case PROTOCOL.ENGINE_TYPE.ASR:
            return api_asr_get_config(engine);
        case PROTOCOL.ENGINE_TYPE.TTS:
            return api_tts_get_config(engine);
        case PROTOCOL.ENGINE_TYPE.AGENT:
            return api_agent_get_config(engine);
        case PROTOCOL.ENGINE_TYPE.VISION:
            return api_vision_get_config(engine);
    }
}
