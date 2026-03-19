'use client'

import React, { useState, useEffect, memo, useRef } from "react";
import { useTranslations } from 'next-intl';
import {
    Divider,
    Switch,
    Autocomplete,
    AutocompleteItem,
    Link,
    Skeleton,
    addToast,
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
import {ParamsLoading, ParamsList} from "./params";

const EngineSelector = memo(({
    engine,
    engineList,
    onEngineChange
}: {
    engine: string,
    engineList: { [key: string]: EngineDesc },
    onEngineChange: (e: string | null) => void
}) => {
    const contentRender = () => {
        return (
            <div className="flex flex-col gap-1">
                <p className="font-bold">{engineList[engine]?.desc}</p>
                {engineList[engine]?.meta.official && <Link href={engineList[engine].meta.official} isExternal className="text-xs hover:underline">👉 前往官网</Link>}
                {engineList[engine]?.meta.configuration && <Link href={engineList[engine].meta.configuration} isExternal className="text-xs hover:underline">👉 如何配置</Link>}
                {engineList[engine]?.meta.tips && <p className="text-xs text-yellow-500">{`Tips: ${engineList[engine].meta.tips}`}</p>}
            </div>
        )
    }
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
                {
                    Object.values(engineList).map((engine) => (
                        <AutocompleteItem key={engine.name}>{engine.name}</AutocompleteItem>
                    ))
                }
            </Autocomplete>
            <InfoTip content={contentRender()}/>
        </div>
    )
});

const EngineSelectorLoading = () => {
    return (
        <Skeleton className="max-w-xs rounded-lg">
          <div className="h-8 max-w-xs rounded-lg bg-default-300" />
        </Skeleton>
    )
}

export const EngineTab = memo(({ engineType }: { engineType: ENGINE_TYPE }) => {
    const t = useTranslations('Products.sentio.settings');
    const { clearChatRecord } = useChatRecordStore();
    const { chatMode } = useSentioChatModeStore();

    // 根据引擎类型选择对应的 store
    const storeData = (() => {
        switch (engineType) {
            case ENGINE_TYPE.ASR:
                return useSentioAsrStore();
            case ENGINE_TYPE.TTS:
                return useSentioTtsStore();
            case ENGINE_TYPE.AGENT:
                return useSentioAgentStore();
            case ENGINE_TYPE.VISION:
                // Vision 引擎使用自己的 store，需要适配接口
                const visionStore = useSentioVisionStore();
                // 为 Vision 创建一个兼容的 settings 对象
                const visionSettings: { [key: string]: any } = {
                    fps: visionStore.fps,
                    showPreview: visionStore.showPreview
                };
                return {
                    enable: visionStore.enabled,
                    engine: visionStore.engine,
                    settings: visionSettings,
                    infer_type: IFER_TYPE.NORMAL, // Vision 默认使用 NORMAL
                    setEnable: visionStore.setEnabled,
                    setInferType: (type: IFER_TYPE) => {}, // Vision 不需要 infer_type
                    setEngine: visionStore.setEngine,
                    setSettings: (settings: { [key: string]: any }) => {
                        // Vision 的设置更新逻辑
                        if ('fps' in settings) visionStore.setFps(settings.fps);
                        if ('showPreview' in settings) visionStore.setShowPreview(settings.showPreview);
                    }
                };
            default:
                return useSentioAsrStore();
        }
    })();

    const { enable, engine, settings, setEnable, setInferType, setEngine, setSettings } = storeData;

    const [ isLoadingEngineList, setIsLoadingEngineList ] = useState(true);
    const [ isLoadingEngineParams, setIsLoadingEngineParams ] = useState(true);
    const engineList = useRef<{[key: string]: EngineDesc}>({});
    const engineParams = useRef<EngineParamDesc[]>([]);

    const getEngineParams = (engineType: ENGINE_TYPE, engine: string) => {
        // Vision 引擎不需要获取参数
        if (engineType === ENGINE_TYPE.VISION) {
            setIsLoadingEngineParams(false);
            return;
        }

        // 获取当前引擎配置参数
        api_get_engine_config(engineType, engine).then((params) => {
            // 更新参数列表
            let newSettings: { [key: string]: any } = {};
            for (var id in params) {
                let param = params[id];
                newSettings[param.name] = param.default;
            }
            // 后端参数数量更新, 根据数量进行热更新
            if (Object.keys(settings).length != params.length) {
                setSettings(newSettings);
            }
            // 填充默认值
            if (Object.keys(newSettings).length > 0) {
                for (var id in params) {
                    let param = params[id];
                    if (param.name in settings) {
                        param.default = settings[param.name];
                    }
                }
            }
            engineParams.current = params;

            // 获取TTS支持的语音列表(支持获取语音列表的引擎)
            if (engineType == ENGINE_TYPE.TTS && 'voice' in newSettings) {
                console.log('set voice', settings)
                api_tts_get_voice(engine, settings).then((voices) => {
                    // 填充声音列表
                    for (var id in params) {
                        let param = params[id];
                        if (param.name == 'voice') {
                            param.choices = voices.map((voice) => voice.name);
                            break;
                        }
                    }
                    // 更新语音列表
                    engineParams.current = params;
                    setIsLoadingEngineParams(false);
                })
            } else {
                setIsLoadingEngineParams(false);
            }
        }).catch((error) => {
            console.error('Failed to get engine params:', error);
            setIsLoadingEngineParams(false);
            engineParams.current = [];
        });
    };

    const onEngineChange = (e: string | null) => {
        // 切换引擎
        if (e == null) {
            return;
        }
        setIsLoadingEngineParams(true);
        clearChatRecord();
        engineParams.current = [];
        setEngine(e);
        if (engineList.current[e] && engineType !== ENGINE_TYPE.VISION) {
            setInferType(engineList.current[e].infer_type as IFER_TYPE);
        }
        getEngineParams(engineType, e);
    };

    useEffect(() => {
        // 获取引擎列表
        api_get_engine_list(engineType).then((engines: EngineDesc[]) => {
            // Vision 引擎可能返回空列表或特殊格式
            if (!engines || engines.length === 0) {
                if (engineType === ENGINE_TYPE.VISION) {
                    // 为 Vision 提供默认引擎
                    engines = [{
                        name: "FaceLipDetector",
                        type: ENGINE_TYPE.VISION,
                        infer_type: IFER_TYPE.NORMAL,
                        desc: "人脸和唇形检测引擎",
                        meta: {
                            official: "",
                            configuration: "",
                            tips: "使用 MediaPipe 和 LSTM 模型进行检测",
                            fee: ""
                        }
                    }];
                }
            }

            const filterEngines = engines.filter(function(engine){
                if (chatMode == CHAT_MODE.IMMSERSIVE) {
                    return true;
                } else {
                    return engine.infer_type == IFER_TYPE.NORMAL;
                }
            })

            engineList.current = filterEngines.reduce((el: { [key: string]: EngineDesc }, engine) => {
                el[engine.name] = engine;
                return el;
            }, {});

            setIsLoadingEngineList(false);

            const names = filterEngines.map((engine) => engine.name);
            if (names.includes(engine)) {
                // 存在存储引擎时加载
                setIsLoadingEngineParams(true);
                engineParams.current = [];
                setEngine(engine);
                if (engineList.current[engine] && engineType !== ENGINE_TYPE.VISION) {
                    setInferType(engineList.current[engine].infer_type as IFER_TYPE);
                }
                getEngineParams(engineType, engine);
            } else {
                // 不存在时获取默认引擎
                api_get_engine_default(engineType).then((eng: string | EngineDesc) => {
                    const name = typeof eng === 'string' ? eng : eng?.name;
                    if (name) onEngineChange(name);
                    else if (engineType === ENGINE_TYPE.VISION) {
                        // Vision 使用默认引擎
                        onEngineChange("FaceLipDetector");
                    } else {
                        console.warn('Invalid default engine:', eng);
                    }
                }).catch((error) => {
                    if (engineType === ENGINE_TYPE.VISION) {
                        // Vision 出错时使用默认值
                        onEngineChange("FaceLipDetector");
                    }
                });
            }
        }).catch((error) => {
            console.error('Failed to get engine list:', error);
            setIsLoadingEngineList(false);
            if (engineType === ENGINE_TYPE.VISION) {
                // 为 Vision 提供备用配置
                engineList.current = {
                    "FaceLipDetector": {
                        name: "FaceLipDetector",
                        type: ENGINE_TYPE.VISION,
                        infer_type: IFER_TYPE.NORMAL,
                        desc: "人脸和唇形检测引擎",
                        meta: {
                            official: "",
                            configuration: "",
                            tips: "使用 MediaPipe 和 LSTM 模型进行检测",
                            fee: ""
                        }
                    }
                };
                onEngineChange("FaceLipDetector");
            }
        });
    }, [chatMode, engineType]);

    const EnineEnable = memo(({
        show,
        onSelect
    }: {
        show: boolean,
        onSelect: (isSelected: boolean) => void
    }) => {
        return (
            show &&
            <div className="flex flex-col gap-4">
                <Switch isSelected={enable} color="primary" onValueChange={onSelect}>{t('switch')}</Switch>
                <Divider />
            </div>
        )
    });

    // Vision 引擎的特殊说明
    const VisionInfo = () => {
        if (engineType !== ENGINE_TYPE.VISION) return null;

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
    };

    // Vision 的详细参数配置
    const VisionSettings = () => {
        if (engineType !== ENGINE_TYPE.VISION) return null;

        const { fps, showPreview, setFps, setShowPreview } = useSentioVisionStore();

        return (
            <div className="flex flex-col gap-4 w-full">
                <p className="m-2 text-lg">详细参数配置</p>

                <div className="space-y-6">
                    {/* 性能参数组 */}
                    <div className="space-y-4">
                        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">性能设置</h4>

                        {/* FPS 设置 */}
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

                    {/* 显示参数组 */}
                    <div className="space-y-4">
                        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">显示设置</h4>

                        {/* 预览窗口开关 */}
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

                    {/* 检测逻辑参数组 */}
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

                    {/* 技术信息 */}
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

                    {/* 性能提示 */}
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
    };

    return (
        <Card>
            <CardBody className="p-4">
                <div className="flex flex-col gap-4">
                    <EnineEnable
                        show={engineType != ENGINE_TYPE.AGENT}
                        onSelect={(onSelected) => setEnable(onSelected)}
                    />

                    <VisionInfo />

                    {
                        enable &&
                        <>
                            <div className="flex flex-col gap-1">
                                <p className="m-2 text-lg">{t('selectEngine')}</p>
                                {
                                    isLoadingEngineList?
                                    <EngineSelectorLoading />
                                    :
                                    <EngineSelector
                                        engine={engine}
                                        engineList={engineList.current}
                                        onEngineChange={onEngineChange}
                                    />
                                }
                            </div>

                            {/* Vision 引擎使用详细的设置显示 */}
                            {engineType === ENGINE_TYPE.VISION ? (
                                <VisionSettings />
                            ) : (
                                <div className="flex flex-col gap-1 w-full">
                                    <p className="m-2 text-lg">{t('engineConfig')}</p>
                                    <div className="flex flex-col gap-1">
                                        {
                                            isLoadingEngineParams?
                                            <ParamsLoading />
                                            :
                                            <ParamsList params={engineParams.current} settings={settings} setSettings={setSettings}/>
                                        }
                                    </div>
                                </div>
                            )}
                        </>
                    }

                </div>
            </CardBody>
        </Card>
    )
});

export function ASRTab() {
    return (
        <EngineTab engineType={ENGINE_TYPE.ASR} />
    )
}

export function TTSTab() {
    return (
        <EngineTab engineType={ENGINE_TYPE.TTS} />
    )
}

export function AgentTab() {
    return (
        <EngineTab engineType={ENGINE_TYPE.AGENT} />
    )
}

export function VisionTab() {
    return (
        <EngineTab engineType={ENGINE_TYPE.VISION} />
    )
}