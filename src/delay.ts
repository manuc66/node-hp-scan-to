export function delay(t: number): Promise<void> {
  return new Promise(function (resolve) {
    setTimeout(resolve, t);
  });
}
