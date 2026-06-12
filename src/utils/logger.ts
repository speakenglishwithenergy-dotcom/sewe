const COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
} as const;

function timestamp(): string {
  return new Date().toLocaleTimeString('en-US', { hour12: false });
}

export const logger = {
  info(message: string, ...args: unknown[]): void {
    console.log(`${COLORS.dim}${timestamp()}${COLORS.reset} ${COLORS.blue}[INFO]${COLORS.reset}  ${message}`, ...args);
  },

  success(message: string, ...args: unknown[]): void {
    console.log(`${COLORS.dim}${timestamp()}${COLORS.reset} ${COLORS.green}[OK]${COLORS.reset}    ${message}`, ...args);
  },

  warn(message: string, ...args: unknown[]): void {
    console.warn(`${COLORS.dim}${timestamp()}${COLORS.reset} ${COLORS.yellow}[WARN]${COLORS.reset}  ${message}`, ...args);
  },

  error(message: string, ...args: unknown[]): void {
    console.error(`${COLORS.dim}${timestamp()}${COLORS.reset} ${COLORS.red}[ERROR]${COLORS.reset} ${message}`, ...args);
  },

  step(current: number, total: number, message: string): void {
    const badge = `${COLORS.cyan}[${current}/${total}]${COLORS.reset}`;
    console.log(`\n${badge} ${COLORS.bright}${message}${COLORS.reset}`);
  },

  divider(char = '─', length = 60): void {
    console.log(COLORS.dim + char.repeat(length) + COLORS.reset);
  },
};
