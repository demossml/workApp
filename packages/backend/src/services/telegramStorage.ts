/**
 * Telegram photo storage: sends photos via Bot API and returns file_id tokens.
 * Calls Python helper because Node.js undici cannot reach api.telegram.org.
 * Uses CJS require for child_process (ESM spawn has issues in tsx server).
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { spawn } = require("child_process");
import { writeFileSync, unlinkSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { randomUUID } from "crypto";

const PYTHON_SCRIPT = "/home/admingimolost/evo-app/packages/backend/src/services/telegram_upload.py";

export interface TelegramPhotoResult {
  file_id: string;
  file_unique_id: string;
  file_size?: number;
  width?: number;
  height?: number;
}

function spawnAsync(
  cmd: string,
  args: string[],
  timeoutMs: number
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      timeout: timeoutMs,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on("close", (code: number | null) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(`Exit ${code}: ${stderr || stdout}`));
      }
    });

    child.on("error", (err: Error) => {
      reject(new Error(`Spawn error: ${err.message}`));
    });
  });
}

export async function storePhotoInTelegram(
  file: File,
  botToken: string,
  chatId: string
): Promise<TelegramPhotoResult> {
  const tmpPath = join(tmpdir(), `tg_upload_${randomUUID()}.jpg`);
  const buffer = Buffer.from(await file.arrayBuffer());
  writeFileSync(tmpPath, buffer);

  try {
    const result = await spawnAsync("/usr/bin/python3", [
      PYTHON_SCRIPT,
      tmpPath,
      botToken,
      chatId,
    ], 30000);

    const data = JSON.parse(result) as
      | TelegramPhotoResult
      | { error: string };

    if ("error" in data) {
      throw new Error(`Telegram upload failed: ${data.error}`);
    }

    return data as TelegramPhotoResult;
  } finally {
    try { unlinkSync(tmpPath); } catch {}
  }
}

export async function getPhotoUrl(
  file_id: string,
  botToken: string
): Promise<string> {
  const result = await spawnAsync("/usr/bin/python3", [
    "-c",
    `import json,urllib.request,sys
r=urllib.request.urlopen("https://api.telegram.org/bot${botToken}/getFile?file_id="+sys.argv[1],timeout=10)
d=json.loads(r.read())
print(d["result"]["file_path"])
`,
    file_id,
  ], 10000);

  const filePath = result.trim();
  if (!filePath) throw new Error("getFile returned no file_path");

  return `https://api.telegram.org/file/bot${botToken}/${filePath}`;
}
