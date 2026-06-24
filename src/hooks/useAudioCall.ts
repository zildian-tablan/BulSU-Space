import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { doc, getDoc, updateDoc, arrayUnion, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase/config';
import { User } from '../contexts/AuthContext';
import { canStartDirectChat, isSuperAdminUser } from '../utils/messagingPermissions';
import {
  checkAudioCallSupport,
  isIOSDevice,
  mapGetUserMediaErrorToMessage,
} from '../utils/deviceCompatibility';
import {
  initiateAudioCall,
  acceptAudioCall,
  rejectAudioCall,
  endAudioCall,
  expireAudioCall,
  listenIncomingRingingCall,
  listenCurrentUserCall,
  type AudioCallDoc,
} from '../services/audioCallService';
import {
  getUserStatusRealtime,
  getUserProfile
} from '../services/userService';
import { ChatWithDetails } from '../services/messageService';
import { normalizeChatId } from '../pages/messaging';

type BlockingStatus = {
  isBlocked: boolean;
  isBlockedBy: boolean;
  isLoading: boolean;
};

interface UseAudioCallParams {
  currentUser: User | null;
  selectedChat: ChatWithDetails | null;
  selectedDirectOtherUserId: string | null;
  selectedDirectOtherUser: User | null;
  blockingStatus: BlockingStatus;
  messageableUsers: User[];
  showToast: (type: 'success' | 'error', message: string) => void;
}

export const useAudioCall = ({
  currentUser,
  selectedChat,
  selectedDirectOtherUserId,
  selectedDirectOtherUser,
  blockingStatus,
  messageableUsers,
  showToast,
}: UseAudioCallParams) => {
  const [incomingAudioCall, setIncomingAudioCall] = useState<AudioCallDoc | null>(null);
  const [activeAudioCall, setActiveAudioCall] = useState<AudioCallDoc | null>(null);
  const [audioCallDuration, setAudioCallDuration] = useState(0);
  const [callActionLoading, setCallActionLoading] = useState<'initiate' | 'accept' | 'reject' | 'end' | null>(null);
  const [isSelfMuted, setIsSelfMuted] = useState(false);
  const [isRemoteMuted, setIsRemoteMuted] = useState(false);
  const [needsAudioPlaybackUnlock, setNeedsAudioPlaybackUnlock] = useState(false);
  const [incomingCallCaller, setIncomingCallCaller] = useState<User | null>(null);
  const [activeCallPeerUser, setActiveCallPeerUser] = useState<User | null>(null);
  const expiringCallIdRef = useRef<string | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localAudioStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const signalingUnsubscribeRef = useRef<(() => void) | null>(null);
  const webrtcRoleRef = useRef<'caller' | 'callee' | null>(null);
  const remoteCandidatesCacheRef = useRef<Set<string>>(new Set());
  const activeCallTerminalToastKeyRef = useRef<string | null>(null);

  const rtcConfig = useMemo<RTCConfiguration>(() => ({
    iceServers: [
      { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
      { urls: 'stun:stun.stunprotocol.org:3478' },
      {
        urls: [
          'turn:openrelay.metered.ca:80',
          'turn:openrelay.metered.ca:443',
          'turn:openrelay.metered.ca:443?transport=tcp',
        ],
        username: 'openrelayproject',
        credential: 'openrelayproject',
      },
      {
        urls: 'turn:numb.viagenie.ca',
        username: 'webrtc@live.com',
        credential: 'muazkh',
      },
      {
        urls: 'turn:turn.anyfirewall.com:443?transport=tcp',
        username: 'webrtc',
        credential: 'webrtc',
      },
    ],
    iceCandidatePoolSize: 10,
  }), []);

  const incomingCallCallerUid = useMemo(() => {
    const normalizedCurrentUid = normalizeChatId(currentUser?.id);
    if (!normalizedCurrentUid || !incomingAudioCall) return null;
    if (incomingAudioCall.status !== 'ringing' || normalizeChatId(incomingAudioCall.calleeUid) !== normalizedCurrentUid) return null;
    const callerUid = normalizeChatId(incomingAudioCall.callerUid);
    return callerUid || null;
  }, [incomingAudioCall, currentUser?.id]);

  const activeCallPeerUid = useMemo(() => {
    const normalizedCurrentUid = normalizeChatId(currentUser?.id);
    if (!activeAudioCall || !normalizedCurrentUid) return null;
    const callerUid = normalizeChatId(activeAudioCall.callerUid);
    const calleeUid = normalizeChatId(activeAudioCall.calleeUid);
    if (callerUid === normalizedCurrentUid) return calleeUid || null;
    if (calleeUid === normalizedCurrentUid) return callerUid || null;
    return null;
  }, [activeAudioCall, currentUser?.id]);

  const canStartAudioCall = useMemo(() => {
    if (!currentUser || !selectedChat || selectedChat.isGroupChat) return false;
    if (!selectedDirectOtherUserId || !selectedDirectOtherUser) return false;
    if (isSuperAdminUser(currentUser as any)) return false;
    if (isSuperAdminUser(selectedDirectOtherUser as any)) return false;
    if (blockingStatus.isBlocked || blockingStatus.isBlockedBy || blockingStatus.isLoading) return false;
    if (!canStartDirectChat(currentUser as any, selectedDirectOtherUser as any)) return false;
    if (activeAudioCall) return false;
    if ((selectedChat as any)?.isMessageRequest === true) return false;
    return true;
  }, [
    currentUser,
    selectedChat,
    selectedDirectOtherUser,
    selectedDirectOtherUserId,
    blockingStatus.isBlocked,
    blockingStatus.isBlockedBy,
    blockingStatus.isLoading,
    activeAudioCall,
  ]);

  const formatCallDuration = useCallback((seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }, []);

  const getAudioCallTargetName = useCallback((targetUid: string | null): string => {
    const normalizedTargetUid = normalizeChatId(targetUid);
    if (!normalizedTargetUid) return 'this user';

    if (normalizeChatId(selectedDirectOtherUser?.id) === normalizedTargetUid) {
      return selectedDirectOtherUser?.name || 'this user';
    }

    const fromMessageable = messageableUsers.find((user) => normalizeChatId(user.id) === normalizedTargetUid);
    if (fromMessageable?.name) {
      return fromMessageable.name;
    }

    return 'this user';
  }, [selectedDirectOtherUser?.id, selectedDirectOtherUser?.name, messageableUsers]);

  const showAudioCallWarning = useCallback((error: unknown, fallbackMessage: string, targetUid?: string | null) => {
    const message = error instanceof Error ? error.message : String(error || '');
    const normalizedTargetName = getAudioCallTargetName(targetUid || null);

    if (message.includes('did not answer') || message.toLowerCase().includes('expired')) {
      showToast('error', 'User did not answer the call.');
      return;
    }

    if (message.toLowerCase().includes('currently on another call')) {
      showToast('error', `${normalizedTargetName} is currently on another call.`);
      return;
    }

    if (message.toLowerCase().includes('not allowed for this account')) {
      showToast('error', 'Calling is not available for this account.');
      return;
    }

    showToast('error', message || fallbackMessage);
  }, [getAudioCallTargetName, showToast]);

  const clearCallMediaState = useCallback(() => {
    if (signalingUnsubscribeRef.current) {
      signalingUnsubscribeRef.current();
      signalingUnsubscribeRef.current = null;
    }

    if (peerConnectionRef.current) {
      peerConnectionRef.current.onicecandidate = null;
      peerConnectionRef.current.ontrack = null;
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }

    if (localAudioStreamRef.current) {
      localAudioStreamRef.current.getTracks().forEach((track) => track.stop());
      localAudioStreamRef.current = null;
    }

    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null;
      remoteAudioRef.current.muted = false;
    }

    webrtcRoleRef.current = null;
    remoteCandidatesCacheRef.current.clear();
    setIsSelfMuted(false);
    setIsRemoteMuted(false);
    setNeedsAudioPlaybackUnlock(false);
  }, []);

  const ensureLocalAudioStream = useCallback(async () => {
    if (localAudioStreamRef.current) return localAudioStreamRef.current;

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: false,
    });
    const track = stream.getAudioTracks()[0];
    if (!track) {
      stream.getTracks().forEach((item) => item.stop());
      throw new Error('No microphone audio track is available.');
    }

    localAudioStreamRef.current = stream;
    setIsSelfMuted(track.enabled === false);
    return stream;
  }, []);

  const waitForOfferAvailability = useCallback(async (callId: string, timeoutMs = 7000): Promise<void> => {
    const normalizedCallId = typeof callId === 'string' ? callId.trim() : '';
    if (!normalizedCallId) {
      throw new Error('Call not found');
    }

    const startedAt = Date.now();
    const callRef = doc(db, 'calls', normalizedCallId);

    while (Date.now() - startedAt < timeoutMs) {
      const snap = await getDoc(callRef);
      if (!snap.exists()) {
        throw new Error('Call not found');
      }

      const data = snap.data() as any;
      if (data?.offer && typeof data.offer?.type === 'string' && typeof data.offer?.sdp === 'string') {
        return;
      }

      await new Promise((resolve) => window.setTimeout(resolve, 200));
    }

    throw new Error('Caller not ready yet. Please try accepting again.');
  }, []);

  const startWebRtcForCall = useCallback(async (callId: string, role: 'caller' | 'callee') => {
    const normalizedCallId = typeof callId === 'string' ? callId.trim() : '';
    if (!normalizedCallId) {
      throw new Error('Unable to start call media negotiation.');
    }

    clearCallMediaState();
    remoteCandidatesCacheRef.current = new Set<string>();
    webrtcRoleRef.current = role;

    const localStream = await ensureLocalAudioStream();
    const callRef = doc(db, 'calls', normalizedCallId);
    const pc = new RTCPeerConnection(rtcConfig);
    peerConnectionRef.current = pc;

    localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));

    pc.ontrack = (event) => {
      const [stream] = event.streams;
      if (!stream || !remoteAudioRef.current) return;
      if (remoteAudioRef.current.srcObject !== stream) {
        remoteAudioRef.current.srcObject = stream;
      }
      remoteAudioRef.current.muted = isRemoteMuted;
      void remoteAudioRef.current.play().then(() => {
        setNeedsAudioPlaybackUnlock(false);
      }).catch(() => {
        if (isIOSDevice()) {
          setNeedsAudioPlaybackUnlock(true);
        }
      });
    };

    pc.onicecandidate = (event) => {
      if (!event.candidate) return;
      const key = role === 'caller' ? 'callerIceCandidates' : 'calleeIceCandidates';
      void updateDoc(callRef, {
        [key]: arrayUnion(event.candidate.toJSON()),
      }).catch(() => undefined);
    };

    signalingUnsubscribeRef.current = onSnapshot(callRef, async (snapshot) => {
      if (!snapshot.exists() || !peerConnectionRef.current || webrtcRoleRef.current !== role) return;
      const data = snapshot.data() as any;
      const remoteDescription = role === 'caller' ? data?.answer : data?.offer;
      const remoteCandidates = role === 'caller' ? data?.calleeIceCandidates : data?.callerIceCandidates;

      if (role === 'callee' && !peerConnectionRef.current.currentLocalDescription && data?.offer) {
        try {
          if (!peerConnectionRef.current.currentRemoteDescription) {
            await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(data.offer));
          }

          const answer = await peerConnectionRef.current.createAnswer();
          await peerConnectionRef.current.setLocalDescription(answer);
          await updateDoc(callRef, {
            answer: peerConnectionRef.current.localDescription?.toJSON() || answer,
          });
        } catch (error) {
          console.error('[AudioCall] Failed to publish answer', error);
          // Keep listener alive for retry if offer arrives partially.
        }
      }

      if (remoteDescription && !peerConnectionRef.current.currentRemoteDescription) {
        try {
          await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(remoteDescription));
        } catch {
          // Ignore malformed or duplicate remote descriptions.
        }
      }

      if (!peerConnectionRef.current.currentRemoteDescription || !Array.isArray(remoteCandidates)) return;
      for (const candidate of remoteCandidates) {
        if (!candidate || typeof candidate !== 'object') continue;
        const key = JSON.stringify(candidate);
        if (remoteCandidatesCacheRef.current.has(key)) continue;
        remoteCandidatesCacheRef.current.add(key);
        try {
          await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidate));
        } catch {
          // Ignore stale candidates from rapid state transitions.
        }
      }
    });

    if (role === 'caller') {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      try {
        await updateDoc(callRef, {
          offer: pc.localDescription?.toJSON() || offer,
          answer: null,
          callerIceCandidates: [],
          calleeIceCandidates: [],
        });
      } catch (error) {
        console.error('[AudioCall] Failed to publish offer', error);
        throw new Error('Unable to start call media negotiation.');
      }
    }
  }, [clearCallMediaState, ensureLocalAudioStream, rtcConfig, isRemoteMuted]);

  const unlockRemoteAudioPlayback = useCallback(async () => {
    if (!remoteAudioRef.current || !activeAudioCall || activeAudioCall.status !== 'connected') return;
    try {
      await remoteAudioRef.current.play();
      setNeedsAudioPlaybackUnlock(false);
    } catch (error) {
      console.error('[AudioCall] Failed to unlock remote audio playback', error);
      showToast('error', 'Unable to start audio playback on this device.');
    }
  }, [activeAudioCall, showToast]);

  const toggleSelfMute = useCallback(() => {
    const stream = localAudioStreamRef.current;
    if (!stream) return;
    const track = stream.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setIsSelfMuted(track.enabled === false);
  }, []);

  const toggleRemoteMute = useCallback(() => {
    if (!remoteAudioRef.current) return;
    const nextMuted = !remoteAudioRef.current.muted;
    remoteAudioRef.current.muted = nextMuted;
    setIsRemoteMuted(nextMuted);
  }, []);

  const handleStartAudioCall = useCallback(async () => {
    if (!currentUser || !selectedChat || selectedChat.isGroupChat || !selectedDirectOtherUserId) return;
    let startedCallId: string | null = null;
    const support = checkAudioCallSupport();
    if (!support.supported) {
      showToast('error', support.reason || 'Audio calls are not supported on this device.');
      return;
    }

    if (!selectedDirectOtherUser) {
      showToast('error', 'Unable to find the selected user.');
      return;
    }

    if (isSuperAdminUser(currentUser as any) || isSuperAdminUser(selectedDirectOtherUser as any)) {
      showToast('error', 'Calling is not available for this account.');
      return;
    }

    if (blockingStatus.isBlocked || blockingStatus.isBlockedBy || blockingStatus.isLoading) {
      showToast('error', `${selectedDirectOtherUser.name || 'This user'} is unavailable right now.`);
      return;
    }

    if (!canStartDirectChat(currentUser as any, selectedDirectOtherUser as any)) {
      showToast('error', `${selectedDirectOtherUser.name || 'This user'} is unavailable right now.`);
      return;
    }

    setCallActionLoading('initiate');
    try {
      const isOnline = await new Promise<boolean>((resolve) => {
        let done = false;
        // Use a ref-like object to hold unsubscribe to avoid TDZ issues
        // (callback may be invoked synchronously before assignment)
        const unsubRef: { current: (() => void) | null } = { current: null };

        const cleanup = () => {
          if (unsubRef.current) {
            unsubRef.current();
            unsubRef.current = null;
          }
        };

        unsubRef.current = getUserStatusRealtime(selectedDirectOtherUserId, (status) => {
          if (done) return;
          done = true;
          cleanup();
          resolve(status?.state === 'online');
        });

        window.setTimeout(() => {
          if (done) return;
          done = true;
          cleanup();
          resolve(false);
        }, 3000);
      });

      if (!isOnline) {
        showToast('error', `${selectedDirectOtherUser.name || 'This user'} is offline or unavailable.`);
        return;
      }

      const result = await initiateAudioCall(selectedDirectOtherUserId);
      if (!result?.callId) {
        throw new Error('Unable to start call');
      }
      startedCallId = result.callId;
      await startWebRtcForCall(result.callId, 'caller');
      showToast('success', 'Calling...');
    } catch (error: any) {
      if (startedCallId) {
        void endAudioCall(startedCallId).catch(() => undefined);
      }
      clearCallMediaState();
      const mediaMessage = mapGetUserMediaErrorToMessage(error);
      if (mediaMessage) {
        showToast('error', mediaMessage);
        return;
      }
      showAudioCallWarning(error, 'Unable to start call', selectedDirectOtherUserId);
    } finally {
      setCallActionLoading(null);
    }
  }, [
    currentUser,
    selectedChat,
    selectedDirectOtherUser,
    selectedDirectOtherUserId,
    blockingStatus.isBlocked,
    blockingStatus.isBlockedBy,
    blockingStatus.isLoading,
    clearCallMediaState,
    startWebRtcForCall,
    showAudioCallWarning,
    showToast,
  ]);

  const handleAcceptAudioCall = useCallback(async () => {
    if (!incomingAudioCall) return;
    if (isSuperAdminUser(currentUser as any)) {
      showToast('error', 'Calling is not available for this account.');
      return;
    }
    const support = checkAudioCallSupport();
    if (!support.supported) {
      showToast('error', support.reason || 'Audio calls are not supported on this device.');
      return;
    }

    setCallActionLoading('accept');
    try {
      await waitForOfferAvailability(incomingAudioCall.callId);
      await acceptAudioCall(incomingAudioCall.callId);
      await startWebRtcForCall(incomingAudioCall.callId, 'callee');
      showToast('success', 'Call connected');
      setIncomingAudioCall(null);
    } catch (error: any) {
      void endAudioCall(incomingAudioCall.callId).catch(() => undefined);
      clearCallMediaState();
      const mediaMessage = mapGetUserMediaErrorToMessage(error);
      if (mediaMessage) {
        showToast('error', mediaMessage);
        return;
      }
      showAudioCallWarning(error, 'Failed to accept call', incomingAudioCall.callerUid);
    } finally {
      setCallActionLoading(null);
    }
  }, [incomingAudioCall, startWebRtcForCall, clearCallMediaState, waitForOfferAvailability, showAudioCallWarning, currentUser, showToast]);

  const handleRejectAudioCall = useCallback(async () => {
    const targetCall = incomingAudioCall || activeAudioCall;
    if (!targetCall) return;

    setCallActionLoading('reject');
    try {
      await rejectAudioCall(targetCall.callId);
      clearCallMediaState();
      showToast('success', 'Call rejected');
      setIncomingAudioCall(null);
    } catch (error: any) {
      showAudioCallWarning(error, 'Failed to reject call', targetCall.callerUid || targetCall.calleeUid);
    } finally {
      setCallActionLoading(null);
    }
  }, [incomingAudioCall, activeAudioCall, clearCallMediaState, showAudioCallWarning, showToast]);

  const handleEndAudioCall = useCallback(async () => {
    if (!activeAudioCall) return;

    setCallActionLoading('end');
    try {
      await endAudioCall(activeAudioCall.callId);
      clearCallMediaState();
      showToast('success', 'Call ended');
    } catch (error: any) {
      showAudioCallWarning(error, 'Failed to end call', activeCallPeerUid);
    } finally {
      setCallActionLoading(null);
    }
  }, [activeAudioCall, clearCallMediaState, showAudioCallWarning, activeCallPeerUid, showToast]);

  useEffect(() => {
    const normalizedUid = typeof currentUser?.id === 'string' ? currentUser.id.trim() : '';
    if (!normalizedUid) {
      setIncomingAudioCall(null);
      setActiveAudioCall(null);
      return;
    }

    const unsubscribeIncoming = listenIncomingRingingCall(normalizedUid, (call) => {
      setIncomingAudioCall(call);
    });

    const unsubscribeCurrentCall = listenCurrentUserCall(normalizedUid, (call) => {
      setActiveAudioCall(call);
      if (!call) {
        expiringCallIdRef.current = null;
      }
    });

    return () => {
      unsubscribeIncoming();
      unsubscribeCurrentCall();
    };
  }, [currentUser?.id]);

  useEffect(() => {
    let cancelled = false;
    if (!incomingCallCallerUid) {
      setIncomingCallCaller(null);
      return;
    }

    void getUserProfile(incomingCallCallerUid)
      .then((user) => {
        if (cancelled) return;
        setIncomingCallCaller(user || null);
      })
      .catch((error) => {
        if (cancelled) return;
        console.error('[AudioCall] Failed to load incoming caller profile', error);
        setIncomingCallCaller(null);
      });

    return () => {
      cancelled = true;
    };
  }, [incomingCallCallerUid]);

  useEffect(() => {
    let cancelled = false;
    if (!activeCallPeerUid) {
      setActiveCallPeerUser(null);
      return;
    }

    if (selectedDirectOtherUser && normalizeChatId(selectedDirectOtherUser.id) === activeCallPeerUid) {
      setActiveCallPeerUser(selectedDirectOtherUser);
      return;
    }

    const fromUsers = messageableUsers.find((user) => normalizeChatId(user.id) === activeCallPeerUid);
    if (fromUsers) {
      setActiveCallPeerUser(fromUsers);
      return;
    }

    void getUserProfile(activeCallPeerUid)
      .then((user) => {
        if (cancelled) return;
        setActiveCallPeerUser(user || null);
      })
      .catch((error) => {
        if (cancelled) return;
        console.error('[AudioCall] Failed to load active call peer profile', error);
        setActiveCallPeerUser(null);
      });

    return () => {
      cancelled = true;
    };
  }, [activeCallPeerUid, selectedDirectOtherUser, messageableUsers]);

  useEffect(() => {
    if (!activeAudioCall || activeAudioCall.status !== 'connected' || !activeAudioCall.acceptedAtMs) {
      setAudioCallDuration(0);
      return;
    }

    const tick = () => {
      const elapsed = Math.max(0, Math.floor((Date.now() - activeAudioCall.acceptedAtMs!) / 1000));
      setAudioCallDuration(elapsed);
    };

    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [activeAudioCall]);

  useEffect(() => {
    if (!currentUser?.id || !activeAudioCall) return;
    if (activeAudioCall.status !== 'ringing' || activeAudioCall.callerUid !== currentUser.id) return;

    const remaining = activeAudioCall.createdAtMs + 30000 - Date.now();
    if (remaining <= 0 && expiringCallIdRef.current !== activeAudioCall.callId) {
      expiringCallIdRef.current = activeAudioCall.callId;
      void expireAudioCall(activeAudioCall.callId)
        .catch(() => undefined);
      return;
    }

    const timeout = window.setTimeout(() => {
      if (expiringCallIdRef.current === activeAudioCall.callId) return;
      expiringCallIdRef.current = activeAudioCall.callId;
      void expireAudioCall(activeAudioCall.callId)
        .catch(() => undefined);
    }, Math.max(remaining, 100));

    return () => window.clearTimeout(timeout);
  }, [activeAudioCall, currentUser?.id]);

  useEffect(() => {
    if (!activeAudioCall || !currentUser?.id) {
      activeCallTerminalToastKeyRef.current = null;
      return;
    }

    if (activeAudioCall.status === 'expired' || activeAudioCall.status === 'rejected' || activeAudioCall.status === 'ended') {
      const toastKey = `${activeAudioCall.callId}:${activeAudioCall.status}:${activeAudioCall.reason || ''}`;
      if (activeCallTerminalToastKeyRef.current === toastKey) return;
      activeCallTerminalToastKeyRef.current = toastKey;

      if (activeAudioCall.status === 'expired') {
        showToast('error', 'User did not answer the call.');
        return;
      }

      if (activeAudioCall.status === 'rejected') {
        const byCurrentUser = activeAudioCall.endedByUid === currentUser.id;
        if (!byCurrentUser) {
          showToast('error', 'Call was declined.');
        }
        return;
      }

      if (activeAudioCall.status === 'ended') {
        const byCurrentUser = activeAudioCall.endedByUid === currentUser.id;
        if (!byCurrentUser) {
          showToast('error', 'Call ended by the other user.');
        }
      }
    } else {
      activeCallTerminalToastKeyRef.current = null;
    }
  }, [activeAudioCall, currentUser?.id, showToast]);

  useEffect(() => {
    if (!activeAudioCall) {
      clearCallMediaState();
      return;
    }

    if (activeAudioCall.status === 'rejected' || activeAudioCall.status === 'ended' || activeAudioCall.status === 'expired') {
      clearCallMediaState();
    }
  }, [activeAudioCall, clearCallMediaState]);

  useEffect(() => {
    if (!remoteAudioRef.current) return;
    remoteAudioRef.current.muted = isRemoteMuted;
  }, [isRemoteMuted]);

  useEffect(() => {
    return () => {
      clearCallMediaState();
    };
  }, [clearCallMediaState]);

  return {
    activeAudioCall,
    incomingAudioCall,
    audioCallDuration,
    isSelfMuted,
    isRemoteMuted,
    needsAudioPlaybackUnlock,
    callActionLoading,
    incomingCallCaller,
    activeCallPeerUser,
    remoteAudioRef,
    canStartAudioCall,
    incomingCallCallerUid,
    activeCallPeerUid,
    handleStartAudioCall,
    handleAcceptAudioCall,
    handleRejectAudioCall,
    handleEndAudioCall,
    toggleSelfMute,
    toggleRemoteMute,
    unlockRemoteAudioPlayback,
    formatCallDuration,
    showAudioCallWarning,
    getAudioCallTargetName,
    startWebRtcForCall,
    clearCallMediaState,
    ensureLocalAudioStream,
    waitForOfferAvailability,
  };
};
