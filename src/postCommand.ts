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
 * Schema for `post_command` in the configuration file. Both a single string
 * (split into a program and its arguments) and an explicit argument list are
 * accepted; blank values are rejected so a typo cannot silently disable the
 * hook.
 */
export const postCommandSchema = z
  .union([z.string(), z.array(z.string())])
  .transform((value, ctx) => {
    const command = typeof value === "string" ? splitCommand(value) : value;

    if (command.length === 0 || command[0].trim() === "") {
      ctx.addIssue({
        code: "custom",
        message: "post_command must not be empty",
      });
      return z.NEVER;
    }

    if (!command.some((argument) => argument.includes(INPUT_PLACEHOLDER))) {
      ctx.addIssue({
        code: "custom",
        message: `post_command must contain the ${INPUT_PLACEHOLDER} placeholder, otherwise it cannot run on the generated file`,
      });
      return z.NEVER;
    }

    return command;
  });

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
 * Validates a command coming from the command line and returns it as an
 * argument list. Throws a descriptive error when the hook would never run on
 * the generated file.
 */
export function parsePostCommandArg(value: string): PostCommand {
  const command = splitCommand(value);

  if (command.length === 0 || command[0].trim() === "") {
    throw new Error("--post-command must not be empty");
  }

  if (!command.some((argument) => argument.includes(INPUT_PLACEHOLDER))) {
    throw new Error(
      `--post-command must contain the ${INPUT_PLACEHOLDER} placeholder, otherwise the command cannot run on the generated file`,
    );
  }

  return command;
}
