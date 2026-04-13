'use client'

import { useEffect, useRef, useState } from "react";
import { Live2d } from './components/live2d';
import ChatBot from './components/chatbot';
import { Header } from './components/header';
import { useAppConfig } from "./hooks/appConfig";
import { Spinner } from "@heroui/react";
import { api_common_get_app_config } from "@/lib/api/server";
import { useChatRecordStore } from "@/lib/store/sentio";


export default function App({ appId }: { appId?: string }) {
    const { setAppConfig } = useAppConfig();
    const [ isLoading, setIsLoading ] = useState(true);
    const [ loadError, setLoadError ] = useState<string | null>(null);
    const { setScope } = useChatRecordStore();
    const scope = appId || "default";
    const setAppConfigRef = useRef(setAppConfig);
    const setScopeRef = useRef(setScope);

    useEffect(() => {
        setAppConfigRef.current = setAppConfig;
    }, [setAppConfig]);

    useEffect(() => {
        setScopeRef.current = setScope;
    }, [setScope]);
    
    // 初始化应用
    useEffect(() => {
        let disposed = false;

        const initializeApp = async () => {
            setIsLoading(true);
            setLoadError(null);
            setScopeRef.current(scope);
            let config = null;
            if (appId) {
                config = await api_common_get_app_config(appId);
            }
            if (disposed) return;
            if (appId && !config) {
                setLoadError(`应用 ${appId} 不存在或加载失败`);
                setIsLoading(false);
                return;
            }
            setAppConfigRef.current(config);
            setIsLoading(false);
        };

        initializeApp();

        return () => {
            disposed = true;
        };
    }, [appId, scope])

    if (isLoading) {
        return (
            <div className='w-full h-full'>
                <Spinner className="w-screen h-screen z-10" color="secondary" size="lg" variant="wave" />
                <Live2d />
            </div>
        );
    }

    if (loadError) {
        return (
            <div className='flex min-h-screen w-full items-center justify-center p-6'>
                <div className='w-full max-w-md rounded-2xl bg-black/70 p-6 text-white shadow-2xl backdrop-blur'>
                    <p className='text-lg font-semibold'>应用加载失败</p>
                    <p className='mt-2 text-sm text-white/80'>{loadError}</p>
                </div>
            </div>
        );
    }

    return (
        <div className='w-full h-full'>
            <div className='flex flex-col w-full h-full'>
                <Header />
                <ChatBot />
            </div>
            <Live2d />
        </div>
    );
}
