declare module "filename-reserved-regex" {
  export default function filenameReservedRegex(): RegExp;
  export function windowsReservedNameRegex(): RegExp;
}