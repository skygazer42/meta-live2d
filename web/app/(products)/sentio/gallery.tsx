'use client'

import { useState, useMemo, useRef, useEffect, memo } from 'react';
import { useTranslations } from 'next-intl';
import {
    Button,
    Modal,
    ModalContent,
    ModalHeader,
    ModalBody,
    ModalFooter,
    useDisclosure,
    Image,
    Tabs,
    Tab,
    Card,
    CardBody,
    CardFooter,
    Divider,
    Switch,
    Select,
    SelectItem,
    Input,
    Link,
    useDraggable,
    addToast
} from "@heroui/react";
import { useSentioBackgroundStore, useSentioCharacterStore, useSentioCustomLive2DStore, CustomLive2DModel } from '@/lib/store/sentio';
import { 
    BACKGROUND_TYPE, 
    ResourceModel, 
    CHARACTER_TYPE, 
    RESOURCE_TYPE
} from '@/lib/protocol';
import { BUSINESS_COOPERATION_URL } from '@/lib/constants';
import * as CONSTANTS from '@/lib/constants';
import { getSrcPath } from '@/lib/path';
import { useLive2D } from './hooks/live2d';
import clsx from 'clsx';


interface ResourceModelExtend extends ResourceModel {
    sub_type: BACKGROUND_TYPE | CHARACTER_TYPE
}

const CUSTOM_LIVE2D_TYPE_OPTIONS = [
    CHARACTER_TYPE.CUSTOM,
    CHARACTER_TYPE.FREE,
    CHARACTER_TYPE.IP,
] as const;

function getCharacterModelPath(type: CHARACTER_TYPE) {
    if (type == CHARACTER_TYPE.IP) {
        return CONSTANTS.SENTIO_CHARACTER_IP_PATH;
    }
    if (type == CHARACTER_TYPE.CUSTOM) {
        return CONSTANTS.SENTIO_CHARACTER_CUSTOM_PATH;
    }
    return CONSTANTS.SENTIO_CHARACTER_FREE_PATH;
}

function buildCustomLive2DResource(modelName: string, subType: CHARACTER_TYPE): CustomLive2DModel {
    const modelPath = getCharacterModelPath(subType);
    return {
        name: modelName,
        sub_type: subType as CHARACTER_TYPE.IP | CHARACTER_TYPE.CUSTOM | CHARACTER_TYPE.FREE,
        link: getSrcPath(`${modelPath}/${modelName}/${modelName}.png`),
    };
}

function toCharacterResource(model: CustomLive2DModel): ResourceModelExtend {
    return {
        resource_id: `${model.sub_type}_${model.name}`,
        name: model.name,
        sub_type: model.sub_type,
        link: model.link,
        type: RESOURCE_TYPE.CHARACTER,
    };
}

function ImagesList({
    current,
    descs,
    enable,
    showType,
    choiceFunc
}: {
    current: ResourceModel | null,
    descs: ResourceModelExtend[],
    enable: boolean,
    showType: BACKGROUND_TYPE | CHARACTER_TYPE,
    choiceFunc: (index: number | null) => void,
}) {
    const allTypes = [BACKGROUND_TYPE.ALL, CHARACTER_TYPE.ALL];
    return (
        <div className="gap-6 grid grid-cols-2 sm:grid-cols-4 max-h-96">
            {enable && descs.map((item, index) => (
                (item.sub_type == showType || allTypes.includes(showType)) && <Card
                    shadow="md"
                    key={index}
                    isPressable
                    onPress={() => choiceFunc(index)}
                    className={clsx(
                        "text-small justify-between h-fit",
                        {
                            'text-blue-600 border-2 border-indigo-600': !!current && item.resource_id == current.resource_id,
                        }
                    )}
                >
                    <CardBody className="overflow-visible p-0">
                        {
                            item.link.endsWith('.mp4') ?
                            <video 
                                className='w-full object-cover h-[120px]' 
                                autoPlay 
                                muted 
                                loop
                                poster={getSrcPath('image/loading.png')}
                                src={item.link}
                                style={{ pointerEvents: 'none' }}
                            />
                            :
                            <Image
                                shadow="sm"
                                radius="lg"
                                width="100%"
                                alt={item.name}
                                className="w-full object-cover h-[120px]"
                                src={item.link}
                                isZoomed={true}
                                style={{ objectFit: "cover" }}
                            />
                        }
                        
                    </CardBody>
                    <CardFooter className="text-small justify-between">
                        <b>{item.name}</b>
                    </CardFooter>
                </Card>
            ))}
        </div>
    )
}

function BackgroundsTab() {
    const t = useTranslations('Products.sentio.gallery.backgrounds');
    const { background, setBackground } = useSentioBackgroundStore();
    const [enable, setEnable] = useState<boolean>(background != null);
    const [bgType, setBgType] = useState<string>(t('all'));
    // bgType映射关系
    const bgTypeMap = {
        [t('all')]: BACKGROUND_TYPE.ALL,
        [t('static')]: BACKGROUND_TYPE.STATIC,
        [t('dynamic')]: BACKGROUND_TYPE.DYNAMIC,
    };
    const getBackgrounds = (type: BACKGROUND_TYPE): ResourceModelExtend[] => {
        var backgrounds: ResourceModelExtend[] = [];
        // 静态图 / 动态图 处理
        const images = type == BACKGROUND_TYPE.STATIC ? CONSTANTS.SENTIO_BACKGROUND_STATIC_IMAGES : CONSTANTS.SENTIO_BACKGROUND_DYNAMIC_IMAGES;
        const imagePath = type == BACKGROUND_TYPE.STATIC ? CONSTANTS.SENTIO_BACKGROUND_STATIC_PATH : CONSTANTS.SENTIO_BACKGROUND_DYNAMIC_PATH;

        for (const image of images) {
            // 文件名字
            const name = image.split('.')[0];
            backgrounds.push({
                resource_id: `${type}_${image}`,
                type: RESOURCE_TYPE.BACKGROUND,
                sub_type: type,
                name: name,
                link: getSrcPath(`${imagePath}/${image}`),
            });
        }
        return backgrounds;
    }

    const staticBackgrounds = useMemo(() => getBackgrounds(BACKGROUND_TYPE.STATIC), []);
    const dynamicBackgrounds = useMemo(() => getBackgrounds(BACKGROUND_TYPE.DYNAMIC), []);
    const backgrounds = [...staticBackgrounds, ...dynamicBackgrounds];
    // 背景选择触发函数
    const choiceBackground = (index: number | null) => {
        if (index != null) {
            setBackground(backgrounds[index]);
        } else {
            setBackground(null);
        }
    }

    const onEnableChange = (isSelected: boolean) => {
        setEnable(isSelected);
        if (!isSelected) {
            choiceBackground(null);
        }
    }

    return (
        <Card>
            <CardBody>
                <div className='flex flex-col gap-4 max-h-96 overflow-y-auto'>
                    <Switch defaultSelected={background != null} color="primary" onValueChange={onEnableChange}>{t('enable')}</Switch>
                    <Divider />
                    {
                        enable && <div className='flex flex-row items-center gap-2'>
                            <Select
                                className="max-w-md"
                                name="bgTypeSelect"
                                label={t('select')}
                                key={t('select')}
                                defaultSelectedKeys={[bgType as string]}
                                onSelectionChange={(e) => setBgType(e.currentKey as string)}
                            >
                                {
                                    Object.keys(bgTypeMap).map((key) => (
                                        <SelectItem key={key}>{key}</SelectItem>
                                    ))
                                }
                            </Select>
                        </div>
                    }
                    <ImagesList
                        current={background}
                        descs={backgrounds}
                        enable={enable}
                        showType={bgTypeMap[bgType]}
                        choiceFunc={choiceBackground}
                    />                    
                </div>
            </CardBody>
        </Card>
    )
}

function CustomLive2DConfigPanel() {
    const t = useTranslations('Products.sentio.gallery.characters');
    const { customLive2DModels, addCustomLive2DModel, removeCustomLive2DModel } = useSentioCustomLive2DStore();
    const [modelName, setModelName] = useState('');
    const [subType, setSubType] = useState<CHARACTER_TYPE>(CHARACTER_TYPE.CUSTOM);
    const normalizedModelName = modelName.trim();
    const previewPath = normalizedModelName ? buildCustomLive2DResource(normalizedModelName, subType).link : '';

    const addModel = () => {
        if (!normalizedModelName) {
            addToast({
                color: 'warning',
                title: t('modelNameRequired'),
            });
            return;
        }

        addCustomLive2DModel(buildCustomLive2DResource(normalizedModelName, subType));
        setModelName('');
        addToast({
            color: 'success',
            title: t('modelAdded', { modelName: normalizedModelName }),
        });
    };

    return (
        <div className="rounded-lg border border-default-200 p-3 flex flex-col gap-3">
            <div className="flex flex-col sm:flex-row gap-3">
                <Select
                    className="sm:max-w-48"
                    label={t('resourceType')}
                    selectedKeys={[subType]}
                    onSelectionChange={(keys) => {
                        const key = Array.from(keys)[0] as CHARACTER_TYPE | undefined;
                        if (key) setSubType(key);
                    }}
                >
                    {CUSTOM_LIVE2D_TYPE_OPTIONS.map((type) => (
                        <SelectItem key={type}>{type.toLowerCase()}</SelectItem>
                    ))}
                </Select>
                <Input
                    label={t('modelName')}
                    placeholder="MyLive2D"
                    value={modelName}
                    onValueChange={setModelName}
                    description={previewPath || t('modelPathHint')}
                />
                <Button color="primary" className="sm:self-start sm:mt-2" onPress={addModel}>
                    {t('add')}
                </Button>
            </div>
            {customLive2DModels.length > 0 && (
                <div className="flex flex-col gap-2">
                    {customLive2DModels.map((model) => (
                        <div key={`${model.sub_type}_${model.name}`} className="flex items-center justify-between gap-3 rounded-md bg-default-100 px-3 py-2">
                            <div className="min-w-0">
                                <p className="text-sm font-medium truncate">{model.name}</p>
                                <p className="text-xs text-default-500 truncate">{model.link}</p>
                            </div>
                            <Button size="sm" color="danger" variant="light" onPress={() => removeCustomLive2DModel(model.name, model.sub_type)}>
                                {t('remove')}
                            </Button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}

function CharactersTab() {
    const t = useTranslations('Products.sentio.gallery.characters');
    const { character, setCharacter } = useSentioCharacterStore();
    const { customLive2DModels } = useSentioCustomLive2DStore();
    const [characterType, setCharacterType] = useState<string>(t('all'));
    const { setLive2dCharacter } = useLive2D();
    // 映射关系
    const characterTypeMap = {
        [t('all')]: CHARACTER_TYPE.ALL,
        [t('ip')]: CHARACTER_TYPE.IP,
        [t('custom')]: CHARACTER_TYPE.CUSTOM,
        [t('free')]: CHARACTER_TYPE.FREE,
    };
    const getCharacters = (type: CHARACTER_TYPE): ResourceModelExtend[] => {
        var characters: ResourceModelExtend[] = [];
        // 静态图 / 动态图 处理
        var models = [];
        var modelPath = getCharacterModelPath(type);
        if (type == CHARACTER_TYPE.IP) {
            models = CONSTANTS.SENTIO_CHARACTER_IP_MODELS;
        }
        else if (type == CHARACTER_TYPE.CUSTOM) {
            models = CONSTANTS.SENTIO_CHARACTER_CUSTOM_MODELS;
        }
        else {
            models = CONSTANTS.SENTIO_CHARACTER_FREE_MODELS;
        }

        for (const model of models) {
            characters.push({
                resource_id: `${type}_${model}`,
                name: model,
                sub_type: type,
                link: getSrcPath(`${modelPath}/${model}/${model}.png`),
                type: RESOURCE_TYPE.CHARACTER
            });
        }
        return characters;
    }

    const freeCharacters = useMemo(() => getCharacters(CHARACTER_TYPE.FREE), [])
    const ipCharacters = useMemo(() => getCharacters(CHARACTER_TYPE.IP), []);
    const customCharacters = useMemo(() => getCharacters(CHARACTER_TYPE.CUSTOM), []);
    const browserConfiguredCharacters = useMemo(() => customLive2DModels.map(toCharacterResource), [customLive2DModels]);
    const characters = [...freeCharacters, ...ipCharacters, ...customCharacters, ...browserConfiguredCharacters];

    const choiceCharacter = (index: number | null) => {
        if (index != null) {
            const selectedCharacter = characters[index];
            if (!selectedCharacter) return;
            if (character && character.name == selectedCharacter.name && character.resource_id == selectedCharacter.resource_id) return;
            setCharacter(selectedCharacter);
            setLive2dCharacter(selectedCharacter);
        } else {
            setCharacter(null);
            setLive2dCharacter(null);
        }
    }


    return (
        <Card>
            <CardBody>
                <div className='flex flex-col gap-4 max-h-96 overflow-y-auto'>
                    <div className='flex flex-row items-center gap-2'>
                        <Select
                            className="max-w-md"
                            name="characterTypeSelect"
                            label={t('select')}
                            key={t('select')}
                            defaultSelectedKeys={[characterType as string]}
                            onSelectionChange={(e) => setCharacterType(e.currentKey as string)}
                        >
                            {
                                Object.keys(characterTypeMap).map((key) => (
                                    <SelectItem key={key}>{key}</SelectItem>
                                ))
                            }
                        </Select>
                    </div>

                    <Link className='hover:underline text-sm w-fit ml-2' href={BUSINESS_COOPERATION_URL} color='warning' isExternal>👉 {t('customLink')}</Link>
                    <CustomLive2DConfigPanel />
                    <ImagesList
                        current={character}
                        descs={characters}
                        enable={true}
                        showType={characterTypeMap[characterType]}
                        choiceFunc={choiceCharacter}
                    />
                </div>
            </CardBody>
        </Card>
    )
}

function GalleryTabs() {
    const t = useTranslations('Products.sentio.gallery');
    return (
        <Tabs aria-label="Gallery">
            <Tab key='characters' title={t('characters.title')}>
                <CharactersTab />
            </Tab>
            <Tab key='backgrounds' title={t('backgrounds.title')}>
                <BackgroundsTab />
            </Tab>
        </Tabs>
    )
}

export function Gallery({ isOpen: open, onClose }: { isOpen: boolean, onClose: () => void }) {
    const t_common = useTranslations('Common');
    const t = useTranslations('Products.sentio.gallery');
    const { isOpen, onOpen, onOpenChange } = useDisclosure({ isOpen: open, onClose });
    const targetRef = useRef(null);
    const { moveProps } = useDraggable({ targetRef, isDisabled: !isOpen });
    return (
        <Modal
            ref={targetRef}
            isOpen={open}
            onOpenChange={onOpenChange}
            size="5xl"
            placement="center"
            scrollBehavior="outside"
        >
            <ModalContent>
                <ModalHeader {...moveProps} className="flex flex-col gap-1">{t('title')}</ModalHeader>
                <ModalBody>
                    <GalleryTabs />
                </ModalBody>
                <ModalFooter>
                    <Button color="danger" variant="light" onPress={onClose}>
                        {t_common('close')}
                    </Button>
                </ModalFooter>
            </ModalContent>
        </Modal>
    )
}
