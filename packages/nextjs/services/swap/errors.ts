export class SwapValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SwapValidationError";
  }
}
