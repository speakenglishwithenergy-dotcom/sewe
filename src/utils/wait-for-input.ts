import readline from 'readline';

export async function waitForEnter(message: string): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  await new Promise<void>((resolve) => {
    rl.question(message, () => {
      rl.close();
      resolve();
    });
  });
}
