// hooks/vision.ts - 完整修复版（解决黑屏 + 消息解析）

import { useState, useEffect, useRef, useCallback } from 'react';
import { VisionStreamClient, api_vision_get_default, api_vision_get_list } from '@/lib/api/server';
import * as PROTOCOL from '@/lib/protocol';
import { useSentioVisionStore } from '@/lib/store/sentio';

// 辅助函数：安全解析JSON
function safeParse(s: string) {
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}

// 辅助函数：转换为布尔值
function toBool(v: unknown): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (typeof v === 'string') {
    return ['1', 'true', 'yes', 'on'].includes(v.trim().toLowerCase());
  }
  return false;
}

// 辅助函数：转换为数字
function toNum(v: unknown, def = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

export function useVisionDetection() {
  const { engine, setEngine } = useSentioVisionStore();
  const [isConnected, setIsConnected] = useState(false);
  const [hasFace, setHasFace] = useState(false);
  const [isTalking, setIsTalking] = useState(false);
  const [confidence, setConfidence] = useState(0);
  const [isInitializing, setIsInitializing] = useState(false);

  // 核心引用
  const visionClientRef = useRef<VisionStreamClient | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);  // 预览视频引用
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // 连接状态标记
  const connectingRef = useRef(false);
  const mountedRef = useRef(true);
  const isInitializingRef = useRef(false);

  // FPS 节流
  const lastFrameTimeRef = useRef(0);
  const animationIdRef = useRef<number | null>(null);

  useEffect(() => {
    isInitializingRef.current = isInitializing;
  }, [isInitializing]);

  // 新增：回调 ref 用于绑定流到预览视频
  const bindPreviewRef = useCallback((el: HTMLVideoElement | null) => {
    if (!el) return;

    // 保存最新的可见 video 引用
    videoRef.current = el;

    // 设置基本属性，防止 iOS/Safari 不自动播放
    el.muted = true;
    el.playsInline = true;
    el.autoplay = true;

    // 如果流已经拿到了，立刻绑定到可见 video
    if (streamRef.current) {
      try {
        el.srcObject = streamRef.current;
        const playPromise = el.play();
        if (playPromise && typeof playPromise.catch === 'function') {
          playPromise.catch((e) => {
            console.warn('[Vision] Preview video play failed:', e);
          });
        }
        console.log('[Vision] Stream bound to preview video via callback ref');
      } catch (e) {
        console.error('[Vision] Failed to attach stream to preview:', e);
      }
    }
  }, []);

  const startDetection = useCallback(async (fps = 10) => {
    // 防止重复初始化
    if (visionClientRef.current || connectingRef.current || isInitializingRef.current) {
      console.log('[Vision] Already connected or connecting, skipping...');
      return;
    }

    const availableEngines = await api_vision_get_list();
    const availableNames = new Set(availableEngines.map((item) => item.name));
    const defaultEngine = await api_vision_get_default();
    const defaultEngineName = typeof defaultEngine === 'string' ? defaultEngine : defaultEngine?.name || '';
    const requestedEngine =
      (engine && availableNames.has(engine) && engine) ||
      (defaultEngineName && availableNames.has(defaultEngineName) && defaultEngineName) ||
      availableEngines[0]?.name ||
      '';

    if (!requestedEngine) {
      console.warn('[Vision] No available vision engine, skipping detection startup');
      setIsInitializing(false);
      setIsConnected(false);
      connectingRef.current = false;
      return;
    }

    if (engine !== requestedEngine) {
      setEngine(requestedEngine);
    }

    console.log('[Vision] Starting detection with fps:', fps);
    connectingRef.current = true;
    setIsInitializing(true);

    try {
      // 1. 获取摄像头权限
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'user'
        },
        audio: false
      });

      if (!mountedRef.current) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }

      streamRef.current = stream;

      // 2. 立即尝试绑定到预览视频（如果已存在）
      if (videoRef.current) {
        try {
          videoRef.current.srcObject = stream;
          videoRef.current.muted = true;
          videoRef.current.playsInline = true;
          videoRef.current.autoplay = true;
          const playPromise = videoRef.current.play();
          if (playPromise) {
            playPromise.catch(e => {
              console.warn('[Vision] Initial preview play failed:', e);
            });
          }
          console.log('[Vision] Stream bound to existing preview video');
        } catch (e) {
          console.error('[Vision] Failed to bind stream to existing preview:', e);
        }
      }

      // 3. 等待视频流就绪（可以直接用预览视频，或创建临时的）
      const sourceVideo = videoRef.current || await createTempVideo(stream);

      // 4. 创建 canvas
      if (!canvasRef.current) {
        canvasRef.current = document.createElement('canvas');
      }
      canvasRef.current.width = sourceVideo.videoWidth || 640;
      canvasRef.current.height = sourceVideo.videoHeight || 480;

      console.log('[Vision] Canvas initialized:', {
        width: canvasRef.current.width,
        height: canvasRef.current.height
      });

      // 5. 创建 WebSocket 客户端
      const client = new VisionStreamClient({
        engine: requestedEngine,
        fps,
        onOpen: () => {
          if (!mountedRef.current) return;
          setIsConnected(true);
          setIsInitializing(false);
          connectingRef.current = false;
          console.log('[Vision] WebSocket connected');
        },
        onMessage: (msg: PROTOCOL.VisionWSResponse) => {
          if (!mountedRef.current) return;

          if (msg.type === 'result' && msg.data) {
            // 容错解析：兼容多种返回格式
            const raw = typeof msg.data === 'string'
              ? safeParse(msg.data)
              : msg.data;

            // 兼容常见字段结构：result / data / 直接扁平
            const d = raw?.result ?? raw?.data ?? raw ?? {};

            // 智能字段映射和类型转换
            const hasFaceValue = toBool(
              d.has_face ?? d.hasFace ?? d.face ?? d.has_face_detected
            );
            const isTalkingValue = toBool(
              d.is_talking ?? d.talking ?? d.isTalking ?? d.lip_moving ?? d.is_lip_moving
            );
            const confidenceVal = toNum(
              d.confidence ?? d.mar ?? d.MAR ?? d.score ?? d.lip_confidence,
              0
            );

            console.log('[Vision] Detection result (parsed):', {
              has_face: hasFaceValue,
              is_talking: isTalkingValue,
              confidence: confidenceVal,
              raw_data: d  // 调试用：打印原始数据
            });

            setHasFace(hasFaceValue);
            setIsTalking(isTalkingValue);
            setConfidence(confidenceVal);
          } else if (msg.type === 'error') {
            console.error('[Vision] Server error:', msg.message);
          } else if (msg.type === 'skipped') {
            // fps_limit 跳帧，正常情况
            console.log('[Vision] Frame skipped:', msg.reason);
          } else {
            // 处理其他未知格式
            console.log('[Vision] Unknown message type:', msg);
          }
        },
        onClose: () => {
          if (!mountedRef.current) return;
          setIsConnected(false);
          visionClientRef.current = null;
          console.log('[Vision] Disconnected');
        },
        onError: (e: Event) => {
          console.error('[Vision] WebSocket error:', e);
          setIsInitializing(false);
          setIsConnected(false);
          connectingRef.current = false;
          visionClientRef.current = null;
        }
      });

      visionClientRef.current = client;
      client.connect();

      // 6. 开始帧捕获循环（带FPS节流）
      const frameInterval = 1000 / fps;

      const captureAndSendFrame = (timestamp: number) => {
        if (!mountedRef.current) return;

        // FPS 节流
        if (timestamp - lastFrameTimeRef.current < frameInterval) {
          animationIdRef.current = requestAnimationFrame(captureAndSendFrame);
          return;
        }

        // 使用预览视频或临时视频作为源
        const video = videoRef.current || sourceVideo;
        const canvas = canvasRef.current;
        const client = visionClientRef.current;

        if (!video || !canvas || !client?.isConnected()) {
          animationIdRef.current = requestAnimationFrame(captureAndSendFrame);
          return;
        }

        // 检查视频是否准备好
        if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
          console.warn('[Vision] Video not ready, skipping frame');
          animationIdRef.current = requestAnimationFrame(captureAndSendFrame);
          return;
        }

        // 动态调整canvas尺寸
        if (video.videoWidth > 0 && video.videoHeight > 0) {
          if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            console.log('[Vision] Canvas resized to:', canvas.width, 'x', canvas.height);
          }
        }

        // 绘制当前帧
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          console.error('[Vision] Failed to get canvas context');
          animationIdRef.current = requestAnimationFrame(captureAndSendFrame);
          return;
        }

        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        // 转换为JPEG并发送
        canvas.toBlob((blob) => {
          if (!blob) {
            console.error('[Vision] Failed to create blob');
            return;
          }

          // 检查blob大小
          if (blob.size < 5000) {
            console.warn('[Vision] Blob too small:', blob.size, 'bytes - might be blank');
          }

          const reader = new FileReader();
          reader.onloadend = () => {
            const base64 = reader.result as string;
            const base64Data = base64.split(',')[1];

            console.log('[Vision] Sending frame:', {
              size: Math.round(base64Data.length / 1024) + 'KB',
              timestamp: Date.now()
            });

            client.sendFrame(base64Data, Date.now());
          };
          reader.readAsDataURL(blob);
        }, 'image/jpeg', 0.8);

        lastFrameTimeRef.current = timestamp;
        animationIdRef.current = requestAnimationFrame(captureAndSendFrame);
      };

      // 启动捕获循环
      animationIdRef.current = requestAnimationFrame(captureAndSendFrame);

    } catch (error) {
      console.error('[Vision] Failed to start detection:', error);

      // 清理资源
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }

      setIsInitializing(false);
      connectingRef.current = false;
    }
  }, [engine, setEngine]);

  // 辅助函数：创建临时视频元素（仅在没有预览视频时使用）
  const createTempVideo = async (stream: MediaStream): Promise<HTMLVideoElement> => {
    const video = document.createElement('video');
    video.style.display = 'none';
    video.autoplay = true;
    video.playsInline = true;
    video.muted = true;
    video.srcObject = stream;
    document.body.appendChild(video);

    // 等待视频就绪
    await new Promise<void>((resolve) => {
      const checkReady = () => {
        if (video.videoWidth > 0 && video.videoHeight > 0 &&
            video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
          console.log('[Vision] Temp video ready:', {
            width: video.videoWidth,
            height: video.videoHeight
          });
          resolve();
        } else {
          setTimeout(checkReady, 100);
        }
      };

      video.play().then(() => {
        checkReady();
      }).catch(e => {
        console.error('[Vision] Temp video play failed:', e);
        checkReady();
      });
    });

    return video;
  };

  // 当流准备好时，同步到预览视频
  useEffect(() => {
    if (streamRef.current && videoRef.current && isConnected) {
      try {
        if (videoRef.current.srcObject !== streamRef.current) {
          videoRef.current.srcObject = streamRef.current;
          videoRef.current.muted = true;
          videoRef.current.playsInline = true;
          videoRef.current.autoplay = true;
          const playPromise = videoRef.current.play();
          if (playPromise) {
            playPromise.catch(e => {
              console.warn('[Vision] Effect preview play failed:', e);
            });
          }
          console.log('[Vision] Stream synced to preview video in effect');
        }
      } catch (e) {
        console.error('[Vision] Failed to sync stream in effect:', e);
      }
    }
  }, [isConnected]);

  const stopDetection = useCallback(() => {
    console.log('[Vision] Stopping detection...');

    // 停止动画帧循环
    if (animationIdRef.current) {
      cancelAnimationFrame(animationIdRef.current);
      animationIdRef.current = null;
    }

    // 关闭 WebSocket 连接
    if (visionClientRef.current) {
      try {
        visionClientRef.current.close();
      } catch (e) {
        console.error('[Vision] Error closing client:', e);
      }
      visionClientRef.current = null;
    }

    // 停止媒体流
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        track.stop();
        console.log('[Vision] Stopped track:', track.kind);
      });
      streamRef.current = null;
    }

    // 清理预览video的srcObject
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    // 清理任何临时创建的video元素
    const tempVideos = document.querySelectorAll('video[style*="display: none"]');
    tempVideos.forEach(v => v.remove());

    // 清理 canvas
    canvasRef.current = null;

    // 重置状态
    setIsConnected(false);
    setHasFace(false);
    setIsTalking(false);
    setConfidence(0);
    setIsInitializing(false);
    connectingRef.current = false;
    lastFrameTimeRef.current = 0;
  }, []);

  // 组件卸载时清理
  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      console.log('[Vision] Component unmounting, cleaning up...');
      stopDetection();
    };
  }, [stopDetection]);

  return {
    videoRef,           // 保留原来的ref
    bindPreviewRef,     // 新增：回调ref用于绑定流
    isConnected,
    isInitializing,
    hasFace,
    isTalking,
    confidence,
    startDetection,
    stopDetection
  };
}
