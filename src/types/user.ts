export interface User {
  id: number;
  name: string;
  avatar: string;
  age: number;
  location: string;
  interests: string[];
  status: 'online' | 'away' | 'offline';
}

export interface CallState {
  duration: number;
  isMuted: boolean;
  isVideoOn: boolean;
  isActive: boolean;
  status: 'online' | 'away' | 'offline';
}

export interface SwipeState {
  currentUserIndex: number;
  nextUserIndex: number;
  isSwipeMode: boolean;
}
