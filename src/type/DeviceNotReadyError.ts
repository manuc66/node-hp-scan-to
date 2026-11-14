/**
 * The device answered on the network, but its HTTP/eSCL services are not
 * ready yet (typically while the printer boots). Capability detection is
 * worth retrying for a bounded time instead of concluding that the device is
 * unsupported.
 */
export class DeviceNotReadyError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "DeviceNotReadyError";
  }
}
