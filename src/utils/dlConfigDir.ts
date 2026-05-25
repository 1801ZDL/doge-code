import { homedir } from 'os'
import { join } from 'path'

export function getDlConfigDir(): string {
  return process.env.DL_CONFIG_DIR ?? join(homedir(), '.dl')
}

export function getDlGlobalConfigFile(): string {
  return join(getDlConfigDir(), '.dl.json')
}
