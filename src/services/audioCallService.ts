import { httpsCallable } from 'firebase/functions';
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import { db, functionsInstance } from '../firebase/config';

export type AudioCallStatus = 'ringing' | 'connected' | 'rejected' | 'ended' | 'expired';

export interface AudioCallDoc {
  callId: string;
  callerUid: string;
  calleeUid: string;
  kind: 'audio';
  status: AudioCallStatus;
  createdAtMs: number;
  acceptedAtMs: number | null;
  endedAtMs: number | null;
  endedByUid: string | null;
  reason: string | null;
}

type CallMutationResponse = {
  ok?: boolean;
  callId?: string;
  status?: string;
};

const getErrorCode = (error: unknown): string => {
  const maybe = error as { code?: string };
  return typeof maybe?.code === 'string' ? maybe.code : 'unknown';
};

const toUserFacingError = (error: unknown): Error => {
  const code = getErrorCode(error);
  if (code.includes('deadline-exceeded')) {
    return new Error('User did not answer the call.');
  }

  if (code.includes('failed-precondition') || code.includes('already-exists')) {
    return new Error('User is currently on another call.');
  }

  if (code.includes('permission-denied')) {
    return new Error('Calling is not allowed for this account.');
  }

  if (code.includes('not-found')) {
    return new Error('Call no longer exists.');
  }

  if (code.includes('unauthenticated')) {
    return new Error('Please sign in again.');
  }

  return new Error('Unable to process call request. Please try again.');
};

const parseCall = (raw: any): AudioCallDoc | null => {
  if (!raw || typeof raw !== 'object') return null;
  const callId = typeof raw.callId === 'string' ? raw.callId : '';
  const callerUid = typeof raw.callerUid === 'string' ? raw.callerUid : '';
  const calleeUid = typeof raw.calleeUid === 'string' ? raw.calleeUid : '';
  const status = typeof raw.status === 'string' ? raw.status : '';
  const createdAtMs = Number(raw.createdAtMs);
  const acceptedAtMs = raw.acceptedAtMs == null ? null : Number(raw.acceptedAtMs);
  const endedAtMs = raw.endedAtMs == null ? null : Number(raw.endedAtMs);

  if (!callId || !callerUid || !calleeUid) return null;
  if (!['ringing', 'connected', 'rejected', 'ended', 'expired'].includes(status)) return null;
  if (!Number.isFinite(createdAtMs)) return null;
  if (acceptedAtMs != null && !Number.isFinite(acceptedAtMs)) return null;
  if (endedAtMs != null && !Number.isFinite(endedAtMs)) return null;

  return {
    callId,
    callerUid,
    calleeUid,
    kind: 'audio',
    status: status as AudioCallStatus,
    createdAtMs,
    acceptedAtMs,
    endedAtMs,
    endedByUid: raw.endedByUid == null ? null : String(raw.endedByUid),
    reason: raw.reason == null ? null : String(raw.reason),
  };
};

export const initiateAudioCall = async (calleeUid: string): Promise<CallMutationResponse> => {
  try {
    const callable = httpsCallable<{ calleeUid: string }, CallMutationResponse>(
      functionsInstance,
      'initiateAudioCall'
    );
    const result = await callable({ calleeUid });
    return result.data || { ok: true };
  } catch (error) {
    throw toUserFacingError(error);
  }
};

export const acceptAudioCall = async (callId: string): Promise<CallMutationResponse> => {
  try {
    const callable = httpsCallable<{ callId: string }, CallMutationResponse>(
      functionsInstance,
      'acceptAudioCall'
    );
    const result = await callable({ callId });
    return result.data || { ok: true };
  } catch (error) {
    throw toUserFacingError(error);
  }
};

export const rejectAudioCall = async (callId: string): Promise<CallMutationResponse> => {
  try {
    const callable = httpsCallable<{ callId: string }, CallMutationResponse>(
      functionsInstance,
      'rejectAudioCall'
    );
    const result = await callable({ callId });
    return result.data || { ok: true };
  } catch (error) {
    throw toUserFacingError(error);
  }
};

export const endAudioCall = async (callId: string): Promise<CallMutationResponse> => {
  try {
    const callable = httpsCallable<{ callId: string }, CallMutationResponse>(
      functionsInstance,
      'endAudioCall'
    );
    const result = await callable({ callId });
    return result.data || { ok: true };
  } catch (error) {
    throw toUserFacingError(error);
  }
};

export const expireAudioCall = async (callId: string): Promise<CallMutationResponse> => {
  try {
    const callable = httpsCallable<{ callId: string }, CallMutationResponse>(
      functionsInstance,
      'expireAudioCall'
    );
    const result = await callable({ callId });
    return result.data || { ok: true };
  } catch (error) {
    throw toUserFacingError(error);
  }
};

export const listenIncomingRingingCall = (
  userId: string,
  onChange: (call: AudioCallDoc | null) => void
): (() => void) => {
  const normalizedUserId = typeof userId === 'string' ? userId.trim() : '';
  if (!normalizedUserId) {
    onChange(null);
    return () => undefined;
  }

  const callsRef = collection(db, 'calls');
  const q = query(callsRef, where('calleeUid', '==', normalizedUserId));

  return onSnapshot(
    q,
    (snapshot) => {
      const incoming =
        snapshot.docs
          .map((item) => parseCall(item.data()))
          .filter((item): item is AudioCallDoc => !!item)
          .filter((item) => item.status === 'ringing')
          .sort((a, b) => b.createdAtMs - a.createdAtMs)[0] || null;

      onChange(incoming);
    },
    (error) => {
      console.error('[AudioCallService] Failed to listen incoming call', error);
      onChange(null);
    }
  );
};

export const listenCurrentUserCall = (
  userId: string,
  onChange: (call: AudioCallDoc | null) => void
): (() => void) => {
  const normalizedUserId = typeof userId === 'string' ? userId.trim() : '';
  if (!normalizedUserId) {
    onChange(null);
    return () => undefined;
  }

  const callsRef = collection(db, 'calls');
  const callerQuery = query(callsRef, where('callerUid', '==', normalizedUserId));
  const calleeQuery = query(callsRef, where('calleeUid', '==', normalizedUserId));

  let callerDocs: AudioCallDoc[] = [];
  let calleeDocs: AudioCallDoc[] = [];

  const emit = () => {
    const active = [...callerDocs, ...calleeDocs]
      .filter((item) => item.status === 'ringing' || item.status === 'connected')
      .sort((a, b) => b.createdAtMs - a.createdAtMs)[0] || null;
    onChange(active);
  };

  const unsubCaller = onSnapshot(
    callerQuery,
    (snapshot) => {
      callerDocs = snapshot.docs
        .map((item) => parseCall(item.data()))
        .filter((item): item is AudioCallDoc => !!item);
      emit();
    },
    (error) => {
      console.error('[AudioCallService] Failed to listen caller call state', error);
      callerDocs = [];
      emit();
    }
  );

  const unsubCallee = onSnapshot(
    calleeQuery,
    (snapshot) => {
      calleeDocs = snapshot.docs
        .map((item) => parseCall(item.data()))
        .filter((item): item is AudioCallDoc => !!item);
      emit();
    },
    (error) => {
      console.error('[AudioCallService] Failed to listen callee call state', error);
      calleeDocs = [];
      emit();
    }
  );

  return () => {
    unsubCaller();
    unsubCallee();
  };
};

export const listenCallById = (
  callId: string,
  onChange: (call: AudioCallDoc | null) => void
): (() => void) => {
  const normalizedCallId = typeof callId === 'string' ? callId.trim() : '';
  if (!normalizedCallId) {
    onChange(null);
    return () => undefined;
  }

  const callDocRef = doc(db, 'calls', normalizedCallId);
  return onSnapshot(
    callDocRef,
    (snap) => {
      if (!snap.exists()) {
        onChange(null);
        return;
      }
      onChange(parseCall(snap.data()));
    },
    (error) => {
      console.error('[AudioCallService] Failed to listen call document', error);
      onChange(null);
    }
  );
};
