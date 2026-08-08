import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/**
 * Return repository-relative files that are tracked or are not ignored.
 * Including untracked files makes the checks useful before the first commit;
 * in CI, the list naturally resolves to the checked-out tree.
 */
export async function repositoryFiles() {
  const { stdout } = await execFileAsync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    { encoding: 'buffer', maxBuffer: 32 * 1024 * 1024 },
  );

  return stdout
    .toString('utf8')
    .split('\0')
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right));
}

export function isProbablyBinary(buffer) {
  const sampleLength = Math.min(buffer.length, 8_192);
  for (let index = 0; index < sampleLength; index += 1) {
    if (buffer[index] === 0) return true;
  }
  return false;
}
