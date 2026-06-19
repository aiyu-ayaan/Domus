// Realtime WebSocket Provider for live smart-home updates
'use client';

import React, { createContext, useContext, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { useAuthStore } from '@/stores/auth-store';
import { useDeviceStore } from '@/stores/device-store';
import { useNotificationStore } from '@/stores/notification-store';
import { useHomeStore } from '@/stores/home-store';
import { useIntegrationStore } from '@/stores/integration-store';
import type { DeviceStateOut, NotificationOut } from '@/types/api';

interface RealtimeContextType {
    isConnected: boolean;
}

const RealtimeContext = createContext<RealtimeContextType>({ isConnected: false });

export const useRealtime = () => useContext(RealtimeContext);

export function RealtimeProvider({ children }: { children: React.ReactNode }) {
    const { accessToken, isAuthenticated } = useAuthStore();
    const { activeHomeId } = useHomeStore();
    const socketRef = useRef<WebSocket | null>(null);
    const [isConnected, setIsConnected] = React.useState(false);

    // Keep track of latest active home ID for mock interval usage
    const activeHomeIdRef = useRef<string | null>(activeHomeId);
    useEffect(() => {
        activeHomeIdRef.current = activeHomeId;
    }, [activeHomeId]);

    useEffect(() => {
        if (!isAuthenticated || !accessToken) {
            setIsConnected(false);
            if (socketRef.current) {
                socketRef.current.close();
                socketRef.current = null;
            }
            return;
        }

        // Detect if we should use Mock WebSocket
        const useMock = process.env.NEXT_PUBLIC_USE_MOCK_API !== 'false';

        if (useMock) {
            setIsConnected(true);
            
            // 1. Listen for local manual control mock broadcasts
            const handleLocalBroadcast = (e: Event) => {
                const event = (e as CustomEvent).detail;
                handleSocketMessage(event);
            };

            window.addEventListener('domus_mock_ws_broadcast', handleLocalBroadcast);

            // 2. Set up interval to simulate background smart home events (every 15s)
            const interval = setInterval(() => {
                const homeId = activeHomeIdRef.current;
                if (!homeId) return;

                // Pick a random event type
                const rand = Math.random();
                if (rand < 0.4) {
                    // Simulate device telemetry change (thermostat fluctuation or plug power shift)
                    const devices = useDeviceStore.getState().devices.filter((d) => d.online && d.home_id === homeId);
                    if (devices.length === 0) return;

                    const randomDevice = devices[Math.floor(Math.random() * devices.length)];
                    const devState = useDeviceStore.getState().deviceStates[randomDevice.id];

                    if (randomDevice.device_type === 'plug') {
                        const newPower = +(10 + Math.random() * 80).toFixed(1);
                        const updatedState: DeviceStateOut = {
                            id: 'state-' + Math.random().toString(36).substr(2, 9),
                            device_id: randomDevice.id,
                            state: 'on',
                            attributes: { ...(devState?.attributes || {}), current_consumption: newPower },
                            created_at: new Date().toISOString(),
                        };
                        handleSocketMessage({
                            type: 'device.state_changed',
                            home_id: homeId,
                            data: {
                                device_id: randomDevice.id,
                                state: 'on',
                                attributes: updatedState.attributes,
                            },
                        });
                    } else if (randomDevice.device_type === 'thermostat') {
                        const currentTemp = +(20 + Math.random() * 3).toFixed(1);
                        const updatedState: DeviceStateOut = {
                            id: 'state-' + Math.random().toString(36).substr(2, 9),
                            device_id: randomDevice.id,
                            state: String(currentTemp),
                            attributes: { ...(devState?.attributes || {}), target_temperature: 22.0 },
                            created_at: new Date().toISOString(),
                        };
                        handleSocketMessage({
                            type: 'device.state_changed',
                            home_id: homeId,
                            data: {
                                device_id: randomDevice.id,
                                state: String(currentTemp),
                                attributes: updatedState.attributes,
                            },
                        });
                    }
                } else if (rand < 0.7) {
                    // Simulate device connection status update
                    const devices = useDeviceStore.getState().devices.filter((d) => d.home_id === homeId);
                    if (devices.length === 0) return;

                    const randomDevice = devices[Math.floor(Math.random() * devices.length)];
                    const nextOnlineState = !randomDevice.online;
                    
                    handleSocketMessage({
                        type: 'device.online_changed',
                        home_id: homeId,
                        data: {
                            device_id: randomDevice.id,
                            online: nextOnlineState,
                        },
                    });
                } else {
                    // Simulate system notifications (e.g. security alert, automation failure)
                    const types = ['automation_failed', 'security_alert', 'info'] as const;
                    const selectedType = types[Math.floor(Math.random() * types.length)];
                    
                    let title = 'System Update';
                    let body = 'All systems functioning normally.';

                    if (selectedType === 'automation_failed') {
                        title = 'Automation Failed';
                        body = 'Rule "Morning Routine Setup" could not turn on Master Bedroom thermostat.';
                    } else if (selectedType === 'security_alert') {
                        title = 'Security Gate Motion';
                        body = 'Yard Camera detected activity outside normal schedule.';
                    }

                    const newNotification: NotificationOut = {
                        id: 'notif-' + Math.random().toString(36).substr(2, 9),
                        home_id: homeId,
                        type: selectedType,
                        title,
                        body,
                        read: false,
                        meta: {},
                        created_at: new Date().toISOString(),
                    };

                    // Add to store
                    useNotificationStore.getState().addNotificationInStore(newNotification);

                    // Push a toast alert
                    toast.info(title, {
                        description: body,
                        action: {
                            label: 'View',
                            onClick: () => {
                                window.location.href = '/notifications';
                            },
                        },
                    });
                }
            }, 18000);

            return () => {
                window.removeEventListener('domus_mock_ws_broadcast', handleLocalBroadcast);
                clearInterval(interval);
            };
        } else {
            // Real WebSocket Client implementation
            let wsHost = process.env.NEXT_PUBLIC_WS_URL;
            if (!wsHost) {
                const apiURL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
                wsHost = apiURL.replace(/^http/, 'ws');
            }
            const wsUrl = `${wsHost}/ws?token=${accessToken}`;
            
            const connect = () => {
                const ws = new WebSocket(wsUrl);
                socketRef.current = ws;

                ws.onopen = () => {
                    setIsConnected(true);
                };

                ws.onmessage = (event) => {
                    try {
                        const parsed = JSON.parse(event.data);
                        handleSocketMessage(parsed);
                    } catch {}
                };

                ws.onclose = (e) => {
                    setIsConnected(false);
                    if (e.code === 1008) {
                        // Refresh token will be handled by apiClient, skip auto reconnect
                        return;
                    }
                    // Auto-reconnect loop
                    setTimeout(() => {
                        if (isAuthenticated) connect();
                    }, 2000);
                };

                ws.onerror = () => {
                    ws.close();
                };
            };

            connect();

            return () => {
                if (socketRef.current) {
                    socketRef.current.close();
                }
            };
        }
    }, [accessToken, isAuthenticated]);

    // Handle WebSocket message actions
    const handleSocketMessage = (msg: any) => {
        const homeId = activeHomeIdRef.current;
        if (msg.home_id && msg.home_id !== homeId) return; // ignore events from other homes

        switch (msg.type) {
            case 'device.state_changed': {
                const { device_id, state, attributes } = msg.data;
                const newState: DeviceStateOut = {
                    id: 'state-' + Date.now(),
                    device_id,
                    state,
                    attributes,
                    created_at: new Date().toISOString(),
                };
                useDeviceStore.getState().updateDeviceStateInStore(device_id, newState);
                break;
            }
            case 'device.online_changed': {
                const { device_id, online } = msg.data;
                useDeviceStore.getState().updateDeviceInStore(device_id, { online });
                
                // Show offline status notifications
                if (!online) {
                    const devName = useDeviceStore.getState().devices.find((d) => d.id === device_id)?.name || 'Device';
                    toast.error(`${devName} Went Offline`, {
                        description: 'Check connectivity status.',
                    });
                }
                break;
            }
            case 'notification.created': {
                const { id, title, notification_type } = msg.data;
                // Refetch notifications list or pull detail
                if (homeId) {
                    useNotificationStore.getState().fetchNotifications(homeId).catch(() => {});
                }
                toast.warning(title, {
                    description: `New alert raised in your smart home.`,
                });
                break;
            }
            case 'integration.new_device_found': {
                const { name } = msg.data;
                if (homeId) {
                    useDeviceStore.getState().fetchDevices(homeId).catch(() => {});
                    useIntegrationStore.getState().fetchIntegrations(homeId).catch(() => {});
                }
                toast.success('New Device Found!', {
                    description: `Discovered "${name}". Assign it to a room.`,
                    action: {
                        label: 'Assign',
                        onClick: () => {
                            window.location.href = '/devices';
                        },
                    },
                });
                break;
            }
            default:
                break;
        }
    };

    return (
        <RealtimeContext.Provider value={{ isConnected }}>
            {children}
        </RealtimeContext.Provider>
    );
}
