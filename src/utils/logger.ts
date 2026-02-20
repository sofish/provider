const PREFIX = '[provider]';

let debugEnabled = false;

export function setDebug(enabled: boolean) {
  debugEnabled = enabled;
}

export const logger = {
  info: (...args: unknown[]) => console.log(PREFIX, ...args),
  error: (...args: unknown[]) => console.error(PREFIX, ...args),
  warn: (...args: unknown[]) => console.warn(PREFIX, ...args),
  debug: (...args: unknown[]) => {
    if (debugEnabled) console.debug(PREFIX, ...args);
  },
};
