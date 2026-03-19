// 枚举
export enum ENGINE_TYPE {
    "ASR" = "ASR",
    "TTS" = "TTS",
    "LLM" = "LLM",
    "AGENT" = "AGENT",
    "VISION" = "VISION"
}

export enum IFER_TYPE {
    "NORMAL" = "normal",
    "STREAM" = "stream"
}

export enum PARAM_TYPE {
    "STRING" = "string",
    "INT" = "int",
    "FLOAT" = "float",
    "BOOL" = "bool"
}

export enum GENDER_TYPE {
    "MALE" = 'MALE',
    "FEMALE" = 'FEMALE'
}

export enum BACKGROUND_TYPE {
    "STATIC" = "STATIC",
    "DYNAMIC" = "DYNAMIC",
    "CUSTOM" = "CUSTOM",
    "ALL" = "ALL"
}

export enum CHARACTER_TYPE {
    "IP" = "IP",
    "FREE" = "FREE",
    "CUSTOM" = "CUSTOM",
    "ALL" = "ALL"
}

export enum APP_TYPE {
    "FREEDOM" = "Freedom",
}

export enum CHAT_ROLE {
    "HUMAN" = "HUMAN",
    "AI" = "AI"
}

export enum CHAT_MODE {
    "DIALOGUE" = "DIALOGUE",
    "IMMSERSIVE" = "IMMSERSIVE"
}

export enum AUDIO_TYPE {
    "MP3" = "mp3",
    "WAV" = "wav"
}

export enum STREAMING_EVENT_TYPE {
    "CONVERSATION_ID" = "CONVERSATION_ID",
    "MESSAGE_ID" = "MESSAGE_ID",
    "THINK" = "THINK",
    "TEXT" = "TEXT",
    "TASK" = "TASK",
    "DONE" = "DONE",
    "ERROR" = "ERROR"
}

export enum RESOURCE_TYPE {
    "BACKGROUND" = "background",
    "CHARACTER" = "character",
    "ICON" = "icon"
}

// 接口
export interface BaseResponse {
    code: number,
    data: any,
    message: string,
}

export interface EngineParamDesc {
    name: string;
    description: string;
    type: PARAM_TYPE;
    required: boolean;
    range: (string | number | boolean)[];
    choices: (string | number | boolean)[];
    default: string | number | boolean;
}

export interface EngineConfigResponse extends BaseResponse {
    data: EngineParamDesc[]
}

export interface EngineListResponse extends BaseResponse {
    data: EngineDesc[]
}

export interface EngineDefaultResponse extends BaseResponse {
    data: EngineDesc
}

export interface VoiceDesc {
    name: string;
    gender: GENDER_TYPE;
}

export interface VoiceListResponse extends BaseResponse {
    data: VoiceDesc[]
}

export interface ResourceModel {
    resource_id: string;
    name: string;
    type: RESOURCE_TYPE;
    link: string;
}

export interface ResourceDesc extends ResourceModel{
    user_id: string;
    create_time: string;
}

export interface ChatMessage {
    role: CHAT_ROLE;
    think: string;
    content: string;
}

export interface EngineDesc {
    name: string;
    type: ENGINE_TYPE;
    infer_type: IFER_TYPE;
    desc: string;
    meta: {
        official: string;
        configuration: string;
        tips: string;
        fee: string;
    };
}

export interface EngineConfig {
    name: string;
    type: ENGINE_TYPE;
    config: {};
}


export interface AudioDescResponse extends BaseResponse {
    data: string | null;
    sampleRate: number;
    sampleWidth: number;
}

export interface StringResponse extends BaseResponse {
    data: string;
}

export interface EventResponse {
    event: STREAMING_EVENT_TYPE;
    data: string;
}

export interface AppConfig {
    asr_enable: boolean;
    tts_enable: boolean;
    asr: EngineConfig;
    tts: EngineConfig;
    llm: EngineConfig | null;
    agent: EngineConfig;
    background: ResourceModel | null;
    character: ResourceModel;
    type: APP_TYPE;
    ext: {
        sound: boolean;
        showThink: boolean;
        lip_factor: number;
        chat_mode: CHAT_MODE;
    };
}


// Vision 消息类型
export interface VisionMessage {
    frame: any; // 在前端是 base64 string
    timestamp?: number;
}

// Vision 检测结果
export interface VisionDetectionResult {
    has_face: boolean;
    is_talking: boolean;
    face_bbox?: number[];
    face_distance?: number;
    head_pose?: {
        swing?: number;
        nodding?: number;
    };
    confidence?: number;
    timestamp?: number;
}

// Vision 引擎输出响应
export interface VisionEngineOutput extends BaseResponse {
    data: VisionDetectionResult;
}

// Vision 批量处理输出
export interface BatchVisionOutput extends BaseResponse {
    data: Array<{
        filename: string;
        has_face: boolean;
        is_talking: boolean;
        confidence: number;
    }>;
}

// Vision WebSocket 消息类型
export type VisionWSMessage =
    | { type: "frame"; data: string; timestamp?: number }
    | { type: "audio"; data: string }
    | { type: "config"; config: any }
    | { type: "stats" }
    | { type: "ping" }
    | { type: "close" };

// Vision WebSocket 响应类型
export type VisionWSResponse =
    | { type: "result"; data: VisionDetectionResult }
    | { type: "vision_result"; data: VisionDetectionResult }
    | { type: "talking_start"; timestamp?: number }
    | { type: "talking_end"; data?: { text?: string; audio_duration?: number; timestamp?: number } }
    | { type: "statistics"; data: any }
    | { type: "audio_received"; size: number }
    | { type: "config_updated"; config: any }
    | { type: "skipped"; reason: string }
    | { type: "error"; message: string }
    | { type: "pong" };