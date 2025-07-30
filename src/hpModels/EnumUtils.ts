export class EnumUtils {

  static getState<T>(stateType: string, stateEnum: T, stateStr: string): T[keyof T] {
    if (!Object.values(stateEnum as Record<string, T>).includes(stateStr as T)) {
      console.error(
        `"${stateStr}" is not a known ${stateType} value, you would be kind as a reader of this message to fill an issue to help at better state handling.`
      );
    }

    return stateStr as T[keyof T];
  }
}