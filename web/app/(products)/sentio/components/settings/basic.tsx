'use client'

import React from "react";
import { useTranslations } from 'next-intl';
import {
    Switch,
    Slider,
    Divider
} from "@heroui/react";
import { Card, CardBody } from "@heroui/react";
import {
    useSentioBasicStore,
    useSentioVisionStore
} from "@/lib/store/sentio";
import { Live2dManager } from "@/lib/live2d/live2dManager";
import * as CONSTANTS from '@/lib/constants';

// 简化的视觉检测基础设置 - 只保留最基本的开关
const VisionBasicSettings = () => {
    const { enabled, setEnabled } = useSentioVisionStore();

    return (
        <div className="space-y-4">
            <h3 className="text-lg font-semibold">视觉检测</h3>

            {/* 只保留总开关 */}
            <div className="flex items-center justify-between">
                <div>
                    <label className="text-sm font-medium">启用视觉检测</label>
                    <p className="text-xs text-gray-500">开启后将使用摄像头进行人脸和唇动检测</p>
                </div>
                <Switch
                    isSelected={enabled}
                    onValueChange={setEnabled}
                    size="sm"
                    color="primary"
                />
            </div>

            {/* 简化的功能说明 */}
            {enabled && (
                <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3">
                    <p className="text-xs text-gray-600 dark:text-gray-400">
                        详细配置请在"视觉检测"标签页中调整帧率、预览窗口等参数
                    </p>
                </div>
            )}
        </div>
    );
};

export function BasicTab() {
    const t = useTranslations('Products.sentio.settings.basic');
    const { sound, lipFactor, showThink, setSound, setLipFactor, setShowThink } = useSentioBasicStore();

    const renderParam = (name: string, component: React.ReactNode) => {
        return (
            <div className="flex flex-col gap-2">
                <p>{name}</p>
                {component}
            </div>
        )
    }

    return (
        <Card>
            <CardBody>
                <div className="flex flex-col gap-2">
                    <div className="flex flex-col mt-2 gap-6">
                        {/* 原有的基础设置 */}
                        {renderParam(
                            t('soundSwitch'),
                            <Switch
                                isSelected={sound}
                                color="primary"
                                onValueChange={(isSelected) => {
                                    setSound(isSelected);
                                }}
                            />
                        )}

                        {renderParam(
                            t('showThink'),
                            <Switch
                                isSelected={showThink}
                                color="primary"
                                onValueChange={(isSelected) => {
                                    setShowThink(isSelected);
                                }}
                            />
                        )}

                        {renderParam(
                            t('lipFactor'),
                            <Slider
                                className='max-w-md'
                                defaultValue={lipFactor}
                                minValue={CONSTANTS.SENTIO_LIPFACTOR_MIN}
                                maxValue={CONSTANTS.SENTIO_LIPFACTOR_MAX}
                                step={0.1}
                                label=" "
                                onChangeEnd={(value) => {
                                    const newFactor = typeof value === 'number' ? value : value[0];
                                    setLipFactor(newFactor);
                                    Live2dManager.getInstance().setLipFactor(newFactor);
                                }}
                            />
                        )}

                        {/* 添加分隔线 */}
                        <Divider />

                        {/* 简化的视觉检测设置 - 只保留总开关 */}
                        <VisionBasicSettings />
                    </div>
                </div>
            </CardBody>
        </Card>
    )
}