'use client'

import { useState, useEffect, memo, useRef } from "react";
import { useTranslations } from 'next-intl';
import {
    Divider,
    Switch,
    Autocomplete,
    AutocompleteItem,
    Link,
    Skeleton,
    Slider
} from "@heroui/react";
import { Card, CardBody } from "@heroui/react";
import {
    api_get_engine_list,
    api_get_engine_default,
    api_get_engine_config,
    api_tts_get_voice
} from '@/lib/api/server';
import { ENGINE_TYPE, EngineParamDesc, EngineDesc, IFER_TYPE, CHAT_MODE } from '@/lib/protocol';
import {
    useSentioAsrStore,
    useSentioTtsStore,
    useSentioAgentStore,
    useSentioVisionStore,
    useChatRecordStore,
    useSentioChatModeStore
} from "@/lib/store/sentio";
import { InfoTip } from "@/components/tips/info";
import { ParamsLoading, ParamsList } from "./params";

type SettingsMap = { [key: string]: any };

type EngineStoreData = {
    enable: boolean,
    engine: string,
    settings: SettingsMap,
    infer_type: IFER_TYPE,
    setEnable: (enable: boolean) => void,
    setInferType: (infer_type: IFER_TYPE) => void,
    setEngine: (engine: string) => void,
    setSettings: (settings: SettingsMap) => void,
};

const EngineSelector = memo(function EngineSelector({
    engine,
    engineList,
    onEngineChange
}: {
    engine: string,
    engineList: { [key: string]: EngineDesc },
    onEngineChange: (e: string | null) => void
}) {
    const contentRender = () => {
        return (
            <div className="flex flex-col gap-1">
                <p className="font-bold">{engineList[engine]?.desc}</p>
                {engineList[engine]?.meta.official && <Link href={engineList[engine].meta.official} isExternal className="text-xs hover:underline">👉 前往官网</Link>}
                {engineList[engine]?.meta.configuration && <Link href={engineList[engine].meta.configuration} isExternal className="text-xs hover:underline">👉 如何配置</Link>}
                {engineList[engine]?.meta.tips && <p className="text-xs text-yellow-500">{`Tips: ${engineList[engine].meta.tips}`}</p>}
            </div>
        );
    };

    return (
        <div className="flex flex-row gap-2">
            <Autocomplete
                className="max-w-xs"
                color="warning"
                aria-label='engineSelect'
                key="engineSelect"
                name="engineSelect"
                selectedKey={engine}
                onSelectionChange={(e) => onEngineChange(e as string)}
            >
                {Object.values(engineList).map((currentEngine) => (
                    <AutocompleteItem key={currentEngine.name}>{currentEngine.name}</AutocompleteItem>
                ))}
            </Autocomplete>
            <InfoTip content={contentRender()} />
        </div>
    );
});

const EngineSelectorLoading = () => {
    return (
        <Skeleton className="max-w-xs rounded-lg">
            <div className="h-8 max-w-xs rounded-lg bg-default-300" />
        </Skeleton>
    );
};

const EngineEnable = memo(function EngineEnable({
    show,
    enable,
    onSelect,
    label,
    disabled = false,
}: {
    show: boolean,
    enable: boolean,
    onSelect: (isSelected: boolean) => void,
    label: string,
    disabled?: boolean,
}) {
    if (!show) return null;

    return (
        <div className="flex flex-col gap-4">
            <Switch isSelected={enable} color="primary" isDisabled={disabled} onValueChange={onSelect}>{label}</Switch>
            <Divider />
        </div>
    );
});

function VisionInfo({ visible }: { visible: boolean }) {
    if (!visible) return null;

    return (
        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 mb-4">
            <p className="text-sm font-medium mb-2">视觉检测说明：</p>
            <ul className="text-xs space-y-1 text-gray-600 dark:text-gray-400">
                <li>• 使用摄像头检测人脸和唇动</li>
                <li>• 配合 VAD 实现精准语音识别</li>
                <li>• 可有效过滤环境噪音</li>
                <li>• 最近 300ms 内有唇动开始录音</li>
                <li>• 超过 600ms 无唇动停止录音</li>
            </ul>
        </div>
    );
}

function VisionUnavailable({ visible, reason }: { visible: boolean, reason: string }) {
    if (!visible) return null;

    return (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <p>当前环境没有可用视觉引擎，请安装兼容的 MediaPipe 运行时后重试，或先关闭视觉检测。</p>
            {reason && (
                <p className="mt-2 break-words text-xs text-amber-800">原因: {reason}</p>
            )}
        </div>
    );
}

const VisionSettings = memo(function VisionSettings({
    visible,
    fps,
    showPreview,
    setFps,
    setShowPreview
}: {
    visible: boolean,
    fps: number,
    showPreview: boolean,
    setFps: (fps: number) => void,
    setShowPreview: (show: boolean) => void
}) {
    if (!visible) return null;

    return (
        <div className="flex flex-col gap-4 w-full">
            <p className="m-2 text-lg">详细参数配置</p>

            <div className="space-y-6">
                <div className="space-y-4">
                    <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">性能设置</h4>

                    <div className="space-y-2">
                        <div className="flex justify-between items-center">
                            <label className="text-sm font-medium">检测帧率</label>
                            <span className="text-xs text-gray-500">{fps} FPS</span>
                        </div>
                        <Slider
                            size="sm"
                            step={1}
                            minValue={5}
                            maxValue={30}
                            value={fps}
                            onChange={(value) => setFps(Array.isArray(value) ? value[0] : value)}
                            className="max-w-full"
                            color="primary"
                        />
                        <div className="flex justify-between text-xs text-gray-400">
                            <span>省电模式 (5-10)</span>
                            <span>推荐 (10-15)</span>
                            <span>高精度 (20-30)</span>
                        </div>
                    </div>
                </div>

                <div className="space-y-4">
                    <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">显示设置</h4>

                    <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                        <div>
                            <label className="text-sm font-medium">摄像头预览</label>
                            <p className="text-xs text-gray-500">在语音输入界面显示实时画面</p>
                        </div>
                        <Switch
                            isSelected={showPreview}
                            onValueChange={setShowPreview}
                            size="sm"
                            color="primary"
                        />
                    </div>
                </div>

                <div className="space-y-4">
                    <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">检测逻辑</h4>

                    <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
                        <div className="grid grid-cols-2 gap-4 text-sm">
                            <div className="space-y-1">
                                <span className="font-medium">唇动触发窗口</span>
                                <p className="text-xs text-gray-500">最近 300ms 内有唇动</p>
                            </div>
                            <div className="space-y-1">
                                <span className="font-medium">静默停止窗口</span>
                                <p className="text-xs text-gray-500">超过 600ms 无唇动停止</p>
                            </div>
                            <div className="space-y-1">
                                <span className="font-medium">起点回带时长</span>
                                <p className="text-xs text-gray-500">从唇动开始前 200ms</p>
                            </div>
                            <div className="space-y-1">
                                <span className="font-medium">环形缓冲长度</span>
                                <p className="text-xs text-gray-500">保存最近 1.2 秒音频</p>
                            </div>
                        </div>
                    </div>

                    <div className="text-xs text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 p-2 rounded">
                        💡 这些参数由系统自动优化，通常无需手动调整
                    </div>
                </div>

                <div className="space-y-4">
                    <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">技术信息</h4>

                    <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-3">
                        <div className="space-y-2 text-sm">
                            <div className="flex justify-between">
                                <span className="text-gray-600 dark:text-gray-400">当前引擎:</span>
                                <span className="font-mono text-green-600 dark:text-green-400">FaceLipDetector</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-600 dark:text-gray-400">算法架构:</span>
                                <span className="font-mono">MediaPipe + LSTM</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-600 dark:text-gray-400">处理模式:</span>
                                <span className="font-mono">本地实时</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-600 dark:text-gray-400">推理类型:</span>
                                <span className="font-mono">NORMAL</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3">
                    <h4 className="text-sm font-medium text-yellow-800 dark:text-yellow-200 mb-2">性能建议</h4>
                    <ul className="text-xs text-yellow-700 dark:text-yellow-300 space-y-1">
                        <li>• 低配置设备建议使用 5-10 FPS</li>
                        <li>• 确保摄像头光线充足以提高检测准确性</li>
                        <li>• 保持人脸在摄像头画面中央位置</li>
                        <li>• 关闭预览窗口可略微降低CPU占用</li>
                    </ul>
                </div>
            </div>
        </div>
    );
});

export const EngineTab = memo(function EngineTab({ engineType }: { engineType: ENGINE_TYPE }) {
    const t = useTranslations('Products.sentio.settings');
    const { clearChatRecord } = useChatRecordStore();
    const { chatMode } = useSentioChatModeStore();
    const asrStore = useSentioAsrStore();
    const ttsStore = useSentioTtsStore();
    const agentStore = useSentioAgentStore();
    const visionStore = useSentioVisionStore();

    let storeData: EngineStoreData;
    switch (engineType) {
        case ENGINE_TYPE.ASR:
            storeData = asrStore;
            break;
        case ENGINE_TYPE.TTS:
            storeData = ttsStore;
            break;
        case ENGINE_TYPE.AGENT:
            storeData = agentStore;
            break;
        case ENGINE_TYPE.VISION:
            storeData = {
                enable: visionStore.enabled,
                engine: visionStore.engine,
                settings: {
                    fps: visionStore.fps,
                    showPreview: visionStore.showPreview
                },
                infer_type: IFER_TYPE.NORMAL,
                setEnable: visionStore.setEnabled,
                setInferType: () => {},
                setEngine: visionStore.setEngine,
                setSettings: (nextSettings: SettingsMap) => {
                    if ('fps' in nextSettings) visionStore.setFps(nextSettings.fps);
                    if ('showPreview' in nextSettings) visionStore.setShowPreview(nextSettings.showPreview);
                }
            };
            break;
        default:
            storeData = asrStore;
            break;
    }

    const { enable, engine, settings, setEnable, setInferType, setEngine, setSettings } = storeData;

    const [isLoadingEngineList, setIsLoadingEngineList] = useState(true);
    const [isLoadingEngineParams, setIsLoadingEngineParams] = useState(true);
    const [visionUnavailableReason, setVisionUnavailableReason] = useState("");
    const engineList = useRef<{ [key: string]: EngineDesc }>({});
    const engineParams = useRef<EngineParamDesc[]>([]);
    const hasAvailableVisionEngine = engineType !== ENGINE_TYPE.VISION || Object.keys(engineList.current).length > 0;

    const getEngineParams = (currentEngineType: ENGINE_TYPE, currentEngine: string, currentSettings: SettingsMap) => {
        if (currentEngineType === ENGINE_TYPE.VISION) {
            setIsLoadingEngineParams(false);
            return;
        }

        api_get_engine_config(currentEngineType, currentEngine).then((params) => {
            const nextSettings: SettingsMap = {};
            for (const param of params) {
                nextSettings[param.name] = param.default;
            }

            if (Object.keys(currentSettings).length !== params.length) {
                setSettings(nextSettings);
            }

            if (Object.keys(nextSettings).length > 0) {
                for (const param of params) {
                    if (param.name in currentSettings) {
                        param.default = currentSettings[param.name];
                    }
                }
            }
            engineParams.current = params;

            if (currentEngineType === ENGINE_TYPE.TTS && 'voice' in nextSettings) {
                api_tts_get_voice(currentEngine, currentSettings).then((voices) => {
                    for (const param of params) {
                        if (param.name === 'voice') {
                            param.choices = voices.map((voice) => voice.name);
                            break;
                        }
                    }
                    engineParams.current = params;
                    setIsLoadingEngineParams(false);
                });
            } else {
                setIsLoadingEngineParams(false);
            }
        }).catch((error) => {
            console.error('Failed to get engine params:', error);
            setIsLoadingEngineParams(false);
            engineParams.current = [];
        });
    };

    const onEngineChange = (value: string | null) => {
        if (value == null) {
            return;
        }

        setIsLoadingEngineParams(true);
        clearChatRecord();
        engineParams.current = [];
        setEngine(value);
        if (engineList.current[value] && engineType !== ENGINE_TYPE.VISION) {
            setInferType(engineList.current[value].infer_type as IFER_TYPE);
        }
        getEngineParams(engineType, value, settings);
    };

    const runtimeRef = useRef({
        engine,
        settings,
        setEnable,
        setEngine,
        setInferType,
        getEngineParams,
        onEngineChange,
    });
    runtimeRef.current = {
        engine,
        settings,
        setEnable,
        setEngine,
        setInferType,
        getEngineParams,
        onEngineChange,
    };

    useEffect(() => {
        api_get_engine_list(engineType).then((engines: EngineDesc[]) => {
            const runtime = runtimeRef.current;
            const rawEngines = engines ?? [];
            const filterEngines = rawEngines.filter((currentEngine) => {
                if (chatMode === CHAT_MODE.IMMSERSIVE) {
                    return true;
                }
                return currentEngine.infer_type === IFER_TYPE.NORMAL;
            });

            engineList.current = filterEngines.reduce((acc: { [key: string]: EngineDesc }, currentEngine) => {
                acc[currentEngine.name] = currentEngine;
                return acc;
            }, {});

            setIsLoadingEngineList(false);
            if (engineType === ENGINE_TYPE.VISION) {
                setVisionUnavailableReason("");
            }

            const names = filterEngines.map((currentEngine) => currentEngine.name);
            if (engineType === ENGINE_TYPE.VISION && names.length === 0) {
                engineParams.current = [];
                setIsLoadingEngineParams(false);
                runtime.setEnable(false);
                runtime.setEngine("");
                api_get_engine_default(engineType).then((defaultEngine: string | EngineDesc) => {
                    if (typeof defaultEngine !== "string") {
                        setVisionUnavailableReason(defaultEngine.meta?.tips || defaultEngine.desc || "");
                    }
                }).catch(() => {
                    setVisionUnavailableReason("");
                });
                return;
            }

            if (names.includes(runtime.engine)) {
                setIsLoadingEngineParams(true);
                engineParams.current = [];
                runtime.setEngine(runtime.engine);
                if (engineList.current[runtime.engine] && engineType !== ENGINE_TYPE.VISION) {
                    runtime.setInferType(engineList.current[runtime.engine].infer_type as IFER_TYPE);
                }
                runtime.getEngineParams(engineType, runtime.engine, runtime.settings);
                return;
            }

            api_get_engine_default(engineType).then((defaultEngine: string | EngineDesc) => {
                const name = typeof defaultEngine === 'string' ? defaultEngine : defaultEngine?.name;
                if (name) {
                    runtime.onEngineChange(name);
                } else {
                    if (engineType === ENGINE_TYPE.VISION) {
                        setIsLoadingEngineParams(false);
                        runtime.setEnable(false);
                        runtime.setEngine("");
                        if (typeof defaultEngine !== "string") {
                            setVisionUnavailableReason(defaultEngine.meta?.tips || defaultEngine.desc || "");
                        }
                        return;
                    }
                    console.warn('Invalid default engine:', defaultEngine);
                }
            }).catch(() => {
                if (engineType === ENGINE_TYPE.VISION) {
                    setIsLoadingEngineParams(false);
                    runtime.setEnable(false);
                    runtime.setEngine("");
                    setVisionUnavailableReason("");
                }
            });
        }).catch((error) => {
            console.error('Failed to get engine list:', error);
            setIsLoadingEngineList(false);
            if (engineType === ENGINE_TYPE.VISION) {
                engineParams.current = [];
                setIsLoadingEngineParams(false);
                runtimeRef.current.setEnable(false);
                runtimeRef.current.setEngine("");
                setVisionUnavailableReason("");
            }
        });
    }, [chatMode, engineType]);

    return (
        <Card>
            <CardBody className="p-4">
                <div className="flex flex-col gap-4">
                    <EngineEnable
                        show={engineType !== ENGINE_TYPE.AGENT}
                        enable={enable}
                        onSelect={setEnable}
                        label={t('switch')}
                        disabled={engineType === ENGINE_TYPE.VISION && !hasAvailableVisionEngine}
                    />

                    <VisionInfo visible={engineType === ENGINE_TYPE.VISION} />
                    <VisionUnavailable
                        visible={engineType === ENGINE_TYPE.VISION && !isLoadingEngineList && !hasAvailableVisionEngine}
                        reason={visionUnavailableReason}
                    />

                    {enable && hasAvailableVisionEngine && (
                        <>
                            <div className="flex flex-col gap-1">
                                <p className="m-2 text-lg">{t('selectEngine')}</p>
                                {isLoadingEngineList ? (
                                    <EngineSelectorLoading />
                                ) : (
                                    <EngineSelector
                                        engine={engine}
                                        engineList={engineList.current}
                                        onEngineChange={onEngineChange}
                                    />
                                )}
                            </div>

                            {engineType === ENGINE_TYPE.VISION ? (
                                <VisionSettings
                                    visible
                                    fps={visionStore.fps}
                                    showPreview={visionStore.showPreview}
                                    setFps={visionStore.setFps}
                                    setShowPreview={visionStore.setShowPreview}
                                />
                            ) : (
                                <div className="flex flex-col gap-1 w-full">
                                    <p className="m-2 text-lg">{t('engineConfig')}</p>
                                    <div className="flex flex-col gap-1">
                                        {isLoadingEngineParams ? (
                                            <ParamsLoading />
                                        ) : (
                                            <ParamsList params={engineParams.current} settings={settings} setSettings={setSettings} />
                                        )}
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </CardBody>
        </Card>
    );
});

EngineSelector.displayName = 'EngineSelector';
EngineEnable.displayName = 'EngineEnable';
VisionSettings.displayName = 'VisionSettings';
EngineTab.displayName = 'EngineTab';

export function ASRTab() {
    return (
        <EngineTab engineType={ENGINE_TYPE.ASR} />
    );
}

export function TTSTab() {
    return (
        <EngineTab engineType={ENGINE_TYPE.TTS} />
    );
}

export function AgentTab() {
    return (
        <EngineTab engineType={ENGINE_TYPE.AGENT} />
    );
}

export function VisionTab() {
    return (
        <EngineTab engineType={ENGINE_TYPE.VISION} />
    );
}
