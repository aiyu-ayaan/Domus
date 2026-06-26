import { io } from "socket.io-client";

const FALLBACK_PORT = process.env.API_PORT || "8000";
export const socket = io(
  process.env.NEXT_PUBLIC_API_URL ?? `http://localhost:${FALLBACK_PORT}`,
  {
    autoConnect: false,
    transports: ["websocket"],
  },
);
