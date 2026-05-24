/**
 * Utility for substituting $ARGUMENTS placeholders in skill/command prompts.
 *
 * Supports:
 * - $ARGUMENTS - replaced with the full arguments string
 * - $ARGUMENTS[0], $ARGUMENTS[1], etc. - replaced with individual indexed arguments
 * - $0, $1, etc. - shorthand for $ARGUMENTS[0], $ARGUMENTS[1]
 * - Named arguments (e.g., $foo, $bar) - when argument names are defined in frontmatter
 *
 * Arguments are parsed using shell-quote for proper shell argument handling.
 */

import { tryParseShellCommand } from './bash/shellQuote.js'

/**
 * Parse an arguments string into an array of individual arguments.
 * Uses shell-quote for proper shell argument parsing including quoted strings.
 *
 * Examples:
 * - "foo bar baz" => ["foo", "bar", "baz"]
 * - 'foo "hello world" baz' => ["foo", "hello world", "baz"]
 * - "foo 'hello world' baz" => ["foo", "hello world", "baz"]
 */
export function parseArguments(args: string): string[] {
  if (!args || !args.trim()) {
    return []
  }

  // Return $KEY to preserve variable syntax literally (don't expand variables)
  const result = tryParseShellCommand(args, key => `$${key}`)
  if (!result.success) {
    // Fall back to simple whitespace split if parsing fails
    return args.split(/\s+/).filter(Boolean)
  }

  // Filter to only string tokens (ignore shell operators, etc.)
  return result.tokens.filter(
    (token): token is string => typeof token === 'string',
  )
}

/**
 * Parse argument names from the frontmatter 'arguments' field.
 * Accepts either a space-separated string or an array of strings.
 *
 * Examples:
 * - "foo bar baz" => ["foo", "bar", "baz"]
 * - ["foo", "bar", "baz"] => ["foo", "bar", "baz"]
 */
export function parseArgumentNames(
  argumentNames: string | string[] | undefined,
): string[] {
  if (!argumentNames) {
    return []
  }

  // Filter out empty strings and numeric-only names (which conflict with $0, $1 shorthand)
  const isValidName = (name: string): boolean =>
    typeof name === 'string' && name.trim() !== '' && !/^\d+$/.test(name)

  if (Array.isArray(argumentNames)) {
    return argumentNames.filter(isValidName)
  }
  if (typeof argumentNames === 'string') {
    return argumentNames.split(/\s+/).filter(isValidName)
  }
  return []
}

/**
 * Generate argument hint showing remaining unfilled args.
 * @param argNames - Array of argument names from frontmatter
 * @param typedArgs - Arguments the user has typed so far
 * @returns Hint string like "[arg2] [arg3]" or undefined if all filled
 */
export function generateProgressiveArgumentHint(
  argNames: string[],
  typedArgs: string[],
): string | undefined {
  const remaining = argNames.slice(typedArgs.length)
  if (remaining.length === 0) return undefined
  return remaining.map(name => `[${name}]`).join(' ')
}

/**
 * Normalize a flag name for alias matching by removing leading dashes and all dashes.
 * Examples: "--base-url" -> "baseurl", "--baseurl" -> "baseurl", "--provider" -> "provider"
 */
function normalizeFlagName(flag: string): string {
  return flag.replace(/^-+/, '').replace(/-/g, '').toLowerCase()
}

/**
 * Generate a smart argument hint that filters out already-provided flags/args.
 * Supports flag aliases: --baseurl matches --base-url, --apikey matches --api-key.
 *
 * @param argumentHint - The original hint string like "[model-name] [--provider <name>] [--base-url <url>]"
 * @param typedArgs - The raw arguments string the user has typed
 * @returns Filtered hint string, or undefined if all args consumed
 */
export function generateSmartArgumentHint(
  argumentHint: string,
  typedArgs: string,
): string | undefined {
  if (!argumentHint || !typedArgs.trim()) {
    return argumentHint
  }

  // Parse the argumentHint into items
  const items: { full: string; flag?: string }[] = []
  const regex = /\[([^\]]+)\]/g
  let match
  while ((match = regex.exec(argumentHint)) !== null) {
    const content = match[1]!
    const flagMatch = content.match(/^(--\S+)(?:\s+.*)?$/)
    items.push({
      full: match[0]!,
      flag: flagMatch ? flagMatch[1] : undefined,
    })
  }

  if (items.length === 0) {
    return argumentHint
  }

  // Parse typed args into tokens
  const tokens = parseArguments(typedArgs)
  const consumedFlags = new Set<string>()
  let positionalConsumed = false

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!
    if (token.startsWith('--')) {
      // Find matching flag by exact match or normalized alias match
      const normalizedToken = normalizeFlagName(token)
      const item = items.find(
        item =>
          item.flag === token ||
          (item.flag && normalizeFlagName(item.flag) === normalizedToken),
      )
      if (item?.flag) {
        consumedFlags.add(item.flag)
        // Consume the flag's value token if present
        if (i + 1 < tokens.length && !tokens[i + 1]!.startsWith('--')) {
          i++
        }
      }
    } else if (!positionalConsumed) {
      positionalConsumed = true
    }
  }

  // Build remaining hint
  const remaining = items.filter(item => {
    if (item.flag) {
      return !consumedFlags.has(item.flag)
    }
    // Positional arg
    return !positionalConsumed
  })

  if (remaining.length === 0) {
    return undefined
  }

  return remaining.map(item => item.full).join(' ')
}

/**
 * Substitute $ARGUMENTS placeholders in content with actual argument values.
 *
 * @param content - The content containing placeholders
 * @param args - The raw arguments string (may be undefined/null)
 * @param appendIfNoPlaceholder - If true and no placeholders are found, appends "ARGUMENTS: {args}" to content
 * @param argumentNames - Optional array of named arguments (e.g., ["foo", "bar"]) that map to indexed positions
 * @returns The content with placeholders substituted
 */
export function substituteArguments(
  content: string,
  args: string | undefined,
  appendIfNoPlaceholder = true,
  argumentNames: string[] = [],
): string {
  // undefined/null means no args provided - return content unchanged
  // empty string is a valid input that should replace placeholders with empty
  if (args === undefined || args === null) {
    return content
  }

  const parsedArgs = parseArguments(args)
  const originalContent = content

  // Replace named arguments (e.g., $foo, $bar) with their values
  // Named arguments map to positions: argumentNames[0] -> parsedArgs[0], etc.
  for (let i = 0; i < argumentNames.length; i++) {
    const name = argumentNames[i]
    if (!name) continue

    // Match $name but not $name[...] or $nameXxx (word chars)
    // Also ensure we match word boundaries to avoid partial matches
    content = content.replace(
      new RegExp(`\\$${name}(?![\\[\\w])`, 'g'),
      parsedArgs[i] ?? '',
    )
  }

  // Replace indexed arguments ($ARGUMENTS[0], $ARGUMENTS[1], etc.)
  content = content.replace(/\$ARGUMENTS\[(\d+)\]/g, (_, indexStr: string) => {
    const index = parseInt(indexStr, 10)
    return parsedArgs[index] ?? ''
  })

  // Replace shorthand indexed arguments ($0, $1, etc.)
  content = content.replace(/\$(\d+)(?!\w)/g, (_, indexStr: string) => {
    const index = parseInt(indexStr, 10)
    return parsedArgs[index] ?? ''
  })

  // Replace $ARGUMENTS with the full arguments string
  content = content.replaceAll('$ARGUMENTS', args)

  // If no placeholders were found and appendIfNoPlaceholder is true, append
  // But only if args is non-empty (empty string means command invoked with no args)
  if (content === originalContent && appendIfNoPlaceholder && args) {
    content = content + `\n\nARGUMENTS: ${args}`
  }

  return content
}
