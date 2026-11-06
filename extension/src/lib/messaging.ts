// ============================================================
// NEXORA Extension Message Passing
// ============================================================

export type MessageType =
  | 'GET_SETTINGS'
  | 'SAVE_SETTINGS'
  | 'GET_NOTES'
  | 'SAVE_NOTES'
  | 'GET_TRACKER_STATS'
  | 'TOGGLE_PRIVACY'
  | 'CHECK_LICENSE'
  | 'GET_PAGE_CONTEXT'
  | 'COPY_TO_CLIPBOARD';

export interface Message<T = unknown> {
  type: MessageType;
  payload?: T;
}

export interface MessageResponse<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
}

export function sendMessage<T = unknown>(
  message: Message,
): Promise<MessageResponse<T>> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response: MessageResponse<T>) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(response);
    });
  });
}
