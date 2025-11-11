import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { useTradingStore } from '@/stores/useTradingStore';
import type { DashboardUpdate } from '@/types/trading';

export function useSocket(): Socket | null {
  const socketRef = useRef<Socket | null>(null);
  const { setConnected, updateDashboard } = useTradingStore();

  useEffect(() => {
    // Initialize socket connection
    const socket = io({
      path: '/socket.io',
      transports: ['websocket', 'polling'],
    });

    socketRef.current = socket;

    // Connection handlers
    socket.on('connect', () => {
      console.log('Socket connected');
      setConnected(true);
      socket.emit('refresh');
    });

    socket.on('disconnect', () => {
      console.log('Socket disconnected');
      setConnected(false);
    });

    socket.on('connect_error', (error) => {
      console.error('Socket connection error:', error);
      setConnected(false);
    });

    // Data handlers
    socket.on('update', (data: DashboardUpdate) => {
      updateDashboard(data);
    });

    // Request initial data
    socket.emit('refresh');

    // Set up periodic refresh
    const intervalId = setInterval(() => {
      if (socket.connected) {
        socket.emit('refresh');
      }
    }, 10000);

    // Cleanup
    return () => {
      clearInterval(intervalId);
      socket.close();
    };
  }, [setConnected, updateDashboard]);

  return socketRef.current;
}
