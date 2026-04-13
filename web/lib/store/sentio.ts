import { create } from "zustand";
import { persist, createJSONStorage } from 'zustand/middleware'
import { ResourceModel, ChatMessage, CHAT_MODE, APP_TYPE, IFER_TYPE } from '@/lib/protocol';
import * as CONSTANTS from '@/lib/constants';

// ==================== 聊天记录 ==================
interface SentioChatRecordState {
    activeScope: string,
    chatRecord: ChatMessage[],
    chatRecordByScope: Record<string, ChatMessage[]>,
    setScope: (scope: string) => void,
    addChatRecord: (message: ChatMessage) => void,
    getLastRecord: () => ChatMessage | undefined,
    updateLastRecord: (message: ChatMessage) => void,
    deleteLastRecord: () => void,
    clearChatRecord: () => void
}

const DEFAULT_CHAT_SCOPE = 'default';

function getScopedRecords(state: Partial<SentioChatRecordState>, scope?: string): ChatMessage[] {
    const activeScope = scope || state.activeScope || DEFAULT_CHAT_SCOPE;
    return state.chatRecordByScope?.[activeScope] || state.chatRecord || [];
}

export const useChatRecordStore = create<SentioChatRecordState>()(
    persist(
        (set) => ({
            activeScope: DEFAULT_CHAT_SCOPE,
            chatRecord: [],
            chatRecordByScope: {
                [DEFAULT_CHAT_SCOPE]: []
            },
            setScope: (scope: string) => set((state) => {
                const activeScope = scope || DEFAULT_CHAT_SCOPE;
                return {
                    activeScope,
                    chatRecord: getScopedRecords(state, activeScope),
                    chatRecordByScope: state.chatRecordByScope || {
                        [DEFAULT_CHAT_SCOPE]: state.chatRecord || []
                    }
                };
            }),
            addChatRecord: (message: ChatMessage) => set((state) => {
                const activeScope = state.activeScope || DEFAULT_CHAT_SCOPE;
                const nextChatRecord = [...getScopedRecords(state, activeScope), message];
                return {
                    chatRecord: nextChatRecord,
                    chatRecordByScope: {
                        ...(state.chatRecordByScope || {}),
                        [activeScope]: nextChatRecord
                    }
                };
            }),
            getLastRecord: () => { 
                const state = useChatRecordStore.getState();
                const chatRecord: ChatMessage[] = getScopedRecords(state);
                return chatRecord.length > 0 ? chatRecord[chatRecord.length - 1] : undefined; 
            },
            updateLastRecord: (message: ChatMessage) => set((state) => {
                const activeScope = state.activeScope || DEFAULT_CHAT_SCOPE;
                const nextChatRecord = [...getScopedRecords(state, activeScope).slice(0, -1), message];
                return {
                    chatRecord: nextChatRecord,
                    chatRecordByScope: {
                        ...(state.chatRecordByScope || {}),
                        [activeScope]: nextChatRecord
                    }
                };
            }),
            deleteLastRecord: () => set((state) => {
                const activeScope = state.activeScope || DEFAULT_CHAT_SCOPE;
                const nextChatRecord = [...getScopedRecords(state, activeScope).slice(0, -1)];
                return {
                    chatRecord: nextChatRecord,
                    chatRecordByScope: {
                        ...(state.chatRecordByScope || {}),
                        [activeScope]: nextChatRecord
                    }
                };
            }),
            clearChatRecord: () => set((state) => {
                const activeScope = state.activeScope || DEFAULT_CHAT_SCOPE;
                return {
                    chatRecord: [],
                    chatRecordByScope: {
                        ...(state.chatRecordByScope || {}),
                        [activeScope]: []
                    }
                };
            }),
        }),
        {
            name: 'sentio-chat-record-storage',
            version: 2,
            migrate: (persistedState: any, version) => {
                if (!persistedState) return persistedState;
                if (version >= 2 && persistedState.chatRecordByScope) {
                    return persistedState;
                }
                const legacyChatRecord = Array.isArray(persistedState.chatRecord) ? persistedState.chatRecord : [];
                return {
                    ...persistedState,
                    activeScope: DEFAULT_CHAT_SCOPE,
                    chatRecord: legacyChatRecord,
                    chatRecordByScope: {
                        [DEFAULT_CHAT_SCOPE]: legacyChatRecord
                    }
                };
            }
        }
    )
)

// ==================== 基础设置 ==================
interface SentioBasicState {
    sound: boolean,
    lipFactor: number,
    showThink: boolean
    setSound: (sound: boolean) => void
    setShowThink: (showThink: boolean) => void
    setLipFactor: (weight: number) => void
}

export const useSentioBasicStore = create<SentioBasicState>()(
    persist(
        (set) => ({
            sound: true,
            showThink: true,
            lipFactor: CONSTANTS.SENTIO_LIPFACTOR_DEFAULT,
            setSound: (sound: boolean) => set((state) => ({ sound: sound })),
            setShowThink: (showThink: boolean) => set((state) => ({ showThink: showThink })),
            setLipFactor: (weight: number) => set((state) => ({ lipFactor: weight }))
        }),
        {
            name: 'sentio-basic-storage'
        }
    )
)

// ==================== ASR 相关设置 ==================
interface SentioAsrState {
    enable: boolean,
    engine: string,
    infer_type: IFER_TYPE,
    settings: { [key: string]: any },
    setEnable: (enable: boolean) => void,
    setInferType: (infer_type: IFER_TYPE) => void,
    setEngine: (engine: string) => void,
    setSettings: (settings: { [key: string]: any }) => void,
}

export const useSentioAsrStore = create<SentioAsrState>()(
    persist(
        (set) => ({
            enable: true,
            engine: "default",
            infer_type: IFER_TYPE.NORMAL,
            settings: {},
            setEnable: (enable: boolean) => set((state) => ({ enable: enable })),
            setInferType: (infer_type: IFER_TYPE) => set((state) => ({ infer_type: infer_type })),
            setEngine: (by: string) => set((state) => ({ engine: by })),
            setSettings: (by: { [key: string]: any }) => set((state) => ({ settings: by })),
        }),
        {
            name: 'sentio-asr-storage',
        }
    )
)

// ==================== TTS 相关设置 ==================
interface SentioTtsState {
    enable: boolean,
    engine: string,
    infer_type: IFER_TYPE,
    settings: { [key: string]: any },
    setEnable: (enable: boolean) => void,
    setInferType: (infer_type: IFER_TYPE) => void,
    setEngine: (engine: string) => void,
    setSettings: (settings: { [key: string]: any }) => void
}

export const useSentioTtsStore = create<SentioTtsState>()(
    persist(
        (set) => ({
            enable: true,
            engine: "default",
            infer_type: IFER_TYPE.NORMAL,
            settings: {},
            setEnable: (enable: boolean) => set((state) => ({ enable: enable })),
            setInferType: (infer_type: IFER_TYPE) => set((state) => ({ infer_type: infer_type })),
            setEngine: (by: string) => set((state) => ({ engine: by })),
            setSettings: (by: { [key: string]: any }) => set((state) => ({ settings: by }))
        }),
        {
            name: 'sentio-tts-storage',
        }
    )
)

// ==================== Agent 相关设置 ==================
interface SentioAgentState {
    enable: boolean,
    engine: string,
    infer_type: IFER_TYPE,
    settings: { [key: string]: any },
    setEnable: (enable: boolean) => void,
    setInferType: (infer_type: IFER_TYPE) => void,
    setEngine: (engine: string) => void,
    setSettings: (settings: { [key: string]: any }) => void
}

export const useSentioAgentStore = create<SentioAgentState>()(
    persist(
        (set) => ({
            enable: true,
            engine: "default",
            infer_type: IFER_TYPE.NORMAL,
            settings: {},
            setEnable: (enable: boolean) => set((state) => ({ enable: enable })),
            setInferType: (infer_type: IFER_TYPE) => set((state) => ({ infer_type: infer_type })),
            setEngine: (by: string) => set((state) => ({ engine: by })),
            setSettings: (by: { [key: string]: any }) => set((state) => ({ settings: by }))
        }),
        {
            name: 'sentio-agent-storage',
        }
    )
)

// ==================== 背景选择 ==================
interface SentioBackgroundState {
    background: ResourceModel | null,
    setBackground: (background: ResourceModel | null) => void
}
export const useSentioBackgroundStore = create<SentioBackgroundState>()(
    persist(
        (set) => ({
            background: null,
            setBackground: (by: ResourceModel | null) => set((state) => ({ background: by })),
        }),
        {
            name: 'sentio-background-storage',
        }
    )
)

// ==================== 人物选择 ==================
interface SentioCharacterState {
    character: ResourceModel | null,
    setCharacter: (character: ResourceModel | null) => void
}
export const useSentioCharacterStore = create<SentioCharacterState>()(
    persist(
        (set) => ({
            character: null,
            setCharacter: (by: ResourceModel | null) => set((state) => ({ character: by })),
        }),
        {
            name: 'sentio-character-storage',
        }
    )
)

// ==================== 聊天模式 ==================
interface SentioChatModeState {
    chatMode: CHAT_MODE,
    setChatMode: (chatMode: CHAT_MODE) => void
}
export const useSentioChatModeStore = create<SentioChatModeState>()(
    persist(
        (set) => ({
            chatMode: CONSTANTS.SENTIO_CHATMODE_DEFULT,
            setChatMode: (by: CHAT_MODE) => set((state) => ({ chatMode: by })),
        }),
        {
            name: 'sentio-chat-mode-storage',
        }
    )
)

// ==================== 主题 ==================
interface SentioThemeState {
    theme: APP_TYPE,
    setTheme: (theme: APP_TYPE) => void
}
export const useSentioThemeStore = create<SentioThemeState>()(
    persist(
        (set) => ({
            theme: CONSTANTS.SENTIO_THENE_DEFAULT,
            // setTheme: (by: APP_TYPE) => set((state) => ({ theme: by })),
            setTheme: (by: APP_TYPE) => set((state) => ({ theme: by })),
        }),
        {
            name: 'sentio-theme-storage',
        }
    )
)


// ==================== live2d ==================
interface SentioLive2DState {
    ready: boolean,
    setReady: (enable: boolean) => void
}

export const useSentioLive2DStore = create<SentioLive2DState>()(
    (set) => ({
        ready: false,
        setReady: (ready: boolean) => set((state) => ({ ready: ready })),
    })
)

// ==================== 视觉检测 ==================
interface SentioVisionState {
    enabled: boolean,
    showPreview: boolean,
    fps: number,
    engine: string,
    setEnabled: (enabled: boolean) => void,
    setShowPreview: (show: boolean) => void,
    setFps: (fps: number) => void,
    setEngine: (engine: string) => void
}

export const useSentioVisionStore = create<SentioVisionState>()(
    persist(
        (set) => ({
            enabled: false,
            showPreview: true,
            fps: 10,
            engine: 'FaceLipDetector',
            setEnabled: (enabled: boolean) => set((state) => ({ enabled: enabled })),
            setShowPreview: (show: boolean) => set((state) => ({ showPreview: show })),
            setFps: (fps: number) => set((state) => ({ fps: fps })),
            setEngine: (engine: string) => set((state) => ({ engine: engine }))
        }),
        {
            name: 'sentio-vision-storage'
        }
    )
)
