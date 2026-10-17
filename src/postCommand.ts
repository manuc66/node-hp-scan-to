import { z } from "zod";

/**
 * A post-processing command: the program to run followed by its arguments.
 *
 * `{input}` and `{output}` are placeholders replaced by the runner with the
 * generated file path and a temporary output path. They are ordinary argument
 * values, never shell syntax: the command is spawned directly, without a
 * shell, so a file name can never be re-parsed as a command.
 */
export type PostCommand = string[];

const INPUT_PLACEHOLDER = "{input}";

/**
 * Schema for the `post_command_pdf` / `post_command_image` entries in the
 * configuration file. Both a single string (split into a program and its
 * arguments) and an explicit argument list are accepted; blank values are
 * rejected so a typo cannot silently disable the hook. The message is generic:
 * the failing key is carried by the Zod issue path.
 */
export const postCommandSchema = z
  .union([z.string(), z.array(z.string())])
  .transform((value, ctx) => {
    const command = typeof value === "string" ? splitCommand(value) : value;
    const problem = findCommandProblem(command);

    if (problem !== undefined) {
      ctx.addIssue({ code: "custom", message: `the post-command ${problem}` });
      return z.NEVER;
    }

    return command;
  });

/**
 * Why a command could never run on a generated file, or `undefined` when it is
 * usable. Shared by the config-file schema and the CLI parser so both reject
 * the same shapes with the same wording.
 */
function findCommandProblem(command: readonly string[]): string | undefined {
  if (command.length === 0 || command[0].trim() === "") {
    return "must not be empty";
  }

  if (!hasInputPlaceholder(command)) {
    return `must contain the ${INPUT_PLACEHOLDER} placeholder in an argument (the program is run as-is), otherwise it cannot run on the generated file`;
  }

  return undefined;
}

/**
 * A command runs on the generated file only when one of its arguments carries
 * the `{input}` placeholder. The program itself is spawned as-is (the runner
 * never substitutes it), so a placeholder placed there would only be taken
 * literally and the command would never receive the scan.
 */
function hasInputPlaceholder(command: readonly string[]): boolean {
  return command
    .slice(1)
    .some((argument) => argument.includes(INPUT_PLACEHOLDER));
}

/**
 * Splits a command line into a program and its arguments, honouring single
 * and double quotes so paths containing spaces stay in one argument.
 *
 * This is a plain tokenizer, not a shell: no expansion, no substitution and
 * no command chaining happens here.
 */
export function splitCommand(value: string): string[] {
  const args: string[] = [];
  let current = "";
  let hasCurrent = false;
  let quote: '"' | "'" | undefined;

  for (const char of value) {
    if (quote !== undefined) {
      if (char === quote) {
        quote = undefined;
      } else {
        current += char;
      }
      hasCurrent = true;
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      hasCurrent = true;
      continue;
    }

    if (/\s/.test(char)) {
      if (hasCurrent) {
        args.push(current);
        current = "";
        hasCurrent = false;
      }
      continue;
    }

    current += char;
    hasCurrent = true;
  }

  if (hasCurrent) {
    args.push(current);
  }

  return args;
}

/**
 * Parses the `--post-command-timeout` value: a positive integer number of
 * milliseconds. Anything else is rejected so a typo cannot silently fall back
 * to the default timeout.
 */
export function parsePostCommandTimeoutArg(value: string): number {
  const timeout = Number(value);
  if (!Number.isInteger(timeout) || timeout <= 0) {
    throw new Error(
      "--post-command-timeout must be a positive integer number of milliseconds",
    );
  }
  return timeout;
}

/**
 * Builds the `argParser` for a `--post-command-*` flag. Validates the value
 * and returns it as an argument list, throwing a descriptive error naming the
 * flag when the hook would never run on the generated file.
 */
export function postCommandArgParser(
  flagName: string,
): (value: string) => PostCommand {
  return (value: string): PostCommand => {
    const command = splitCommand(value);
    const problem = findCommandProblem(command);

    if (problem !== undefined) {
      throw new Error(`${flagName} ${problem}`);
    }

    return command;
  };
}
