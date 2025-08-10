const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);

// Configure CORS for Socket.IO
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    credentials: true
  }
});

app.use(cors());
app.use(express.json());

// Simple health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Store active users and rooms
const activeUsers = new Map(); // socketId -> userInfo
const waitingUsers = new Set(); // users waiting for match
const activeRooms = new Map(); // roomId -> { user1, user2 }

console.log('🚀 OmeTV Signaling Server Starting...');

io.on('connection', (socket) => {
  console.log(`✅ User connected: ${socket.id}`);

  // Register user
  socket.on('register-user', (userSession) => {
    console.log(`📝 User registered:`, userSession);
    
    activeUsers.set(socket.id, {
      ...userSession,
      socketId: socket.id,
      connectedAt: new Date()
    });

    socket.emit('registration-success', { 
      socketId: socket.id,
      message: 'User registered successfully' 
    });
  });

  // Find match for user
  socket.on('find-match', (data) => {
    console.log(`🔍 User ${socket.id} looking for match...`);
    console.log(`📊 Current state - Active users: ${activeUsers.size}, Waiting: ${waitingUsers.size}, Rooms: ${activeRooms.size}`);
    
    const user = activeUsers.get(socket.id);
    if (!user) {
      socket.emit('room-error', { message: 'User not registered' });
      return;
    }

    // Check if user is already in a room
    for (const [roomId, room] of activeRooms.entries()) {
      if (room.user1 === socket.id || room.user2 === socket.id) {
        console.log(`⚠️ User ${socket.id} already in room ${roomId}, ignoring find-match`);
        return;
      }
    }

    // Check if user is already waiting
    if (waitingUsers.has(socket.id)) {
      console.log(`⚠️ User ${socket.id} already waiting, ignoring find-match`);
      return;
    }

    // Check if there's someone waiting
    const waitingUser = Array.from(waitingUsers)[0];
    console.log(`👀 Waiting users:`, Array.from(waitingUsers));
    
    if (waitingUser && waitingUser !== socket.id) {
      // Match found! Create room
      const roomId = uuidv4();
      const user1 = activeUsers.get(waitingUser);
      const user2 = activeUsers.get(socket.id);

      // Remove from waiting list
      waitingUsers.delete(waitingUser);
      
      // Create room
      activeRooms.set(roomId, {
        user1: user1.socketId,
        user2: user2.socketId,
        createdAt: new Date()
      });

      // Join both users to the room
      socket.join(roomId);
      io.sockets.sockets.get(waitingUser)?.join(roomId);

      // Notify both users
      socket.emit('match-found', {
        roomId,
        peerId: waitingUser,
        partner: {
          userId: user1.userId,
          preferences: user1.preferences
        }
      });

      io.to(waitingUser).emit('match-found', {
        roomId,
        peerId: socket.id,
        partner: {
          userId: user2.userId,
          preferences: user2.preferences
        }
      });

      console.log(`🎉 Match created! Room: ${roomId}, Users: ${waitingUser} <-> ${socket.id}`);
    } else {
      // Add to waiting list
      waitingUsers.add(socket.id);
      console.log(`⏳ User ${socket.id} added to waiting list. Total waiting: ${waitingUsers.size}`);
      
      socket.emit('search-started', { 
        message: 'Searching for match...',
        isSearching: true 
      });
      
      // Simulate timeout after 30 seconds if no match found
      setTimeout(() => {
        if (waitingUsers.has(socket.id)) {
          socket.emit('no-match', { message: 'No match found, continuing search...' });
        }
      }, 30000);
    }
  });

  // Handle WebRTC signaling messages
  socket.on('signaling-message', (message) => {
    console.log(`📡 Signaling message from ${socket.id}:`, message.type);
    
    // Find the room this user is in
    let targetRoom = null;
    let targetUser = null;

    for (const [roomId, room] of activeRooms.entries()) {
      if (room.user1 === socket.id) {
        targetRoom = roomId;
        targetUser = room.user2;
        break;
      } else if (room.user2 === socket.id) {
        targetRoom = roomId;
        targetUser = room.user1;
        break;
      }
    }

    if (targetRoom && targetUser) {
      // Forward message to the other user in the room with proper structure
      const forwardedMessage = {
        ...message.data,
        from: socket.id
      };
      
      console.log(`📤 Forwarding ${message.type} from ${socket.id} to ${targetUser}`);
      io.to(targetUser).emit(message.type, forwardedMessage);
    } else {
      console.log(`❌ No target found for signaling message from ${socket.id}`);
    }
  });

  // Leave current room
  socket.on('leave-room', (data) => {
    console.log(`🚪 User ${socket.id} leaving room:`, data.roomId);
    
    const room = activeRooms.get(data.roomId);
    if (room) {
      // Notify the other user
      const otherUser = room.user1 === socket.id ? room.user2 : room.user1;
      io.to(otherUser).emit('user-left', { from: socket.id });
      
      // Remove room
      activeRooms.delete(data.roomId);
      
      // Leave socket room
      socket.leave(data.roomId);
      io.sockets.sockets.get(otherUser)?.leave(data.roomId);
      
      console.log(`🗑️ Room ${data.roomId} destroyed`);
    }
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    console.log(`❌ User disconnected: ${socket.id}`);
    
    // Remove from waiting list
    waitingUsers.delete(socket.id);
    
    // Find and clean up any active rooms
    for (const [roomId, room] of activeRooms.entries()) {
      if (room.user1 === socket.id || room.user2 === socket.id) {
        const otherUser = room.user1 === socket.id ? room.user2 : room.user1;
        
        // Notify the other user
        io.to(otherUser).emit('user-left', { from: socket.id });
        
        // Clean up room
        activeRooms.delete(roomId);
        io.sockets.sockets.get(otherUser)?.leave(roomId);
        
        console.log(`🧹 Cleaned up room ${roomId} due to user disconnect`);
        break;
      }
    }
    
    // Remove user from active users
    activeUsers.delete(socket.id);
    
    console.log(`📊 Stats - Active users: ${activeUsers.size}, Waiting: ${waitingUsers.size}, Rooms: ${activeRooms.size}`);
  });

  // Send server stats (useful for debugging)
  socket.on('get-stats', () => {
    socket.emit('server-stats', {
      activeUsers: activeUsers.size,
      waitingUsers: waitingUsers.size,
      activeRooms: activeRooms.size,
      timestamp: new Date().toISOString()
    });
  });
});

// Server status endpoint
app.get('/status', (req, res) => {
  res.json({
    activeUsers: activeUsers.size,
    waitingUsers: waitingUsers.size,
    activeRooms: activeRooms.size,
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log(`🎯 Signaling server running on port ${PORT}`);
  console.log(`📊 Status endpoint: http://localhost:${PORT}/status`);
  console.log(`💓 Health check: http://localhost:${PORT}/health`);
  console.log('🎮 Ready for WebRTC connections!');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 Received SIGTERM, shutting down gracefully');
  server.close(() => {
    console.log('✅ Server closed successfully');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('🛑 Received SIGINT, shutting down gracefully');
  server.close(() => {
    console.log('✅ Server closed successfully');
    process.exit(0);
  });
});
