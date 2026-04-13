'use client'

import { useState, useRef, useEffect, useCallback, memo } from 'react';
import { StopCircleIcon, MicrophoneIcon, PaperAirplaneIcon } from '@heroicons/react/24/solid';
import { useSentioAsrStore, useChatRecordStore, useSentioVisionStore } from '@/lib/store/sentio';
import { Input, Button, Spinner, addToast, Tooltip } from '@heroui/react';
import { CHAT_ROLE } from '@/lib/protocol';
import { api_asr_infer_file } from '@/lib/api/server';
import { createASRWebsocketClient, WS_RECV_ACTION_TYPE, WS_SEND_ACTION_TYPE } from '@/lib/api/websocket';
import { useTranslations } from 'next-intl';
import { convertToMp3, convertFloat32ArrayToMp3, AudioRecoder } from '@/lib/utils/audio';
import Recorder from 'js-audio-recorder';
import { useMicVAD } from "@ricky0123/vad-react"
import { useChatWithAgent, useAudioTimer } from '../../hooks/chat';
import { getSrcPath } from '@/lib/path';
import clsx from 'clsx';
import { useVisionDetection } from '../../hooks/vision';

// 统一常量定义
const FRAME_MS = 20;            // VAD 帧长
const RING_MS = 1500;          // 音频环形缓冲长度（1.5秒）
const PRE_ROLL = 300;          // 从唇动起点往前带 300ms
const LIP_ON_WINDOW = 1000;     // 开段：过去 1000ms 内有唇动
const LIP_OFF_WINDOW = 2500;    // 关段：过去 1500ms 内仍需有唇动
const MAX_SEGMENT_S = 30;      // 单段保护上限
const STREAM_CHUNK_MS = 40;    // 流式分片大小（40ms）

// 新增：VAD相关常量（用于流式模式的简单能量VAD）
const VAD_ENERGY_THRESH = 0.008;  // 能量阈值
const VAD_OFF_WINDOW = 700;      // VAD结束防抖窗口

let micRecoder: Recorder | null = null;

export const ChatInput = memo(function ChatInput({
    postProcess
}: {
    postProcess?: (conversation_id: string, message_id: string, think: string, content: string) => void
}) {
    const t = useTranslations('Products.sentio');
    const [message, setMessage] = useState("");
    const [startMicRecord, setStartMicRecord] = useState(false);
    const [startAsrConvert, setStartAsrConvert] = useState(false);
    const { enable: enableASR, engine: asrEngine, settings: asrSettings } = useSentioAsrStore();
    const { chat, abort, chatting } = useChatWithAgent();
    const { startAudioTimer, stopAudioTimer } = useAudioTimer();

    const handleStartRecord = useCallback(() => {
        abort();
        if (micRecoder == null) {
            micRecoder = new Recorder({
                sampleBits: 16,
                sampleRate: 16000,
                numChannels: 1,
                compiling: false,
            })
        }
        micRecoder.start().then(
            () => {
                startAudioTimer();
                setStartMicRecord(true);
            }, () => {
                addToast({
                    title: t('micOpenError'),
                    variant: "flat",
                    color: "danger"
                })
            }
        )
    }, [abort, startAudioTimer, t])

    const handleStopRecord = useCallback(async () => {
        micRecoder.stop();
        setStartMicRecord(false);
        if (!stopAudioTimer()) return;
        setMessage(t('speech2text'));
        setStartAsrConvert(true);
        const mp3Blob = convertToMp3(micRecoder);
        let asrResult = "";
        asrResult = await api_asr_infer_file(asrEngine, asrSettings, mp3Blob);
        if (asrResult.length > 0) {
            setMessage(asrResult);
        } else {
            setMessage("");
        }
        setStartAsrConvert(false);
    }, [asrEngine, asrSettings, stopAudioTimer, t])

    const onFileClick = () => {
        // TODO: open file dialog
    }

    const onSendClick = () => {
        if (message == "") return;
        chat(message, postProcess);
        setMessage("");
    }

    const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter") {
            onSendClick();
        }
    }

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "m" && e.ctrlKey) {
                if (startMicRecord) {
                    handleStopRecord();
                } else {
                    handleStartRecord();
                }
            }
        }
        window.addEventListener("keydown", handleKeyDown);
        return () => {
            window.removeEventListener("keydown", handleKeyDown);
        }
    }, [handleStartRecord, handleStopRecord, startMicRecord])

    return (
        <div className='flex flex-col w-4/5 md:w-2/3 2xl:w-1/2 items-start z-10 gap-2'>
            <div className='flex w-full items-center z-10'>
                <Input
                    className='opacity-90'
                    startContent={
                        <button
                            type="button"
                            disabled={!enableASR}
                            aria-label="toggle password visibility"
                            className={clsx(
                                "focus:outline-none",
                                startMicRecord ? "text-red-500" : enableASR ? "hover:text-green-500" : "hover:text-gray-500"
                            )}
                        >
                            {startMicRecord ? (
                                <StopCircleIcon className='size-6' onClick={handleStopRecord} />
                            ) : (
                                startAsrConvert ? (
                                    <Spinner size="sm" />
                                ) : (
                                    <Tooltip className='opacity-90' content="Ctrl + M">
                                        <MicrophoneIcon className='size-6' onClick={handleStartRecord} />
                                    </Tooltip>
                                )
                            )}
                        </button>
                    }
                    endContent={
                        chatting ?
                            <button
                                type="button"
                                onClick={abort}
                                className="focus:outline-none hover:text-red-500"
                            >
                                <StopCircleIcon className='size-6' />
                            </button>
                            :
                            <></>
                    }
                    type='text'
                    enterKeyHint='send'
                    value={message}
                    onValueChange={setMessage}
                    onKeyDown={onKeyDown}
                    disabled={startMicRecord || startAsrConvert}
                />
                <Button className='opacity-90' isIconOnly color="primary" onPress={onSendClick}>
                    <PaperAirplaneIcon className='size-6' />
                </Button>
            </div>
        </div>
    )
});

const convertFloat32ToAnalyseData = (float32Data: Float32Array) => {
    const analyseData = new Uint8Array(float32Data.length);
    const dataLength = float32Data.length;

    for (let i = 0; i < dataLength; i++) {
        const value = float32Data[i];
        const mappedValue = Math.round((value + 1) * 128);
        analyseData[i] = Math.max(0, Math.min(255, mappedValue));
    }

    return analyseData;
}

const mergeFloat32Arrays = (arrays: Float32Array[]) => {
    const totalLen = arrays.reduce((sum, arr) => sum + arr.length, 0);
    const result = new Float32Array(totalLen);
    let offset = 0;
    for (const arr of arrays) {
        result.set(arr, offset);
        offset += arr.length;
    }
    return result;
}

// 音频帧类型定义
type PcmFrame = {
    ts: number;           // 时间戳
    data: Float32Array;   // 音频数据
};

// ChatVadInput 组件 - 支持唇动开关
export const ChatVadInput = memo(function ChatVadInput() {
    const t = useTranslations('Products.sentio');
    const canvasRef = useRef<HTMLCanvasElement | null>(null)
    const ctxRef = useRef<CanvasRenderingContext2D | null>(null)
    const { engine: asrEngine, settings: asrSettings } = useSentioAsrStore();
    const { chat, abort } = useChatWithAgent();
    const { startAudioTimer, stopAudioTimer } = useAudioTimer();
    const waveData = useRef<Uint8Array | null>();
    const drawId = useRef<number | null>(null);

    // 从 store 获取视觉检测配置
    const { enabled: visionEnabled, showPreview, fps: visionFps } = useSentioVisionStore();

    // 添加视觉检测
    const {
        bindPreviewRef,
        hasFace,
        isTalking: isLipMoving,
        startDetection: startVision,
        stopDetection: stopVision,
        isConnected: visionConnected
    } = useVisionDetection();

    // hasFaceRef - 必须在 hasFace 解构之后
    const hasFaceRef = useRef(false);
    useEffect(() => {
        hasFaceRef.current = hasFace;
    }, [hasFace]);

    // 唇动最近时间 & 上升沿时间（用于对齐起点）
    const lastLipTsRef = useRef(0);
    const lipOnTsRef = useRef(0);
    const prevLipRef = useRef(false);
    const segSawLipRef = useRef(false);  // 本段录音期间是否出现过唇动

    // 音频环形缓冲（保存最近 RING_MS 毫秒的音频）
    const ringRef = useRef<PcmFrame[]>([]);
    const RING_N = Math.ceil(RING_MS / FRAME_MS);

    // 当前段缓存
    const recordingRef = useRef<Float32Array[]>([]);
    const segStartAtRef = useRef<number>(0);
    const isRecordingRef = useRef<boolean>(false);

    // 根据配置启动视觉检测
    useEffect(() => {
        if (visionEnabled) {
            console.log('[ChatVadInput] Starting vision detection with fps:', visionFps);
            startVision(visionFps);
        }
        return () => {
            if (visionEnabled) {
                console.log('[ChatVadInput] Stopping vision detection');
                stopVision();
            }
        };
    }, [visionEnabled, visionFps, startVision, stopVision]);

    // 监测唇动状态变化，记录唇动开始时间
    useEffect(() => {
        if (!visionEnabled || !visionConnected) {
            lastLipTsRef.current = 0;
            lipOnTsRef.current = 0;
            prevLipRef.current = false;
            return;
        }

        if (isLipMoving) {
            lastLipTsRef.current = Date.now();
            // 检测上升沿：从不动唇到动唇
            if (!prevLipRef.current) {
                lipOnTsRef.current = lastLipTsRef.current; // 记录"唇动开始帧"
                console.log('[Vision] Lip movement started at:', lipOnTsRef.current);
            }
            // 如果正在录音，记下"本段出现过唇动"
            if (isRecordingRef.current) segSawLipRef.current = true;
        }
        prevLipRef.current = isLipMoving;
    }, [visionEnabled, visionConnected, isLipMoving]);

    // 环形缓冲操作函数
    function ringPush(frame: PcmFrame) {
        const ring = ringRef.current;
        ring.push(frame);
        // 保持缓冲区大小
        if (ring.length > RING_N) {
            ring.splice(0, ring.length - RING_N);
        }
    }

    // 处理语音结束
    const handleSpeechEnd = async (audio: Float32Array) => {
        try {
            console.log('[ChatVadInput] Converting audio to MP3, length:', audio.length);
            const mp3Blob = convertFloat32ArrayToMp3(audio);
            console.log('[ChatVadInput] Calling ASR API with engine:', asrEngine);
            let asrResult = ""
            asrResult = await api_asr_infer_file(asrEngine, asrSettings, mp3Blob);
            console.log('[ChatVadInput] ASR result:', asrResult);
            if (asrResult.length > 0) {
                chat(asrResult);
            }
        } catch (error: any) {
            console.error('[ChatVadInput] ASR processing failed:', error);
            addToast({
                title: error.message || 'ASR处理失败',
                variant: "flat",
                color: "danger"
            });
        }
    }

    const vad = useMicVAD({
        baseAssetPath: getSrcPath("vad/"),
        onnxWASMBasePath: getSrcPath("vad/"),
        onFrameProcessed: (audio, frame) => {
            // 每帧都保存到环形缓冲
            ringPush({
                ts: Date.now(),
                data: frame.slice() // 复制一份
            });

            // 更新波形显示
            const dataUnit8Array = convertFloat32ToAnalyseData(frame);
            waveData.current = dataUnit8Array;
        },
        onSpeechStart: () => {
            console.log('[VAD] Speech start detected');

            // 不再用唇动阻断"开始录音"，仅在提交时作为过滤

            abort(); // 打断TTS等
            startAudioTimer(); // 开始UI计时

            // 起点对齐：若"最近确有唇动"，从唇动起点 - PRE_ROLL 回带；否则从当前时刻
            const now = Date.now();
            const recentLip = (visionEnabled && visionConnected) &&
                              (now - lastLipTsRef.current <= LIP_ON_WINDOW);
            const startTs = (recentLip && lipOnTsRef.current > 0)
                ? Math.min(now, lipOnTsRef.current - PRE_ROLL)
                : now;
            segStartAtRef.current = startTs;
            isRecordingRef.current = true;

            // 重置并记录"开段是否观察到唇动"
            segSawLipRef.current = !!recentLip;

            // 从环形缓冲中取出起始时间以来的音频
            recordingRef.current = ringRef.current
                .filter(f => f.ts >= startTs)
                .map(f => f.data.slice()); // 复制音频数据

            console.log('[VAD Gate] Recording started from:', startTs,
                       'Buffered frames:', recordingRef.current.length);
        },
        onSpeechEnd: (audio) => {
            console.log('[VAD] Speech end detected');

            if (!isRecordingRef.current) {
                console.log('[VAD] Not recording, ignoring speech end');
                return;
            }

            const timerOk = stopAudioTimer();

            // "提交过滤器"：仅在视觉可用的情况下启用
            const sawRecentLip = (visionEnabled && visionConnected) &&
                                 (Date.now() - lastLipTsRef.current <= LIP_OFF_WINDOW);
            const allowSubmit =
                (!visionEnabled || !visionConnected)  // 视觉不可用：永远提交，等同纯 VAD
                || (hasFaceRef.current && (segSawLipRef.current || sawRecentLip));

            if (!timerOk || !allowSubmit) {
                recordingRef.current = [];
                isRecordingRef.current = false;
                // 这里明确打个日志，方便定位
                console.log('[Submit Filter] Drop segment by lip gate:', {
                    face: hasFaceRef.current,
                    segSawLip: segSawLipRef.current,
                    sawRecentLip,
                    allowSubmit
                });
                segSawLipRef.current = false;
                return;
            }

            // 把段尾的音频也加入
            recordingRef.current.push(audio.slice());

            // 检查时长保护
            const duration = (Date.now() - segStartAtRef.current) / 1000;
            if (duration > MAX_SEGMENT_S) {
                console.warn('[VAD Gate] Segment clipped at', MAX_SEGMENT_S, 'seconds');
            }

            // 合并整段音频并提交 ASR
            const fullAudio = mergeFloat32Arrays(recordingRef.current);
            recordingRef.current = [];
            isRecordingRef.current = false;
            segSawLipRef.current = false;

            console.log('[VAD Gate] Submitting audio, duration:', duration.toFixed(2), 's');
            handleSpeechEnd(fullAudio);
        },
    });

    useEffect(() => {
        console.log('[ChatVadInput] Initializing canvas and VAD');
        const dpr = window.devicePixelRatio || 1;
        const canvas = document.getElementById('voice-input') as HTMLCanvasElement | null;

        if (canvas) {
            const { width: cssWidth, height: cssHeight } = canvas.getBoundingClientRect();
            canvas.width = dpr * cssWidth;
            canvas.height = dpr * cssHeight;
            canvasRef.current = canvas;

            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.scale(dpr, dpr);
                ctx.fillStyle = 'rgb(215, 183, 237)';
                ctxRef.current = ctx;
            }
        }

        const drawCanvas = () => {
            const currentCanvas = canvasRef.current;
            const currentCtx = ctxRef.current;
            if (currentCanvas && currentCtx && waveData.current) {
                const resolution = 3;
                const dataArray = [].slice.call(waveData.current);
                const lineLength = parseInt(`${currentCanvas.width / resolution}`);
                const gap = parseInt(`${dataArray.length / lineLength}`);

                currentCtx.clearRect(0, 0, currentCanvas.width, currentCanvas.height);
                currentCtx.beginPath();
                let x = 0;
                for (let i = 0; i < lineLength; i++) {
                    const v = dataArray.slice(i * gap, i * gap + gap).reduce((prev: number, next: number) => {
                        return prev + next;
                    }, 0) / gap;

                    const y = (v - 128) / 128 * currentCanvas.height;

                    currentCtx.moveTo(x, 16);
                    if (currentCtx.roundRect) {
                        currentCtx.roundRect(x, 16 - y, 2, y, [1, 1, 0, 0]);
                    } else {
                        currentCtx.rect(x, 16 - y, 2, y);
                    }
                    currentCtx.fill();
                    x += resolution;
                }
                currentCtx.closePath();
            }
            drawId.current = requestAnimationFrame(drawCanvas);
        };

        drawId.current = requestAnimationFrame(drawCanvas);
        return () => {
            !!drawId.current && cancelAnimationFrame(drawId.current);
        }
    }, [])

    return (
        <div className='flex flex-col h-10 w-1/2 md:w-1/3 items-center relative'>
            {/* 视频预览小窗口 - 使用 bindPreviewRef */}
            {visionEnabled && showPreview && visionConnected && (
                <div className='absolute -top-36 right-0 w-32 h-24 rounded-lg overflow-hidden shadow-lg bg-black/80 border border-white/20 pointer-events-none'>
                    <video
                        ref={bindPreviewRef}
                        className='w-full h-full object-cover'
                        autoPlay
                        playsInline
                        muted
                    />
                    <div className='absolute top-1 right-1 flex gap-1'>
                        {hasFace && (
                            <div className='w-2 h-2 rounded-full bg-green-500' title="检测到人脸" />
                        )}
                        {isLipMoving && (
                            <div className='w-2 h-2 rounded-full bg-yellow-500 animate-pulse' title="检测到说话" />
                        )}
                    </div>
                </div>
            )}

            {/* VAD 加载状态 */}
            {vad.loading && <div className='flex flex-row gap-1 items-center'>
                <p className='text-xl font-bold'>{t('loading')}</p>
                <Spinner color='warning' variant="dots" size='lg'/>
            </div>}

            {/* 音频波形 */}
            <canvas id="voice-input" className='h-full w-full' />
        </div>
    )
});

// ChatStreamInput 组件 - 支持唇动开关
export const ChatStreamInput = memo(function ChatStreamInput() {
    const t = useTranslations('Products.sentio');
    const canvasRef = useRef<HTMLCanvasElement | null>(null)
    const ctxRef = useRef<CanvasRenderingContext2D | null>(null)
    const { chat, abort } = useChatWithAgent();
    const { engine, settings } = useSentioAsrStore();
    const { getLastRecord, updateLastRecord, addChatRecord, deleteLastRecord } = useChatRecordStore();
    const waveData = useRef<Uint8Array | null>();
    const drawId = useRef<number | null>(null);
    const [engineLoading, setEngineLoading] = useState<boolean>(true);
    const engineReady = useRef<boolean>(false);

    // WebSocket 客户端引用
    const asrWsClientRef = useRef<any>(null);

    // 添加视觉检测相关
    const { enabled: visionEnabled, showPreview, fps: visionFps } = useSentioVisionStore();
    const {
        bindPreviewRef,
        hasFace,
        isTalking: isLipMoving,
        startDetection: startVision,
        stopDetection: stopVision,
        isConnected: visionConnected
    } = useVisionDetection();

    // 记录最近一次唇动时间戳
    const lastLipTsRef = useRef(0);

    // 标记：有唇动但引擎未就绪，等就绪后自动开流
    const pendingStartRef = useRef(false);

    // 兜底：握手超时后回落到"文件模式"
    const forceFileModeRef = useRef(false);
    const handshakeTimerRef = useRef<number | null>(null);

    // 用于文件模式：记录唇动起点（上升沿）和状态
    const lipOnTsRef = useRef(0);
    const prevLipRef = useRef(false);

    // 环形缓冲（Float32，给文件模式回带用）
    type PcmFrame = { ts: number; data: Float32Array };
    const ringRef = useRef<PcmFrame[]>([]);
    const RING_N = Math.ceil(RING_MS / FRAME_MS);
    const fileRecordingRef = useRef<Float32Array[]>([]);
    const isFileRecRef = useRef(false);
    const segStartAtRef = useRef(0);

    // hasFace 做成ref，便于 onMessage 回调里读取
    const hasFaceRef = useRef(false);
    useEffect(() => { hasFaceRef.current = hasFace }, [hasFace]);

    // 环形缓冲（用于流式模式的回带）
    const audioBufferRef = useRef<Uint8Array[]>([]);
    const STREAM_BUFFER_SIZE = 50; // 保存最近50个音频块
    const isStreamingRef = useRef(false);

    // 简单能量 VAD 状态（用于流式模式）
    const vadActiveRef = useRef(false);
    const lastVoiceTsRef = useRef(0);
     // VAD 上升沿 warm-up（在唇动还没来得及判定时，放宽门控）
    const lastVadStateRef = useRef(false);
    const lipWarmupUntilRef = useRef(0);
    // 停止检查的定时器
    const stopCheckId = useRef<number | null>(null);

    const flushBuffered = useCallback((ws: any) => {
        for (const buf of audioBufferRef.current) {
            ws.sendMessage(WS_SEND_ACTION_TYPE.ENGINE_PARTIAL_INPUT, buf);
        }
        audioBufferRef.current = [];
    }, []);

    async function handleSpeechEndFile(audio: Float32Array) {
        try {
            const mp3Blob = convertFloat32ArrayToMp3(audio);
            const text = await api_asr_infer_file(engine, settings, mp3Blob);
            if (text && text.length > 0) chat(text);
        } catch (e: any) {
            addToast({ title: e.message || String(e), variant: 'flat', color: 'danger' });
        }
    }

    const runtimeRef = useRef({
        chat,
        abort,
        getLastRecord,
        updateLastRecord,
        addChatRecord,
        deleteLastRecord,
        handleSpeechEndFile,
        visionEnabled,
        visionConnected,
    });
    runtimeRef.current = {
        chat,
        abort,
        getLastRecord,
        updateLastRecord,
        addChatRecord,
        deleteLastRecord,
        handleSpeechEndFile,
        visionEnabled,
        visionConnected,
    };

    // 启动视觉检测
    useEffect(() => {
        if (visionEnabled) {
            startVision(visionFps);
            forceFileModeRef.current = true;
        }
        return () => {
            if (visionEnabled) {
                stopVision();
            }
            if (stopCheckId.current) cancelAnimationFrame(stopCheckId.current);
        };
    }, [visionEnabled, visionFps, startVision, stopVision]);

    // 记录最近一次唇动时间 & 首次满足条件时做回带
    useEffect(() => {
        if (!visionEnabled || !visionConnected) return;

        if (isLipMoving) {
            const now = Date.now();
            lastLipTsRef.current = now;
            // 记录上升沿
            if (!prevLipRef.current) {
                lipOnTsRef.current = now;
                console.log('[Vision] Lip ↑ at', lipOnTsRef.current);
            }

            // 流式路径：允许在引擎就绪后开始发分片
            if (!isStreamingRef.current && hasFaceRef.current && !forceFileModeRef.current) {
                if (engineReady.current && vadActiveRef.current) {
                    // 只有VAD也有声时才开始流式
                    isStreamingRef.current = true;
                    console.log('[Stream Gate] Starting stream with buffered audio');
                    const ws = asrWsClientRef.current;
                    if (ws?.isConnected) flushBuffered(ws);
                } else if (!engineReady.current) {
                    pendingStartRef.current = true; // 等 ENGINE_STARTED
                    console.log('[Stream Gate] Pending start - waiting for engine ready');
                }
            }

            // 文件兜底路径：如果已判定不是流式，则开始"成段录音"（含回带）
            if (forceFileModeRef.current && !isFileRecRef.current && hasFaceRef.current && vadActiveRef.current) {
                const startTs = Math.min(now, (lipOnTsRef.current || now) - PRE_ROLL);
                segStartAtRef.current = startTs;
                isFileRecRef.current = true;
                // 回带：把 ring 中 >= startTs 的帧先放进去
                fileRecordingRef.current = ringRef.current
                    .filter(f => f.ts >= startTs)
                    .map(f => f.data.slice());
                console.log('[Fallback] File-mode recording start at', startTs,
                            'frames:', fileRecordingRef.current.length);
            }
        }
        prevLipRef.current = isLipMoving;
    }, [flushBuffered, isLipMoving, visionEnabled, visionConnected]);

    // 轮询停止条件
    useEffect(() => {
        const tick = () => {
            const runtime = runtimeRef.current;

            // 流式模式停止检查
            if (isStreamingRef.current) {
                let shouldStop = false;

                if (runtime.visionEnabled && runtime.visionConnected) {
                    // 视觉启用时：只有在"VAD静音" 且 （无唇动 或 无人脸）时才停止
                    const noRecentLip = Date.now() - lastLipTsRef.current > LIP_OFF_WINDOW;
                    const vadSilent = !vadActiveRef.current && (Date.now() - lastVoiceTsRef.current > VAD_OFF_WINDOW);
                    shouldStop = vadSilent && (noRecentLip || !hasFaceRef.current);
                } else {
                    // 视觉未启用时：仅看VAD
                    shouldStop = !vadActiveRef.current && (Date.now() - lastVoiceTsRef.current > VAD_OFF_WINDOW);
                }

                if (shouldStop) {
                    console.log('[Stream Gate] Stopping stream');
                    isStreamingRef.current = false;
                    const ws = asrWsClientRef.current;
                    if (ws?.isConnected && engineReady.current) {
                        ws.sendMessage(WS_SEND_ACTION_TYPE.ENGINE_FINAL_INPUT, new Uint8Array());
                    }
                }
            }

            // 文件模式停止检查
            if (forceFileModeRef.current && isFileRecRef.current) {
                let shouldStop = false;

                if (runtime.visionEnabled && runtime.visionConnected) {
                    // 视觉启用时：无唇动或无人脸
                    const noRecentLip = Date.now() - lastLipTsRef.current > LIP_OFF_WINDOW;
                    shouldStop = (noRecentLip || !hasFaceRef.current) && !vadActiveRef.current;
                } else {
                    // 视觉未启用时：仅看VAD
                    shouldStop = !vadActiveRef.current && (Date.now() - lastVoiceTsRef.current > VAD_OFF_WINDOW);
                }

                if (shouldStop) {
                    const full = mergeFloat32Arrays(fileRecordingRef.current);
                    fileRecordingRef.current = [];
                    isFileRecRef.current = false;
                    console.log('[Fallback] Submitting file-mode audio, len=', full.length);
                    runtime.handleSpeechEndFile(full);
                }
            }
            stopCheckId.current = requestAnimationFrame(tick);
        };
        stopCheckId.current = requestAnimationFrame(tick);

        return () => {
            if (stopCheckId.current) cancelAnimationFrame(stopCheckId.current);
        };
    }, []);

    useEffect(() => {
        const initCanvas = () => {
            const dpr = window.devicePixelRatio || 1
            const canvas = document.getElementById('voice-input') as HTMLCanvasElement

            if (canvas) {
                const { width: cssWidth, height: cssHeight } = canvas.getBoundingClientRect()

                canvas.width = dpr * cssWidth
                canvas.height = dpr * cssHeight
                canvasRef.current = canvas

                const ctx = canvas.getContext('2d')
                if (ctx) {
                    ctx.scale(dpr, dpr)
                    ctx.fillStyle = 'rgb(215, 183, 237)'
                    ctxRef.current = ctx
                }
            }
        }

        const drawCanvas = () => {
            const canvas = canvasRef.current
            const ctx = ctxRef.current
            if (canvas && ctx && waveData.current) {
                const dataArray = [].slice.call(waveData.current)
                const resolution = 10
                const lineLength = parseInt(`${canvas.width / resolution}`)
                const gap = parseInt(`${dataArray.length / lineLength}`)
                ctx.clearRect(0, 0, canvas.width, canvas.height)
                ctx.beginPath()
                let x = 0
                for (let i = 0; i < lineLength; i++) {
                    const v = dataArray.slice(i * gap, i * gap + gap).reduce((prev: number, next: number) => {
                        return prev + next
                    }, 0) / gap

                    const y = (v - 128) / 128 * canvas.height

                    ctx.moveTo(x, 16)
                    if (ctx.roundRect)
                        ctx.roundRect(x, 16 - y, 2, y, [1, 1, 0, 0])
                    else
                        ctx.rect(x, 16 - y, 2, y)
                    ctx.fill()
                    x += resolution
                }
                ctx.closePath();
            }
            drawId.current = requestAnimationFrame(drawCanvas);
        }

        const pushRing = (frame: PcmFrame) => {
            const ring = ringRef.current;
            ring.push(frame);
            if (ring.length > RING_N) ring.splice(0, ring.length - RING_N);
        }

        const asrWsClient = createASRWebsocketClient({
            engine: engine,
            config: settings,
            onMessage: (action: string, data: Uint8Array) => {
                const runtime = runtimeRef.current;
                const recvAction = action as WS_RECV_ACTION_TYPE;
                const recvData = new TextDecoder('utf-8').decode(data).trim();
                switch (recvAction) {
                    case WS_RECV_ACTION_TYPE.ENGINE_INITIALZING:
                        console.log('[ASR WS] Engine initializing...');
                        break;
                    case WS_RECV_ACTION_TYPE.ENGINE_STARTED:
                        console.log('[ASR WS] Engine started successfully');
                        setEngineLoading(false);
                        engineReady.current = true;
                        if (handshakeTimerRef.current) {
                            clearTimeout(handshakeTimerRef.current);
                            handshakeTimerRef.current = null;
                        }

                        // 如果之前因为未就绪而错过了启动，这里立即开流并回放缓冲
                        const now = Date.now();
                        const recentLip = now - lastLipTsRef.current <= LIP_OFF_WINDOW;
                        const warmupOk = now < lipWarmupUntilRef.current;
                       if (
                            pendingStartRef.current &&
                            hasFaceRef.current &&
                           !isStreamingRef.current &&
                           vadActiveRef.current &&
                           (recentLip || warmupOk)
                      ) {
                            isStreamingRef.current = true;
                            pendingStartRef.current = false;
                            const ws = asrWsClientRef.current;
                            if (ws?.isConnected) {
                                console.log('[Stream Gate] Late-start: flushing buffered audio after ENGINE_STARTED');
                                flushBuffered(ws);
                            }
                        }
                        break;
                    case WS_RECV_ACTION_TYPE.ENGINE_PARTIAL_OUTPUT:
                        const lastChatRecord = runtime.getLastRecord();
                        if (lastChatRecord && lastChatRecord.role == CHAT_ROLE.AI) {
                            runtime.abort();
                            runtime.addChatRecord({ role: CHAT_ROLE.HUMAN, think: "", content: recvData })
                        } else {
                            runtime.updateLastRecord({ role: CHAT_ROLE.HUMAN, think: "", content: recvData })
                        }
                        break;
                    case WS_RECV_ACTION_TYPE.ENGINE_FINAL_OUTPUT:
                        runtime.deleteLastRecord();
                        runtime.chat(recvData);
                        isStreamingRef.current = false; // 重置流式状态
                        audioBufferRef.current = [];     // 清空缓冲
                        break;
                    case WS_RECV_ACTION_TYPE.ENGINE_STOPPED:
                        console.log('[ASR WS] Engine stopped');
                        setEngineLoading(true);
                        engineReady.current = false;
                        isStreamingRef.current = false;
                        pendingStartRef.current = false;
                        break;
                    case WS_RECV_ACTION_TYPE.ERROR:
                        console.error('[ASR WS] Error:', recvData);
                        setEngineLoading(true);
                        engineReady.current = false;
                        isStreamingRef.current = false;
                        pendingStartRef.current = false;
                        addToast({
                            title: recvData,
                            variant: "flat",
                            color: "danger"
                        })
                        break;
                    default:
                        break;
                }
            },
            onError: (error: Error) => {
                console.error('[ASR WS] Connection error:', error);
                addToast({
                    title: error.message,
                    variant: "flat",
                    color: "danger"
                })
            }
        })

        // 保存 WebSocket 客户端引用
        asrWsClientRef.current = asrWsClient;

        // 1.2s 内收不到 ENGINE_STARTED ⇒ 视为非流式，引导回落
        handshakeTimerRef.current = window.setTimeout(() => {
            if (!engineReady.current) {
                forceFileModeRef.current = true;
                console.warn('[ASR] No ENGINE_STARTED in 1.2s. Fallback to file mode.');
            }
        }, 1200);

        // 优化：使用更小的分片大小（40ms = 640 samples @ 16kHz）
        const audioRecoder = new AudioRecoder(
            16000,
            1,
            16000 / 1000 * STREAM_CHUNK_MS, // 40ms 分片
            (chunk: Uint8Array) => {
                try {
                    const runtime = runtimeRef.current;

                    // 始终保存到缓冲区（用于回带）
                    audioBufferRef.current.push(chunk);
                    if (audioBufferRef.current.length > STREAM_BUFFER_SIZE) {
                        audioBufferRef.current.shift();
                    }

                    // 根据是否启用视觉决定门控条件
                    let shouldSend = false;
                   const now = Date.now();
                    const recentLip = now - lastLipTsRef.current <= LIP_OFF_WINDOW;
                   const warmupOk = now < lipWarmupUntilRef.current; // VAD 上升沿后的宽容期

                    if (runtime.visionEnabled && runtime.visionConnected) {
                       // 若尚未开流但满足条件 ⇒ 立即开流并 flush 缓冲
                        if (
                          !isStreamingRef.current &&
                          engineReady.current &&
                         vadActiveRef.current &&
                         hasFaceRef.current &&
                         (recentLip || warmupOk) &&
                          !forceFileModeRef.current
                        ) {
                          isStreamingRef.current = true;
                          console.log('[Stream Gate] Start stream (VAD + lip/warmup)');
                          flushBuffered(asrWsClient);
                        }

                       shouldSend =
                          isStreamingRef.current &&
                         vadActiveRef.current &&
                         hasFaceRef.current &&
                         (recentLip || warmupOk);
                    } else {
                        // 视觉未启用：仅看VAD
                        shouldSend = isStreamingRef.current && vadActiveRef.current;

                        // 如果VAD有声但还未开始流式，立即开始
                        if (!isStreamingRef.current && vadActiveRef.current && engineReady.current && !forceFileModeRef.current) {
                            isStreamingRef.current = true;
                            console.log('[Stream Gate] Starting stream (vision disabled, VAD active)');
                            flushBuffered(asrWsClient);
                        }
                    }

                    if (asrWsClient.isConnected && engineReady.current && shouldSend) {
                        asrWsClient.sendMessage(WS_SEND_ACTION_TYPE.ENGINE_PARTIAL_INPUT, chunk);
                    }
                } catch(error: any) {
                    addToast({
                        title: error.message,
                        variant: "flat",
                        color: "danger"
                    })
                }
            },
            (chunk: Float32Array) => {
                const now = Date.now();

                // 计算简单能量VAD
                let sum = 0;
                for (let i = 0; i < chunk.length; i++) {
                    sum += chunk[i] * chunk[i];
                }
                const rms = Math.sqrt(sum / chunk.length);

                // 更新 VAD 状态 + 上升沿 warm-up
                const wasActive = lastVadStateRef.current;
               if (rms > VAD_ENERGY_THRESH) {
                    vadActiveRef.current = true;
                    lastVoiceTsRef.current = now;
                    if (!wasActive) {
                        // 上升沿：给唇动 700ms 宽容期（可按 500~900 调整）
                       lipWarmupUntilRef.current = now + 700;
                        console.log('[VAD] Rising edge: lip warm-up until', lipWarmupUntilRef.current);
                    }
                } else if (now - lastVoiceTsRef.current > VAD_OFF_WINDOW) {
                    vadActiveRef.current = false;
                }
                lastVadStateRef.current = vadActiveRef.current;

                // 写入环形缓冲，用于回带
                pushRing({ ts: now, data: chunk.slice() });

                // 文件模式：如果正在录，就继续累积
                if (forceFileModeRef.current && isFileRecRef.current) {
                    fileRecordingRef.current.push(chunk.slice());
                }
                if (engineReady.current) {
                    waveData.current = convertFloat32ToAnalyseData(chunk);
                }
            }
        );

        initCanvas();
        drawId.current = requestAnimationFrame(drawCanvas);
        asrWsClient.connect();
        audioRecoder.start();

        return () => {
            audioRecoder.stop();
            asrWsClient.disconnect();
            !!drawId.current && cancelAnimationFrame(drawId.current);
            if (stopCheckId.current) cancelAnimationFrame(stopCheckId.current);
            if (handshakeTimerRef.current) {
                clearTimeout(handshakeTimerRef.current);
                handshakeTimerRef.current = null;
            }
        }
    }, [RING_N, engine, flushBuffered, settings])

    return (
        <div className='flex flex-col h-10 w-1/2 md:w-1/3 items-center relative'>
            {/* 视频预览小窗口 - 使用 bindPreviewRef 和 hasFace state */}
            {visionEnabled && showPreview && visionConnected && (
                <div className='absolute -top-36 right-0 w-32 h-24 rounded-lg overflow-hidden shadow-lg bg-black/80 border border-white/20 pointer-events-none'>
                    <video
                        ref={bindPreviewRef}
                        className='w-full h-full object-cover'
                        autoPlay
                        playsInline
                        muted
                    />
                    <div className='absolute top-1 right-1 flex gap-1'>
                        {hasFace && (
                            <div className='w-2 h-2 rounded-full bg-green-500' title="检测到人脸" />
                        )}
                        {isLipMoving && (
                            <div className='w-2 h-2 rounded-full bg-yellow-500 animate-pulse' title="检测到说话" />
                        )}
                    </div>
                </div>
            )}

            {engineLoading && <div className='flex flex-row gap-1 items-center'>
                <p className='text-xl font-bold'>{t('loading')}</p>
                <Spinner color='warning' variant="dots" size='lg'/>
            </div>}
            <canvas id="voice-input" className='h-full w-full' />
        </div>
    )
});

ChatInput.displayName = 'ChatInput';
ChatVadInput.displayName = 'ChatVadInput';
ChatStreamInput.displayName = 'ChatStreamInput';
