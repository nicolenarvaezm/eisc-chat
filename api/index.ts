import { Server, type Socket } from "socket.io";
import "dotenv/config";

const origins = (process.env.ORIGIN ?? "")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

const io = new Server({
  cors: {
    origin: origins
  }
});

const port = Number(process.env.PORT);
const isDevelopment = process.env.NODE_ENV === "development"; // Verificar el entorno

io.listen(port);
if (isDevelopment) {
  console.log(`Server is running on port ${port}`);
}

type OnlineUser = { socketId: string; userId: string; room: string };
type ChatMessagePayload = {
  userId: string;
  message: string;
  room: string;
  timestamp?: string;
};

let onlineUsers: OnlineUser[] = [];

io.on("connection", (socket: Socket) => {
  if (isDevelopment) {
    console.log(`[CONNECTION] Socket connected: ${socket.id}`);
  }

  // Añadir un usuario temporalmente con un userId vacío y sin sala
  onlineUsers.push({ socketId: socket.id, userId: "", room: "" });
  io.emit("usersOnline", onlineUsers);
  if (isDevelopment) {
    console.log(`[USERS ONLINE] Total users: ${onlineUsers.length}`);
  }

  // Unirse a una sala específica
  socket.on("joinRoom", ({ userId, room }: { userId: string; room: string }) => {
    if (!userId || !room) {
      if (isDevelopment) {
        console.log(`[JOIN ROOM] Invalid userId or room received from socket: ${socket.id}`);
      }
      return;
    }

    // Verificar si el userId ya está en uso en la misma sala
    const userExistsInRoom = onlineUsers.some(
      user => user.userId === userId && user.room === room
    );

    if (userExistsInRoom) {
      if (isDevelopment) {
        console.log(`[JOIN ROOM] userId "${userId}" is already in use in room "${room}".`);
      }
      socket.emit("error", { message: "User ID already in use in this room." });
      return;
    }

    // Actualizar el userId y la sala del socket actual
    const existingUserIndex = onlineUsers.findIndex(
      user => user.socketId === socket.id
    );

    if (existingUserIndex !== -1) {
      onlineUsers[existingUserIndex] = { socketId: socket.id, userId, room };
      socket.join(room); // Unir el socket a la sala
      if (isDevelopment) {
        console.log(`[JOIN ROOM] User "${userId}" joined room "${room}".`);
      }
    }

    // Emitir la lista de usuarios en la sala
    const usersInRoom = onlineUsers.filter(user => user.room === room);
    io.to(room).emit("usersInRoom", usersInRoom);
    if (isDevelopment) {
      console.log(`[USERS IN ROOM] Room "${room}": ${JSON.stringify(usersInRoom)}`);
    }
  });

  // Manejar mensajes en una sala específica
  socket.on("chat:message", (payload: ChatMessagePayload) => {
    const trimmedMessage = payload?.message?.trim();

    if (!trimmedMessage) {
      if (isDevelopment) {
        console.log(`[CHAT MESSAGE] Empty message received from socket: ${socket.id}`);
      }
      return;
    }

    const sender = onlineUsers.find(user => user.socketId === socket.id);

    if (!sender || sender.room !== payload.room) {
      if (isDevelopment) {
        console.log(`[CHAT MESSAGE] User not in the correct room or not found.`);
      }
      return;
    }

    const outgoingMessage = {
      userId: payload.userId || sender.userId || socket.id,
      message: trimmedMessage,
      room: payload.room,
      timestamp: payload.timestamp ?? new Date().toISOString()
    };

    io.to(payload.room).emit("chat:message", outgoingMessage);
    if (isDevelopment) {
      console.log(`[CHAT MESSAGE] Relayed message in room "${payload.room}": ${JSON.stringify(outgoingMessage)}`);
    }
  });

  // Manejar desconexión
  socket.on("disconnect", () => {
    const disconnectedUser = onlineUsers.find(user => user.socketId === socket.id);
    if (disconnectedUser) {
      const { room } = disconnectedUser;
      onlineUsers = onlineUsers.filter(user => user.socketId !== socket.id);
      io.to(room).emit("usersInRoom", onlineUsers.filter(user => user.room === room));
      if (isDevelopment) {
        console.log(`[DISCONNECT] User "${disconnectedUser.userId}" disconnected from room "${room}".`);
      }
    } else {
      if (isDevelopment) {
        console.log(`[DISCONNECT] Socket disconnected: ${socket.id}`);
      }
    }
  });
});